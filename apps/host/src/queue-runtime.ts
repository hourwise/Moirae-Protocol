import { createHash } from "node:crypto";

import {
  createQueueWork,
  deterministicQueueIdentity,
  type ActivityRecordV1,
  type QueueAcquireResultV1,
  type QueueDeliverySnapshotV1,
  type QueueEnqueueResultV1,
  type QueueOutcomeSnapshotV1,
  type QueueWorkV1,
  type SchedulingClaimV1,
} from "../../../packages/background-work/src/index.js";
import {
  DurableFilesystemActivitySink,
  DurableFilesystemLocalQueue,
} from "../../../packages/background-work/src/durable.js";
import { canonicalizeJsonV1 } from "../../../packages/action-compiler/src/index.js";
import type { Mp05ApprovalObservationV1 } from "../../../packages/human-approval/src/index.js";
import { type Mp08bApprovalBindingV1, Mp08bDurableApprovalRuntime } from "./approval-runtime.js";

export const MP08B_QUEUE_01_VERSION = "mp08b-queue-01-v1" as const;

export type Mp08bQueueCapabilitiesV1 = Readonly<{
  readonly durableLocalQueue: true;
  readonly boundedWorker: true;
  readonly hostedDurableQueue: false;
  readonly externalEffects: false;
}>;

export type Mp08bQueueEnqueueResultV1 = Readonly<{
  readonly approval: Mp05ApprovalObservationV1;
  readonly enqueue: QueueEnqueueResultV1;
  readonly work: QueueWorkV1;
  readonly delivery: QueueDeliverySnapshotV1;
}>;

export type Mp08bQueueWorkerResultV1 = Readonly<{
  readonly status: "READY_FOR_MP04" | "BLOCKED" | "CLAIM_REJECTED";
  readonly workId: string;
  readonly deliveryId: string;
  readonly claim?: SchedulingClaimV1;
  readonly reclaimed?: boolean;
  readonly reason?: string;
}>;

export class Mp08bQueueRuntimeError extends Error {
  readonly code = "MP08B_QUEUE_RUNTIME_FAILURE" as const;

  constructor(message: string) {
    super(message);
    this.name = "Mp08bQueueRuntimeError";
  }
}

type QueueRuntimeOptions = Readonly<{
  readonly approvalRuntime: Mp08bDurableApprovalRuntime;
  readonly queuePath: string;
  readonly activityPath: string;
  readonly trustedTime: { now(): string };
  readonly instanceId: string;
  readonly leaseDurationMs?: number;
  readonly retryBudget?: number;
}>;

function deliveryIdFor(workId: string, approvalId: string, decisionId: string): string {
  const digest = createHash("sha256")
    .update(
      `moirae-protocol/mp08b/queue-01/delivery/v1\0${canonicalizeJsonV1({
        approvalId,
        decisionId,
        workId,
      })}`,
      "utf8",
    )
    .digest("hex");
  return `mp08b-delivery-${digest}`;
}

function approvalReference(approval: Mp05ApprovalObservationV1): NonNullable<
  QueueWorkV1["protocolReferences"]
>["approval"] & {
  readonly decisionId: string;
} {
  if (approval.state !== "APPROVED" || !approval.decisionId)
    throw new Mp08bQueueRuntimeError(
      "Only a durably reread APPROVED MP-05 record with a decision identity can enter MP-06.",
    );
  return {
    approvalId: approval.approvalId,
    decisionId: approval.decisionId,
  };
}

function bindingForWork(
  work: QueueWorkV1,
  approvalRuntime: Mp08bDurableApprovalRuntime,
): { binding: Mp08bApprovalBindingV1; approvalId: string; decisionId: string } {
  const reference = work.protocolReferences?.approval;
  if (!reference?.approvalId || !reference.decisionId)
    throw new Mp08bQueueRuntimeError("Queue work has no complete MP-05 approval reference.");
  const binding = approvalRuntime.getApprovalBinding(reference.approvalId);
  if (!binding)
    throw new Mp08bQueueRuntimeError("Queue work has no durable host approval binding.");
  if (
    binding.intent.sourceRequestId !== work.sourceRequestId ||
    binding.intent.canonicalDigest !== work.actionIntentDigest ||
    binding.intent.idempotencyKey !== work.actionIntentIdempotencyKey
  )
    throw new Mp08bQueueRuntimeError(
      "Queue work is not bound to the exact durable ActionIntent for its approval.",
    );
  return {
    binding,
    approvalId: reference.approvalId,
    decisionId: reference.decisionId,
  };
}

function activityFor(
  work: QueueWorkV1,
  claim: SchedulingClaimV1,
  observedAt: string,
  state: "PROCESSING" | "BOUNDARY_BLOCKED",
  reason: string,
): ActivityRecordV1 {
  const activityId = createHash("sha256")
    .update(
      `moirae-protocol/mp08b/queue-01/activity/v1\0${canonicalizeJsonV1({
        claimId: claim.claimId,
        state,
        workId: work.workId,
      })}`,
      "utf8",
    )
    .digest("hex");
  const approval = work.protocolReferences?.approval;
  return {
    schemaVersion: "mp06b-activity-v1",
    activityId: `mp08b-activity-${activityId}`,
    workId: work.workId,
    deliveryId: work.deliveryId,
    state,
    observedAt,
    workerId: claim.workerId,
    claimId: claim.claimId,
    sourceRequestId: work.sourceRequestId,
    actionIntentDigest: work.actionIntentDigest,
    reason,
    ...(approval
      ? {
          approvalId: approval.approvalId,
          decisionId: approval.decisionId,
          approvalObservationState:
            state === "PROCESSING" ? ("APPROVED" as const) : ("INVALID" as const),
        }
      : {}),
  };
}

export class Mp08bDurableQueueRuntime {
  readonly mode = "DURABLE_LOCAL_QUEUE_PRE_EXECUTION" as const;
  readonly capabilities: Mp08bQueueCapabilitiesV1 = Object.freeze({
    durableLocalQueue: true,
    boundedWorker: true,
    hostedDurableQueue: false,
    externalEffects: false,
  });

  private readonly queue: DurableFilesystemLocalQueue;
  private readonly activity: DurableFilesystemActivitySink;

  constructor(private readonly options: QueueRuntimeOptions) {
    this.queue = new DurableFilesystemLocalQueue(options.queuePath, {
      clock: options.trustedTime,
      instanceId: options.instanceId,
      leaseDurationMs: options.leaseDurationMs ?? 1_000,
      retryBudget: options.retryBudget ?? 2,
    });
    this.activity = new DurableFilesystemActivitySink(options.activityPath, {
      instanceId: `${options.instanceId}-activity`,
    });
  }

  async enqueueApproved(approvalId: string): Promise<Mp08bQueueEnqueueResultV1> {
    let binding: Mp08bApprovalBindingV1 | undefined;
    try {
      binding = this.options.approvalRuntime.getApprovalBinding(approvalId);
      if (!binding) throw new Mp08bQueueRuntimeError("No durable host approval binding exists.");
      const approval = await this.options.approvalRuntime.readApproval(approvalId);
      const reference = approvalReference(approval);
      const workId = deterministicQueueIdentity.logicalWorkId(
        binding.intent.sourceRequestId,
        binding.intent.canonicalDigest,
      );
      const work = createQueueWork(binding.intent, {
        deliveryId: deliveryIdFor(workId, reference.approvalId, reference.decisionId),
        protocolReferences: { approval: reference },
      });
      const existing = this.queue.inspectOutcome(work.workId);
      if (existing?.approvalReference) {
        if (
          existing.approvalReference.approvalId !== reference.approvalId ||
          existing.approvalReference.decisionId !== reference.decisionId
        )
          throw new Mp08bQueueRuntimeError(
            "The logical work is already bound to a different durable approval decision.",
          );
      }
      const existingDelivery = this.queue.inspectDelivery(work.deliveryId);
      if (
        existingDelivery?.work.protocolReferences?.approval?.approvalId !== reference.approvalId ||
        existingDelivery?.work.protocolReferences?.approval?.decisionId !== reference.decisionId
      )
        if (existingDelivery)
          throw new Mp08bQueueRuntimeError("The deterministic delivery identity is conflicting.");
      const enqueue = this.queue.enqueue(work);
      const delivery = this.queue.makeAvailable(work.deliveryId, optionsNow(this.options));
      return { approval, enqueue, work, delivery };
    } catch (error) {
      if (error instanceof Mp08bQueueRuntimeError) throw error;
      throw new Mp08bQueueRuntimeError(
        error instanceof Error ? error.message : "Queue admission failed closed.",
      );
    }
  }

  async claim(input: {
    readonly deliveryId: string;
    readonly workerId: string;
  }): Promise<Mp08bQueueWorkerResultV1> {
    const delivery = this.queue.inspectDelivery(input.deliveryId);
    if (!delivery)
      return {
        status: "CLAIM_REJECTED",
        workId: "unknown",
        deliveryId: input.deliveryId,
        reason: "NOT_FOUND",
      };
    const now = optionsNow(this.options);
    const generation = delivery.generation + 1;
    const claimId = deterministicQueueIdentity.schedulingClaimId(
      delivery.work.workId,
      delivery.work.deliveryId,
      input.workerId,
      generation,
    );
    const acquired: QueueAcquireResultV1 = this.queue.acquire({
      deliveryId: input.deliveryId,
      workerId: input.workerId,
      claimId,
      now,
    });
    if (acquired.status !== "CLAIMED")
      return {
        status: "CLAIM_REJECTED",
        workId: delivery.work.workId,
        deliveryId: delivery.work.deliveryId,
        reason: acquired.reason,
      };

    const claim = acquired.claim;
    let binding: { binding: Mp08bApprovalBindingV1; approvalId: string; decisionId: string };
    let approval: Mp05ApprovalObservationV1;
    try {
      binding = bindingForWork(delivery.work, this.options.approvalRuntime);
      approval = await this.options.approvalRuntime.readApproval(binding.approvalId);
      if (approval.state !== "APPROVED" || approval.decisionId !== binding.decisionId)
        throw new Mp08bQueueRuntimeError(
          "Durable MP-05 approval truth is no longer the exact approved decision bound to this work.",
        );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Approval reread failed closed.";
      this.queue.complete({
        claim,
        outcome: "BOUNDARY_BLOCKED",
        observedAt: now,
        approvalReference: {
          schemaVersion: "mp06d-approval-reference-v1",
          approvalId: delivery.work.protocolReferences?.approval?.approvalId ?? "unknown",
          ...(delivery.work.protocolReferences?.approval?.decisionId
            ? { decisionId: delivery.work.protocolReferences.approval.decisionId }
            : {}),
          observationState: "BOUNDARY_FAILURE",
          observedAt: now,
        },
      });
      this.activity.append(
        activityFor(
          delivery.work,
          claim,
          now,
          "BOUNDARY_BLOCKED",
          `Queue-01 approval reread failed closed: ${reason}`,
        ),
      );
      return {
        status: "BLOCKED",
        workId: delivery.work.workId,
        deliveryId: delivery.work.deliveryId,
        claim,
        reclaimed: acquired.reclaimed,
        reason,
      };
    }

    this.activity.append(
      activityFor(
        delivery.work,
        claim,
        now,
        "PROCESSING",
        "READY_FOR_MP04; Queue-01 stops before MP-04/Horae and does not execute an effect.",
      ),
    );
    return {
      status: "READY_FOR_MP04",
      workId: delivery.work.workId,
      deliveryId: delivery.work.deliveryId,
      claim,
      reclaimed: acquired.reclaimed,
    };
  }

  inspectDelivery(deliveryId: string): QueueDeliverySnapshotV1 | undefined {
    return this.queue.inspectDelivery(deliveryId);
  }

  inspectOutcome(workId: string): QueueOutcomeSnapshotV1 | undefined {
    return this.queue.inspectOutcome(workId);
  }

  listActivity(workId?: string): readonly ActivityRecordV1[] {
    return this.activity.list(workId);
  }
}

function optionsNow(options: QueueRuntimeOptions): string {
  const value = options.trustedTime.now();
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new Mp08bQueueRuntimeError("Trusted queue time is invalid.");
  return new Date(Date.parse(value)).toISOString();
}

export function createMp08bDurableQueueRuntime(
  options: QueueRuntimeOptions,
): Mp08bDurableQueueRuntime {
  return new Mp08bDurableQueueRuntime(options);
}

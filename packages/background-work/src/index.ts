import { createHash } from "node:crypto";

import {
  actionIntentCoreFromIntent,
  actionIntentDigest,
  actionIntentIdempotencyKey,
  ActionIntentV1Schema,
  canonicalizeJsonV1,
  type ActionIntentV1,
} from "../../action-compiler/src/index.js";
import type {
  Mp03AuthenticatedContext,
  MoiraeAdmissionResultV1,
} from "../../fates-adapter/src/index.js";
import type { Mp04ExecutionResultV1 } from "../../execution-coordinator/src/index.js";

export const MP06B_QUEUE_WORK_VERSION = "mp06b-queue-work-v1" as const;
export const MP06B_CLAIM_VERSION = "mp06b-scheduling-claim-v1" as const;
export const MP06B_ACTIVITY_VERSION = "mp06b-activity-v1" as const;

const digestPattern = /^[a-f0-9]{64}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type QueueProtocolReferencesV1 = Readonly<{
  admissionObservation?: Readonly<{
    auditId: string;
    nativeActionHash: string;
  }>;
  approval?: Readonly<{ approvalId: string }>;
  durableExecution?: Readonly<{ durableExecutionId: string }>;
}>;

/**
 * Queue material is routing metadata only. The canonical ActionIntent is
 * loaded through TrustedProtocolBoundary and is deliberately not copied here.
 */
export type QueueWorkV1 = Readonly<{
  schemaVersion: typeof MP06B_QUEUE_WORK_VERSION;
  workId: string;
  sourceRequestId: string;
  actionIntentDigest: string;
  actionIntentIdempotencyKey: string;
  deliveryId: string;
  protocolReferences?: QueueProtocolReferencesV1;
}>;

export type QueueDeliveryStateV1 =
  | "QUEUED"
  | "AVAILABLE"
  | "CLAIMED"
  | "COMPLETED"
  | "WAITING_FOR_APPROVAL"
  | "DENIED"
  | "BOUNDARY_BLOCKED"
  | "TERMINAL_FAILURE"
  | "RETRY_SCHEDULED";

export type QueueLogicalOutcomeV1 =
  | "OPEN"
  | "COMPLETED"
  | "WAITING_FOR_APPROVAL"
  | "DENIED"
  | "BOUNDARY_BLOCKED"
  | "TERMINAL_FAILURE"
  | "RETRY_SCHEDULED";

export type QueueTerminalOutcomeV1 = Exclude<QueueLogicalOutcomeV1, "OPEN" | "RETRY_SCHEDULED">;

export type SchedulingClaimV1 = Readonly<{
  schemaVersion: typeof MP06B_CLAIM_VERSION;
  workId: string;
  deliveryId: string;
  workerId: string;
  claimId: string;
  generation: number;
  claimedAt: string;
}>;

export type QueueDeliverySnapshotV1 = Readonly<{
  work: QueueWorkV1;
  state: QueueDeliveryStateV1;
  generation: number;
  availableAt?: string;
  claim?: SchedulingClaimV1;
}>;

export type QueueOutcomeSnapshotV1 = Readonly<{
  schemaVersion: typeof MP06B_QUEUE_WORK_VERSION;
  workId: string;
  outcome: QueueLogicalOutcomeV1;
  lastDeliveryId?: string;
  mp04DurableExecutionId?: string;
  observedAt?: string;
}>;

export type QueueAcquireResultV1 =
  | Readonly<{ status: "CLAIMED"; claim: SchedulingClaimV1 }>
  | Readonly<{
      status: "REJECTED";
      reason:
        | "NOT_FOUND"
        | "NOT_AVAILABLE"
        | "ALREADY_CLAIMED"
        | "DELIVERY_TERMINAL"
        | "NOT_YET_AVAILABLE"
        | "INVALID_CLAIM_ID";
    }>;

export type QueueEnqueueResultV1 = Readonly<{
  status: "ENQUEUED" | "DUPLICATE_DELIVERY" | "DUPLICATE_LOGICAL_WORK";
  work: QueueWorkV1;
}>;

export type QueueReleaseResultV1 = Readonly<{
  status: "RELEASED" | "RETRY_SCHEDULED" | "RETRY_LIMIT_REACHED";
  delivery: QueueDeliverySnapshotV1;
}>;

export type ActivityStateV1 =
  | "QUEUED"
  | "CLAIMED"
  | "PROCESSING"
  | "AUTHORITY_CHECKED"
  | "WAITING_FOR_APPROVAL"
  | "DENIED"
  | "BOUNDARY_BLOCKED"
  | "COMPLETED"
  | "TERMINAL_FAILURE"
  | "RETRY_SCHEDULED"
  | "RECONCILIATION_REQUIRED"
  | "EFFECT_ABSENT";

/**
 * Activity is explanatory evidence. It contains references and outcomes, not
 * credentials, raw authority, mutable parameters, or model prose.
 */
export type ActivityRecordV1 = Readonly<{
  schemaVersion: typeof MP06B_ACTIVITY_VERSION;
  activityId: string;
  workId: string;
  deliveryId: string;
  state: ActivityStateV1;
  observedAt: string;
  workerId?: string;
  claimId?: string;
  sourceRequestId: string;
  actionIntentDigest: string;
  reason?: string;
  admissionStatus?: "ADMITTED" | "WAITING_FOR_APPROVAL" | "REJECTED" | "BOUNDARY_FAILURE";
  admissionAuditId?: string;
  nativeActionHash?: string;
  approvalId?: string;
  durableExecutionId?: string;
  mp04Status?: Mp04ExecutionResultV1["status"];
}>;

export interface QueueIdentityDeriver {
  logicalWorkId(sourceRequestId: string, actionIntentDigest: string): string;
  schedulingClaimId(
    workId: string,
    deliveryId: string,
    workerId: string,
    generation: number,
  ): string;
}

function domainHash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(`${domain}\0${canonicalizeJsonV1(value)}`, "utf8")
    .digest("hex");
}

export const deterministicQueueIdentity: QueueIdentityDeriver = Object.freeze({
  logicalWorkId(sourceRequestId: string, actionIntentDigestValue: string) {
    return `mp06b-work-${domainHash("moirae-protocol/mp06b/logical-work/v1", {
      actionIntentDigest: actionIntentDigestValue,
      sourceRequestId,
    })}`;
  },
  schedulingClaimId(workId: string, deliveryId: string, workerId: string, generation: number) {
    return `mp06b-claim-${domainHash("moirae-protocol/mp06b/scheduling-claim/v1", {
      deliveryId,
      generation,
      workId,
      workerId,
    })}`;
  },
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validTimestamp(value: string): boolean {
  return timestampPattern.test(value) && Number.isFinite(Date.parse(value));
}

function validDigest(value: string): boolean {
  return digestPattern.test(value);
}

function requireIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200)
    throw new TypeError(`${label} must be a non-empty bounded identifier.`);
}

function assertQueueWork(work: QueueWorkV1, identity: QueueIdentityDeriver): void {
  if (work.schemaVersion !== MP06B_QUEUE_WORK_VERSION)
    throw new TypeError("Unsupported MP-06B queue-work schema version.");
  requireIdentifier(work.workId, "workId");
  requireIdentifier(work.sourceRequestId, "sourceRequestId");
  requireIdentifier(work.deliveryId, "deliveryId");
  if (!validDigest(work.actionIntentDigest) || !validDigest(work.actionIntentIdempotencyKey))
    throw new TypeError("Queue work must contain valid ActionIntent digest identities.");
  if (identity.logicalWorkId(work.sourceRequestId, work.actionIntentDigest) !== work.workId)
    throw new TypeError("Queue work logical workId does not match its immutable request binding.");
}

function assertClaim(claim: SchedulingClaimV1, expected: SchedulingClaimV1): void {
  if (
    claim.schemaVersion !== MP06B_CLAIM_VERSION ||
    claim.workId !== expected.workId ||
    claim.deliveryId !== expected.deliveryId ||
    claim.workerId !== expected.workerId ||
    claim.claimId !== expected.claimId ||
    claim.generation !== expected.generation ||
    claim.claimedAt !== expected.claimedAt
  )
    throw new Error("Scheduling claim does not match the active compare-and-set claim.");
}

function terminalDeliveryState(outcome: QueueTerminalOutcomeV1): QueueDeliveryStateV1 {
  return outcome;
}

type InternalDelivery = {
  work: QueueWorkV1;
  state: QueueDeliveryStateV1;
  generation: number;
  availableAt?: string;
  claim?: SchedulingClaimV1;
  releaseCount: number;
};

type InternalLogicalWork = {
  work: QueueWorkV1;
  outcome: QueueLogicalOutcomeV1;
  deliveryIds: Set<string>;
  lastDeliveryId?: string;
  mp04DurableExecutionId?: string;
  observedAt?: string;
};

export interface LocalQueueOptions {
  readonly identity?: QueueIdentityDeriver;
  readonly maxExplicitReleases?: number;
}

/**
 * Small deterministic queue backend for MP-06B tests and local orchestration.
 * It arbitrates processing ownership only; it has no authority or effect API.
 */
export class InMemoryLocalQueue {
  private readonly identity: QueueIdentityDeriver;
  private readonly maxExplicitReleases: number;
  private readonly logical = new Map<string, InternalLogicalWork>();
  private readonly deliveries = new Map<string, InternalDelivery>();

  constructor(options: LocalQueueOptions = {}) {
    this.identity = options.identity ?? deterministicQueueIdentity;
    this.maxExplicitReleases = options.maxExplicitReleases ?? 1;
    if (!Number.isSafeInteger(this.maxExplicitReleases) || this.maxExplicitReleases < 0)
      throw new TypeError("maxExplicitReleases must be a non-negative safe integer.");
  }

  enqueue(work: QueueWorkV1): QueueEnqueueResultV1 {
    assertQueueWork(work, this.identity);
    const existing = this.logical.get(work.workId);
    if (existing) {
      if (
        existing.work.sourceRequestId !== work.sourceRequestId ||
        existing.work.actionIntentDigest !== work.actionIntentDigest ||
        existing.work.actionIntentIdempotencyKey !== work.actionIntentIdempotencyKey
      )
        throw new Error("Conflicting immutable identities for one logical workId.");

      if (existing.deliveryIds.has(work.deliveryId))
        return { status: "DUPLICATE_DELIVERY", work: clone(work) };

      existing.deliveryIds.add(work.deliveryId);
      this.deliveries.set(work.deliveryId, {
        work: clone(work),
        state: "QUEUED",
        generation: 0,
        releaseCount: 0,
      });
      existing.lastDeliveryId = work.deliveryId;
      return { status: "DUPLICATE_LOGICAL_WORK", work: clone(work) };
    }

    this.logical.set(work.workId, {
      work: clone(work),
      outcome: "OPEN",
      deliveryIds: new Set([work.deliveryId]),
      lastDeliveryId: work.deliveryId,
    });
    this.deliveries.set(work.deliveryId, {
      work: clone(work),
      state: "QUEUED",
      generation: 0,
      releaseCount: 0,
    });
    return { status: "ENQUEUED", work: clone(work) };
  }

  makeAvailable(deliveryId: string, availableAt: string): QueueDeliverySnapshotV1 {
    if (!validTimestamp(availableAt))
      throw new TypeError("Queue availability requires trusted time.");
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) throw new Error("Queue delivery was not found.");
    if (delivery.state === "QUEUED" || delivery.state === "RETRY_SCHEDULED") {
      delivery.state = "AVAILABLE";
      delivery.availableAt = availableAt;
    }
    return this.snapshot(delivery);
  }

  acquire(input: {
    readonly deliveryId: string;
    readonly workerId: string;
    readonly claimId: string;
    readonly now: string;
  }): QueueAcquireResultV1 {
    requireIdentifier(input.deliveryId, "deliveryId");
    requireIdentifier(input.workerId, "workerId");
    requireIdentifier(input.claimId, "claimId");
    if (!validTimestamp(input.now)) throw new TypeError("Claim acquisition requires trusted time.");
    const delivery = this.deliveries.get(input.deliveryId);
    if (!delivery) return { status: "REJECTED", reason: "NOT_FOUND" };
    if (delivery.state === "CLAIMED") return { status: "REJECTED", reason: "ALREADY_CLAIMED" };
    if (delivery.state !== "AVAILABLE") {
      if (
        delivery.state === "COMPLETED" ||
        delivery.state === "DENIED" ||
        delivery.state === "BOUNDARY_BLOCKED" ||
        delivery.state === "TERMINAL_FAILURE" ||
        delivery.state === "WAITING_FOR_APPROVAL"
      )
        return { status: "REJECTED", reason: "DELIVERY_TERMINAL" };
      return { status: "REJECTED", reason: "NOT_AVAILABLE" };
    }
    if (delivery.availableAt && Date.parse(delivery.availableAt) > Date.parse(input.now))
      return { status: "REJECTED", reason: "NOT_YET_AVAILABLE" };

    const generation = delivery.generation + 1;
    if (
      input.claimId !==
      this.identity.schedulingClaimId(
        delivery.work.workId,
        delivery.work.deliveryId,
        input.workerId,
        generation,
      )
    )
      return { status: "REJECTED", reason: "INVALID_CLAIM_ID" };
    const claim: SchedulingClaimV1 = {
      schemaVersion: MP06B_CLAIM_VERSION,
      workId: delivery.work.workId,
      deliveryId: delivery.work.deliveryId,
      workerId: input.workerId,
      claimId: input.claimId,
      generation,
      claimedAt: input.now,
    };
    delivery.generation = generation;
    delivery.claim = claim;
    delivery.state = "CLAIMED";
    return { status: "CLAIMED", claim: clone(claim) };
  }

  complete(input: {
    readonly claim: SchedulingClaimV1;
    readonly outcome: QueueTerminalOutcomeV1;
    readonly observedAt: string;
    readonly mp04DurableExecutionId?: string;
  }): QueueDeliverySnapshotV1 {
    if (!validTimestamp(input.observedAt))
      throw new TypeError("Queue completion requires trusted time.");
    const delivery = this.deliveries.get(input.claim.deliveryId);
    if (!delivery || !delivery.claim) throw new Error("No active scheduling claim exists.");
    assertClaim(input.claim, delivery.claim);
    delivery.state = terminalDeliveryState(input.outcome);
    delivery.claim = undefined;
    const logical = this.logical.get(delivery.work.workId);
    if (!logical) throw new Error("Queue logical work disappeared during completion.");
    logical.outcome = input.outcome;
    logical.lastDeliveryId = delivery.work.deliveryId;
    logical.observedAt = input.observedAt;
    if (input.mp04DurableExecutionId) logical.mp04DurableExecutionId = input.mp04DurableExecutionId;
    return this.snapshot(delivery);
  }

  release(input: {
    readonly claim: SchedulingClaimV1;
    readonly availableAt: string;
    readonly retryEligible: boolean;
  }): QueueReleaseResultV1 {
    if (!validTimestamp(input.availableAt))
      throw new TypeError("Queue release requires trusted availability time.");
    const delivery = this.deliveries.get(input.claim.deliveryId);
    if (!delivery || !delivery.claim) throw new Error("No active scheduling claim exists.");
    assertClaim(input.claim, delivery.claim);
    const logical = this.logical.get(delivery.work.workId);
    if (!logical) throw new Error("Queue logical work disappeared during release.");

    if (input.retryEligible) {
      if (delivery.releaseCount >= this.maxExplicitReleases) {
        delivery.state = "TERMINAL_FAILURE";
        delivery.claim = undefined;
        logical.outcome = "TERMINAL_FAILURE";
        return { status: "RETRY_LIMIT_REACHED", delivery: this.snapshot(delivery) };
      }
      delivery.releaseCount += 1;
      delivery.state = "RETRY_SCHEDULED";
      logical.outcome = "RETRY_SCHEDULED";
      delivery.availableAt = input.availableAt;
      delivery.claim = undefined;
      return { status: "RETRY_SCHEDULED", delivery: this.snapshot(delivery) };
    }

    delivery.state = "AVAILABLE";
    delivery.availableAt = input.availableAt;
    delivery.claim = undefined;
    return { status: "RELEASED", delivery: this.snapshot(delivery) };
  }

  inspectDelivery(deliveryId: string): QueueDeliverySnapshotV1 | undefined {
    const delivery = this.deliveries.get(deliveryId);
    return delivery ? this.snapshot(delivery) : undefined;
  }

  inspectOutcome(workId: string): QueueOutcomeSnapshotV1 | undefined {
    const logical = this.logical.get(workId);
    if (!logical) return undefined;
    return {
      schemaVersion: MP06B_QUEUE_WORK_VERSION,
      workId,
      outcome: logical.outcome,
      ...(logical.lastDeliveryId ? { lastDeliveryId: logical.lastDeliveryId } : {}),
      ...(logical.mp04DurableExecutionId
        ? { mp04DurableExecutionId: logical.mp04DurableExecutionId }
        : {}),
      ...(logical.observedAt ? { observedAt: logical.observedAt } : {}),
    };
  }

  private snapshot(delivery: InternalDelivery): QueueDeliverySnapshotV1 {
    return {
      work: clone(delivery.work),
      state: delivery.state,
      generation: delivery.generation,
      ...(delivery.availableAt ? { availableAt: delivery.availableAt } : {}),
      ...(delivery.claim ? { claim: clone(delivery.claim) } : {}),
    };
  }
}

export interface ActivitySink {
  append(record: ActivityRecordV1): void;
}

export class InMemoryActivitySink implements ActivitySink {
  private readonly records: ActivityRecordV1[] = [];

  append(record: ActivityRecordV1): void {
    this.records.push(clone(record));
  }

  list(workId?: string): readonly ActivityRecordV1[] {
    return this.records
      .filter((record) => !workId || record.workId === workId)
      .map((record) => clone(record));
  }
}

export interface TrustedProtocolBoundary {
  load(input: {
    readonly sourceRequestId: string;
    readonly actionIntentDigest: string;
    readonly actionIntentIdempotencyKey: string;
  }): Promise<
    Readonly<{
      readonly intent: unknown;
      readonly authenticatedContext: unknown;
    }>
  >;
}

export interface Mp03AdmissionPort {
  admitActionIntent(input: {
    readonly intent: unknown;
    readonly authenticatedContext: unknown;
    readonly now: unknown;
  }): Promise<MoiraeAdmissionResultV1>;
}

export interface Mp04ExecutionPort {
  executeAdmittedAction(input: unknown): Promise<Mp04ExecutionResultV1>;
}

export function createQueueWork(
  intentInput: unknown,
  options: {
    readonly deliveryId: string;
    readonly identity?: QueueIdentityDeriver;
    readonly protocolReferences?: QueueProtocolReferencesV1;
  },
): QueueWorkV1 {
  const intent = verifyActionIntent(intentInput);
  requireIdentifier(options.deliveryId, "deliveryId");
  const identity = options.identity ?? deterministicQueueIdentity;
  return {
    schemaVersion: MP06B_QUEUE_WORK_VERSION,
    workId: identity.logicalWorkId(intent.sourceRequestId, intent.canonicalDigest),
    sourceRequestId: intent.sourceRequestId,
    actionIntentDigest: intent.canonicalDigest,
    actionIntentIdempotencyKey: intent.idempotencyKey,
    deliveryId: options.deliveryId,
    ...(options.protocolReferences
      ? { protocolReferences: clone(options.protocolReferences) }
      : {}),
  };
}

function verifyActionIntent(intentInput: unknown): ActionIntentV1 {
  const parsed = ActionIntentV1Schema.safeParse(intentInput);
  if (!parsed.success)
    throw new Error("Trusted Protocol boundary returned an invalid ActionIntent.");
  const intent = parsed.data;
  const core = actionIntentCoreFromIntent(intent);
  const digest = actionIntentDigest(core);
  if (
    digest !== intent.canonicalDigest ||
    actionIntentIdempotencyKey(intent.sourceRequestId, digest) !== intent.idempotencyKey
  )
    throw new Error("ActionIntent integrity material does not reproduce canonically.");
  return intent;
}

type VerifiedProtocolMaterial = Readonly<{
  intent: ActionIntentV1;
  authenticatedContext: Mp03AuthenticatedContext;
}>;

function verifyProtocolBinding(
  work: QueueWorkV1,
  material: Readonly<{ intent: unknown; authenticatedContext: unknown }>,
  identity: QueueIdentityDeriver,
): VerifiedProtocolMaterial {
  const intent = verifyActionIntent(material.intent);
  if (
    intent.sourceRequestId !== work.sourceRequestId ||
    intent.canonicalDigest !== work.actionIntentDigest ||
    intent.idempotencyKey !== work.actionIntentIdempotencyKey ||
    identity.logicalWorkId(work.sourceRequestId, work.actionIntentDigest) !== work.workId
  )
    throw new Error("Queue work does not bind to the canonical ActionIntent identity.");
  return {
    intent,
    authenticatedContext: material.authenticatedContext as Mp03AuthenticatedContext,
  };
}

export type Mp06WorkerStatusV1 =
  "completed" | "waiting" | "denied" | "blocked" | "retry-eligible" | "terminal" | "claim-rejected";

export type Mp06WorkerResultV1 = Readonly<{
  status: Mp06WorkerStatusV1;
  workId: string;
  deliveryId: string;
  queueOutcome?: QueueLogicalOutcomeV1;
  reason?: string;
  mp04Status?: Mp04ExecutionResultV1["status"];
  retryEligible?: boolean;
}>;

export class DeterministicLocalWorker {
  private readonly identity: QueueIdentityDeriver;

  constructor(
    private readonly options: {
      readonly queue: InMemoryLocalQueue;
      readonly protocol: TrustedProtocolBoundary;
      readonly admission: Mp03AdmissionPort;
      readonly execution: Mp04ExecutionPort;
      readonly activity: ActivitySink;
      readonly identity?: QueueIdentityDeriver;
    },
  ) {
    this.identity = options.identity ?? deterministicQueueIdentity;
  }

  async process(input: {
    readonly deliveryId: string;
    readonly workerId: string;
    readonly claimId: string;
    readonly now: string;
  }): Promise<Mp06WorkerResultV1> {
    const delivery = this.options.queue.inspectDelivery(input.deliveryId);
    if (!delivery) {
      return {
        status: "claim-rejected",
        workId: "unknown",
        deliveryId: input.deliveryId,
        reason: "NOT_FOUND",
      };
    }
    const claimResult = this.options.queue.acquire(input);
    if (claimResult.status !== "CLAIMED") {
      return {
        status: "claim-rejected",
        workId: delivery.work.workId,
        deliveryId: input.deliveryId,
        reason: claimResult.reason,
      };
    }
    const { claim } = claimResult;
    this.appendActivity(delivery.work, claim, "CLAIMED", input.now);
    this.appendActivity(delivery.work, claim, "PROCESSING", input.now);

    let verified: VerifiedProtocolMaterial;
    try {
      const material = await this.options.protocol.load({
        sourceRequestId: delivery.work.sourceRequestId,
        actionIntentDigest: delivery.work.actionIntentDigest,
        actionIntentIdempotencyKey: delivery.work.actionIntentIdempotencyKey,
      });
      verified = verifyProtocolBinding(delivery.work, material, this.identity);
    } catch (error) {
      return this.finishBlocked(
        delivery.work,
        claim,
        input.now,
        error instanceof Error ? error.message : "ActionIntent binding failed.",
      );
    }

    let admission: MoiraeAdmissionResultV1;
    try {
      // No approvalId or prior result is accepted from queue material. MP-03
      // must observe the current authority boundary on every delivery.
      admission = await this.options.admission.admitActionIntent({
        intent: verified.intent,
        authenticatedContext: verified.authenticatedContext,
        now: input.now,
      });
    } catch {
      return this.finishBlocked(delivery.work, claim, input.now, "MP-03 admission failed closed.");
    }

    const references = this.admissionReferences(admission);
    this.appendActivity(delivery.work, claim, "AUTHORITY_CHECKED", input.now, {
      admissionStatus: admission.status,
      ...references,
    });

    if (admission.status === "WAITING_FOR_APPROVAL") {
      this.options.queue.complete({
        claim,
        outcome: "WAITING_FOR_APPROVAL",
        observedAt: input.now,
      });
      this.appendActivity(delivery.work, claim, "WAITING_FOR_APPROVAL", input.now, references);
      return {
        status: "waiting",
        workId: delivery.work.workId,
        deliveryId: delivery.work.deliveryId,
        queueOutcome: "WAITING_FOR_APPROVAL",
      };
    }

    if (admission.status === "REJECTED") {
      this.options.queue.complete({ claim, outcome: "DENIED", observedAt: input.now });
      this.appendActivity(delivery.work, claim, "DENIED", input.now, {
        ...references,
        reason: admission.nativeDecision,
      });
      return {
        status: "denied",
        workId: delivery.work.workId,
        deliveryId: delivery.work.deliveryId,
        queueOutcome: "DENIED",
        reason: admission.nativeDecision,
      };
    }

    if (admission.status === "BOUNDARY_FAILURE") {
      return this.finishBlocked(delivery.work, claim, input.now, admission.reason, references);
    }

    let execution: Mp04ExecutionResultV1;
    try {
      execution = await this.options.execution.executeAdmittedAction({
        intent: verified.intent,
        authenticatedContext: verified.authenticatedContext,
        admission,
        now: input.now,
      });
    } catch {
      return this.finishBlocked(
        delivery.work,
        claim,
        input.now,
        "MP-04 execution failed closed.",
        references,
      );
    }

    if (execution.status === "CONFIRMED") {
      this.options.queue.complete({
        claim,
        outcome: "COMPLETED",
        observedAt: input.now,
        ...(execution.durableExecutionId
          ? { mp04DurableExecutionId: execution.durableExecutionId }
          : {}),
      });
      this.appendActivity(delivery.work, claim, "COMPLETED", input.now, {
        ...references,
        durableExecutionId: execution.durableExecutionId,
        mp04Status: execution.status,
      });
      return {
        status: "completed",
        workId: delivery.work.workId,
        deliveryId: delivery.work.deliveryId,
        queueOutcome: "COMPLETED",
        mp04Status: execution.status,
      };
    }

    if (execution.status === "UNKNOWN" || execution.status === "RECOVERY_REQUIRED") {
      this.options.queue.complete({ claim, outcome: "TERMINAL_FAILURE", observedAt: input.now });
      this.appendActivity(delivery.work, claim, "TERMINAL_FAILURE", input.now, {
        ...references,
        durableExecutionId: execution.durableExecutionId,
        mp04Status: execution.status,
        reason: "MP-04 requires its later recovery/reconciliation boundary.",
      });
      return {
        status: "retry-eligible",
        workId: delivery.work.workId,
        deliveryId: delivery.work.deliveryId,
        queueOutcome: "TERMINAL_FAILURE",
        mp04Status: execution.status,
        retryEligible: true,
      };
    }

    this.options.queue.complete({ claim, outcome: "TERMINAL_FAILURE", observedAt: input.now });
    this.appendActivity(delivery.work, claim, "TERMINAL_FAILURE", input.now, {
      ...references,
      durableExecutionId: execution.durableExecutionId,
      mp04Status: execution.status,
    });
    return {
      status: execution.status === "ABSENT" ? "terminal" : "blocked",
      workId: delivery.work.workId,
      deliveryId: delivery.work.deliveryId,
      queueOutcome: "TERMINAL_FAILURE",
      mp04Status: execution.status,
    };
  }

  private finishBlocked(
    work: QueueWorkV1,
    claim: SchedulingClaimV1,
    observedAt: string,
    reason: string,
    extra: Partial<ActivityRecordV1> = {},
  ): Mp06WorkerResultV1 {
    this.options.queue.complete({ claim, outcome: "BOUNDARY_BLOCKED", observedAt });
    this.appendActivity(work, claim, "BOUNDARY_BLOCKED", observedAt, { ...extra, reason });
    return {
      status: "blocked",
      workId: work.workId,
      deliveryId: work.deliveryId,
      queueOutcome: "BOUNDARY_BLOCKED",
      reason,
    };
  }

  private admissionReferences(admission: MoiraeAdmissionResultV1):
    | Readonly<{
        admissionAuditId?: string;
        nativeActionHash?: string;
        approvalId?: string;
      }>
    | undefined {
    if (!("evidence" in admission)) return undefined;
    const approvalId = "approvalId" in admission ? admission.approvalId : undefined;
    return {
      admissionAuditId: admission.evidence.auditId,
      nativeActionHash: admission.nativeActionHash,
      ...(approvalId ? { approvalId } : {}),
    };
  }

  private appendActivity(
    work: QueueWorkV1,
    claim: SchedulingClaimV1,
    state: ActivityStateV1,
    observedAt: string,
    extra: Partial<ActivityRecordV1> = {},
  ): void {
    this.options.activity.append({
      schemaVersion: MP06B_ACTIVITY_VERSION,
      activityId: `mp06b-activity-${work.deliveryId}-${claim.generation}-${state.toLowerCase()}`,
      workId: work.workId,
      deliveryId: work.deliveryId,
      state,
      observedAt,
      workerId: claim.workerId,
      claimId: claim.claimId,
      sourceRequestId: work.sourceRequestId,
      actionIntentDigest: work.actionIntentDigest,
      ...extra,
    });
  }
}

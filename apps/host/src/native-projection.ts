import type {
  ActivityRecordV1,
  QueueDeliverySnapshotV1,
  QueueOutcomeSnapshotV1,
} from "../../../packages/background-work/src/index.js";
import type {
  Mp04ExecutionCoordinator,
  Mp04ExecutionResultV1,
} from "../../../packages/execution-coordinator/src/index.js";
import type {
  ApprovalPresentationV1,
  Mp05ApprovalObservationV1,
} from "../../../packages/human-approval/src/index.js";
import type {
  Mp03AuthenticatedContext,
  MoiraeAdmissionResultV1,
} from "../../../packages/fates-adapter/src/index.js";
import type { Mp08bApprovalBindingV1 } from "./approval-runtime.js";
import {
  buildMp07ProductView,
  type Mp07ApprovalObservationV1,
  type Mp07ProductInputV1,
  type Mp07ProductViewV1,
  type Mp07QueueObservationV1,
} from "./index.js";
import type { Mp08bDurableApprovalRuntime } from "./approval-runtime.js";
import type { Mp08bDurableQueueRuntime } from "./queue-runtime.js";

export const MP08B_PROJECTION_01_VERSION = "mp08b-projection-01-v1" as const;

export class Mp08bNativeProjectionError extends Error {
  readonly code = "MP08B_NATIVE_PROJECTION_FAILURE" as const;

  constructor(message: string) {
    super(message);
    this.name = "Mp08bNativeProjectionError";
  }
}

export type Mp08bNativeExecutionReadRequestV1 = Readonly<{
  readonly durableExecutionId: string;
  readonly workId: string;
  readonly approvalId: string;
  readonly sourceRequestId: string;
  readonly actionIntentDigest: string;
  readonly actionIntentIdempotencyKey: string;
  readonly expectedNativeActionHash?: string;
}>;

export type Mp08bNativeProjectionSources = Readonly<{
  readonly readBinding: (approvalId: string) => Mp08bApprovalBindingV1 | undefined;
  readonly readApproval: (approvalId: string) => Promise<Mp05ApprovalObservationV1>;
  readonly readApprovalPresentation?: (
    approvalId: string,
  ) => Promise<ApprovalPresentationV1 | undefined>;
  readonly readQueue: (deliveryId: string) => Mp07QueueObservationV1 | undefined;
  readonly readExecution?: (
    input: Mp08bNativeExecutionReadRequestV1,
  ) => Promise<Mp04ExecutionResultV1 | undefined>;
  readonly trustedNow: () => string;
}>;

export type Mp08bNativeProjectionCapabilitiesV1 = Readonly<{
  readonly trustedNativeProjection: true;
  readonly mutatesProtocolState: false;
  readonly fallsBackToSynthetic: false;
}>;

export type Mp08bTrustedNativeProductProjection = Readonly<{
  readonly version: typeof MP08B_PROJECTION_01_VERSION;
  readonly capabilities: Mp08bNativeProjectionCapabilitiesV1;
  readonly readProductView: (deliveryId: string) => Promise<Mp07ProductViewV1>;
}>;

function approvalObservation(approval: Mp05ApprovalObservationV1): Mp07ApprovalObservationV1 {
  return {
    approvalId: approval.approvalId,
    status: approval.state,
    ...(approval.decisionId ? { decisionId: approval.decisionId } : {}),
    expiresAt: approval.expiresAt,
  };
}

function assertExecutionBinding(
  execution: Mp04ExecutionResultV1,
  input: Mp08bNativeExecutionReadRequestV1,
): void {
  if (execution.durableExecutionId !== input.durableExecutionId)
    throw new Mp08bNativeProjectionError(
      "The MP-04 result is bound to a different durable execution identity.",
    );
  if (
    execution.evidence.canonicalDigest !== undefined &&
    execution.evidence.canonicalDigest !== input.actionIntentDigest
  )
    throw new Mp08bNativeProjectionError(
      "The MP-04 result is bound to a different ActionIntent digest.",
    );
  if (
    execution.evidence.approvalGrantId !== undefined &&
    execution.evidence.approvalGrantId !== input.approvalId
  )
    throw new Mp08bNativeProjectionError(
      "The MP-04 result is bound to a different approval grant.",
    );
}

function queueForProjection(
  delivery: QueueDeliverySnapshotV1,
  outcome: QueueOutcomeSnapshotV1 | undefined,
  activity: readonly ActivityRecordV1[],
): Mp07QueueObservationV1 {
  return {
    delivery,
    ...(outcome ? { outcome } : {}),
    ...(delivery.claim ? { claim: delivery.claim } : {}),
    activity,
  };
}

function nativeActionHashFromWaitingAdmission(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const nativeActionHash = (value as { nativeActionHash?: unknown }).nativeActionHash;
  return typeof nativeActionHash === "string" ? nativeActionHash : undefined;
}

/**
 * Build the trusted read-side projection from host-owned native readers.
 * Neither this adapter nor the existing MP-07 mapper mutates approval, queue,
 * execution, or reconciliation state.
 */
export function createMp08bTrustedNativeProductProjection(
  sources: Mp08bNativeProjectionSources,
): Mp08bTrustedNativeProductProjection {
  const capabilities: Mp08bNativeProjectionCapabilitiesV1 = Object.freeze({
    trustedNativeProjection: true,
    mutatesProtocolState: false,
    fallsBackToSynthetic: false,
  });

  return Object.freeze({
    version: MP08B_PROJECTION_01_VERSION,
    capabilities,
    async readProductView(deliveryId: string): Promise<Mp07ProductViewV1> {
      const queue = sources.readQueue(deliveryId);
      if (!queue)
        throw new Mp08bNativeProjectionError(
          "The trusted native queue delivery is unavailable; synthetic state is not a fallback.",
        );
      const approvalReference = queue.delivery.work.protocolReferences?.approval;
      if (!approvalReference?.approvalId)
        throw new Mp08bNativeProjectionError(
          "The native queue delivery has no exact MP-05 approval reference.",
        );
      const binding = sources.readBinding(approvalReference.approvalId);
      if (!binding)
        throw new Mp08bNativeProjectionError(
          "The trusted host has no durable ActionIntent binding for the native approval.",
        );
      if (
        binding.intent.sourceRequestId !== queue.delivery.work.sourceRequestId ||
        binding.intent.canonicalDigest !== queue.delivery.work.actionIntentDigest ||
        binding.intent.idempotencyKey !== queue.delivery.work.actionIntentIdempotencyKey
      )
        throw new Mp08bNativeProjectionError(
          "The native approval binding and queue work do not share exact ActionIntent identity.",
        );

      const approval = await sources.readApproval(approvalReference.approvalId);
      if (approval.approvalId !== approvalReference.approvalId)
        throw new Mp08bNativeProjectionError(
          "The native MP-05 observation is bound to a different approval.",
        );

      let presentation: ApprovalPresentationV1 | undefined;
      if (approval.state === "PENDING") {
        if (!sources.readApprovalPresentation)
          throw new Mp08bNativeProjectionError(
            "A pending native approval has no trusted MP-05 presentation reader.",
          );
        presentation = await sources.readApprovalPresentation(approval.approvalId);
      }

      let execution: Mp04ExecutionResultV1 | undefined;
      const durableExecutionId = queue.outcome?.mp04DurableExecutionId;
      if (durableExecutionId && sources.readExecution) {
        execution = await sources.readExecution({
          durableExecutionId,
          workId: queue.delivery.work.workId,
          approvalId: approval.approvalId,
          sourceRequestId: binding.intent.sourceRequestId,
          actionIntentDigest: binding.intent.canonicalDigest,
          actionIntentIdempotencyKey: binding.intent.idempotencyKey,
          expectedNativeActionHash: nativeActionHashFromWaitingAdmission(binding.waitingAdmission),
        });
        if (execution) {
          assertExecutionBinding(execution, {
            durableExecutionId,
            workId: queue.delivery.work.workId,
            approvalId: approval.approvalId,
            sourceRequestId: binding.intent.sourceRequestId,
            actionIntentDigest: binding.intent.canonicalDigest,
            actionIntentIdempotencyKey: binding.intent.idempotencyKey,
            expectedNativeActionHash: nativeActionHashFromWaitingAdmission(
              binding.waitingAdmission,
            ),
          });
        }
      }

      const input: Mp07ProductInputV1 = {
        actionIntent: binding.intent,
        authenticatedContext: binding.authenticatedContext as Mp03AuthenticatedContext,
        queue: queueForProjection(queue.delivery, queue.outcome, queue.activity),
        ...(approval.state === "PENDING"
          ? { admission: binding.waitingAdmission as MoiraeAdmissionResultV1 }
          : {}),
        ...(execution ? { execution } : {}),
        approval: {
          ...approvalObservation(approval),
          ...(presentation ? { presentation } : {}),
        },
        observedAt: sources.trustedNow(),
      };

      return buildMp07ProductView(input);
    },
  });
}

/**
 * Wire the projection to the already accepted durable MP-05 and MP-06 host
 * runtimes. MP-04/Horae result reading remains an explicit injected port: this
 * adapter never treats queue/activity state as execution truth.
 */
export function createMp08bNativeProjectionSources(options: {
  readonly approvalRuntime: Pick<
    Mp08bDurableApprovalRuntime,
    "getApprovalBinding" | "readApproval" | "refreshApproval"
  >;
  readonly queueRuntime: Pick<
    Mp08bDurableQueueRuntime,
    "inspectDelivery" | "inspectOutcome" | "listActivity"
  >;
  readonly readExecution?: Mp08bNativeProjectionSources["readExecution"];
  readonly executionCoordinator?: Pick<Mp04ExecutionCoordinator, "readExecution">;
  readonly trustedNow: () => string;
}): Mp08bNativeProjectionSources {
  const readExecution = options.executionCoordinator
    ? async (input: Mp08bNativeExecutionReadRequestV1) =>
        options.executionCoordinator!.readExecution({
          durableExecutionId: input.durableExecutionId,
          sourceRequestId: input.sourceRequestId,
          actionIntentDigest: input.actionIntentDigest,
          actionIntentIdempotencyKey: input.actionIntentIdempotencyKey,
          ...(input.approvalId ? { approvalId: input.approvalId } : {}),
          ...(input.expectedNativeActionHash
            ? { expectedNativeActionHash: input.expectedNativeActionHash }
            : {}),
        })
    : options.readExecution;
  return {
    readBinding: (approvalId) => options.approvalRuntime.getApprovalBinding(approvalId),
    readApproval: (approvalId) => options.approvalRuntime.readApproval(approvalId),
    readApprovalPresentation: async (approvalId) =>
      (await options.approvalRuntime.refreshApproval(approvalId)).presentation,
    readQueue: (deliveryId) => {
      const delivery = options.queueRuntime.inspectDelivery(deliveryId);
      if (!delivery) return undefined;
      return queueForProjection(
        delivery,
        options.queueRuntime.inspectOutcome(delivery.work.workId),
        options.queueRuntime.listActivity(delivery.work.workId),
      );
    },
    ...(readExecution ? { readExecution } : {}),
    trustedNow: options.trustedNow,
  };
}

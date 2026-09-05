import {
  actionIntentCoreFromIntent,
  actionIntentDigest,
  actionIntentIdempotencyKey,
  canonicalizeJsonV1,
} from "../../../packages/action-compiler/src/index.js";
import {
  ActionIntentV1Schema,
  type ActionIntentV1,
} from "../../../packages/action-contracts/src/index.js";
import type {
  ActivityRecordV1,
  QueueApprovalReferenceV1,
  QueueDeliverySnapshotV1,
  QueueLogicalOutcomeV1,
  QueueOutcomeSnapshotV1,
  SchedulingClaimV1,
} from "../../../packages/background-work/src/index.js";
import { deterministicQueueIdentity } from "../../../packages/background-work/src/index.js";
import type { Mp04ExecutionResultV1 } from "../../../packages/execution-coordinator/src/index.js";
import type {
  Mp03AuthenticatedContext,
  MoiraeAdmissionResultV1,
} from "../../../packages/fates-adapter/src/index.js";
import { Mp03AuthenticatedContextSchema } from "../../../packages/fates-adapter/src/index.js";
import {
  ApprovalPresentationV1Schema,
  type ApprovalPresentationV1,
} from "../../../packages/human-approval/src/index.js";

export const MP07_PRODUCT_VIEW_VERSION = "mp07-product-view-v1" as const;

export type Mp07ProductCategoryV1 = "HANDLED_AUTOMATICALLY" | "NEEDS_YOU" | "BLOCKED" | "ACTIVITY";

export type Mp07ApprovalObservationStatusV1 =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED"
  | "CONSUMED"
  | "MISSING"
  | "INVALID"
  | "BOUNDARY_FAILURE";

export type Mp07ReasonCodeV1 =
  | "CONFIRMED_COMPLETION"
  | "INCONSISTENT_COMPLETION"
  | "MP03_REJECTED"
  | "MP03_BOUNDARY_FAILURE"
  | "APPROVAL_PENDING"
  | "APPROVAL_MISSING"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_REJECTED"
  | "APPROVAL_REVOKED"
  | "APPROVAL_CONSUMED"
  | "APPROVAL_INVALID"
  | "APPROVAL_BOUNDARY_FAILURE"
  | "INCONSISTENT_APPROVAL_STATE"
  | "MP04_UNKNOWN"
  | "MP04_RECOVERY_REQUIRED"
  | "MP04_BOUNDARY_FAILURE"
  | "EFFECT_ABSENT"
  | "RETRY_EXHAUSTED"
  | "BOUNDARY_BLOCKED"
  | "TERMINAL_FAILURE"
  | "RETRY_SCHEDULED"
  | "ACTIVE_PROCESSING";

export type Mp07BoundaryCodeV1 =
  | "INVALID_ACTION_INTENT"
  | "ACTION_INTENT_BINDING_MISMATCH"
  | "INVALID_AUTHENTICATED_CONTEXT"
  | "INVALID_APPROVAL_PRESENTATION"
  | "APPROVAL_PRESENTATION_BINDING_MISMATCH"
  | "INCONSISTENT_DURABLE_STATE";

export class Mp07ProductBoundaryError extends Error {
  constructor(
    public readonly code: Mp07BoundaryCodeV1,
    message: string,
  ) {
    super(message);
    this.name = "Mp07ProductBoundaryError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * This is a host observation, not a second approval schema or authority
 * source. Its values must be produced by the accepted MP-05 host boundary.
 */
export type Mp07ApprovalObservationV1 = Readonly<{
  readonly approvalId: string;
  readonly status: Mp07ApprovalObservationStatusV1;
  readonly decisionId?: string;
  readonly expiresAt?: string;
  readonly reasonCode?: string;
  readonly presentation?: ApprovalPresentationV1;
}>;

export type Mp07QueueObservationV1 = Readonly<{
  readonly delivery: QueueDeliverySnapshotV1;
  readonly outcome?: QueueOutcomeSnapshotV1;
  readonly claim?: SchedulingClaimV1;
  readonly activity: readonly ActivityRecordV1[];
}>;

/**
 * The only input boundary for the mapper. It contains host-observed material
 * and has no operations capable of changing Protocol state.
 */
export type Mp07ProductInputV1 = Readonly<{
  readonly actionIntent: unknown;
  readonly authenticatedContext?: unknown;
  readonly queue: Mp07QueueObservationV1;
  readonly admission?: MoiraeAdmissionResultV1;
  readonly execution?: Mp04ExecutionResultV1;
  readonly approval?: Mp07ApprovalObservationV1;
  readonly observedAt: string;
}>;

export type Mp07ExactActionV1 = Readonly<{
  readonly action: ActionIntentV1["action"];
  readonly effectClass: ActionIntentV1["effectClass"];
  readonly principal: ActionIntentV1["principal"];
  readonly requester: ActionIntentV1["requester"];
  readonly resource: ActionIntentV1["resource"];
  readonly target: ActionIntentV1["target"];
  readonly parameters: ActionIntentV1["parameters"];
}>;

export type Mp07ContextDisplayV1 = Readonly<{
  readonly authenticatedWorkloadId: string;
  readonly actingPrincipalId: string;
  readonly requesterId: string;
  readonly tenantId: string;
  readonly runtimeId: string;
  readonly runtimeInstanceId: string;
  readonly sessionId: string;
  readonly purpose: string;
  readonly policyVersion: string;
  readonly resourceScope: Record<string, unknown>;
}>;

export type Mp07ApprovalDisplayV1 = Readonly<{
  readonly approvalId: string;
  readonly status: Mp07ApprovalObservationStatusV1;
  readonly decisionId?: string;
  readonly expiresAt?: string;
  readonly presentationDigest?: string;
  readonly nativePresentationBindingHash?: string;
  readonly reasonCode?: string;
}>;

export type Mp07ActivityDisplayV1 = Readonly<{
  readonly activityId: string;
  readonly workId: string;
  readonly deliveryId: string;
  readonly state: ActivityRecordV1["state"];
  readonly observedAt: string;
  readonly workerId?: string;
  readonly claimId?: string;
  readonly generation?: number;
  readonly reason?: string;
  readonly admissionStatus?: ActivityRecordV1["admissionStatus"];
  readonly approvalId?: string;
  readonly decisionId?: string;
  readonly approvalObservationState?: QueueApprovalReferenceV1["observationState"];
  readonly durableExecutionId?: string;
  readonly mp04Status?: Mp04ExecutionResultV1["status"];
}>;

export type Mp07ProductEvidenceV1 = Readonly<{
  readonly sourceRequestId: string;
  readonly actionIntentDigest: string;
  readonly actionIntentIdempotencyKey: string;
  readonly admissionAuditId?: string;
  readonly nativeActionHash?: string;
  readonly approvalId?: string;
  readonly decisionId?: string;
  readonly durableExecutionId?: string;
  readonly claimId?: string;
  readonly generation?: number;
  readonly reconciliationRequired: boolean;
}>;

export type Mp07ProductViewV1 = Readonly<{
  readonly schemaVersion: typeof MP07_PRODUCT_VIEW_VERSION;
  readonly category: Mp07ProductCategoryV1;
  readonly work: Readonly<{
    readonly workId: string;
    readonly sourceRequestId: string;
    readonly actionIntentDigest: string;
    readonly actionIntentIdempotencyKey: string;
  }>;
  readonly action: Mp07ExactActionV1;
  readonly context?: Mp07ContextDisplayV1;
  readonly native: Readonly<{
    readonly queueState: QueueDeliverySnapshotV1["state"];
    readonly queueOutcome?: QueueLogicalOutcomeV1;
    readonly mp03Status?: MoiraeAdmissionResultV1["status"];
    readonly mp03Decision?: string;
    readonly mp04Status?: Mp04ExecutionResultV1["status"];
    readonly mp05ApprovalStatus?: Mp07ApprovalObservationStatusV1;
    readonly reasonCode?: Mp07ReasonCodeV1;
  }>;
  readonly approval?: Mp07ApprovalDisplayV1;
  readonly evidence: Mp07ProductEvidenceV1;
  readonly activity: readonly Mp07ActivityDisplayV1[];
  readonly freshness: Readonly<{
    readonly observedAt: string;
    readonly stateVersion?: number;
    readonly refetchRequired?: boolean;
  }>;
}>;

const MAX_ACTIVITY_RECORDS = 50;
const queueDeliveryStates = new Set<string>([
  "QUEUED",
  "AVAILABLE",
  "CLAIMED",
  "COMPLETED",
  "WAITING_FOR_APPROVAL",
  "DENIED",
  "BOUNDARY_BLOCKED",
  "TERMINAL_FAILURE",
  "RECONCILIATION_REQUIRED",
  "EFFECT_ABSENT",
  "RETRY_EXHAUSTED",
  "RETRY_SCHEDULED",
]);
const queueOutcomeStates = new Set<string>([
  "OPEN",
  "COMPLETED",
  "WAITING_FOR_APPROVAL",
  "DENIED",
  "BOUNDARY_BLOCKED",
  "TERMINAL_FAILURE",
  "RECONCILIATION_REQUIRED",
  "EFFECT_ABSENT",
  "RETRY_EXHAUSTED",
  "RETRY_SCHEDULED",
]);
const activityStates = new Set<string>([
  "QUEUED",
  "CLAIMED",
  "PROCESSING",
  "AUTHORITY_CHECKED",
  "WAITING_FOR_APPROVAL",
  "DENIED",
  "BOUNDARY_BLOCKED",
  "COMPLETED",
  "TERMINAL_FAILURE",
  "RETRY_SCHEDULED",
  "RECONCILIATION_REQUIRED",
  "EFFECT_ABSENT",
  "RETRY_EXHAUSTED",
  "LEASE_EXPIRED",
  "CLAIM_RECLAIMED",
]);
const approvalStatuses = new Set<string>([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
  "CONSUMED",
  "MISSING",
  "INVALID",
  "BOUNDARY_FAILURE",
]);

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireNonEmpty(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Mp07ProductBoundaryError("INCONSISTENT_DURABLE_STATE", `${label} is missing.`);
  return value;
}

function parseIntent(value: unknown): ActionIntentV1 {
  const parsed = ActionIntentV1Schema.safeParse(value);
  if (!parsed.success)
    throw new Mp07ProductBoundaryError(
      "INVALID_ACTION_INTENT",
      "The product view requires a canonical ActionIntentV1.",
    );
  const intent = parsed.data;
  let validIntegrity = false;
  try {
    const core = actionIntentCoreFromIntent(intent);
    validIntegrity =
      actionIntentDigest(core) !== intent.canonicalDigest ||
      actionIntentIdempotencyKey(intent.sourceRequestId, intent.canonicalDigest) !==
        intent.idempotencyKey;
  } catch {
    throw new Mp07ProductBoundaryError(
      "INVALID_ACTION_INTENT",
      "ActionIntent integrity material cannot be validated canonically.",
    );
  }
  if (validIntegrity)
    throw new Mp07ProductBoundaryError(
      "INVALID_ACTION_INTENT",
      "ActionIntent integrity material does not reproduce canonically.",
    );
  return intent;
}

function parseContext(value: unknown): Mp03AuthenticatedContext | undefined {
  if (value === undefined) return undefined;
  const parsed = Mp03AuthenticatedContextSchema.safeParse(value);
  if (!parsed.success)
    throw new Mp07ProductBoundaryError(
      "INVALID_AUTHENTICATED_CONTEXT",
      "The host context is not the accepted MP-03 authenticated context.",
    );
  return cloneJson(parsed.data);
}

function assertIdentityBinding(intent: ActionIntentV1, queue: Mp07QueueObservationV1): void {
  const work = queue.delivery.work;
  if (
    intent.sourceRequestId !== work.sourceRequestId ||
    intent.canonicalDigest !== work.actionIntentDigest ||
    intent.idempotencyKey !== work.actionIntentIdempotencyKey ||
    deterministicQueueIdentity.logicalWorkId(work.sourceRequestId, work.actionIntentDigest) !==
      work.workId
  )
    throw new Mp07ProductBoundaryError(
      "ACTION_INTENT_BINDING_MISMATCH",
      "Queue work does not bind to the canonical ActionIntent identities.",
    );
}

function assertSupportedObservedState(input: Mp07ProductInputV1): void {
  if (!queueDeliveryStates.has(input.queue.delivery.state))
    throw new Mp07ProductBoundaryError(
      "INCONSISTENT_DURABLE_STATE",
      "The queue delivery state is unsupported.",
    );
  if (input.queue.outcome && !queueOutcomeStates.has(input.queue.outcome.outcome))
    throw new Mp07ProductBoundaryError(
      "INCONSISTENT_DURABLE_STATE",
      "The queue outcome is unsupported.",
    );
  if (input.queue.outcome && input.queue.outcome.workId !== input.queue.delivery.work.workId)
    throw new Mp07ProductBoundaryError(
      "INCONSISTENT_DURABLE_STATE",
      "Queue outcome is bound to a different logical work item.",
    );
  if (input.approval && !approvalStatuses.has(input.approval.status))
    throw new Mp07ProductBoundaryError(
      "INCONSISTENT_DURABLE_STATE",
      "The approval observation status is unsupported.",
    );
  for (const record of input.queue.activity)
    if (!activityStates.has(record.state))
      throw new Mp07ProductBoundaryError(
        "INCONSISTENT_DURABLE_STATE",
        "An activity record has an unsupported state.",
      );
}

function assertPresentationBinding(
  intent: ActionIntentV1,
  approval: Mp07ApprovalObservationV1 | undefined,
): ApprovalPresentationV1 | undefined {
  if (!approval) return undefined;
  requireNonEmpty(approval.approvalId, "approvalId");
  if (!approval.presentation)
    if (approval.status === "PENDING")
      throw new Mp07ProductBoundaryError(
        "INVALID_APPROVAL_PRESENTATION",
        "A pending approval requires the current MP-05 presentation.",
      );
    else return undefined;
  const parsed = ApprovalPresentationV1Schema.safeParse(approval.presentation);
  if (!parsed.success)
    throw new Mp07ProductBoundaryError(
      "INVALID_APPROVAL_PRESENTATION",
      "The MP-05 approval presentation is not valid.",
    );
  const presentation = parsed.data;
  if (
    presentation.approvalId !== approval.approvalId ||
    presentation.action !== intent.action ||
    presentation.sourceRequestReference !== intent.sourceRequestId ||
    presentation.actionIntentDigest !== intent.canonicalDigest ||
    presentation.actionIntentIdempotencyKey !== intent.idempotencyKey ||
    canonicalizeJsonV1(presentation.resource) !== canonicalizeJsonV1(intent.resource) ||
    canonicalizeJsonV1(presentation.target) !== canonicalizeJsonV1(intent.target) ||
    canonicalizeJsonV1(presentation.parameters) !== canonicalizeJsonV1(intent.parameters)
  )
    throw new Mp07ProductBoundaryError(
      "APPROVAL_PRESENTATION_BINDING_MISMATCH",
      "The MP-05 presentation does not bind to the canonical ActionIntent.",
    );
  return presentation;
}

function actionDisplay(intent: ActionIntentV1): Mp07ExactActionV1 {
  return {
    action: intent.action,
    effectClass: intent.effectClass,
    principal: cloneJson(intent.principal),
    requester: cloneJson(intent.requester),
    resource: cloneJson(intent.resource),
    target: cloneJson(intent.target),
    parameters: cloneJson(intent.parameters),
  };
}

function contextDisplay(
  context: Mp03AuthenticatedContext | undefined,
): Mp07ContextDisplayV1 | undefined {
  if (!context) return undefined;
  return {
    authenticatedWorkloadId: context.authenticatedPrincipal.id,
    actingPrincipalId: context.actingPrincipal.id,
    requesterId: context.representedPrincipal.id,
    tenantId: context.tenantId,
    runtimeId: context.runtimeId,
    runtimeInstanceId: context.runtimeInstanceId,
    sessionId: context.sessionId,
    purpose: context.purpose,
    policyVersion: context.policyVersion,
    resourceScope: cloneJson(context.resourceScope),
  };
}

function approvalDisplay(
  approval: Mp07ApprovalObservationV1 | undefined,
  presentation: ApprovalPresentationV1 | undefined,
): Mp07ApprovalDisplayV1 | undefined {
  if (!approval) return undefined;
  return {
    approvalId: approval.approvalId,
    status: approval.status,
    ...(approval.decisionId ? { decisionId: approval.decisionId } : {}),
    ...(approval.expiresAt || presentation?.approvalExpiresAt
      ? { expiresAt: approval.expiresAt ?? presentation?.approvalExpiresAt }
      : {}),
    ...(presentation?.presentationDigest
      ? { presentationDigest: presentation.presentationDigest }
      : {}),
    ...(presentation?.nativePresentationBindingHash
      ? { nativePresentationBindingHash: presentation.nativePresentationBindingHash }
      : {}),
    ...(approval.reasonCode ? { reasonCode: approval.reasonCode } : {}),
  };
}

function activityDisplay(
  records: readonly ActivityRecordV1[],
  workId: string,
  sourceRequestId: string,
  actionIntentDigestValue: string,
): readonly Mp07ActivityDisplayV1[] {
  return records.slice(-MAX_ACTIVITY_RECORDS).map((record) => {
    if (
      record.workId !== workId ||
      record.sourceRequestId !== sourceRequestId ||
      record.actionIntentDigest !== actionIntentDigestValue
    )
      throw new Mp07ProductBoundaryError(
        "INCONSISTENT_DURABLE_STATE",
        "Activity record is bound to a different logical work item.",
      );
    return {
      activityId: record.activityId,
      workId: record.workId,
      deliveryId: record.deliveryId,
      state: record.state,
      observedAt: record.observedAt,
      ...(record.workerId ? { workerId: record.workerId } : {}),
      ...(record.claimId ? { claimId: record.claimId } : {}),
      ...(record.reason ? { reason: record.reason } : {}),
      ...(record.admissionStatus ? { admissionStatus: record.admissionStatus } : {}),
      ...(record.approvalId ? { approvalId: record.approvalId } : {}),
      ...(record.decisionId ? { decisionId: record.decisionId } : {}),
      ...(record.approvalObservationState
        ? { approvalObservationState: record.approvalObservationState }
        : {}),
      ...(record.durableExecutionId ? { durableExecutionId: record.durableExecutionId } : {}),
      ...(record.mp04Status ? { mp04Status: record.mp04Status } : {}),
    };
  });
}

function admissionDecision(admission: MoiraeAdmissionResultV1 | undefined): string | undefined {
  if (!admission || !("nativeDecision" in admission)) return undefined;
  return admission.nativeDecision;
}

function reasonForApproval(status: Mp07ApprovalObservationStatusV1): Mp07ReasonCodeV1 {
  switch (status) {
    case "PENDING":
      return "APPROVAL_PENDING";
    case "EXPIRED":
      return "APPROVAL_EXPIRED";
    case "REJECTED":
      return "APPROVAL_REJECTED";
    case "REVOKED":
      return "APPROVAL_REVOKED";
    case "CONSUMED":
      return "APPROVAL_CONSUMED";
    case "MISSING":
      return "APPROVAL_MISSING";
    case "INVALID":
      return "APPROVAL_INVALID";
    case "BOUNDARY_FAILURE":
      return "APPROVAL_BOUNDARY_FAILURE";
    case "APPROVED":
      return "INCONSISTENT_APPROVAL_STATE";
  }
}

function baseNative(input: Mp07ProductInputV1): Mp07ProductViewV1["native"] {
  const admission = input.admission;
  return {
    queueState: input.queue.delivery.state,
    ...(input.queue.outcome?.outcome ? { queueOutcome: input.queue.outcome.outcome } : {}),
    ...(admission?.status ? { mp03Status: admission.status } : {}),
    ...(admissionDecision(admission) ? { mp03Decision: admissionDecision(admission) } : {}),
    ...(input.execution?.status ? { mp04Status: input.execution.status } : {}),
    ...(input.approval?.status ? { mp05ApprovalStatus: input.approval.status } : {}),
  };
}

function categoryFor(input: Mp07ProductInputV1): {
  category: Mp07ProductCategoryV1;
  reasonCode: Mp07ReasonCodeV1;
  refetchRequired?: boolean;
} {
  const outcome = input.queue.outcome?.outcome;
  const state = input.queue.delivery.state;
  const executionStatus = input.execution?.status;
  const approvalStatus = input.approval?.status;

  if (outcome === "COMPLETED" || state === "COMPLETED") {
    if (executionStatus === "CONFIRMED")
      return { category: "HANDLED_AUTOMATICALLY", reasonCode: "CONFIRMED_COMPLETION" };
    if (executionStatus === "UNKNOWN")
      return { category: "BLOCKED", reasonCode: "MP04_UNKNOWN", refetchRequired: true };
    if (executionStatus === "RECOVERY_REQUIRED")
      return { category: "BLOCKED", reasonCode: "MP04_RECOVERY_REQUIRED", refetchRequired: true };
    if (executionStatus === "ABSENT") return { category: "BLOCKED", reasonCode: "EFFECT_ABSENT" };
    return { category: "BLOCKED", reasonCode: "INCONSISTENT_COMPLETION", refetchRequired: true };
  }

  if (outcome === "WAITING_FOR_APPROVAL" || state === "WAITING_FOR_APPROVAL") {
    if (approvalStatus === "PENDING")
      return { category: "NEEDS_YOU", reasonCode: "APPROVAL_PENDING" };
    if (approvalStatus)
      return { category: "BLOCKED", reasonCode: reasonForApproval(approvalStatus) };
    return { category: "BLOCKED", reasonCode: "APPROVAL_MISSING" };
  }

  if (outcome === "DENIED" || state === "DENIED")
    return { category: "BLOCKED", reasonCode: "MP03_REJECTED" };
  if (outcome === "BOUNDARY_BLOCKED" || state === "BOUNDARY_BLOCKED")
    return { category: "BLOCKED", reasonCode: "BOUNDARY_BLOCKED" };
  if (outcome === "TERMINAL_FAILURE" || state === "TERMINAL_FAILURE")
    return { category: "BLOCKED", reasonCode: "TERMINAL_FAILURE" };
  if (outcome === "RETRY_EXHAUSTED" || state === "RETRY_EXHAUSTED")
    return { category: "BLOCKED", reasonCode: "RETRY_EXHAUSTED" };
  if (outcome === "RECONCILIATION_REQUIRED" || state === "RECONCILIATION_REQUIRED")
    return { category: "BLOCKED", reasonCode: "MP04_UNKNOWN", refetchRequired: true };
  if (outcome === "EFFECT_ABSENT" || state === "EFFECT_ABSENT")
    return { category: "BLOCKED", reasonCode: "EFFECT_ABSENT" };

  if (input.admission?.status === "REJECTED")
    return { category: "BLOCKED", reasonCode: "MP03_REJECTED" };
  if (input.admission?.status === "BOUNDARY_FAILURE")
    return { category: "BLOCKED", reasonCode: "MP03_BOUNDARY_FAILURE" };
  if (input.approval && input.approval.status !== "PENDING" && input.approval.status !== "APPROVED")
    return { category: "BLOCKED", reasonCode: reasonForApproval(input.approval.status) };
  if (executionStatus === "UNKNOWN")
    return { category: "BLOCKED", reasonCode: "MP04_UNKNOWN", refetchRequired: true };
  if (executionStatus === "RECOVERY_REQUIRED")
    return { category: "BLOCKED", reasonCode: "MP04_RECOVERY_REQUIRED", refetchRequired: true };
  if (executionStatus === "ABSENT") return { category: "BLOCKED", reasonCode: "EFFECT_ABSENT" };
  if (state === "RETRY_SCHEDULED") return { category: "ACTIVITY", reasonCode: "RETRY_SCHEDULED" };
  return { category: "ACTIVITY", reasonCode: "ACTIVE_PROCESSING" };
}

function evidenceFor(input: Mp07ProductInputV1, intent: ActionIntentV1): Mp07ProductEvidenceV1 {
  const admission = input.admission;
  const execution = input.execution;
  const approval = input.approval;
  const claim = input.queue.claim ?? input.queue.delivery.claim;
  return {
    sourceRequestId: intent.sourceRequestId,
    actionIntentDigest: intent.canonicalDigest,
    actionIntentIdempotencyKey: intent.idempotencyKey,
    ...(admission && "evidence" in admission
      ? { admissionAuditId: admission.evidence.auditId }
      : {}),
    ...(admission && "nativeActionHash" in admission
      ? { nativeActionHash: admission.nativeActionHash }
      : {}),
    ...(approval ? { approvalId: approval.approvalId } : {}),
    ...(approval?.decisionId ? { decisionId: approval.decisionId } : {}),
    ...(execution?.durableExecutionId
      ? { durableExecutionId: execution.durableExecutionId }
      : input.queue.outcome?.mp04DurableExecutionId
        ? { durableExecutionId: input.queue.outcome.mp04DurableExecutionId }
        : {}),
    ...(claim?.claimId ? { claimId: claim.claimId } : {}),
    ...(claim ? { generation: claim.generation } : {}),
    reconciliationRequired:
      execution?.status === "UNKNOWN" ||
      execution?.status === "RECOVERY_REQUIRED" ||
      input.queue.outcome?.outcome === "RECONCILIATION_REQUIRED" ||
      input.queue.delivery.state === "RECONCILIATION_REQUIRED",
  };
}

/**
 * Convert trusted host observations into a bounded, deterministic product view.
 * This function never reads or mutates Protocol state and never creates
 * authority, approval, execution, retry, or reconciliation truth.
 */
export function buildMp07ProductView(input: Mp07ProductInputV1): Mp07ProductViewV1 {
  assertSupportedObservedState(input);
  const intent = parseIntent(input.actionIntent);
  assertIdentityBinding(intent, input.queue);
  const context = parseContext(input.authenticatedContext);
  const presentation = assertPresentationBinding(intent, input.approval);
  const classification = categoryFor(input);
  const work = input.queue.delivery.work;
  const claim = input.queue.claim ?? input.queue.delivery.claim;
  const native = {
    ...baseNative(input),
    reasonCode: classification.reasonCode,
  } satisfies Mp07ProductViewV1["native"];
  const approval = approvalDisplay(input.approval, presentation);

  requireNonEmpty(input.observedAt, "observedAt");
  return {
    schemaVersion: MP07_PRODUCT_VIEW_VERSION,
    category: classification.category,
    work: {
      workId: work.workId,
      sourceRequestId: work.sourceRequestId,
      actionIntentDigest: work.actionIntentDigest,
      actionIntentIdempotencyKey: work.actionIntentIdempotencyKey,
    },
    action: actionDisplay(intent),
    ...(context ? { context: contextDisplay(context) } : {}),
    native,
    ...(approval ? { approval } : {}),
    evidence: evidenceFor(input, intent),
    activity: activityDisplay(
      input.queue.activity,
      work.workId,
      work.sourceRequestId,
      work.actionIntentDigest,
    ),
    freshness: {
      observedAt: input.observedAt,
      ...(claim?.stateVersion !== undefined ? { stateVersion: claim.stateVersion } : {}),
      ...(classification.refetchRequired ? { refetchRequired: true } : {}),
    },
  };
}

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
  Mp05ApprovalRequestV1,
  Mp05RecoveryResultV1,
} from "../../human-approval/src/index.js";
import type {
  Mp03AuthenticatedContext,
  MoiraeAdmissionResultV1,
} from "../../fates-adapter/src/index.js";
import type { Mp04ExecutionResultV1 } from "../../execution-coordinator/src/index.js";

export const MP06B_QUEUE_WORK_VERSION = "mp06b-queue-work-v1" as const;
export const MP06B_CLAIM_VERSION = "mp06b-scheduling-claim-v1" as const;
export const MP06B_ACTIVITY_VERSION = "mp06b-activity-v1" as const;
export const MP06D_APPROVAL_REFERENCE_VERSION = "mp06d-approval-reference-v1" as const;

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
 * Queue-owned approval material is a bounded observation/reference only. It
 * is never accepted as approval authority; MP-05 durable truth is reread for
 * every recovery attempt.
 */
export type QueueApprovalReferenceV1 = Readonly<{
  schemaVersion: typeof MP06D_APPROVAL_REFERENCE_VERSION;
  approvalId: string;
  decisionId?: string;
  observationState:
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "EXPIRED"
    | "REVOKED"
    | "CONSUMED"
    | "MISSING"
    | "INVALID"
    | "BOUNDARY_FAILURE";
  observedAt: string;
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
  | "RECONCILIATION_REQUIRED"
  | "EFFECT_ABSENT"
  | "RETRY_EXHAUSTED"
  | "RETRY_SCHEDULED";

export type QueueLogicalOutcomeV1 =
  | "OPEN"
  | "COMPLETED"
  | "WAITING_FOR_APPROVAL"
  | "DENIED"
  | "BOUNDARY_BLOCKED"
  | "TERMINAL_FAILURE"
  | "RECONCILIATION_REQUIRED"
  | "EFFECT_ABSENT"
  | "RETRY_EXHAUSTED"
  | "RETRY_SCHEDULED";

export type QueueTerminalOutcomeV1 = Exclude<QueueLogicalOutcomeV1, "OPEN" | "RETRY_SCHEDULED">;

export type RetryFailureClassV1 = "TRANSIENT_COORDINATION" | "TRANSIENT_PRE_AUTHORITY";

export type SchedulingClaimV1 = Readonly<{
  schemaVersion: typeof MP06B_CLAIM_VERSION;
  workId: string;
  deliveryId: string;
  workerId: string;
  claimId: string;
  generation: number;
  claimedAt: string;
  expiresAt: string;
  stateVersion: number;
}>;

export type QueueDeliverySnapshotV1 = Readonly<{
  work: QueueWorkV1;
  state: QueueDeliveryStateV1;
  generation: number;
  availableAt?: string;
  claim?: SchedulingClaimV1;
  retryAttempt: number;
  retryBudget: number;
  lastFailureClass?: RetryFailureClassV1;
  approvalReference?: QueueApprovalReferenceV1;
}>;

export type QueueOutcomeSnapshotV1 = Readonly<{
  schemaVersion: typeof MP06B_QUEUE_WORK_VERSION;
  workId: string;
  outcome: QueueLogicalOutcomeV1;
  lastDeliveryId?: string;
  mp04DurableExecutionId?: string;
  observedAt?: string;
  retryAttempt: number;
  retryBudget: number;
  nextEligibleAt?: string;
  lastFailureClass?: RetryFailureClassV1;
  approvalReference?: QueueApprovalReferenceV1;
}>;

export type QueueAcquireResultV1 =
  | Readonly<{ status: "CLAIMED"; claim: SchedulingClaimV1; reclaimed: boolean }>
  | Readonly<{
      status: "REJECTED";
      reason:
        | "NOT_FOUND"
        | "NOT_AVAILABLE"
        | "ALREADY_CLAIMED"
        | "LEASE_ACTIVE"
        | "DELIVERY_TERMINAL"
        | "LOGICAL_TERMINAL"
        | "NOT_YET_AVAILABLE"
        | "INVALID_CLAIM_ID"
        | "STORE_BUSY";
    }>;

export type QueueEnqueueResultV1 = Readonly<{
  status: "ENQUEUED" | "DUPLICATE_DELIVERY" | "DUPLICATE_LOGICAL_WORK";
  work: QueueWorkV1;
}>;

export type QueueReleaseResultV1 = Readonly<{
  status: "RELEASED" | "RETRY_SCHEDULED" | "RETRY_LIMIT_REACHED";
  delivery: QueueDeliverySnapshotV1;
  retryAttempt: number;
  retryBudget: number;
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
  | "EFFECT_ABSENT"
  | "RETRY_EXHAUSTED"
  | "LEASE_EXPIRED"
  | "CLAIM_RECLAIMED";

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
  decisionId?: string;
  approvalObservationState?: QueueApprovalReferenceV1["observationState"];
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

function addTrustedMilliseconds(value: string, milliseconds: number): string {
  if (!validTimestamp(value) || !Number.isSafeInteger(milliseconds) || milliseconds < 0)
    throw new TypeError("Trusted time arithmetic requires a valid non-negative duration.");
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

export interface TrustedTimeSource {
  now(): string;
}

function trustedNow(clock: TrustedTimeSource | undefined, supplied: string): string {
  const value = clock ? clock.now() : supplied;
  if (!validTimestamp(value)) throw new TypeError("A trusted UTC time is required.");
  return new Date(Date.parse(value)).toISOString();
}

function normalizedTimestamp(value: string): string {
  if (!validTimestamp(value)) throw new TypeError("A valid trusted UTC timestamp is required.");
  return new Date(Date.parse(value)).toISOString();
}

function validDigest(value: string): boolean {
  return digestPattern.test(value);
}

function requireIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200)
    throw new TypeError(`${label} must be a non-empty bounded identifier.`);
}

function assertApprovalReference(reference: QueueApprovalReferenceV1): void {
  if (
    reference.schemaVersion !== MP06D_APPROVAL_REFERENCE_VERSION ||
    typeof reference.approvalId !== "string" ||
    reference.approvalId.trim().length === 0 ||
    reference.approvalId.length > 200 ||
    !validTimestamp(reference.observedAt) ||
    (reference.decisionId !== undefined &&
      (typeof reference.decisionId !== "string" ||
        reference.decisionId.trim().length === 0 ||
        reference.decisionId.length > 200))
  )
    throw new TypeError("Approval correlation reference is malformed.");
  if (
    ![
      "PENDING",
      "APPROVED",
      "REJECTED",
      "EXPIRED",
      "REVOKED",
      "CONSUMED",
      "MISSING",
      "INVALID",
      "BOUNDARY_FAILURE",
    ].includes(reference.observationState)
  )
    throw new TypeError("Approval correlation observation state is invalid.");
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
    claim.claimedAt !== expected.claimedAt ||
    claim.expiresAt !== expected.expiresAt ||
    claim.stateVersion !== expected.stateVersion
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
  stateVersion: number;
};

type InternalLogicalWork = {
  work: QueueWorkV1;
  outcome: QueueLogicalOutcomeV1;
  deliveryIds: Set<string>;
  lastDeliveryId?: string;
  mp04DurableExecutionId?: string;
  observedAt?: string;
  retryAttempt: number;
  retryBudget: number;
  nextEligibleAt?: string;
  lastFailureClass?: RetryFailureClassV1;
  approvalReference?: QueueApprovalReferenceV1;
};

export interface LocalQueueOptions {
  readonly identity?: QueueIdentityDeriver;
  readonly maxExplicitReleases?: number;
  readonly retryBudget?: number;
  readonly leaseDurationMs?: number;
  readonly clock?: TrustedTimeSource;
}

export interface LocalQueuePort {
  enqueue(work: QueueWorkV1): QueueEnqueueResultV1;
  makeAvailable(deliveryId: string, availableAt: string): QueueDeliverySnapshotV1;
  acquire(input: {
    readonly deliveryId: string;
    readonly workerId: string;
    readonly claimId: string;
    readonly now: string;
  }): QueueAcquireResultV1;
  complete(input: {
    readonly claim: SchedulingClaimV1;
    readonly outcome: QueueTerminalOutcomeV1;
    readonly observedAt: string;
    readonly mp04DurableExecutionId?: string;
    readonly approvalReference?: QueueApprovalReferenceV1;
  }): QueueDeliverySnapshotV1;
  parkForApproval(input: {
    readonly claim: SchedulingClaimV1;
    readonly approvalId: string;
    readonly observedAt: string;
  }): QueueDeliverySnapshotV1;
  release(input: {
    readonly claim: SchedulingClaimV1;
    readonly availableAt: string;
    readonly retryEligible: boolean;
    readonly failureClass?: RetryFailureClassV1;
  }): QueueReleaseResultV1;
  inspectDelivery(deliveryId: string): QueueDeliverySnapshotV1 | undefined;
  inspectOutcome(workId: string): QueueOutcomeSnapshotV1 | undefined;
}

export type QueueDurableStateV1 = Readonly<{
  schemaVersion: "mp06c-durable-queue-state-v1";
  logical: Readonly<
    Record<
      string,
      Readonly<{
        work: QueueWorkV1;
        outcome: QueueLogicalOutcomeV1;
        deliveryIds: readonly string[];
        lastDeliveryId?: string;
        mp04DurableExecutionId?: string;
        observedAt?: string;
        retryAttempt: number;
        retryBudget: number;
        nextEligibleAt?: string;
        lastFailureClass?: RetryFailureClassV1;
        approvalReference?: QueueApprovalReferenceV1;
      }>
    >
  >;
  deliveries: Readonly<
    Record<
      string,
      Readonly<{
        work: QueueWorkV1;
        state: QueueDeliveryStateV1;
        generation: number;
        availableAt?: string;
        claim?: SchedulingClaimV1;
        releaseCount: number;
        stateVersion: number;
      }>
    >
  >;
}>;

/**
 * Small deterministic queue backend for MP-06B tests and local orchestration.
 * It arbitrates processing ownership only; it has no authority or effect API.
 */
export class InMemoryLocalQueue implements LocalQueuePort {
  private readonly identity: QueueIdentityDeriver;
  private readonly maxExplicitReleases: number;
  private readonly retryBudget: number;
  private readonly leaseDurationMs: number;
  private readonly clock?: TrustedTimeSource;
  private readonly logical = new Map<string, InternalLogicalWork>();
  private readonly deliveries = new Map<string, InternalDelivery>();

  constructor(options: LocalQueueOptions = {}, state?: QueueDurableStateV1) {
    this.identity = options.identity ?? deterministicQueueIdentity;
    this.maxExplicitReleases = options.maxExplicitReleases ?? options.retryBudget ?? 2;
    this.retryBudget = options.retryBudget ?? 2;
    this.leaseDurationMs = options.leaseDurationMs ?? 1_000;
    this.clock = options.clock;
    if (!Number.isSafeInteger(this.maxExplicitReleases) || this.maxExplicitReleases < 0)
      throw new TypeError("maxExplicitReleases must be a non-negative safe integer.");
    if (!Number.isSafeInteger(this.retryBudget) || this.retryBudget < 0)
      throw new TypeError("retryBudget must be a non-negative safe integer.");
    if (!Number.isSafeInteger(this.leaseDurationMs) || this.leaseDurationMs <= 0)
      throw new TypeError("leaseDurationMs must be a positive safe integer.");
    if (state) this.importState(state);
  }

  static fromState(
    state: QueueDurableStateV1,
    options: LocalQueueOptions = {},
  ): InMemoryLocalQueue {
    return new InMemoryLocalQueue(options, state);
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
        stateVersion: 0,
      });
      existing.lastDeliveryId = work.deliveryId;
      return { status: "DUPLICATE_LOGICAL_WORK", work: clone(work) };
    }

    this.logical.set(work.workId, {
      work: clone(work),
      outcome: "OPEN",
      deliveryIds: new Set([work.deliveryId]),
      lastDeliveryId: work.deliveryId,
      retryAttempt: 0,
      retryBudget: this.retryBudget,
    });
    this.deliveries.set(work.deliveryId, {
      work: clone(work),
      state: "QUEUED",
      generation: 0,
      releaseCount: 0,
      stateVersion: 0,
    });
    return { status: "ENQUEUED", work: clone(work) };
  }

  makeAvailable(deliveryId: string, availableAt: string): QueueDeliverySnapshotV1 {
    const trustedAvailableAt = normalizedTimestamp(availableAt);
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) throw new Error("Queue delivery was not found.");
    if (
      delivery.state === "QUEUED" ||
      delivery.state === "RETRY_SCHEDULED" ||
      delivery.state === "WAITING_FOR_APPROVAL"
    ) {
      delivery.state = "AVAILABLE";
      delivery.availableAt = trustedAvailableAt;
      delivery.stateVersion += 1;
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
    const now = trustedNow(this.clock, input.now);
    const delivery = this.deliveries.get(input.deliveryId);
    if (!delivery) return { status: "REJECTED", reason: "NOT_FOUND" };
    const logical = this.logical.get(delivery.work.workId);
    if (!logical) throw new Error("Queue logical work disappeared during claim acquisition.");
    let reclaimed = false;
    if (delivery.state === "CLAIMED") {
      if (!delivery.claim || Date.parse(delivery.claim.expiresAt) > Date.parse(now))
        return { status: "REJECTED", reason: "ALREADY_CLAIMED" };
      delivery.state = "AVAILABLE";
      delivery.claim = undefined;
      delivery.stateVersion += 1;
      reclaimed = true;
    }
    if (delivery.state !== "AVAILABLE") {
      if (
        delivery.state === "COMPLETED" ||
        delivery.state === "DENIED" ||
        delivery.state === "BOUNDARY_BLOCKED" ||
        delivery.state === "TERMINAL_FAILURE" ||
        delivery.state === "EFFECT_ABSENT" ||
        delivery.state === "RETRY_EXHAUSTED"
      )
        return { status: "REJECTED", reason: "DELIVERY_TERMINAL" };
      return { status: "REJECTED", reason: "NOT_AVAILABLE" };
    }
    if (
      logical.outcome === "DENIED" ||
      logical.outcome === "BOUNDARY_BLOCKED" ||
      logical.outcome === "RETRY_EXHAUSTED" ||
      logical.outcome === "EFFECT_ABSENT"
    )
      return { status: "REJECTED", reason: "LOGICAL_TERMINAL" };
    if (delivery.availableAt && Date.parse(delivery.availableAt) > Date.parse(now))
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
    const stateVersion = delivery.stateVersion + 1;
    const claim: SchedulingClaimV1 = {
      schemaVersion: MP06B_CLAIM_VERSION,
      workId: delivery.work.workId,
      deliveryId: delivery.work.deliveryId,
      workerId: input.workerId,
      claimId: input.claimId,
      generation,
      claimedAt: now,
      expiresAt: addTrustedMilliseconds(now, this.leaseDurationMs),
      stateVersion,
    };
    delivery.generation = generation;
    delivery.stateVersion = stateVersion;
    delivery.claim = claim;
    delivery.state = "CLAIMED";
    return { status: "CLAIMED", claim: clone(claim), reclaimed };
  }

  complete(input: {
    readonly claim: SchedulingClaimV1;
    readonly outcome: QueueTerminalOutcomeV1;
    readonly observedAt: string;
    readonly mp04DurableExecutionId?: string;
    readonly approvalReference?: QueueApprovalReferenceV1;
  }): QueueDeliverySnapshotV1 {
    const observedAt = trustedNow(this.clock, input.observedAt);
    const delivery = this.deliveries.get(input.claim.deliveryId);
    if (!delivery || !delivery.claim) throw new Error("No active scheduling claim exists.");
    assertClaim(input.claim, delivery.claim);
    if (
      ![
        "COMPLETED",
        "WAITING_FOR_APPROVAL",
        "DENIED",
        "BOUNDARY_BLOCKED",
        "TERMINAL_FAILURE",
        "RECONCILIATION_REQUIRED",
        "EFFECT_ABSENT",
        "RETRY_EXHAUSTED",
      ].includes(input.outcome)
    )
      throw new Error("Queue completion requires a terminal state-machine outcome.");
    delivery.state = terminalDeliveryState(input.outcome);
    delivery.claim = undefined;
    delivery.stateVersion += 1;
    const logical = this.logical.get(delivery.work.workId);
    if (!logical) throw new Error("Queue logical work disappeared during completion.");
    if (input.approvalReference) assertApprovalReference(input.approvalReference);
    logical.outcome = input.outcome;
    logical.lastDeliveryId = delivery.work.deliveryId;
    logical.observedAt = observedAt;
    logical.nextEligibleAt = undefined;
    if (input.mp04DurableExecutionId) logical.mp04DurableExecutionId = input.mp04DurableExecutionId;
    if (input.approvalReference) logical.approvalReference = clone(input.approvalReference);
    return this.snapshot(delivery);
  }

  parkForApproval(input: {
    readonly claim: SchedulingClaimV1;
    readonly approvalId: string;
    readonly observedAt: string;
  }): QueueDeliverySnapshotV1 {
    const observedAt = trustedNow(this.clock, input.observedAt);
    requireIdentifier(input.approvalId, "approvalId");
    const delivery = this.deliveries.get(input.claim.deliveryId);
    if (!delivery || !delivery.claim) throw new Error("No active scheduling claim exists.");
    assertClaim(input.claim, delivery.claim);
    const logical = this.logical.get(delivery.work.workId);
    if (!logical) throw new Error("Queue logical work disappeared while parking approval.");
    if (logical.approvalReference && logical.approvalReference.approvalId !== input.approvalId)
      throw new Error("Approval correlation cannot change for one logical work item.");
    const approvalReference: QueueApprovalReferenceV1 = {
      schemaVersion: MP06D_APPROVAL_REFERENCE_VERSION,
      approvalId: input.approvalId,
      observationState: "PENDING",
      observedAt,
    };
    delivery.state = "WAITING_FOR_APPROVAL";
    delivery.claim = undefined;
    delivery.availableAt = observedAt;
    delivery.stateVersion += 1;
    logical.outcome = "WAITING_FOR_APPROVAL";
    logical.lastDeliveryId = delivery.work.deliveryId;
    logical.observedAt = observedAt;
    logical.nextEligibleAt = undefined;
    logical.approvalReference = approvalReference;
    return this.snapshot(delivery);
  }

  release(input: {
    readonly claim: SchedulingClaimV1;
    readonly availableAt: string;
    readonly retryEligible: boolean;
    readonly failureClass?: RetryFailureClassV1;
  }): QueueReleaseResultV1 {
    const availableAt = normalizedTimestamp(input.availableAt);
    const delivery = this.deliveries.get(input.claim.deliveryId);
    if (!delivery || !delivery.claim) throw new Error("No active scheduling claim exists.");
    assertClaim(input.claim, delivery.claim);
    const logical = this.logical.get(delivery.work.workId);
    if (!logical) throw new Error("Queue logical work disappeared during release.");

    if (input.retryEligible) {
      if (!input.failureClass)
        throw new TypeError("Retry eligibility requires a typed failure class.");
      if (
        logical.retryAttempt >= logical.retryBudget ||
        delivery.releaseCount >= this.maxExplicitReleases
      ) {
        delivery.state = "RETRY_EXHAUSTED";
        delivery.claim = undefined;
        delivery.stateVersion += 1;
        logical.outcome = "RETRY_EXHAUSTED";
        logical.lastFailureClass = input.failureClass;
        logical.observedAt = availableAt;
        return {
          status: "RETRY_LIMIT_REACHED",
          delivery: this.snapshot(delivery),
          retryAttempt: logical.retryAttempt,
          retryBudget: logical.retryBudget,
        };
      }
      delivery.releaseCount += 1;
      logical.retryAttempt += 1;
      delivery.state = "RETRY_SCHEDULED";
      logical.outcome = "RETRY_SCHEDULED";
      logical.lastFailureClass = input.failureClass;
      logical.nextEligibleAt = availableAt;
      delivery.availableAt = availableAt;
      delivery.claim = undefined;
      delivery.stateVersion += 1;
      return {
        status: "RETRY_SCHEDULED",
        delivery: this.snapshot(delivery),
        retryAttempt: logical.retryAttempt,
        retryBudget: logical.retryBudget,
      };
    }

    delivery.state = "AVAILABLE";
    delivery.availableAt = availableAt;
    delivery.claim = undefined;
    delivery.stateVersion += 1;
    return {
      status: "RELEASED",
      delivery: this.snapshot(delivery),
      retryAttempt: logical.retryAttempt,
      retryBudget: logical.retryBudget,
    };
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
      retryAttempt: logical.retryAttempt,
      retryBudget: logical.retryBudget,
      ...(logical.nextEligibleAt ? { nextEligibleAt: logical.nextEligibleAt } : {}),
      ...(logical.lastFailureClass ? { lastFailureClass: logical.lastFailureClass } : {}),
      ...(logical.approvalReference ? { approvalReference: clone(logical.approvalReference) } : {}),
    };
  }

  exportState(): QueueDurableStateV1 {
    const logical: Record<string, QueueDurableStateV1["logical"][string]> = {};
    for (const [workId, value] of this.logical.entries()) {
      logical[workId] = {
        work: clone(value.work),
        outcome: value.outcome,
        deliveryIds: [...value.deliveryIds],
        ...(value.lastDeliveryId ? { lastDeliveryId: value.lastDeliveryId } : {}),
        ...(value.mp04DurableExecutionId
          ? { mp04DurableExecutionId: value.mp04DurableExecutionId }
          : {}),
        ...(value.observedAt ? { observedAt: value.observedAt } : {}),
        retryAttempt: value.retryAttempt,
        retryBudget: value.retryBudget,
        ...(value.nextEligibleAt ? { nextEligibleAt: value.nextEligibleAt } : {}),
        ...(value.lastFailureClass ? { lastFailureClass: value.lastFailureClass } : {}),
        ...(value.approvalReference ? { approvalReference: clone(value.approvalReference) } : {}),
      };
    }
    const deliveries: Record<string, QueueDurableStateV1["deliveries"][string]> = {};
    for (const [deliveryId, value] of this.deliveries.entries()) {
      deliveries[deliveryId] = {
        work: clone(value.work),
        state: value.state,
        generation: value.generation,
        ...(value.availableAt ? { availableAt: value.availableAt } : {}),
        ...(value.claim ? { claim: clone(value.claim) } : {}),
        releaseCount: value.releaseCount,
        stateVersion: value.stateVersion,
      };
    }
    return { schemaVersion: "mp06c-durable-queue-state-v1", logical, deliveries };
  }

  private snapshot(delivery: InternalDelivery): QueueDeliverySnapshotV1 {
    return {
      work: clone(delivery.work),
      state: delivery.state,
      generation: delivery.generation,
      ...(delivery.availableAt ? { availableAt: delivery.availableAt } : {}),
      ...(delivery.claim ? { claim: clone(delivery.claim) } : {}),
      retryAttempt: this.logical.get(delivery.work.workId)?.retryAttempt ?? 0,
      retryBudget: this.logical.get(delivery.work.workId)?.retryBudget ?? this.retryBudget,
      ...(this.logical.get(delivery.work.workId)?.lastFailureClass
        ? { lastFailureClass: this.logical.get(delivery.work.workId)?.lastFailureClass }
        : {}),
      ...(this.logical.get(delivery.work.workId)?.approvalReference
        ? { approvalReference: clone(this.logical.get(delivery.work.workId)?.approvalReference) }
        : {}),
    };
  }

  private importState(state: QueueDurableStateV1): void {
    validateQueueDurableState(state);
    for (const value of Object.values(state.logical)) {
      if (value.retryBudget !== this.retryBudget)
        throw new Error("MP-06C durable retry budget does not match local policy.");
      for (const deliveryId of value.deliveryIds) {
        if (
          !state.deliveries[deliveryId] ||
          state.deliveries[deliveryId].work.workId !== value.work.workId
        )
          throw new Error("MP-06C durable delivery index is inconsistent.");
      }
    }
    for (const [workId, value] of Object.entries(state.logical)) {
      this.logical.set(workId, {
        work: clone(value.work),
        outcome: value.outcome,
        deliveryIds: new Set(value.deliveryIds),
        ...(value.lastDeliveryId ? { lastDeliveryId: value.lastDeliveryId } : {}),
        ...(value.mp04DurableExecutionId
          ? { mp04DurableExecutionId: value.mp04DurableExecutionId }
          : {}),
        ...(value.observedAt ? { observedAt: value.observedAt } : {}),
        retryAttempt: value.retryAttempt,
        retryBudget: value.retryBudget,
        ...(value.nextEligibleAt ? { nextEligibleAt: value.nextEligibleAt } : {}),
        ...(value.lastFailureClass ? { lastFailureClass: value.lastFailureClass } : {}),
        ...(value.approvalReference ? { approvalReference: clone(value.approvalReference) } : {}),
      });
    }
    for (const [deliveryId, value] of Object.entries(state.deliveries)) {
      this.deliveries.set(deliveryId, {
        work: clone(value.work),
        state: value.state,
        generation: value.generation,
        ...(value.availableAt ? { availableAt: value.availableAt } : {}),
        ...(value.claim ? { claim: clone(value.claim) } : {}),
        releaseCount: value.releaseCount,
        stateVersion: value.stateVersion,
      });
    }
  }
}

function validateQueueDurableState(state: QueueDurableStateV1): void {
  if (!state || state.schemaVersion !== "mp06c-durable-queue-state-v1")
    throw new Error("Unsupported or malformed MP-06C durable queue schema.");
  if (
    !state.logical ||
    !state.deliveries ||
    typeof state.logical !== "object" ||
    typeof state.deliveries !== "object"
  )
    throw new Error("MP-06C durable queue state is missing its identity maps.");
  for (const [workId, value] of Object.entries(state.logical)) {
    assertQueueWork(value.work, deterministicQueueIdentity);
    if (workId !== value.work.workId)
      throw new Error("MP-06C durable logical work key does not match its work identity.");
    if (
      !Array.isArray(value.deliveryIds) ||
      !Number.isSafeInteger(value.retryAttempt) ||
      value.retryAttempt < 0
    )
      throw new Error("MP-06C durable retry state is malformed.");
    if (
      !Number.isSafeInteger(value.retryBudget) ||
      value.retryBudget < 0 ||
      value.retryAttempt > value.retryBudget
    )
      throw new Error("MP-06C durable retry budget is invalid.");
    if (value.nextEligibleAt && !validTimestamp(value.nextEligibleAt))
      throw new Error("MP-06C durable retry time is invalid.");
    if (value.approvalReference) assertApprovalReference(value.approvalReference);
  }
  for (const [deliveryId, value] of Object.entries(state.deliveries)) {
    assertQueueWork(value.work, deterministicQueueIdentity);
    if (deliveryId !== value.work.deliveryId || !state.logical[value.work.workId])
      throw new Error("MP-06C durable delivery identity is not bound to logical work.");
    if (!Number.isSafeInteger(value.generation) || value.generation < 0)
      throw new Error("MP-06C durable generation is invalid.");
    if (!Number.isSafeInteger(value.releaseCount) || value.releaseCount < 0)
      throw new Error("MP-06C durable release count is invalid.");
    if (value.releaseCount > state.logical[value.work.workId].retryBudget)
      throw new Error("MP-06C durable release count exceeds the logical retry budget.");
    if (!Number.isSafeInteger(value.stateVersion) || value.stateVersion < 0)
      throw new Error("MP-06C durable state version is invalid.");
    if (value.availableAt && !validTimestamp(value.availableAt))
      throw new Error("MP-06C durable availability time is invalid.");
    if (value.state === "CLAIMED" && !value.claim)
      throw new Error("MP-06C durable claimed state has no scheduling claim.");
    if (value.claim) {
      if (
        value.claim.schemaVersion !== MP06B_CLAIM_VERSION ||
        !validTimestamp(value.claim.claimedAt) ||
        !validTimestamp(value.claim.expiresAt) ||
        !Number.isSafeInteger(value.claim.generation) ||
        value.claim.generation < 1 ||
        !Number.isSafeInteger(value.claim.stateVersion) ||
        value.claim.stateVersion < 1
      )
        throw new Error("MP-06C durable scheduling claim is malformed.");
      if (
        value.claim.workId !== value.work.workId ||
        value.claim.deliveryId !== value.work.deliveryId ||
        value.claim.generation !== value.generation ||
        value.claim.stateVersion !== value.stateVersion ||
        value.state !== "CLAIMED"
      )
        throw new Error("MP-06C durable scheduling claim binding is invalid.");
    }
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
  recoverActionExecution?(input: unknown): Promise<Mp04ExecutionResultV1>;
}

/** Exact accepted MP-05 public surface used by background recovery. */
export type Mp05ApprovalPort = Readonly<{
  prepareApproval(request: Mp05ApprovalRequestV1): Promise<unknown>;
  recoverOrRefresh(input: {
    readonly intent: unknown;
    readonly authenticatedContext: unknown;
    readonly approvalId: string;
  }): Promise<Mp05RecoveryResultV1>;
}>;

export type WorkerCheckpointV1 =
  | "BEFORE_CLAIM"
  | "AFTER_CLAIM_PERSISTED"
  | "BEFORE_MP03"
  | "AFTER_MP03_ADMITTED"
  | "BEFORE_MP04"
  | "AFTER_MP04_CONFIRMED_BEFORE_QUEUE_COMPLETION"
  | "AFTER_TERMINAL_QUEUE_PERSISTENCE"
  | "AFTER_RETRY_STATE_PERSISTENCE";

export interface WorkerFailureInjector {
  checkpoint(point: WorkerCheckpointV1): void;
}

export class InjectedWorkerCrash extends Error {
  readonly checkpoint: WorkerCheckpointV1;

  constructor(checkpoint: WorkerCheckpointV1) {
    super(`Injected worker crash at ${checkpoint}.`);
    this.name = "InjectedWorkerCrash";
    this.checkpoint = checkpoint;
  }
}

export class Mp06RetryableFailure extends Error {
  readonly failureClass: RetryFailureClassV1;

  constructor(failureClass: RetryFailureClassV1, message: string) {
    super(message);
    this.name = "Mp06RetryableFailure";
    this.failureClass = failureClass;
  }
}

function isInjectedWorkerCrash(error: unknown): error is InjectedWorkerCrash {
  return error instanceof InjectedWorkerCrash;
}

function retryFailureClass(error: unknown): RetryFailureClassV1 | undefined {
  return error instanceof Mp06RetryableFailure ? error.failureClass : undefined;
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
  | "completed"
  | "waiting"
  | "denied"
  | "blocked"
  | "retry-eligible"
  | "retry-exhausted"
  | "reconciliation-required"
  | "effect-absent"
  | "terminal"
  | "claim-rejected";

export type Mp06WorkerResultV1 = Readonly<{
  status: Mp06WorkerStatusV1;
  workId: string;
  deliveryId: string;
  queueOutcome?: QueueLogicalOutcomeV1;
  reason?: string;
  mp04Status?: Mp04ExecutionResultV1["status"];
  retryEligible?: boolean;
  retryAttempt?: number;
  retryBudget?: number;
  reclaimed?: boolean;
}>;

export class DeterministicLocalWorker {
  private readonly identity: QueueIdentityDeriver;

  constructor(
    private readonly options: {
      readonly queue: LocalQueuePort;
      readonly protocol: TrustedProtocolBoundary;
      readonly admission: Mp03AdmissionPort;
      readonly execution: Mp04ExecutionPort;
      readonly approval?: Mp05ApprovalPort;
      readonly activity: ActivitySink;
      readonly identity?: QueueIdentityDeriver;
      readonly clock?: TrustedTimeSource;
      readonly failureInjector?: WorkerFailureInjector;
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
    const now = trustedNow(this.options.clock, input.now);
    this.checkpoint("BEFORE_CLAIM");
    const delivery = this.options.queue.inspectDelivery(input.deliveryId);
    if (!delivery) {
      return {
        status: "claim-rejected",
        workId: "unknown",
        deliveryId: input.deliveryId,
        reason: "NOT_FOUND",
      };
    }
    const claimResult = this.options.queue.acquire({ ...input, now });
    if (claimResult.status !== "CLAIMED") {
      return {
        status: "claim-rejected",
        workId: delivery.work.workId,
        deliveryId: input.deliveryId,
        reason: claimResult.reason,
      };
    }
    const { claim } = claimResult;
    if (claimResult.reclaimed)
      this.appendActivity(delivery.work, claim, "LEASE_EXPIRED", now, {
        reason: "A prior scheduling lease expired and was reclaimed.",
      });
    this.appendActivity(
      delivery.work,
      claim,
      claimResult.reclaimed ? "CLAIM_RECLAIMED" : "CLAIMED",
      now,
    );
    this.appendActivity(delivery.work, claim, "PROCESSING", now);
    this.checkpoint("AFTER_CLAIM_PERSISTED");

    let verified: VerifiedProtocolMaterial;
    try {
      const material = await this.options.protocol.load({
        sourceRequestId: delivery.work.sourceRequestId,
        actionIntentDigest: delivery.work.actionIntentDigest,
        actionIntentIdempotencyKey: delivery.work.actionIntentIdempotencyKey,
      });
      verified = verifyProtocolBinding(delivery.work, material, this.identity);
    } catch (error) {
      if (isInjectedWorkerCrash(error)) throw error;
      const failureClass = retryFailureClass(error);
      if (failureClass)
        return this.scheduleRetry(
          delivery.work,
          claim,
          now,
          failureClass,
          error instanceof Error ? error.message : "Typed pre-authority failure.",
        );
      return this.finishBlocked(
        delivery.work,
        claim,
        now,
        error instanceof Error ? error.message : "ActionIntent binding failed.",
      );
    }

    this.checkpoint("BEFORE_MP03");

    const priorOutcome = this.options.queue.inspectOutcome(delivery.work.workId);
    if (priorOutcome?.outcome === "RECONCILIATION_REQUIRED")
      return this.recoverReconciliation(delivery.work, claim, verified, now, priorOutcome);
    if (priorOutcome?.outcome === "WAITING_FOR_APPROVAL" && this.options.approval) {
      if (!priorOutcome.approvalReference)
        return this.finishBlocked(
          delivery.work,
          claim,
          now,
          "Waiting work has no durable MP-05 approval correlation reference.",
        );
      return this.recoverApproval(
        delivery.work,
        claim,
        verified,
        now,
        priorOutcome.approvalReference,
      );
    }

    let admission: MoiraeAdmissionResultV1;
    try {
      // No approvalId or prior result is accepted from queue material. MP-03
      // must observe the current authority boundary on every delivery.
      admission = await this.options.admission.admitActionIntent({
        intent: verified.intent,
        authenticatedContext: verified.authenticatedContext,
        now,
      });
    } catch (error) {
      if (isInjectedWorkerCrash(error)) throw error;
      const failureClass = retryFailureClass(error);
      if (failureClass)
        return this.scheduleRetry(
          delivery.work,
          claim,
          now,
          failureClass,
          error instanceof Error ? error.message : "Typed pre-authority failure.",
        );
      return this.finishBlocked(
        delivery.work,
        claim,
        now,
        error instanceof Error ? error.message : "MP-03 admission failed closed.",
      );
    }

    const references = this.admissionReferences(admission);
    this.appendActivity(delivery.work, claim, "AUTHORITY_CHECKED", now, {
      admissionStatus: admission.status,
      ...references,
    });

    if (admission.status === "WAITING_FOR_APPROVAL") {
      if (!admission.approvalId && !this.options.approval) {
        this.options.queue.complete({
          claim,
          outcome: "WAITING_FOR_APPROVAL",
          observedAt: now,
        });
        this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
        this.appendActivity(delivery.work, claim, "WAITING_FOR_APPROVAL", now, references);
        return {
          status: "waiting",
          workId: delivery.work.workId,
          deliveryId: delivery.work.deliveryId,
          queueOutcome: "WAITING_FOR_APPROVAL",
        };
      }
      if (!admission.approvalId)
        return this.finishBlocked(
          delivery.work,
          claim,
          now,
          "MP-03 approval-required result has no approval identity.",
          references,
        );
      if (this.options.approval) {
        try {
          await this.options.approval.prepareApproval({
            intent: verified.intent,
            authenticatedContext: verified.authenticatedContext,
            waitingAdmission: admission,
          });
        } catch (error) {
          return this.finishBlocked(
            delivery.work,
            claim,
            now,
            error instanceof Error
              ? error.message
              : "MP-05 rejected the pending approval boundary.",
            references,
          );
        }
      }
      this.options.queue.parkForApproval({
        claim,
        approvalId: admission.approvalId,
        observedAt: now,
      });
      this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
      this.appendActivity(delivery.work, claim, "WAITING_FOR_APPROVAL", now, references);
      return {
        status: "waiting",
        workId: delivery.work.workId,
        deliveryId: delivery.work.deliveryId,
        queueOutcome: "WAITING_FOR_APPROVAL",
      };
    }

    if (admission.status === "REJECTED") {
      this.options.queue.complete({ claim, outcome: "DENIED", observedAt: now });
      this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
      this.appendActivity(delivery.work, claim, "DENIED", now, {
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
      return this.finishBlocked(delivery.work, claim, now, admission.reason, references);
    }

    this.checkpoint("AFTER_MP03_ADMITTED");
    this.checkpoint("BEFORE_MP04");

    let execution: Mp04ExecutionResultV1;
    try {
      execution = await this.options.execution.executeAdmittedAction({
        intent: verified.intent,
        authenticatedContext: verified.authenticatedContext,
        admission,
        now,
      });
    } catch (error) {
      if (isInjectedWorkerCrash(error)) throw error;
      return this.finishReconciliation(
        delivery.work,
        claim,
        now,
        "MP-04 response was unavailable; native recovery is required.",
        references,
      );
    }

    if (execution.status === "CONFIRMED") {
      this.checkpoint("AFTER_MP04_CONFIRMED_BEFORE_QUEUE_COMPLETION");
      this.options.queue.complete({
        claim,
        outcome: "COMPLETED",
        observedAt: now,
        ...(execution.durableExecutionId
          ? { mp04DurableExecutionId: execution.durableExecutionId }
          : {}),
      });
      this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
      this.appendActivity(delivery.work, claim, "COMPLETED", now, {
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
      return this.finishReconciliation(
        delivery.work,
        claim,
        now,
        "MP-04 requires native recovery or reconciliation.",
        references,
        execution,
      );
    }

    if (execution.status === "ABSENT") {
      this.options.queue.complete({
        claim,
        outcome: "EFFECT_ABSENT",
        observedAt: now,
        ...(execution.durableExecutionId
          ? { mp04DurableExecutionId: execution.durableExecutionId }
          : {}),
      });
      this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
      this.appendActivity(delivery.work, claim, "EFFECT_ABSENT", now, {
        ...references,
        durableExecutionId: execution.durableExecutionId,
        mp04Status: execution.status,
        reason: "MP-04 durably reported that the effect is absent.",
      });
      return {
        status: "effect-absent",
        workId: delivery.work.workId,
        deliveryId: delivery.work.deliveryId,
        queueOutcome: "EFFECT_ABSENT",
        mp04Status: execution.status,
      };
    }

    return this.finishBlocked(
      delivery.work,
      claim,
      now,
      execution.message ?? "MP-04 blocked execution",
      {
        ...references,
        durableExecutionId: execution.durableExecutionId,
        mp04Status: execution.status,
      },
    );
  }

  private async recoverApproval(
    work: QueueWorkV1,
    claim: SchedulingClaimV1,
    verified: VerifiedProtocolMaterial,
    now: string,
    priorReference: QueueApprovalReferenceV1,
  ): Promise<Mp06WorkerResultV1> {
    if (!this.options.approval)
      return this.finishBlocked(work, claim, now, "MP-05 approval recovery is unavailable.");
    let recovery: Mp05RecoveryResultV1;
    try {
      recovery = await this.options.approval.recoverOrRefresh({
        intent: verified.intent,
        authenticatedContext: verified.authenticatedContext,
        approvalId: priorReference.approvalId,
      });
    } catch (error) {
      if (isInjectedWorkerCrash(error)) throw error;
      return this.finishBlocked(
        work,
        claim,
        now,
        error instanceof Error ? error.message : "MP-05 approval recovery failed closed.",
        { approvalId: priorReference.approvalId },
        this.approvalReference(priorReference.approvalId, "BOUNDARY_FAILURE", now),
      );
    }

    if (recovery.kind === "PRESENTATION") {
      this.options.queue.parkForApproval({
        claim,
        approvalId: priorReference.approvalId,
        observedAt: now,
      });
      this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
      this.appendActivity(work, claim, "WAITING_FOR_APPROVAL", now, {
        approvalId: priorReference.approvalId,
        approvalObservationState: "PENDING",
      });
      return {
        status: "waiting",
        workId: work.workId,
        deliveryId: work.deliveryId,
        queueOutcome: "WAITING_FOR_APPROVAL",
      };
    }

    const approval = recovery.result.approval;
    const reference = this.approvalReference(
      approval.approvalId,
      this.approvalObservationState(approval),
      now,
      approval.decisionId,
    );
    const activityReferences: Partial<ActivityRecordV1> = {
      approvalId: approval.approvalId,
      ...(approval.decisionId ? { decisionId: approval.decisionId } : {}),
      approvalObservationState: reference.observationState,
    };

    if (approval.status === "REJECTED") {
      this.options.queue.complete({
        claim,
        outcome: "DENIED",
        observedAt: now,
        approvalReference: reference,
      });
      this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
      this.appendActivity(work, claim, "DENIED", now, activityReferences);
      return {
        status: "denied",
        workId: work.workId,
        deliveryId: work.deliveryId,
        queueOutcome: "DENIED",
        reason: "MP-05 durably rejected the approval.",
      };
    }

    if (approval.status !== "APPROVED")
      return this.finishBlocked(
        work,
        claim,
        now,
        `MP-05 did not produce executable approval truth: ${approval.status}.`,
        activityReferences,
        reference,
      );

    const execution = recovery.result.execution;
    if (!execution)
      return this.finishBlocked(
        work,
        claim,
        now,
        "MP-05 approved recovery returned no MP-04 execution result.",
        activityReferences,
        reference,
      );
    return this.finishApprovedExecution(work, claim, now, execution, activityReferences, reference);
  }

  private finishApprovedExecution(
    work: QueueWorkV1,
    claim: SchedulingClaimV1,
    observedAt: string,
    execution: Mp04ExecutionResultV1,
    extra: Partial<ActivityRecordV1>,
    approvalReference: QueueApprovalReferenceV1,
  ): Mp06WorkerResultV1 {
    if (execution.status === "CONFIRMED") {
      this.checkpoint("AFTER_MP04_CONFIRMED_BEFORE_QUEUE_COMPLETION");
      this.options.queue.complete({
        claim,
        outcome: "COMPLETED",
        observedAt,
        ...(execution.durableExecutionId
          ? { mp04DurableExecutionId: execution.durableExecutionId }
          : {}),
        approvalReference,
      });
      this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
      this.appendActivity(work, claim, "COMPLETED", observedAt, {
        ...extra,
        durableExecutionId: execution.durableExecutionId,
        mp04Status: execution.status,
      });
      return {
        status: "completed",
        workId: work.workId,
        deliveryId: work.deliveryId,
        queueOutcome: "COMPLETED",
        mp04Status: execution.status,
      };
    }
    if (execution.status === "UNKNOWN" || execution.status === "RECOVERY_REQUIRED")
      return this.finishReconciliation(
        work,
        claim,
        observedAt,
        "MP-04 requires native recovery or reconciliation after approved recovery.",
        extra,
        execution,
        approvalReference,
      );
    if (execution.status === "ABSENT") {
      this.options.queue.complete({
        claim,
        outcome: "EFFECT_ABSENT",
        observedAt,
        ...(execution.durableExecutionId
          ? { mp04DurableExecutionId: execution.durableExecutionId }
          : {}),
        approvalReference,
      });
      this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
      this.appendActivity(work, claim, "EFFECT_ABSENT", observedAt, {
        ...extra,
        durableExecutionId: execution.durableExecutionId,
        mp04Status: execution.status,
      });
      return {
        status: "effect-absent",
        workId: work.workId,
        deliveryId: work.deliveryId,
        queueOutcome: "EFFECT_ABSENT",
        mp04Status: execution.status,
      };
    }
    return this.finishBlocked(
      work,
      claim,
      observedAt,
      execution.message ?? "MP-04 blocked approved execution.",
      { ...extra, mp04Status: execution.status },
      approvalReference,
    );
  }

  private approvalReference(
    approvalId: string,
    observationState: QueueApprovalReferenceV1["observationState"],
    observedAt: string,
    decisionId?: string,
  ): QueueApprovalReferenceV1 {
    return {
      schemaVersion: MP06D_APPROVAL_REFERENCE_VERSION,
      approvalId,
      observationState,
      observedAt,
      ...(decisionId ? { decisionId } : {}),
    };
  }

  private approvalObservationState(approval: {
    status: "APPROVED" | "REJECTED" | "EXPIRED" | "STALE" | "CONFLICT" | "BOUNDARY_FAILURE";
    approvalState?: string;
  }): QueueApprovalReferenceV1["observationState"] {
    if (approval.status === "APPROVED") return "APPROVED";
    if (approval.status === "REJECTED") return "REJECTED";
    if (approval.status === "EXPIRED") return "EXPIRED";
    if (approval.approvalState === "revoked") return "REVOKED";
    if (approval.approvalState === "consumed") return "CONSUMED";
    if (approval.status === "STALE") return "MISSING";
    if (approval.status === "CONFLICT") return "INVALID";
    return "BOUNDARY_FAILURE";
  }

  private finishBlocked(
    work: QueueWorkV1,
    claim: SchedulingClaimV1,
    observedAt: string,
    reason: string,
    extra: Partial<ActivityRecordV1> = {},
    approvalReference?: QueueApprovalReferenceV1,
  ): Mp06WorkerResultV1 {
    this.options.queue.complete({
      claim,
      outcome: "BOUNDARY_BLOCKED",
      observedAt,
      ...(approvalReference ? { approvalReference } : {}),
    });
    this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
    this.appendActivity(work, claim, "BOUNDARY_BLOCKED", observedAt, { ...extra, reason });
    return {
      status: "blocked",
      workId: work.workId,
      deliveryId: work.deliveryId,
      queueOutcome: "BOUNDARY_BLOCKED",
      reason,
    };
  }

  private finishReconciliation(
    work: QueueWorkV1,
    claim: SchedulingClaimV1,
    observedAt: string,
    reason: string,
    extra: Partial<ActivityRecordV1> = {},
    execution?: Mp04ExecutionResultV1,
    approvalReference?: QueueApprovalReferenceV1,
  ): Mp06WorkerResultV1 {
    this.options.queue.complete({
      claim,
      outcome: "RECONCILIATION_REQUIRED",
      observedAt,
      ...(execution?.durableExecutionId
        ? { mp04DurableExecutionId: execution.durableExecutionId }
        : {}),
      ...(approvalReference ? { approvalReference } : {}),
    });
    this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
    this.appendActivity(work, claim, "RECONCILIATION_REQUIRED", observedAt, {
      ...extra,
      ...(execution?.durableExecutionId
        ? { durableExecutionId: execution.durableExecutionId }
        : {}),
      ...(execution?.status ? { mp04Status: execution.status } : {}),
      reason,
    });
    return {
      status: "reconciliation-required",
      workId: work.workId,
      deliveryId: work.deliveryId,
      queueOutcome: "RECONCILIATION_REQUIRED",
      ...(execution?.status ? { mp04Status: execution.status } : {}),
      reason,
    };
  }

  private async recoverReconciliation(
    work: QueueWorkV1,
    claim: SchedulingClaimV1,
    verified: VerifiedProtocolMaterial,
    now: string,
    priorOutcome: QueueOutcomeSnapshotV1,
  ): Promise<Mp06WorkerResultV1> {
    if (!priorOutcome.mp04DurableExecutionId || !this.options.execution.recoverActionExecution)
      return this.finishReconciliation(
        work,
        claim,
        now,
        "MP-04 native recovery is required but no recovery port is available.",
      );
    let execution: Mp04ExecutionResultV1;
    try {
      execution = await this.options.execution.recoverActionExecution({
        durableExecutionId: priorOutcome.mp04DurableExecutionId,
        intent: verified.intent,
        authenticatedContext: verified.authenticatedContext,
        now,
      });
    } catch (error) {
      if (isInjectedWorkerCrash(error)) throw error;
      return this.finishReconciliation(work, claim, now, "MP-04 native recovery failed closed.");
    }
    if (execution.status === "CONFIRMED") {
      this.options.queue.complete({
        claim,
        outcome: "COMPLETED",
        observedAt: now,
        ...(execution.durableExecutionId
          ? { mp04DurableExecutionId: execution.durableExecutionId }
          : {}),
      });
      this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
      this.appendActivity(work, claim, "COMPLETED", now, {
        durableExecutionId: execution.durableExecutionId,
        mp04Status: execution.status,
        reason: "MP-04 native recovery confirmed the existing execution.",
      });
      return {
        status: "completed",
        workId: work.workId,
        deliveryId: work.deliveryId,
        queueOutcome: "COMPLETED",
        mp04Status: execution.status,
      };
    }
    if (execution.status === "ABSENT") {
      this.options.queue.complete({
        claim,
        outcome: "EFFECT_ABSENT",
        observedAt: now,
        ...(execution.durableExecutionId
          ? { mp04DurableExecutionId: execution.durableExecutionId }
          : {}),
      });
      this.checkpoint("AFTER_TERMINAL_QUEUE_PERSISTENCE");
      this.appendActivity(work, claim, "EFFECT_ABSENT", now, {
        durableExecutionId: execution.durableExecutionId,
        mp04Status: execution.status,
      });
      return {
        status: "effect-absent",
        workId: work.workId,
        deliveryId: work.deliveryId,
        queueOutcome: "EFFECT_ABSENT",
        mp04Status: execution.status,
      };
    }
    return this.finishReconciliation(
      work,
      claim,
      now,
      "MP-04 native recovery remains unresolved.",
      {},
      execution,
    );
  }

  private scheduleRetry(
    work: QueueWorkV1,
    claim: SchedulingClaimV1,
    now: string,
    failureClass: RetryFailureClassV1,
    reason: string,
  ): Mp06WorkerResultV1 {
    const prior = this.options.queue.inspectOutcome(work.workId);
    const attempt = prior?.retryAttempt ?? 0;
    const delayMs = 1_000 * 2 ** Math.min(attempt, 6);
    const release = this.options.queue.release({
      claim,
      availableAt: addTrustedMilliseconds(now, delayMs),
      retryEligible: true,
      failureClass,
    });
    this.checkpoint("AFTER_RETRY_STATE_PERSISTENCE");
    if (release.status === "RETRY_LIMIT_REACHED") {
      this.appendActivity(work, claim, "RETRY_EXHAUSTED", now, {
        reason,
      });
      return {
        status: "retry-exhausted",
        workId: work.workId,
        deliveryId: work.deliveryId,
        queueOutcome: "RETRY_EXHAUSTED",
        retryAttempt: release.retryAttempt,
        retryBudget: release.retryBudget,
        reason,
      };
    }
    this.appendActivity(work, claim, "RETRY_SCHEDULED", now, { reason });
    return {
      status: "retry-eligible",
      workId: work.workId,
      deliveryId: work.deliveryId,
      queueOutcome: "RETRY_SCHEDULED",
      retryEligible: true,
      retryAttempt: release.retryAttempt,
      retryBudget: release.retryBudget,
      reason,
    };
  }

  private checkpoint(point: WorkerCheckpointV1): void {
    this.options.failureInjector?.checkpoint(point);
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

export {
  DurableFilesystemActivitySink,
  DurableFilesystemLocalQueue,
  DurableQueueBusyError,
  DurableQueueError,
} from "./durable.js";

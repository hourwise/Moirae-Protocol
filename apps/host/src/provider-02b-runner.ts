import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import {
  canonicalizeJsonV1,
  type ActionIntentV1,
} from "../../../packages/action-compiler/src/index.js";
import {
  MP04_DEPENDENCY_PROVENANCE,
  createMp04ExecutionCoordinator,
  type Mp04EffectAdapterIdentityV1,
  type Mp04ExecutionResultV1,
  type Mp04HoraePort,
  type Mp04OperationV1,
} from "../../../packages/execution-coordinator/src/index.js";
import type {
  Mp03AuthenticatedContext,
  MoiraeAdmissionResultV1,
} from "../../../packages/fates-adapter/src/index.js";
import type {
  Mp05ApprovalObservationV1,
  Mp05ApprovalOutcomeV1,
} from "../../../packages/human-approval/src/index.js";
import type {
  Mp04ExecutionPort,
  QueueOutcomeSnapshotV1,
  SchedulingClaimV1,
} from "../../../packages/background-work/src/index.js";
import type {
  Mp08bApprovalBindingV1,
  Mp08bDurableApprovalRuntime,
  Mp08bPreparedApprovalV1,
} from "./approval-runtime.js";
import type {
  Mp08bDurableQueueRuntime,
  Mp08bQueueEnqueueResultV1,
  Mp08bQueueExecutionResultV1,
  Mp08bQueueWorkerResultV1,
} from "./queue-runtime.js";
import {
  SES_EFFECT_ADAPTER_ID,
  invokePreparedSesRequest,
  prepareSesAppointmentDetailsRequest,
  reconcileSesObservation,
  type SesHoraeReconciliationInputV1,
  type SesPreparedRequestV1,
  type SesProviderConfigV1,
  type SesProviderInvocationResultV1,
  type SesV2Transport,
} from "./ses-provider.js";

export const MP08B_PROVIDER_02B_VERSION = "mp08b-provider-02b-r3-v1" as const;
export const MP08B_PROVIDER_02B_ATTEMPT_ID = "MP08B-PROVIDER-02B-ATTEMPT-001" as const;
export const MP08B_PROVIDER_02B_ATTEMPT_002_ID = "MP08B-PROVIDER-02B-ATTEMPT-002" as const;
export const PROVIDER_02B_LIVE_AUTHORIZATION = "AUTHORIZE PROVIDER-02B SEND NOW" as const;
export const PROVIDER_02B_OFFLINE_AUTHORIZATION = "OFFLINE_DRY_RUN" as const;

export type Provider02bAttemptId =
  typeof MP08B_PROVIDER_02B_ATTEMPT_ID | typeof MP08B_PROVIDER_02B_ATTEMPT_002_ID;

export type Provider02bAttemptIdentityV1 = Readonly<{
  readonly attemptId: Provider02bAttemptId;
  readonly lifecycle: "LEGACY_ATTEMPT_001" | "CREATE_FRESH" | "RESUME_EXISTING";
}>;

export type Provider02bAttemptState =
  | "UNUSED"
  | "PREPARED"
  | "APPROVED"
  | "REJECTED"
  | "SEND_STARTED"
  | "SEND_RETURNED"
  | "OBSERVING"
  | "RECONCILED";

export type Provider02bAttemptBindingsV1 = Readonly<{
  readonly actionIntentDigest: string;
  readonly actionIntentIdempotencyKey: string;
  readonly approvalId: string;
  readonly decisionId?: string;
  readonly actionBindingDigest?: string;
  readonly nativeActionHash?: string;
  readonly operation?: Mp04OperationV1;
  readonly recipientAddress?: string;
  readonly contextDigest?: string;
  readonly presentationInputDigest?: string;
  readonly logicalWorkId?: string;
  readonly deliveryId?: string;
  readonly claimId?: string;
  readonly claimGeneration?: number;
  readonly durableExecutionId?: string;
  readonly correlationId?: string;
  readonly requestFingerprint: string;
}>;

export type Provider02bApprovalBindingHistoryEntryV1 = Readonly<{
  readonly revision: number;
  readonly approvalId: string;
  readonly status: "CURRENT" | "SUPERSEDED_EXPIRED";
  readonly recordedAt: string;
  readonly supersededAt?: string;
}>;

export type Provider02bLegacyIdentityHydrationV1 = Readonly<{
  readonly version: 1;
  readonly status: "HYDRATED";
  readonly sourceSchema: "R3_PREPARED";
  readonly hydratedAt: string;
}>;

export type Provider02bPreparedApprovalBindingV1 = Readonly<{
  readonly approvalId: string;
  readonly actionIntentDigest: string;
  readonly actionIntentIdempotencyKey: string;
  readonly requestFingerprint: string;
  readonly actionBindingDigest: string;
  readonly nativeActionHash?: string;
  readonly operation?: Mp04OperationV1;
  readonly recipientAddress?: string;
  readonly contextDigest: string;
  readonly presentationInputDigest: string;
}>;

export type Provider02bApprovalRebindInputV1 = Readonly<{
  readonly attemptId: Provider02bAttemptId;
  readonly expectedApprovalId: string;
  readonly expectedApprovalBindingRevision: number;
  readonly replacement: Provider02bPreparedApprovalBindingV1;
  readonly now: string;
}>;

export type Provider02bLegacyIdentityHydrationInputV1 = Readonly<{
  readonly attemptId: Provider02bAttemptId;
  readonly expectedApprovalId: string;
  readonly expectedApprovalBindingRevision: number;
  readonly reconstructed: Provider02bPreparedApprovalBindingV1;
  readonly now: string;
}>;

export type Provider02bLegacyIdentityHydrationRequestV1 = Readonly<{
  readonly expectedApprovalId: string;
  readonly expectedApprovalBindingRevision: number;
}>;

export type Provider02bAttemptLedgerV1 = Readonly<{
  readonly schemaVersion: typeof MP08B_PROVIDER_02B_VERSION;
  readonly attemptId: Provider02bAttemptId;
  readonly state: Provider02bAttemptState;
  readonly updatedAt: string;
  readonly bindings?: Provider02bAttemptBindingsV1;
  readonly approvalBindingRevision: number;
  readonly approvalBindingHistory: readonly Provider02bApprovalBindingHistoryEntryV1[];
  readonly legacyIdentityHydration?: Provider02bLegacyIdentityHydrationV1;
  readonly sendStartedAt?: string;
  readonly providerOperationId?: string;
  readonly providerInvocationCount: number;
  readonly automaticRetryCount: 0;
  readonly reconciliationStatus?: SesHoraeReconciliationInputV1["status"];
  readonly queueOutcome?: QueueOutcomeSnapshotV1["outcome"];
}>;

export class Provider02bRunnerError extends Error {
  readonly code = "MP08B_PROVIDER_02B_RUNNER_FAILURE" as const;

  constructor(message: string) {
    super(message);
    this.name = "Provider02bRunnerError";
  }
}

type Provider02bApprovalPort = Pick<
  Mp08bDurableApprovalRuntime,
  | "prepareApproval"
  | "submitDecision"
  | "readApproval"
  | "getApprovalBinding"
  | "admitApproved"
  | "getMp04AnankePort"
>;

type Provider02bQueuePort = Pick<
  Mp08bDurableQueueRuntime,
  "enqueueApproved" | "claim" | "executeClaimed"
>;

type Provider02bObserver = (input: {
  readonly prepared: SesPreparedRequestV1;
  readonly invocation: SesProviderInvocationResultV1;
}) => Promise<unknown>;

export type Provider02bRunnerOptions = Readonly<{
  readonly approvalRuntime: Provider02bApprovalPort;
  readonly queueRuntime?: Provider02bQueuePort;
  readonly ledgerPath: string;
  readonly providerConfig: SesProviderConfigV1;
  readonly transport: SesV2Transport;
  readonly transportMode: "OFFLINE_TEST" | "LIVE";
  readonly observe: Provider02bObserver;
  readonly trustedTime: { now(): string };
  readonly workerId: string;
  /** Trusted host construction only. Request/model/browser data never selects an attempt. */
  readonly attemptIdentity?: Provider02bAttemptIdentityV1;
}>;

export type Provider02bPreparedRunV1 = Readonly<{
  readonly prepared: Mp08bPreparedApprovalV1;
  readonly ledger: Provider02bAttemptLedgerV1;
}>;

export type Provider02bJitApprovalRebindRequestV1 = Readonly<{
  readonly expectedApprovalId: string;
  readonly expectedApprovalBindingRevision: number;
  readonly replacement: Mp08bPreparedApprovalV1;
}>;

export type Provider02bClaimedRunV1 = Readonly<{
  readonly approval: Mp05ApprovalObservationV1;
  readonly enqueue: Mp08bQueueEnqueueResultV1;
  readonly claim: Mp08bQueueWorkerResultV1;
  readonly ledger: Provider02bAttemptLedgerV1;
}>;

export type Provider02bExecutionRunV1 = Readonly<{
  readonly queue: Mp08bQueueExecutionResultV1;
  readonly execution?: Mp04ExecutionResultV1;
  readonly invocation?: SesProviderInvocationResultV1;
  readonly reconciliation?: SesHoraeReconciliationInputV1;
  readonly ledger: Provider02bAttemptLedgerV1;
}>;

const stateOrder: Readonly<Record<Provider02bAttemptState, number>> = Object.freeze({
  UNUSED: 0,
  PREPARED: 1,
  APPROVED: 2,
  REJECTED: 2,
  SEND_STARTED: 3,
  SEND_RETURNED: 4,
  OBSERVING: 5,
  RECONCILED: 6,
});

function clone<T>(value: T): T {
  return structuredClone(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalizeJsonV1(value), "utf8").digest("hex");
}

function requireAbsoluteLedgerPath(value: string): string {
  if (!isAbsolute(value)) throw new Provider02bRunnerError("Attempt ledger path must be absolute.");
  return resolve(value);
}

function validateAttemptIdentity(
  value: Provider02bAttemptIdentityV1 | undefined,
): Provider02bAttemptIdentityV1 {
  const identity =
    value ??
    ({
      attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
      lifecycle: "LEGACY_ATTEMPT_001",
    } as const);
  if (
    identity.attemptId !== MP08B_PROVIDER_02B_ATTEMPT_ID &&
    identity.attemptId !== MP08B_PROVIDER_02B_ATTEMPT_002_ID
  )
    throw new Provider02bRunnerError("Provider-02B attempt identity is not trusted.");
  if (
    (identity.lifecycle === "LEGACY_ATTEMPT_001") !==
    (identity.attemptId === MP08B_PROVIDER_02B_ATTEMPT_ID)
  )
    throw new Provider02bRunnerError(
      "Historical Attempt-001 and fresh-attempt construction modes cannot cross-bind.",
    );
  if (
    identity.lifecycle !== "LEGACY_ATTEMPT_001" &&
    identity.lifecycle !== "CREATE_FRESH" &&
    identity.lifecycle !== "RESUME_EXISTING"
  )
    throw new Provider02bRunnerError("Provider-02B attempt lifecycle is invalid.");
  return clone(identity);
}

function initialLedger(now: string, attemptId: Provider02bAttemptId): Provider02bAttemptLedgerV1 {
  return {
    schemaVersion: MP08B_PROVIDER_02B_VERSION,
    attemptId,
    state: "UNUSED",
    updatedAt: now,
    providerInvocationCount: 0,
    automaticRetryCount: 0,
    approvalBindingRevision: 0,
    approvalBindingHistory: [],
  };
}

function parseLedger(
  value: unknown,
  expectedAttemptId: Provider02bAttemptId,
): Provider02bAttemptLedgerV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Provider02bRunnerError("Provider-02B attempt ledger is malformed.");
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== MP08B_PROVIDER_02B_VERSION ||
    record.attemptId !== expectedAttemptId ||
    typeof record.state !== "string" ||
    !(record.state in stateOrder) ||
    typeof record.updatedAt !== "string" ||
    typeof record.providerInvocationCount !== "number" ||
    !Number.isInteger(record.providerInvocationCount) ||
    record.providerInvocationCount < 0 ||
    record.providerInvocationCount > 1 ||
    record.automaticRetryCount !== 0
  )
    throw new Provider02bRunnerError("Provider-02B attempt ledger is invalid.");
  if (
    record.state !== "UNUSED" &&
    (typeof record.bindings !== "object" || record.bindings === null)
  )
    throw new Provider02bRunnerError("Provider-02B attempt ledger lost its governed bindings.");
  const bindings = record.bindings as Provider02bAttemptBindingsV1 | undefined;
  const rawHistory = record.approvalBindingHistory;
  const history =
    rawHistory === undefined
      ? record.state === "UNUSED" || !bindings
        ? []
        : [
            {
              revision: 0,
              approvalId: bindings.approvalId,
              status: "CURRENT" as const,
              recordedAt: record.updatedAt as string,
            },
          ]
      : parseApprovalBindingHistory(rawHistory);
  const revisionValue = record.approvalBindingRevision;
  const revision = revisionValue === undefined ? (history.at(-1)?.revision ?? 0) : revisionValue;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0)
    throw new Provider02bRunnerError("Provider-02B approval binding revision is invalid.");
  if (history.length > 0 && history.at(-1)?.revision !== revision)
    throw new Provider02bRunnerError("Provider-02B approval binding history is not current.");
  if (record.state !== "UNUSED" && bindings && history.at(-1)?.approvalId !== bindings.approvalId)
    throw new Provider02bRunnerError("Provider-02B approval binding history lost its current ID.");
  const legacyIdentityHydration = parseLegacyIdentityHydration(record.legacyIdentityHydration);
  return clone({
    ...(record as unknown as Provider02bAttemptLedgerV1),
    approvalBindingRevision: revision,
    approvalBindingHistory: history,
    ...(legacyIdentityHydration ? { legacyIdentityHydration } : {}),
  });
}

function parseApprovalBindingHistory(value: unknown): Provider02bApprovalBindingHistoryEntryV1[] {
  if (!Array.isArray(value))
    throw new Provider02bRunnerError("Provider-02B approval binding history is invalid.");
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      throw new Provider02bRunnerError("Provider-02B approval binding history entry is invalid.");
    const record = entry as Record<string, unknown>;
    if (
      !Number.isInteger(record.revision) ||
      (record.revision as number) < 0 ||
      typeof record.approvalId !== "string" ||
      record.approvalId.trim().length === 0 ||
      (record.status !== "CURRENT" && record.status !== "SUPERSEDED_EXPIRED") ||
      typeof record.recordedAt !== "string" ||
      (record.supersededAt !== undefined && typeof record.supersededAt !== "string")
    )
      throw new Provider02bRunnerError("Provider-02B approval binding history entry is invalid.");
    return {
      revision: record.revision as number,
      approvalId: record.approvalId,
      status: record.status,
      recordedAt: record.recordedAt,
      ...(record.supersededAt ? { supersededAt: record.supersededAt } : {}),
    };
  });
}

function parseLegacyIdentityHydration(
  value: unknown,
): Provider02bLegacyIdentityHydrationV1 | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Provider02bRunnerError("Provider-02B legacy identity hydration marker is invalid.");
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    record.status !== "HYDRATED" ||
    record.sourceSchema !== "R3_PREPARED" ||
    typeof record.hydratedAt !== "string"
  )
    throw new Provider02bRunnerError("Provider-02B legacy identity hydration marker is invalid.");
  return {
    version: 1,
    status: "HYDRATED",
    sourceSchema: "R3_PREPARED",
    hydratedAt: record.hydratedAt,
  };
}

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  const fd = openSync(temporaryPath, "w");
  try {
    writeFileSync(fd, `${canonicalizeJsonV1(value)}\n`, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporaryPath, path);
}

/**
 * Durable one-attempt guard. Constructing the ledger is side-effect free; the
 * file is created only after the explicitly authorized preparation or live
 * execution transition.
 */
export class Provider02bAttemptLedger {
  private readonly path: string;
  private readonly identity: Provider02bAttemptIdentityV1;

  constructor(path: string, identity?: Provider02bAttemptIdentityV1) {
    this.path = requireAbsoluteLedgerPath(path);
    this.identity = validateAttemptIdentity(identity);
  }

  read(now = new Date().toISOString()): Provider02bAttemptLedgerV1 {
    if (!existsSync(this.path)) {
      if (this.identity.lifecycle === "RESUME_EXISTING")
        throw new Provider02bRunnerError("The existing Provider-02B attempt ledger is absent.");
      return initialLedger(now, this.identity.attemptId);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.path, "utf8")) as unknown;
    } catch {
      throw new Provider02bRunnerError("Provider-02B attempt ledger is unreadable.");
    }
    return parseLedger(raw, this.identity.attemptId);
  }

  private withExclusiveLock<T>(operation: () => T): T {
    const lockPath = `${this.path}.lock`;
    let descriptor: number | undefined;
    try {
      descriptor = openSync(lockPath, "wx");
      return operation();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Provider02bRunnerError(
          "Provider-02B attempt durable update is concurrently locked; refusing last-write-wins behavior.",
        );
      throw error;
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (descriptor !== undefined) {
        try {
          unlinkSync(lockPath);
        } catch {
          // A failed cleanup leaves the lock visible and fails closed next time.
        }
      }
    }
  }

  private updateUnlocked(
    now: string,
    mutate: (current: Provider02bAttemptLedgerV1) => Provider02bAttemptLedgerV1,
  ): Provider02bAttemptLedgerV1 {
    const next = parseLedger(mutate(this.read(now)), this.identity.attemptId);
    atomicWrite(this.path, next);
    return next;
  }

  private update(
    now: string,
    mutate: (current: Provider02bAttemptLedgerV1) => Provider02bAttemptLedgerV1,
  ): Provider02bAttemptLedgerV1 {
    return this.withExclusiveLock(() => this.updateUnlocked(now, mutate));
  }

  prepare(bindings: Provider02bAttemptBindingsV1, now: string): Provider02bAttemptLedgerV1 {
    return this.withExclusiveLock(() => {
      if (this.identity.lifecycle === "RESUME_EXISTING")
        throw new Provider02bRunnerError("An existing attempt cannot be created again.");
      if (this.identity.lifecycle === "CREATE_FRESH" && existsSync(this.path))
        throw new Provider02bRunnerError(
          "FRESH_ATTEMPT_CREATE_ONLY: the fresh attempt ledger already exists.",
        );
      const current = this.read(now);
      if (current.state !== "UNUSED")
        throw new Provider02bRunnerError(
          "The Provider-02B attempt is already prepared or consumed.",
        );
      const next: Provider02bAttemptLedgerV1 = {
        ...current,
        state: "PREPARED",
        updatedAt: now,
        bindings: clone(bindings),
        approvalBindingRevision: 0,
        approvalBindingHistory: [
          {
            revision: 0,
            approvalId: bindings.approvalId,
            status: "CURRENT",
            recordedAt: now,
          },
        ],
      };
      const parsed = parseLedger(next, this.identity.attemptId);
      atomicWrite(this.path, parsed);
      return parsed;
    });
  }

  /**
   * Hydrate only the identity metadata omitted by the original R3 PREPARED
   * ledger. The caller must derive `reconstructed` from the original durable
   * host binding; this ledger operation never accepts replacement-approval
   * material as a source.
   */
  hydrateLegacyPreparedIdentity(
    input: Provider02bLegacyIdentityHydrationInputV1,
  ): Provider02bAttemptLedgerV1 {
    return this.withExclusiveLock(() => {
      const current = this.read(input.now);
      if (this.identity.lifecycle !== "LEGACY_ATTEMPT_001" || input.attemptId !== current.attemptId)
        throw new Provider02bRunnerError(
          "Legacy identity hydration targeted a different attempt identity.",
        );
      if (
        current.state !== "PREPARED" ||
        current.providerInvocationCount !== 0 ||
        current.sendStartedAt !== undefined ||
        current.providerOperationId !== undefined ||
        current.reconciliationStatus !== undefined ||
        current.queueOutcome !== undefined ||
        current.bindings?.decisionId !== undefined ||
        current.bindings?.logicalWorkId !== undefined ||
        current.bindings?.deliveryId !== undefined ||
        current.bindings?.claimId !== undefined ||
        current.bindings?.durableExecutionId !== undefined ||
        current.bindings?.correlationId !== undefined
      )
        throw new Provider02bRunnerError(
          "Legacy identity hydration requires an unconsumed PREPARED Attempt-001.",
        );
      if (!current.bindings)
        throw new Provider02bRunnerError(
          "Legacy identity hydration requires the current durable binding.",
        );
      if (current.bindings.approvalId !== input.expectedApprovalId)
        throw new Provider02bRunnerError(
          "Legacy identity hydration expected the current approval binding.",
        );
      if (current.approvalBindingRevision !== input.expectedApprovalBindingRevision)
        throw new Provider02bRunnerError(
          "Legacy identity hydration revision is stale; refusing last-write-wins.",
        );

      const reconstructed = input.reconstructed;
      if (
        reconstructed.approvalId !== current.bindings.approvalId ||
        reconstructed.actionBindingDigest.length === 0 ||
        reconstructed.contextDigest.length === 0 ||
        reconstructed.presentationInputDigest.length === 0 ||
        reconstructed.recipientAddress === undefined ||
        reconstructed.recipientAddress.length === 0 ||
        reconstructed.nativeActionHash === undefined ||
        reconstructed.nativeActionHash.length === 0 ||
        reconstructed.operation === undefined
      )
        throw new Provider02bRunnerError(
          "LEGACY_IDENTITY_NOT_PROVABLY_RECONSTRUCTIBLE: authoritative identity material is incomplete.",
        );

      if (
        current.bindings.actionIntentDigest !== reconstructed.actionIntentDigest ||
        current.bindings.actionIntentIdempotencyKey !== reconstructed.actionIntentIdempotencyKey ||
        current.bindings.requestFingerprint !== reconstructed.requestFingerprint
      )
        throw new Provider02bRunnerError(
          "LEGACY_IDENTITY_EXISTING_VALUE_MISMATCH: immutable ledger identity disagrees with authoritative reconstruction.",
        );

      const optionalMatches =
        (current.bindings.actionBindingDigest === undefined ||
          current.bindings.actionBindingDigest === reconstructed.actionBindingDigest) &&
        (current.bindings.nativeActionHash === undefined ||
          current.bindings.nativeActionHash === reconstructed.nativeActionHash) &&
        (current.bindings.recipientAddress === undefined ||
          current.bindings.recipientAddress === reconstructed.recipientAddress) &&
        (current.bindings.contextDigest === undefined ||
          current.bindings.contextDigest === reconstructed.contextDigest) &&
        (current.bindings.presentationInputDigest === undefined ||
          current.bindings.presentationInputDigest === reconstructed.presentationInputDigest) &&
        (current.bindings.operation === undefined ||
          hash(current.bindings.operation) === hash(reconstructed.operation));
      if (!optionalMatches)
        throw new Provider02bRunnerError(
          "LEGACY_IDENTITY_EXISTING_VALUE_MISMATCH: an existing identity field disagrees with authoritative reconstruction.",
        );

      const hydratedBindings: Provider02bAttemptBindingsV1 = {
        ...current.bindings,
        actionBindingDigest:
          current.bindings.actionBindingDigest ?? reconstructed.actionBindingDigest,
        nativeActionHash: current.bindings.nativeActionHash ?? reconstructed.nativeActionHash,
        operation: current.bindings.operation ?? reconstructed.operation,
        recipientAddress: current.bindings.recipientAddress ?? reconstructed.recipientAddress,
        contextDigest: current.bindings.contextDigest ?? reconstructed.contextDigest,
        presentationInputDigest:
          current.bindings.presentationInputDigest ?? reconstructed.presentationInputDigest,
      };

      const identityComplete =
        current.bindings.actionBindingDigest !== undefined &&
        current.bindings.nativeActionHash !== undefined &&
        current.bindings.operation !== undefined &&
        current.bindings.recipientAddress !== undefined &&
        current.bindings.contextDigest !== undefined &&
        current.bindings.presentationInputDigest !== undefined;
      if (current.legacyIdentityHydration) {
        if (!identityComplete)
          throw new Provider02bRunnerError(
            "LEGACY_IDENTITY_EXISTING_VALUE_MISMATCH: hydrated identity marker is incomplete.",
          );
        return current;
      }

      const next: Provider02bAttemptLedgerV1 = {
        ...current,
        updatedAt: input.now,
        bindings: hydratedBindings,
        legacyIdentityHydration: {
          version: 1,
          status: "HYDRATED",
          sourceSchema: "R3_PREPARED",
          hydratedAt: input.now,
        },
      };
      atomicWrite(this.path, parseLedger(next, this.identity.attemptId));
      return parseLedger(next, this.identity.attemptId);
    });
  }

  rebindPreparedApproval(input: Provider02bApprovalRebindInputV1): Provider02bAttemptLedgerV1 {
    return this.withExclusiveLock(() => {
      const current = this.read(input.now);
      if (input.attemptId !== current.attemptId)
        throw new Provider02bRunnerError("Approval rebind targeted a different attempt identity.");
      if (
        current.state !== "PREPARED" ||
        current.providerInvocationCount !== 0 ||
        current.sendStartedAt !== undefined ||
        current.providerOperationId !== undefined ||
        current.reconciliationStatus !== undefined ||
        current.queueOutcome !== undefined ||
        current.bindings?.decisionId !== undefined ||
        current.bindings?.logicalWorkId !== undefined ||
        current.bindings?.deliveryId !== undefined ||
        current.bindings?.claimId !== undefined ||
        current.bindings?.durableExecutionId !== undefined ||
        current.bindings?.correlationId !== undefined
      )
        throw new Provider02bRunnerError(
          "Approval rebind is allowed only for an unconsumed PREPARED attempt.",
        );
      if (!current.bindings)
        throw new Provider02bRunnerError("Approval rebind requires the current durable binding.");
      if (current.bindings.approvalId !== input.expectedApprovalId)
        throw new Provider02bRunnerError(
          "Approval rebind expected a different current approval ID.",
        );
      if (current.approvalBindingRevision !== input.expectedApprovalBindingRevision)
        throw new Provider02bRunnerError(
          "Approval rebind revision is stale; refusing last-write-wins.",
        );
      if (input.replacement.approvalId === input.expectedApprovalId)
        throw new Provider02bRunnerError(
          "Approval rebind requires a different replacement approval.",
        );
      if (
        current.bindings.actionIntentDigest !== input.replacement.actionIntentDigest ||
        current.bindings.actionIntentIdempotencyKey !==
          input.replacement.actionIntentIdempotencyKey ||
        current.bindings.requestFingerprint !== input.replacement.requestFingerprint ||
        (current.bindings.actionBindingDigest ?? undefined) !==
          (input.replacement.actionBindingDigest ?? undefined) ||
        (current.bindings.nativeActionHash ?? undefined) !==
          (input.replacement.nativeActionHash ?? undefined) ||
        (current.bindings.recipientAddress ?? undefined) !==
          (input.replacement.recipientAddress ?? undefined) ||
        (current.bindings.contextDigest ?? undefined) !==
          (input.replacement.contextDigest ?? undefined) ||
        (current.bindings.presentationInputDigest ?? undefined) !==
          (input.replacement.presentationInputDigest ?? undefined) ||
        hash(current.bindings.operation ?? null) !== hash(input.replacement.operation ?? null)
      )
        throw new Provider02bRunnerError(
          "Approval rebind replacement does not describe the exact prepared action.",
        );
      const currentHistory = current.approvalBindingHistory;
      const currentHistoryEntry = currentHistory.at(-1);
      if (!currentHistoryEntry || currentHistoryEntry.status !== "CURRENT")
        throw new Provider02bRunnerError("Approval rebind history has no current binding.");
      const nextRevision = current.approvalBindingRevision + 1;
      const next: Provider02bAttemptLedgerV1 = {
        ...current,
        updatedAt: input.now,
        bindings: {
          ...current.bindings,
          approvalId: input.replacement.approvalId,
          actionBindingDigest: input.replacement.actionBindingDigest,
          ...(input.replacement.nativeActionHash
            ? { nativeActionHash: input.replacement.nativeActionHash }
            : {}),
          ...(input.replacement.operation ? { operation: input.replacement.operation } : {}),
          ...(input.replacement.recipientAddress
            ? { recipientAddress: input.replacement.recipientAddress }
            : {}),
          contextDigest: input.replacement.contextDigest,
          presentationInputDigest: input.replacement.presentationInputDigest,
        },
        approvalBindingRevision: nextRevision,
        approvalBindingHistory: [
          ...currentHistory.slice(0, -1),
          {
            ...currentHistoryEntry,
            status: "SUPERSEDED_EXPIRED",
            supersededAt: input.now,
          },
          {
            revision: nextRevision,
            approvalId: input.replacement.approvalId,
            status: "CURRENT",
            recordedAt: input.now,
          },
        ],
      };
      atomicWrite(this.path, parseLedger(next, this.identity.attemptId));
      return parseLedger(next, this.identity.attemptId);
    });
  }

  recordApproval(
    decision: "APPROVED" | "REJECTED",
    decisionId: string | undefined,
    now: string,
  ): Provider02bAttemptLedgerV1 {
    return this.update(now, (current) => {
      if (current.state !== "PREPARED")
        throw new Provider02bRunnerError("Human approval must follow the prepared attempt.");
      if (decision === "APPROVED" && !decisionId)
        throw new Provider02bRunnerError(
          "An approved attempt requires a native decision identity.",
        );
      return {
        ...current,
        state: decision === "APPROVED" ? "APPROVED" : "REJECTED",
        updatedAt: now,
        bindings: current.bindings
          ? { ...current.bindings, ...(decisionId ? { decisionId } : {}) }
          : current.bindings,
      };
    });
  }

  recordClaim(input: {
    readonly logicalWorkId: string;
    readonly deliveryId: string;
    readonly claimId: string;
    readonly claimGeneration: number;
    readonly correlationId: string;
    readonly now: string;
  }): Provider02bAttemptLedgerV1 {
    return this.update(input.now, (current) => {
      if (current.state !== "APPROVED" || !current.bindings)
        throw new Provider02bRunnerError("Queue claim requires durable APPROVED state.");
      return {
        ...current,
        updatedAt: input.now,
        bindings: {
          ...current.bindings,
          logicalWorkId: input.logicalWorkId,
          deliveryId: input.deliveryId,
          claimId: input.claimId,
          claimGeneration: input.claimGeneration,
          correlationId: input.correlationId,
        },
      };
    });
  }

  sendStarted(input: {
    readonly durableExecutionId: string;
    readonly now: string;
  }): Provider02bAttemptLedgerV1 {
    return this.update(input.now, (current) => {
      if (stateOrder[current.state] >= stateOrder.SEND_STARTED)
        throw new Provider02bRunnerError(
          "The Provider-02B attempt is consumed; a second provider call is forbidden.",
        );
      if (current.state !== "APPROVED" || !current.bindings?.claimId)
        throw new Provider02bRunnerError("SEND_STARTED requires approved claimed work.");
      return {
        ...current,
        state: "SEND_STARTED",
        updatedAt: input.now,
        sendStartedAt: input.now,
        providerInvocationCount: 1,
        bindings: { ...current.bindings, durableExecutionId: input.durableExecutionId },
      };
    });
  }

  sendReturned(input: {
    readonly providerOperationId?: string;
    readonly now: string;
  }): Provider02bAttemptLedgerV1 {
    return this.update(input.now, (current) => {
      if (current.state !== "SEND_STARTED")
        throw new Provider02bRunnerError("Provider return is not bound to SEND_STARTED.");
      return {
        ...current,
        state: "SEND_RETURNED",
        updatedAt: input.now,
        ...(input.providerOperationId ? { providerOperationId: input.providerOperationId } : {}),
      };
    });
  }

  observing(now: string): Provider02bAttemptLedgerV1 {
    return this.update(now, (current) => {
      if (current.state !== "SEND_RETURNED")
        throw new Provider02bRunnerError("Observation requires a recorded provider return.");
      return { ...current, state: "OBSERVING", updatedAt: now };
    });
  }

  reconciled(input: {
    readonly status: SesHoraeReconciliationInputV1["status"];
    readonly now: string;
  }): Provider02bAttemptLedgerV1 {
    return this.update(input.now, (current) => {
      if (current.state !== "OBSERVING")
        throw new Provider02bRunnerError("Reconciliation requires an observing attempt.");
      return {
        ...current,
        state: "RECONCILED",
        updatedAt: input.now,
        reconciliationStatus: input.status,
      };
    });
  }

  recordQueueOutcome(
    queueOutcome: QueueOutcomeSnapshotV1["outcome"],
    now: string,
  ): Provider02bAttemptLedgerV1 {
    return this.update(now, (current) => {
      if (current.state !== "RECONCILED")
        throw new Provider02bRunnerError("MP-06 outcome must follow reconciliation.");
      return { ...current, updatedAt: now, queueOutcome };
    });
  }
}

function requestFingerprint(intent: ActionIntentV1, config: SesProviderConfigV1): string {
  return hash({
    action: intent.action,
    actionIntentDigest: intent.canonicalDigest,
    actionIntentIdempotencyKey: intent.idempotencyKey,
    configurationSetName: config.configurationSetName,
    provider: "aws-ses-v2",
    region: config.region,
    templateId: "appointment-details-v1",
  });
}

function correlationFor(
  attemptId: Provider02bAttemptId,
  workId: string,
  claimId: string,
  generation: number,
): string {
  return `provider-02b-${hash({ attemptId, claimId, generation, workId }).slice(0, 32)}`;
}

function claimDigest(claim: SchedulingClaimV1): string {
  return `sha256:${hash(claim)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function presentationInputDigestForBinding(
  binding: Mp08bApprovalBindingV1,
  operation: unknown,
  nativeActionHash: string | undefined,
): string {
  return hash({
    intent: binding.intent,
    authenticatedContext: binding.authenticatedContext,
    ...(operation !== undefined ? { operation } : {}),
    ...(nativeActionHash !== undefined ? { nativeActionHash } : {}),
  });
}

function actionIdentityForBinding(
  binding: Mp08bApprovalBindingV1,
  requestFingerprintValue: string,
): Record<string, unknown> {
  const waiting = isRecord(binding.waitingAdmission) ? binding.waitingAdmission : {};
  const parameters: Record<string, unknown> = isRecord(binding.intent.parameters)
    ? binding.intent.parameters
    : {};
  const operation = isRecord(waiting.operation) ? waiting.operation : undefined;
  const nativeActionHash =
    typeof waiting.nativeActionHash === "string" ? waiting.nativeActionHash : undefined;
  const recipientAddress = parameters["recipientAddress"];
  return {
    actionIntentDigest: binding.intent.canonicalDigest,
    actionIntentIdempotencyKey: binding.intent.idempotencyKey,
    action: binding.intent.action,
    parameters,
    target: binding.intent.target,
    authenticatedContext: binding.authenticatedContext,
    ...(operation !== undefined ? { operation } : {}),
    ...(nativeActionHash !== undefined ? { nativeActionHash } : {}),
    ...(recipientAddress !== undefined ? { recipientAddress } : {}),
    presentationInputDigest: presentationInputDigestForBinding(
      binding,
      operation,
      nativeActionHash,
    ),
    requestFingerprint: requestFingerprintValue,
  };
}

function preparedApprovalBindingFromDurableBinding(
  binding: Mp08bApprovalBindingV1,
  config: SesProviderConfigV1,
): Provider02bPreparedApprovalBindingV1 {
  const requestFingerprintValue = requestFingerprint(binding.intent, config);
  const actionIdentity = actionIdentityForBinding(binding, requestFingerprintValue);
  const waiting = isRecord(binding.waitingAdmission) ? binding.waitingAdmission : {};
  const parameters: Record<string, unknown> = isRecord(binding.intent.parameters)
    ? binding.intent.parameters
    : {};
  const operation = isRecord(waiting.operation)
    ? (waiting.operation as unknown as Mp04OperationV1)
    : undefined;
  const nativeActionHash =
    typeof waiting.nativeActionHash === "string" ? waiting.nativeActionHash : undefined;
  const recipientAddress =
    typeof parameters["recipientAddress"] === "string" ? parameters["recipientAddress"] : undefined;
  const contextDigest = hash(binding.authenticatedContext);
  const presentationInputDigest = presentationInputDigestForBinding(
    binding,
    operation,
    nativeActionHash,
  );
  return {
    approvalId: binding.approvalId,
    actionIntentDigest: binding.intent.canonicalDigest,
    actionIntentIdempotencyKey: binding.intent.idempotencyKey,
    requestFingerprint: requestFingerprintValue,
    actionBindingDigest: hash({
      ...actionIdentity,
      contextDigest,
      presentationInputDigest,
    }),
    ...(nativeActionHash ? { nativeActionHash } : {}),
    ...(operation ? { operation } : {}),
    ...(recipientAddress ? { recipientAddress } : {}),
    contextDigest,
    presentationInputDigest,
  };
}

function preparedApprovalBinding(
  prepared: Mp08bPreparedApprovalV1,
  config: SesProviderConfigV1,
): Provider02bPreparedApprovalBindingV1 {
  return preparedApprovalBindingFromDurableBinding(prepared.binding, config);
}

function createHoraeRecord(input: {
  readonly authority: Record<string, unknown>;
  readonly owner: string;
  readonly claim: SchedulingClaimV1;
  readonly result: SesHoraeReconciliationInputV1;
  readonly invocation: SesProviderInvocationResultV1;
  readonly now: string;
}): Record<string, unknown> {
  const terminal = input.result.status === "CONFIRMED" || input.result.status === "ABSENT";
  return {
    durableExecutionId: input.authority.durableExecutionId,
    authority: input.authority,
    authorityInstanceDigest: input.authority.authorityInstanceDigest,
    nativeActionHash: input.authority.nativeActionHash,
    operation: input.authority.operation,
    argumentsDigest: input.authority.argumentsDigest,
    targetDigest: input.authority.targetDigest,
    effectAdapter: SES_EFFECT_ADAPTER_ID,
    state: terminal ? "terminal" : "effect_reconciliation_required",
    history: [
      { state: "authority_validated", event: "native authority validated" },
      { state: "execution_reserved", event: "Provider-02B execution reserved" },
      { state: "executor_invocation_started", event: "governed SES invocation completed" },
      {
        state: terminal ? "terminal" : "effect_reconciliation_required",
        event: terminal
          ? `independent SES observation: ${input.result.status}`
          : input.result.reason,
      },
    ],
    claim: {
      owner: input.owner,
      generation: input.claim.generation,
      claimDigest: claimDigest(input.claim),
    },
    ...(terminal
      ? {
          receipt: {
            result: input.result.status,
            checksum: `sha256:${hash({
              executionId: input.authority.durableExecutionId,
              providerOperationId: input.invocation.providerOperationId,
              result: input.result.status,
            })}`,
          },
          result: input.result.status,
        }
      : {}),
    ...(input.result.status === "UNKNOWN" ? { reason: input.result.reason } : {}),
    updatedAt: input.now,
  };
}

/**
 * Provider-02B is prepared here, but a live call can occur only through
 * executeOnce with the exact live phrase. The current R3 preparation path
 * uses no live transport and never enters that method.
 */
export class Provider02bRunner {
  private readonly ledger: Provider02bAttemptLedger;
  private readonly attemptIdentity: Provider02bAttemptIdentityV1;
  private lastExecution?: ReturnType<typeof createMp04ExecutionCoordinator>;
  private lastClaim?: SchedulingClaimV1;

  constructor(private readonly options: Provider02bRunnerOptions) {
    this.attemptIdentity = validateAttemptIdentity(options.attemptIdentity);
    this.ledger = new Provider02bAttemptLedger(options.ledgerPath, this.attemptIdentity);
  }

  readLedger(): Provider02bAttemptLedgerV1 {
    return this.ledger.read(this.options.trustedTime.now());
  }

  async prepare(
    input: Parameters<Provider02bApprovalPort["prepareApproval"]>[0],
  ): Promise<Provider02bPreparedRunV1> {
    const prepared = await this.options.approvalRuntime.prepareApproval(input);
    if (
      prepared.composition.status !== "COMPOSED" ||
      prepared.composition.actionIntent.action !== "SEND_APPOINTMENT_DETAILS" ||
      prepared.composition.admission.status !== "WAITING_FOR_APPROVAL" ||
      prepared.composition.admission.nativeDecision !== "REQUIRE_APPROVAL"
    )
      throw new Provider02bRunnerError(
        "Provider-02B requires the real SEND_APPOINTMENT_DETAILS REQUIRE_APPROVAL path.",
      );
    const preparedBinding = preparedApprovalBinding(prepared, this.options.providerConfig);
    const bindings: Provider02bAttemptBindingsV1 = preparedBinding;
    const ledger = this.ledger.prepare(bindings, this.options.trustedTime.now());
    return { prepared, ledger };
  }

  /**
   * Reconstruct omitted R3 identity metadata from the current durable host
   * binding and expired/revoked Fates history. No replacement approval or
   * request-provided material participates in this operation.
   */
  async hydrateLegacyPreparedIdentity(
    input: Provider02bLegacyIdentityHydrationRequestV1,
  ): Promise<Provider02bAttemptLedgerV1> {
    const current = this.readLedger();
    if (!current.bindings || current.bindings.approvalId !== input.expectedApprovalId)
      throw new Provider02bRunnerError(
        "Legacy identity hydration expected the current approval binding.",
      );
    const binding = this.options.approvalRuntime.getApprovalBinding(input.expectedApprovalId);
    if (!binding)
      throw new Provider02bRunnerError(
        "Legacy identity hydration requires the original durable host binding.",
      );
    const observation = await this.options.approvalRuntime.readApproval(input.expectedApprovalId);
    if (
      (observation.state !== "EXPIRED" && observation.state !== "REVOKED") ||
      observation.decisionId !== undefined
    )
      throw new Provider02bRunnerError(
        "Legacy identity hydration requires expired/revoked approval history without a decision.",
      );
    const reconstructed = preparedApprovalBindingFromDurableBinding(
      binding,
      this.options.providerConfig,
    );
    return this.ledger.hydrateLegacyPreparedIdentity({
      attemptId: this.attemptIdentity.attemptId,
      expectedApprovalId: input.expectedApprovalId,
      expectedApprovalBindingRevision: input.expectedApprovalBindingRevision,
      reconstructed,
      now: this.options.trustedTime.now(),
    });
  }

  async rebindPreparedApproval(
    input: Provider02bJitApprovalRebindRequestV1,
  ): Promise<Provider02bAttemptLedgerV1> {
    const current = this.readLedger();
    if (
      current.state !== "PREPARED" ||
      current.providerInvocationCount !== 0 ||
      current.sendStartedAt !== undefined ||
      current.providerOperationId !== undefined ||
      current.reconciliationStatus !== undefined ||
      current.queueOutcome !== undefined ||
      current.bindings?.decisionId !== undefined ||
      current.bindings?.logicalWorkId !== undefined ||
      current.bindings?.deliveryId !== undefined ||
      current.bindings?.claimId !== undefined ||
      current.bindings?.durableExecutionId !== undefined ||
      current.bindings?.correlationId !== undefined
    )
      throw new Provider02bRunnerError(
        "JIT approval rebind requires an unconsumed PREPARED attempt.",
      );
    if (!current.bindings || current.bindings.approvalId !== input.expectedApprovalId)
      throw new Provider02bRunnerError(
        "JIT approval rebind expected the current approval binding.",
      );
    if (current.approvalBindingRevision !== input.expectedApprovalBindingRevision)
      throw new Provider02bRunnerError("JIT approval rebind revision is stale.");

    const oldBinding = this.options.approvalRuntime.getApprovalBinding(input.expectedApprovalId);
    if (!oldBinding)
      throw new Provider02bRunnerError("The current approval binding is not durably available.");
    const oldObservation = await this.options.approvalRuntime.readApproval(
      input.expectedApprovalId,
    );
    if (oldObservation.state !== "EXPIRED" && oldObservation.state !== "REVOKED")
      throw new Provider02bRunnerError(
        "JIT approval rebind requires a durable reread proving the current approval is expired or revoked.",
      );
    if (oldObservation.decisionId !== undefined || current.bindings.decisionId !== undefined)
      throw new Provider02bRunnerError(
        "JIT approval rebind cannot replace an approval with a decision.",
      );

    const replacement = input.replacement;
    if (
      replacement.composition.status !== "COMPOSED" ||
      replacement.composition.actionIntent.action !== "SEND_APPOINTMENT_DETAILS" ||
      replacement.composition.admission.status !== "WAITING_FOR_APPROVAL" ||
      replacement.composition.admission.approvalId !== replacement.binding.approvalId ||
      replacement.binding.approvalId === input.expectedApprovalId
    )
      throw new Provider02bRunnerError(
        "JIT approval rebind replacement is not a fresh waiting approval for this attempt.",
      );
    const replacementBinding = this.options.approvalRuntime.getApprovalBinding(
      replacement.binding.approvalId,
    );
    if (!replacementBinding || hash(replacementBinding) !== hash(replacement.binding))
      throw new Provider02bRunnerError(
        "JIT approval rebind replacement is not the trusted durable host binding.",
      );
    const replacementObservation = await this.options.approvalRuntime.readApproval(
      replacement.binding.approvalId,
    );
    if (
      replacementObservation.state !== "PENDING" ||
      replacementObservation.decisionId !== undefined
    )
      throw new Provider02bRunnerError(
        "JIT approval rebind requires a fresh pending replacement approval.",
      );

    const oldRequestFingerprint = current.bindings.requestFingerprint;
    const oldIdentity = actionIdentityForBinding(oldBinding, oldRequestFingerprint);
    const replacementPreparedBinding = preparedApprovalBinding(
      replacement,
      this.options.providerConfig,
    );
    const replacementIdentity = actionIdentityForBinding(
      replacementBinding,
      replacementPreparedBinding.requestFingerprint,
    );
    if (hash(oldIdentity) !== hash(replacementIdentity))
      throw new Provider02bRunnerError(
        "JIT approval rebind replacement does not bind the exact same action identity.",
      );

    return this.ledger.rebindPreparedApproval({
      attemptId: this.attemptIdentity.attemptId,
      expectedApprovalId: input.expectedApprovalId,
      expectedApprovalBindingRevision: input.expectedApprovalBindingRevision,
      replacement: replacementPreparedBinding,
      now: this.options.trustedTime.now(),
    });
  }

  async submitHumanDecision(input: {
    readonly approvalId: string;
    readonly envelope: unknown;
  }): Promise<Mp05ApprovalOutcomeV1> {
    const current = this.readLedger();
    if (current.state !== "PREPARED" || current.bindings?.approvalId !== input.approvalId)
      throw new Provider02bRunnerError("Human decision is not bound to the prepared attempt.");
    const outcome = await this.options.approvalRuntime.submitDecision(input);
    const observation = await this.options.approvalRuntime.readApproval(input.approvalId);
    if (observation.state === "APPROVED" || observation.state === "REJECTED")
      this.ledger.recordApproval(
        observation.state,
        observation.decisionId,
        this.options.trustedTime.now(),
      );
    return outcome;
  }

  async enqueueAndClaim(): Promise<Provider02bClaimedRunV1> {
    if (!this.options.queueRuntime)
      throw new Provider02bRunnerError("Provider-02B queue runtime is required after approval.");
    const current = this.readLedger();
    if (current.state !== "APPROVED" || !current.bindings?.approvalId)
      throw new Provider02bRunnerError("Queue admission requires a durably approved attempt.");
    const enqueue = await this.options.queueRuntime.enqueueApproved(current.bindings.approvalId);
    const claim = await this.options.queueRuntime.claim({
      deliveryId: enqueue.work.deliveryId,
      workerId: this.options.workerId,
    });
    if (claim.status !== "READY_FOR_MP04" || !claim.claim)
      throw new Provider02bRunnerError("Provider-02B work did not reach READY_FOR_MP04.");
    const ledger = this.ledger.recordClaim({
      logicalWorkId: enqueue.work.workId,
      deliveryId: enqueue.work.deliveryId,
      claimId: claim.claim.claimId,
      claimGeneration: claim.claim.generation,
      correlationId: correlationFor(
        this.attemptIdentity.attemptId,
        enqueue.work.workId,
        claim.claim.claimId,
        claim.claim.generation,
      ),
      now: this.options.trustedTime.now(),
    });
    this.lastClaim = claim.claim;
    return { approval: enqueue.approval, enqueue, claim, ledger };
  }

  async executeOnce(authorization: string): Promise<Provider02bExecutionRunV1> {
    const expected =
      this.options.transportMode === "LIVE"
        ? PROVIDER_02B_LIVE_AUTHORIZATION
        : PROVIDER_02B_OFFLINE_AUTHORIZATION;
    if (authorization !== expected)
      throw new Provider02bRunnerError(
        this.options.transportMode === "LIVE"
          ? "Live execution requires the exact Provider-02B authorization phrase."
          : "Offline execution requires OFFLINE_DRY_RUN.",
      );
    if (!this.options.queueRuntime || !this.lastClaim)
      throw new Provider02bRunnerError("Execution requires the current approved claim handle.");

    const current = this.readLedger();
    if (
      current.state !== "APPROVED" ||
      !current.bindings?.approvalId ||
      !current.bindings.claimId ||
      !current.bindings.deliveryId ||
      !current.bindings.decisionId ||
      !current.bindings.logicalWorkId ||
      !current.bindings.correlationId
    )
      throw new Provider02bRunnerError("Execution requires approved claimed attempt state.");

    const approvedBindings = {
      ...current.bindings,
      logicalWorkId: current.bindings.logicalWorkId!,
      decisionId: current.bindings.decisionId!,
      deliveryId: current.bindings.deliveryId!,
      claimId: current.bindings.claimId!,
      correlationId: current.bindings.correlationId!,
    };

    const binding = this.options.approvalRuntime.getApprovalBinding(approvedBindings.approvalId);
    if (!binding) throw new Provider02bRunnerError("Attempt execution binding is unavailable.");
    const claim = this.lastClaim;
    let invocation: SesProviderInvocationResultV1 | undefined;
    let reconciliation: SesHoraeReconciliationInputV1 | undefined;
    let durableRecord: Record<string, unknown> | undefined;

    const horae: Mp04HoraePort = {
      execute: async (input) => {
        const before = this.readLedger();
        if (stateOrder[before.state] >= stateOrder.SEND_STARTED)
          throw new Provider02bRunnerError(
            "The Provider-02B attempt is consumed; refusing a second provider call.",
          );
        const authority = isRecord(input.authority) ? input.authority : undefined;
        const durableExecutionId = authority?.durableExecutionId;
        if (typeof durableExecutionId !== "string")
          throw new Provider02bRunnerError(
            "MP-04 authority did not provide a durable execution identity.",
          );
        const identity = {
          logicalWorkId: approvedBindings.logicalWorkId,
          actionIntentDigest: approvedBindings.actionIntentDigest,
          actionIntentIdempotencyKey: approvedBindings.actionIntentIdempotencyKey,
          approvalId: approvedBindings.approvalId,
          decisionId: approvedBindings.decisionId,
          claimGeneration: approvedBindings.claimGeneration ?? 0,
          executionId: durableExecutionId,
          attemptId: this.attemptIdentity.attemptId,
          correlationId: approvedBindings.correlationId,
        } as const;
        const prepared = prepareSesAppointmentDetailsRequest({
          intent: binding.intent,
          config: this.options.providerConfig,
          identity,
          approvedBinding: {
            approvalId: approvedBindings.approvalId,
            decisionId: approvedBindings.decisionId,
            actionIntentDigest: approvedBindings.actionIntentDigest,
          },
        });
        this.ledger.sendStarted({ durableExecutionId, now: input.now });
        invocation = await invokePreparedSesRequest(prepared, this.options.transport, input.now);
        this.ledger.sendReturned({
          providerOperationId: invocation.providerOperationId,
          now: this.options.trustedTime.now(),
        });
        this.ledger.observing(this.options.trustedTime.now());
        const observation =
          invocation.status === "ACCEPTED"
            ? await this.options.observe({ prepared, invocation })
            : undefined;
        reconciliation = reconcileSesObservation({ prepared, invocation, observation });
        durableRecord = createHoraeRecord({
          authority: authority ?? {},
          owner: input.owner,
          claim,
          result: reconciliation,
          invocation,
          now: this.options.trustedTime.now(),
        });
        this.ledger.reconciled({
          status: reconciliation.status,
          now: this.options.trustedTime.now(),
        });
        return durableRecord;
      },
      recover: async () => {
        throw new Provider02bRunnerError(
          "Provider-02B never recovers or retries an attempted send.",
        );
      },
      get: (durableExecutionId) =>
        durableRecord?.durableExecutionId === durableExecutionId ? clone(durableRecord) : undefined,
    };

    const coordinator = createMp04ExecutionCoordinator({
      ananke: this.options.approvalRuntime.getMp04AnankePort(),
      horae,
      effectAdapter: SES_EFFECT_ADAPTER_ID as Mp04EffectAdapterIdentityV1,
      owner: this.options.workerId,
      provenance: MP04_DEPENDENCY_PROVENANCE,
      trustedExecutionConfig: {
        appointmentDetailsRecipient: this.options.providerConfig.allowedRecipientAddress,
      },
    });
    this.lastExecution = coordinator;
    const queue = await this.options.queueRuntime.executeClaimed({
      deliveryId: approvedBindings.deliveryId,
      claim,
      execution: coordinator as Mp04ExecutionPort,
    });
    if (reconciliation && queue.queueOutcome)
      this.ledger.recordQueueOutcome(queue.queueOutcome, this.options.trustedTime.now());
    return {
      queue,
      ...(queue.execution ? { execution: queue.execution } : {}),
      ...(invocation ? { invocation } : {}),
      ...(reconciliation ? { reconciliation } : {}),
      ledger: this.readLedger(),
    };
  }

  readLastExecution(input: {
    readonly durableExecutionId: string;
    readonly sourceRequestId: string;
    readonly actionIntentDigest: string;
    readonly actionIntentIdempotencyKey: string;
    readonly approvalId?: string;
    readonly expectedNativeActionHash?: string;
  }): Mp04ExecutionResultV1 | undefined {
    return this.lastExecution?.readExecution(input);
  }
}

export function createProvider02bRunner(options: Provider02bRunnerOptions): Provider02bRunner {
  return new Provider02bRunner(options);
}

export type Provider02bNativeBindingsV1 = Readonly<{
  readonly binding: Mp08bApprovalBindingV1;
  readonly admission: Extract<MoiraeAdmissionResultV1, { status: "ADMITTED" }>;
  readonly authenticatedContext: Mp03AuthenticatedContext;
}>;

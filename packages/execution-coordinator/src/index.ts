import {
  ActionIntentV1Schema,
  actionIntentCoreFromIntent,
  actionIntentDigest,
  actionIntentIdempotencyKey,
  canonicalizeJsonV1,
  type ActionIntentV1,
} from "../../action-compiler/src/index.js";
import {
  MP03_ACCEPTED_ARGUMENT_FIXTURES,
  MP03_ADRASTEIA_SHA,
  MP03_DEPENDENCY_PROVENANCE,
  MP03_FATES_PROFILE,
  MP03_NATIVE_HASH_FIXTURES,
  MP03_POLICY_VERSION,
  MP03_PROFILE,
  Mp03AuthenticatedContextSchema,
  MoiraeAdmissionResultV1Schema,
  type Mp03Action,
  type Mp03AuthenticatedContext,
} from "../../fates-adapter/src/index.js";

export const MP04_FATES_PROFILE =
  "ananke-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0" as const;
export const MP04_ANANKE_TAG_OBJECT_SHA = "9fb9fc4d8183db64aa37f0a4e167fdf41ca856e5" as const;
export const MP04_ANANKE_SHA = "114063e03332af3389fe805193e88a62111d9323" as const;
export const MP04_HORAE_TAG_OBJECT_SHA = "59763d34644567c59d1041b3acef24efc5a1d072" as const;
export const MP04_HORAE_SHA = "aa296b420fbcf578089ca66dc03f6d09d9b06f00" as const;
export const MP04_HORAE_RUNTIME_SHA = "7b24cb0af083e505bd2dc9fa55c6c3387f849131" as const;
export const MP04_ADRASTEIA_SHA = "a1c01bf9e6f9d6a126cfdcc1acfacd488b214210" as const;
export const MP04_FATES_INTEGRATION_EVIDENCE_SHA =
  "3c7b1f9916833728882e71f79a7276e9a806f808" as const;

export const MP04_DEPENDENCY_PROVENANCE = Object.freeze({
  profile: "moirae-protocol-mp04-fates-v1",
  adrasteiaSha: MP04_ADRASTEIA_SHA,
  ananke: {
    ref: MP04_FATES_PROFILE,
    tagObject: MP04_ANANKE_TAG_OBJECT_SHA,
    sha: MP04_ANANKE_SHA,
  },
  horae: {
    ref: "horae-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0",
    tagObject: MP04_HORAE_TAG_OBJECT_SHA,
    sha: MP04_HORAE_SHA,
    runtimeSha: MP04_HORAE_RUNTIME_SHA,
  },
  mnemosyne: "not-required",
} as const);

const hashSchema = /^[a-f0-9]{64}$/;
const digestSchema = /^sha256:[a-f0-9]{64}$/;
const durableIdSchema = /^fates-execution:sha256:[a-f0-9]{64}$/;
const timestampSchema = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface Mp04OperationV1 {
  readonly server: string;
  readonly toolName: string;
  readonly version: string;
}

export interface Mp04EffectAdapterIdentityV1 {
  readonly id: string;
  readonly version: string;
}

export interface Mp04NativeAdmissionV1 {
  readonly status: "ADMITTED";
  readonly decision: "ALLOW";
  readonly operation: Mp04OperationV1;
  readonly actionHash: string;
  readonly approvalGrantId?: string;
}

/**
 * Narrow structural port for the accepted Ananke FATES-007A implementation.
 * The host adapter translates this handoff to Ananke's native AdmissionResult
 * and reads the native approval store. MP-04 does not mint authority.
 */
export interface Mp04AnankePort {
  createExecutionAuthority(input: {
    operation: Mp04OperationV1;
    args: Record<string, unknown>;
    admission: Mp04NativeAdmissionV1;
    executionContext: Mp03AuthenticatedContext;
    effectAdapter: Mp04EffectAdapterIdentityV1;
    now: string;
  }): unknown | Promise<unknown>;
  hashArgumentsDigest(args: Record<string, unknown>): string;
  hashTargetDigest(resourceScope: Record<string, unknown>): string;
}

export type Mp04HoraeExecutionStateV1 =
  | "authority_validated"
  | "execution_reserved"
  | "executor_invocation_started"
  | "effect_reconciliation_required"
  | "terminal";

/** Structural port over Horae's accepted FATES-007A coordinator. */
export interface Mp04HoraePort {
  execute(input: {
    authority: unknown;
    args: Record<string, unknown>;
    owner: string;
    now: string;
  }): Promise<unknown>;
  recover(input: {
    durableExecutionId: string;
    args: Record<string, unknown>;
    owner: string;
    now: string;
  }): Promise<unknown>;
  get(durableExecutionId: string): unknown;
}

/** Routing evidence only; this never substitutes for native durable state. */
export interface Mp04ExecutionIndexEntryV1 {
  schemaVersion: "1";
  idempotencyKey: string;
  sourceRequestId: string;
  durableExecutionId: string;
  nativeActionHash: string;
  operation: Mp04OperationV1;
}

export interface Mp04ExecutionIndex {
  get(idempotencyKey: string): Mp04ExecutionIndexEntryV1 | undefined;
  put(entry: Mp04ExecutionIndexEntryV1): void;
}

export class InMemoryMp04ExecutionIndex implements Mp04ExecutionIndex {
  private readonly entries = new Map<string, Mp04ExecutionIndexEntryV1>();

  get(idempotencyKey: string): Mp04ExecutionIndexEntryV1 | undefined {
    const entry = this.entries.get(idempotencyKey);
    return entry ? clone(entry) : undefined;
  }

  put(entry: Mp04ExecutionIndexEntryV1): void {
    this.entries.set(entry.idempotencyKey, clone(entry));
  }
}

export type Mp04BoundaryReason =
  | "invalid_action_intent"
  | "admission_not_executable"
  | "mp03_binding_mismatch"
  | "dependency_checkpoint_mismatch"
  | "authority_creation_failed"
  | "native_action_mismatch"
  | "durable_identity_mismatch"
  | "horae_record_failed"
  | "claim_failed"
  | "execution_boundary_failure"
  | "malformed_fates_result"
  | "receipt_binding_mismatch"
  | "recovery_boundary_failure";

export type Mp04ResultStatus =
  "CONFIRMED" | "ABSENT" | "UNKNOWN" | "RECOVERY_REQUIRED" | "BOUNDARY_FAILURE";

export interface Mp04ExecutionEvidenceV1 {
  schemaVersion: "1";
  sourceRequestId?: string;
  canonicalDigest?: string;
  idempotencyKey?: string;
  action?: Mp03Action;
  dependencyProfile: typeof MP04_DEPENDENCY_PROVENANCE.profile;
  adrasteiaSha: typeof MP04_ADRASTEIA_SHA;
  anankeSha: typeof MP04_ANANKE_SHA;
  horaeSha: typeof MP04_HORAE_SHA;
  operation?: Mp04OperationV1;
  nativeActionHash?: string;
  authorityInstanceDigest?: string;
  approvalGrantId?: string;
  approvalStatus?: "approved" | "not_requested" | "unknown";
  policyVersion?: string;
  resourceScope?: Record<string, unknown>;
  purpose?: string;
  durableExecutionId?: string;
  claimOwner?: string;
  claimGeneration?: number;
  claimDigest?: string;
  effectAdapter?: Mp04EffectAdapterIdentityV1;
  durableState?: Mp04HoraeExecutionStateV1;
  nativeResult?: "CONFIRMED" | "ABSENT" | "UNKNOWN";
  receiptChecksum?: string;
  reconciliationRequired: boolean;
  redispatchAttempted: false;
  events: readonly string[];
  observedAt: string;
}

export interface Mp04ExecutionResultV1 {
  schemaVersion: "1";
  status: Mp04ResultStatus;
  reason?: Mp04BoundaryReason;
  message?: string;
  durableExecutionId?: string;
  nativeActionHash?: string;
  executionState?: Mp04HoraeExecutionStateV1;
  evidence: Mp04ExecutionEvidenceV1;
}

export interface Mp04ExecutionCoordinatorOptions {
  ananke: Mp04AnankePort;
  horae: Mp04HoraePort;
  effectAdapter: Mp04EffectAdapterIdentityV1;
  owner: string;
  provenance: unknown;
  index?: Mp04ExecutionIndex;
  evidenceSink?: (evidence: Mp04ExecutionEvidenceV1) => void;
}

interface ValidatedActionInput {
  intent: ActionIntentV1;
  context: Mp03AuthenticatedContext;
  action: Mp03Action;
  operation: Mp04OperationV1;
  args: Record<string, unknown>;
  canonicalDigest: string;
  idempotencyKey: string;
  nativeActionHash: string;
  approvalId?: string;
  now?: string;
}

interface HoraeRecord {
  durableExecutionId: string;
  authority: Record<string, unknown>;
  authorityInstanceDigest: string;
  nativeActionHash: string;
  operation: Mp04OperationV1;
  argumentsDigest: string;
  targetDigest: string;
  effectAdapter: Mp04EffectAdapterIdentityV1;
  state: Mp04HoraeExecutionStateV1;
  history: Array<{ state: Mp04HoraeExecutionStateV1; event: string }>;
  claim?: { owner: string; generation: number; claimDigest: string };
  receipt?: { result: "CONFIRMED" | "ABSENT" | "UNKNOWN"; checksum: string };
  result?: "CONFIRMED" | "ABSENT" | "UNKNOWN";
  reason?: string;
  updatedAt: string;
}

class BoundaryError extends Error {
  constructor(
    readonly reason: Mp04BoundaryReason,
    message: string,
  ) {
    super(message);
    this.name = "Mp04BoundaryError";
  }
}

export class Mp04ExecutionCoordinator {
  private readonly index: Mp04ExecutionIndex;

  constructor(private readonly options: Mp04ExecutionCoordinatorOptions) {
    if (!options.ananke || typeof options.ananke.createExecutionAuthority !== "function")
      throw new TypeError("MP-04 requires an accepted Ananke authority port.");
    if (!options.horae || typeof options.horae.execute !== "function")
      throw new TypeError("MP-04 requires an accepted Horae durable execution port.");
    if (!options.owner.trim()) throw new TypeError("MP-04 requires a non-empty process owner.");
    if (!options.effectAdapter.id.trim() || !options.effectAdapter.version.trim())
      throw new TypeError("MP-04 requires an effect-adapter identity.");
    if (!sameJson(options.provenance, MP04_DEPENDENCY_PROVENANCE))
      throw new TypeError("MP-04 dependency provenance does not match the sealed Fates pair.");
    this.index = options.index ?? new InMemoryMp04ExecutionIndex();
  }

  async executeAdmittedAction(input: unknown): Promise<Mp04ExecutionResultV1> {
    let validated: ValidatedActionInput;
    try {
      validated = validateActionInput(input, true);
    } catch (error) {
      return this.failure(error, "admission_not_executable");
    }
    const baseEvidence = evidenceFor(
      validated,
      this.options.effectAdapter,
      validated.now ?? new Date().toISOString(),
    );

    try {
      const existing = this.index.get(validated.idempotencyKey);
      if (existing) {
        if (
          existing.idempotencyKey !== validated.idempotencyKey ||
          existing.sourceRequestId !== validated.intent.sourceRequestId ||
          existing.nativeActionHash !== validated.nativeActionHash ||
          !sameJson(existing.operation, validated.operation)
        )
          throw new BoundaryError(
            "durable_identity_mismatch",
            "MP-04 execution index binding mismatch.",
          );
        const existingRecord = parseHoraeRecord(
          this.options.horae.get(existing.durableExecutionId),
        );
        validateActionAgainstRecord(
          validated.intent,
          validated.context,
          existingRecord,
          this.options,
        );
        if (
          existingRecord.state === "terminal" ||
          existingRecord.state === "effect_reconciliation_required"
        )
          return this.finish(existingRecord, baseEvidence);
      }

      const authority = await this.options.ananke.createExecutionAuthority({
        operation: validated.operation,
        args: validated.args,
        admission: {
          status: "ADMITTED",
          decision: "ALLOW",
          operation: validated.operation,
          actionHash: validated.nativeActionHash,
          ...(validated.approvalId ? { approvalGrantId: validated.approvalId } : {}),
        },
        executionContext: validated.context,
        effectAdapter: this.options.effectAdapter,
        now: validated.now!,
      });
      const authorityRecord = validateAuthorityShape(
        authority,
        validated,
        this.options.effectAdapter,
        this.options.ananke,
      );
      const record = parseHoraeRecord(
        await this.options.horae.execute({
          authority: authorityRecord,
          args: validated.args,
          owner: this.options.owner,
          now: validated.now!,
        }),
      );
      if (
        record.durableExecutionId !== authorityRecord.durableExecutionId ||
        record.nativeActionHash !== authorityRecord.nativeActionHash
      )
        throw new BoundaryError(
          "durable_identity_mismatch",
          "Horae returned a record that is not bound to the native Ananke identity.",
        );
      this.index.put({
        schemaVersion: "1",
        idempotencyKey: validated.idempotencyKey,
        sourceRequestId: validated.intent.sourceRequestId,
        durableExecutionId: record.durableExecutionId,
        nativeActionHash: record.nativeActionHash,
        operation: record.operation,
      });
      return this.finish(record, {
        ...baseEvidence,
        authorityInstanceDigest: record.authorityInstanceDigest,
        durableExecutionId: record.durableExecutionId,
      });
    } catch (error) {
      return this.failure(error, "execution_boundary_failure", baseEvidence);
    }
  }

  async recoverActionExecution(input: unknown): Promise<Mp04ExecutionResultV1> {
    try {
      const parsed = parseRecoveryInput(input);
      const record = parseHoraeRecord(this.options.horae.get(parsed.durableExecutionId));
      const validated = validateActionAgainstRecord(
        parsed.intent,
        parsed.authenticatedContext,
        record,
        this.options,
      );
      const baseEvidence = evidenceFor(validated, this.options.effectAdapter, parsed.now);
      if (record.state === "terminal") return this.finish(record, baseEvidence);
      const recovered = parseHoraeRecord(
        await this.options.horae.recover({
          durableExecutionId: parsed.durableExecutionId,
          args: validated.args,
          owner: this.options.owner,
          now: parsed.now,
        }),
      );
      this.index.put({
        schemaVersion: "1",
        idempotencyKey: validated.idempotencyKey,
        sourceRequestId: validated.intent.sourceRequestId,
        durableExecutionId: recovered.durableExecutionId,
        nativeActionHash: recovered.nativeActionHash,
        operation: recovered.operation,
      });
      return this.finish(recovered, baseEvidence);
    } catch (error) {
      return this.failure(error, "recovery_boundary_failure");
    }
  }

  private finish(
    record: HoraeRecord,
    baseEvidence: Mp04ExecutionEvidenceV1,
  ): Mp04ExecutionResultV1 {
    const nativeResult = record.result ?? record.receipt?.result;
    const status: Mp04ResultStatus =
      record.state === "terminal" && nativeResult
        ? nativeResult
        : record.state === "effect_reconciliation_required"
          ? "UNKNOWN"
          : "RECOVERY_REQUIRED";
    const evidence: Mp04ExecutionEvidenceV1 = {
      ...baseEvidence,
      durableExecutionId: record.durableExecutionId,
      nativeActionHash: record.nativeActionHash,
      authorityInstanceDigest: record.authorityInstanceDigest,
      durableState: record.state,
      ...(record.claim
        ? {
            claimOwner: record.claim.owner,
            claimGeneration: record.claim.generation,
            claimDigest: record.claim.claimDigest,
          }
        : {}),
      ...(record.receipt
        ? { nativeResult: record.receipt.result, receiptChecksum: record.receipt.checksum }
        : {}),
      reconciliationRequired: status === "UNKNOWN" || status === "RECOVERY_REQUIRED",
      redispatchAttempted: false,
      events: record.history.map(({ event }) => event),
      observedAt: record.updatedAt,
    };
    this.options.evidenceSink?.(evidence);
    return {
      schemaVersion: "1",
      status,
      ...(record.reason ? { message: record.reason } : {}),
      durableExecutionId: record.durableExecutionId,
      nativeActionHash: record.nativeActionHash,
      executionState: record.state,
      evidence,
    };
  }

  private failure(
    error: unknown,
    fallback: Mp04BoundaryReason,
    evidence?: Mp04ExecutionEvidenceV1,
  ): Mp04ExecutionResultV1 {
    const reason = error instanceof BoundaryError ? error.reason : fallback;
    const message =
      error instanceof Error ? error.message : "MP-04 rejected the execution boundary.";
    const failureEvidence = evidence ?? emptyEvidence(new Date().toISOString());
    const result: Mp04ExecutionResultV1 = {
      schemaVersion: "1",
      status: "BOUNDARY_FAILURE",
      reason,
      message,
      evidence: failureEvidence,
    };
    this.options.evidenceSink?.(failureEvidence);
    return result;
  }
}

export function createMp04ExecutionCoordinator(
  options: Mp04ExecutionCoordinatorOptions,
): Mp04ExecutionCoordinator {
  return new Mp04ExecutionCoordinator(options);
}

function validateActionInput(
  input: unknown,
  requireAdmission: true,
): ValidatedActionInput & { approvalId: string; now: string };
function validateActionInput(input: unknown, requireAdmission: false): ValidatedActionInput;
function validateActionInput(input: unknown, requireAdmission: boolean): ValidatedActionInput {
  if (!isObject(input))
    throw new BoundaryError("invalid_action_intent", "MP-04 input must be an object.");
  const intentResult = ActionIntentV1Schema.safeParse(input.intent);
  if (!intentResult.success)
    throw new BoundaryError("invalid_action_intent", "ActionIntentV1 is invalid.");
  const intent = intentResult.data;
  let canonicalDigest: string;
  let idempotencyKey: string;
  try {
    canonicalDigest = actionIntentDigest(actionIntentCoreFromIntent(intent));
    idempotencyKey = actionIntentIdempotencyKey(intent.sourceRequestId, canonicalDigest);
  } catch {
    throw new BoundaryError(
      "invalid_action_intent",
      "ActionIntentV1 integrity fields cannot be reproduced.",
    );
  }
  if (canonicalDigest !== intent.canonicalDigest || idempotencyKey !== intent.idempotencyKey)
    throw new BoundaryError(
      "invalid_action_intent",
      "ActionIntentV1 integrity fields do not verify.",
    );

  const contextResult = Mp03AuthenticatedContextSchema.safeParse(input.authenticatedContext);
  if (!contextResult.success)
    throw new BoundaryError(
      "mp03_binding_mismatch",
      "The authenticated execution context is invalid.",
    );
  const context = contextResult.data;
  const action = intent.action as Mp03Action;
  const profile = MP03_PROFILE[action];
  if (
    intent.principal.agentPrincipalId !== context.actingPrincipal.id ||
    context.correlation.requestId !== intent.sourceRequestId ||
    intent.requester.customerId !== "CUSTOMER-001" ||
    context.representedPrincipal.id !== "moirae-requester-CUSTOMER-001" ||
    !sameJson(context.resourceScope, profile.scope) ||
    context.purpose !== profile.purpose ||
    context.policyVersion !== MP03_POLICY_VERSION
  )
    throw new BoundaryError(
      "mp03_binding_mismatch",
      "ActionIntentV1 and authenticated MP-03 context differ.",
    );
  if (!sameJson(intent.parameters, MP03_ACCEPTED_ARGUMENT_FIXTURES[action]))
    throw new BoundaryError(
      "mp03_binding_mismatch",
      "ActionIntentV1 parameters are outside the accepted fixture.",
    );

  const base: ValidatedActionInput = {
    intent,
    context,
    action,
    operation: profile.operation,
    args: { ...intent.parameters },
    canonicalDigest,
    idempotencyKey,
    nativeActionHash: MP03_NATIVE_HASH_FIXTURES[action],
  };
  if (!requireAdmission) return base;

  const admissionResult = MoiraeAdmissionResultV1Schema.safeParse(input.admission);
  if (!admissionResult.success || admissionResult.data.status !== "ADMITTED")
    throw new BoundaryError(
      "admission_not_executable",
      "Only an MP-03 ADMITTED result can enter MP-04.",
    );
  const admission = admissionResult.data;
  if (
    admission.authority !== "admission-only" ||
    admission.nativeDecision !== "ALLOW" ||
    admission.action !== action ||
    !sameJson(admission.operation, base.operation) ||
    admission.nativeActionHash !== base.nativeActionHash ||
    admission.evidence.admissionStatus !== "ADMITTED" ||
    admission.evidence.nativeActionHash !== admission.nativeActionHash ||
    admission.evidence.sourceRequestId !== intent.sourceRequestId ||
    admission.evidence.moiraeCanonicalDigest !== intent.canonicalDigest ||
    admission.evidence.moiraeIdempotencyKey !== intent.idempotencyKey ||
    admission.evidence.action !== action ||
    admission.evidence.dependencyProfile !== MP03_FATES_PROFILE ||
    admission.evidence.anankeSha !== MP03_DEPENDENCY_PROVENANCE.anankeSha ||
    admission.evidence.adrasteiaSha !== MP03_ADRASTEIA_SHA ||
    admission.evidence.contextTimestamp !== intent.contextTimestamp ||
    admission.evidence.resourceScopeReference !== intent.resource.resourceId ||
    admission.evidence.purpose !== profile.purpose ||
    admission.executorInvoked ||
    admission.effectExecuted
  )
    throw new BoundaryError(
      "mp03_binding_mismatch",
      "MP-03 admission evidence is not bound to this exact action.",
    );
  if (!admission.approvalId || admission.evidence.approvalId !== admission.approvalId)
    throw new BoundaryError(
      "admission_not_executable",
      "The accepted fixture requires a native approved grant.",
    );
  if (
    typeof input.now !== "string" ||
    !timestampSchema.test(input.now) ||
    !Number.isFinite(Date.parse(input.now))
  )
    throw new BoundaryError(
      "execution_boundary_failure",
      "MP-04 requires an explicit trusted UTC time.",
    );
  return {
    ...base,
    approvalId: admission.approvalId,
    now: new Date(Date.parse(input.now)).toISOString(),
  };
}

function parseRecoveryInput(input: unknown): {
  durableExecutionId: string;
  intent: unknown;
  authenticatedContext: unknown;
  now: string;
} {
  if (!isObject(input))
    throw new BoundaryError("recovery_boundary_failure", "Recovery input must be an object.");
  if (
    typeof input.durableExecutionId !== "string" ||
    !durableIdSchema.test(input.durableExecutionId)
  )
    throw new BoundaryError(
      "recovery_boundary_failure",
      "Recovery requires a native durable execution ID.",
    );
  if (
    typeof input.now !== "string" ||
    !timestampSchema.test(input.now) ||
    !Number.isFinite(Date.parse(input.now))
  )
    throw new BoundaryError(
      "recovery_boundary_failure",
      "Recovery requires an explicit trusted UTC time.",
    );
  return {
    durableExecutionId: input.durableExecutionId,
    intent: input.intent,
    authenticatedContext: input.authenticatedContext,
    now: new Date(Date.parse(input.now)).toISOString(),
  };
}

function validateActionAgainstRecord(
  intentInput: unknown,
  contextInput: unknown,
  record: HoraeRecord,
  options: Mp04ExecutionCoordinatorOptions,
): ValidatedActionInput {
  const base = validateActionInput(
    { intent: intentInput, authenticatedContext: contextInput },
    false,
  );
  const expectedRequestIdentity = {
    requestId: base.context.correlation.requestId,
    correlationId: base.context.correlation.correlationId,
    ...(base.context.correlation.causationId
      ? { causationId: base.context.correlation.causationId }
      : {}),
  };
  if (
    record.durableExecutionId !== record.authority.durableExecutionId ||
    record.nativeActionHash !== base.nativeActionHash ||
    !sameJson(record.operation, base.operation) ||
    record.argumentsDigest !== options.ananke.hashArgumentsDigest(base.args) ||
    record.targetDigest !== options.ananke.hashTargetDigest(base.context.resourceScope) ||
    !sameJson(record.authority.authenticatedContext, base.context) ||
    !sameJson(record.authority.requestIdentity, expectedRequestIdentity) ||
    record.authority.purpose !== base.context.purpose ||
    record.authority.policyVersion !== base.context.policyVersion ||
    record.authority.argumentsDigest !== record.argumentsDigest ||
    record.authority.targetDigest !== record.targetDigest ||
    record.effectAdapter.id !== options.effectAdapter.id ||
    record.effectAdapter.version !== options.effectAdapter.version
  )
    throw new BoundaryError(
      "durable_identity_mismatch",
      "Recovery material does not match native durable state.",
    );
  return base;
}

function validateAuthorityShape(
  value: unknown,
  input: ValidatedActionInput,
  adapter: Mp04EffectAdapterIdentityV1,
  ananke: Mp04AnankePort,
): Record<string, unknown> {
  if (!isObject(value))
    throw new BoundaryError("authority_creation_failed", "Ananke returned no authority envelope.");
  const authority = value;
  if (
    authority.schemaVersion !== "1" ||
    typeof authority.durableExecutionId !== "string" ||
    !durableIdSchema.test(authority.durableExecutionId) ||
    authority.nativeActionHash !== input.nativeActionHash ||
    !sameJson(authority.operation, input.operation) ||
    !sameJson(authority.authenticatedContext, input.context) ||
    !sameJson(authority.resourceScope, input.context.resourceScope) ||
    authority.purpose !== input.context.purpose ||
    authority.policyVersion !== input.context.policyVersion ||
    !isAdapter(authority.effectAdapter) ||
    !sameJson(authority.effectAdapter, adapter) ||
    typeof authority.argumentsDigest !== "string" ||
    !digestSchema.test(authority.argumentsDigest) ||
    typeof authority.targetDigest !== "string" ||
    !digestSchema.test(authority.targetDigest) ||
    typeof authority.authorityInstanceDigest !== "string" ||
    !digestSchema.test(authority.authorityInstanceDigest)
  )
    throw new BoundaryError(
      "authority_creation_failed",
      "Ananke authority is not bound to the admitted action.",
    );
  if (
    authority.argumentsDigest !== ananke.hashArgumentsDigest(input.args) ||
    authority.targetDigest !== ananke.hashTargetDigest(input.context.resourceScope)
  )
    throw new BoundaryError(
      "authority_creation_failed",
      "Ananke authority argument digest is invalid.",
    );
  if (!isObject(authority.requestIdentity))
    throw new BoundaryError(
      "authority_creation_failed",
      "Ananke authority request identity is missing.",
    );
  const expectedRequestIdentity = {
    requestId: input.context.correlation.requestId,
    correlationId: input.context.correlation.correlationId,
    ...(input.context.correlation.causationId
      ? { causationId: input.context.correlation.causationId }
      : {}),
  };
  if (!sameJson(authority.requestIdentity, expectedRequestIdentity))
    throw new BoundaryError(
      "authority_creation_failed",
      "Ananke authority request identity is not exact.",
    );
  if (
    input.approvalId &&
    (!isObject(authority.approval) || authority.approval.grantId !== input.approvalId)
  )
    throw new BoundaryError(
      "authority_creation_failed",
      "Ananke did not bind the admitted approval grant.",
    );
  return authority;
}

function parseHoraeRecord(value: unknown): HoraeRecord {
  if (!isObject(value))
    throw new BoundaryError("horae_record_failed", "Horae returned no durable execution record.");
  const operation = value.operation;
  const effectAdapter = value.effectAdapter;
  const history = value.history;
  if (
    typeof value.durableExecutionId !== "string" ||
    !durableIdSchema.test(value.durableExecutionId) ||
    !isObject(value.authority) ||
    typeof value.authorityInstanceDigest !== "string" ||
    !digestSchema.test(value.authorityInstanceDigest) ||
    typeof value.nativeActionHash !== "string" ||
    !hashSchema.test(value.nativeActionHash) ||
    !isOperation(operation) ||
    typeof value.argumentsDigest !== "string" ||
    !digestSchema.test(value.argumentsDigest) ||
    typeof value.targetDigest !== "string" ||
    !digestSchema.test(value.targetDigest) ||
    !isAdapter(effectAdapter) ||
    ![
      "authority_validated",
      "execution_reserved",
      "executor_invocation_started",
      "effect_reconciliation_required",
      "terminal",
    ].includes(value.state as string) ||
    !Array.isArray(history) ||
    !history.every(isHistoryEntry) ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt))
  )
    throw new BoundaryError("horae_record_failed", "Horae durable execution record is malformed.");
  const claim = value.claim;
  const receipt = value.receipt;
  if (
    claim !== undefined &&
    (!isObject(claim) ||
      typeof claim.owner !== "string" ||
      !Number.isSafeInteger(claim.generation) ||
      (claim.generation as number) < 1 ||
      typeof claim.claimDigest !== "string" ||
      !digestSchema.test(claim.claimDigest))
  )
    throw new BoundaryError("claim_failed", "Horae claim material is malformed.");
  if (
    receipt !== undefined &&
    (!isObject(receipt) ||
      !["CONFIRMED", "ABSENT", "UNKNOWN"].includes(receipt.result as string) ||
      typeof receipt.checksum !== "string" ||
      !digestSchema.test(receipt.checksum))
  )
    throw new BoundaryError("receipt_binding_mismatch", "Horae receipt projection is malformed.");
  return {
    durableExecutionId: value.durableExecutionId,
    authority: value.authority,
    authorityInstanceDigest: value.authorityInstanceDigest,
    nativeActionHash: value.nativeActionHash,
    operation,
    argumentsDigest: value.argumentsDigest,
    targetDigest: value.targetDigest,
    effectAdapter,
    state: value.state as Mp04HoraeExecutionStateV1,
    history,
    ...(isObject(claim)
      ? {
          claim: {
            owner: claim.owner as string,
            generation: claim.generation as number,
            claimDigest: claim.claimDigest as string,
          },
        }
      : {}),
    ...(isObject(receipt)
      ? {
          receipt: {
            result: receipt.result as "CONFIRMED" | "ABSENT" | "UNKNOWN",
            checksum: receipt.checksum as string,
          },
        }
      : {}),
    ...(typeof value.result === "string" &&
    ["CONFIRMED", "ABSENT", "UNKNOWN"].includes(value.result)
      ? { result: value.result as "CONFIRMED" | "ABSENT" | "UNKNOWN" }
      : {}),
    ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
    updatedAt: value.updatedAt,
  };
}

function evidenceFor(
  input: ValidatedActionInput,
  adapter: Mp04EffectAdapterIdentityV1,
  observedAt: string,
): Mp04ExecutionEvidenceV1 {
  return {
    schemaVersion: "1",
    sourceRequestId: input.intent.sourceRequestId,
    canonicalDigest: input.canonicalDigest,
    idempotencyKey: input.idempotencyKey,
    action: input.action,
    dependencyProfile: MP04_DEPENDENCY_PROVENANCE.profile,
    adrasteiaSha: MP04_ADRASTEIA_SHA,
    anankeSha: MP04_ANANKE_SHA,
    horaeSha: MP04_HORAE_SHA,
    operation: input.operation,
    nativeActionHash: input.nativeActionHash,
    ...(input.approvalId
      ? { approvalGrantId: input.approvalId, approvalStatus: "approved" as const }
      : {}),
    policyVersion: input.context.policyVersion,
    resourceScope: clone(input.context.resourceScope),
    purpose: input.context.purpose,
    effectAdapter: adapter,
    reconciliationRequired: false,
    redispatchAttempted: false,
    events: ["mp03_admission_completed"],
    observedAt,
  };
}

function emptyEvidence(observedAt: string): Mp04ExecutionEvidenceV1 {
  return {
    schemaVersion: "1",
    dependencyProfile: MP04_DEPENDENCY_PROVENANCE.profile,
    adrasteiaSha: MP04_ADRASTEIA_SHA,
    anankeSha: MP04_ANANKE_SHA,
    horaeSha: MP04_HORAE_SHA,
    reconciliationRequired: false,
    redispatchAttempted: false,
    events: [],
    observedAt,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOperation(value: unknown): value is Mp04OperationV1 {
  return (
    isObject(value) &&
    typeof value.server === "string" &&
    typeof value.toolName === "string" &&
    typeof value.version === "string"
  );
}

function isAdapter(value: unknown): value is Mp04EffectAdapterIdentityV1 {
  return isObject(value) && typeof value.id === "string" && typeof value.version === "string";
}

function isHistoryEntry(
  value: unknown,
): value is { state: Mp04HoraeExecutionStateV1; event: string } {
  return (
    isObject(value) &&
    [
      "authority_validated",
      "execution_reserved",
      "executor_invocation_started",
      "effect_reconciliation_required",
      "terminal",
    ].includes(value.state as string) &&
    typeof value.event === "string"
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return canonicalizeJsonV1(left) === canonicalizeJsonV1(right);
  } catch {
    return false;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

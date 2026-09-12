import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
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
export const PROVIDER_02B_LIVE_AUTHORIZATION = "AUTHORIZE PROVIDER-02B SEND NOW" as const;
export const PROVIDER_02B_OFFLINE_AUTHORIZATION = "OFFLINE_DRY_RUN" as const;

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
  readonly logicalWorkId?: string;
  readonly deliveryId?: string;
  readonly claimId?: string;
  readonly claimGeneration?: number;
  readonly durableExecutionId?: string;
  readonly correlationId?: string;
  readonly requestFingerprint: string;
}>;

export type Provider02bAttemptLedgerV1 = Readonly<{
  readonly schemaVersion: typeof MP08B_PROVIDER_02B_VERSION;
  readonly attemptId: typeof MP08B_PROVIDER_02B_ATTEMPT_ID;
  readonly state: Provider02bAttemptState;
  readonly updatedAt: string;
  readonly bindings?: Provider02bAttemptBindingsV1;
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
}>;

export type Provider02bPreparedRunV1 = Readonly<{
  readonly prepared: Mp08bPreparedApprovalV1;
  readonly ledger: Provider02bAttemptLedgerV1;
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

function initialLedger(now: string): Provider02bAttemptLedgerV1 {
  return {
    schemaVersion: MP08B_PROVIDER_02B_VERSION,
    attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
    state: "UNUSED",
    updatedAt: now,
    providerInvocationCount: 0,
    automaticRetryCount: 0,
  };
}

function parseLedger(value: unknown): Provider02bAttemptLedgerV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Provider02bRunnerError("Provider-02B attempt ledger is malformed.");
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== MP08B_PROVIDER_02B_VERSION ||
    record.attemptId !== MP08B_PROVIDER_02B_ATTEMPT_ID ||
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
  return clone(record as unknown as Provider02bAttemptLedgerV1);
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

  constructor(path: string) {
    this.path = requireAbsoluteLedgerPath(path);
  }

  read(now = new Date().toISOString()): Provider02bAttemptLedgerV1 {
    if (!existsSync(this.path)) return initialLedger(now);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.path, "utf8")) as unknown;
    } catch {
      throw new Provider02bRunnerError("Provider-02B attempt ledger is unreadable.");
    }
    return parseLedger(raw);
  }

  private update(
    now: string,
    mutate: (current: Provider02bAttemptLedgerV1) => Provider02bAttemptLedgerV1,
  ): Provider02bAttemptLedgerV1 {
    const next = parseLedger(mutate(this.read(now)));
    atomicWrite(this.path, next);
    return next;
  }

  prepare(bindings: Provider02bAttemptBindingsV1, now: string): Provider02bAttemptLedgerV1 {
    return this.update(now, (current) => {
      if (current.state !== "UNUSED")
        throw new Provider02bRunnerError("Attempt-001 is already prepared or consumed.");
      return { ...current, state: "PREPARED", updatedAt: now, bindings: clone(bindings) };
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
          "Attempt-001 is consumed; a second provider call is forbidden.",
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

function correlationFor(workId: string, claimId: string, generation: number): string {
  return `provider-02b-r3-${hash({ attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID, claimId, generation, workId }).slice(0, 32)}`;
}

function claimDigest(claim: SchedulingClaimV1): string {
  return `sha256:${hash(claim)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  private lastExecution?: ReturnType<typeof createMp04ExecutionCoordinator>;
  private lastClaim?: SchedulingClaimV1;

  constructor(private readonly options: Provider02bRunnerOptions) {
    this.ledger = new Provider02bAttemptLedger(options.ledgerPath);
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
    const bindings: Provider02bAttemptBindingsV1 = {
      actionIntentDigest: prepared.binding.intent.canonicalDigest,
      actionIntentIdempotencyKey: prepared.binding.intent.idempotencyKey,
      approvalId: prepared.binding.approvalId,
      requestFingerprint: requestFingerprint(prepared.binding.intent, this.options.providerConfig),
    };
    const ledger = this.ledger.prepare(bindings, this.options.trustedTime.now());
    return { prepared, ledger };
  }

  async submitHumanDecision(input: {
    readonly approvalId: string;
    readonly envelope: unknown;
  }): Promise<Mp05ApprovalOutcomeV1> {
    const current = this.readLedger();
    if (current.state !== "PREPARED" || current.bindings?.approvalId !== input.approvalId)
      throw new Provider02bRunnerError("Human decision is not bound to the prepared Attempt-001.");
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
      throw new Provider02bRunnerError("Queue admission requires a durably approved Attempt-001.");
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
      throw new Provider02bRunnerError("Execution requires approved claimed Attempt-001 state.");

    const approvedBindings = {
      ...current.bindings,
      logicalWorkId: current.bindings.logicalWorkId!,
      decisionId: current.bindings.decisionId!,
      deliveryId: current.bindings.deliveryId!,
      claimId: current.bindings.claimId!,
      correlationId: current.bindings.correlationId!,
    };

    const binding = this.options.approvalRuntime.getApprovalBinding(approvedBindings.approvalId);
    if (!binding) throw new Provider02bRunnerError("Attempt-001 execution binding is unavailable.");
    const claim = this.lastClaim;
    let invocation: SesProviderInvocationResultV1 | undefined;
    let reconciliation: SesHoraeReconciliationInputV1 | undefined;
    let durableRecord: Record<string, unknown> | undefined;

    const horae: Mp04HoraePort = {
      execute: async (input) => {
        const before = this.readLedger();
        if (stateOrder[before.state] >= stateOrder.SEND_STARTED)
          throw new Provider02bRunnerError(
            "Attempt-001 is consumed; refusing a second provider call.",
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
          attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
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

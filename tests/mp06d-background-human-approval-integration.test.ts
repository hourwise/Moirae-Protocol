import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canonicalizeJsonV1,
  compileAgentProposal,
  type ActionIntentV1,
  type CompilerContextV1,
} from "../packages/action-compiler/src/index.js";
import {
  MP03_ACTING_AGENT,
  MP03_ADRASTEIA_SHA,
  MP03_ANANKE_SHA,
  MP03_AUTHENTICATED_WORKLOAD,
  MP03_CAUSATION_ID,
  MP03_DEPENDENCY_PROVENANCE,
  MP03_PROFILE,
  MP03_REQUESTER,
  MP03_RUNTIME_ID,
  MP03_RUNTIME_INSTANCE,
  MP03_SESSION_ID,
  MP03_TENANT_ID,
  MP03_NATIVE_HASH_FIXTURES,
  type Mp03Action,
  type Mp03AuthenticatedContext,
  type MoiraeAdmissionResultV1,
  type AdmitActionIntentInput,
} from "../packages/fates-adapter/src/index.js";
import {
  MP04_DEPENDENCY_PROVENANCE,
  type Mp04ExecutionResultV1,
} from "../packages/execution-coordinator/src/index.js";
import {
  MP05_FATES_DEPENDENCY_PROVENANCE,
  createMp05HumanApprovalCoordinator,
  type Mp05AnankeApprovalPort,
  type Mp05NativeApprovalDecisionInput,
} from "../packages/human-approval/src/index.js";
import {
  createQueueWork,
  deterministicQueueIdentity,
  DeterministicLocalWorker,
  DurableFilesystemActivitySink,
  DurableFilesystemLocalQueue,
  InjectedWorkerCrash,
  InMemoryActivitySink,
  InMemoryLocalQueue,
  type ActivitySink,
  type LocalQueuePort,
  type Mp04ExecutionPort,
  type QueueWorkV1,
  type TrustedTimeSource,
  type WorkerCheckpointV1,
  type WorkerFailureInjector,
  type Mp06WorkerResultV1,
  type TrustedProtocolBoundary,
} from "../packages/background-work/src/index.js";
import {
  demoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";

const NOW = "2026-09-05T12:00:00.000Z";
const LATER = "2026-09-05T12:00:01.000Z";
const EXPIRED = "2026-09-05T12:05:00.000Z";
const OPERATOR = { operatorId: "operator-a", sessionId: "session-a", roles: ["approver"] };
const actions: Mp03Action[] = [
  "SEND_APPOINTMENT_DETAILS",
  "RESCHEDULE_APPOINTMENT",
  "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
];
const nativeApprovalHashes: Record<Mp03Action, string> = {
  SEND_APPOINTMENT_DETAILS: "a".repeat(64),
  RESCHEDULE_APPOINTMENT: "b".repeat(64),
  TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: "c".repeat(64),
};
const nativePresentationHashes: Record<Mp03Action, string> = {
  SEND_APPOINTMENT_DETAILS: "d".repeat(64),
  RESCHEDULE_APPOINTMENT: "e".repeat(64),
  TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: "f".repeat(64),
};

type NativeStatus = "pending" | "approved" | "rejected" | "expired" | "revoked" | "consumed";

interface FakeNativeGrant {
  id: string;
  serverName: string;
  toolName: string;
  toolVersion: string;
  actionHash: string;
  arguments: Record<string, unknown>;
  executionContext: Mp03AuthenticatedContext;
  status: NativeStatus;
  requestedAt: string;
  expiresAt: string;
  used: boolean;
  revision: number;
  bindRequestIdentity: boolean;
  presentationVersion: string;
  presentationBindingHash: string;
  decisionId?: string;
  bindingHash?: string;
  approvedBy?: string;
  approvedBySessionId?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedBySessionId?: string;
  rejectedAt?: string;
}

class TestClock implements TrustedTimeSource {
  constructor(private current = NOW) {}

  now(): string {
    return this.current;
  }

  set(value: string): void {
    this.current = value;
  }
}

class CrashAt implements WorkerFailureInjector {
  constructor(private readonly target: WorkerCheckpointV1) {}

  checkpoint(point: WorkerCheckpointV1): void {
    if (point === this.target) throw new InjectedWorkerCrash(point);
  }
}

const testDirectories: string[] = [];

afterEach(() => {
  for (const directory of testDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function compilerContext(sourceRequestId: string): CompilerContextV1 {
  return { ...demoCompilerContext, agentPrincipalId: MP03_ACTING_AGENT, sourceRequestId };
}

function proposalFor(action: Mp03Action) {
  const proposal =
    primaryCompilerFixtures[
      action === "SEND_APPOINTMENT_DETAILS" ? 0 : action === "RESCHEDULE_APPOINTMENT" ? 1 : 2
    ].proposal;
  return action === "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"
    ? { ...proposal, recipientReference: "personal-address@example.test" }
    : proposal;
}

function compileFixture(action: Mp03Action, sourceRequestId: string): ActionIntentV1 {
  const result = compileAgentProposal({
    proposal: proposalFor(action),
    context: compilerContext(sourceRequestId),
  });
  if (result.status !== "COMPILED") throw new Error(`Fixture did not compile: ${result.status}`);
  return result.actionIntent;
}

function contextFor(action: Mp03Action, sourceRequestId: string): Mp03AuthenticatedContext {
  return {
    authenticatedPrincipal: {
      id: MP03_AUTHENTICATED_WORKLOAD,
      kind: "service",
      tenantId: MP03_TENANT_ID,
    },
    actingPrincipal: { id: MP03_ACTING_AGENT, kind: "agent", tenantId: MP03_TENANT_ID },
    representedPrincipal: { id: MP03_REQUESTER, kind: "human", tenantId: MP03_TENANT_ID },
    runtimeId: MP03_RUNTIME_ID,
    runtimeInstanceId: MP03_RUNTIME_INSTANCE,
    sessionId: MP03_SESSION_ID,
    tenantId: MP03_TENANT_ID,
    resourceScope: MP03_PROFILE[action].scope as Mp03AuthenticatedContext["resourceScope"],
    correlation: {
      requestId: sourceRequestId,
      correlationId: "CORRELATION-FATES-006B-001",
      causationId: MP03_CAUSATION_ID,
    },
    policyVersion: "builtin:0.1.0",
    purpose: MP03_PROFILE[action].purpose,
  };
}

function waitingFor(
  action: Mp03Action,
  intent: ActionIntentV1,
  approvalId: string,
): Extract<MoiraeAdmissionResultV1, { status: "WAITING_FOR_APPROVAL" }> {
  const actionHash = MP03_NATIVE_HASH_FIXTURES[action];
  return {
    authority: "admission-only",
    status: "WAITING_FOR_APPROVAL",
    nativeDecision: "REQUIRE_APPROVAL",
    action,
    operation: MP03_PROFILE[action].operation,
    nativeActionHash: actionHash,
    moiraeCanonicalDigest: intent.canonicalDigest,
    moiraeIdempotencyKey: intent.idempotencyKey,
    approvalId,
    evidence: {
      sourceRequestId: intent.sourceRequestId,
      moiraeCanonicalDigest: intent.canonicalDigest,
      moiraeIdempotencyKey: intent.idempotencyKey,
      action,
      dependencyProfile: MP03_DEPENDENCY_PROVENANCE.profile,
      anankeSha: MP03_ANANKE_SHA,
      adrasteiaSha: MP03_ADRASTEIA_SHA,
      operation: MP03_PROFILE[action].operation,
      nativeActionHash: actionHash,
      nativeDecision: "REQUIRE_APPROVAL",
      admissionStatus: "WAITING_FOR_APPROVAL",
      approvalId,
      approvalStatus: "pending",
      resourceScopeReference: intent.resource.resourceId,
      purpose: MP03_PROFILE[action].purpose,
      contextTimestamp: "2026-09-03T11:00:00.000Z",
      evaluatedAt: NOW,
      auditId: `admission-${approvalId}`,
      executorInvoked: false,
      effectExecuted: false,
    },
    executorInvoked: false,
    effectExecuted: false,
  };
}

function admittedFrom(
  action: Mp03Action,
  intent: ActionIntentV1,
  approvalId: string,
): Extract<MoiraeAdmissionResultV1, { status: "ADMITTED" }> {
  const actionHash = MP03_NATIVE_HASH_FIXTURES[action];
  return {
    authority: "admission-only",
    status: "ADMITTED",
    nativeDecision: "ALLOW",
    action,
    operation: MP03_PROFILE[action].operation,
    nativeActionHash: actionHash,
    moiraeCanonicalDigest: intent.canonicalDigest,
    moiraeIdempotencyKey: intent.idempotencyKey,
    approvalId,
    evidence: {
      sourceRequestId: intent.sourceRequestId,
      moiraeCanonicalDigest: intent.canonicalDigest,
      moiraeIdempotencyKey: intent.idempotencyKey,
      action,
      dependencyProfile: MP03_DEPENDENCY_PROVENANCE.profile,
      anankeSha: MP03_ANANKE_SHA,
      adrasteiaSha: MP03_ADRASTEIA_SHA,
      operation: MP03_PROFILE[action].operation,
      nativeActionHash: actionHash,
      nativeDecision: "ALLOW",
      admissionStatus: "ADMITTED",
      approvalId,
      approvalStatus: "approved",
      resourceScopeReference: intent.resource.resourceId,
      purpose: MP03_PROFILE[action].purpose,
      contextTimestamp: "2026-09-03T11:00:00.000Z",
      evaluatedAt: NOW,
      auditId: `admission-${approvalId}-admitted`,
      executorInvoked: false,
      effectExecuted: false,
    },
    executorInvoked: false,
    effectExecuted: false,
  };
}

function nativeGrant(
  action: Mp03Action,
  intent: ActionIntentV1,
  context: Mp03AuthenticatedContext,
  approvalId: string,
): FakeNativeGrant {
  return {
    id: approvalId,
    serverName: MP03_PROFILE[action].operation.server,
    toolName: MP03_PROFILE[action].operation.toolName,
    toolVersion: MP03_PROFILE[action].operation.version,
    actionHash: nativeApprovalHashes[action],
    arguments: structuredClone(intent.parameters),
    executionContext: structuredClone(context),
    status: "pending",
    requestedAt: NOW,
    expiresAt: EXPIRED,
    used: false,
    revision: 0,
    bindRequestIdentity: true,
    presentationVersion: "fates-008a/approval-presentation/v1",
    presentationBindingHash: nativePresentationHashes[action],
  };
}

function deriveSelfConsistentNativeHashes(material: {
  approvalId: string;
  serverName: string;
  toolName: string;
  toolVersion?: string;
  arguments: Record<string, unknown>;
  executionContext: unknown;
  expiresAt: string;
  bindRequestIdentity?: boolean;
  presentationVersion?: string;
}) {
  const { approvalId, presentationVersion, ...actionMaterial } = material;
  const actionHash = createHash("sha256")
    .update(canonicalizeJsonV1(actionMaterial), "utf8")
    .digest("hex");
  return {
    actionHash,
    ...(presentationVersion
      ? {
          presentationBindingHash: createHash("sha256")
            .update(canonicalizeJsonV1({ approvalId, actionHash, presentationVersion }), "utf8")
            .digest("hex"),
        }
      : {}),
  };
}

function confirmedResult(id = "fates-execution:sha256:" + "1".repeat(64)): Mp04ExecutionResultV1 {
  return {
    schemaVersion: "1",
    status: "CONFIRMED",
    durableExecutionId: id,
    evidence: {
      schemaVersion: "1",
      dependencyProfile: MP04_DEPENDENCY_PROVENANCE.profile,
      adrasteiaSha: MP04_DEPENDENCY_PROVENANCE.adrasteiaSha,
      anankeSha: MP04_DEPENDENCY_PROVENANCE.ananke.sha,
      horaeSha: MP04_DEPENDENCY_PROVENANCE.horae.sha,
      reconciliationRequired: false,
      redispatchAttempted: false,
      events: [],
      observedAt: NOW,
    },
  };
}

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "moirae-mp06d-"));
  testDirectories.push(directory);
  return directory;
}

interface Harness {
  action: Mp03Action;
  intent: ActionIntentV1;
  context: Mp03AuthenticatedContext;
  waiting: Extract<MoiraeAdmissionResultV1, { status: "WAITING_FOR_APPROVAL" }>;
  state: FakeNativeGrant;
  native: Mp05AnankeApprovalPort;
  admit: ReturnType<typeof vi.fn>;
  execution: Mp04ExecutionPort & { calls: number; effects: number; mode: string };
  clock: TestClock;
  queue: LocalQueuePort;
  activity: ActivitySink;
  work: QueueWorkV1;
  queuePath: string;
  activityPath: string;
  coordinator: ReturnType<typeof createMp05HumanApprovalCoordinator>;
  worker: (options?: {
    crash?: WorkerFailureInjector;
    protocol?: TrustedProtocolBoundary;
  }) => DeterministicLocalWorker;
}

function createHarness(action: Mp03Action, durable = true): Harness {
  const sourceRequestId = `REQUEST-MP06D-${action}`;
  const intent = compileFixture(action, sourceRequestId);
  const context = contextFor(action, sourceRequestId);
  const approvalId = `approval-${action.toLowerCase()}`;
  const waiting = waitingFor(action, intent, approvalId);
  const state = nativeGrant(action, intent, context, approvalId);
  const clock = new TestClock();
  const directory = tempDirectory();
  const queuePath = join(directory, "queue.json");
  const activityPath = join(directory, "activity.json");
  const queue: LocalQueuePort = durable
    ? new DurableFilesystemLocalQueue(queuePath, {
        clock,
        instanceId: "mp06d-test-queue",
        leaseDurationMs: 1_000,
        retryBudget: 2,
      })
    : new InMemoryLocalQueue({ clock, leaseDurationMs: 1_000, retryBudget: 2 });
  const activity: ActivitySink = durable
    ? new DurableFilesystemActivitySink(activityPath, { instanceId: "mp06d-test-activity" })
    : new InMemoryActivitySink();
  const work = createQueueWork(intent, { deliveryId: "delivery-1" });
  queue.enqueue(work);
  queue.makeAvailable(work.deliveryId, NOW);

  const native: Mp05AnankeApprovalPort = {
    getApproval: vi.fn(async (id: string, now: string) => {
      if (id !== state.id) return undefined;
      if (state.status === "pending" && Date.parse(now) >= Date.parse(state.expiresAt)) {
        state.status = "expired";
        state.revision += 1;
      }
      return structuredClone(state);
    }),
    decideApproval: vi.fn(async (input: Mp05NativeApprovalDecisionInput) => {
      if (input.approvalId !== state.id) return { outcome: "not_found" };
      if (state.status === "pending") {
        state.status = input.decision === "approve" ? "approved" : "rejected";
        state.decisionId = "11111111-1111-4111-8111-111111111111";
        state.revision += 1;
        if (input.decision === "approve") {
          state.approvedBy = (input.operator as { operatorId: string }).operatorId;
          state.approvedBySessionId = (input.operator as { sessionId: string }).sessionId;
          state.approvedAt = input.now;
          state.bindingHash = "b".repeat(64);
        } else {
          state.rejectedBy = (input.operator as { operatorId: string }).operatorId;
          state.rejectedBySessionId = (input.operator as { sessionId: string }).sessionId;
          state.rejectedAt = input.now;
        }
        return { outcome: "applied", decisionId: state.decisionId };
      }
      const same =
        (input.decision === "approve" && state.status === "approved") ||
        (input.decision === "reject" && state.status === "rejected");
      return {
        outcome: same ? "idempotent" : "conflict",
        decisionId: state.decisionId,
      };
    }),
    deriveApprovalHashes: vi.fn(async () => ({
      actionHash: state.actionHash,
      presentationBindingHash: state.presentationBindingHash,
    })),
  };
  const admit = vi.fn(async (input: AdmitActionIntentInput) =>
    state.status === "approved" && input.approvalId
      ? admittedFrom(action, intent, String(input.approvalId))
      : waiting,
  );
  type TestExecution = Mp04ExecutionPort & {
    calls: number;
    effects: number;
    mode: "CONFIRMED" | "CRASH" | "UNKNOWN" | "ABSENT";
  };
  const execution: TestExecution = {
    calls: 0,
    effects: 0,
    mode: "CONFIRMED",
    executeAdmittedAction: async (): Promise<Mp04ExecutionResultV1> => {
      execution.calls += 1;
      if (execution.mode === "CRASH") throw new InjectedWorkerCrash("BEFORE_MP04");
      if (execution.mode === "UNKNOWN")
        return { ...confirmedResult(), status: "UNKNOWN", durableExecutionId: "unknown-id" };
      if (execution.mode === "ABSENT")
        return { ...confirmedResult(), status: "ABSENT", durableExecutionId: "absent-id" };
      if (execution.effects === 0) execution.effects += 1;
      return confirmedResult();
    },
  };
  const coordinator = createMp05HumanApprovalCoordinator({
    approval: native,
    admission: { admitActionIntent: admit },
    execution,
    trustedTime: { now: () => clock.now() },
    provenance: MP05_FATES_DEPENDENCY_PROVENANCE,
  });
  const worker = (
    options: {
      crash?: WorkerFailureInjector;
      protocol?: TrustedProtocolBoundary;
    } = {},
  ) =>
    new DeterministicLocalWorker({
      queue,
      activity,
      protocol:
        options.protocol ??
        ({
          load: async () => ({ intent, authenticatedContext: context }),
        } satisfies TrustedProtocolBoundary),
      admission: { admitActionIntent: admit },
      execution,
      approval: coordinator,
      clock,
      failureInjector: options.crash,
    });
  return {
    action,
    intent,
    context,
    waiting,
    state,
    native,
    admit,
    execution,
    clock,
    queue,
    activity,
    work,
    queuePath,
    activityPath,
    coordinator,
    worker,
  };
}

function process(harness: Harness, workerId = "worker-1"): Promise<Mp06WorkerResultV1> {
  const generation = (harness.queue.inspectDelivery(harness.work.deliveryId)?.generation ?? 0) + 1;
  return harness.worker().process({
    deliveryId: harness.work.deliveryId,
    workerId,
    claimId: deterministicQueueIdentity.schedulingClaimId(
      harness.work.workId,
      harness.work.deliveryId,
      workerId,
      generation,
    ),
    now: harness.clock.now(),
  });
}

function makeAvailable(harness: Harness): void {
  harness.queue.makeAvailable(harness.work.deliveryId, harness.clock.now());
}

function markApproved(harness: Harness): void {
  harness.state.status = "approved";
  harness.state.decisionId = "11111111-1111-4111-8111-111111111111";
  harness.state.approvedBy = OPERATOR.operatorId;
  harness.state.approvedBySessionId = OPERATOR.sessionId;
  harness.state.approvedAt = NOW;
  harness.state.bindingHash = "b".repeat(64);
  harness.state.revision += 1;
}

async function externallyDecide(harness: Harness, decision: "approve" | "reject"): Promise<void> {
  const prepared = await harness.coordinator.prepareApproval({
    intent: harness.intent,
    authenticatedContext: harness.context,
    waitingAdmission: harness.waiting,
  });
  await harness.native.decideApproval({
    approvalId: prepared.presentation.approvalId,
    decision,
    operator: OPERATOR,
    now: harness.clock.now(),
    presentationBindingHash: prepared.presentation.nativePresentationBindingHash,
  });
}

describe("MP-06D background human-approval integration", () => {
  it.each(actions)("parks %s through MP-05 without execution", async (action) => {
    const harness = createHarness(action);
    const result = await process(harness);

    expect(result).toMatchObject({ status: "waiting", queueOutcome: "WAITING_FOR_APPROVAL" });
    expect(harness.queue.inspectOutcome(harness.work.workId)).toMatchObject({
      outcome: "WAITING_FOR_APPROVAL",
      approvalReference: {
        approvalId: harness.state.id,
        observationState: "PENDING",
      },
      retryAttempt: 0,
    });
    expect(harness.execution.calls).toBe(0);
    expect(harness.execution.effects).toBe(0);
    expect(harness.queue.inspectDelivery(harness.work.deliveryId)?.state).toBe(
      "WAITING_FOR_APPROVAL",
    );
  });

  it("repeated pending delivery rereads MP-05 without creating a second approval", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    makeAvailable(harness);
    const result = await process(harness, "worker-2");

    expect(result.status).toBe("waiting");
    expect(harness.native.decideApproval).not.toHaveBeenCalled();
    expect(harness.state.id).toBe(
      harness.queue.inspectOutcome(harness.work.workId)?.approvalReference?.approvalId,
    );
    expect(harness.queue.inspectOutcome(harness.work.workId)?.retryAttempt).toBe(0);
    expect(harness.execution.effects).toBe(0);
  });

  it("restarts while pending and preserves the approval reference", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    const first = harness.queue.inspectOutcome(harness.work.workId);
    const restartedQueue = new DurableFilesystemLocalQueue(harness.queuePath, {
      clock: harness.clock,
      instanceId: "mp06d-restarted",
      leaseDurationMs: 1_000,
      retryBudget: 2,
    });
    restartedQueue.makeAvailable(harness.work.deliveryId, NOW);
    const restartedWorker = new DeterministicLocalWorker({
      queue: restartedQueue,
      activity: new DurableFilesystemActivitySink(harness.activityPath, {
        instanceId: "mp06d-restarted-activity",
      }),
      protocol: {
        load: async () => ({ intent: harness.intent, authenticatedContext: harness.context }),
      },
      admission: { admitActionIntent: harness.admit },
      execution: harness.execution,
      approval: harness.coordinator,
      clock: harness.clock,
    });
    const result = await restartedWorker.process({
      deliveryId: harness.work.deliveryId,
      workerId: "worker-restarted",
      claimId: deterministicQueueIdentity.schedulingClaimId(
        harness.work.workId,
        harness.work.deliveryId,
        "worker-restarted",
        2,
      ),
      now: NOW,
    });

    expect(result.status).toBe("waiting");
    expect(restartedQueue.inspectOutcome(harness.work.workId)?.approvalReference?.approvalId).toBe(
      first?.approvalReference?.approvalId,
    );
    expect(restartedQueue.inspectOutcome(harness.work.workId)?.retryAttempt).toBe(0);
    expect(harness.execution.effects).toBe(0);
  });

  it.each(actions)(
    "recovers an offline APPROVE for %s through MP-05 and MP-04 once",
    async (action) => {
      const harness = createHarness(action);
      await process(harness);
      await externallyDecide(harness, "approve");
      makeAvailable(harness);
      const result = await process(harness, "worker-after-approval");

      expect(result).toMatchObject({ status: "completed", queueOutcome: "COMPLETED" });
      expect(harness.state.decisionId).toBe("11111111-1111-4111-8111-111111111111");
      expect(harness.execution.calls).toBe(1);
      expect(harness.execution.effects).toBe(1);
      expect(harness.queue.inspectOutcome(harness.work.workId)).toMatchObject({
        outcome: "COMPLETED",
        approvalReference: {
          approvalId: harness.state.id,
          decisionId: harness.state.decisionId,
          observationState: "APPROVED",
        },
      });
    },
  );

  it("preserves a durable approval after decision-response loss", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    await externallyDecide(harness, "approve");
    makeAvailable(harness);
    const result = await process(harness, "response-loss-recovery");

    expect(result.status).toBe("completed");
    expect(harness.execution.effects).toBe(1);
    expect(harness.state.decisionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(harness.native.decideApproval).toHaveBeenCalledTimes(1);
  });

  it("does not retry or execute a durable REJECT", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    await externallyDecide(harness, "reject");
    makeAvailable(harness);
    const result = await process(harness, "reject-worker");

    expect(result).toMatchObject({ status: "denied", queueOutcome: "DENIED" });
    expect(harness.execution.calls).toBe(0);
    expect(harness.execution.effects).toBe(0);
    expect(harness.queue.inspectOutcome(harness.work.workId)?.retryAttempt).toBe(0);
  });

  it.each([
    ["expired", "EXPIRED"],
    ["revoked", "REVOKED"],
    ["consumed", "CONSUMED"],
  ] as const)("fail-closes %s approval state", async (nativeStatus, observedState) => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    harness.state.status = nativeStatus;
    harness.state.decisionId = "22222222-2222-4222-8222-222222222222";
    makeAvailable(harness);
    const result = await process(harness, `${nativeStatus}-worker`);

    expect(result).toMatchObject({ status: "blocked", queueOutcome: "BOUNDARY_BLOCKED" });
    expect(harness.queue.inspectOutcome(harness.work.workId)?.approvalReference).toMatchObject({
      observationState: observedState,
    });
    expect(harness.execution.calls).toBe(0);
    expect(harness.execution.effects).toBe(0);
  });

  it.each(["missing", "malformed", "unreadable"] as const)(
    "fails closed when the durable approval is %s",
    async (failure) => {
      const harness = createHarness("SEND_APPOINTMENT_DETAILS");
      await process(harness);
      const native = vi.mocked(harness.native.getApproval);
      if (failure === "missing") native.mockResolvedValueOnce(undefined);
      if (failure === "malformed") native.mockResolvedValueOnce({ malformed: true });
      if (failure === "unreadable")
        native.mockRejectedValueOnce(new Error("approval store unavailable"));
      makeAvailable(harness);
      const result = await process(harness, `${failure}-worker`);

      expect(result.status).toBe("blocked");
      expect(harness.execution.calls).toBe(0);
      expect(harness.execution.effects).toBe(0);
    },
  );

  it("rejects a self-consistent MP-05 semantic mutation through background recovery", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    harness.state.arguments = {
      ...harness.state.arguments,
      recipientAddress: "attacker@example.test",
    };
    harness.state.status = "approved";
    harness.state.decisionId = "33333333-3333-4333-8333-333333333333";
    harness.state.bindingHash = "b".repeat(64);
    vi.mocked(harness.native.deriveApprovalHashes).mockImplementation(async (material) =>
      deriveSelfConsistentNativeHashes(material),
    );
    Object.assign(
      harness.state,
      deriveSelfConsistentNativeHashes({
        approvalId: harness.state.id,
        serverName: harness.state.serverName,
        toolName: harness.state.toolName,
        toolVersion: harness.state.toolVersion,
        arguments: harness.state.arguments,
        executionContext: harness.state.executionContext,
        expiresAt: harness.state.expiresAt,
        bindRequestIdentity: harness.state.bindRequestIdentity,
        presentationVersion: harness.state.presentationVersion,
      }),
    );
    makeAvailable(harness);
    const result = await process(harness, "semantic-attacker");

    expect(result.status).toBe("blocked");
    expect(harness.execution.calls).toBe(0);
    expect(harness.execution.effects).toBe(0);
  });

  const substitutionCases: ReadonlyArray<readonly [string, (h: Harness) => void]> = [
    [
      "tool name",
      (h) => {
        h.state.toolName = "rescheduleAppointment";
      },
    ],
    [
      "tenant context",
      (h) => {
        h.state.executionContext = { ...h.context, tenantId: "attacker" } as never;
      },
    ],
    [
      "resource context",
      (h) => {
        h.state.executionContext = {
          ...h.context,
          resourceScope: { ...h.context.resourceScope, resourceIds: ["RESOURCE-ATTACKER"] },
        } as never;
      },
    ],
  ];

  it.each(substitutionCases)(
    "rejects %s substitution during background recovery",
    async (_label, mutate) => {
      const harness = createHarness("SEND_APPOINTMENT_DETAILS");
      await process(harness);
      markApproved(harness);
      mutate(harness);
      makeAvailable(harness);
      const result = await process(harness, "substitution-attacker");

      expect(result.status).toBe("blocked");
      expect(harness.execution.calls).toBe(0);
      expect(harness.execution.effects).toBe(0);
    },
  );

  it("does not trust a forged queue APPROVED observation", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    const raw = JSON.parse(readFileSync(harness.queuePath, "utf8")) as {
      logical: Record<string, { approvalReference?: { observationState: string } }>;
    };
    raw.logical[harness.work.workId].approvalReference!.observationState = "APPROVED";
    writeFileSync(harness.queuePath, JSON.stringify(raw), "utf8");
    const queue = new DurableFilesystemLocalQueue(harness.queuePath, {
      clock: harness.clock,
      instanceId: "forged-observation",
      leaseDurationMs: 1_000,
      retryBudget: 2,
    });
    queue.makeAvailable(harness.work.deliveryId, NOW);
    const worker = new DeterministicLocalWorker({
      queue,
      activity: harness.activity,
      protocol: {
        load: async () => ({ intent: harness.intent, authenticatedContext: harness.context }),
      },
      admission: { admitActionIntent: harness.admit },
      execution: harness.execution,
      approval: harness.coordinator,
      clock: harness.clock,
    });
    const result = await worker.process({
      deliveryId: harness.work.deliveryId,
      workerId: "forged-observation-worker",
      claimId: deterministicQueueIdentity.schedulingClaimId(
        harness.work.workId,
        harness.work.deliveryId,
        "forged-observation-worker",
        2,
      ),
      now: NOW,
    });

    expect(result.status).toBe("waiting");
    expect(queue.inspectOutcome(harness.work.workId)?.approvalReference?.observationState).toBe(
      "PENDING",
    );
    expect(harness.execution.effects).toBe(0);
  });

  it("reclaims an approval lease after worker crash without using stale MP-05 output", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    markApproved(harness);
    makeAvailable(harness);
    harness.execution.mode = "CRASH";
    await expect(process(harness, "crashed-approved-worker")).rejects.toBeInstanceOf(
      InjectedWorkerCrash,
    );
    harness.execution.mode = "CONFIRMED";
    harness.clock.set(LATER);
    const result = await process(harness, "reclaimed-approved-worker");

    expect(result.status).toBe("completed");
    expect(harness.execution.effects).toBe(1);
    expect(harness.admit).toHaveBeenCalledTimes(3);
  });

  it("repairs CONFIRMED approved recovery after queue-completion crash without a second effect", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    markApproved(harness);
    makeAvailable(harness);
    await expect(
      harness
        .worker({ crash: new CrashAt("AFTER_MP04_CONFIRMED_BEFORE_QUEUE_COMPLETION") })
        .process({
          deliveryId: harness.work.deliveryId,
          workerId: "completion-crashed-worker",
          claimId: deterministicQueueIdentity.schedulingClaimId(
            harness.work.workId,
            harness.work.deliveryId,
            "completion-crashed-worker",
            2,
          ),
          now: NOW,
        }),
    ).rejects.toBeInstanceOf(InjectedWorkerCrash);
    harness.clock.set(LATER);
    const result = await process(harness, "completion-repair-worker");

    expect(result.status).toBe("completed");
    expect(harness.execution.effects).toBe(1);
    expect(harness.queue.inspectOutcome(harness.work.workId)?.outcome).toBe("COMPLETED");
  });

  it("routes approved-path UNKNOWN to reconciliation without redispatch", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    markApproved(harness);
    makeAvailable(harness);
    harness.execution.mode = "UNKNOWN";
    const result = await process(harness, "unknown-worker");

    expect(result).toMatchObject({
      status: "reconciliation-required",
      queueOutcome: "RECONCILIATION_REQUIRED",
    });
    expect(harness.execution.effects).toBe(0);
    makeAvailable(harness);
    const replay = await process(harness, "unknown-replay-worker");
    expect(replay.status).toBe("claim-rejected");
    expect(harness.execution.effects).toBe(0);
  });

  it("keeps approval waiting separate from retry budget and lease expiry", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    const before = harness.queue.inspectOutcome(harness.work.workId);
    harness.clock.set(LATER);
    makeAvailable(harness);
    const result = await process(harness, "waiting-after-lease-clock");

    expect(result.status).toBe("waiting");
    expect(harness.queue.inspectOutcome(harness.work.workId)?.retryAttempt).toBe(
      before?.retryAttempt,
    );
    expect(harness.state.status).toBe("pending");
    expect(harness.execution.effects).toBe(0);
  });

  it("rejects stale approval correlation changes and activity cannot approve work", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    const raw = JSON.parse(readFileSync(harness.queuePath, "utf8")) as {
      logical: Record<string, { approvalReference?: { approvalId: string } }>;
    };
    raw.logical[harness.work.workId].approvalReference!.approvalId = "forged-approval";
    writeFileSync(harness.queuePath, JSON.stringify(raw), "utf8");
    expect(
      () =>
        new DurableFilesystemLocalQueue(harness.queuePath, {
          clock: harness.clock,
          instanceId: "tampered-correlation",
          retryBudget: 2,
        }),
    ).not.toThrow();
    const queue = new DurableFilesystemLocalQueue(harness.queuePath, {
      clock: harness.clock,
      instanceId: "tampered-correlation-worker",
      retryBudget: 2,
    });
    queue.makeAvailable(harness.work.deliveryId, NOW);
    const worker = new DeterministicLocalWorker({
      queue,
      activity: harness.activity,
      protocol: {
        load: async () => ({ intent: harness.intent, authenticatedContext: harness.context }),
      },
      admission: { admitActionIntent: harness.admit },
      execution: harness.execution,
      approval: harness.coordinator,
      clock: harness.clock,
    });
    const result = await worker.process({
      deliveryId: harness.work.deliveryId,
      workerId: "tampered-correlation-worker",
      claimId: deterministicQueueIdentity.schedulingClaimId(
        harness.work.workId,
        harness.work.deliveryId,
        "tampered-correlation-worker",
        2,
      ),
      now: NOW,
    });
    expect(result.status).toBe("blocked");
    expect(harness.execution.effects).toBe(0);
  });

  it("arbitrates two workers observing approved work with one effect", async () => {
    const harness = createHarness("SEND_APPOINTMENT_DETAILS");
    await process(harness);
    markApproved(harness);
    makeAvailable(harness);
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => (started = resolve));
    const releasePromise = new Promise<void>((resolve) => (release = resolve));
    const firstWorker = harness.worker({
      protocol: {
        load: async () => {
          started();
          await releasePromise;
          return { intent: harness.intent, authenticatedContext: harness.context };
        },
      },
    });
    const generation = 2;
    const first = firstWorker.process({
      deliveryId: harness.work.deliveryId,
      workerId: "worker-a",
      claimId: deterministicQueueIdentity.schedulingClaimId(
        harness.work.workId,
        harness.work.deliveryId,
        "worker-a",
        generation,
      ),
      now: NOW,
    });
    await startedPromise;
    const loser = await process(harness, "worker-b");
    expect(loser.status).toBe("claim-rejected");
    release();
    const winner = await first;

    expect(winner.status).toBe("completed");
    expect(harness.execution.effects).toBe(1);
  });

  it("keeps the bounded worker free of approval polling", async () => {
    const source = readFileSync(
      join(globalThis.process.cwd(), "packages/background-work/src/index.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/while\s*\(\s*true\s*\)/);
    expect(source).not.toMatch(/pending[\s\S]{0,80}sleep[\s\S]{0,80}pending/);
  });
});

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  compileAgentProposal,
  type ActionIntentV1,
  type CompilerContextV1,
} from "../packages/action-compiler/src/index.js";
import {
  MP03_ACTING_AGENT,
  MP03_AUTHENTICATED_WORKLOAD,
  MP03_CAUSATION_ID,
  MP03_CORRELATION_ID,
  MP03_DEPENDENCY_PROVENANCE,
  MP03_NATIVE_HASH_FIXTURES,
  MP03_POLICY_VERSION,
  MP03_PROFILE,
  MP03_REQUESTER,
  MP03_RUNTIME_ID,
  MP03_RUNTIME_INSTANCE,
  MP03_SESSION_ID,
  MP03_TENANT_ID,
  MP03_TOOLS,
  createMp03AdmissionAdapter,
  type FatesAdmissionGateway,
  type Mp03Action,
  type Mp03AuthenticatedContext,
} from "../packages/fates-adapter/src/index.js";
import {
  MP04_DEPENDENCY_PROVENANCE,
  createMp04ExecutionCoordinator,
  type Mp04AnankePort,
  type Mp04EffectAdapterIdentityV1,
  type Mp04HoraePort,
} from "../packages/execution-coordinator/src/index.js";
import {
  createQueueWork,
  deterministicQueueIdentity,
  DeterministicLocalWorker,
  InMemoryActivitySink,
  InMemoryLocalQueue,
  type ActivityRecordV1,
  type QueueWorkV1,
  type TrustedProtocolBoundary,
} from "../packages/background-work/src/index.js";
import {
  demoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";

const NOW = "2026-09-03T12:00:00.000Z";
const ADAPTER_ID: Mp04EffectAdapterIdentityV1 = {
  id: "synthetic.moirae-administrative",
  version: "1",
};

type AdmissionMode = "ADMITTED" | "WAITING_FOR_APPROVAL" | "REJECTED";

function compilerContext(sourceRequestId: string): CompilerContextV1 {
  return {
    ...demoCompilerContext,
    agentPrincipalId: MP03_ACTING_AGENT,
    sourceRequestId,
  };
}

function compileFixture(sourceRequestId = "REQUEST-MP02-DETAILS-001"): ActionIntentV1 {
  const proposal = primaryCompilerFixtures[0].proposal;
  const result = compileAgentProposal({
    proposal,
    context: compilerContext(sourceRequestId),
  });
  if (result.status !== "COMPILED") throw new Error(`Fixture did not compile: ${result.status}`);
  return result.actionIntent;
}

function contextFor(sourceRequestId = "REQUEST-MP02-DETAILS-001"): Mp03AuthenticatedContext {
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
    resourceScope: MP03_PROFILE.SEND_APPOINTMENT_DETAILS
      .scope as Mp03AuthenticatedContext["resourceScope"],
    correlation: {
      requestId: sourceRequestId,
      correlationId: MP03_CORRELATION_ID,
      causationId: MP03_CAUSATION_ID,
    },
    policyVersion: MP03_POLICY_VERSION,
    purpose: MP03_PROFILE.SEND_APPOINTMENT_DETAILS.purpose,
  };
}

function actionForTool(toolName: string): Mp03Action {
  if (toolName === MP03_TOOLS.SEND_APPOINTMENT_DETAILS) return "SEND_APPOINTMENT_DETAILS";
  if (toolName === MP03_TOOLS.RESCHEDULE_APPOINTMENT) return "RESCHEDULE_APPOINTMENT";
  if (toolName === MP03_TOOLS.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY)
    return "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY";
  throw new Error(`Unexpected synthetic operation ${toolName}`);
}

function nativeAdmission(mode: AdmissionMode, operation: Record<string, unknown>) {
  const action = actionForTool(operation.toolName as string);
  const common = {
    authority: "admission-only" as const,
    operation,
    actionHash: MP03_NATIVE_HASH_FIXTURES[action],
    evaluatedAt: NOW,
    auditId: `audit-${mode.toLowerCase()}`,
    executorInvoked: false as const,
    effectExecuted: false as const,
  };
  if (mode === "ADMITTED")
    return {
      ...common,
      status: "ADMITTED" as const,
      decision: "ALLOW" as const,
      approvalGrantId: "approval-mp06b-001",
      approvalActionHash: common.actionHash,
      approvalExpiresAt: "2026-09-03T12:05:00.000Z",
    };
  if (mode === "WAITING_FOR_APPROVAL")
    return {
      ...common,
      status: "WAITING_FOR_APPROVAL" as const,
      decision: "REQUIRE_APPROVAL" as const,
      approvalGrantId: "approval-mp06b-001",
      approvalActionHash: common.actionHash,
      approvalExpiresAt: "2026-09-03T12:05:00.000Z",
    };
  return {
    ...common,
    status: "REJECTED" as const,
    decision: "DENY" as const,
  };
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function createSyntheticMp04(): {
  execution: {
    executeAdmittedAction(
      input: unknown,
    ): ReturnType<typeof createMp04ExecutionCoordinator>["executeAdmittedAction"] extends (
      input: unknown,
    ) => infer R
      ? R
      : never;
  };
  calls: { admission: number; authority: number; horae: number };
} {
  const calls = { admission: 0, authority: 0, horae: 0 };
  let record: Record<string, unknown> | undefined;
  const ananke: Mp04AnankePort = {
    createExecutionAuthority: (input) => {
      calls.authority += 1;
      const argumentsDigest = digest(input.args);
      const targetDigest = digest(input.executionContext.resourceScope);
      return {
        schemaVersion: "1",
        durableExecutionId: `fates-execution:sha256:${"1".repeat(64)}`,
        nativeActionHash: input.admission.actionHash,
        operation: input.operation,
        authenticatedContext: input.executionContext,
        resourceScope: input.executionContext.resourceScope,
        purpose: input.executionContext.purpose,
        policyVersion: input.executionContext.policyVersion,
        effectAdapter: input.effectAdapter,
        argumentsDigest,
        targetDigest,
        authorityInstanceDigest: `sha256:${"2".repeat(64)}`,
        requestIdentity: {
          requestId: input.executionContext.correlation.requestId,
          correlationId: input.executionContext.correlation.correlationId,
          causationId: input.executionContext.correlation.causationId,
        },
        approval: input.admission.approvalGrantId
          ? { grantId: input.admission.approvalGrantId }
          : undefined,
      };
    },
    hashArgumentsDigest: (args) => digest(args),
    hashTargetDigest: (scope) => digest(scope),
  };
  const horae: Mp04HoraePort = {
    execute: async (input) => {
      calls.horae += 1;
      const authority = input.authority as Record<string, unknown>;
      record = {
        durableExecutionId: authority.durableExecutionId,
        authority,
        authorityInstanceDigest: authority.authorityInstanceDigest,
        nativeActionHash: authority.nativeActionHash,
        operation: authority.operation,
        argumentsDigest: authority.argumentsDigest,
        targetDigest: authority.targetDigest,
        effectAdapter: authority.effectAdapter,
        state: "terminal",
        history: [
          { state: "authority_validated", event: "synthetic authority validated" },
          { state: "execution_reserved", event: "synthetic execution reserved" },
          { state: "executor_invocation_started", event: "synthetic effect invoked" },
          { state: "terminal", event: "synthetic effect confirmed" },
        ],
        claim: {
          owner: input.owner,
          generation: 1,
          claimDigest: `sha256:${"3".repeat(64)}`,
        },
        receipt: { result: "CONFIRMED", checksum: `sha256:${"4".repeat(64)}` },
        result: "CONFIRMED",
        updatedAt: input.now,
      };
      return record;
    },
    recover: async () => {
      throw new Error("Synthetic MP-06B test does not use MP-04 recovery.");
    },
    get: () => record,
  };
  const coordinator = createMp04ExecutionCoordinator({
    ananke,
    horae,
    effectAdapter: ADAPTER_ID,
    owner: "mp06b-synthetic-worker",
    provenance: MP04_DEPENDENCY_PROVENANCE,
  });
  return {
    execution: {
      executeAdmittedAction: (input: unknown) => coordinator.executeAdmittedAction(input),
    },
    calls,
  };
}

function createHarness(mode: AdmissionMode = "ADMITTED", deliveryId = "delivery-1") {
  const intent = compileFixture();
  const context = contextFor(intent.sourceRequestId);
  const queue = new InMemoryLocalQueue();
  const work = createQueueWork(intent, { deliveryId });
  queue.enqueue(work);
  queue.makeAvailable(deliveryId, NOW);
  const activity = new InMemoryActivitySink();
  const syntheticMp04 = createSyntheticMp04();
  const gateway: FatesAdmissionGateway = {
    admit: async (operation) => {
      syntheticMp04.calls.admission += 1;
      return nativeAdmission(mode, operation as unknown as Record<string, unknown>);
    },
  };
  const admission = createMp03AdmissionAdapter(gateway, MP03_DEPENDENCY_PROVENANCE);
  const protocol: TrustedProtocolBoundary = {
    load: async () => ({ intent, authenticatedContext: context }),
  };
  const worker = new DeterministicLocalWorker({
    queue,
    protocol,
    admission,
    execution: syntheticMp04.execution,
    activity,
  });
  return { intent, context, queue, work, activity, worker, syntheticMp04, protocol, admission };
}

function claimId(work: QueueWorkV1, workerId: string, generation = 1): string {
  return deterministicQueueIdentity.schedulingClaimId(
    work.workId,
    work.deliveryId,
    workerId,
    generation,
  );
}

async function process(harness: ReturnType<typeof createHarness>, workerId = "worker-1") {
  return harness.worker.process({
    deliveryId: harness.work.deliveryId,
    workerId,
    claimId: claimId(harness.work, workerId),
    now: NOW,
  });
}

describe("MP-06B deterministic local queue/worker core", () => {
  it("runs valid work through current MP-03 and accepted MP-04 exactly once", async () => {
    const harness = createHarness();
    const result = await process(harness);

    expect(result).toMatchObject({ status: "completed", queueOutcome: "COMPLETED" });
    expect(harness.syntheticMp04.calls.admission).toBe(1);
    expect(harness.syntheticMp04.calls.authority).toBe(1);
    expect(harness.syntheticMp04.calls.horae).toBe(1);
    expect(harness.queue.inspectOutcome(harness.work.workId)).toMatchObject({
      outcome: "COMPLETED",
      mp04DurableExecutionId: `fates-execution:sha256:${"1".repeat(64)}`,
    });
    expect(harness.activity.list(harness.work.workId).map((record) => record.state)).toEqual([
      "CLAIMED",
      "PROCESSING",
      "AUTHORITY_CHECKED",
      "COMPLETED",
    ]);
  });

  it("surfaces REQUIRE_APPROVAL without auto-approval or MP-04/effect calls", async () => {
    const harness = createHarness("WAITING_FOR_APPROVAL");
    const result = await process(harness);

    expect(result).toMatchObject({ status: "waiting", queueOutcome: "WAITING_FOR_APPROVAL" });
    expect(harness.syntheticMp04.calls.admission).toBe(1);
    expect(harness.syntheticMp04.calls.authority).toBe(0);
    expect(harness.syntheticMp04.calls.horae).toBe(0);
    expect(harness.activity.list(harness.work.workId).at(-1)?.state).toBe("WAITING_FOR_APPROVAL");
  });

  it("routes DENY to terminal DENIED with zero MP-04/effect calls", async () => {
    const harness = createHarness("REJECTED");
    const result = await process(harness);

    expect(result).toMatchObject({ status: "denied", queueOutcome: "DENIED" });
    expect(harness.syntheticMp04.calls.admission).toBe(1);
    expect(harness.syntheticMp04.calls.authority).toBe(0);
    expect(harness.syntheticMp04.calls.horae).toBe(0);
    expect(harness.activity.list(harness.work.workId).at(-1)?.state).toBe("DENIED");
  });

  it("rejects a same-delivery replay without a second scheduling claim or effect", async () => {
    const harness = createHarness();
    await process(harness, "worker-1");
    const replay = await process(harness, "worker-2");

    expect(replay).toMatchObject({ status: "claim-rejected", reason: "DELIVERY_TERMINAL" });
    expect(harness.syntheticMp04.calls.horae).toBe(1);
  });

  it("uses MP-04 durable truth for a completed logical-work redelivery", async () => {
    const harness = createHarness();
    await process(harness);
    const duplicate = createQueueWork(harness.intent, { deliveryId: "delivery-2" });
    expect(harness.queue.enqueue(duplicate).status).toBe("DUPLICATE_LOGICAL_WORK");
    harness.queue.makeAvailable(duplicate.deliveryId, NOW);
    const replay = await harness.worker.process({
      deliveryId: duplicate.deliveryId,
      workerId: "worker-2",
      claimId: claimId(duplicate, "worker-2"),
      now: NOW,
    });

    expect(replay).toMatchObject({ status: "completed", mp04Status: "CONFIRMED" });
    expect(harness.syntheticMp04.calls.admission).toBe(2);
    expect(harness.syntheticMp04.calls.authority).toBe(1);
    expect(harness.syntheticMp04.calls.horae).toBe(1);
  });

  it("re-observes approval-required work on redelivery without reusing approval material", async () => {
    const harness = createHarness("WAITING_FOR_APPROVAL");
    const first = await process(harness);
    const duplicate = createQueueWork(harness.intent, {
      deliveryId: "delivery-2",
      protocolReferences: {
        admissionObservation: {
          auditId: "stale-audit",
          nativeActionHash: "f".repeat(64),
        },
        approval: { approvalId: "stale-approval" },
      },
    });
    expect(first.status).toBe("waiting");
    expect(harness.queue.enqueue(duplicate).status).toBe("DUPLICATE_LOGICAL_WORK");
    harness.queue.makeAvailable(duplicate.deliveryId, NOW);
    const second = await harness.worker.process({
      deliveryId: duplicate.deliveryId,
      workerId: "worker-2",
      claimId: claimId(duplicate, "worker-2"),
      now: NOW,
    });

    expect(second).toMatchObject({ status: "waiting" });
    expect(harness.syntheticMp04.calls.admission).toBe(2);
    expect(harness.syntheticMp04.calls.horae).toBe(0);
  });

  it("arbitrates competing workers with one active scheduling claimant", async () => {
    const harness = createHarness();
    let started!: () => void;
    let unblock!: () => void;
    const loadStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const loadGate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const protocol: TrustedProtocolBoundary = {
      load: async () => {
        started();
        await loadGate;
        return { intent: harness.intent, authenticatedContext: harness.context };
      },
    };
    const workerOne = new DeterministicLocalWorker({
      queue: harness.queue,
      protocol,
      admission: harness.admission,
      execution: harness.syntheticMp04.execution,
      activity: harness.activity,
    });
    const firstPromise = workerOne.process({
      deliveryId: harness.work.deliveryId,
      workerId: "worker-1",
      claimId: claimId(harness.work, "worker-1"),
      now: NOW,
    });
    await loadStarted;
    const loser = await harness.worker.process({
      deliveryId: harness.work.deliveryId,
      workerId: "worker-2",
      claimId: claimId(harness.work, "worker-2"),
      now: NOW,
    });
    unblock();
    const winner = await firstPromise;

    expect(loser).toMatchObject({ status: "claim-rejected", reason: "ALREADY_CLAIMED" });
    expect(winner.status).toBe("completed");
    expect(harness.syntheticMp04.calls.horae).toBe(1);
  });

  it("rejects forged work identity and forged scheduling claims", () => {
    const harness = createHarness();
    expect(() =>
      harness.queue.enqueue({
        ...harness.work,
        workId: "mp06b-work-forged",
        deliveryId: "delivery-forged",
      }),
    ).toThrow(/workId/);

    const acquired = harness.queue.acquire({
      deliveryId: harness.work.deliveryId,
      workerId: "worker-1",
      claimId: claimId(harness.work, "worker-1"),
      now: NOW,
    });
    if (acquired.status !== "CLAIMED") throw new Error("Expected synthetic claim.");
    expect(() =>
      harness.queue.complete({
        claim: { ...acquired.claim, claimId: "forged-claim" },
        outcome: "COMPLETED",
        observedAt: NOW,
      }),
    ).toThrow(/active compare-and-set claim/);
    expect(harness.queue.inspectDelivery(harness.work.deliveryId)?.state).toBe("CLAIMED");
  });

  it.each([
    ["digest", { actionIntentDigest: "0".repeat(64) }],
    ["principal", { intent: { principal: { agentPrincipalId: "forged-principal" } } }],
    ["resource", { intent: { resource: { resourceId: "forged-resource" } } }],
    ["target", { intent: { target: { address: "forged@example.test" } } }],
    ["parameters", { intent: { parameters: { recipientAddress: "forged@example.test" } } }],
  ] as const)("fails closed before effect on forged %s binding", async (_label, change) => {
    const harness = createHarness();
    const forgedWork =
      "actionIntentDigest" in change
        ? {
            ...harness.work,
            ...change,
            workId: deterministicQueueIdentity.logicalWorkId(
              harness.work.sourceRequestId,
              change.actionIntentDigest,
            ),
            deliveryId: `delivery-forged-${_label}`,
          }
        : { ...harness.work, deliveryId: `delivery-forged-${_label}` };
    const intent = "intent" in change ? { ...harness.intent, ...change.intent } : harness.intent;
    const queue = new InMemoryLocalQueue();
    queue.enqueue(forgedWork);
    queue.makeAvailable(forgedWork.deliveryId, NOW);
    const worker = new DeterministicLocalWorker({
      queue,
      protocol: { load: async () => ({ intent, authenticatedContext: harness.context }) },
      admission: harness.admission,
      execution: harness.syntheticMp04.execution,
      activity: harness.activity,
    });
    const result = await worker.process({
      deliveryId: forgedWork.deliveryId,
      workerId: "worker-1",
      claimId: claimId(forgedWork, "worker-1"),
      now: NOW,
    });

    expect(result).toMatchObject({ status: "blocked", queueOutcome: "BOUNDARY_BLOCKED" });
    expect(harness.syntheticMp04.calls.horae).toBe(0);
  });

  it("fails closed on tenant substitution before MP-04", async () => {
    const harness = createHarness();
    const forgedContext = {
      ...harness.context,
      tenantId: "forged-tenant",
    } as unknown as Mp03AuthenticatedContext;
    const queue = new InMemoryLocalQueue();
    queue.enqueue(harness.work);
    queue.makeAvailable(harness.work.deliveryId, NOW);
    const worker = new DeterministicLocalWorker({
      queue,
      protocol: {
        load: async () => ({ intent: harness.intent, authenticatedContext: forgedContext }),
      },
      admission: harness.admission,
      execution: harness.syntheticMp04.execution,
      activity: harness.activity,
    });
    const result = await worker.process({
      deliveryId: harness.work.deliveryId,
      workerId: "worker-1",
      claimId: claimId(harness.work, "worker-1"),
      now: NOW,
    });

    expect(result.status).toBe("blocked");
    expect(harness.syntheticMp04.calls.horae).toBe(0);
  });

  it("does not treat tampered activity or prior admission observations as authority", async () => {
    const harness = createHarness();
    const records: ActivityRecordV1[] = [
      {
        schemaVersion: "mp06b-activity-v1",
        activityId: "tampered",
        workId: harness.work.workId,
        deliveryId: harness.work.deliveryId,
        state: "COMPLETED",
        observedAt: NOW,
        sourceRequestId: harness.work.sourceRequestId,
        actionIntentDigest: harness.work.actionIntentDigest,
        nativeActionHash: "f".repeat(64),
      },
    ];
    const worker = new DeterministicLocalWorker({
      queue: harness.queue,
      protocol: harness.protocol,
      admission: harness.admission,
      execution: harness.syntheticMp04.execution,
      activity: { append: (record) => records.push(record) },
    });
    const result = await worker.process({
      deliveryId: harness.work.deliveryId,
      workerId: "worker-1",
      claimId: claimId(harness.work, "worker-1"),
      now: NOW,
    });

    expect(result.status).toBe("completed");
    expect(harness.syntheticMp04.calls.admission).toBe(1);
    expect(harness.syntheticMp04.calls.horae).toBe(1);
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  compileAgentProposal,
  type ActionIntentV1,
} from "../packages/action-compiler/src/index.js";
import {
  createQueueWork,
  type ActivityRecordV1,
  type QueueDeliverySnapshotV1,
  type QueueOutcomeSnapshotV1,
} from "../packages/background-work/src/index.js";
import {
  MP03_ACTING_AGENT,
  MP03_AUTHENTICATED_WORKLOAD,
  MP03_CAUSATION_ID,
  MP03_CORRELATION_ID,
  MP03_NATIVE_HASH_FIXTURES,
  MP03_POLICY_VERSION,
  MP03_PROFILE,
  MP03_REQUESTER,
  MP03_RUNTIME_ID,
  MP03_RUNTIME_INSTANCE,
  MP03_SESSION_ID,
  MP03_TENANT_ID,
  type Mp03AuthenticatedContext,
} from "../packages/fates-adapter/src/index.js";
import {
  MP04_DEPENDENCY_PROVENANCE,
  Mp04ExecutionReadError,
  createMp04ExecutionCoordinator,
  type Mp04AnankePort,
  type Mp04EffectAdapterIdentityV1,
  type Mp04ExecutionReadRequestV1,
  type Mp04HoraePort,
} from "../packages/execution-coordinator/src/index.js";
import type { Mp05ApprovalObservationV1 } from "../packages/human-approval/src/index.js";
import {
  createMp08bNativeProjectionSources,
  createMp08bTrustedNativeProductProjection,
} from "../apps/host/src/native-projection.js";
import type { Mp08bApprovalBindingV1 } from "../apps/host/src/approval-runtime.js";
import {
  demoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";

const NOW = "2026-09-10T12:00:00.000Z";
const APPROVAL_ID = "approval-reconciliation-read-01";
const DECISION_ID = "decision-reconciliation-read-01";
const DURABLE_EXECUTION_ID = `fates-execution:sha256:${"1".repeat(64)}`;
const AUTHORITY_INSTANCE_DIGEST = `sha256:${"2".repeat(64)}`;
const ARGUMENTS_DIGEST = `sha256:${"3".repeat(64)}`;
const TARGET_DIGEST = `sha256:${"4".repeat(64)}`;
const RECEIPT_CHECKSUM = `sha256:${"5".repeat(64)}`;
const ADAPTER: Mp04EffectAdapterIdentityV1 = {
  id: "synthetic.moirae-administrative",
  version: "1",
};

function intentFor(sourceRequestId = "REQUEST-RECONCILIATION-READ-01"): ActionIntentV1 {
  const result = compileAgentProposal({
    proposal: primaryCompilerFixtures[0].proposal,
    context: {
      ...demoCompilerContext,
      sourceRequestId,
      agentPrincipalId: MP03_ACTING_AGENT,
    },
  });
  if (result.status !== "COMPILED") throw new Error(`Fixture did not compile: ${result.status}`);
  return result.actionIntent;
}

function contextFor(sourceRequestId: string): Mp03AuthenticatedContext {
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

function requestFor(intent: ActionIntentV1): Mp04ExecutionReadRequestV1 {
  return {
    durableExecutionId: DURABLE_EXECUTION_ID,
    sourceRequestId: intent.sourceRequestId,
    actionIntentDigest: intent.canonicalDigest,
    actionIntentIdempotencyKey: intent.idempotencyKey,
    approvalId: APPROVAL_ID,
    expectedNativeActionHash: MP03_NATIVE_HASH_FIXTURES[intent.action],
  };
}

function persistedRecord(
  intent: ActionIntentV1,
  status: "CONFIRMED" | "ABSENT" | "UNKNOWN" | "RECOVERY_REQUIRED",
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const context = contextFor(intent.sourceRequestId);
  const operation = MP03_PROFILE[intent.action].operation;
  const state =
    status === "CONFIRMED" || status === "ABSENT"
      ? "terminal"
      : status === "UNKNOWN"
        ? "effect_reconciliation_required"
        : "execution_reserved";
  const record: Record<string, unknown> = {
    durableExecutionId: DURABLE_EXECUTION_ID,
    authority: {
      durableExecutionId: DURABLE_EXECUTION_ID,
      nativeActionHash: MP03_NATIVE_HASH_FIXTURES[intent.action],
      operation,
      authenticatedContext: context,
      requestIdentity: {
        requestId: intent.sourceRequestId,
        correlationId: context.correlation.correlationId,
        causationId: context.correlation.causationId,
      },
      purpose: context.purpose,
      policyVersion: context.policyVersion,
      argumentsDigest: ARGUMENTS_DIGEST,
      targetDigest: TARGET_DIGEST,
      approval: { grantId: APPROVAL_ID },
    },
    authorityInstanceDigest: AUTHORITY_INSTANCE_DIGEST,
    nativeActionHash: MP03_NATIVE_HASH_FIXTURES[intent.action],
    operation,
    argumentsDigest: ARGUMENTS_DIGEST,
    targetDigest: TARGET_DIGEST,
    effectAdapter: ADAPTER,
    state,
    history: [{ state, event: `fixture_${status.toLowerCase()}` }],
    updatedAt: NOW,
    ...(status === "CONFIRMED" || status === "ABSENT"
      ? {
          receipt: { result: status, checksum: RECEIPT_CHECKSUM },
          result: status,
        }
      : {}),
    ...(status === "UNKNOWN" ? { reason: "Fixture reconciliation remains unknown." } : {}),
    ...overrides,
  };
  return record;
}

function coordinatorFor(
  store: Map<string, unknown>,
  counters: { execute: number; recover: number; evidence: number },
) {
  const ananke: Mp04AnankePort = {
    createExecutionAuthority: () => {
      counters.execute += 1;
      throw new Error("The reconciliation read test must not execute MP-04.");
    },
    hashArgumentsDigest: () => ARGUMENTS_DIGEST,
    hashTargetDigest: () => TARGET_DIGEST,
  };
  const horae: Mp04HoraePort = {
    execute: async () => {
      counters.execute += 1;
      throw new Error("The reconciliation read test must not invoke Horae execute.");
    },
    recover: async () => {
      counters.recover += 1;
      throw new Error("The reconciliation read test must not invoke Horae recover.");
    },
    get: (durableExecutionId) => store.get(durableExecutionId),
  };
  return createMp04ExecutionCoordinator({
    ananke,
    horae,
    effectAdapter: ADAPTER,
    owner: "reconciliation-read-test",
    provenance: MP04_DEPENDENCY_PROVENANCE,
    evidenceSink: () => {
      counters.evidence += 1;
    },
  });
}

function approvalFor(intent: ActionIntentV1): Mp05ApprovalObservationV1 {
  return {
    schemaVersion: "mp05-approval-observation-v1",
    approvalId: APPROVAL_ID,
    state: "APPROVED",
    decisionId: DECISION_ID,
    actionHash: MP03_NATIVE_HASH_FIXTURES[intent.action],
    presentationBindingHash: "b".repeat(64),
    expiresAt: "2026-09-10T13:00:00.000Z",
    observedAt: NOW,
  };
}

function projectionHarness(intent: ActionIntentV1, coordinator: ReturnType<typeof coordinatorFor>) {
  const work = createQueueWork(intent, {
    deliveryId: "delivery-reconciliation-read-01",
    protocolReferences: { approval: { approvalId: APPROVAL_ID, decisionId: DECISION_ID } },
  });
  const delivery: QueueDeliverySnapshotV1 = {
    work,
    state: "COMPLETED",
    generation: 1,
    retryAttempt: 0,
    retryBudget: 3,
  };
  const outcome: QueueOutcomeSnapshotV1 = {
    schemaVersion: "mp06b-queue-work-v1",
    workId: work.workId,
    outcome: "COMPLETED",
    lastDeliveryId: work.deliveryId,
    mp04DurableExecutionId: DURABLE_EXECUTION_ID,
    observedAt: NOW,
    retryAttempt: 0,
    retryBudget: 3,
  };
  const activity: ActivityRecordV1 = {
    schemaVersion: "mp06b-activity-v1",
    activityId: "activity-reconciliation-read-01",
    workId: work.workId,
    deliveryId: work.deliveryId,
    state: "COMPLETED",
    observedAt: NOW,
    sourceRequestId: work.sourceRequestId,
    actionIntentDigest: work.actionIntentDigest,
  };
  const binding: Mp08bApprovalBindingV1 = {
    schemaVersion: "mp08b-approval-binding-v1",
    approvalId: APPROVAL_ID,
    intent,
    authenticatedContext: contextFor(intent.sourceRequestId),
    waitingAdmission: {
      status: "WAITING_FOR_APPROVAL",
      nativeActionHash: MP03_NATIVE_HASH_FIXTURES[intent.action],
    },
    bindingDigest: "c".repeat(64),
  };
  const sources = createMp08bNativeProjectionSources({
    approvalRuntime: {
      getApprovalBinding: () => binding,
      readApproval: async () => approvalFor(intent),
      refreshApproval: async () => {
        throw new Error("Approved projection should not refresh an approval presentation.");
      },
    },
    queueRuntime: {
      inspectDelivery: () => delivery,
      inspectOutcome: () => outcome,
      listActivity: () => [activity],
    },
    executionCoordinator: coordinator,
    trustedNow: () => NOW,
  });
  return { projection: createMp08bTrustedNativeProductProjection(sources) };
}

describe("MP-08B RECONCILIATION-READ-01 native MP-04 read port", () => {
  it.each([
    ["CONFIRMED", "CONFIRMED"],
    ["ABSENT", "ABSENT"],
    ["UNKNOWN", "UNKNOWN"],
    ["RECOVERY_REQUIRED", "RECOVERY_REQUIRED"],
  ] as const)(
    "reads persisted %s without execution or recovery",
    (fixtureStatus, expectedStatus) => {
      const intent = intentFor();
      const store = new Map<string, unknown>([
        [DURABLE_EXECUTION_ID, persistedRecord(intent, fixtureStatus)],
      ]);
      const counters = { execute: 0, recover: 0, evidence: 0 };
      const coordinator = coordinatorFor(store, counters);

      const result = coordinator.readExecution(requestFor(intent));

      expect(result?.status).toBe(expectedStatus);
      expect(result?.durableExecutionId).toBe(DURABLE_EXECUTION_ID);
      expect(result?.evidence.nativeActionHash).toBe(MP03_NATIVE_HASH_FIXTURES[intent.action]);
      expect(counters).toEqual({ execute: 0, recover: 0, evidence: 0 });
    },
  );

  it("distinguishes no record from ABSENT and does not infer a result", () => {
    const intent = intentFor();
    const counters = { execute: 0, recover: 0, evidence: 0 };
    const coordinator = coordinatorFor(new Map(), counters);

    expect(coordinator.readExecution(requestFor(intent))).toBeUndefined();
    expect(counters).toEqual({ execute: 0, recover: 0, evidence: 0 });
  });

  it("fails closed on source request identity mismatch", () => {
    const intent = intentFor();
    const wrongSourceIntent = intentFor("REQUEST-WRONG");
    const store = new Map<string, unknown>([
      [DURABLE_EXECUTION_ID, persistedRecord(intent, "CONFIRMED")],
    ]);
    const coordinator = coordinatorFor(store, { execute: 0, recover: 0, evidence: 0 });

    expect(() => coordinator.readExecution(requestFor(wrongSourceIntent))).toThrow(
      "different source request",
    );
  });

  it("fails closed on approval identity mismatch", () => {
    const intent = intentFor();
    const store = new Map<string, unknown>([
      [DURABLE_EXECUTION_ID, persistedRecord(intent, "CONFIRMED")],
    ]);
    const coordinator = coordinatorFor(store, { execute: 0, recover: 0, evidence: 0 });

    expect(() =>
      coordinator.readExecution({ ...requestFor(intent), approvalId: "approval-wrong" }),
    ).toThrow("approval grant");
  });

  it("fails closed on native action identity mismatch", () => {
    const intent = intentFor();
    const store = new Map<string, unknown>([
      [DURABLE_EXECUTION_ID, persistedRecord(intent, "CONFIRMED")],
    ]);
    const coordinator = coordinatorFor(store, { execute: 0, recover: 0, evidence: 0 });

    expect(() =>
      coordinator.readExecution({
        ...requestFor(intent),
        expectedNativeActionHash: "f".repeat(64),
      }),
    ).toThrow("native action hash");
  });

  it("fails closed on malformed persisted state and never repairs it", () => {
    const intent = intentFor();
    const store = new Map<string, unknown>([[DURABLE_EXECUTION_ID, { malformed: true }]]);
    const coordinator = coordinatorFor(store, { execute: 0, recover: 0, evidence: 0 });

    expect(() => coordinator.readExecution(requestFor(intent))).toThrow(Mp04ExecutionReadError);
  });

  it("remains restart-readable from the same durable Horae source", () => {
    const intent = intentFor();
    const store = new Map<string, unknown>([
      [DURABLE_EXECUTION_ID, persistedRecord(intent, "UNKNOWN")],
    ]);
    const first = coordinatorFor(store, { execute: 0, recover: 0, evidence: 0 });
    const second = coordinatorFor(store, { execute: 0, recover: 0, evidence: 0 });

    expect(second.readExecution(requestFor(intent))).toEqual(
      first.readExecution(requestFor(intent)),
    );
    expect(second.readExecution(requestFor(intent))?.status).toBe("UNKNOWN");
  });

  it("wires the native coordinator read into Projection-01", async () => {
    const intent = intentFor();
    const store = new Map<string, unknown>([
      [DURABLE_EXECUTION_ID, persistedRecord(intent, "CONFIRMED")],
    ]);
    const counters = { execute: 0, recover: 0, evidence: 0 };
    const coordinator = coordinatorFor(store, counters);
    const { projection } = projectionHarness(intent, coordinator);

    const view = await projection.readProductView("delivery-reconciliation-read-01");

    expect(view.category).toBe("HANDLED_AUTOMATICALLY");
    expect(view.native.mp04Status).toBe("CONFIRMED");
    expect(counters).toEqual({ execute: 0, recover: 0, evidence: 0 });
  });

  it("does not allow a missing native reconciliation result to become handled", async () => {
    const intent = intentFor();
    const coordinator = coordinatorFor(new Map(), { execute: 0, recover: 0, evidence: 0 });
    const { projection } = projectionHarness(intent, coordinator);

    const view = await projection.readProductView("delivery-reconciliation-read-01");

    expect(view.category).toBe("BLOCKED");
    expect(view.native.reasonCode).toBe("INCONSISTENT_COMPLETION");
  });

  it("keeps native UNKNOWN non-handled through Projection-01", async () => {
    const intent = intentFor();
    const store = new Map<string, unknown>([
      [DURABLE_EXECUTION_ID, persistedRecord(intent, "UNKNOWN")],
    ]);
    const coordinator = coordinatorFor(store, { execute: 0, recover: 0, evidence: 0 });
    const { projection } = projectionHarness(intent, coordinator);

    const view = await projection.readProductView("delivery-reconciliation-read-01");

    expect(view.category).toBe("BLOCKED");
    expect(view.native.reasonCode).toBe("MP04_UNKNOWN");
  });

  it("has no read-side evidence sink or hidden mutation path", () => {
    const intent = intentFor();
    const evidenceSink = vi.fn();
    const store = new Map<string, unknown>([
      [DURABLE_EXECUTION_ID, persistedRecord(intent, "CONFIRMED")],
    ]);
    const ananke: Mp04AnankePort = {
      createExecutionAuthority: vi.fn(() => {
        throw new Error("unexpected execution");
      }),
      hashArgumentsDigest: () => ARGUMENTS_DIGEST,
      hashTargetDigest: () => TARGET_DIGEST,
    };
    const horae: Mp04HoraePort = {
      execute: vi.fn(async () => {
        throw new Error("unexpected Horae execute");
      }),
      recover: vi.fn(async () => {
        throw new Error("unexpected Horae recover");
      }),
      get: (id) => store.get(id),
    };
    const coordinator = createMp04ExecutionCoordinator({
      ananke,
      horae,
      effectAdapter: ADAPTER,
      owner: "read-only-test",
      provenance: MP04_DEPENDENCY_PROVENANCE,
      evidenceSink,
    });

    coordinator.readExecution(requestFor(intent));

    expect(ananke.createExecutionAuthority).not.toHaveBeenCalled();
    expect(horae.execute).not.toHaveBeenCalled();
    expect(horae.recover).not.toHaveBeenCalled();
    expect(evidenceSink).not.toHaveBeenCalled();
  });
});

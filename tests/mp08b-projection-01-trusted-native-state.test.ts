import { describe, expect, it } from "vitest";

import {
  compileAgentProposal,
  type ActionIntentV1,
} from "../packages/action-compiler/src/index.js";
import {
  createQueueWork,
  type ActivityRecordV1,
  type QueueDeliverySnapshotV1,
  type QueueLogicalOutcomeV1,
  type QueueOutcomeSnapshotV1,
} from "../packages/background-work/src/index.js";
import {
  MP03_ACTING_AGENT,
  MP03_ADRASTEIA_SHA,
  MP03_ANANKE_SHA,
  MP03_AUTHENTICATED_WORKLOAD,
  MP03_CAUSATION_ID,
  MP03_CORRELATION_ID,
  MP03_FATES_PROFILE,
  MP03_NATIVE_HASH_FIXTURES,
  MP03_POLICY_VERSION,
  MP03_PROFILE,
  MP03_REQUESTER,
  MP03_RUNTIME_ID,
  MP03_RUNTIME_INSTANCE,
  MP03_SESSION_ID,
  MP03_TENANT_ID,
  type MoiraeAdmissionResultV1,
  type Mp03AuthenticatedContext,
} from "../packages/fates-adapter/src/index.js";
import type { Mp04ExecutionResultV1 } from "../packages/execution-coordinator/src/index.js";
import {
  MP04_ADRASTEIA_SHA,
  MP04_ANANKE_SHA,
  MP04_DEPENDENCY_PROVENANCE,
  MP04_HORAE_SHA,
} from "../packages/execution-coordinator/src/index.js";
import type {
  ApprovalPresentationV1,
  Mp05ApprovalObservationV1,
} from "../packages/human-approval/src/index.js";
import {
  demoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";
import {
  createMp08bNativeProjectionSources,
  createMp08bTrustedNativeProductProjection,
  Mp08bNativeProjectionError,
  type Mp08bNativeProjectionSources,
} from "../apps/host/src/native-projection.js";
import type { Mp08bApprovalBindingV1 } from "../apps/host/src/approval-runtime.js";

const NOW = "2026-09-10T12:00:00.000Z";
const EXPIRY = "2026-09-10T13:00:00.000Z";
const APPROVAL_ID = "approval-projection-01";
const DECISION_ID = "decision-projection-01";
const EXECUTION_ID = "fates-execution:projection-01";

function intentFor(sourceRequestId = "REQUEST-PROJECTION-01"): ActionIntentV1 {
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

function contextFor(): Mp03AuthenticatedContext {
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
    resourceScope: {
      mode: "bounded",
      tenantId: MP03_TENANT_ID,
      resourceType: "appointment_details",
      resourceIds: ["RESOURCE-APPOINTMENT-DETAILS-001"],
      operations: ["disclose"],
      providerNamespace: "moirae",
    },
    correlation: {
      requestId: "REQUEST-PROJECTION-01",
      correlationId: MP03_CORRELATION_ID,
      causationId: MP03_CAUSATION_ID,
    },
    policyVersion: MP03_POLICY_VERSION,
    purpose: "appointment.details.disclosure",
  };
}

function waitingAdmission(intent: ActionIntentV1): MoiraeAdmissionResultV1 {
  const approvalId = APPROVAL_ID;
  return {
    authority: "admission-only",
    status: "WAITING_FOR_APPROVAL",
    action: intent.action,
    nativeDecision: "REQUIRE_APPROVAL",
    operation: MP03_PROFILE[intent.action].operation,
    nativeActionHash: MP03_NATIVE_HASH_FIXTURES[intent.action],
    moiraeCanonicalDigest: intent.canonicalDigest,
    moiraeIdempotencyKey: intent.idempotencyKey,
    approvalId,
    evidence: {
      sourceRequestId: intent.sourceRequestId,
      moiraeCanonicalDigest: intent.canonicalDigest,
      moiraeIdempotencyKey: intent.idempotencyKey,
      action: intent.action,
      dependencyProfile: MP03_FATES_PROFILE,
      anankeSha: MP03_ANANKE_SHA,
      adrasteiaSha: MP03_ADRASTEIA_SHA,
      operation: MP03_PROFILE[intent.action].operation,
      nativeActionHash: MP03_NATIVE_HASH_FIXTURES[intent.action],
      nativeDecision: "REQUIRE_APPROVAL",
      admissionStatus: "WAITING_FOR_APPROVAL",
      approvalId,
      approvalStatus: "pending",
      resourceScopeReference: "RESOURCE-APPOINTMENT-DETAILS-001",
      purpose: MP03_PROFILE[intent.action].purpose,
      contextTimestamp: NOW,
      evaluatedAt: NOW,
      auditId: "audit-projection-01",
      executorInvoked: false,
      effectExecuted: false,
    },
    executorInvoked: false,
    effectExecuted: false,
  };
}

function presentationFor(intent: ActionIntentV1): ApprovalPresentationV1 {
  const profile = MP03_PROFILE[intent.action];
  return {
    schemaVersion: "approval-presentation-v1",
    presentationVersion: "moirae-protocol/approval-presentation/v1",
    approvalId: APPROVAL_ID,
    nativePresentationBindingHash: "b".repeat(64),
    action: intent.action,
    operation: profile.operation,
    authenticatedWorkload: { id: MP03_AUTHENTICATED_WORKLOAD, kind: "service" },
    actingAgent: { id: MP03_ACTING_AGENT, kind: "agent" },
    representedRequester: { id: MP03_REQUESTER, kind: "human" },
    resource: intent.resource,
    target: intent.target,
    parameters: intent.parameters,
    purpose: profile.purpose,
    policyVersion: MP03_POLICY_VERSION,
    resourceScope: profile.scope,
    approvalExpiresAt: EXPIRY,
    sourceRequestReference: intent.sourceRequestId,
    admissionNativeActionHash: MP03_NATIVE_HASH_FIXTURES[intent.action],
    nativeActionHash: MP03_NATIVE_HASH_FIXTURES[intent.action],
    actionIntentDigest: intent.canonicalDigest,
    actionIntentIdempotencyKey: intent.idempotencyKey,
    evidenceReferences: intent.evidenceRefs,
    admissionEvidence: {
      status: "WAITING_FOR_APPROVAL",
      nativeDecision: "REQUIRE_APPROVAL",
      evaluatedAt: NOW,
      auditId: "audit-projection-01",
    },
    presentationDigest: "a".repeat(64),
  };
}

function approvalFor(
  intent: ActionIntentV1,
  state: Mp05ApprovalObservationV1["state"],
): Mp05ApprovalObservationV1 {
  return {
    schemaVersion: "mp05-approval-observation-v1",
    approvalId: APPROVAL_ID,
    state,
    ...(state === "APPROVED" || state === "REJECTED" ? { decisionId: DECISION_ID } : {}),
    actionHash: MP03_NATIVE_HASH_FIXTURES[intent.action],
    presentationBindingHash: "b".repeat(64),
    expiresAt: EXPIRY,
    observedAt: NOW,
  };
}

function activityFor(
  work: QueueDeliverySnapshotV1["work"],
  state: ActivityRecordV1["state"],
): ActivityRecordV1 {
  return {
    schemaVersion: "mp06b-activity-v1",
    activityId: `activity-${state.toLowerCase()}`,
    workId: work.workId,
    deliveryId: work.deliveryId,
    state,
    observedAt: NOW,
    sourceRequestId: work.sourceRequestId,
    actionIntentDigest: work.actionIntentDigest,
  };
}

function executionFor(
  intent: ActionIntentV1,
  status: Mp04ExecutionResultV1["status"],
): Mp04ExecutionResultV1 {
  return {
    schemaVersion: "1",
    status,
    durableExecutionId: EXECUTION_ID,
    evidence: {
      schemaVersion: "1",
      sourceRequestId: intent.sourceRequestId,
      canonicalDigest: intent.canonicalDigest,
      idempotencyKey: intent.idempotencyKey,
      action: intent.action,
      dependencyProfile: MP04_DEPENDENCY_PROVENANCE.profile,
      adrasteiaSha: MP04_ADRASTEIA_SHA,
      anankeSha: MP04_ANANKE_SHA,
      horaeSha: MP04_HORAE_SHA,
      approvalGrantId: APPROVAL_ID,
      durableExecutionId: EXECUTION_ID,
      durableState: status === "CONFIRMED" ? "terminal" : "effect_reconciliation_required",
      nativeResult: status === "CONFIRMED" || status === "ABSENT" ? status : "UNKNOWN",
      reconciliationRequired: status === "UNKNOWN" || status === "RECOVERY_REQUIRED",
      redispatchAttempted: false,
      events: [],
      observedAt: NOW,
    },
  };
}

type Scenario = Readonly<{
  deliveryState: QueueDeliverySnapshotV1["state"];
  outcome?: QueueLogicalOutcomeV1;
  approvalState: Mp05ApprovalObservationV1["state"];
  execution?: Mp04ExecutionResultV1;
  activityState: ActivityRecordV1["state"];
}>;

function projectionFor(scenario: Scenario) {
  const intent = intentFor();
  const waiting = waitingAdmission(intent);
  const work = createQueueWork(intent, {
    deliveryId: "delivery-projection-01",
    protocolReferences: { approval: { approvalId: APPROVAL_ID, decisionId: DECISION_ID } },
  });
  const delivery: QueueDeliverySnapshotV1 = {
    work,
    state: scenario.deliveryState,
    generation: 1,
    retryAttempt: 0,
    retryBudget: 3,
    approvalReference: {
      schemaVersion: "mp06d-approval-reference-v1",
      approvalId: APPROVAL_ID,
      decisionId: DECISION_ID,
      observationState: scenario.approvalState,
      observedAt: NOW,
    },
  };
  const outcome: QueueOutcomeSnapshotV1 | undefined = scenario.outcome
    ? {
        schemaVersion: "mp06b-queue-work-v1",
        workId: work.workId,
        outcome: scenario.outcome,
        lastDeliveryId: work.deliveryId,
        ...(scenario.execution ? { mp04DurableExecutionId: EXECUTION_ID } : {}),
        observedAt: NOW,
        retryAttempt: 0,
        retryBudget: 3,
      }
    : undefined;
  const queue = {
    delivery,
    ...(outcome ? { outcome } : {}),
    activity: [activityFor(work, scenario.activityState)],
  };
  const approval = approvalFor(intent, scenario.approvalState);
  const binding: Mp08bApprovalBindingV1 = {
    schemaVersion: "mp08b-approval-binding-v1",
    approvalId: APPROVAL_ID,
    intent,
    authenticatedContext: contextFor(),
    waitingAdmission: waiting,
    bindingDigest: "c".repeat(64),
  };
  const sources: Mp08bNativeProjectionSources = {
    readBinding: () => binding,
    readApproval: async () => approval,
    readApprovalPresentation: async () => presentationFor(intent),
    readQueue: () => queue,
    ...(scenario.execution ? { readExecution: async () => scenario.execution } : {}),
    trustedNow: () => NOW,
  };
  return createMp08bTrustedNativeProductProjection(sources);
}

describe("MP-08B PROJECTION-01 trusted native MP-07 projection", () => {
  it("projects pending durable approval to NEEDS_YOU", async () => {
    const view = await projectionFor({
      deliveryState: "WAITING_FOR_APPROVAL",
      outcome: "WAITING_FOR_APPROVAL",
      approvalState: "PENDING",
      activityState: "WAITING_FOR_APPROVAL",
    }).readProductView("delivery-projection-01");

    expect(view.category).toBe("NEEDS_YOU");
    expect(view.native.reasonCode).toBe("APPROVAL_PENDING");
  });

  it("projects durable rejection to BLOCKED", async () => {
    const view = await projectionFor({
      deliveryState: "DENIED",
      outcome: "DENIED",
      approvalState: "REJECTED",
      activityState: "DENIED",
    }).readProductView("delivery-projection-01");

    expect(view.category).toBe("BLOCKED");
    expect(view.native.reasonCode).toBe("MP03_REJECTED");
  });

  it.each([
    ["AVAILABLE", "ACTIVITY"],
    ["CLAIMED", "ACTIVITY"],
  ] as const)("keeps %s queue state in ACTIVITY", async (deliveryState, category) => {
    const view = await projectionFor({
      deliveryState,
      approvalState: "APPROVED",
      activityState: deliveryState === "CLAIMED" ? "CLAIMED" : "QUEUED",
    }).readProductView("delivery-projection-01");

    expect(view.category).toBe(category);
    expect(view.category).not.toBe("HANDLED_AUTOMATICALLY");
  });

  it.each([
    ["UNKNOWN", "MP04_UNKNOWN"],
    ["RECOVERY_REQUIRED", "MP04_RECOVERY_REQUIRED"],
    ["ABSENT", "EFFECT_ABSENT"],
  ] as const)("keeps MP-04 %s conservative", async (status, reasonCode) => {
    const view = await projectionFor({
      deliveryState: status === "ABSENT" ? "EFFECT_ABSENT" : "COMPLETED",
      outcome: status === "ABSENT" ? "EFFECT_ABSENT" : "RECONCILIATION_REQUIRED",
      approvalState: "APPROVED",
      execution: executionFor(intentFor(), status),
      activityState: status === "ABSENT" ? "EFFECT_ABSENT" : "RECONCILIATION_REQUIRED",
    }).readProductView("delivery-projection-01");

    expect(view.category).toBe("BLOCKED");
    expect(view.native.reasonCode).toBe(reasonCode);
  });

  it("requires durable completion plus CONFIRMED reconciliation for HANDLED_AUTOMATICALLY", async () => {
    const view = await projectionFor({
      deliveryState: "COMPLETED",
      outcome: "COMPLETED",
      approvalState: "APPROVED",
      execution: executionFor(intentFor(), "CONFIRMED"),
      activityState: "COMPLETED",
    }).readProductView("delivery-projection-01");

    expect(view.category).toBe("HANDLED_AUTOMATICALLY");
    expect(view.native.reasonCode).toBe("CONFIRMED_COMPLETION");
  });

  it("does not treat completed queue state as handled without an execution read", async () => {
    const view = await projectionFor({
      deliveryState: "COMPLETED",
      outcome: "COMPLETED",
      approvalState: "APPROVED",
      activityState: "COMPLETED",
    }).readProductView("delivery-projection-01");

    expect(view.category).toBe("BLOCKED");
    expect(view.native.reasonCode).toBe("INCONSISTENT_COMPLETION");
  });

  it("rejects identity mismatches and never falls back to synthetic state", async () => {
    const intent = intentFor();
    const work = createQueueWork(intent, {
      deliveryId: "delivery-mismatch",
      protocolReferences: { approval: { approvalId: APPROVAL_ID } },
    });
    const sources: Mp08bNativeProjectionSources = {
      readBinding: () => undefined,
      readApproval: async () => approvalFor(intent, "PENDING"),
      readApprovalPresentation: async () => presentationFor(intent),
      readQueue: () => ({
        delivery: { work, state: "CLAIMED", generation: 1, retryAttempt: 0, retryBudget: 3 },
        activity: [],
      }),
      trustedNow: () => NOW,
    };
    const projection = createMp08bTrustedNativeProductProjection(sources);

    await expect(projection.readProductView("delivery-mismatch")).rejects.toBeInstanceOf(
      Mp08bNativeProjectionError,
    );
    expect(projection.capabilities.fallsBackToSynthetic).toBe(false);
    expect(projection.capabilities.mutatesProtocolState).toBe(false);
  });

  it("is stable when reconstructed over the same durable native snapshots", async () => {
    const scenario: Scenario = {
      deliveryState: "COMPLETED",
      outcome: "COMPLETED",
      approvalState: "APPROVED",
      execution: executionFor(intentFor(), "CONFIRMED"),
      activityState: "COMPLETED",
    };
    const first = await projectionFor(scenario).readProductView("delivery-projection-01");
    const reconstructed = await projectionFor(scenario).readProductView("delivery-projection-01");

    expect(reconstructed).toEqual(first);
  });

  it("wires the accepted MP-05 and MP-06 runtime readers without mutation", async () => {
    const intent = intentFor();
    const waiting = waitingAdmission(intent);
    const work = createQueueWork(intent, {
      deliveryId: "delivery-runtime-wiring",
      protocolReferences: { approval: { approvalId: APPROVAL_ID } },
    });
    const delivery: QueueDeliverySnapshotV1 = {
      work,
      state: "WAITING_FOR_APPROVAL",
      generation: 1,
      retryAttempt: 0,
      retryBudget: 3,
    };
    const approval = approvalFor(intent, "PENDING");
    const binding: Mp08bApprovalBindingV1 = {
      schemaVersion: "mp08b-approval-binding-v1",
      approvalId: APPROVAL_ID,
      intent,
      authenticatedContext: contextFor(),
      waitingAdmission: waiting,
      bindingDigest: "c".repeat(64),
    };
    const sources = createMp08bNativeProjectionSources({
      approvalRuntime: {
        getApprovalBinding: () => binding,
        readApproval: async () => approval,
        refreshApproval: async () => ({
          schemaVersion: "mp05-approval-preparation-v1",
          presentation: presentationFor(intent),
          request: {
            intent,
            authenticatedContext: contextFor(),
            waitingAdmission: waiting,
          },
        }),
      },
      queueRuntime: {
        inspectDelivery: () => delivery,
        inspectOutcome: () => ({
          schemaVersion: "mp06b-queue-work-v1",
          workId: work.workId,
          outcome: "WAITING_FOR_APPROVAL",
          retryAttempt: 0,
          retryBudget: 3,
        }),
        listActivity: () => [activityFor(work, "WAITING_FOR_APPROVAL")],
      },
      trustedNow: () => NOW,
    });
    const view = await createMp08bTrustedNativeProductProjection(sources).readProductView(
      delivery.work.deliveryId,
    );

    expect(view.category).toBe("NEEDS_YOU");
    expect(view.activity[0]?.state).toBe("WAITING_FOR_APPROVAL");
  });
});

import { describe, expect, it } from "vitest";

import {
  MP03_ACTING_AGENT,
  MP03_AUTHENTICATED_WORKLOAD,
  MP03_CAUSATION_ID,
  MP03_CORRELATION_ID,
  MP03_POLICY_VERSION,
  MP03_PROFILE,
  MP03_REQUESTER,
  MP03_RUNTIME_ID,
  MP03_RUNTIME_INSTANCE,
  MP03_SESSION_ID,
  MP03_TENANT_ID,
  MP03_NATIVE_HASH_FIXTURES,
  type Mp03AuthenticatedContext,
} from "../packages/fates-adapter/src/index.js";
import {
  MP04_ADRASTEIA_SHA,
  MP04_ANANKE_SHA,
  MP04_DEPENDENCY_PROVENANCE,
  MP04_HORAE_SHA,
  type Mp04ExecutionResultV1,
} from "../packages/execution-coordinator/src/index.js";
import {
  createQueueWork,
  type ActivityRecordV1,
  type QueueDeliveryStateV1,
  type QueueLogicalOutcomeV1,
  type QueueOutcomeSnapshotV1,
} from "../packages/background-work/src/index.js";
import {
  compileAgentProposal,
  type ActionIntentV1,
  type CompilerContextV1,
} from "../packages/action-compiler/src/index.js";
import {
  buildMp07ProductView,
  Mp07ProductBoundaryError,
  type Mp07ApprovalObservationV1,
  type Mp07ProductInputV1,
} from "../apps/host/src/index.js";
import {
  demoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";

const NOW = "2026-09-05T12:00:00.000Z";
const EXPIRY = "2026-09-05T13:00:00.000Z";
const actions = primaryCompilerFixtures.map((fixture) => fixture.expectedAction);

function compilerContext(sourceRequestId: string): CompilerContextV1 {
  return {
    ...demoCompilerContext,
    agentPrincipalId: MP03_ACTING_AGENT,
    sourceRequestId,
  };
}

function intentFor(index: number, sourceRequestId = `REQUEST-MP07B-${index}`): ActionIntentV1 {
  const result = compileAgentProposal({
    proposal: primaryCompilerFixtures[index].proposal,
    context: compilerContext(sourceRequestId),
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
      requestId: "REQUEST-MP07B-CONTEXT",
      correlationId: MP03_CORRELATION_ID,
      causationId: MP03_CAUSATION_ID,
    },
    policyVersion: MP03_POLICY_VERSION,
    purpose: "appointment.details.disclosure",
  };
}

function outcomeFor(workId: string, outcome: QueueLogicalOutcomeV1): QueueOutcomeSnapshotV1 {
  return {
    schemaVersion: "mp06b-queue-work-v1",
    workId,
    outcome,
    retryAttempt: 0,
    retryBudget: 3,
  };
}

function activityFor(intent: ActionIntentV1, state: ActivityRecordV1["state"]): ActivityRecordV1 {
  const work = createQueueWork(intent, { deliveryId: `delivery-${intent.sourceRequestId}` });
  return {
    schemaVersion: "mp06b-activity-v1",
    activityId: `activity-${intent.sourceRequestId}`,
    workId: work.workId,
    deliveryId: work.deliveryId,
    state,
    observedAt: NOW,
    sourceRequestId: intent.sourceRequestId,
    actionIntentDigest: intent.canonicalDigest,
  };
}

function inputFor(
  intent: ActionIntentV1,
  state: QueueDeliveryStateV1,
  options: {
    outcome?: QueueLogicalOutcomeV1;
    activity?: readonly ActivityRecordV1[];
    approval?: Mp07ApprovalObservationV1;
    execution?: Mp04ExecutionResultV1;
    authenticatedContext?: unknown;
  } = {},
): Mp07ProductInputV1 {
  const work = createQueueWork(intent, { deliveryId: `delivery-${intent.sourceRequestId}` });
  return {
    actionIntent: intent,
    authenticatedContext: options.authenticatedContext,
    queue: {
      delivery: {
        work,
        state,
        generation: 1,
        retryAttempt: 0,
        retryBudget: 3,
      },
      ...(options.outcome ? { outcome: outcomeFor(work.workId, options.outcome) } : {}),
      activity: options.activity ?? [],
    },
    ...(options.approval ? { approval: options.approval } : {}),
    ...(options.execution ? { execution: options.execution } : {}),
    observedAt: NOW,
  };
}

function presentationFor(
  intent: ActionIntentV1,
): NonNullable<Mp07ApprovalObservationV1["presentation"]> {
  const profile = MP03_PROFILE[intent.action];
  return {
    schemaVersion: "approval-presentation-v1",
    presentationVersion: "moirae-protocol/approval-presentation/v1",
    approvalId: `approval-${intent.sourceRequestId}`,
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
      auditId: `audit-${intent.sourceRequestId}`,
    },
    presentationDigest: "a".repeat(64),
  };
}

function pendingApproval(intent: ActionIntentV1): Mp07ApprovalObservationV1 {
  return {
    approvalId: `approval-${intent.sourceRequestId}`,
    status: "PENDING",
    expiresAt: EXPIRY,
    presentation: presentationFor(intent),
  };
}

function executionFor(status: Mp04ExecutionResultV1["status"]): Mp04ExecutionResultV1 {
  return {
    schemaVersion: "1",
    status,
    durableExecutionId: `fates-execution:sha256:${"c".repeat(64)}`,
    evidence: {
      schemaVersion: "1",
      dependencyProfile: MP04_DEPENDENCY_PROVENANCE.profile,
      adrasteiaSha: MP04_ADRASTEIA_SHA,
      anankeSha: MP04_ANANKE_SHA,
      horaeSha: MP04_HORAE_SHA,
      durableState: status === "CONFIRMED" ? "terminal" : "effect_reconciliation_required",
      reconciliationRequired: status === "UNKNOWN" || status === "RECOVERY_REQUIRED",
      redispatchAttempted: false,
      events: [],
      observedAt: NOW,
    },
  };
}

describe("MP-07B deterministic product read model", () => {
  it("maps durable confirmed completion to HANDLED_AUTOMATICALLY", () => {
    const intent = intentFor(0);
    const view = buildMp07ProductView(
      inputFor(intent, "COMPLETED", {
        outcome: "COMPLETED",
        execution: executionFor("CONFIRMED"),
        authenticatedContext: contextFor(),
      }),
    );

    expect(view.category).toBe("HANDLED_AUTOMATICALLY");
    expect(view.native.reasonCode).toBe("CONFIRMED_COMPLETION");
    expect(view.native.mp04Status).toBe("CONFIRMED");
    expect(view.context?.tenantId).toBe(MP03_TENANT_ID);
  });

  it.each([
    ["UNKNOWN", "MP04_UNKNOWN"],
    ["RECOVERY_REQUIRED", "MP04_RECOVERY_REQUIRED"],
    ["ABSENT", "EFFECT_ABSENT"],
  ] as const)("does not call %s completion handled", (status, reasonCode) => {
    const view = buildMp07ProductView(
      inputFor(intentFor(0), "COMPLETED", {
        outcome: status === "ABSENT" ? "EFFECT_ABSENT" : "RECONCILIATION_REQUIRED",
        execution: executionFor(status),
      }),
    );
    expect(view.category).toBe("BLOCKED");
    expect(view.native.reasonCode).toBe(reasonCode);
  });

  it.each([
    ["DENIED", "MP03_REJECTED"],
    ["BOUNDARY_BLOCKED", "BOUNDARY_BLOCKED"],
    ["TERMINAL_FAILURE", "TERMINAL_FAILURE"],
    ["RETRY_EXHAUSTED", "RETRY_EXHAUSTED"],
    ["RECONCILIATION_REQUIRED", "MP04_UNKNOWN"],
    ["EFFECT_ABSENT", "EFFECT_ABSENT"],
  ] as const)("maps %s to BLOCKED with a structured reason", (state, reasonCode) => {
    const view = buildMp07ProductView(inputFor(intentFor(0), state, { outcome: state }));
    expect(view.category).toBe("BLOCKED");
    expect(view.native.reasonCode).toBe(reasonCode);
  });

  it("maps operational progress to ACTIVITY and bounds activity output", () => {
    const intent = intentFor(0);
    const records = Array.from({ length: 60 }, (_, index) => ({
      ...activityFor(intent, index === 59 ? "CLAIM_RECLAIMED" : "PROCESSING"),
      activityId: `activity-${index}`,
    }));
    const view = buildMp07ProductView(inputFor(intent, "CLAIMED", { activity: records }));
    expect(view.category).toBe("ACTIVITY");
    expect(view.activity).toHaveLength(50);
    expect(view.activity.at(-1)?.state).toBe("CLAIM_RECLAIMED");
  });

  it("requires a valid current MP-05 presentation for NEEDS_YOU", () => {
    const intent = intentFor(0);
    const view = buildMp07ProductView(
      inputFor(intent, "WAITING_FOR_APPROVAL", {
        outcome: "WAITING_FOR_APPROVAL",
        approval: pendingApproval(intent),
      }),
    );
    expect(view.category).toBe("NEEDS_YOU");
    expect(view.approval?.approvalId).toBe(`approval-${intent.sourceRequestId}`);
    expect(view.approval?.presentationDigest).toBe("a".repeat(64));
  });

  it("does not fabricate NEEDS_YOU from an approval reference alone", () => {
    const intent = intentFor(0);
    expect(() =>
      buildMp07ProductView(
        inputFor(intent, "WAITING_FOR_APPROVAL", {
          outcome: "WAITING_FOR_APPROVAL",
          approval: { approvalId: "approval-only-reference", status: "PENDING" },
        }),
      ),
    ).toThrowError(Mp07ProductBoundaryError);
  });

  it.each([
    "EXPIRED",
    "REJECTED",
    "REVOKED",
    "CONSUMED",
    "MISSING",
    "INVALID",
    "BOUNDARY_FAILURE",
  ] as const)("maps %s approval observation to BLOCKED", (status) => {
    const intent = intentFor(0);
    const view = buildMp07ProductView(
      inputFor(intent, "WAITING_FOR_APPROVAL", {
        outcome: "WAITING_FOR_APPROVAL",
        approval: { approvalId: `approval-${status}`, status },
      }),
    );
    expect(view.category).toBe("BLOCKED");
    expect(view.native.mp05ApprovalStatus).toBe(status);
  });

  it("renders all exact action fields for all supported actions", () => {
    for (const [index, action] of actions.entries()) {
      const intent = intentFor(index);
      const view = buildMp07ProductView(inputFor(intent, "CLAIMED"));
      expect(view.action.action).toBe(action);
      expect(view.action.principal).toEqual(intent.principal);
      expect(view.action.requester).toEqual(intent.requester);
      expect(view.action.resource).toEqual(intent.resource);
      expect(view.action.target).toEqual(intent.target);
      expect(view.action.parameters).toEqual(intent.parameters);
      expect(view.work.actionIntentDigest).toBe(intent.canonicalDigest);
    }
  });

  it.each(["sourceRequestId", "canonicalDigest", "idempotencyKey", "workId"] as const)(
    "rejects a forged %s binding",
    (field) => {
      const intent = intentFor(0);
      const input = inputFor(intent, "CLAIMED");
      const forged = JSON.parse(JSON.stringify(input)) as {
        queue: {
          delivery: {
            work: {
              sourceRequestId: string;
              actionIntentDigest: string;
              actionIntentIdempotencyKey: string;
              workId: string;
            };
          };
        };
      };
      if (field === "sourceRequestId") forged.queue.delivery.work.sourceRequestId = "forged";
      if (field === "canonicalDigest")
        forged.queue.delivery.work.actionIntentDigest = "f".repeat(64);
      if (field === "idempotencyKey")
        forged.queue.delivery.work.actionIntentIdempotencyKey = "f".repeat(64);
      if (field === "workId") forged.queue.delivery.work.workId = "forged-work";
      expect(() => buildMp07ProductView(forged as unknown as Mp07ProductInputV1)).toThrowError(
        Mp07ProductBoundaryError,
      );
    },
  );

  it("rejects semantic mutation inside the canonical ActionIntent", () => {
    const intent = intentFor(0);
    const input = inputFor(intent, "CLAIMED");
    const mutated = JSON.parse(JSON.stringify(intent)) as ActionIntentV1 & {
      parameters: { recipientAddress: string };
    };
    mutated.parameters.recipientAddress = "attacker@example.test";
    expect(() => buildMp07ProductView({ ...input, actionIntent: mutated })).toThrowError(
      Mp07ProductBoundaryError,
    );
  });

  it("rejects an approval presentation whose target or parameters differ", () => {
    const intent = intentFor(0);
    const approval = pendingApproval(intent);
    const forged = JSON.parse(JSON.stringify(approval)) as {
      presentation?: { target: Record<string, unknown> };
    };
    if (forged.presentation)
      forged.presentation.target = { kind: "email", address: "attacker@example.test" };
    expect(() =>
      buildMp07ProductView(
        inputFor(intent, "WAITING_FOR_APPROVAL", {
          outcome: "WAITING_FOR_APPROVAL",
          approval: forged as unknown as Mp07ApprovalObservationV1,
        }),
      ),
    ).toThrowError(Mp07ProductBoundaryError);
  });

  it("ignores forged category/evidence/activity as authority", () => {
    const intent = intentFor(0);
    const input = inputFor(intent, "DENIED", {
      outcome: "DENIED",
      activity: [activityFor(intent, "COMPLETED")],
    });
    const forged = Object.assign(input, {
      category: "HANDLED_AUTOMATICALLY",
      evidence: { mp04Status: "CONFIRMED" },
    }) as Mp07ProductInputV1;
    const view = buildMp07ProductView(forged);
    expect(view.category).toBe("BLOCKED");
    expect(view.native.reasonCode).toBe("MP03_REJECTED");
    expect(view.activity[0]?.state).toBe("COMPLETED");
  });

  it("is deterministic and excludes unbounded internal objects", () => {
    const input = inputFor(intentFor(2), "CLAIMED", { authenticatedContext: contextFor() });
    const first = buildMp07ProductView(input);
    const second = buildMp07ProductView(input);
    expect(first).toEqual(second);
    expect(first).not.toHaveProperty("actionIntent");
    expect(first).not.toHaveProperty("rawGrant");
    expect(JSON.stringify(first)).not.toContain("secret");
  });

  it("rejects unsupported observed state instead of guessing a category", () => {
    const input = inputFor(intentFor(0), "CLAIMED");
    const forged = JSON.parse(JSON.stringify(input)) as {
      queue: { delivery: { state: string } };
    };
    forged.queue.delivery.state = "UNSUPPORTED" as QueueDeliveryStateV1;
    expect(() => buildMp07ProductView(forged as unknown as Mp07ProductInputV1)).toThrowError(
      Mp07ProductBoundaryError,
    );
  });
});

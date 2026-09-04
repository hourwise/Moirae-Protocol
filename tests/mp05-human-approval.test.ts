import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  actionIntentDigest,
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
  MP03_CONTEXT_TIMESTAMP,
  MP03_DEPENDENCY_PROVENANCE,
  MP03_NATIVE_HASH_FIXTURES,
  MP03_POLICY_VERSION,
  MP03_PROFILE,
  MP03_REQUESTER,
  MP03_RUNTIME_ID,
  MP03_RUNTIME_INSTANCE,
  MP03_SESSION_ID,
  MP03_TENANT_ID,
  createMp03AdmissionAdapter,
  type Mp03AdmissionAdapter,
  type Mp03Action,
  type Mp03AuthenticatedContext,
  type MoiraeAdmissionResultV1,
} from "../packages/fates-adapter/src/index.js";
import {
  MP04_DEPENDENCY_PROVENANCE,
  InMemoryMp04ExecutionIndex,
  createMp04ExecutionCoordinator,
  type Mp04AnankePort,
  type Mp04EffectAdapterIdentityV1,
  type Mp04HoraePort,
} from "../packages/execution-coordinator/src/index.js";
import {
  ApprovalPresentationV1Schema,
  MP05_FATES_DEPENDENCY_PROVENANCE,
  MP05_PRESENTATION_VERSION,
  createMp05HumanApprovalCoordinator,
  type Mp05AnankeApprovalPort,
  type Mp05ApprovalRequestV1,
  type Mp05NativeApprovalDecisionInput,
} from "../packages/human-approval/src/index.js";
import {
  createAdministrativeAgentWithModelFactory,
  invokeAdministrativeAgent,
} from "../packages/strands-agent/src/agent.js";
import { SyntheticStructuredOutputModel } from "../packages/strands-agent/test/support/mock-model.js";
import {
  demoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";

const NOW = "2026-09-03T12:00:00.000Z";
const ADAPTER_ID: Mp04EffectAdapterIdentityV1 = {
  id: "synthetic.moirae-administrative",
  version: "1",
};
const OPERATOR_A = {
  operatorId: "operator-a",
  sessionId: "session-a",
  roles: ["approver"],
};
const OPERATOR_B = {
  operatorId: "operator-b",
  sessionId: "session-b",
  roles: ["approver"],
};

const NATIVE_APPROVAL_HASH_FIXTURES: Record<Action, string> = {
  SEND_APPOINTMENT_DETAILS: "a".repeat(64),
  RESCHEDULE_APPOINTMENT: "b".repeat(64),
  TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: "c".repeat(64),
};
const NATIVE_PRESENTATION_BINDING_FIXTURES: Record<Action, string> = {
  SEND_APPOINTMENT_DETAILS: "d".repeat(64),
  RESCHEDULE_APPOINTMENT: "e".repeat(64),
  TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: "f".repeat(64),
};

type Action = Mp03Action;

interface FakeNativeGrant {
  id: string;
  serverName: string;
  toolName: string;
  toolVersion: string;
  actionHash: string;
  arguments: Record<string, unknown>;
  executionContext: Mp03AuthenticatedContext;
  status: "pending" | "approved" | "rejected" | "expired" | "revoked" | "consumed";
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

function compilerContext(sourceRequestId = "REQUEST-MP02-DETAILS-001"): CompilerContextV1 {
  return {
    ...demoCompilerContext,
    agentPrincipalId: MP03_ACTING_AGENT,
    sourceRequestId,
  };
}

function proposalFor(action: Action) {
  const proposal =
    primaryCompilerFixtures[
      action === "SEND_APPOINTMENT_DETAILS" ? 0 : action === "RESCHEDULE_APPOINTMENT" ? 1 : 2
    ].proposal;
  return action === "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"
    ? { ...proposal, recipientReference: "personal-address@example.test" }
    : proposal;
}

function compileFixture(action: Action): ActionIntentV1 {
  const result = compileAgentProposal({
    proposal: proposalFor(action),
    context: compilerContext(),
  });
  if (result.status !== "COMPILED") throw new Error(`Fixture did not compile: ${result.status}`);
  return result.actionIntent;
}

function contextFor(action: Action): Mp03AuthenticatedContext {
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
      requestId: "REQUEST-MP02-DETAILS-001",
      correlationId: "CORRELATION-FATES-006B-001",
      causationId: MP03_CAUSATION_ID,
    },
    policyVersion: MP03_POLICY_VERSION,
    purpose: MP03_PROFILE[action].purpose,
  };
}

function waitingFor(
  action: Action,
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
      dependencyProfile: "ananke-fates-006b-mp03-admission-v0.1.0-protocol-1.4.0",
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
      contextTimestamp: MP03_CONTEXT_TIMESTAMP,
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
  action: Action,
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
      dependencyProfile: "ananke-fates-006b-mp03-admission-v0.1.0-protocol-1.4.0",
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
      contextTimestamp: MP03_CONTEXT_TIMESTAMP,
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
  action: Action,
  intent: ActionIntentV1,
  context: Mp03AuthenticatedContext,
  approvalId: string,
  expiresAt = "2026-09-03T12:05:00.000Z",
): FakeNativeGrant {
  return {
    id: approvalId,
    serverName: MP03_PROFILE[action].operation.server,
    toolName: MP03_PROFILE[action].operation.toolName,
    toolVersion: MP03_PROFILE[action].operation.version,
    actionHash: NATIVE_APPROVAL_HASH_FIXTURES[action],
    arguments: structuredClone(intent.parameters),
    executionContext: structuredClone(context),
    status: "pending",
    requestedAt: NOW,
    expiresAt,
    used: false,
    revision: 0,
    bindRequestIdentity: true,
    presentationVersion: "fates-008a/approval-presentation/v1",
    presentationBindingHash: NATIVE_PRESENTATION_BINDING_FIXTURES[action],
  };
}

function deriveSelfConsistentNativeHashes(
  material: Parameters<NonNullable<Mp05AnankeApprovalPort["deriveApprovalHashes"]>>[0],
) {
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

function harness(action: Action, expiresAt?: string) {
  const intent = compileFixture(action);
  const context = contextFor(action);
  const approvalId = `approval-${action.toLowerCase()}`;
  const waiting = waitingFor(action, intent, approvalId);
  const state: FakeNativeGrant = nativeGrant(action, intent, context, approvalId, expiresAt);
  const expectedNativeActionHash = state.actionHash;
  const expectedPresentationBindingHash = state.presentationBindingHash;
  const clock = { value: NOW };
  const effect = { calls: 0 };
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
        if (Date.parse(input.now) >= Date.parse(state.expiresAt)) {
          state.status = "expired";
          state.revision += 1;
          return { outcome: "expired", grant: structuredClone(state) };
        }
        state.status = input.decision === "approve" ? "approved" : "rejected";
        state.revision += 1;
        state.decisionId = "11111111-1111-4111-8111-111111111111";
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
        return {
          outcome: "applied",
          decisionId: state.decisionId,
          grant: structuredClone(state),
        };
      }
      const same =
        (input.decision === "approve" && state.status === "approved") ||
        (input.decision === "reject" && state.status === "rejected");
      return {
        outcome: same ? "idempotent" : "conflict",
        decisionId: state.decisionId,
        grant: structuredClone(state),
      };
    }),
    deriveApprovalHashes: vi.fn(async () => ({
      actionHash: expectedNativeActionHash,
      presentationBindingHash: expectedPresentationBindingHash,
    })),
  };
  const admit = vi.fn(async (input: Parameters<Mp03AdmissionAdapter["admitActionIntent"]>[0]) =>
    state.status === "approved" && typeof input.approvalId === "string"
      ? admittedFrom(action, intent, input.approvalId)
      : waiting,
  );
  const confirmedResult = {
    schemaVersion: "1" as const,
    status: "CONFIRMED" as const,
    durableExecutionId: "fates-execution:sha256:" + "1".repeat(64),
    evidence: {
      schemaVersion: "1" as const,
      dependencyProfile: MP04_DEPENDENCY_PROVENANCE.profile,
      adrasteiaSha: MP04_DEPENDENCY_PROVENANCE.adrasteiaSha,
      anankeSha: MP04_DEPENDENCY_PROVENANCE.ananke.sha,
      horaeSha: MP04_DEPENDENCY_PROVENANCE.horae.sha,
      reconciliationRequired: false,
      redispatchAttempted: false as const,
      events: [],
      observedAt: NOW,
    },
  };
  const execution = {
    executeAdmittedAction: vi.fn(async () => {
      if (effect.calls === 0) effect.calls += 1;
      return confirmedResult;
    }),
  };
  const coordinator = createMp05HumanApprovalCoordinator({
    approval: native,
    admission: { admitActionIntent: admit },
    execution,
    trustedTime: { now: () => clock.value },
    provenance: MP05_FATES_DEPENDENCY_PROVENANCE,
  });
  const request: Mp05ApprovalRequestV1 = {
    intent,
    authenticatedContext: context,
    waitingAdmission: waiting,
  };
  return { coordinator, request, native, admit, execution, effect, state, clock };
}

function envelope(
  preparation: {
    presentation: {
      approvalId: string;
      presentationDigest: string;
      nativePresentationBindingHash: string;
    };
  },
  decision: "APPROVE" | "REJECT",
) {
  return {
    schemaVersion: "human-decision-v1" as const,
    approvalId: preparation.presentation.approvalId,
    decision,
    presentationDigest: preparation.presentation.presentationDigest,
    nativePresentationBindingHash: preparation.presentation.nativePresentationBindingHash,
  };
}

function markApproved(
  fixture: ReturnType<typeof harness>,
  input: Mp05NativeApprovalDecisionInput,
): void {
  fixture.state.status = "approved";
  fixture.state.decisionId = "11111111-1111-4111-8111-111111111111";
  fixture.state.approvedBy = (input.operator as { operatorId: string }).operatorId;
  fixture.state.approvedBySessionId = (input.operator as { sessionId: string }).sessionId;
  fixture.state.approvedAt = input.now;
  fixture.state.revision += 1;
}

function forgeSelfConsistentApprovedRecoveryRecord(
  fixture: ReturnType<typeof harness>,
  options: {
    arguments?: Record<string, unknown>;
    executionContext?: Mp03AuthenticatedContext;
    serverName?: string;
    toolName?: string;
    toolVersion?: string;
    presentationBindingHash?: string;
    decisionId?: string;
  } = {},
): void {
  fixture.state.arguments = structuredClone(options.arguments ?? fixture.state.arguments);
  fixture.state.executionContext = structuredClone(
    options.executionContext ?? fixture.state.executionContext,
  );
  if (options.serverName) fixture.state.serverName = options.serverName;
  if (options.toolName) fixture.state.toolName = options.toolName;
  if (options.toolVersion) fixture.state.toolVersion = options.toolVersion;
  fixture.state.status = "approved";
  fixture.state.decisionId = options.decisionId ?? "11111111-1111-4111-8111-111111111111";
  fixture.state.approvedBy = OPERATOR_A.operatorId;
  fixture.state.approvedBySessionId = OPERATOR_A.sessionId;
  fixture.state.approvedAt = NOW;
  fixture.state.bindingHash = "b".repeat(64);
  const derive = vi.mocked(fixture.native.deriveApprovalHashes);
  derive.mockImplementation(async (material) => deriveSelfConsistentNativeHashes(material));
  const material = {
    approvalId: fixture.state.id,
    serverName: fixture.state.serverName,
    toolName: fixture.state.toolName,
    toolVersion: fixture.state.toolVersion,
    arguments: fixture.state.arguments,
    executionContext: fixture.state.executionContext,
    expiresAt: fixture.state.expiresAt,
    bindRequestIdentity: fixture.state.bindRequestIdentity,
    presentationVersion: fixture.state.presentationVersion,
  };
  Object.assign(fixture.state, deriveSelfConsistentNativeHashes(material));
  if (options.presentationBindingHash)
    fixture.state.presentationBindingHash = options.presentationBindingHash;
}

function expectRecoveryInvalid(fixture: ReturnType<typeof harness>) {
  return expect(
    fixture.coordinator.recoverOrRefresh({
      intent: fixture.request.intent,
      authenticatedContext: fixture.request.authenticatedContext,
      approvalId: fixture.state.id,
    }),
  ).rejects.toMatchObject({
    code: "NATIVE_APPROVAL_INVALID",
    message: "Native approval is not exactly bound to the MP-03 ActionIntent and context.",
  });
}

const RECOVERY_SEMANTIC_MUTATIONS: ReadonlyArray<{
  action: Action;
  field: string;
  mutate: (parameters: Record<string, unknown>) => Record<string, unknown>;
}> = [
  {
    action: "SEND_APPOINTMENT_DETAILS",
    field: "bookingId",
    mutate: (parameters) => ({ ...parameters, bookingId: "BOOKING-ATTACKER" }),
  },
  {
    action: "SEND_APPOINTMENT_DETAILS",
    field: "recipientAddress",
    mutate: (parameters) => ({ ...parameters, recipientAddress: "attacker@example.test" }),
  },
  {
    action: "SEND_APPOINTMENT_DETAILS",
    field: "templateId",
    mutate: (parameters) => ({ ...parameters, templateId: "appointment-details-forged-v2" }),
  },
  {
    action: "RESCHEDULE_APPOINTMENT",
    field: "bookingId",
    mutate: (parameters) => ({ ...parameters, bookingId: "BOOKING-ATTACKER" }),
  },
  {
    action: "RESCHEDULE_APPOINTMENT",
    field: "currentStart",
    mutate: (parameters) => ({ ...parameters, currentStart: "2026-09-04T12:00:00.000Z" }),
  },
  {
    action: "RESCHEDULE_APPOINTMENT",
    field: "proposedStart",
    mutate: (parameters) => ({ ...parameters, proposedStart: "2026-09-08T14:00:00.000Z" }),
  },
  {
    action: "RESCHEDULE_APPOINTMENT",
    field: "timeZone",
    mutate: (parameters) => ({ ...parameters, timeZone: "America/New_York" }),
  },
  {
    action: "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
    field: "directoryResourceId",
    mutate: (parameters) => ({ ...parameters, directoryResourceId: "RESOURCE-ATTACKER" }),
  },
  {
    action: "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
    field: "recipientAddress",
    mutate: (parameters) => ({ ...parameters, recipientAddress: "attacker@example.test" }),
  },
  {
    action: "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
    field: "exportFormat",
    mutate: (parameters) => ({ ...parameters, exportFormat: "json" }),
  },
];

const RECOVERY_CONTEXT_MUTATIONS: ReadonlyArray<{
  field: string;
  mutate: (context: Mp03AuthenticatedContext) => Mp03AuthenticatedContext;
}> = [
  {
    field: "authenticated workload",
    mutate: (context) =>
      ({
        ...context,
        authenticatedPrincipal: { ...context.authenticatedPrincipal, id: "forged-workload" },
      }) as unknown as Mp03AuthenticatedContext,
  },
  {
    field: "acting agent principal",
    mutate: (context) =>
      ({
        ...context,
        actingPrincipal: { ...context.actingPrincipal, id: "forged-agent" },
      }) as unknown as Mp03AuthenticatedContext,
  },
  {
    field: "requester/customer identity",
    mutate: (context) =>
      ({
        ...context,
        representedPrincipal: { ...context.representedPrincipal, id: "CUSTOMER-ATTACKER" },
      }) as unknown as Mp03AuthenticatedContext,
  },
  {
    field: "tenant",
    mutate: (context) =>
      ({ ...context, tenantId: "TENANT-ATTACKER" }) as unknown as Mp03AuthenticatedContext,
  },
  {
    field: "runtime identity",
    mutate: (context) =>
      ({ ...context, runtimeId: "runtime-attacker" }) as unknown as Mp03AuthenticatedContext,
  },
  {
    field: "runtime instance identity",
    mutate: (context) =>
      ({
        ...context,
        runtimeInstanceId: "runtime-instance-attacker",
      }) as unknown as Mp03AuthenticatedContext,
  },
  {
    field: "session identity",
    mutate: (context) =>
      ({ ...context, sessionId: "session-attacker" }) as unknown as Mp03AuthenticatedContext,
  },
  {
    field: "purpose",
    mutate: (context) =>
      ({ ...context, purpose: "appointment.reschedule" }) as unknown as Mp03AuthenticatedContext,
  },
  {
    field: "policy identity",
    mutate: (context) =>
      ({ ...context, policyVersion: "policy-attacker" }) as unknown as Mp03AuthenticatedContext,
  },
  {
    field: "resource scope",
    mutate: (context) =>
      ({
        ...context,
        resourceScope: { ...context.resourceScope, resourceIds: ["RESOURCE-ATTACKER"] },
      }) as unknown as Mp03AuthenticatedContext,
  },
];

describe("MP-05 fixture-bound human approval", () => {
  it.each(Object.keys(MP03_PROFILE) as Action[])(
    "creates an exact structured presentation for %s without authority or execution",
    async (action) => {
      const fixture = harness(action);
      const prepared = await fixture.coordinator.prepareApproval(fixture.request);
      expect(ApprovalPresentationV1Schema.safeParse(prepared.presentation).success).toBe(true);
      expect(prepared.presentation.action).toBe(action);
      expect(prepared.presentation.operation).toEqual(MP03_PROFILE[action].operation);
      expect(prepared.presentation.resource).toEqual(
        fixture.request.intent && (fixture.request.intent as ActionIntentV1).resource,
      );
      expect(prepared.presentation.parameters).toEqual(
        (fixture.request.intent as ActionIntentV1).parameters,
      );
      expect(prepared.presentation.target).toEqual(
        (fixture.request.intent as ActionIntentV1).target,
      );
      expect(prepared.presentation.presentationVersion).toBe(MP05_PRESENTATION_VERSION);
      expect(prepared.presentation.admissionNativeActionHash).toBe(
        fixture.request.waitingAdmission &&
          (
            fixture.request.waitingAdmission as Extract<
              MoiraeAdmissionResultV1,
              { status: "WAITING_FOR_APPROVAL" }
            >
          ).nativeActionHash,
      );
      expect(prepared.presentation.nativeActionHash).toBe(fixture.state.actionHash);
      expect(prepared.presentation.nativePresentationBindingHash).toBe(
        fixture.state.presentationBindingHash,
      );
      const derivationInput = vi.mocked(fixture.native.deriveApprovalHashes).mock.calls[0]?.[0];
      expect(derivationInput).toBeDefined();
      expect(derivationInput).not.toHaveProperty("actionHash");
      expect(derivationInput).not.toHaveProperty("presentationBindingHash");
      expect(fixture.native.decideApproval).not.toHaveBeenCalled();
      expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    },
  );

  it("rejects browser authority fields before native decision", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: {
        ...envelope(prepared, "APPROVE"),
        operatorId: "browser-admin",
        decisionId: "11111111-1111-4111-8111-111111111111",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      trustedDecision: { operator: OPERATOR_A },
    });
    expect(result.approval.status).toBe("BOUNDARY_FAILURE");
    expect(fixture.native.decideApproval).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("uses native APPROVE, fresh MP-03 admission, and existing MP-04", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });
    expect(result.approval).toMatchObject({
      status: "APPROVED",
      nativeOutcome: "applied",
      decisionId: "11111111-1111-4111-8111-111111111111",
      approvalState: "approved",
    });
    expect(result.execution?.status).toBe("CONFIRMED");
    expect(fixture.admit).toHaveBeenCalledTimes(1);
    expect(fixture.admit.mock.calls[0]?.[0]).toMatchObject({ approvalId: fixture.state.id });
    expect(fixture.execution.executeAdmittedAction).toHaveBeenCalledTimes(1);
    expect(fixture.effect.calls).toBe(1);
  });

  it("keeps REJECT terminal and never enters MP-04", async () => {
    const fixture = harness("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "REJECT"),
      trustedDecision: { operator: OPERATOR_A },
    });
    expect(result.approval).toMatchObject({ status: "REJECTED", nativeOutcome: "applied" });
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("preserves one stable decision identity across approve response-loss replay", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    const first = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });
    const replay = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });
    expect(first.approval.decisionId).toBe(replay.approval.decisionId);
    expect(replay.approval.nativeOutcome).toBe("idempotent");
    expect(fixture.state.approvedBy).toBe(OPERATOR_A.operatorId);
    expect(fixture.state.approvedBySessionId).toBe(OPERATOR_A.sessionId);
    expect(fixture.execution.executeAdmittedAction).toHaveBeenCalledTimes(2);
    expect(fixture.effect.calls).toBe(1);
  });

  it("preserves the original decision maker on different-operator replay", async () => {
    const fixture = harness("RESCHEDULE_APPOINTMENT");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });
    const replay = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_B },
    });
    expect(replay.approval.nativeOutcome).toBe("idempotent");
    expect(replay.approval.decisionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(fixture.state.approvedBy).toBe(OPERATOR_A.operatorId);
    expect(fixture.state.approvedBySessionId).toBe(OPERATOR_A.sessionId);
  });

  it.each([
    ["APPROVE", "REJECT"],
    ["REJECT", "APPROVE"],
  ] as const)(
    "preserves native conflict for %s followed by %s",
    async (firstDecision, secondDecision) => {
      const fixture = harness("SEND_APPOINTMENT_DETAILS");
      const prepared = await fixture.coordinator.prepareApproval(fixture.request);
      await fixture.coordinator.submitDecision({
        request: fixture.request,
        envelope: envelope(prepared, firstDecision),
        trustedDecision: { operator: OPERATOR_A },
      });
      const conflict = await fixture.coordinator.submitDecision({
        request: fixture.request,
        envelope: envelope(prepared, secondDecision),
        trustedDecision: { operator: OPERATOR_B },
      });
      expect(conflict.approval.status).toBe("CONFLICT");
      expect(conflict.approval.nativeOutcome).toBe("conflict");
      expect(fixture.effect.calls).toBe(firstDecision === "APPROVE" ? 1 : 0);
    },
  );

  it("rejects a changed effect parameter through regenerated presentation", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    const changed = {
      ...fixture.request,
      intent: {
        ...(fixture.request.intent as ActionIntentV1),
        parameters: {
          ...(fixture.request.intent as ActionIntentV1).parameters,
          recipientAddress: "attacker@example.test",
        },
      },
    };
    const result = await fixture.coordinator.submitDecision({
      request: changed,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });
    expect(["STALE", "BOUNDARY_FAILURE"]).toContain(result.approval.status);
    expect(fixture.native.decideApproval).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it.each([
    ["an arbitrary syntactically valid hash", "f".repeat(64)],
    ["another fixture's valid native hash", NATIVE_APPROVAL_HASH_FIXTURES.RESCHEDULE_APPOINTMENT],
  ] as const)("rejects %s before presenting", async (_label, actionHash) => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    fixture.state.actionHash = actionHash;

    await expect(fixture.coordinator.prepareApproval(fixture.request)).rejects.toMatchObject({
      code: "NATIVE_APPROVAL_INVALID",
    });
    expect(fixture.native.decideApproval).not.toHaveBeenCalled();
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("rejects a native presentation binding mutation before presenting", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    fixture.state.presentationBindingHash = "b".repeat(64);

    await expect(fixture.coordinator.prepareApproval(fixture.request)).rejects.toMatchObject({
      code: "NATIVE_APPROVAL_INVALID",
    });
    expect(fixture.native.decideApproval).not.toHaveBeenCalled();
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("rejects coupled forged action and presentation hashes", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    fixture.state.actionHash = "f".repeat(64);
    fixture.state.presentationBindingHash = "c".repeat(64);

    await expect(fixture.coordinator.prepareApproval(fixture.request)).rejects.toMatchObject({
      code: "NATIVE_APPROVAL_INVALID",
    });
    expect(fixture.native.decideApproval).not.toHaveBeenCalled();
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("rejects an MP-03 admission hash mutation separately from native approval hashes", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const waiting = fixture.request.waitingAdmission as Extract<
      MoiraeAdmissionResultV1,
      { status: "WAITING_FOR_APPROVAL" }
    >;
    waiting.nativeActionHash = MP03_NATIVE_HASH_FIXTURES.RESCHEDULE_APPOINTMENT;

    await expect(fixture.coordinator.prepareApproval(fixture.request)).rejects.toMatchObject({
      code: "NATIVE_APPROVAL_INVALID",
    });
    expect(fixture.native.decideApproval).not.toHaveBeenCalled();
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("rejects a native action-hash mutation during decision-time revalidation", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    fixture.state.actionHash = "f".repeat(64);

    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });

    expect(["STALE", "BOUNDARY_FAILURE"]).toContain(result.approval.status);
    expect(fixture.native.decideApproval).not.toHaveBeenCalled();
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("rejects a forged native action hash during approved recovery", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    fixture.state.status = "approved";
    fixture.state.decisionId = "33333333-3333-4333-8333-333333333333";
    fixture.state.approvedBy = OPERATOR_A.operatorId;
    fixture.state.approvedBySessionId = OPERATOR_A.sessionId;
    fixture.state.approvedAt = NOW;
    fixture.state.bindingHash = "b".repeat(64);
    fixture.state.actionHash = "f".repeat(64);
    const restarted = createMp05HumanApprovalCoordinator({
      approval: fixture.native,
      admission: { admitActionIntent: fixture.admit },
      execution: fixture.execution,
      trustedTime: { now: () => fixture.clock.value },
      provenance: MP05_FATES_DEPENDENCY_PROVENANCE,
    });

    await expect(
      restarted.recoverOrRefresh({
        intent: fixture.request.intent,
        authenticatedContext: fixture.request.authenticatedContext,
        approvalId: fixture.state.id,
      }),
    ).rejects.toMatchObject({ code: "NATIVE_APPROVAL_INVALID" });
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("rejects the MP-05F approved recovery semantic rebinding exploit", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const changedArguments = {
      ...fixture.state.arguments,
      recipientAddress: "attacker@example.test",
    };
    fixture.state.arguments = changedArguments;
    fixture.state.status = "approved";
    fixture.state.decisionId = "44444444-4444-4444-8444-444444444444";
    fixture.state.approvedBy = OPERATOR_A.operatorId;
    fixture.state.approvedBySessionId = OPERATOR_A.sessionId;
    fixture.state.approvedAt = NOW;
    fixture.state.bindingHash = "b".repeat(64);
    const derive = vi.mocked(fixture.native.deriveApprovalHashes);
    derive.mockImplementation(async (material) => deriveSelfConsistentNativeHashes(material));
    const material = {
      approvalId: fixture.state.id,
      serverName: fixture.state.serverName,
      toolName: fixture.state.toolName,
      toolVersion: fixture.state.toolVersion,
      arguments: fixture.state.arguments,
      executionContext: fixture.state.executionContext,
      expiresAt: fixture.state.expiresAt,
      bindRequestIdentity: fixture.state.bindRequestIdentity,
      presentationVersion: fixture.state.presentationVersion,
    };
    Object.assign(fixture.state, deriveSelfConsistentNativeHashes(material));

    await expect(
      fixture.coordinator.recoverOrRefresh({
        intent: fixture.request.intent,
        authenticatedContext: fixture.request.authenticatedContext,
        approvalId: fixture.state.id,
      }),
    ).rejects.toMatchObject({
      code: "NATIVE_APPROVAL_INVALID",
      message: "Native approval is not exactly bound to the MP-03 ActionIntent and context.",
    });
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it.each(RECOVERY_SEMANTIC_MUTATIONS)(
    "rejects approved recovery with a self-consistent %s mutation for %s",
    async ({ action, field, mutate }) => {
      const fixture = harness(action);
      forgeSelfConsistentApprovedRecoveryRecord(fixture, {
        arguments: mutate(structuredClone(fixture.state.arguments)),
      });

      expect(fixture.state.arguments).toHaveProperty(field);
      await expectRecoveryInvalid(fixture);
      expect(fixture.admit).not.toHaveBeenCalled();
      expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
      expect(fixture.effect.calls).toBe(0);
    },
  );

  it.each(RECOVERY_CONTEXT_MUTATIONS)(
    "rejects approved recovery with a self-consistent %s mutation",
    async ({ field, mutate }) => {
      const fixture = harness("SEND_APPOINTMENT_DETAILS");
      forgeSelfConsistentApprovedRecoveryRecord(fixture, {
        executionContext: mutate(structuredClone(fixture.state.executionContext)),
      });

      expect(field).toEqual(expect.any(String));
      await expectRecoveryInvalid(fixture);
      expect(fixture.admit).not.toHaveBeenCalled();
      expect(fixture.effect.calls).toBe(0);
    },
  );

  it.each([
    ["server", { serverName: "untrusted-server" }],
    ["tool", { toolName: "untrusted-tool" }],
    ["version", { toolVersion: "9.9.9" }],
  ] as const)(
    "rejects approved recovery with a self-consistent operation %s mutation",
    async (_field, change) => {
      const fixture = harness("SEND_APPOINTMENT_DETAILS");
      forgeSelfConsistentApprovedRecoveryRecord(fixture, change);

      await expectRecoveryInvalid(fixture);
      expect(fixture.admit).not.toHaveBeenCalled();
      expect(fixture.effect.calls).toBe(0);
    },
  );

  it.each([
    ["SEND_APPOINTMENT_DETAILS", "RESCHEDULE_APPOINTMENT"],
    ["TRANSMIT_CUSTOMER_CONTACT_DIRECTORY", "SEND_APPOINTMENT_DETAILS"],
  ] as const)(
    "rejects cross-action recovery substitution from %s to %s",
    async (approvedAction, recoveryAction) => {
      const fixture = harness(approvedAction);
      forgeSelfConsistentApprovedRecoveryRecord(fixture);

      await expect(
        fixture.coordinator.recoverOrRefresh({
          intent: compileFixture(recoveryAction),
          authenticatedContext: contextFor(recoveryAction),
          approvalId: fixture.state.id,
        }),
      ).rejects.toMatchObject({
        code: "NATIVE_APPROVAL_INVALID",
        message: "Native approval is not exactly bound to the MP-03 ActionIntent and context.",
      });
      expect(fixture.admit).not.toHaveBeenCalled();
      expect(fixture.effect.calls).toBe(0);
    },
  );

  it("rejects coupled semantic corruption after native hashes are recomputed", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    forgeSelfConsistentApprovedRecoveryRecord(fixture, {
      arguments: {
        ...fixture.state.arguments,
        bookingId: "BOOKING-ATTACKER",
        recipientAddress: "attacker@example.test",
      },
    });

    await expectRecoveryInvalid(fixture);
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("keeps presentation binding independent from semantic binding during recovery", async () => {
    const wrongPresentation = harness("SEND_APPOINTMENT_DETAILS");
    forgeSelfConsistentApprovedRecoveryRecord(wrongPresentation, {
      presentationBindingHash: "0".repeat(64),
    });
    await expect(
      wrongPresentation.coordinator.recoverOrRefresh({
        intent: wrongPresentation.request.intent,
        authenticatedContext: wrongPresentation.request.authenticatedContext,
        approvalId: wrongPresentation.state.id,
      }),
    ).rejects.toMatchObject({
      code: "NATIVE_APPROVAL_INVALID",
      message:
        "Native approval presentation binding does not verify against Ananke-derived material.",
    });
    expect(wrongPresentation.admit).not.toHaveBeenCalled();
    expect(wrongPresentation.effect.calls).toBe(0);

    const wrongSemantic = harness("SEND_APPOINTMENT_DETAILS");
    forgeSelfConsistentApprovedRecoveryRecord(wrongSemantic, {
      arguments: {
        ...wrongSemantic.state.arguments,
        recipientAddress: "attacker@example.test",
      },
    });
    await expectRecoveryInvalid(wrongSemantic);
    expect(wrongSemantic.admit).not.toHaveBeenCalled();
    expect(wrongSemantic.effect.calls).toBe(0);

    const bothWrong = harness("SEND_APPOINTMENT_DETAILS");
    forgeSelfConsistentApprovedRecoveryRecord(bothWrong, {
      arguments: {
        ...bothWrong.state.arguments,
        recipientAddress: "attacker@example.test",
      },
      presentationBindingHash: "0".repeat(64),
    });
    await expect(
      bothWrong.coordinator.recoverOrRefresh({
        intent: bothWrong.request.intent,
        authenticatedContext: bothWrong.request.authenticatedContext,
        approvalId: bothWrong.state.id,
      }),
    ).rejects.toMatchObject({ code: "NATIVE_APPROVAL_INVALID" });
    expect(bothWrong.admit).not.toHaveBeenCalled();
    expect(bothWrong.effect.calls).toBe(0);
  });

  it.each(["target", "principal"] as const)(
    "rejects a changed %s before native decision",
    async (field) => {
      const fixture = harness("SEND_APPOINTMENT_DETAILS");
      const prepared = await fixture.coordinator.prepareApproval(fixture.request);
      const originalIntent = fixture.request.intent as ActionIntentV1;
      const changedIntent =
        field === "target"
          ? {
              ...originalIntent,
              target: { ...originalIntent.target, address: "other@example.test" },
            }
          : {
              ...originalIntent,
              principal: { agentPrincipalId: "untrusted-agent" },
            };
      const result = await fixture.coordinator.submitDecision({
        request: { ...fixture.request, intent: changedIntent },
        envelope: envelope(prepared, "APPROVE"),
        trustedDecision: { operator: OPERATOR_A },
      });
      expect(["STALE", "BOUNDARY_FAILURE"]).toContain(result.approval.status);
      expect(fixture.native.decideApproval).not.toHaveBeenCalled();
      expect(fixture.effect.calls).toBe(0);
    },
  );

  it("recovers an approved request from native state after coordinator restart", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });
    const restarted = createMp05HumanApprovalCoordinator({
      approval: fixture.native,
      admission: { admitActionIntent: fixture.admit },
      execution: fixture.execution,
      trustedTime: { now: () => fixture.clock.value },
      provenance: MP05_FATES_DEPENDENCY_PROVENANCE,
    });
    const recovered = await restarted.recoverOrRefresh({
      intent: fixture.request.intent,
      authenticatedContext: fixture.request.authenticatedContext,
      approvalId: fixture.state.id,
    });
    expect(recovered.kind).toBe("WORKFLOW");
    if (recovered.kind === "WORKFLOW") {
      expect(recovered.result.approval.nativeOutcome).toBe("idempotent");
      expect(recovered.result.approval.decisionId).toBe("11111111-1111-4111-8111-111111111111");
    }
  });

  it("requires a stable decisionId before approved recovery", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    forgeSelfConsistentApprovedRecoveryRecord(fixture);
    delete fixture.state.decisionId;

    await expect(
      fixture.coordinator.recoverOrRefresh({
        intent: fixture.request.intent,
        authenticatedContext: fixture.request.authenticatedContext,
        approvalId: fixture.state.id,
      }),
    ).rejects.toMatchObject({
      code: "NATIVE_APPROVAL_INVALID",
      message: "A terminal native decision must expose its stable decision identity.",
    });
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("preserves the durable decisionId supplied by native recovery truth", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    forgeSelfConsistentApprovedRecoveryRecord(fixture, {
      decisionId: "22222222-2222-4222-8222-222222222222",
    });
    const recovered = await fixture.coordinator.recoverOrRefresh({
      intent: fixture.request.intent,
      authenticatedContext: fixture.request.authenticatedContext,
      approvalId: fixture.state.id,
    });

    expect(recovered.kind).toBe("WORKFLOW");
    if (recovered.kind === "WORKFLOW") {
      expect(recovered.result.approval.decisionId).toBe("22222222-2222-4222-8222-222222222222");
      expect(recovered.result.execution?.status).toBe("CONFIRMED");
    }
    expect(fixture.effect.calls).toBe(1);
  });

  it.each([
    ["expired", "EXPIRED"],
    ["revoked", "STALE"],
    ["consumed", "STALE"],
  ] as const)("does not execute a %s recovered approval", async (nativeStatus, status) => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    forgeSelfConsistentApprovedRecoveryRecord(fixture);
    fixture.state.status = nativeStatus;

    const recovered = await fixture.coordinator.recoverOrRefresh({
      intent: fixture.request.intent,
      authenticatedContext: fixture.request.authenticatedContext,
      approvalId: fixture.state.id,
    });

    expect(recovered.kind).toBe("WORKFLOW");
    if (recovered.kind === "WORKFLOW") expect(recovered.result.approval.status).toBe(status);
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("fails closed for missing, malformed, and unreadable recovery records", async () => {
    const missing = harness("SEND_APPOINTMENT_DETAILS");
    await expect(
      missing.coordinator.recoverOrRefresh({
        intent: missing.request.intent,
        authenticatedContext: missing.request.authenticatedContext,
        approvalId: "missing-approval",
      }),
    ).rejects.toMatchObject({ code: "STALE_PRESENTATION" });
    expect(missing.effect.calls).toBe(0);

    const malformed = harness("SEND_APPOINTMENT_DETAILS");
    malformed.state.status = "approved";
    malformed.state.decisionId = "11111111-1111-4111-8111-111111111111";
    malformed.state.actionHash = "f".repeat(64);
    await expect(
      malformed.coordinator.recoverOrRefresh({
        intent: malformed.request.intent,
        authenticatedContext: malformed.request.authenticatedContext,
        approvalId: malformed.state.id,
      }),
    ).rejects.toMatchObject({ code: "NATIVE_APPROVAL_INVALID" });
    expect(malformed.admit).not.toHaveBeenCalled();
    expect(malformed.effect.calls).toBe(0);

    const unreadable = harness("SEND_APPOINTMENT_DETAILS");
    vi.mocked(unreadable.native.getApproval).mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    await expect(
      unreadable.coordinator.recoverOrRefresh({
        intent: unreadable.request.intent,
        authenticatedContext: unreadable.request.authenticatedContext,
        approvalId: unreadable.state.id,
      }),
    ).rejects.toMatchObject({ code: "NATIVE_APPROVAL_INVALID" });
    expect(unreadable.admit).not.toHaveBeenCalled();
    expect(unreadable.effect.calls).toBe(0);
  });

  it("requires fresh MP-03 admission after semantic recovery validation", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    forgeSelfConsistentApprovedRecoveryRecord(fixture);
    const waiting = fixture.request.waitingAdmission as Extract<
      MoiraeAdmissionResultV1,
      { status: "WAITING_FOR_APPROVAL" }
    >;
    vi.mocked(fixture.admit).mockResolvedValueOnce(waiting);

    const recovered = await fixture.coordinator.recoverOrRefresh({
      intent: fixture.request.intent,
      authenticatedContext: fixture.request.authenticatedContext,
      approvalId: fixture.state.id,
    });

    expect(recovered.kind).toBe("WORKFLOW");
    if (recovered.kind === "WORKFLOW") {
      expect(recovered.result.execution?.status).toBe("BOUNDARY_FAILURE");
      expect(recovered.result.execution?.reason).toBe("admission_not_executable");
    }
    expect(fixture.admit).toHaveBeenCalledTimes(1);
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it.each(Object.keys(MP03_PROFILE) as Action[])(
    "preserves valid approved recovery for %s after response loss",
    async (action) => {
      const fixture = harness(action);
      const prepared = await fixture.coordinator.prepareApproval(fixture.request);
      const submitted = await fixture.coordinator.submitDecision({
        request: fixture.request,
        envelope: envelope(prepared, "APPROVE"),
        trustedDecision: { operator: OPERATOR_A },
      });
      const restarted = createMp05HumanApprovalCoordinator({
        approval: fixture.native,
        admission: { admitActionIntent: fixture.admit },
        execution: fixture.execution,
        trustedTime: { now: () => fixture.clock.value },
        provenance: MP05_FATES_DEPENDENCY_PROVENANCE,
      });
      const recovered = await restarted.recoverOrRefresh({
        intent: fixture.request.intent,
        authenticatedContext: fixture.request.authenticatedContext,
        approvalId: fixture.state.id,
      });

      expect(submitted.approval.decisionId).toBe(fixture.state.decisionId);
      expect(recovered.kind).toBe("WORKFLOW");
      if (recovered.kind === "WORKFLOW") {
        expect(recovered.result.approval.decisionId).toBe(submitted.approval.decisionId);
        expect(recovered.result.execution?.status).toBe("CONFIRMED");
      }
      expect(fixture.native.decideApproval).toHaveBeenCalledTimes(1);
      expect(fixture.effect.calls).toBe(1);
    },
  );

  it("does not present an approval that is already expired", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS", "2026-09-03T11:59:00.000Z");
    await expect(fixture.coordinator.prepareApproval(fixture.request)).rejects.toMatchObject({
      code: "NATIVE_APPROVAL_INVALID",
    });
    expect(fixture.native.decideApproval).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("re-reads terminal native truth before an old presentation can decide", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    fixture.state.status = "rejected";
    fixture.state.decisionId = "22222222-2222-4222-8222-222222222222";
    fixture.state.rejectedBy = OPERATOR_B.operatorId;
    fixture.state.rejectedBySessionId = OPERATOR_B.sessionId;
    fixture.state.rejectedAt = NOW;
    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });
    expect(result.approval.status).toBe("CONFLICT");
    expect(result.approval.decisionId).toBe(fixture.state.decisionId);
    expect(fixture.effect.calls).toBe(0);
  });

  it("runs the offline MP-01 proposal through MP-02 and presents approval without inference authority", async () => {
    const agent = createAdministrativeAgentWithModelFactory({
      provider: { kind: "mock", modelId: "mock/synthetic" },
      modelFactory: () =>
        new SyntheticStructuredOutputModel(() => proposalFor("SEND_APPOINTMENT_DETAILS")),
    });
    const proposal = await invokeAdministrativeAgent(agent, "Send the appointment details", {
      requestId: "REQUEST-MP02-DETAILS-001",
      timeoutMs: 5_000,
    });
    const compiled = compileAgentProposal({
      proposal: proposal.proposal,
      context: compilerContext(),
    });
    expect(compiled.status).toBe("COMPILED");
    if (compiled.status !== "COMPILED") return;
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const request = { ...fixture.request, intent: compiled.actionIntent };
    const prepared = await fixture.coordinator.prepareApproval(request);
    expect(prepared.presentation.action).toBe("SEND_APPOINTMENT_DETAILS");
    expect(prepared.presentation.presentationDigest).not.toBe(
      actionIntentDigest(compiled.actionIntent),
    );
    expect(fixture.effect.calls).toBe(0);
  });

  it("completes the offline MP-01 to MP-05 approval and MP-04 pipeline", async () => {
    const action: Action = "SEND_APPOINTMENT_DETAILS";
    const agent = createAdministrativeAgentWithModelFactory({
      provider: { kind: "mock", modelId: "mock/synthetic" },
      modelFactory: () => new SyntheticStructuredOutputModel(() => proposalFor(action)),
    });
    const proposal = await invokeAdministrativeAgent(agent, "Send the appointment details", {
      requestId: "REQUEST-MP02-DETAILS-001",
      timeoutMs: 5_000,
    });
    const compiled = compileAgentProposal({
      proposal: proposal.proposal,
      context: compilerContext(),
    });
    expect(compiled.status).toBe("COMPILED");
    if (compiled.status !== "COMPILED") return;

    const fixture = harness(action);
    const initialAdmission = await fixture.admit({
      intent: compiled.actionIntent,
      authenticatedContext: contextFor(action),
      now: NOW,
    });
    expect(initialAdmission.status).toBe("WAITING_FOR_APPROVAL");
    const request = {
      ...fixture.request,
      intent: compiled.actionIntent,
      waitingAdmission: initialAdmission,
    };
    const prepared = await fixture.coordinator.prepareApproval(request);
    const result = await fixture.coordinator.submitDecision({
      request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });

    expect(result.approval).toMatchObject({
      status: "APPROVED",
      nativeOutcome: "applied",
      decisionId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.execution?.status).toBe("CONFIRMED");
    expect(fixture.admit).toHaveBeenCalledTimes(2);
    expect(fixture.execution.executeAdmittedAction).toHaveBeenCalledTimes(1);
    expect(fixture.effect.calls).toBe(1);
  });

  it("ignores a forged decision-returned grant and uses verified durable truth", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    vi.mocked(fixture.native.decideApproval).mockImplementationOnce(async (input) => {
      markApproved(fixture, input);
      return {
        outcome: "applied",
        decisionId: fixture.state.decisionId,
        grant: {
          ...structuredClone(fixture.state),
          actionHash: "f".repeat(64),
          arguments: { forged: true },
        },
      };
    });

    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });

    expect(result.approval.status).toBe("APPROVED");
    expect(result.execution?.status).toBe("CONFIRMED");
    expect(fixture.native.deriveApprovalHashes).toHaveBeenCalledTimes(3);
    expect(fixture.effect.calls).toBe(1);
  });

  it("uses a fresh trusted time for the post-decision durable read", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const readTimes: string[] = [];
    vi.mocked(fixture.native.getApproval).mockImplementation(async (_id, now) => {
      readTimes.push(now);
      return structuredClone(fixture.state);
    });
    vi.mocked(fixture.native.decideApproval).mockImplementationOnce(async (input) => {
      markApproved(fixture, input);
      fixture.clock.value = "2026-09-03T12:02:00.000Z";
      return {
        outcome: "applied",
        decisionId: fixture.state.decisionId,
        grant: structuredClone(fixture.state),
      };
    });
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });

    expect(readTimes).toEqual([NOW, NOW, "2026-09-03T12:02:00.000Z"]);
  });

  it("rejects a forged durable record after an applied decision", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const getApproval = vi.mocked(fixture.native.getApproval);
    getApproval
      .mockImplementationOnce(async () => structuredClone(fixture.state))
      .mockImplementationOnce(async () => structuredClone(fixture.state))
      .mockImplementationOnce(async () => ({
        ...structuredClone(fixture.state),
        status: "approved",
        actionHash: "f".repeat(64),
      }));
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });

    expect(result.approval.status).toBe("BOUNDARY_FAILURE");
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("does not fall back to an embedded grant when the post-decision record is missing", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const getApproval = vi.mocked(fixture.native.getApproval);
    getApproval
      .mockImplementationOnce(async () => structuredClone(fixture.state))
      .mockImplementationOnce(async () => structuredClone(fixture.state))
      .mockImplementationOnce(async () => undefined);
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });

    expect(["STALE", "BOUNDARY_FAILURE"]).toContain(result.approval.status);
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("does not fall back to an embedded grant when the post-decision read fails", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const getApproval = vi.mocked(fixture.native.getApproval);
    getApproval
      .mockImplementationOnce(async () => structuredClone(fixture.state))
      .mockImplementationOnce(async () => structuredClone(fixture.state))
      .mockImplementationOnce(async () => {
        throw new Error("approval store unavailable");
      });
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });

    expect(result.approval.status).toBe("BOUNDARY_FAILURE");
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("rejects a decision identity mismatch against durable truth", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    vi.mocked(fixture.native.decideApproval).mockImplementationOnce(async (input) => {
      markApproved(fixture, input);
      return {
        outcome: "applied",
        decisionId: "22222222-2222-4222-8222-222222222222",
        grant: structuredClone(fixture.state),
      };
    });

    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });

    expect(result.approval.status).toBe("BOUNDARY_FAILURE");
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("lets durable revocation between decision and reread block continuation", async () => {
    const fixture = harness("SEND_APPOINTMENT_DETAILS");
    const getApproval = vi.mocked(fixture.native.getApproval);
    getApproval
      .mockImplementationOnce(async () => structuredClone(fixture.state))
      .mockImplementationOnce(async () => structuredClone(fixture.state))
      .mockImplementationOnce(async () => ({
        ...structuredClone(fixture.state),
        status: "revoked",
      }));
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "APPROVE"),
      trustedDecision: { operator: OPERATOR_A },
    });

    expect(result.approval.status).toBe("CONFLICT");
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });

  it("re-reads and verifies durable rejection instead of trusting an embedded grant", async () => {
    const fixture = harness("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY");
    const prepared = await fixture.coordinator.prepareApproval(fixture.request);
    vi.mocked(fixture.native.decideApproval).mockImplementationOnce(async (input) => {
      fixture.state.status = "rejected";
      fixture.state.decisionId = "11111111-1111-4111-8111-111111111111";
      fixture.state.rejectedBy = (input.operator as { operatorId: string }).operatorId;
      fixture.state.rejectedBySessionId = (input.operator as { sessionId: string }).sessionId;
      fixture.state.rejectedAt = input.now;
      fixture.state.revision += 1;
      return {
        outcome: "applied",
        decisionId: fixture.state.decisionId,
        grant: { ...structuredClone(fixture.state), actionHash: "f".repeat(64) },
      };
    });

    const result = await fixture.coordinator.submitDecision({
      request: fixture.request,
      envelope: envelope(prepared, "REJECT"),
      trustedDecision: { operator: OPERATOR_A },
    });

    expect(result.approval.status).toBe("REJECTED");
    expect(fixture.admit).not.toHaveBeenCalled();
    expect(fixture.execution.executeAdmittedAction).not.toHaveBeenCalled();
    expect(fixture.effect.calls).toBe(0);
  });
});

const realFatesRequired = process.env.MP05_REQUIRE_REAL_FATES === "1";
const realAnankeRoot = process.env.FATES_ANANKE_ROOT;
const realHoraeRoot = process.env.FATES_HORAE_ROOT;
if (realFatesRequired && (!realAnankeRoot || !realHoraeRoot)) {
  throw new Error(
    "MP05_REQUIRE_REAL_FATES=1 requires FATES_ANANKE_ROOT and FATES_HORAE_ROOT; refusing to skip native integration",
  );
}
const describeReal = realFatesRequired ? describe : describe.skip;

interface RealAnankeModule {
  Gateway: new (config: Record<string, unknown>) => RealGateway;
  registerMoiraeAdministrativeOperationProfile(gateway: RealGateway): void;
  MOIRAE_ADMINISTRATIVE_POLICY_CONFIG: unknown;
  FileDurableAuthorityStore: new (options: { filePath: string }) => unknown;
  hashArgumentsDigest(args: Record<string, unknown>): string;
  hashTargetDigest(scope: Record<string, unknown>): string;
  createEffectReceiptV1(input: Record<string, unknown>): unknown;
  providerIdempotencyKey(authority: unknown): string;
}

interface RealAnankeHashModule {
  hashApprovalAction(material: Record<string, unknown>): string;
  hashApprovalPresentationBinding(
    approvalId: string,
    actionHash: string,
    presentationVersion?: string,
  ): string;
}

interface RealApprovalStore {
  get(id: string, now?: string): unknown;
  decide(
    id: string,
    decision: "approve" | "reject",
    operator: unknown,
    now: string,
    binding: string,
  ): unknown;
  clear(): void;
}

interface RealGateway {
  admit(operation: unknown, args: unknown, options: Record<string, unknown>): Promise<unknown>;
  approvals: RealApprovalStore;
  policy: { loadConfig(config: unknown): void };
  authenticateOperator(header?: string): Promise<unknown>;
  createExecutionAuthority(
    operation: unknown,
    args: Record<string, unknown>,
    admission: unknown,
    options: Record<string, unknown>,
  ): unknown;
  executeClaimed(
    operation: unknown,
    args: Record<string, unknown>,
    authority: unknown,
    claim: unknown,
    options: Record<string, unknown>,
  ): Promise<unknown>;
  reconcileClaimed(
    operation: unknown,
    args: Record<string, unknown>,
    authority: unknown,
    claim: unknown,
    options: Record<string, unknown>,
  ): Promise<unknown>;
  registerClaimAwareEffectAdapter(toolName: string, adapter: unknown): void;
  close(): void;
}

describeReal("MP-05 required native FATES-008 integration", () => {
  it.each([
    "SEND_APPOINTMENT_DETAILS",
    "RESCHEDULE_APPOINTMENT",
    "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
  ] as Action[])(
    "runs native approval, fresh admission, and MP-04 for %s with a synthetic effect",
    async (action) => {
      const anankeRoot = realAnankeRoot!;
      const horaeRoot = realHoraeRoot!;
      expect(
        execFileSync("git", ["-C", anankeRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      ).toBe("b888d61adf180d33e2ae2e61d276cb9b0f13bd12");
      expect(
        execFileSync("git", ["-C", horaeRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      ).toBe("aa296b420fbcf578089ca66dc03f6d09d9b06f00");
      const anankeModule = (await import(
        pathToFileURL(join(anankeRoot, "packages/runtime-core/dist/index.js")).href
      )) as unknown as RealAnankeModule;
      const anankeHashModule = (await import(
        pathToFileURL(join(anankeRoot, "packages/authority-engine/dist/index.js")).href
      )) as unknown as RealAnankeHashModule;
      const horaeModule = (await import(
        pathToFileURL(join(horaeRoot, "packages/session-orchestrator/dist/index.js")).href
      )) as unknown as {
        FileFates007aExecutionStore: new (options: { filePath: string }) => {
          get(id: string): unknown;
        };
        Fates007aExecutionCoordinator: new (
          store: unknown,
          binding: unknown,
          now: () => string,
        ) => Mp04HoraePort;
        createFates007aClaimVerifier: (store: unknown, now: () => string) => unknown;
      };
      const directory = mkdtempSync(join(tmpdir(), "moirae-mp05-"));
      const counts = { execute: 0, reconcile: 0 };
      let gateway: RealGateway | undefined;
      try {
        const authorityStore = new anankeModule.FileDurableAuthorityStore({
          filePath: join(directory, "authority.json"),
        });
        const gatewayInstance = new anankeModule.Gateway({
          developmentMode: true,
          autoLoadPolicy: false,
          policyVersion: MP03_POLICY_VERSION,
          operatorAuth: {
            tokens: {
              "mp05-operator-token": {
                operatorId: "mp05-native-operator",
                sessionId: "mp05-native-session",
                roles: ["approver"],
              },
            },
          },
          durableApproval: {
            required: true,
            storePath: join(directory, "approval.sqlite"),
            requirePresentationBinding: true,
          },
          claimAwareExecution: {
            authorityStore,
            trustedTime: { now: () => NOW },
          },
        });
        gateway = gatewayInstance;
        gatewayInstance.approvals.clear();
        anankeModule.registerMoiraeAdministrativeOperationProfile(gatewayInstance);
        gatewayInstance.policy.loadConfig(anankeModule.MOIRAE_ADMINISTRATIVE_POLICY_CONFIG);
        const horaeStore = new horaeModule.FileFates007aExecutionStore({
          filePath: join(directory, "horae.json"),
        });
        const claimVerifier = horaeModule.createFates007aClaimVerifier(horaeStore, () => NOW);
        const adapter = {
          identity: ADAPTER_ID,
          async execute(input: Record<string, unknown>) {
            counts.execute += 1;
            const authority = input.authority as Record<string, unknown>;
            return {
              receipt: anankeModule.createEffectReceiptV1({
                durableExecutionId: authority.durableExecutionId,
                nativeActionHash: authority.nativeActionHash,
                operation: authority.operation,
                authorityInstanceDigest: authority.authorityInstanceDigest,
                effectAdapter: ADAPTER_ID,
                argumentsDigest: authority.argumentsDigest,
                targetDigest: authority.targetDigest,
                providerOperationId: `synthetic:${action}`,
                providerIdempotencyKey: anankeModule.providerIdempotencyKey(authority),
                result: "CONFIRMED",
                receiptProvenance: "synthetic:mp05",
                observedAt: NOW,
              }),
            };
          },
          async reconcile(input: Record<string, unknown>) {
            counts.reconcile += 1;
            const authority = input.authority as Record<string, unknown>;
            return {
              receipt: anankeModule.createEffectReceiptV1({
                durableExecutionId: authority.durableExecutionId,
                nativeActionHash: authority.nativeActionHash,
                operation: authority.operation,
                authorityInstanceDigest: authority.authorityInstanceDigest,
                effectAdapter: ADAPTER_ID,
                argumentsDigest: authority.argumentsDigest,
                targetDigest: authority.targetDigest,
                providerOperationId: `synthetic:${action}`,
                providerIdempotencyKey: anankeModule.providerIdempotencyKey(authority),
                result: "CONFIRMED",
                receiptProvenance: "synthetic:mp05-reconcile",
                observedAt: NOW,
              }),
            };
          },
        };
        for (const candidate of Object.values(MP03_PROFILE)) {
          gatewayInstance.registerClaimAwareEffectAdapter(candidate.operation.toolName, adapter);
        }
        const binding = {
          executeClaimed: (input: Record<string, unknown>) =>
            gatewayInstance.executeClaimed(
              (input.authority as Record<string, unknown>).operation,
              input.args as Record<string, unknown>,
              input.authority,
              input.claim,
              { now: input.now, claimVerifier },
            ),
          reconcileClaimed: (input: Record<string, unknown>) =>
            gatewayInstance.reconcileClaimed(
              (input.authority as Record<string, unknown>).operation,
              input.args as Record<string, unknown>,
              input.authority,
              input.claim,
              { now: input.now, claimVerifier },
            ),
        };
        const nativeHorae = new horaeModule.Fates007aExecutionCoordinator(
          horaeStore,
          binding,
          () => NOW,
        );
        const horae: Mp04HoraePort = {
          execute: nativeHorae.execute.bind(nativeHorae),
          recover: nativeHorae.recover.bind(nativeHorae),
          get: (id) => horaeStore.get(id),
        };
        const ananke: Mp04AnankePort = {
          createExecutionAuthority: (input) => {
            const approval = input.admission.approvalGrantId
              ? gatewayInstance.approvals.get(input.admission.approvalGrantId, input.now)
              : undefined;
            const grant = approval as Record<string, unknown> | undefined;
            return gatewayInstance.createExecutionAuthority(
              input.operation,
              input.args,
              {
                status: "ADMITTED",
                decision: "ALLOW",
                operation: input.operation,
                actionHash: input.admission.actionHash,
                ...(grant
                  ? {
                      approvalGrantId: grant.id,
                      approvalActionHash: grant.actionHash,
                      approvalExpiresAt: grant.expiresAt,
                    }
                  : {}),
              },
              {
                executionContext: input.executionContext,
                effectAdapter: input.effectAdapter,
                now: input.now,
              },
            );
          },
          hashArgumentsDigest: anankeModule.hashArgumentsDigest,
          hashTargetDigest: anankeModule.hashTargetDigest,
        };
        const intent = compileFixture(action);
        const context = contextFor(action);
        const admission = createMp03AdmissionAdapter(
          { admit: gatewayInstance.admit.bind(gatewayInstance) },
          MP03_DEPENDENCY_PROVENANCE,
        );
        const waiting = await admission.admitActionIntent({
          intent,
          authenticatedContext: context,
          now: NOW,
        });
        expect(waiting.status).toBe("WAITING_FOR_APPROVAL");
        if (waiting.status !== "WAITING_FOR_APPROVAL") return;
        const coordinator = createMp05HumanApprovalCoordinator({
          approval: {
            getApproval: (id, now) => {
              const grant = gatewayInstance.approvals.get(id, now);
              return grant;
            },
            deriveApprovalHashes: (material) => {
              const { approvalId, presentationVersion, ...actionMaterial } = material;
              const actionHash = anankeHashModule.hashApprovalAction(
                actionMaterial as unknown as Record<string, unknown>,
              );
              return {
                actionHash,
                ...(presentationVersion
                  ? {
                      presentationBindingHash: anankeHashModule.hashApprovalPresentationBinding(
                        approvalId,
                        actionHash,
                        presentationVersion,
                      ),
                    }
                  : {}),
              };
            },
            decideApproval: (input) =>
              gatewayInstance.approvals.decide(
                input.approvalId,
                input.decision,
                input.operator as never,
                input.now,
                input.presentationBindingHash,
              ),
          },
          admission,
          execution: createMp04ExecutionCoordinator({
            ananke,
            horae,
            effectAdapter: ADAPTER_ID,
            owner: `mp05-${action.toLowerCase()}`,
            provenance: MP04_DEPENDENCY_PROVENANCE,
            index: new InMemoryMp04ExecutionIndex(),
          }),
          trustedTime: { now: () => NOW },
          provenance: MP05_FATES_DEPENDENCY_PROVENANCE,
        });
        const request: Mp05ApprovalRequestV1 = {
          intent,
          authenticatedContext: context,
          waitingAdmission: waiting,
        };
        const prepared = await coordinator.prepareApproval(request);
        const nativeApproval = gatewayInstance.approvals.get(waiting.approvalId, NOW) as {
          actionHash: string;
          presentationBindingHash: string;
        };
        expect(prepared.presentation.nativeActionHash).toBe(nativeApproval.actionHash);
        expect(prepared.presentation.nativePresentationBindingHash).toBe(
          nativeApproval.presentationBindingHash,
        );
        expect(prepared.presentation.nativeActionHash).not.toBe(waiting.nativeActionHash);
        const operator = await gatewayInstance.authenticateOperator("Bearer mp05-operator-token");
        expect(operator).toBeDefined();
        const result = await coordinator.submitDecision({
          request,
          envelope: envelope(prepared, "APPROVE"),
          trustedDecision: { operator },
        });
        expect(result.approval.status).toBe("APPROVED");
        expect(result.approval.decisionId).toMatch(/^[0-9a-f-]{36}$/);
        expect(result.execution?.status).toBe("CONFIRMED");
        expect(counts.execute).toBe(1);
      } finally {
        gateway?.close();
        rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
      }
    },
  );
});

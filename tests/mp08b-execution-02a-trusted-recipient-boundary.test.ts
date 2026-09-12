import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createDemoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";
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
  createMp08bDurableApprovalRuntime,
  type Mp08bPreparedApprovalV1,
} from "../apps/host/src/approval-runtime.js";
import { prepareSesAppointmentDetailsRequest } from "../apps/host/src/ses-provider.js";
import type { Mp08bTrustedRecipientAuthorityConfig } from "../apps/host/src/fates-runtime.js";
import {
  compileAgentProposal,
  type ActionIntentV1,
} from "../packages/action-compiler/src/index.js";

const FATES_ROOT = process.env.FATES_ANANKE_ROOT ?? process.env.MP05_FATES_ANANKE_ROOT;
const describeReal = FATES_ROOT ? describe : describe.skip;
const TRUSTED_RECIPIENT = "trusted-demo@example.test";
const LEGACY_RECIPIENT = "alex@example.test";
const NOW = "2099-09-12T10:00:00.000Z";
const SOURCE_REQUEST_ID = "REQUEST-MP02-DETAILS-001";
const ADAPTER_ID: Mp04EffectAdapterIdentityV1 = {
  id: "synthetic.mp08b-execution-02a",
  version: "1",
};

function trustedPolicy(recipient?: string): Mp08bTrustedRecipientAuthorityConfig {
  return {
    moirae: recipient ? { appointmentDetailsRecipient: recipient } : {},
    fates: recipient ? { appointmentDetailsRecipient: recipient } : {},
  };
}

function intentFor(recipient: string): ActionIntentV1 {
  const result = compileAgentProposal({
    proposal: { ...primaryCompilerFixtures[0].proposal },
    context: {
      ...createDemoCompilerContext(SOURCE_REQUEST_ID),
      agentPrincipalId: MP03_ACTING_AGENT,
      recipients: [{ customerId: "CUSTOMER-001", address: recipient, verified: true }],
    },
  });
  if (result.status !== "COMPILED") throw new Error(`Fixture did not compile: ${result.status}`);
  return result.actionIntent;
}

function contextFor(): Mp03AuthenticatedContext {
  const profile = MP03_PROFILE.SEND_APPOINTMENT_DETAILS;
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
    resourceScope: profile.scope as Mp03AuthenticatedContext["resourceScope"],
    correlation: {
      requestId: SOURCE_REQUEST_ID,
      correlationId: MP03_CORRELATION_ID,
      causationId: MP03_CAUSATION_ID,
    },
    policyVersion: MP03_POLICY_VERSION,
    purpose: profile.purpose,
  };
}

function requestFor(recipient: string) {
  return {
    request: `Synthetic offline MP-04 request for ${recipient}`,
    compilerContext: {
      ...createDemoCompilerContext(SOURCE_REQUEST_ID),
      agentPrincipalId: MP03_ACTING_AGENT,
      recipients: [{ customerId: "CUSTOMER-001", address: recipient, verified: true }],
    },
    authenticatedContext: contextFor(),
    now: NOW,
  };
}

function approvalEnvelope(prepared: Mp08bPreparedApprovalV1) {
  return {
    schemaVersion: "human-decision-v1" as const,
    approvalId: prepared.preparation.presentation.approvalId,
    decision: "APPROVE" as const,
    presentationDigest: prepared.preparation.presentation.presentationDigest,
    nativePresentationBindingHash: prepared.preparation.presentation.nativePresentationBindingHash,
  };
}

function offlineHorae(): {
  horae: Mp04HoraePort;
  capture: { authority?: Record<string, unknown>; args?: Record<string, unknown> };
} {
  const capture: { authority?: Record<string, unknown>; args?: Record<string, unknown> } = {};
  const execute = vi.fn(
    async (input: { authority: unknown; args: Record<string, unknown>; owner: string }) => {
      const authority = input.authority as Record<string, unknown>;
      capture.authority = authority;
      capture.args = input.args;
      return {
        durableExecutionId: authority.durableExecutionId,
        authority,
        authorityInstanceDigest: authority.authorityInstanceDigest,
        nativeActionHash: authority.nativeActionHash,
        operation: authority.operation,
        argumentsDigest: authority.argumentsDigest,
        targetDigest: authority.targetDigest,
        effectAdapter: ADAPTER_ID,
        state: "terminal",
        history: [
          { state: "authority_validated", event: "offline authority validated" },
          { state: "execution_reserved", event: "offline execution reserved" },
          { state: "executor_invocation_started", event: "offline provider request captured" },
          { state: "terminal", event: "offline provider transport not invoked" },
        ],
        claim: {
          owner: input.owner,
          generation: 1,
          claimDigest: `sha256:${"1".repeat(64)}`,
        },
        receipt: { result: "CONFIRMED", checksum: `sha256:${"2".repeat(64)}` },
        result: "CONFIRMED",
        updatedAt: NOW,
      };
    },
  );
  return {
    capture,
    horae: {
      execute,
      recover: vi.fn(),
      get: vi.fn(),
    },
  };
}

async function prepareApproved(recipient: string) {
  const directory = mkdtempSync(join(tmpdir(), "moirae-mp08b-execution-02a-"));
  const runtime = await createMp08bDurableApprovalRuntime({
    fatesRoot: FATES_ROOT!,
    approvalStorePath: join(directory, "approval.sqlite"),
    bindingStorePath: join(directory, "bindings.json"),
    proposal: {
      boundary: "STRANDS_PROPOSAL",
      provider: "mock",
      modelId: "mock/mp08b-execution-02a",
      live: false,
      invoke: async () => ({
        proposal: { ...primaryCompilerFixtures[0].proposal },
        metadata: {
          sdk: "@strands-agents/sdk",
          sdkVersion: "1.16.0",
          provider: "mock",
          modelId: "mock/mp08b-execution-02a",
          requestId: SOURCE_REQUEST_ID,
          requestCount: 1,
          structuredOutput: true,
          stopReason: "end_turn",
          latencyMs: 0,
        },
      }),
    },
    trustedTime: { now: () => NOW },
    trustedRecipientPolicy: trustedPolicy(recipient),
  });
  const prepared = await runtime.prepareApproval(requestFor(recipient));
  const submitted = await runtime.submitDecision({
    approvalId: prepared.binding.approvalId,
    envelope: approvalEnvelope(prepared),
  });
  if (submitted.status !== "APPROVED") throw new Error("Synthetic approval was not recorded.");
  return {
    directory,
    runtime,
    prepared,
    approved: await runtime.admitApproved(prepared.binding.approvalId),
  };
}

describeReal("MP-08B EXECUTION-02A trusted exact recipient at MP-04", () => {
  it("executes only the exact configured recipient and captures the provider request offline", async () => {
    const fixture = await prepareApproved(TRUSTED_RECIPIENT);
    try {
      if (fixture.prepared.composition.status !== "COMPOSED")
        throw new Error("Synthetic fixture did not reach the composed boundary.");
      expect(fixture.prepared.composition.admission).toMatchObject({
        status: "WAITING_FOR_APPROVAL",
        nativeDecision: "REQUIRE_APPROVAL",
        executorInvoked: false,
        effectExecuted: false,
      });
      expect(fixture.prepared.preparation.presentation.target.address).toBe(TRUSTED_RECIPIENT);
      expect(fixture.prepared.preparation.presentation.parameters.recipientAddress).toBe(
        TRUSTED_RECIPIENT,
      );
      expect(fixture.approved.admission).toMatchObject({
        status: "ADMITTED",
        nativeDecision: "ALLOW",
        executorInvoked: false,
        effectExecuted: false,
      });

      const offline = offlineHorae();
      const coordinator = createMp04ExecutionCoordinator({
        ananke: fixture.runtime.getMp04AnankePort(),
        horae: offline.horae,
        effectAdapter: ADAPTER_ID,
        owner: "mp08b-execution-02a-offline",
        provenance: MP04_DEPENDENCY_PROVENANCE,
        trustedExecutionConfig: { appointmentDetailsRecipient: TRUSTED_RECIPIENT },
      });
      const result = await coordinator.executeAdmittedAction({
        intent: fixture.approved.binding.intent,
        admission: fixture.approved.admission,
        authenticatedContext: fixture.approved.binding.authenticatedContext,
        now: NOW,
      });

      expect(result.status).toBe("CONFIRMED");
      expect(offline.capture.args?.recipientAddress).toBe(TRUSTED_RECIPIENT);
      expect(offline.capture.authority?.nativeActionHash).toBe(
        fixture.approved.admission.nativeActionHash,
      );

      const preparedRequest = prepareSesAppointmentDetailsRequest({
        intent: fixture.approved.binding.intent,
        config: {
          region: "eu-west-2",
          fromEmailAddress: "sender@example.test",
          allowedRecipientAddress: TRUSTED_RECIPIENT,
          configurationSetName: "moirae-mp08b-offline",
        },
        identity: {
          logicalWorkId: "offline-work",
          actionIntentDigest: fixture.approved.binding.intent.canonicalDigest,
          actionIntentIdempotencyKey: fixture.approved.binding.intent.idempotencyKey,
          approvalId: fixture.approved.binding.approvalId,
          decisionId: fixture.approved.approval.decisionId!,
          claimGeneration: 1,
          executionId: result.durableExecutionId!,
          attemptId: "offline-attempt",
          correlationId: "offline-correlation",
        },
        approvedBinding: {
          approvalId: fixture.approved.binding.approvalId,
          decisionId: fixture.approved.approval.decisionId!,
          actionIntentDigest: fixture.approved.binding.intent.canonicalDigest,
        },
      });
      expect(preparedRequest.request.Destination?.ToAddresses).toEqual([TRUSTED_RECIPIENT]);
      expect(preparedRequest.expectedRecipient).toBe(TRUSTED_RECIPIENT);
      expect(preparedRequest.identity.decisionId).toBe(fixture.approved.approval.decisionId);
    } finally {
      fixture.runtime.close();
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it("preserves the legacy default when no trusted execution configuration is supplied", async () => {
    const fixture = await prepareApproved(LEGACY_RECIPIENT);
    try {
      const offline = offlineHorae();
      const coordinator = createMp04ExecutionCoordinator({
        ananke: fixture.runtime.getMp04AnankePort(),
        horae: offline.horae,
        effectAdapter: ADAPTER_ID,
        owner: "mp08b-execution-02a-legacy",
        provenance: MP04_DEPENDENCY_PROVENANCE,
      });
      const result = await coordinator.executeAdmittedAction({
        intent: fixture.approved.binding.intent,
        admission: fixture.approved.admission,
        authenticatedContext: fixture.approved.binding.authenticatedContext,
        now: NOW,
      });
      expect(result.status).toBe("CONFIRMED");
      expect(offline.capture.args?.recipientAddress).toBe(LEGACY_RECIPIENT);
    } finally {
      fixture.runtime.close();
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it.each([
    "other-demo@example.test",
    "trusted-demx@example.test",
    "trusted-demo+other@example.test",
    "same-domain@example.test",
    LEGACY_RECIPIENT,
  ])("fails closed before authority for configured recipient mismatch: %s", async (recipient) => {
    const fixture = await prepareApproved(TRUSTED_RECIPIENT);
    try {
      const offline = offlineHorae();
      const coordinator = createMp04ExecutionCoordinator({
        ananke: fixture.runtime.getMp04AnankePort(),
        horae: offline.horae,
        effectAdapter: ADAPTER_ID,
        owner: "mp08b-execution-02a-mismatch",
        provenance: MP04_DEPENDENCY_PROVENANCE,
        trustedExecutionConfig: { appointmentDetailsRecipient: TRUSTED_RECIPIENT },
      });
      const mismatch = await coordinator.executeAdmittedAction({
        intent: intentFor(recipient),
        admission: fixture.approved.admission,
        authenticatedContext: contextFor(),
        now: NOW,
        trustedExecutionConfig: { appointmentDetailsRecipient: recipient },
      });
      expect(mismatch).toMatchObject({
        status: "BOUNDARY_FAILURE",
        reason: "mp03_binding_mismatch",
      });
      expect(offline.capture.authority).toBeUndefined();
      expect(offline.capture.args).toBeUndefined();
    } finally {
      fixture.runtime.close();
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed trusted configuration at trusted construction and keeps policy out of input", async () => {
    const fakeAnanke: Mp04AnankePort = {
      createExecutionAuthority: vi.fn(),
      hashArgumentsDigest: () => `sha256:${"1".repeat(64)}`,
      hashTargetDigest: () => `sha256:${"2".repeat(64)}`,
    };
    const horae: Mp04HoraePort = { execute: vi.fn(), recover: vi.fn(), get: vi.fn() };
    for (const recipient of [
      "",
      " trusted-demo@example.test",
      "trusted-* @example.test",
      "trusted-demo@example.test other",
    ]) {
      expect(() =>
        createMp04ExecutionCoordinator({
          ananke: fakeAnanke,
          horae,
          effectAdapter: ADAPTER_ID,
          owner: "mp08b-execution-02a-config",
          provenance: MP04_DEPENDENCY_PROVENANCE,
          trustedExecutionConfig: { appointmentDetailsRecipient: recipient },
        }),
      ).toThrow(/exact email recipient/);
    }
    const unconfigured = createMp04ExecutionCoordinator({
      ananke: fakeAnanke,
      horae,
      effectAdapter: ADAPTER_ID,
      owner: "mp08b-execution-02a-input",
      provenance: MP04_DEPENDENCY_PROVENANCE,
    });
    const result = await unconfigured.executeAdmittedAction({
      intent: intentFor(TRUSTED_RECIPIENT),
      authenticatedContext: contextFor(),
      trustedExecutionConfig: { appointmentDetailsRecipient: TRUSTED_RECIPIENT },
    });
    expect(result).toMatchObject({ status: "BOUNDARY_FAILURE", reason: "mp03_binding_mismatch" });
    expect(fakeAnanke.createExecutionAuthority).not.toHaveBeenCalled();
    expect(horae.execute).not.toHaveBeenCalled();
  });

  it("keeps native action identity sensitive to recipient and does not alter other action policies", async () => {
    const fixture = await prepareApproved(TRUSTED_RECIPIENT);
    try {
      const ananke = fixture.runtime.getMp04AnankePort();
      const operation = MP03_PROFILE.SEND_APPOINTMENT_DETAILS.operation;
      const actionA = {
        bookingId: "BOOKING-001",
        recipientAddress: TRUSTED_RECIPIENT,
        templateId: "appointment-details-v1",
      };
      const actionB = { ...actionA, recipientAddress: "other-demo@example.test" };
      expect(ananke.hashNativeAction).toBeDefined();
      expect(ananke.hashNativeAction!(operation, actionA, contextFor())).not.toBe(
        ananke.hashNativeAction!(operation, actionB, contextFor()),
      );
      expect(MP03_PROFILE.RESCHEDULE_APPOINTMENT.operation.toolName).toBe(
        "moirae.administrative.reschedule_appointment",
      );
      expect(MP03_PROFILE.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY.operation.toolName).toBe(
        "moirae.administrative.transmit_customer_contact_directory",
      );
    } finally {
      fixture.runtime.close();
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });
});

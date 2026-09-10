import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
  type Mp03Action,
  type Mp03AuthenticatedContext,
} from "../packages/fates-adapter/src/index.js";
import {
  createDemoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";
import type { AgentProposalV1 } from "../packages/strands-agent/src/proposal.js";
import type {
  Mp08bCompositionRequestV1,
  Mp08bProposalSource,
} from "../apps/host/src/composition.js";
import {
  MP08B_FATES_008A_PROVENANCE,
  createMp08bDurableApprovalRuntime,
  verifyMp08bFates008aCheckout,
  type Mp08bPreparedApprovalV1,
} from "../apps/host/src/approval-runtime.js";

const FATES_ROOT = process.env.MP05_FATES_ANANKE_ROOT;
const describeReal = FATES_ROOT ? describe : describe.skip;
const NOW = "2026-09-03T12:00:00.000Z";
const SOURCE_REQUEST_ID = "REQUEST-MP02-DETAILS-001";

function proposalFor(action: Mp03Action): AgentProposalV1 {
  const proposal =
    primaryCompilerFixtures[
      action === "SEND_APPOINTMENT_DETAILS" ? 0 : action === "RESCHEDULE_APPOINTMENT" ? 1 : 2
    ].proposal;
  return action === "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"
    ? { ...proposal, recipientReference: "personal-address@example.test" }
    : proposal;
}

function compilerContextFor() {
  return {
    ...createDemoCompilerContext(SOURCE_REQUEST_ID),
    agentPrincipalId: MP03_ACTING_AGENT,
  };
}

function authenticatedContextFor(action: Mp03Action): Mp03AuthenticatedContext {
  const profile = MP03_PROFILE[action];
  return {
    authenticatedPrincipal: {
      id: MP03_AUTHENTICATED_WORKLOAD,
      kind: "service",
      tenantId: MP03_TENANT_ID,
    },
    actingPrincipal: {
      id: MP03_ACTING_AGENT,
      kind: "agent",
      tenantId: MP03_TENANT_ID,
    },
    representedPrincipal: {
      id: MP03_REQUESTER,
      kind: "human",
      tenantId: MP03_TENANT_ID,
    },
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

function proposalSource(action: Mp03Action): Mp08bProposalSource {
  return {
    boundary: "STRANDS_PROPOSAL",
    provider: "mock",
    modelId: "mock/approval-01-fixture",
    live: false,
    invoke: async () => ({
      proposal: proposalFor(action),
      metadata: {
        sdk: "@strands-agents/sdk",
        sdkVersion: "1.16.0",
        provider: "mock",
        modelId: "mock/approval-01-fixture",
        requestId: "MP08B-APPROVAL-01",
        requestCount: 1,
        structuredOutput: true,
        stopReason: "end_turn",
        latencyMs: 0,
      } as const,
    }),
  };
}

function requestFor(action: Mp03Action): Mp08bCompositionRequestV1 {
  return {
    request: `Offline Approval-01 fixture for ${action}; no model call is allowed.`,
    compilerContext: compilerContextFor(),
    authenticatedContext: authenticatedContextFor(action),
    now: NOW,
  };
}

function envelope(prepared: Mp08bPreparedApprovalV1, decision: "APPROVE" | "REJECT") {
  return {
    schemaVersion: "human-decision-v1" as const,
    approvalId: prepared.preparation.presentation.approvalId,
    decision,
    presentationDigest: prepared.preparation.presentation.presentationDigest,
    nativePresentationBindingHash: prepared.preparation.presentation.nativePresentationBindingHash,
  };
}

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "moirae-mp08b-approval-01-"));
  return {
    directory,
    approvalStorePath: join(directory, "approval.sqlite"),
    bindingStorePath: join(directory, "approval-bindings.json"),
  };
}

async function runtimeFor(action: Mp03Action, values: ReturnType<typeof paths>) {
  return createMp08bDurableApprovalRuntime({
    fatesRoot: FATES_ROOT!,
    approvalStorePath: values.approvalStorePath,
    bindingStorePath: values.bindingStorePath,
    proposal: proposalSource(action),
    trustedTime: { now: () => NOW },
  });
}

describeReal("MP-08B APPROVAL-01 verified durable approval", () => {
  it("verifies the accepted FATES-008A materialization identity", () => {
    expect(verifyMp08bFates008aCheckout(FATES_ROOT!)).toMatchObject({
      repositoryUrl: MP08B_FATES_008A_PROVENANCE.repositoryUrl,
      tag: MP08B_FATES_008A_PROVENANCE.tag,
      tagObjectSha: MP08B_FATES_008A_PROVENANCE.tagObjectSha,
      commitSha: MP08B_FATES_008A_PROVENANCE.commitSha,
      treeSha: MP08B_FATES_008A_PROVENANCE.treeSha,
      runtimeSha: MP08B_FATES_008A_PROVENANCE.runtimeSha,
    });
  });

  it.each([
    "SEND_APPOINTMENT_DETAILS",
    "RESCHEDULE_APPOINTMENT",
    "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
  ] as Mp03Action[])("creates and durably binds a pending approval for %s", async (action) => {
    const values = paths();
    const runtime = await runtimeFor(action, values);
    try {
      const prepared = await runtime.prepareApproval(requestFor(action));
      expect(prepared.composition).toMatchObject({
        status: "COMPOSED",
        nextBoundary: "MP05_APPROVAL",
        admission: {
          status: "WAITING_FOR_APPROVAL",
          nativeDecision: "REQUIRE_APPROVAL",
          executorInvoked: false,
          effectExecuted: false,
        },
      });
      expect(prepared.preparation.presentation.action).toBe(action);
      expect(prepared.binding.approvalId).toBe(prepared.preparation.presentation.approvalId);
      expect(runtime.capabilities).toEqual({
        liveFates: true,
        liveStrands: false,
        durableApproval: true,
        hostedDurableQueue: false,
        externalEffects: false,
      });

      const secondRuntime = await runtimeFor(action, values);
      try {
        const recovered = await secondRuntime.refreshApproval(prepared.binding.approvalId);
        expect(recovered.presentation.presentationDigest).toBe(
          prepared.preparation.presentation.presentationDigest,
        );
        expect(recovered.presentation.nativePresentationBindingHash).toBe(
          prepared.preparation.presentation.nativePresentationBindingHash,
        );
      } finally {
        secondRuntime.close();
      }
    } finally {
      runtime.close();
      rmSync(values.directory, { recursive: true, force: true });
    }
  });

  it("applies APPROVE through MP-05 and stops before MP-04, then recovers the decision after restart", async () => {
    const values = paths();
    const runtime = await runtimeFor("SEND_APPOINTMENT_DETAILS", values);
    let prepared: Awaited<ReturnType<typeof runtime.prepareApproval>>;
    let firstDecisionId: string | undefined;
    try {
      prepared = await runtime.prepareApproval(requestFor("SEND_APPOINTMENT_DETAILS"));
      const result = await runtime.submitDecision({
        approvalId: prepared.binding.approvalId,
        envelope: envelope(prepared, "APPROVE"),
      });
      expect(result).toMatchObject({
        status: "APPROVED",
        approvalId: prepared.binding.approvalId,
        nativeOutcome: "applied",
        approvalState: "approved",
      });
      expect(result.decisionId).toMatch(/^[0-9a-f-]{36}$/);
      firstDecisionId = result.decisionId;
    } finally {
      runtime.close();
    }

    const restarted = await runtimeFor("SEND_APPOINTMENT_DETAILS", values);
    try {
      const replay = await restarted.submitDecision({
        approvalId: prepared!.binding.approvalId,
        envelope: envelope(prepared!, "APPROVE"),
      });
      expect(replay.status).toBe("APPROVED");
      expect(replay.nativeOutcome).toBe("idempotent");
      expect(replay.decisionId).toBe(firstDecisionId);
    } finally {
      restarted.close();
      rmSync(values.directory, { recursive: true, force: true });
    }
  });

  it("applies REJECT durably and never exposes an execution result", async () => {
    const values = paths();
    const runtime = await runtimeFor("RESCHEDULE_APPOINTMENT", values);
    try {
      const prepared = await runtime.prepareApproval(requestFor("RESCHEDULE_APPOINTMENT"));
      const result = await runtime.submitDecision({
        approvalId: prepared.binding.approvalId,
        envelope: envelope(prepared, "REJECT"),
      });
      expect(result).toMatchObject({
        status: "REJECTED",
        nativeOutcome: "applied",
        approvalState: "rejected",
      });
      expect(result).not.toHaveProperty("execution");
    } finally {
      runtime.close();
      rmSync(values.directory, { recursive: true, force: true });
    }
  });

  it("rejects browser authority fields, wrong bindings, and missing host bindings", async () => {
    const values = paths();
    const runtime = await runtimeFor("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY", values);
    try {
      const prepared = await runtime.prepareApproval(
        requestFor("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"),
      );
      const forged = await runtime.submitDecision({
        approvalId: prepared.binding.approvalId,
        envelope: {
          ...envelope(prepared, "APPROVE"),
          operator: { operatorId: "attacker", sessionId: "attacker" },
          approvalState: "approved",
        },
      });
      expect(forged.status).toBe("BOUNDARY_FAILURE");

      const wrongBinding = await runtime.submitDecision({
        approvalId: prepared.binding.approvalId,
        envelope: {
          ...envelope(prepared, "APPROVE"),
          presentationDigest: "f".repeat(64),
        },
      });
      expect(wrongBinding.status).toBe("STALE");

      const missing = await runtime.submitDecision({
        approvalId: "missing-approval",
        envelope: {
          schemaVersion: "human-decision-v1",
          approvalId: "missing-approval",
          decision: "APPROVE",
          presentationDigest: "0".repeat(64),
          nativePresentationBindingHash: "0".repeat(64),
        },
      });
      expect(missing.status).toBe("BOUNDARY_FAILURE");
    } finally {
      runtime.close();
      rmSync(values.directory, { recursive: true, force: true });
    }
  });
});

describe("MP-08B APPROVAL-01 fail-closed boundaries", () => {
  it("does not materialize a missing FATES-008A runtime or fall back to a test adapter", async () => {
    await expect(
      createMp08bDurableApprovalRuntime({
        fatesRoot: "D:\\does-not-exist\\fates-008a",
        approvalStorePath: "C:\\temp\\approval.sqlite",
        bindingStorePath: "C:\\temp\\approval-bindings.json",
        proposal: proposalSource("SEND_APPOINTMENT_DETAILS"),
        trustedTime: { now: () => NOW },
      }),
    ).rejects.toThrow(/does not exist/);
  });
});

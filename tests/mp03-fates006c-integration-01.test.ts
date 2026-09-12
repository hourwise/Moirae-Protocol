import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  type Mp03AuthenticatedContext,
} from "../packages/fates-adapter/src/index.js";
import {
  createDemoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";
import type { AgentProposalV1 } from "../packages/strands-agent/src/proposal.js";
import {
  createMp08bComposedRuntime,
  createMp08bVerifiedFatesDependency,
  type Mp08bCompositionRequestV1,
  type Mp08bProposalSource,
} from "../apps/host/src/composition.js";
import {
  MP08B_FATES_006C_PROVENANCE,
  MP08B_FATES_008A_CAPABILITY_PROVENANCE,
  createMp08bDurableApprovalRuntime,
  verifyMp08bFates006cCheckout,
  type Mp08bPreparedApprovalV1,
} from "../apps/host/src/approval-runtime.js";
import type { Mp08bTrustedRecipientAuthorityConfig } from "../apps/host/src/fates-runtime.js";

const FATES_ROOT = process.env.FATES_ANANKE_ROOT ?? process.env.MP05_FATES_ANANKE_ROOT;
const describeReal = FATES_ROOT ? describe : describe.skip;
const RECIPIENT_A = "trusted-demo@example.test";
const RECIPIENT_B = "other-demo@example.test";
const LEGACY_RECIPIENT = "alex@example.test";
const NOW = "2099-09-12T10:00:00.000Z";
const SOURCE_REQUEST_ID = "REQUEST-MP02-DETAILS-001";

function trustedPolicy(
  moiraeRecipient?: string,
  fatesRecipient?: string,
): Mp08bTrustedRecipientAuthorityConfig {
  return {
    moirae: { ...(moiraeRecipient ? { appointmentDetailsRecipient: moiraeRecipient } : {}) },
    fates: { ...(fatesRecipient ? { appointmentDetailsRecipient: fatesRecipient } : {}) },
  };
}

function proposal(): AgentProposalV1 {
  return { ...primaryCompilerFixtures[0].proposal };
}

function proposalSource(metadata: Record<string, unknown> = {}): Mp08bProposalSource {
  return {
    boundary: "STRANDS_PROPOSAL",
    provider: "mock",
    modelId: "mock/mp03-fates006c-integration",
    live: false,
    invoke: async () => ({
      proposal: proposal(),
      metadata: {
        sdk: "@strands-agents/sdk",
        sdkVersion: "1.16.0",
        provider: "mock",
        modelId: "mock/mp03-fates006c-integration",
        requestId: SOURCE_REQUEST_ID,
        requestCount: 1,
        structuredOutput: true,
        stopReason: "end_turn",
        latencyMs: 0,
        ...metadata,
      },
    }),
  };
}

function compilerContextFor(recipient: string) {
  return {
    ...createDemoCompilerContext(SOURCE_REQUEST_ID),
    agentPrincipalId: MP03_ACTING_AGENT,
    recipients: [{ customerId: "CUSTOMER-001", address: recipient, verified: true }],
  };
}

function authenticatedContext(): Mp03AuthenticatedContext {
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

function requestFor(recipient: string): Mp08bCompositionRequestV1 {
  return {
    request: `Synthetic local request for ${recipient}`,
    compilerContext: compilerContextFor(recipient),
    authenticatedContext: authenticatedContext(),
    now: NOW,
  };
}

function paths(label: string) {
  const directory = mkdtempSync(join(tmpdir(), `moirae-fates006c-${label}-`));
  return {
    directory,
    approvalStorePath: join(directory, "approval.sqlite"),
    bindingStorePath: join(directory, "bindings.json"),
  };
}

function envelope(prepared: Mp08bPreparedApprovalV1) {
  return {
    schemaVersion: "human-decision-v1" as const,
    approvalId: prepared.preparation.presentation.approvalId,
    decision: "APPROVE" as const,
    presentationDigest: prepared.preparation.presentation.presentationDigest,
    nativePresentationBindingHash: prepared.preparation.presentation.nativePresentationBindingHash,
  };
}

describeReal("MP-03 + accepted FATES-006C joint authority integration", () => {
  it("verifies immutable acceptance, implementation, runtime, and FATES-008A capability lineage", () => {
    expect(verifyMp08bFates006cCheckout(FATES_ROOT!)).toMatchObject({
      ...MP08B_FATES_006C_PROVENANCE,
      durableApprovalAncestorSha: MP08B_FATES_008A_CAPABILITY_PROVENANCE.commitSha,
      runtimeSha: MP08B_FATES_008A_CAPABILITY_PROVENANCE.runtimeSha,
    });
  });

  it("fails closed at trusted composition when Moirae and Fates policies differ", async () => {
    await expect(
      createMp08bVerifiedFatesDependency(FATES_ROOT!, trustedPolicy(RECIPIENT_A, RECIPIENT_B)),
    ).rejects.toMatchObject({ code: "FATES_MATERIALIZATION_FAILED" });
    await expect(
      createMp08bVerifiedFatesDependency(FATES_ROOT!, trustedPolicy(RECIPIENT_A, RECIPIENT_B)),
    ).rejects.toThrow(/TRUSTED_RECIPIENT_POLICY_MISMATCH/);
  });

  it("proves the six-case exact-recipient mismatch matrix with no fallback", async () => {
    const configured = await createMp08bVerifiedFatesDependency(
      FATES_ROOT!,
      trustedPolicy(RECIPIENT_A, RECIPIENT_A),
    );
    const configuredRuntime = createMp08bComposedRuntime({
      proposal: proposalSource(),
      fates: configured,
    });

    const matching = await configuredRuntime.compose(requestFor(RECIPIENT_A));
    expect(matching).toMatchObject({
      status: "COMPOSED",
      nextBoundary: "MP05_APPROVAL",
      admission: {
        status: "WAITING_FOR_APPROVAL",
        nativeDecision: "REQUIRE_APPROVAL",
        executorInvoked: false,
        effectExecuted: false,
      },
    });

    for (const recipient of [RECIPIENT_B, LEGACY_RECIPIENT]) {
      const mismatch = await configuredRuntime.compose(requestFor(recipient));
      expect(mismatch).toMatchObject({
        status: "COMPOSED",
        nextBoundary: "BOUNDARY_REVIEW",
        admission: { status: "BOUNDARY_FAILURE", reason: "fixture_profile_mismatch" },
      });
    }

    for (const actionRecipient of [RECIPIENT_A, RECIPIENT_B]) {
      await expect(
        createMp08bVerifiedFatesDependency(FATES_ROOT!, trustedPolicy(RECIPIENT_A, RECIPIENT_B)),
      ).rejects.toThrow(/TRUSTED_RECIPIENT_POLICY_MISMATCH/);
      expect(actionRecipient).toMatch(/@example\.test$/);
    }

    const legacy = await createMp08bVerifiedFatesDependency(
      FATES_ROOT!,
      trustedPolicy(undefined, undefined),
    );
    const legacyResult = await createMp08bComposedRuntime({
      proposal: proposalSource(),
      fates: legacy,
    }).compose(requestFor(LEGACY_RECIPIENT));
    expect(legacyResult).toMatchObject({
      status: "COMPOSED",
      nextBoundary: "MP05_APPROVAL",
      admission: { status: "WAITING_FOR_APPROVAL", nativeDecision: "REQUIRE_APPROVAL" },
    });
  });

  it("binds the exact recipient through real admission and durable approval without execution", async () => {
    const values = paths("recipient-a");
    const runtime = await createMp08bDurableApprovalRuntime({
      fatesRoot: FATES_ROOT!,
      approvalStorePath: values.approvalStorePath,
      bindingStorePath: values.bindingStorePath,
      proposal: proposalSource(),
      trustedTime: { now: () => NOW },
      trustedRecipientPolicy: trustedPolicy(RECIPIENT_A, RECIPIENT_A),
    });
    try {
      const prepared = await runtime.prepareApproval(requestFor(RECIPIENT_A));
      expect(prepared.composition).toMatchObject({
        status: "COMPOSED",
        nextBoundary: "MP05_APPROVAL",
        actionIntent: {
          target: { address: RECIPIENT_A },
          parameters: { recipientAddress: RECIPIENT_A },
        },
        admission: {
          status: "WAITING_FOR_APPROVAL",
          nativeDecision: "REQUIRE_APPROVAL",
          executorInvoked: false,
          effectExecuted: false,
        },
      });
      expect(prepared.preparation.presentation.target.address).toBe(RECIPIENT_A);
      expect(prepared.preparation.presentation.parameters.recipientAddress).toBe(RECIPIENT_A);
      expect(JSON.stringify(prepared.preparation.presentation)).not.toContain(LEGACY_RECIPIENT);
      expect(runtime.capabilities.externalEffects).toBe(false);

      const approved = await runtime.submitDecision({
        approvalId: prepared.binding.approvalId,
        envelope: envelope(prepared),
      });
      expect(approved).toMatchObject({ status: "APPROVED", nativeOutcome: "applied" });
      expect(approved).not.toHaveProperty("execution");
    } finally {
      runtime.close();
      rmSync(values.directory, { recursive: true, force: true });
    }
  });

  it("changes both hash domains with recipient identity and prevents approval reuse", async () => {
    const valuesA = paths("hash-a");
    const valuesB = paths("hash-b");
    const runtimeA = await createMp08bDurableApprovalRuntime({
      fatesRoot: FATES_ROOT!,
      approvalStorePath: valuesA.approvalStorePath,
      bindingStorePath: valuesA.bindingStorePath,
      proposal: proposalSource(),
      trustedTime: { now: () => NOW },
      trustedRecipientPolicy: trustedPolicy(RECIPIENT_A, RECIPIENT_A),
    });
    const runtimeB = await createMp08bDurableApprovalRuntime({
      fatesRoot: FATES_ROOT!,
      approvalStorePath: valuesB.approvalStorePath,
      bindingStorePath: valuesB.bindingStorePath,
      proposal: proposalSource(),
      trustedTime: { now: () => NOW },
      trustedRecipientPolicy: trustedPolicy(RECIPIENT_B, RECIPIENT_B),
    });
    try {
      const preparedA = await runtimeA.prepareApproval(requestFor(RECIPIENT_A));
      const preparedB = await runtimeB.prepareApproval(requestFor(RECIPIENT_B));
      if (
        preparedA.composition.status !== "COMPOSED" ||
        preparedB.composition.status !== "COMPOSED" ||
        preparedA.composition.admission.status !== "WAITING_FOR_APPROVAL" ||
        preparedB.composition.admission.status !== "WAITING_FOR_APPROVAL"
      ) {
        throw new Error("Expected two waiting real Fates admissions");
      }
      expect(preparedA.composition.admission.nativeActionHash).not.toBe(
        preparedB.composition.admission.nativeActionHash,
      );
      expect(preparedA.preparation.presentation.nativeActionHash).not.toBe(
        preparedB.preparation.presentation.nativeActionHash,
      );
      expect(preparedA.preparation.presentation.presentationDigest).not.toBe(
        preparedB.preparation.presentation.presentationDigest,
      );

      const crossRecipient = await runtimeB.submitDecision({
        approvalId: preparedA.binding.approvalId,
        envelope: envelope(preparedA),
      });
      expect(crossRecipient).toMatchObject({ status: "BOUNDARY_FAILURE" });
    } finally {
      runtimeA.close();
      runtimeB.close();
      rmSync(valuesA.directory, { recursive: true, force: true });
      rmSync(valuesB.directory, { recursive: true, force: true });
    }
  });

  it("keeps model/browser/provider/IAM metadata outside both trusted policies", async () => {
    const dependency = await createMp08bVerifiedFatesDependency(
      FATES_ROOT!,
      trustedPolicy(RECIPIENT_A, RECIPIENT_A),
    );
    const runtime = createMp08bComposedRuntime({
      fates: dependency,
      proposal: proposalSource({
        appointmentDetailsRecipient: RECIPIENT_B,
        browser: { appointmentDetailsRecipient: RECIPIENT_B },
        provider: { destination: RECIPIENT_B },
        iam: { principal: RECIPIENT_B },
      }),
    });
    const result = await runtime.compose(requestFor(RECIPIENT_A));
    expect(result).toMatchObject({
      status: "COMPOSED",
      nextBoundary: "MP05_APPROVAL",
      actionIntent: { parameters: { recipientAddress: RECIPIENT_A } },
      admission: { status: "WAITING_FOR_APPROVAL", nativeDecision: "REQUIRE_APPROVAL" },
    });
  });
});

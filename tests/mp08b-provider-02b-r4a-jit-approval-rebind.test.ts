import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MP03_ACTING_AGENT,
  MP03_AUTHENTICATED_WORKLOAD,
  MP03_CAUSATION_ID,
  MP03_CORRELATION_ID,
  MP03_PROFILE,
  MP03_POLICY_VERSION,
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
import {
  MP08B_PROVIDER_02B_ATTEMPT_ID,
  Provider02bAttemptLedger,
  Provider02bRunner,
  type Provider02bAttemptBindingsV1,
  type Provider02bPreparedApprovalBindingV1,
} from "../apps/host/src/provider-02b-runner.js";
import {
  createDisabledSesV2Transport,
  type SesProviderConfigV1,
} from "../apps/host/src/ses-provider.js";
import {
  createMp08bDurableApprovalRuntime,
  type Mp08bPreparedApprovalV1,
} from "../apps/host/src/approval-runtime.js";
import type { Mp08bCompositionRequestV1 } from "../apps/host/src/composition.js";
import type { Mp08bTrustedRecipientAuthorityConfig } from "../apps/host/src/fates-runtime.js";

const OLD_NOW = "2099-09-12T12:00:00.000Z";
const FRESH_NOW = "2099-09-12T13:00:00.000Z";
const TRUSTED_RECIPIENT = "trusted-demo@example.test";
const SOURCE_REQUEST_ID = "REQUEST-MP02-DETAILS-001";
const CONFIG: SesProviderConfigV1 = {
  region: "eu-west-2",
  fromEmailAddress: "sender@example.test",
  allowedRecipientAddress: TRUSTED_RECIPIENT,
  configurationSetName: "moirae-mp08b-r4a-synthetic",
};

function syntheticBinding(
  overrides: Partial<Provider02bAttemptBindingsV1> = {},
): Provider02bAttemptBindingsV1 {
  return {
    actionIntentDigest: "a".repeat(64),
    actionIntentIdempotencyKey: "idempotency-r4a-synthetic",
    approvalId: "approval-expired-synthetic",
    actionBindingDigest: "b".repeat(64),
    nativeActionHash: `sha256:${"c".repeat(64)}`,
    operation: MP03_PROFILE.SEND_APPOINTMENT_DETAILS.operation,
    recipientAddress: TRUSTED_RECIPIENT,
    contextDigest: "d".repeat(64),
    presentationInputDigest: "e".repeat(64),
    requestFingerprint: "f".repeat(64),
    ...overrides,
  };
}

function replacementBinding(
  overrides: Partial<Provider02bPreparedApprovalBindingV1> = {},
): Provider02bPreparedApprovalBindingV1 {
  return {
    approvalId: "approval-fresh-synthetic",
    actionIntentDigest: "a".repeat(64),
    actionIntentIdempotencyKey: "idempotency-r4a-synthetic",
    requestFingerprint: "f".repeat(64),
    actionBindingDigest: "b".repeat(64),
    nativeActionHash: `sha256:${"c".repeat(64)}`,
    operation: MP03_PROFILE.SEND_APPOINTMENT_DETAILS.operation,
    recipientAddress: TRUSTED_RECIPIENT,
    contextDigest: "d".repeat(64),
    presentationInputDigest: "e".repeat(64),
    ...overrides,
  };
}

function withLedger(test: (ledger: Provider02bAttemptLedger, path: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r4a-ledger-"));
  const path = join(directory, "attempt-001.json");
  try {
    test(new Provider02bAttemptLedger(path), path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function authenticatedContext(requestId = SOURCE_REQUEST_ID): Mp03AuthenticatedContext {
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
      requestId,
      correlationId: MP03_CORRELATION_ID,
      causationId: MP03_CAUSATION_ID,
    },
    policyVersion: MP03_POLICY_VERSION,
    purpose: profile.purpose,
  };
}

function request(now: string, recipient = TRUSTED_RECIPIENT): Mp08bCompositionRequestV1 {
  const compilerContext = structuredClone(createDemoCompilerContext(SOURCE_REQUEST_ID));
  compilerContext.agentPrincipalId = MP03_ACTING_AGENT;
  compilerContext.recipients = [{ customerId: "CUSTOMER-001", address: recipient, verified: true }];
  return {
    request: "Synthetic local R4A prepared approval rebind fixture.",
    compilerContext,
    authenticatedContext: authenticatedContext(),
    now,
  };
}

function trustedPolicy(recipient: string): Mp08bTrustedRecipientAuthorityConfig {
  return {
    moirae: { appointmentDetailsRecipient: recipient },
    fates: { appointmentDetailsRecipient: recipient },
  };
}

function realRunnerHarness(now: { value: string }) {
  const fatesRoot = process.env.FATES_ANANKE_ROOT ?? process.env.MP05_FATES_ANANKE_ROOT;
  if (!fatesRoot) throw new Error("FATES_ANANKE_ROOT is required for the real local harness.");
  const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r4a-real-"));
  const runtimePromise = createMp08bDurableApprovalRuntime({
    fatesRoot,
    approvalStorePath: join(directory, "approval.sqlite"),
    bindingStorePath: join(directory, "bindings.json"),
    executionAuthorityStorePath: join(directory, "authority.json"),
    proposal: {
      boundary: "STRANDS_PROPOSAL",
      provider: "mock",
      modelId: "mock/mp08b-r4a",
      live: false,
      invoke: async () => ({
        proposal: primaryCompilerFixtures[0].proposal,
        metadata: {
          sdk: "@strands-agents/sdk",
          sdkVersion: "1.16.0",
          provider: "mock",
          modelId: "mock/mp08b-r4a",
          requestId: SOURCE_REQUEST_ID,
          requestCount: 1,
          structuredOutput: true,
          stopReason: "end_turn",
          latencyMs: 0,
        },
      }),
    },
    trustedTime: { now: () => now.value },
    trustedRecipientPolicy: trustedPolicy(TRUSTED_RECIPIENT),
  });
  return { directory, runtimePromise };
}

describe("MP-08B Provider-02B-R4A prepared-state approval rebind", () => {
  it("rebinds one PREPARED attempt with append-only history and preserves identity", () => {
    withLedger((ledger, path) => {
      const original = syntheticBinding();
      const prepared = ledger.prepare(original, OLD_NOW);
      const rebound = ledger.rebindPreparedApproval({
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
        expectedApprovalId: original.approvalId,
        expectedApprovalBindingRevision: 0,
        replacement: replacementBinding(),
        now: FRESH_NOW,
      });

      expect(prepared.state).toBe("PREPARED");
      expect(rebound).toMatchObject({
        state: "PREPARED",
        providerInvocationCount: 0,
        approvalBindingRevision: 1,
        bindings: {
          approvalId: "approval-fresh-synthetic",
          actionIntentDigest: original.actionIntentDigest,
          actionIntentIdempotencyKey: original.actionIntentIdempotencyKey,
          requestFingerprint: original.requestFingerprint,
        },
      });
      expect(rebound.sendStartedAt).toBeUndefined();
      expect(rebound.bindings?.decisionId).toBeUndefined();
      expect(rebound.approvalBindingHistory).toEqual([
        expect.objectContaining({
          revision: 0,
          approvalId: "approval-expired-synthetic",
          status: "SUPERSEDED_EXPIRED",
        }),
        expect.objectContaining({
          revision: 1,
          approvalId: "approval-fresh-synthetic",
          status: "CURRENT",
        }),
      ]);
      expect(JSON.parse(readFileSync(path, "utf8"))).not.toHaveProperty("authorization");
    });
  });

  it.each([
    ["actionIntentDigest", { actionIntentDigest: "1".repeat(64) }],
    ["actionIntentIdempotencyKey", { actionIntentIdempotencyKey: "other-idempotency" }],
    ["requestFingerprint", { requestFingerprint: "2".repeat(64) }],
    ["actionBindingDigest", { actionBindingDigest: "3".repeat(64) }],
    ["nativeActionHash", { nativeActionHash: `sha256:${"4".repeat(64)}` }],
    ["recipientAddress", { recipientAddress: "other-demo@example.test" }],
    ["contextDigest", { contextDigest: "5".repeat(64) }],
    ["presentationInputDigest", { presentationInputDigest: "6".repeat(64) }],
    [
      "operation",
      {
        operation: {
          ...MP03_PROFILE.SEND_APPOINTMENT_DETAILS.operation,
          toolName: "different-tool",
        },
      },
    ],
  ] as const)("rejects a protected action mismatch in %s without mutation", (_field, change) => {
    withLedger((ledger) => {
      const original = syntheticBinding();
      ledger.prepare(original, OLD_NOW);
      expect(() =>
        ledger.rebindPreparedApproval({
          attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
          expectedApprovalId: original.approvalId,
          expectedApprovalBindingRevision: 0,
          replacement: replacementBinding(change),
          now: FRESH_NOW,
        }),
      ).toThrow(/exact prepared action/i);
      expect(ledger.read()).toMatchObject({
        state: "PREPARED",
        approvalBindingRevision: 0,
        bindings: { approvalId: original.approvalId },
      });
      expect(ledger.read().approvalBindingHistory).toHaveLength(1);
    });
  });

  it("refuses stale expected revision and preserves single-current semantics", () => {
    withLedger((ledger, path) => {
      const original = syntheticBinding();
      ledger.prepare(original, OLD_NOW);
      const first = ledger.rebindPreparedApproval({
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
        expectedApprovalId: original.approvalId,
        expectedApprovalBindingRevision: 0,
        replacement: replacementBinding(),
        now: FRESH_NOW,
      });
      const restarted = new Provider02bAttemptLedger(path);
      expect(restarted.read()).toEqual(first);
      expect(() =>
        restarted.rebindPreparedApproval({
          attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
          expectedApprovalId: original.approvalId,
          expectedApprovalBindingRevision: 0,
          replacement: replacementBinding({ approvalId: "approval-second-synthetic" }),
          now: FRESH_NOW,
        }),
      ).toThrow(/stale|current approval ID/i);
      expect(restarted.read().approvalBindingHistory).toHaveLength(2);
    });
  });

  it("refuses rebind after approval, SEND_STARTED, provider, or terminal activity", () => {
    withLedger((ledger) => {
      const original = syntheticBinding();
      ledger.prepare(original, OLD_NOW);
      ledger.recordApproval("APPROVED", "decision-synthetic", OLD_NOW);
      expect(() =>
        ledger.rebindPreparedApproval({
          attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
          expectedApprovalId: original.approvalId,
          expectedApprovalBindingRevision: 0,
          replacement: replacementBinding(),
          now: FRESH_NOW,
        }),
      ).toThrow(/unconsumed PREPARED/i);
    });

    withLedger((ledger) => {
      const original = syntheticBinding();
      ledger.prepare(original, OLD_NOW);
      ledger.recordApproval("APPROVED", "decision-synthetic", OLD_NOW);
      ledger.recordClaim({
        logicalWorkId: "work-synthetic",
        deliveryId: "delivery-synthetic",
        claimId: "claim-synthetic",
        claimGeneration: 1,
        correlationId: "correlation-synthetic",
        now: OLD_NOW,
      });
      ledger.sendStarted({ durableExecutionId: "execution-synthetic", now: FRESH_NOW });
      expect(() =>
        ledger.rebindPreparedApproval({
          attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
          expectedApprovalId: original.approvalId,
          expectedApprovalBindingRevision: 0,
          replacement: replacementBinding(),
          now: FRESH_NOW,
        }),
      ).toThrow(/unconsumed PREPARED/i);
    });
  });
});

const FATES_ROOT = process.env.FATES_ANANKE_ROOT ?? process.env.MP05_FATES_ANANKE_ROOT;
const describeReal = FATES_ROOT ? describe : describe.skip;

describeReal("MP-08B Provider-02B-R4A real local approval rebind", () => {
  it("rebinds an expired approval to a fresh same-action approval, then accepts only the fresh decision", async () => {
    const clock = { value: OLD_NOW };
    const { directory, runtimePromise } = realRunnerHarness(clock);
    const runtime = await runtimePromise;
    const runner = new Provider02bRunner({
      approvalRuntime: runtime,
      ledgerPath: join(directory, "attempt-001.json"),
      providerConfig: CONFIG,
      transport: createDisabledSesV2Transport(),
      transportMode: "OFFLINE_TEST",
      observe: async () => undefined,
      trustedTime: { now: () => clock.value },
      workerId: "provider-02b-r4a-synthetic-worker",
    });
    try {
      const first = await runner.prepare(request(OLD_NOW));
      const oldApprovalId = first.prepared.binding.approvalId;
      clock.value = FRESH_NOW;
      expect((await runtime.readApproval(oldApprovalId)).state).toBe("EXPIRED");

      const replacement = await runtime.prepareApproval(request(FRESH_NOW));
      const freshApprovalId = replacement.binding.approvalId;
      expect((await runtime.readApproval(freshApprovalId)).state).toBe("PENDING");

      const rebound = await runner.rebindPreparedApproval({
        expectedApprovalId: oldApprovalId,
        expectedApprovalBindingRevision: 0,
        replacement,
      });
      expect(rebound).toMatchObject({
        state: "PREPARED",
        providerInvocationCount: 0,
        bindings: {
          approvalId: freshApprovalId,
          actionIntentDigest: first.ledger.bindings?.actionIntentDigest,
          actionIntentIdempotencyKey: first.ledger.bindings?.actionIntentIdempotencyKey,
        },
      });
      expect(rebound.bindings?.decisionId).toBeUndefined();
      expect(rebound.sendStartedAt).toBeUndefined();
      expect(rebound.approvalBindingHistory).toHaveLength(2);
      expect(rebound.approvalBindingHistory[0].approvalId).toBe(oldApprovalId);
      expect(rebound.approvalBindingHistory[0].status).toBe("SUPERSEDED_EXPIRED");
      expect(rebound.approvalBindingHistory[1].approvalId).toBe(freshApprovalId);
      expect(rebound.approvalBindingHistory[1].status).toBe("CURRENT");

      await expect(
        runner.submitHumanDecision({
          approvalId: oldApprovalId,
          envelope: {},
        }),
      ).rejects.toThrow(/not bound/i);

      const presentation = replacement.preparation.presentation;
      const outcome = await runner.submitHumanDecision({
        approvalId: freshApprovalId,
        envelope: {
          schemaVersion: "human-decision-v1",
          approvalId: freshApprovalId,
          decision: "APPROVE",
          presentationDigest: presentation.presentationDigest,
          nativePresentationBindingHash: presentation.nativePresentationBindingHash,
        },
      });
      expect(outcome.status).toBe("APPROVED");
      expect(outcome.approvalId).toBe(freshApprovalId);
      expect(runner.readLedger()).toMatchObject({
        state: "APPROVED",
        providerInvocationCount: 0,
        bindings: { approvalId: freshApprovalId },
      });
      expect(runner.readLedger().bindings?.decisionId).toBeTruthy();
      expect(readFileSync(join(directory, "attempt-001.json"), "utf8")).not.toContain(
        "AUTHORIZE PROVIDER-02B SEND NOW",
      );
    } finally {
      runtime.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a same-looking replacement whose recipient changes at the trusted Fates boundary", async () => {
    const clock = { value: OLD_NOW };
    const { directory, runtimePromise } = realRunnerHarness(clock);
    const runtime = await runtimePromise;
    const runner = new Provider02bRunner({
      approvalRuntime: runtime,
      ledgerPath: join(directory, "attempt-001.json"),
      providerConfig: CONFIG,
      transport: createDisabledSesV2Transport(),
      transportMode: "OFFLINE_TEST",
      observe: async () => undefined,
      trustedTime: { now: () => clock.value },
      workerId: "provider-02b-r4a-mismatch-worker",
    });
    try {
      const first = await runner.prepare(request(OLD_NOW));
      clock.value = FRESH_NOW;
      const replacement = await runtime.prepareApproval(request(FRESH_NOW));
      if (replacement.composition.status !== "COMPOSED")
        throw new Error("The synthetic replacement did not compose.");
      const altered = {
        ...replacement,
        composition: {
          ...replacement.composition,
          actionIntent: {
            ...replacement.composition.actionIntent,
            target: {
              ...replacement.composition.actionIntent.target,
              address: "other-demo@example.test",
            },
            parameters: {
              ...replacement.composition.actionIntent.parameters,
              recipientAddress: "other-demo@example.test",
            },
          },
        },
        binding: {
          ...replacement.binding,
          intent: {
            ...replacement.binding.intent,
            target: {
              ...replacement.binding.intent.target,
              address: "other-demo@example.test",
            },
            parameters: {
              ...replacement.binding.intent.parameters,
              recipientAddress: "other-demo@example.test",
            },
          },
        },
      } as Mp08bPreparedApprovalV1;
      expect(
        (first.prepared.binding.intent.parameters as Record<string, unknown>).recipientAddress,
      ).toBe(TRUSTED_RECIPIENT);
      await expect(
        runner.rebindPreparedApproval({
          expectedApprovalId: first.prepared.binding.approvalId,
          expectedApprovalBindingRevision: 0,
          replacement: altered,
        }),
      ).rejects.toThrow(/exact same action identity|trusted durable host binding|fresh waiting/i);
      expect(runner.readLedger()).toMatchObject({
        state: "PREPARED",
        approvalBindingRevision: 0,
        bindings: { approvalId: first.prepared.binding.approvalId },
      });
    } finally {
      runtime.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  compileAgentProposal,
  type ActionIntentV1,
} from "../packages/action-compiler/src/index.js";
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
import {
  MP08B_PROVIDER_02B_ATTEMPT_002_ID,
  MP08B_PROVIDER_02B_ATTEMPT_ID,
  Provider02bAttemptLedger,
  Provider02bRunner,
  type Provider02bRunnerOptions,
} from "../apps/host/src/provider-02b-runner.js";
import {
  createMp08bDurableApprovalRuntime,
  type Mp08bPreparedApprovalV1,
} from "../apps/host/src/approval-runtime.js";
import { createMp08bDurableQueueRuntime } from "../apps/host/src/queue-runtime.js";
import type { Mp08bCompositionRequestV1 } from "../apps/host/src/composition.js";
import type { SesProviderConfigV1 } from "../apps/host/src/ses-provider.js";

const NOW = "2099-09-12T12:00:00.000Z";
const RECIPIENT = "trusted-demo@example.test";
const REQUEST_001 = "REQUEST-MP08B-PROVIDER-02B-001";
const REQUEST_002 = "REQUEST-MP08B-PROVIDER-02B-002";
const CONFIG: SesProviderConfigV1 = {
  region: "eu-west-2",
  fromEmailAddress: "sender@example.test",
  allowedRecipientAddress: RECIPIENT,
  configurationSetName: "moirae-mp08b-demo",
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function intentFor(requestId: string): ActionIntentV1 {
  const compilerContext = structuredClone(createDemoCompilerContext(requestId));
  compilerContext.agentPrincipalId = MP03_ACTING_AGENT;
  compilerContext.recipients[0].address = RECIPIENT;
  const result = compileAgentProposal({
    proposal: primaryCompilerFixtures[0].proposal,
    context: compilerContext,
  });
  if (result.status !== "COMPILED") throw new Error("The R6 fixture did not compile.");
  return result.actionIntent;
}

function authenticatedContext(requestId: string): Mp03AuthenticatedContext {
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

function requestFor(requestId: string): Mp08bCompositionRequestV1 {
  const compilerContext = structuredClone(createDemoCompilerContext(requestId));
  compilerContext.agentPrincipalId = MP03_ACTING_AGENT;
  compilerContext.recipients[0].address = RECIPIENT;
  return {
    request: "Synthetic R6 fresh governed action.",
    compilerContext,
    authenticatedContext: authenticatedContext(requestId),
    now: NOW,
  };
}

function preparedFor(intent: ActionIntentV1, approvalId: string): Mp08bPreparedApprovalV1 {
  const waitingAdmission = {
    status: "WAITING_FOR_APPROVAL",
    nativeDecision: "REQUIRE_APPROVAL",
    approvalId,
    operation: MP03_PROFILE.SEND_APPOINTMENT_DETAILS.operation,
    nativeActionHash: `sha256:${digest({ recipient: RECIPIENT })}`,
    executorInvoked: false,
    effectExecuted: false,
  } as const;
  return {
    composition: {
      schemaVersion: "mp08b-composition-v1",
      status: "COMPOSED",
      proposal: primaryCompilerFixtures[0].proposal,
      actionIntent: intent,
      admission: waitingAdmission,
      nextBoundary: "MP05_APPROVAL",
    },
    request: requestFor(intent.sourceRequestId),
    preparation: { presentation: {} },
    binding: {
      schemaVersion: "mp08b-approval-binding-v1",
      approvalId,
      intent,
      authenticatedContext: authenticatedContext(intent.sourceRequestId),
      waitingAdmission,
      bindingDigest: digest({ approvalId, action: intent.canonicalDigest }),
    },
  } as unknown as Mp08bPreparedApprovalV1;
}

function fakeRunner(directory: string, attemptId = MP08B_PROVIDER_02B_ATTEMPT_002_ID) {
  const intent = intentFor(REQUEST_002);
  const approvalId = "approval-synthetic-attempt-002";
  const decisionId = "decision-synthetic-attempt-002";
  const prepared = preparedFor(intent, approvalId);
  let approvalState: "PENDING" | "APPROVED" = "PENDING";
  const send = vi.fn();
  const queueRuntime = {
    enqueueApproved: vi.fn(async () => ({
      approval: {
        schemaVersion: "mp05-approval-observation-v1",
        approvalId,
        state: "APPROVED",
        decisionId,
        expiresAt: "2099-09-12T12:05:00.000Z",
      },
      enqueue: { status: "ENQUEUED" },
      work: {
        workId: "logical-work-synthetic-attempt-002",
        deliveryId: "delivery-synthetic-attempt-002",
        sourceRequestId: intent.sourceRequestId,
        actionIntentDigest: intent.canonicalDigest,
        actionIntentIdempotencyKey: intent.idempotencyKey,
        protocolReferences: { approval: { approvalId, decisionId } },
      },
      delivery: { state: "AVAILABLE" },
    })),
    claim: vi.fn(async () => ({
      status: "READY_FOR_MP04",
      claim: {
        schemaVersion: "mp06b-scheduling-claim-v1",
        workId: "logical-work-synthetic-attempt-002",
        deliveryId: "delivery-synthetic-attempt-002",
        workerId: "worker-synthetic-attempt-002",
        claimId: "claim-synthetic-attempt-002",
        generation: 1,
        claimedAt: NOW,
        expiresAt: "2099-09-12T12:05:00.000Z",
        stateVersion: 1,
      },
    })),
    executeClaimed: vi.fn(),
  };
  const options: Provider02bRunnerOptions = {
    attemptIdentity: { attemptId, lifecycle: "CREATE_FRESH" },
    approvalRuntime: {
      prepareApproval: vi.fn(async () => prepared),
      submitDecision: vi.fn(async () => {
        approvalState = "APPROVED";
        return { status: "APPROVED", approvalId, decisionId } as never;
      }),
      readApproval: vi.fn(
        async () =>
          ({
            schemaVersion: "mp05-approval-observation-v1",
            approvalId,
            state: approvalState,
            ...(approvalState === "APPROVED" ? { decisionId } : {}),
            expiresAt: "2099-09-12T12:05:00.000Z",
          }) as never,
      ),
      getApprovalBinding: vi.fn(() => prepared.binding),
      admitApproved: vi.fn(),
      getMp04AnankePort: vi.fn(),
    } as never,
    queueRuntime: queueRuntime as never,
    ledgerPath: join(directory, "attempt-002.json"),
    providerConfig: CONFIG,
    transport: { send },
    transportMode: "OFFLINE_TEST",
    observe: vi.fn(),
    trustedTime: { now: () => NOW },
    workerId: "worker-synthetic-attempt-002",
  };
  return { runner: new Provider02bRunner(options), options, prepared, approvalId, send };
}

describe("MP-08B Provider-02B-R6 fresh Attempt-002 identity", () => {
  it("creates Attempt-002 once in the current schema and never overwrites it", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r6-create-"));
    try {
      const fixture = fakeRunner(directory);
      const created = await fixture.runner.prepare(requestFor(REQUEST_002));
      expect(created.ledger).toMatchObject({
        schemaVersion: "mp08b-provider-02b-r3-v1",
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_002_ID,
        state: "PREPARED",
        providerInvocationCount: 0,
      });
      expect(created.ledger.legacyIdentityHydration).toBeUndefined();
      expect(created.ledger.sendStartedAt).toBeUndefined();

      const duplicate = new Provider02bRunner(fixture.options);
      await expect(duplicate.prepare(requestFor(REQUEST_002))).rejects.toThrow(
        /FRESH_ATTEMPT_CREATE_ONLY/,
      );
      expect(fixture.runner.readLedger()).toEqual(created.ledger);
      expect(
        () =>
          new Provider02bAttemptLedger(join(directory, "forbidden.json"), {
            attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
            lifecycle: "CREATE_FRESH",
          }),
      ).toThrow(/cannot cross-bind/i);
      expect(() =>
        new Provider02bAttemptLedger(join(directory, "attempt-002.json"), {
          attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
          lifecycle: "LEGACY_ATTEMPT_001",
        }).read(NOW),
      ).toThrow(/ledger is invalid/i);
      expect(fixture.send).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses a new governed action identity and rejects Attempt-001 authority", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r6-isolation-"));
    try {
      const oldIntent = intentFor(REQUEST_001);
      const newIntent = intentFor(REQUEST_002);
      expect(newIntent.sourceRequestId).not.toBe(oldIntent.sourceRequestId);
      expect(newIntent.canonicalDigest).not.toBe(oldIntent.canonicalDigest);
      expect(newIntent.idempotencyKey).not.toBe(oldIntent.idempotencyKey);

      const fixture = fakeRunner(directory);
      await fixture.runner.prepare(requestFor(REQUEST_002));
      await expect(
        fixture.runner.submitHumanDecision({
          approvalId: "approval-synthetic-attempt-001",
          envelope: { decision: "APPROVE" },
        }),
      ).rejects.toThrow(/not bound to the prepared attempt/i);
      expect(fixture.runner.readLedger()).toMatchObject({
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_002_ID,
        state: "PREPARED",
        bindings: {
          actionIntentDigest: newIntent.canonicalDigest,
          actionIntentIdempotencyKey: newIntent.idempotencyKey,
        },
      });
      expect(fixture.send).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("allows exactly one concurrent create for the fresh durable identity", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r6-race-"));
    try {
      const fixture = fakeRunner(directory);
      const competing = new Provider02bRunner(fixture.options);
      const outcomes = await Promise.allSettled([
        fixture.runner.prepare(requestFor(REQUEST_002)),
        competing.prepare(requestFor(REQUEST_002)),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
      expect(fixture.runner.readLedger()).toMatchObject({
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_002_ID,
        state: "PREPARED",
      });
      expect(fixture.send).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reaches a fresh MP-06 claim and stops before MP-04/provider execution", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r6-flow-"));
    try {
      const fixture = fakeRunner(directory);
      const prepared = await fixture.runner.prepare(requestFor(REQUEST_002));
      await fixture.runner.submitHumanDecision({
        approvalId: prepared.prepared.binding.approvalId,
        envelope: { decision: "APPROVE" },
      });
      const claimed = await fixture.runner.enqueueAndClaim();
      expect(claimed.claim.status).toBe("READY_FOR_MP04");
      expect(claimed.ledger).toMatchObject({
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_002_ID,
        state: "APPROVED",
        providerInvocationCount: 0,
        bindings: {
          logicalWorkId: "logical-work-synthetic-attempt-002",
          deliveryId: "delivery-synthetic-attempt-002",
          claimId: "claim-synthetic-attempt-002",
          decisionId: "decision-synthetic-attempt-002",
        },
      });
      expect(claimed.ledger.sendStartedAt).toBeUndefined();
      expect(fixture.send).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("preserves the point of no return for a synthetic Attempt-002 restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r6-once-"));
    try {
      const fixture = fakeRunner(directory);
      const prepared = await fixture.runner.prepare(requestFor(REQUEST_002));
      await fixture.runner.submitHumanDecision({
        approvalId: prepared.prepared.binding.approvalId,
        envelope: { decision: "APPROVE" },
      });
      await fixture.runner.enqueueAndClaim();
      const restarted = new Provider02bAttemptLedger(join(directory, "attempt-002.json"), {
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_002_ID,
        lifecycle: "RESUME_EXISTING",
      });
      const consumed = restarted.sendStarted({
        durableExecutionId: "fates-execution:sha256:synthetic-attempt-002",
        now: NOW,
      });
      expect(consumed).toMatchObject({
        state: "SEND_STARTED",
        providerInvocationCount: 1,
      });
      expect(() =>
        restarted.sendStarted({
          durableExecutionId: "fates-execution:sha256:synthetic-attempt-002-replay",
          now: NOW,
        }),
      ).toThrow(/second provider call/i);
      await expect(
        new Provider02bRunner(fixture.options).prepare(requestFor(REQUEST_002)),
      ).rejects.toThrow(/FRESH_ATTEMPT_CREATE_ONLY/);
      expect(fixture.send).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const FATES_ROOT = process.env.MP05_FATES_ANANKE_ROOT;
const describeReal = FATES_ROOT ? describe : describe.skip;

describeReal("MP-08B Provider-02B-R6 real authority fresh pre-send cycle", () => {
  it("does not let a fresh ActionIntent select its own accepted source identity", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r6-source-policy-"));
    const runtime = await createMp08bDurableApprovalRuntime({
      fatesRoot: FATES_ROOT!,
      approvalStorePath: join(directory, "approval.sqlite"),
      bindingStorePath: join(directory, "approval-bindings.json"),
      proposal: {
        boundary: "STRANDS_PROPOSAL",
        provider: "mock",
        modelId: "mock/provider-02b-r6-source-policy",
        live: false,
        invoke: async () => ({
          proposal: primaryCompilerFixtures[0].proposal,
          metadata: {
            sdk: "@strands-agents/sdk",
            sdkVersion: "1.16.0",
            provider: "mock",
            modelId: "mock/provider-02b-r6-source-policy",
            requestId: REQUEST_002,
            requestCount: 1,
            structuredOutput: true,
            stopReason: "end_turn",
            latencyMs: 0,
          },
        }),
      },
      trustedTime: { now: () => NOW },
      trustedRecipientPolicy: {
        moirae: { appointmentDetailsRecipient: RECIPIENT },
        fates: { appointmentDetailsRecipient: RECIPIENT },
      },
    });
    try {
      await expect(runtime.prepareApproval(requestFor(REQUEST_002))).rejects.toThrow(
        /real Fates REQUIRE_APPROVAL/i,
      );
    } finally {
      runtime.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("binds real Fates approval and a fresh durable queue claim to Attempt-002", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r6-real-"));
    const trustedTime = { now: () => NOW };
    const approvalRuntime = await createMp08bDurableApprovalRuntime({
      fatesRoot: FATES_ROOT!,
      approvalStorePath: join(directory, "approval.sqlite"),
      bindingStorePath: join(directory, "approval-bindings.json"),
      executionAuthorityStorePath: join(directory, "execution-authority.json"),
      proposal: {
        boundary: "STRANDS_PROPOSAL",
        provider: "mock",
        modelId: "mock/provider-02b-r6",
        live: false,
        invoke: async () => ({
          proposal: primaryCompilerFixtures[0].proposal,
          metadata: {
            sdk: "@strands-agents/sdk",
            sdkVersion: "1.16.0",
            provider: "mock",
            modelId: "mock/provider-02b-r6",
            requestId: REQUEST_002,
            requestCount: 1,
            structuredOutput: true,
            stopReason: "end_turn",
            latencyMs: 0,
          },
        }),
      },
      trustedTime,
      trustedRecipientPolicy: {
        moirae: {
          appointmentDetailsRecipient: RECIPIENT,
          appointmentDetailsSourceRequestId: REQUEST_002,
        },
        fates: { appointmentDetailsRecipient: RECIPIENT },
      },
    });
    const queueRuntime = createMp08bDurableQueueRuntime({
      approvalRuntime,
      queuePath: join(directory, "queue.json"),
      activityPath: join(directory, "activity.json"),
      trustedTime,
      instanceId: "provider-02b-r6-real",
      leaseDurationMs: 60_000,
      retryBudget: 0,
    });
    const send = vi.fn();
    const runner = new Provider02bRunner({
      attemptIdentity: {
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_002_ID,
        lifecycle: "CREATE_FRESH",
      },
      approvalRuntime,
      queueRuntime,
      ledgerPath: join(directory, "attempt-002.json"),
      providerConfig: CONFIG,
      transport: { send },
      transportMode: "OFFLINE_TEST",
      observe: vi.fn(),
      trustedTime,
      workerId: "provider-02b-r6-real-worker",
    });
    try {
      const prepared = await runner.prepare(requestFor(REQUEST_002));
      expect(prepared.prepared.composition.status).toBe("COMPOSED");
      if (prepared.prepared.composition.status !== "COMPOSED")
        throw new Error("The real R6 authority path did not compose.");
      expect(prepared.prepared.composition.admission).toMatchObject({
        status: "WAITING_FOR_APPROVAL",
        nativeDecision: "REQUIRE_APPROVAL",
        executorInvoked: false,
        effectExecuted: false,
      });
      expect(prepared.prepared.composition.actionIntent).toMatchObject({
        sourceRequestId: REQUEST_002,
        target: { address: RECIPIENT },
        parameters: { recipientAddress: RECIPIENT },
      });
      const presentation = prepared.prepared.preparation.presentation;
      const decision = await runner.submitHumanDecision({
        approvalId: prepared.prepared.binding.approvalId,
        envelope: {
          schemaVersion: "human-decision-v1",
          approvalId: prepared.prepared.binding.approvalId,
          decision: "APPROVE",
          presentationDigest: presentation.presentationDigest,
          nativePresentationBindingHash: presentation.nativePresentationBindingHash,
        },
      });
      expect(decision.status).toBe("APPROVED");
      const claimed = await runner.enqueueAndClaim();
      expect(claimed.claim.status).toBe("READY_FOR_MP04");
      expect(claimed.ledger).toMatchObject({
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_002_ID,
        state: "APPROVED",
        providerInvocationCount: 0,
      });
      expect(claimed.ledger.bindings?.logicalWorkId).toBeTruthy();
      expect(claimed.ledger.bindings?.deliveryId).toBeTruthy();
      expect(claimed.ledger.bindings?.claimId).toBeTruthy();
      expect(claimed.ledger.bindings?.correlationId).toBeTruthy();
      expect(claimed.ledger.sendStartedAt).toBeUndefined();
      expect(send).not.toHaveBeenCalled();
    } finally {
      approvalRuntime.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

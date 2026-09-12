import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  compileAgentProposal,
  type ActionIntentV1,
} from "../packages/action-compiler/src/index.js";
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
  type Mp03AuthenticatedContext,
} from "../packages/fates-adapter/src/index.js";
import {
  createDemoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";
import {
  MP08B_PROVIDER_02B_ATTEMPT_ID,
  PROVIDER_02B_LIVE_AUTHORIZATION,
  PROVIDER_02B_OFFLINE_AUTHORIZATION,
  Provider02bAttemptLedger,
  Provider02bRunner,
  type Provider02bRunnerOptions,
} from "../apps/host/src/provider-02b-runner.js";
import {
  prepareSesAppointmentDetailsRequest,
  type SesProviderConfigV1,
  type SesV2Transport,
} from "../apps/host/src/ses-provider.js";
import {
  MP08B_FATES_006C_PROVENANCE,
  createMp08bDurableApprovalRuntime,
} from "../apps/host/src/approval-runtime.js";
import type { Mp08bCompositionRequestV1 } from "../apps/host/src/composition.js";
import type { Mp08bTrustedRecipientAuthorityConfig } from "../apps/host/src/fates-runtime.js";
import type { Mp04AnankePort } from "../packages/execution-coordinator/src/index.js";

const NOW = "2026-09-12T12:00:00.000Z";
const TRUSTED_RECIPIENT = "trusted-demo@example.test";
const CONFIG: SesProviderConfigV1 = {
  region: "eu-west-2",
  fromEmailAddress: "sender@example.test",
  allowedRecipientAddress: TRUSTED_RECIPIENT,
  configurationSetName: "moirae-mp08b-demo",
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function actionIntent(recipient = TRUSTED_RECIPIENT): ActionIntentV1 {
  const compilerContext = structuredClone(
    createDemoCompilerContext("REQUEST-MP08B-PROVIDER-02B-R3"),
  );
  compilerContext.agentPrincipalId = MP03_ACTING_AGENT;
  compilerContext.recipients[0].address = recipient;
  const result = compileAgentProposal({
    proposal: primaryCompilerFixtures[0].proposal,
    context: compilerContext,
  });
  if (result.status !== "COMPILED")
    throw new Error("The deterministic provider fixture did not compile.");
  return result.actionIntent;
}

function context(requestId = "REQUEST-MP08B-PROVIDER-02B-R3"): Mp03AuthenticatedContext {
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

function request(recipient = TRUSTED_RECIPIENT): Mp08bCompositionRequestV1 {
  const compilerContext = structuredClone(
    createDemoCompilerContext("REQUEST-MP08B-PROVIDER-02B-R3"),
  );
  compilerContext.agentPrincipalId = MP03_ACTING_AGENT;
  compilerContext.recipients[0].address = recipient;
  return {
    request: "Provider-02B controlled appointment-details preparation fixture.",
    compilerContext,
    authenticatedContext: context(),
    now: NOW,
  };
}

function fakeAnanke(): Mp04AnankePort {
  return {
    createExecutionAuthority: (input) => ({
      schemaVersion: "1",
      durableExecutionId: `fates-execution:sha256:${"1".repeat(64)}`,
      nativeActionHash: input.admission.actionHash,
      operation: input.operation,
      authenticatedContext: input.executionContext,
      resourceScope: input.executionContext.resourceScope,
      purpose: input.executionContext.purpose,
      policyVersion: input.executionContext.policyVersion,
      effectAdapter: input.effectAdapter,
      argumentsDigest: `sha256:${digest(input.args)}`,
      targetDigest: `sha256:${digest(input.executionContext.resourceScope)}`,
      authorityInstanceDigest: `sha256:${"2".repeat(64)}`,
      requestIdentity: {
        requestId: input.executionContext.correlation.requestId,
        correlationId: input.executionContext.correlation.correlationId,
        causationId: input.executionContext.correlation.causationId,
      },
      ...(input.admission.approvalGrantId
        ? { approval: { grantId: input.admission.approvalGrantId } }
        : {}),
    }),
    hashArgumentsDigest: (args) => `sha256:${digest(args)}`,
    hashTargetDigest: (scope) => `sha256:${digest(scope)}`,
  };
}

function admittedFixture(intent: ActionIntentV1, approvalId: string) {
  const action = "SEND_APPOINTMENT_DETAILS" as const;
  const operation = MP03_PROFILE[action].operation;
  return {
    authority: "admission-only" as const,
    status: "ADMITTED" as const,
    nativeDecision: "ALLOW" as const,
    action,
    operation,
    nativeActionHash: MP03_NATIVE_HASH_FIXTURES[action],
    moiraeCanonicalDigest: intent.canonicalDigest,
    moiraeIdempotencyKey: intent.idempotencyKey,
    approvalId,
    evidence: {
      sourceRequestId: intent.sourceRequestId,
      moiraeCanonicalDigest: intent.canonicalDigest,
      moiraeIdempotencyKey: intent.idempotencyKey,
      action,
      dependencyProfile: MP03_FATES_PROFILE,
      anankeSha: MP03_ANANKE_SHA,
      adrasteiaSha: MP03_ADRASTEIA_SHA,
      operation,
      nativeActionHash: MP03_NATIVE_HASH_FIXTURES[action],
      admissionStatus: "ADMITTED" as const,
      approvalId,
      approvalStatus: "approved" as const,
      resourceScopeReference: intent.resource.resourceId,
      purpose: MP03_PROFILE[action].purpose,
      contextTimestamp: intent.contextTimestamp,
      evaluatedAt: NOW,
      auditId: "audit-provider-02b-r3-offline",
      executorInvoked: false as const,
      effectExecuted: false as const,
    },
    executorInvoked: false as const,
    effectExecuted: false as const,
  };
}

function fakeTransport(): { transport: SesV2Transport; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async () => ({ MessageId: "ses-message-provider-02b-r3", $metadata: {} }));
  return { transport: { send }, send };
}

function fakeHarness(
  recipient = TRUSTED_RECIPIENT,
  transportMode: Provider02bRunnerOptions["transportMode"] = "OFFLINE_TEST",
) {
  const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r3-"));
  const intent = actionIntent(recipient);
  const authenticatedContext = context();
  const approvalId = "approval-provider-02b-r3";
  const decisionId = "decision-provider-02b-r3";
  const waitingAdmission = {
    status: "WAITING_FOR_APPROVAL",
    nativeDecision: "REQUIRE_APPROVAL",
    approvalId,
  } as const;
  const binding = {
    schemaVersion: "mp08b-approval-binding-v1" as const,
    approvalId,
    intent,
    authenticatedContext,
    waitingAdmission,
    bindingDigest: "a".repeat(64),
  };
  const prepared = {
    composition: {
      schemaVersion: "mp08b-composition-v1" as const,
      status: "COMPOSED" as const,
      proposal: primaryCompilerFixtures[0].proposal,
      actionIntent: intent,
      admission: waitingAdmission,
      nextBoundary: "MP05_APPROVAL" as const,
    },
    request: request(recipient),
    preparation: { presentation: {} },
    binding,
  } as never;
  let approvalState: "PENDING" | "APPROVED" = "PENDING";
  const approvalRuntime = {
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
          expiresAt: "2026-09-12T13:00:00.000Z",
        }) as never,
    ),
    getApprovalBinding: vi.fn(() => binding),
    admitApproved: vi.fn(),
    getMp04AnankePort: vi.fn(() => fakeAnanke()),
  };
  const work = {
    workId: "mp06b-work-provider-02b-r3",
    deliveryId: "mp06b-delivery-provider-02b-r3",
    sourceRequestId: intent.sourceRequestId,
    actionIntentDigest: intent.canonicalDigest,
    actionIntentIdempotencyKey: intent.idempotencyKey,
    protocolReferences: { approval: { approvalId, decisionId } },
  };
  const claim = {
    schemaVersion: "mp06b-scheduling-claim-v1" as const,
    workId: work.workId,
    deliveryId: work.deliveryId,
    workerId: "provider-02b-r3-offline-worker",
    claimId: "mp06b-claim-provider-02b-r3",
    generation: 1,
    claimedAt: NOW,
    expiresAt: "2026-09-12T13:00:00.000Z",
    stateVersion: 1,
  };
  const approval = {
    schemaVersion: "mp05-approval-observation-v1",
    approvalId,
    state: "APPROVED",
    decisionId,
    expiresAt: "2026-09-12T13:00:00.000Z",
  } as never;
  const transport = fakeTransport();
  const queueRuntime = {
    enqueueApproved: vi.fn(
      async () =>
        ({
          approval,
          enqueue: { status: "ENQUEUED", work },
          work,
          delivery: { work, state: "AVAILABLE" },
        }) as never,
    ),
    claim: vi.fn(
      async () =>
        ({
          status: "READY_FOR_MP04",
          workId: work.workId,
          deliveryId: work.deliveryId,
          claim,
        }) as never,
    ),
    executeClaimed: vi.fn(
      async (input: {
        execution: { executeAdmittedAction(value: unknown): Promise<unknown> };
        deliveryId: string;
        claim: unknown;
      }) => {
        const execution = await input.execution.executeAdmittedAction({
          intent,
          authenticatedContext,
          admission: admittedFixture(intent, approvalId),
          now: NOW,
        });
        const result = execution as { status: string; durableExecutionId?: string };
        return {
          status: result.status === "CONFIRMED" ? "COMPLETED" : "RECONCILIATION_REQUIRED",
          workId: work.workId,
          deliveryId: work.deliveryId,
          queueOutcome: result.status === "CONFIRMED" ? "COMPLETED" : "RECONCILIATION_REQUIRED",
          execution,
        } as never;
      },
    ),
  };
  const options: Provider02bRunnerOptions = {
    approvalRuntime: approvalRuntime as never,
    queueRuntime: queueRuntime as never,
    ledgerPath: join(directory, "attempt-001.json"),
    providerConfig: { ...CONFIG, allowedRecipientAddress: recipient },
    transport: transport.transport,
    transportMode,
    observe: async ({ prepared: preparedRequest, invocation }) => ({
      schemaVersion: "ses-observation-v1" as const,
      source: "OFFLINE_FIXTURE" as const,
      outcome: "DELIVERED" as const,
      providerOperationId: invocation.providerOperationId,
      recipientAddress: preparedRequest.expectedRecipient,
      executionId: preparedRequest.identity.executionId,
      correlationId: preparedRequest.correlationId,
      observedAt: NOW,
    }),
    trustedTime: { now: () => NOW },
    workerId: "provider-02b-r3-offline-worker",
  };
  return {
    runner: new Provider02bRunner(options),
    transport,
    directory,
    request: request(),
    approvalId,
    decisionId,
    intent,
    binding,
  };
}

describe("MP-08B Provider-02B-R3 preparation and one-attempt guard", () => {
  it("binds the exact provider request without translation", () => {
    const intent = actionIntent();
    const prepared = prepareSesAppointmentDetailsRequest({
      intent,
      config: CONFIG,
      identity: {
        logicalWorkId: "work-provider-02b-r3",
        actionIntentDigest: intent.canonicalDigest,
        actionIntentIdempotencyKey: intent.idempotencyKey,
        approvalId: "approval-provider-02b-r3",
        decisionId: "decision-provider-02b-r3",
        claimGeneration: 1,
        executionId: "fates-execution:provider-02b-r3",
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
        correlationId: "correlation-provider-02b-r3",
        transportMode: "OFFLINE_TEST",
        sendStartedAt: NOW,
      },
      approvedBinding: {
        approvalId: "approval-provider-02b-r3",
        decisionId: "decision-provider-02b-r3",
        actionIntentDigest: intent.canonicalDigest,
      },
    });
    expect(prepared.request.Destination?.ToAddresses).toEqual([TRUSTED_RECIPIENT]);
    expect(prepared.expectedRecipient).toBe(TRUSTED_RECIPIENT);
    expect(prepared.request.ConfigurationSetName).toBe("moirae-mp08b-demo");
  });

  it("creates only a prepared, not started, Attempt-001 ledger", async () => {
    const fixture = fakeHarness();
    try {
      const prepared = await fixture.runner.prepare(fixture.request);
      expect(prepared.ledger).toMatchObject({
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
        state: "PREPARED",
        providerInvocationCount: 0,
        automaticRetryCount: 0,
      });
      expect(prepared.ledger.sendStartedAt).toBeUndefined();
      expect(readFileSync(join(fixture.directory, "attempt-001.json"), "utf8")).not.toContain(
        "sender@example.test",
      );
      expect(fixture.transport.send).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it("requires the exact live authorization phrase and keeps the current task offline", async () => {
    const fixture = fakeHarness();
    try {
      await expect(fixture.runner.executeOnce(PROVIDER_02B_LIVE_AUTHORIZATION)).rejects.toThrow(
        /OFFLINE execution requires OFFLINE_DRY_RUN/i,
      );
      const liveFixture = fakeHarness(TRUSTED_RECIPIENT, "LIVE");
      try {
        await expect(
          liveFixture.runner.executeOnce(PROVIDER_02B_LIVE_AUTHORIZATION),
        ).rejects.toThrow(/current approved claim/i);
      } finally {
        rmSync(liveFixture.directory, { recursive: true, force: true });
      }
      expect(PROVIDER_02B_LIVE_AUTHORIZATION).toBe("AUTHORIZE PROVIDER-02B SEND NOW");
      expect(fixture.transport.send).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it("performs one offline invocation and durably refuses a second send", async () => {
    const fixture = fakeHarness("alex@example.test");
    try {
      const prepared = await fixture.runner.prepare(fixture.request);
      await fixture.runner.submitHumanDecision({
        approvalId: prepared.prepared.binding.approvalId,
        envelope: { decision: "APPROVE" },
      });
      await fixture.runner.enqueueAndClaim();
      const result = await fixture.runner.executeOnce(PROVIDER_02B_OFFLINE_AUTHORIZATION);
      expect(result.invocation?.status).toBe("ACCEPTED");
      expect(result.reconciliation?.status).toBe("CONFIRMED");
      expect(result.queue.status).toBe("COMPLETED");
      expect(fixture.transport.send).toHaveBeenCalledTimes(1);
      expect(fixture.runner.readLedger()).toMatchObject({
        state: "RECONCILED",
        providerInvocationCount: 1,
        automaticRetryCount: 0,
        reconciliationStatus: "CONFIRMED",
        queueOutcome: "COMPLETED",
      });

      const restartedLedger = new Provider02bAttemptLedger(
        join(fixture.directory, "attempt-001.json"),
      );
      expect(() =>
        restartedLedger.sendStarted({
          durableExecutionId: "fates-execution:sha256:deadbeef",
          now: NOW,
        }),
      ).toThrow(/second provider call/i);
      expect(fixture.transport.send).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });
});

const FATES_ROOT = process.env.FATES_ANANKE_ROOT ?? process.env.MP05_FATES_ANANKE_ROOT;
const describeReal = FATES_ROOT ? describe : describe.skip;

function trustedPolicy(recipient: string): Mp08bTrustedRecipientAuthorityConfig {
  return {
    moirae: { appointmentDetailsRecipient: recipient },
    fates: { appointmentDetailsRecipient: recipient },
  };
}

describeReal("MP-08B Provider-02B-R3 real Fates preparation", () => {
  it("gets real REQUIRE_APPROVAL for the trusted configured synthetic recipient", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r3-real-"));
    const realNow = "2099-09-12T10:00:00.000Z";
    const realRequestId = "REQUEST-MP02-DETAILS-001";
    const realCompilerContext = {
      ...createDemoCompilerContext(realRequestId),
      agentPrincipalId: MP03_ACTING_AGENT,
      recipients: [{ customerId: "CUSTOMER-001", address: TRUSTED_RECIPIENT, verified: true }],
    };
    const realRequest: Mp08bCompositionRequestV1 = {
      request: `Synthetic local request for ${TRUSTED_RECIPIENT}`,
      compilerContext: realCompilerContext,
      authenticatedContext: context(realRequestId),
      now: realNow,
    };
    const runtime = await createMp08bDurableApprovalRuntime({
      fatesRoot: FATES_ROOT!,
      approvalStorePath: join(directory, "approval.sqlite"),
      bindingStorePath: join(directory, "bindings.json"),
      executionAuthorityStorePath: join(directory, "authority.json"),
      proposal: {
        boundary: "STRANDS_PROPOSAL",
        provider: "mock",
        modelId: "mock/mp03-fates006c-integration",
        live: false,
        invoke: async () => ({
          proposal: primaryCompilerFixtures[0].proposal,
          metadata: {
            sdk: "@strands-agents/sdk",
            sdkVersion: "1.16.0",
            provider: "mock",
            modelId: "mock/mp03-fates006c-integration",
            requestId: realRequestId,
            requestCount: 1,
            structuredOutput: true,
            stopReason: "end_turn",
            latencyMs: 0,
          },
        }),
      },
      trustedTime: { now: () => realNow },
      trustedRecipientPolicy: trustedPolicy(TRUSTED_RECIPIENT),
    });
    try {
      const prepared = await runtime.prepareApproval(realRequest);
      expect(prepared.composition).toMatchObject({
        status: "COMPOSED",
        nextBoundary: "MP05_APPROVAL",
        actionIntent: {
          target: { address: TRUSTED_RECIPIENT },
          parameters: { recipientAddress: TRUSTED_RECIPIENT },
        },
        admission: {
          status: "WAITING_FOR_APPROVAL",
          nativeDecision: "REQUIRE_APPROVAL",
          executorInvoked: false,
          effectExecuted: false,
        },
      });
      expect(prepared.preparation.presentation.target.address).toBe(TRUSTED_RECIPIENT);
      expect(runtime.capabilities.externalEffects).toBe(false);
      expect(MP08B_FATES_006C_PROVENANCE.commitSha).toBe(
        "7ce078863edde033d96a896d7e23e11a0a24292b",
      );
    } finally {
      runtime.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

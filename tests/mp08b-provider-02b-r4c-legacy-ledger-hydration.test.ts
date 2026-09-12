import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

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
import {
  MP08B_PROVIDER_02B_ATTEMPT_ID,
  Provider02bAttemptLedger,
  Provider02bRunner,
  type Provider02bAttemptBindingsV1,
  type Provider02bPreparedApprovalBindingV1,
  type Provider02bRunnerOptions,
} from "../apps/host/src/provider-02b-runner.js";
import {
  createDisabledSesV2Transport,
  type SesProviderConfigV1,
} from "../apps/host/src/ses-provider.js";
import {
  createMp08bDurableApprovalRuntime,
  type Mp08bApprovalBindingV1,
} from "../apps/host/src/approval-runtime.js";
import type { Mp08bCompositionRequestV1 } from "../apps/host/src/composition.js";
import { canonicalizeJsonV1 } from "../packages/action-compiler/src/index.js";
import type { Mp08bTrustedRecipientAuthorityConfig } from "../apps/host/src/fates-runtime.js";

const OLD_NOW = "2099-09-12T12:00:00.000Z";
const FRESH_NOW = "2099-09-12T13:00:00.000Z";
const TRUSTED_RECIPIENT = "trusted-demo@example.test";
const SOURCE_REQUEST_ID = "REQUEST-MP02-DETAILS-001";
const CONFIG: SesProviderConfigV1 = {
  region: "eu-west-2",
  fromEmailAddress: "sender@example.test",
  allowedRecipientAddress: TRUSTED_RECIPIENT,
  configurationSetName: "moirae-mp08b-r4c-synthetic",
};

function modernBinding(
  overrides: Partial<Provider02bAttemptBindingsV1> = {},
): Provider02bAttemptBindingsV1 {
  return {
    actionIntentDigest: "a".repeat(64),
    actionIntentIdempotencyKey: "idempotency-r4c-synthetic",
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

function legacyBinding(
  overrides: Partial<Provider02bAttemptBindingsV1> = {},
): Provider02bAttemptBindingsV1 {
  const binding = modernBinding(overrides);
  return {
    actionIntentDigest: binding.actionIntentDigest,
    actionIntentIdempotencyKey: binding.actionIntentIdempotencyKey,
    approvalId: binding.approvalId,
    requestFingerprint: binding.requestFingerprint,
  };
}

function legacyRecord(bindings: Provider02bAttemptBindingsV1): Record<string, unknown> {
  return {
    schemaVersion: "mp08b-provider-02b-r3-v1",
    attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
    state: "PREPARED",
    updatedAt: OLD_NOW,
    bindings,
    providerInvocationCount: 0,
    automaticRetryCount: 0,
  };
}

function requestFingerprintForBinding(binding: Mp08bApprovalBindingV1): string {
  return createHash("sha256")
    .update(
      canonicalizeJsonV1({
        action: binding.intent.action,
        actionIntentDigest: binding.intent.canonicalDigest,
        actionIntentIdempotencyKey: binding.intent.idempotencyKey,
        configurationSetName: CONFIG.configurationSetName,
        provider: "aws-ses-v2",
        region: CONFIG.region,
        templateId: "appointment-details-v1",
      }),
      "utf8",
    )
    .digest("hex");
}

function withLegacyLedger(
  test: (ledger: Provider02bAttemptLedger, path: string) => void,
  bindings = legacyBinding(),
): void {
  const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r4c-ledger-"));
  const path = join(directory, "attempt-001.json");
  writeFileSync(path, `${JSON.stringify(legacyRecord(bindings))}\n`, "utf8");
  try {
    test(new Provider02bAttemptLedger(path), path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function authoritativeBinding(approvalId = "approval-expired-synthetic"): Mp08bApprovalBindingV1 {
  return {
    schemaVersion: "mp08b-approval-binding-v1",
    approvalId,
    intent: {
      schemaVersion: "action-intent-v1",
      canonicalizationVersion: "jcs-rfc8785-v1",
      action: "SEND_APPOINTMENT_DETAILS",
      canonicalDigest: "a".repeat(64),
      idempotencyKey: "idempotency-r4c-synthetic",
      sourceRequestId: SOURCE_REQUEST_ID,
      principal: { agentPrincipalId: MP03_ACTING_AGENT },
      requester: { customerId: "CUSTOMER-001" },
      resource: { id: "RESOURCE-APPOINTMENT-DETAILS-001" },
      target: { address: TRUSTED_RECIPIENT },
      parameters: {
        bookingId: "BOOKING-001",
        recipientAddress: TRUSTED_RECIPIENT,
        templateId: "appointment-details-v1",
      },
      effectClass: "DISCLOSE",
      contextTimestamp: OLD_NOW,
      evidenceRefs: [{ kind: "fixture", ref: "r4c" }],
    },
    authenticatedContext: {
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
      resourceScope: MP03_PROFILE.SEND_APPOINTMENT_DETAILS.scope,
      correlation: {
        requestId: SOURCE_REQUEST_ID,
        correlationId: MP03_CORRELATION_ID,
        causationId: MP03_CAUSATION_ID,
      },
      policyVersion: MP03_POLICY_VERSION,
      purpose: MP03_PROFILE.SEND_APPOINTMENT_DETAILS.purpose,
    },
    waitingAdmission: {
      schemaVersion: "moirae-admission-result-v1",
      status: "WAITING_FOR_APPROVAL",
      nativeDecision: "REQUIRE_APPROVAL",
      approvalId,
      nativeActionHash: `sha256:${"c".repeat(64)}`,
      operation: MP03_PROFILE.SEND_APPOINTMENT_DETAILS.operation,
      executorInvoked: false,
      effectExecuted: false,
      evidence: {
        evaluatedAt: OLD_NOW,
        auditId: "audit-r4c-synthetic",
      },
    },
    bindingDigest: "f".repeat(64),
  } as unknown as Mp08bApprovalBindingV1;
}

function fakeRunner(
  path: string,
  binding: Mp08bApprovalBindingV1,
  state: "EXPIRED" | "REVOKED" = "EXPIRED",
): Provider02bRunner {
  const approvalRuntime = {
    getApprovalBinding: (approvalId: string) =>
      approvalId === binding.approvalId ? binding : undefined,
    readApproval: async () => ({
      schemaVersion: "mp05-approval-observation-v1" as const,
      approvalId: binding.approvalId,
      state,
      actionHash: "a".repeat(64),
      presentationBindingHash: "b".repeat(64),
      expiresAt: OLD_NOW,
      observedAt: FRESH_NOW,
    }),
  } as unknown as Provider02bRunnerOptions["approvalRuntime"];
  return new Provider02bRunner({
    approvalRuntime,
    ledgerPath: path,
    providerConfig: CONFIG,
    transport: createDisabledSesV2Transport(),
    transportMode: "OFFLINE_TEST",
    observe: async () => undefined,
    trustedTime: { now: () => FRESH_NOW },
    workerId: "provider-02b-r4c-test-worker",
  });
}

describe("MP-08B Provider-02B-R4C legacy prepared-ledger hydration", () => {
  it("reproduces the exact legacy-to-modern R4A mismatch before hydration", () => {
    withLegacyLedger((ledger) => {
      expect(() =>
        ledger.rebindPreparedApproval({
          attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
          expectedApprovalId: "approval-expired-synthetic",
          expectedApprovalBindingRevision: 0,
          replacement: {
            ...modernBinding({ approvalId: "approval-fresh-synthetic" }),
          } as Provider02bPreparedApprovalBindingV1,
          now: FRESH_NOW,
        }),
      ).toThrow(/exact prepared action/i);
    });
  });

  it("hydrates, remains PREPARED, is restart durable, and is idempotent", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r4c-hydrate-"));
    const path = join(directory, "attempt-001.json");
    const binding = authoritativeBinding();
    writeFileSync(
      path,
      `${JSON.stringify(legacyRecord(legacyBinding({ requestFingerprint: requestFingerprintForBinding(binding) })))}\n`,
      "utf8",
    );
    try {
      const runner = fakeRunner(path, binding);
      const hydrated = await runner.hydrateLegacyPreparedIdentity({
        expectedApprovalId: binding.approvalId,
        expectedApprovalBindingRevision: 0,
      });
      expect(hydrated).toMatchObject({
        state: "PREPARED",
        providerInvocationCount: 0,
        legacyIdentityHydration: {
          version: 1,
          status: "HYDRATED",
          sourceSchema: "R3_PREPARED",
        },
      });
      expect(hydrated.bindings).toMatchObject({
        actionBindingDigest: expect.any(String),
        nativeActionHash: expect.any(String),
        recipientAddress: TRUSTED_RECIPIENT,
        contextDigest: expect.any(String),
        presentationInputDigest: expect.any(String),
        operation: MP03_PROFILE.SEND_APPOINTMENT_DETAILS.operation,
      });
      expect(hydrated.sendStartedAt).toBeUndefined();

      const restarted = new Provider02bAttemptLedger(path).read(FRESH_NOW);
      expect(restarted).toEqual(hydrated);
      const second = await runner.hydrateLegacyPreparedIdentity({
        expectedApprovalId: binding.approvalId,
        expectedApprovalBindingRevision: 0,
      });
      expect(second).toEqual(hydrated);

      const replacement = {
        ...hydrated.bindings,
        approvalId: "approval-fresh-synthetic",
      } as Provider02bPreparedApprovalBindingV1;
      const rebound = new Provider02bAttemptLedger(path).rebindPreparedApproval({
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
        expectedApprovalId: binding.approvalId,
        expectedApprovalBindingRevision: 0,
        replacement,
        now: FRESH_NOW,
      });
      expect(rebound).toMatchObject({
        state: "PREPARED",
        providerInvocationCount: 0,
        bindings: { approvalId: "approval-fresh-synthetic" },
      });
      expect(rebound.approvalBindingHistory).toEqual([
        expect.objectContaining({ status: "SUPERSEDED_EXPIRED" }),
        expect.objectContaining({ status: "CURRENT", approvalId: "approval-fresh-synthetic" }),
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fills correct partial fields but rejects an existing disagreement without mutation", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r4c-partial-"));
    const path = join(directory, "attempt-001.json");
    const binding = authoritativeBinding();
    const partial = legacyBinding({
      recipientAddress: TRUSTED_RECIPIENT,
      requestFingerprint: requestFingerprintForBinding(binding),
    });
    writeFileSync(path, `${JSON.stringify(legacyRecord(partial))}\n`, "utf8");
    try {
      const runner = fakeRunner(path, binding);
      const hydrated = await runner.hydrateLegacyPreparedIdentity({
        expectedApprovalId: binding.approvalId,
        expectedApprovalBindingRevision: 0,
      });
      expect(hydrated.bindings?.recipientAddress).toBe(TRUSTED_RECIPIENT);
      expect(hydrated.bindings?.contextDigest).toBeTruthy();

      const wrongPath = join(directory, "wrong-attempt-001.json");
      writeFileSync(
        wrongPath,
        `${JSON.stringify(legacyRecord({ ...legacyBinding({ requestFingerprint: requestFingerprintForBinding(binding) }), recipientAddress: "wrong@example.test" }))}\n`,
        "utf8",
      );
      const wrongRunner = fakeRunner(wrongPath, binding);
      const before = readFileSync(wrongPath, "utf8");
      await expect(
        wrongRunner.hydrateLegacyPreparedIdentity({
          expectedApprovalId: binding.approvalId,
          expectedApprovalBindingRevision: 0,
        }),
      ).rejects.toThrow(/EXISTING_VALUE_MISMATCH/i);
      expect(readFileSync(wrongPath, "utf8")).toBe(before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(["APPROVED", "SEND_STARTED", "SEND_RETURNED", "OBSERVING", "RECONCILED"] as const)(
    "refuses hydration after %s",
    (state) => {
      withLegacyLedger((ledger, path) => {
        const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        raw.state = state;
        raw.providerInvocationCount = state === "APPROVED" ? 0 : 1;
        writeFileSync(path, `${JSON.stringify(raw)}\n`, "utf8");
        expect(() =>
          new Provider02bAttemptLedger(path).hydrateLegacyPreparedIdentity({
            attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
            expectedApprovalId: "approval-expired-synthetic",
            expectedApprovalBindingRevision: 0,
            reconstructed: modernBinding() as Provider02bPreparedApprovalBindingV1,
            now: FRESH_NOW,
          }),
        ).toThrow(/unconsumed PREPARED/i);
      });
    },
  );
});

const FATES_ROOT = process.env.FATES_ANANKE_ROOT ?? process.env.MP05_FATES_ANANKE_ROOT;
const describeReal = FATES_ROOT ? describe : describe.skip;

function trustedPolicy(recipient: string): Mp08bTrustedRecipientAuthorityConfig {
  return {
    moirae: { appointmentDetailsRecipient: recipient },
    fates: { appointmentDetailsRecipient: recipient },
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

function realRequest(now: string): Mp08bCompositionRequestV1 {
  const compilerContext = {
    ...createDemoCompilerContext(SOURCE_REQUEST_ID),
    agentPrincipalId: MP03_ACTING_AGENT,
    recipients: [{ customerId: "CUSTOMER-001", address: TRUSTED_RECIPIENT, verified: true }],
  };
  return {
    request: "Synthetic local R4C prepared approval hydration fixture.",
    compilerContext,
    authenticatedContext: authenticatedContext(),
    now,
  };
}

describeReal("MP-08B Provider-02B-R4C real Fates legacy compatibility", () => {
  it("hydrates an exact R3-shaped ledger and preserves strict R4A rebind", async () => {
    const directory = mkdtempSync(join(tmpdir(), "moirae-provider-02b-r4c-real-"));
    const clock = { value: OLD_NOW };
    const runtime = await createMp08bDurableApprovalRuntime({
      fatesRoot: FATES_ROOT!,
      approvalStorePath: join(directory, "approval.sqlite"),
      bindingStorePath: join(directory, "bindings.json"),
      executionAuthorityStorePath: join(directory, "authority.json"),
      proposal: {
        boundary: "STRANDS_PROPOSAL",
        provider: "mock",
        modelId: "mock/mp08b-r4c",
        live: false,
        invoke: async () => ({
          proposal: primaryCompilerFixtures[0].proposal,
          metadata: {
            sdk: "@strands-agents/sdk",
            sdkVersion: "1.16.0",
            provider: "mock",
            modelId: "mock/mp08b-r4c",
            requestId: SOURCE_REQUEST_ID,
            requestCount: 1,
            structuredOutput: true,
            stopReason: "fixture",
            latencyMs: 0,
          },
        }),
      },
      trustedTime: { now: () => clock.value },
      trustedRecipientPolicy: trustedPolicy(TRUSTED_RECIPIENT),
    });
    const path = join(directory, "attempt-001.json");
    const runner = new Provider02bRunner({
      approvalRuntime: runtime,
      ledgerPath: path,
      providerConfig: CONFIG,
      transport: createDisabledSesV2Transport(),
      transportMode: "OFFLINE_TEST",
      observe: async () => undefined,
      trustedTime: { now: () => clock.value },
      workerId: "provider-02b-r4c-real-test-worker",
    });
    try {
      const first = await runner.prepare(realRequest(OLD_NOW));
      const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      const fullBindings = raw.bindings as Record<string, unknown>;
      raw.bindings = {
        actionIntentDigest: fullBindings.actionIntentDigest,
        actionIntentIdempotencyKey: fullBindings.actionIntentIdempotencyKey,
        approvalId: fullBindings.approvalId,
        requestFingerprint: fullBindings.requestFingerprint,
      };
      delete raw.approvalBindingRevision;
      delete raw.approvalBindingHistory;
      delete raw.legacyIdentityHydration;
      writeFileSync(path, `${JSON.stringify(raw)}\n`, "utf8");

      clock.value = FRESH_NOW;
      const hydrated = await runner.hydrateLegacyPreparedIdentity({
        expectedApprovalId: first.prepared.binding.approvalId,
        expectedApprovalBindingRevision: 0,
      });
      expect(hydrated).toMatchObject({
        state: "PREPARED",
        providerInvocationCount: 0,
        legacyIdentityHydration: { status: "HYDRATED", sourceSchema: "R3_PREPARED" },
      });

      const replacement = await runtime.prepareApproval(realRequest(FRESH_NOW));
      const rebound = await runner.rebindPreparedApproval({
        expectedApprovalId: first.prepared.binding.approvalId,
        expectedApprovalBindingRevision: 0,
        replacement,
      });
      expect(rebound).toMatchObject({
        state: "PREPARED",
        providerInvocationCount: 0,
        bindings: { approvalId: replacement.binding.approvalId },
      });
      expect(rebound.approvalBindingHistory).toHaveLength(2);
    } finally {
      runtime.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

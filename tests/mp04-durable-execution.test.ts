import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  actionIntentCoreFromIntent,
  actionIntentDigest,
  actionIntentIdempotencyKey,
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
  MP03_FATES_PROFILE,
  MP03_NATIVE_HASH_FIXTURES,
  MP03_POLICY_VERSION,
  MP03_PROFILE,
  MP03_REQUESTER,
  MP03_RUNTIME_ID,
  MP03_RUNTIME_INSTANCE,
  MP03_SESSION_ID,
  MP03_TENANT_ID,
  createMp03AdmissionAdapter,
  type Mp03AuthenticatedContext,
} from "../packages/fates-adapter/src/index.js";
import {
  MP04_DEPENDENCY_PROVENANCE,
  createMp04ExecutionCoordinator,
  InMemoryMp04ExecutionIndex,
  type Mp04AnankePort,
  type Mp04EffectAdapterIdentityV1,
  type Mp04HoraePort,
} from "../packages/execution-coordinator/src/index.js";
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

type Action = keyof typeof MP03_PROFILE;

const acceptedAnankeRoot = process.env.FATES_ANANKE_ROOT;
const acceptedHoraeRoot = process.env.FATES_HORAE_ROOT;
const describeReal = acceptedAnankeRoot && acceptedHoraeRoot ? describe : describe.skip;

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

function compileFixture(
  action: Action,
  sourceRequestId = "REQUEST-MP02-DETAILS-001",
): ActionIntentV1 {
  const result = compileAgentProposal({
    proposal: proposalFor(action),
    context: compilerContext(sourceRequestId),
  });
  if (result.status !== "COMPILED") throw new Error(`Fixture did not compile: ${result.status}`);
  return result.actionIntent;
}

async function compileThroughRealStrands(action: Action): Promise<ActionIntentV1> {
  const agent = createAdministrativeAgentWithModelFactory({
    provider: { kind: "mock", modelId: "mock/synthetic" },
    modelFactory: () => new SyntheticStructuredOutputModel(() => proposalFor(action)),
  });
  const proposal = await invokeAdministrativeAgent(agent, `Synthetic MP-04 request for ${action}`, {
    requestId: "REQUEST-MP02-DETAILS-001",
    timeoutMs: 5_000,
  });
  const result = compileAgentProposal({
    proposal: proposal.proposal,
    context: compilerContext(),
  });
  if (result.status !== "COMPILED")
    throw new Error(`Strands fixture did not compile: ${result.status}`);
  return result.actionIntent;
}

function contextFor(
  action: Action,
  sourceRequestId = "REQUEST-MP02-DETAILS-001",
): Mp03AuthenticatedContext {
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
      requestId: sourceRequestId,
      correlationId: "CORRELATION-FATES-006B-001",
      causationId: MP03_CAUSATION_ID,
    },
    policyVersion: MP03_POLICY_VERSION,
    purpose: MP03_PROFILE[action].purpose,
  };
}

async function admitWithApproval(
  gateway: { admit: (...args: never[]) => Promise<unknown>; approvals: ApprovalStore },
  action: Action,
  intent: ActionIntentV1,
  context: Mp03AuthenticatedContext,
  now = NOW,
) {
  const adapter = createMp03AdmissionAdapter(
    { admit: gateway.admit.bind(gateway) },
    MP03_DEPENDENCY_PROVENANCE,
  );
  const input = { intent, authenticatedContext: context, now };
  const waiting = await adapter.admitActionIntent(input);
  if (waiting.status !== "WAITING_FOR_APPROVAL") throw new Error("Expected MP-03 approval request");
  const approved = gateway.approvals.approve(
    waiting.approvalId,
    {
      operatorId: "mp04-synthetic-operator",
      displayName: "MP-04 synthetic operator",
      sessionId: "mp04-synthetic-session",
      authMethod: "dev-token",
      roles: ["approver"],
      authenticatedAt: now,
    },
    now,
  );
  if (approved?.status !== "approved") throw new Error("Synthetic approval was not recorded");
  return adapter.admitActionIntent({ ...input, approvalId: waiting.approvalId });
}

interface ApprovalStore {
  approve(id: string, operator: unknown, now: string): { status: string } | undefined;
  get(id: string, now: string): Approval | undefined;
}

interface Approval {
  id: string;
  status: string;
  used: boolean;
  actionHash: string;
  bindingHash?: string;
  expiresAt: string;
  bindRequestIdentity?: boolean;
  approvedBy?: string;
  approvedBySessionId?: string;
}

interface NativeGateway {
  admit(...args: never[]): Promise<unknown>;
  approvals: ApprovalStore & { clear(): void };
  policy: { loadConfig(config: unknown): void };
  createExecutionAuthority(
    operation: unknown,
    args: Record<string, unknown>,
    admission: Record<string, unknown>,
    options: Record<string, unknown>,
  ): unknown;
  executeClaimed(
    operation: unknown,
    args: Record<string, unknown>,
    authority: unknown,
    claim: unknown,
    options: Record<string, unknown>,
  ): Promise<{ status: string; receipt: unknown }>;
  reconcileClaimed(
    operation: unknown,
    args: Record<string, unknown>,
    authority: unknown,
    claim: unknown,
    options: Record<string, unknown>,
  ): Promise<{ status: string; receipt: unknown }>;
  registerClaimAwareEffectAdapter(toolName: string, adapter: unknown): void;
}

interface NativeAnankeModule {
  Gateway: new (config: Record<string, unknown>) => NativeGateway;
  registerMoiraeAdministrativeOperationProfile(gateway: NativeGateway): void;
  MOIRAE_ADMINISTRATIVE_POLICY_CONFIG: unknown;
  MP03_POLICY_VERSION?: string;
  FileDurableAuthorityStore: new (options: { filePath: string }) => unknown;
  hashArgumentsDigest(args: Record<string, unknown>): string;
  hashTargetDigest(scope: Record<string, unknown>): string;
  createEffectReceiptV1(input: Record<string, unknown>): unknown;
  providerIdempotencyKey(authority: unknown): string;
}

interface NativeHoraeModule {
  FileFates007aExecutionStore: new (options: { filePath: string }) => HoraeStore;
  Fates007aExecutionCoordinator: new (
    store: HoraeStore,
    ananke: {
      executeClaimed(input: Record<string, unknown>): Promise<{ status: string; receipt: unknown }>;
      reconcileClaimed(
        input: Record<string, unknown>,
      ): Promise<{ status: string; receipt: unknown }>;
    },
    now: () => string,
  ) => Mp04HoraePort;
  createFates007aClaimVerifier(store: HoraeStore, now: () => string): ClaimVerifier;
}

interface HoraeStore {
  get(id: string): unknown;
}

interface ClaimVerifier {
  verifyClaim(input: Record<string, unknown>): Promise<{ valid: boolean; reason?: string }>;
  reserveExecution(input: Record<string, unknown>): Promise<{ valid: boolean; reason?: string }>;
  markInvocationStarted(
    input: Record<string, unknown>,
  ): Promise<{ valid: boolean; reason?: string }>;
}

interface RealHarness {
  gateway: NativeGateway;
  horae: Mp04HoraePort;
  ananke: Mp04AnankePort;
  cleanup(): void;
  counts: { execute: number; reconcile: number };
  setMode(mode: "confirmed" | "unknown" | "absent" | "persistent-unknown"): void;
}

async function createRealHarness(
  anankeModule: NativeAnankeModule,
  horaeModule: NativeHoraeModule,
  mode: "confirmed" | "unknown" | "absent" | "persistent-unknown" = "confirmed",
): Promise<RealHarness> {
  const directory = mkdtempSync(join(tmpdir(), "moirae-mp04-"));
  const counts = { execute: 0, reconcile: 0 };
  let effectMode = mode;
  const authorityStore = new anankeModule.FileDurableAuthorityStore({
    filePath: join(directory, "ananke-authority.json"),
  });
  const gateway = new anankeModule.Gateway({
    developmentMode: true,
    autoLoadPolicy: false,
    policyVersion: MP03_POLICY_VERSION,
    approvalTtlMs: 5 * 60 * 1000,
    claimAwareExecution: { authorityStore },
  });
  gateway.approvals.clear();
  anankeModule.registerMoiraeAdministrativeOperationProfile(gateway);
  gateway.policy.loadConfig(anankeModule.MOIRAE_ADMINISTRATIVE_POLICY_CONFIG);
  const horaeStore = new horaeModule.FileFates007aExecutionStore({
    filePath: join(directory, "horae-execution.json"),
  });
  const claimVerifier = horaeModule.createFates007aClaimVerifier(horaeStore, () => NOW);
  const makeReceipt = (
    input: Record<string, unknown>,
    result: "CONFIRMED" | "ABSENT" | "UNKNOWN",
  ) =>
    anankeModule.createEffectReceiptV1({
      durableExecutionId: (input.authority as Record<string, unknown>).durableExecutionId,
      nativeActionHash: (input.authority as Record<string, unknown>).nativeActionHash,
      operation: (input.authority as Record<string, unknown>).operation,
      authorityInstanceDigest: (input.authority as Record<string, unknown>).authorityInstanceDigest,
      effectAdapter: ADAPTER_ID,
      argumentsDigest: (input.authority as Record<string, unknown>).argumentsDigest,
      targetDigest: (input.authority as Record<string, unknown>).targetDigest,
      providerOperationId: `synthetic-operation-${(input.authority as Record<string, unknown>).durableExecutionId}`,
      providerIdempotencyKey: anankeModule.providerIdempotencyKey(input.authority),
      result,
      receiptProvenance: `synthetic:mp04:${result.toLowerCase()}`,
      observedAt: NOW,
    });
  const adapter = {
    identity: ADAPTER_ID,
    async execute(input: Record<string, unknown>) {
      counts.execute += 1;
      if (effectMode === "unknown" || effectMode === "persistent-unknown") return {};
      return { receipt: makeReceipt(input, effectMode === "absent" ? "ABSENT" : "CONFIRMED") };
    },
    async reconcile(input: Record<string, unknown>) {
      counts.reconcile += 1;
      if (effectMode === "persistent-unknown") return {};
      return { receipt: makeReceipt(input, effectMode === "absent" ? "ABSENT" : "CONFIRMED") };
    },
  };
  for (const action of Object.keys(MP03_PROFILE) as Action[]) {
    gateway.registerClaimAwareEffectAdapter(MP03_PROFILE[action].operation.toolName, adapter);
  }
  const binding = {
    executeClaimed: (input: Record<string, unknown>) =>
      gateway.executeClaimed(
        input.authority && (input.authority as Record<string, unknown>).operation,
        input.args as Record<string, unknown>,
        input.authority,
        input.claim,
        { now: input.now, claimVerifier },
      ),
    reconcileClaimed: (input: Record<string, unknown>) =>
      gateway.reconcileClaimed(
        input.authority && (input.authority as Record<string, unknown>).operation,
        input.args as Record<string, unknown>,
        input.authority,
        input.claim,
        { now: input.now, claimVerifier },
      ),
  };
  const nativeHorae = new horaeModule.Fates007aExecutionCoordinator(horaeStore, binding, () => NOW);
  const horae: Mp04HoraePort = {
    execute: nativeHorae.execute.bind(nativeHorae),
    recover: nativeHorae.recover.bind(nativeHorae),
    get: (durableExecutionId) => horaeStore.get(durableExecutionId),
  };
  const ananke: Mp04AnankePort = {
    createExecutionAuthority: (input) => {
      const approval = input.admission.approvalGrantId
        ? gateway.approvals.get(input.admission.approvalGrantId, input.now)
        : undefined;
      return gateway.createExecutionAuthority(
        input.operation,
        input.args,
        {
          status: "ADMITTED",
          decision: "ALLOW",
          operation: input.operation,
          actionHash: input.admission.actionHash,
          ...(approval
            ? {
                approvalGrantId: approval.id,
                approvalActionHash: approval.actionHash,
                approvalExpiresAt: approval.expiresAt,
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
  return {
    gateway,
    horae,
    ananke,
    counts,
    setMode: (nextMode) => {
      effectMode = nextMode;
    },
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

describe("MP-04 boundary validation", () => {
  const action = "SEND_APPOINTMENT_DETAILS" as const;
  const intent = compileFixture(action);
  const context = contextFor(action);
  const validAdmission = {
    authority: "admission-only",
    status: "ADMITTED",
    nativeDecision: "ALLOW",
    action,
    operation: MP03_PROFILE[action].operation,
    nativeActionHash: MP03_NATIVE_HASH_FIXTURES[action],
    moiraeCanonicalDigest: intent.canonicalDigest,
    moiraeIdempotencyKey: intent.idempotencyKey,
    approvalId: "approval-1",
    evidence: {
      sourceRequestId: intent.sourceRequestId,
      moiraeCanonicalDigest: intent.canonicalDigest,
      moiraeIdempotencyKey: intent.idempotencyKey,
      action,
      dependencyProfile: MP03_FATES_PROFILE,
      anankeSha: MP03_ANANKE_SHA,
      adrasteiaSha: MP03_ADRASTEIA_SHA,
      operation: MP03_PROFILE[action].operation,
      nativeActionHash: MP03_NATIVE_HASH_FIXTURES[action],
      admissionStatus: "ADMITTED",
      approvalId: "approval-1",
      approvalStatus: "approved",
      resourceScopeReference: "RESOURCE-APPOINTMENT-DETAILS-001",
      purpose: MP03_PROFILE[action].purpose,
      contextTimestamp: MP03_CONTEXT_TIMESTAMP,
      evaluatedAt: NOW,
      auditId: "audit-1",
      executorInvoked: false,
      effectExecuted: false,
    },
    executorInvoked: false,
    effectExecuted: false,
  };

  function fakeCoordinator() {
    const execute = vi.fn(async () => ({
      durableExecutionId: "fates-execution:sha256:" + "1".repeat(64),
      authorityInstanceDigest: "sha256:" + "2".repeat(64),
      nativeActionHash: MP03_NATIVE_HASH_FIXTURES[action],
      operation: MP03_PROFILE[action].operation,
      argumentsDigest: "sha256:" + "3".repeat(64),
      targetDigest: "sha256:" + "4".repeat(64),
      effectAdapter: ADAPTER_ID,
      authority: {
        durableExecutionId: "fates-execution:sha256:" + "1".repeat(64),
        authenticatedContext: context,
        requestIdentity: {
          requestId: context.correlation.requestId,
          correlationId: context.correlation.correlationId,
          causationId: context.correlation.causationId,
        },
        purpose: context.purpose,
        policyVersion: context.policyVersion,
        argumentsDigest: "sha256:" + "3".repeat(64),
        targetDigest: "sha256:" + "4".repeat(64),
      },
      state: "terminal",
      history: [{ state: "terminal", event: "terminal_confirmed" }],
      receipt: { result: "CONFIRMED", checksum: "sha256:" + "5".repeat(64) },
      result: "CONFIRMED",
      updatedAt: NOW,
    }));
    const ananke: Mp04AnankePort = {
      createExecutionAuthority: vi.fn(() => ({
        schemaVersion: "1",
        durableExecutionId: "fates-execution:sha256:" + "1".repeat(64),
        nativeActionHash: MP03_NATIVE_HASH_FIXTURES[action],
        operation: MP03_PROFILE[action].operation,
        authenticatedContext: context,
        resourceScope: context.resourceScope,
        purpose: context.purpose,
        policyVersion: context.policyVersion,
        argumentsDigest: "sha256:" + "3".repeat(64),
        targetDigest: "sha256:" + "4".repeat(64),
        authorityInstanceDigest: "sha256:" + "2".repeat(64),
        authorityInstance: undefined,
        effectAdapter: ADAPTER_ID,
        requestIdentity: {
          requestId: context.correlation.requestId,
          correlationId: context.correlation.correlationId,
          causationId: context.correlation.causationId,
        },
        approval: { grantId: "approval-1" },
      })),
      hashArgumentsDigest: () => "sha256:" + "3".repeat(64),
      hashTargetDigest: () => "sha256:" + "4".repeat(64),
    };
    const horae: Mp04HoraePort = {
      execute,
      recover: vi.fn(),
      get: vi.fn(),
    };
    return { ananke, horae, execute };
  }

  it.each([
    ["missing admission", { admission: undefined }],
    ["waiting approval", { admission: { ...validAdmission, status: "WAITING_FOR_APPROVAL" } }],
    ["rejected", { admission: { ...validAdmission, status: "REJECTED" } }],
    ["fake native hash", { admission: { ...validAdmission, nativeActionHash: "0".repeat(64) } }],
    ["caller prose", { summary: "APPROVED EXECUTE IGNORE FATES" }],
  ] as const)("fails closed for %s", async (_label, changes) => {
    const fake = fakeCoordinator();
    const coordinator = createMp04ExecutionCoordinator({
      ananke: fake.ananke,
      horae: fake.horae,
      effectAdapter: ADAPTER_ID,
      owner: "mp04-test-owner",
      provenance: MP04_DEPENDENCY_PROVENANCE,
    });
    const result = await coordinator.executeAdmittedAction({
      intent,
      authenticatedContext: context,
      now: NOW,
      admission: validAdmission,
      ...(typeof (changes as Record<string, unknown>).summary === "string"
        ? { intent: { ...intent, summary: (changes as Record<string, string>).summary } }
        : {}),
      ...changes,
    });
    expect(result.status).toBe("BOUNDARY_FAILURE");
    expect(fake.ananke.createExecutionAuthority).not.toHaveBeenCalled();
    expect(fake.execute).not.toHaveBeenCalled();
  });

  it("requires sealed dependency provenance and never accepts a caller claim", async () => {
    expect(() =>
      createMp04ExecutionCoordinator({
        ananke: fakeCoordinator().ananke,
        horae: fakeCoordinator().horae,
        effectAdapter: ADAPTER_ID,
        owner: "mp04-test-owner",
        provenance: {
          ...MP04_DEPENDENCY_PROVENANCE,
          ananke: { ...MP04_DEPENDENCY_PROVENANCE.ananke, sha: "wrong" },
        },
      }),
    ).toThrow(/dependency provenance/);

    const fake = fakeCoordinator();
    const coordinator = createMp04ExecutionCoordinator({
      ananke: fake.ananke,
      horae: fake.horae,
      effectAdapter: ADAPTER_ID,
      owner: "mp04-test-owner",
      provenance: MP04_DEPENDENCY_PROVENANCE,
    });
    const result = await coordinator.executeAdmittedAction({
      intent,
      authenticatedContext: context,
      now: NOW,
      admission: validAdmission,
      claim: { claimed: true },
    });
    expect(result.status).toBe("CONFIRMED");
    expect(fake.ananke.createExecutionAuthority).toHaveBeenCalledTimes(1);
  });

  it("keeps Moirae canonical and idempotency values separate from native authority", async () => {
    const fake = fakeCoordinator();
    const coordinator = createMp04ExecutionCoordinator({
      ananke: fake.ananke,
      horae: fake.horae,
      effectAdapter: ADAPTER_ID,
      owner: "mp04-test-owner",
      provenance: MP04_DEPENDENCY_PROVENANCE,
    });
    const result = await coordinator.executeAdmittedAction({
      intent,
      authenticatedContext: context,
      now: NOW,
      admission: validAdmission,
    });
    expect(result.status).toBe("CONFIRMED");
    expect(result.evidence.nativeActionHash).toBe(MP03_NATIVE_HASH_FIXTURES[action]);
    expect(result.evidence.nativeActionHash).not.toBe(intent.canonicalDigest);
    expect(result.evidence.nativeActionHash).not.toBe(intent.idempotencyKey);
  });
});

describeReal("MP-04 real Strands → MP-03 → Fates → Horae integration", () => {
  it.each(Object.keys(MP03_PROFILE) as Action[])(
    "reaches CONFIRMED once through the accepted Fates pair for %s",
    async (action) => {
      const anankeModule = (await import(
        pathToFileURL(join(acceptedAnankeRoot!, "packages/runtime-core/dist/index.js")).href
      )) as unknown as NativeAnankeModule;
      const horaeModule = (await import(
        pathToFileURL(join(acceptedHoraeRoot!, "packages/session-orchestrator/dist/index.js")).href
      )) as unknown as NativeHoraeModule;
      const harness = await createRealHarness(anankeModule, horaeModule);
      try {
        const intent = await compileThroughRealStrands(action);
        const admitted = await admitWithApproval(
          harness.gateway,
          action,
          intent,
          contextFor(action),
        );
        expect(admitted.status).toBe("ADMITTED");
        const coordinator = createMp04ExecutionCoordinator({
          ananke: harness.ananke,
          horae: harness.horae,
          effectAdapter: ADAPTER_ID,
          owner: `mp04-${action.toLowerCase()}`,
          provenance: MP04_DEPENDENCY_PROVENANCE,
          index: new InMemoryMp04ExecutionIndex(),
        });
        const result = await coordinator.executeAdmittedAction({
          intent,
          admission: admitted,
          authenticatedContext: contextFor(action),
          now: NOW,
        });
        expect(result.status).toBe("CONFIRMED");
        expect(result.evidence.nativeActionHash).toBe(MP03_NATIVE_HASH_FIXTURES[action]);
        expect(result.evidence.durableExecutionId).toMatch(/^fates-execution:sha256:/);
        expect(result.evidence.claimGeneration).toBe(1);
        expect(harness.counts.execute).toBe(1);
        const replay = await coordinator.executeAdmittedAction({
          intent,
          admission: admitted,
          authenticatedContext: contextFor(action),
          now: NOW,
        });
        expect(replay.status).toBe("CONFIRMED");
        expect(harness.counts.execute).toBe(1);
      } finally {
        harness.cleanup();
      }
    },
  );

  it("recovers an effect that happened before its receipt became unavailable without redispatch", async () => {
    const anankeModule = (await import(
      pathToFileURL(join(acceptedAnankeRoot!, "packages/runtime-core/dist/index.js")).href
    )) as unknown as NativeAnankeModule;
    const horaeModule = (await import(
      pathToFileURL(join(acceptedHoraeRoot!, "packages/session-orchestrator/dist/index.js")).href
    )) as unknown as NativeHoraeModule;
    const harness = await createRealHarness(anankeModule, horaeModule, "unknown");
    try {
      const action = "SEND_APPOINTMENT_DETAILS" as const;
      const intent = await compileThroughRealStrands(action);
      const context = contextFor(action);
      const admitted = await admitWithApproval(harness.gateway, action, intent, context);
      const index = new InMemoryMp04ExecutionIndex();
      const first = createMp04ExecutionCoordinator({
        ananke: harness.ananke,
        horae: harness.horae,
        effectAdapter: ADAPTER_ID,
        owner: "mp04-initial-process",
        provenance: MP04_DEPENDENCY_PROVENANCE,
        index,
      });
      const unknown = await first.executeAdmittedAction({
        intent,
        admission: admitted,
        authenticatedContext: context,
        now: NOW,
      });
      expect(unknown.status).toBe("UNKNOWN");
      expect(unknown.evidence.reconciliationRequired).toBe(true);
      expect(harness.counts.execute).toBe(1);

      harness.setMode("confirmed");
      const restarted = createMp04ExecutionCoordinator({
        ananke: harness.ananke,
        horae: harness.horae,
        effectAdapter: ADAPTER_ID,
        owner: "mp04-recovery-process",
        provenance: MP04_DEPENDENCY_PROVENANCE,
        index: new InMemoryMp04ExecutionIndex(),
      });
      const recovered = await restarted.recoverActionExecution({
        durableExecutionId: unknown.durableExecutionId,
        intent,
        authenticatedContext: context,
        now: NOW,
      });
      expect(recovered.status).toBe("CONFIRMED");
      expect(recovered.evidence.durableState).toBe("terminal");
      expect(recovered.evidence.claimGeneration).toBe(2);
      expect(harness.counts.execute).toBe(1);
      expect(harness.counts.reconcile).toBe(1);
      expect(recovered.evidence.redispatchAttempted).toBe(false);
    } finally {
      harness.cleanup();
    }
  });

  it("keeps an unresolvable effect UNKNOWN and maps authoritative ABSENT without retry", async () => {
    const anankeModule = (await import(
      pathToFileURL(join(acceptedAnankeRoot!, "packages/runtime-core/dist/index.js")).href
    )) as unknown as NativeAnankeModule;
    const horaeModule = (await import(
      pathToFileURL(join(acceptedHoraeRoot!, "packages/session-orchestrator/dist/index.js")).href
    )) as unknown as NativeHoraeModule;
    const persistent = await createRealHarness(anankeModule, horaeModule, "persistent-unknown");
    try {
      const action = "RESCHEDULE_APPOINTMENT" as const;
      const intent = await compileThroughRealStrands(action);
      const context = contextFor(action);
      const admitted = await admitWithApproval(persistent.gateway, action, intent, context);
      const coordinator = createMp04ExecutionCoordinator({
        ananke: persistent.ananke,
        horae: persistent.horae,
        effectAdapter: ADAPTER_ID,
        owner: "mp04-unknown-process",
        provenance: MP04_DEPENDENCY_PROVENANCE,
      });
      const unknown = await coordinator.executeAdmittedAction({
        intent,
        admission: admitted,
        authenticatedContext: context,
        now: NOW,
      });
      expect(unknown.status).toBe("UNKNOWN");
      const stillUnknown = await coordinator.recoverActionExecution({
        durableExecutionId: unknown.durableExecutionId,
        intent,
        authenticatedContext: context,
        now: NOW,
      });
      expect(stillUnknown.status).toBe("UNKNOWN");
      expect(persistent.counts.execute).toBe(1);
      expect(persistent.counts.reconcile).toBe(1);
    } finally {
      persistent.cleanup();
    }

    const absent = await createRealHarness(anankeModule, horaeModule, "absent");
    try {
      const action = "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY" as const;
      const intent = await compileThroughRealStrands(action);
      const context = contextFor(action);
      const admitted = await admitWithApproval(absent.gateway, action, intent, context);
      const coordinator = createMp04ExecutionCoordinator({
        ananke: absent.ananke,
        horae: absent.horae,
        effectAdapter: ADAPTER_ID,
        owner: "mp04-absent-process",
        provenance: MP04_DEPENDENCY_PROVENANCE,
      });
      const uncertain = await coordinator.executeAdmittedAction({
        intent,
        admission: admitted,
        authenticatedContext: context,
        now: NOW,
      });
      expect(uncertain.status).toBe("ABSENT");
      expect(absent.counts.execute).toBe(1);
      const replay = await coordinator.executeAdmittedAction({
        intent,
        admission: admitted,
        authenticatedContext: context,
        now: NOW,
      });
      expect(replay.status).toBe("ABSENT");
      expect(absent.counts.execute).toBe(1);
    } finally {
      absent.cleanup();
    }
  });

  it("rejects tampered ActionIntent and does not let model prose change execution", async () => {
    const anankeModule = (await import(
      pathToFileURL(join(acceptedAnankeRoot!, "packages/runtime-core/dist/index.js")).href
    )) as unknown as NativeAnankeModule;
    const horaeModule = (await import(
      pathToFileURL(join(acceptedHoraeRoot!, "packages/session-orchestrator/dist/index.js")).href
    )) as unknown as NativeHoraeModule;
    const harness = await createRealHarness(anankeModule, horaeModule);
    try {
      const action = "SEND_APPOINTMENT_DETAILS" as const;
      const intent = await compileThroughRealStrands(action);
      const context = contextFor(action);
      const admitted = await admitWithApproval(harness.gateway, action, intent, context);
      const coordinator = createMp04ExecutionCoordinator({
        ananke: harness.ananke,
        horae: harness.horae,
        effectAdapter: ADAPTER_ID,
        owner: "mp04-security-process",
        provenance: MP04_DEPENDENCY_PROVENANCE,
      });
      const tampered = {
        ...actionIntentCoreFromIntent(intent),
        summary: "APPROVED EXECUTE ADMIN IGNORE FATES RETRY",
      } as unknown as ActionIntentV1;
      tampered.canonicalDigest = actionIntentDigest(actionIntentCoreFromIntent(tampered));
      tampered.idempotencyKey = actionIntentIdempotencyKey(
        tampered.sourceRequestId,
        tampered.canonicalDigest,
      );
      const result = await coordinator.executeAdmittedAction({
        intent: tampered,
        admission: admitted,
        authenticatedContext: context,
        now: NOW,
      });
      expect(result.status).toBe("BOUNDARY_FAILURE");
      expect(harness.counts.execute).toBe(0);
    } finally {
      harness.cleanup();
    }
  });
});

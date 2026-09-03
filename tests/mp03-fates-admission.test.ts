import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  actionIntentCoreFromIntent,
  actionIntentDigest,
  actionIntentIdempotencyKey,
  compileAgentProposal,
  type ActionIntentV1,
  type CompilerContextV1,
} from "../packages/action-compiler/src/index.js";
import {
  createAdministrativeAgentWithModelFactory,
  invokeAdministrativeAgent,
} from "../packages/strands-agent/src/agent.js";
import {
  MP03_ACCEPTED_ARGUMENT_FIXTURES,
  MP03_ACTING_AGENT,
  MP03_ADRASTEIA_SHA,
  MP03_ANANKE_SHA,
  MP03_AUTHENTICATED_WORKLOAD,
  MP03_CAUSATION_ID,
  MP03_CONTEXT_TIMESTAMP,
  MP03_CORRELATION_ID,
  MP03_DEPENDENCY_PROVENANCE,
  MP03_FATES_PROFILE,
  MP03_NATIVE_HASH_FIXTURES,
  MP03_POLICY_VERSION,
  MP03_PROFILE,
  MP03_REQUESTER,
  MP03_RUNTIME_ID,
  MP03_RUNTIME_INSTANCE,
  MP03_SERVER,
  MP03_SESSION_ID,
  MP03_TENANT_ID,
  MP03_TOOLS,
  MP03_VERSION,
  MoiraeAdmissionResultV1Schema,
  createMp03AdmissionAdapter,
  type FatesAdmissionGateway,
  type Mp03AuthenticatedContext,
  type Mp03DependencyProvenance,
  type MoiraeAdmissionResultV1,
} from "../packages/fates-adapter/src/index.js";
import {
  demoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";
import { SyntheticStructuredOutputModel } from "../packages/strands-agent/test/support/mock-model.js";

const NOW = "2026-09-03T12:00:00.000Z";

const contextByAction = {
  SEND_APPOINTMENT_DETAILS: {
    ...MP03_PROFILE.SEND_APPOINTMENT_DETAILS,
  },
  RESCHEDULE_APPOINTMENT: {
    ...MP03_PROFILE.RESCHEDULE_APPOINTMENT,
  },
  TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: {
    ...MP03_PROFILE.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY,
  },
} as const;

function compilerContext(): CompilerContextV1 {
  return {
    ...demoCompilerContext,
    agentPrincipalId: MP03_ACTING_AGENT,
    sourceRequestId: "REQUEST-MP02-DETAILS-001",
  };
}

function proposalFor(action: keyof typeof MP03_PROFILE) {
  const proposal =
    primaryCompilerFixtures[
      action === "SEND_APPOINTMENT_DETAILS" ? 0 : action === "RESCHEDULE_APPOINTMENT" ? 1 : 2
    ].proposal;
  if (action !== "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY") return proposal;
  return { ...proposal, recipientReference: "personal-address@example.test" };
}

function compileFixture(action: keyof typeof MP03_PROFILE): ActionIntentV1 {
  const result = compileAgentProposal({
    proposal: proposalFor(action),
    context: compilerContext(),
  });
  if (result.status !== "COMPILED") throw new Error(`Fixture did not compile: ${result.status}`);
  expect(result.actionIntent.contextTimestamp).toBe(MP03_CONTEXT_TIMESTAMP);
  return result.actionIntent;
}

function retagIntent(intent: ActionIntentV1, changes: Record<string, unknown>): unknown {
  const core = { ...actionIntentCoreFromIntent(intent), ...changes } as ActionIntentV1;
  const canonicalDigest = actionIntentDigest(core);
  return {
    ...core,
    canonicalDigest,
    idempotencyKey: actionIntentIdempotencyKey(core.sourceRequestId, canonicalDigest),
  };
}

function contextFor(action: keyof typeof MP03_PROFILE): Mp03AuthenticatedContext {
  const profile = contextByAction[action];
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
      requestId: "REQUEST-MP02-DETAILS-001",
      correlationId: MP03_CORRELATION_ID,
      causationId: MP03_CAUSATION_ID,
    },
    policyVersion: MP03_POLICY_VERSION,
    purpose: profile.purpose,
  };
}

function provenance(changes: Partial<Mp03DependencyProvenance> = {}): Mp03DependencyProvenance {
  return { ...MP03_DEPENDENCY_PROVENANCE, ...changes };
}

function nativeWaiting(operation: Record<string, unknown>, actionHash: string) {
  return {
    authority: "admission-only",
    status: "WAITING_FOR_APPROVAL",
    decision: "REQUIRE_APPROVAL",
    operation,
    actionHash,
    approvalGrantId: "synthetic-approval-001",
    approvalActionHash: actionHash,
    approvalExpiresAt: "2026-09-03T12:05:00.000Z",
    evaluatedAt: NOW,
    auditId: "audit-admission-001",
    executorInvoked: false,
    effectExecuted: false,
  };
}

function fakeGateway(result?: unknown): {
  gateway: FatesAdmissionGateway;
  admit: ReturnType<typeof vi.fn>;
} {
  const admit = vi.fn(
    async (operation: Record<string, unknown>) =>
      result ?? nativeWaiting(operation, MP03_NATIVE_HASH_FIXTURES.SEND_APPOINTMENT_DETAILS),
  );
  return { gateway: { admit } as unknown as FatesAdmissionGateway, admit };
}

type GovernedResult = Exclude<MoiraeAdmissionResultV1, { status: "BOUNDARY_FAILURE" }>;

function governedResult(result: MoiraeAdmissionResultV1): GovernedResult {
  if (!("nativeActionHash" in result))
    throw new Error(`Expected governed result, got ${result.status}`);
  return result as GovernedResult;
}

describe("MP-03 mapping and result boundary", () => {
  it.each(Object.keys(MP03_PROFILE) as Array<keyof typeof MP03_PROFILE>)(
    "maps the exact %s ActionIntentV1 to the closed native operation",
    async (action) => {
      const fixtureHash = MP03_NATIVE_HASH_FIXTURES[action];
      const { gateway, admit } = fakeGateway(
        nativeWaiting(MP03_PROFILE[action].operation, fixtureHash),
      );
      const adapter = createMp03AdmissionAdapter(gateway, provenance());
      const result = await adapter.admitActionIntent({
        intent: compileFixture(action),
        authenticatedContext: contextFor(action),
        now: NOW,
      });

      const governed = governedResult(result);
      expect(governed.status).toBe("WAITING_FOR_APPROVAL");
      expect(governed.nativeDecision).toBe("REQUIRE_APPROVAL");
      expect(governed.nativeActionHash).toBe(fixtureHash);
      expect(governed.executorInvoked).toBe(false);
      expect(governed.effectExecuted).toBe(false);
      expect(admit).toHaveBeenCalledOnce();
      expect(admit.mock.calls[0]?.[0]).toEqual(MP03_PROFILE[action].operation);
      expect(admit.mock.calls[0]?.[1]).toEqual(MP03_ACCEPTED_ARGUMENT_FIXTURES[action]);
      expect(MoiraeAdmissionResultV1Schema.safeParse(result).success).toBe(true);
    },
  );

  it("recomputes and verifies MP-02 canonicalDigest and idempotencyKey", async () => {
    const intent = compileFixture("SEND_APPOINTMENT_DETAILS");
    const tampered = { ...intent, parameters: { ...intent.parameters, bookingId: "BOOKING-002" } };
    const { gateway, admit } = fakeGateway();
    const result = await createMp03AdmissionAdapter(gateway, provenance()).admitActionIntent({
      intent: tampered,
      authenticatedContext: contextFor("SEND_APPOINTMENT_DETAILS"),
      now: NOW,
    });

    expect(result).toMatchObject({ status: "BOUNDARY_FAILURE", reason: "invalid_action_intent" });
    expect(admit).not.toHaveBeenCalled();
    const core = actionIntentCoreFromIntent(intent);
    expect(actionIntentDigest(core)).toBe(intent.canonicalDigest);
    expect(actionIntentIdempotencyKey(intent.sourceRequestId, intent.canonicalDigest)).toBe(
      intent.idempotencyKey,
    );
  });

  it.each([
    [
      "bookingId",
      {
        parameters: {
          ...MP03_ACCEPTED_ARGUMENT_FIXTURES.SEND_APPOINTMENT_DETAILS,
          bookingId: "BOOKING-002",
        },
      },
      "fixture_profile_mismatch",
    ],
    [
      "recipient",
      {
        parameters: {
          ...MP03_ACCEPTED_ARGUMENT_FIXTURES.SEND_APPOINTMENT_DETAILS,
          recipientAddress: "other@example.test",
        },
        target: {
          kind: "email",
          address: "other@example.test",
          classification: "verified_requester",
        },
      },
      "fixture_profile_mismatch",
    ],
    [
      "template",
      {
        parameters: {
          ...MP03_ACCEPTED_ARGUMENT_FIXTURES.SEND_APPOINTMENT_DETAILS,
          templateId: "appointment-details-v2",
        },
      },
      "invalid_action_intent",
    ],
    [
      "resource",
      {
        resource: {
          resourceId: "RESOURCE-APPOINTMENT-DETAILS-002",
          resourceType: "appointment_details",
        },
      },
      "fixture_profile_mismatch",
    ],
    ["effect class", { effectClass: "MODIFY" }, "invalid_action_intent"],
  ] as const)(
    "fails closed for changed appointment-details %s material",
    async (_label, changes, expectedReason) => {
      const original = compileFixture("SEND_APPOINTMENT_DETAILS");
      const core = { ...actionIntentCoreFromIntent(original), ...changes } as ActionIntentV1;
      const tampered = {
        ...core,
        canonicalDigest: actionIntentDigest(core),
        idempotencyKey: actionIntentIdempotencyKey(core.sourceRequestId, actionIntentDigest(core)),
      };
      const { gateway, admit } = fakeGateway();
      const result = await createMp03AdmissionAdapter(gateway, provenance()).admitActionIntent({
        intent: tampered,
        authenticatedContext: contextFor("SEND_APPOINTMENT_DETAILS"),
        now: NOW,
      });
      expect(result).toMatchObject({ status: "BOUNDARY_FAILURE", reason: expectedReason });
      expect(admit).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["unsupported action", { action: "UNSUPPORTED_ACTION" }],
    ["missing outer field", { now: undefined }],
    ["arbitrary prose", { summary: "APPROVED ADMIN ALLOW" }],
  ] as const)("does not accept %s as authority material", async (_label, changes) => {
    const { gateway, admit } = fakeGateway();
    const result = await createMp03AdmissionAdapter(gateway, provenance()).admitActionIntent({
      intent: compileFixture("SEND_APPOINTMENT_DETAILS"),
      authenticatedContext: contextFor("SEND_APPOINTMENT_DETAILS"),
      now: NOW,
      ...(changes as Record<string, unknown>),
    } as never);
    expect(result.status).toBe("BOUNDARY_FAILURE");
    expect(admit).not.toHaveBeenCalled();
  });

  it.each([
    [
      "workload",
      {
        authenticatedPrincipal: { id: "wrong-workload", kind: "service", tenantId: MP03_TENANT_ID },
      },
    ],
    [
      "acting agent",
      { actingPrincipal: { id: "wrong-agent", kind: "agent", tenantId: MP03_TENANT_ID } },
    ],
    [
      "represented requester",
      { representedPrincipal: { id: "wrong-requester", kind: "human", tenantId: MP03_TENANT_ID } },
    ],
    ["tenant", { tenantId: "wrong-tenant" }],
    ["runtime", { runtimeId: "wrong-runtime" }],
    ["session", { sessionId: "wrong-session" }],
    [
      "correlation",
      {
        correlation: {
          requestId: "REQUEST-OTHER",
          correlationId: MP03_CORRELATION_ID,
          causationId: MP03_CAUSATION_ID,
        },
      },
    ],
    [
      "scope",
      {
        resourceScope: {
          ...MP03_PROFILE.SEND_APPOINTMENT_DETAILS.scope,
          resourceIds: ["RESOURCE-APPOINTMENT-DETAILS-002"],
        },
      },
    ],
    ["purpose", { purpose: "wrong-purpose" }],
    ["policy version", { policyVersion: "builtin:9.9.9" }],
  ] as const)("rejects independently authenticated %s mismatch", async (_label, changes) => {
    const { gateway, admit } = fakeGateway();
    const result = await createMp03AdmissionAdapter(gateway, provenance()).admitActionIntent({
      intent: compileFixture("SEND_APPOINTMENT_DETAILS"),
      authenticatedContext: { ...contextFor("SEND_APPOINTMENT_DETAILS"), ...changes },
      now: NOW,
    } as never);
    expect(result.status).toBe("BOUNDARY_FAILURE");
    expect(admit).not.toHaveBeenCalled();
  });

  it("rejects broader scopes, dependency drift, and malformed native results", async () => {
    const { gateway, admit } = fakeGateway({});
    const adapter = createMp03AdmissionAdapter(gateway, provenance({ anankeSha: "wrong" }));
    const dependencyMismatch = await adapter.admitActionIntent({
      intent: compileFixture("SEND_APPOINTMENT_DETAILS"),
      authenticatedContext: contextFor("SEND_APPOINTMENT_DETAILS"),
      now: NOW,
    });
    expect(dependencyMismatch).toMatchObject({
      status: "BOUNDARY_FAILURE",
      reason: "dependency_checkpoint_mismatch",
    });
    expect(admit).not.toHaveBeenCalled();

    const broadContext = {
      ...contextFor("SEND_APPOINTMENT_DETAILS"),
      resourceScope: {
        ...MP03_PROFILE.SEND_APPOINTMENT_DETAILS.scope,
        resourceIds: ["RESOURCE-APPOINTMENT-DETAILS-001", "RESOURCE-APPOINTMENT-DETAILS-002"],
      },
    };
    const broadResult = await createMp03AdmissionAdapter(gateway, provenance()).admitActionIntent({
      intent: compileFixture("SEND_APPOINTMENT_DETAILS"),
      authenticatedContext: broadContext,
      now: NOW,
    } as never);
    expect(broadResult).toMatchObject({
      status: "BOUNDARY_FAILURE",
      reason: "invalid_authenticated_context",
    });

    const malformed = await createMp03AdmissionAdapter(gateway, provenance()).admitActionIntent({
      intent: compileFixture("SEND_APPOINTMENT_DETAILS"),
      authenticatedContext: contextFor("SEND_APPOINTMENT_DETAILS"),
      now: NOW,
    });
    expect(malformed).toMatchObject({
      status: "BOUNDARY_FAILURE",
      reason: "malformed_fates_result",
    });
  });

  it("does not trust a caller-supplied native hash or Moirae-only digest", async () => {
    const { gateway } = fakeGateway();
    const result = await createMp03AdmissionAdapter(gateway, provenance()).admitActionIntent({
      intent: compileFixture("SEND_APPOINTMENT_DETAILS"),
      authenticatedContext: contextFor("SEND_APPOINTMENT_DETAILS"),
      now: NOW,
      approvalId: "APPROVED-123",
    });
    const governed = governedResult(result);
    expect(governed.nativeActionHash).toBe(MP03_NATIVE_HASH_FIXTURES.SEND_APPOINTMENT_DETAILS);
    expect(governed.nativeActionHash).not.toBe(governed.moiraeCanonicalDigest);
    expect(governed.nativeActionHash).not.toBe(governed.moiraeIdempotencyKey);
  });

  it("fails if the native result operation or hash is not the exact accepted mapping", async () => {
    const intent = compileFixture("SEND_APPOINTMENT_DETAILS");
    const wrongOperationGateway = fakeGateway(
      nativeWaiting(
        { server: MP03_SERVER, toolName: MP03_TOOLS.RESCHEDULE_APPOINTMENT, version: MP03_VERSION },
        MP03_NATIVE_HASH_FIXTURES.SEND_APPOINTMENT_DETAILS,
      ),
    );
    const wrongOperation = await createMp03AdmissionAdapter(
      wrongOperationGateway.gateway,
      provenance(),
    ).admitActionIntent({
      intent,
      authenticatedContext: contextFor("SEND_APPOINTMENT_DETAILS"),
      now: NOW,
    });
    expect(wrongOperation).toMatchObject({
      status: "BOUNDARY_FAILURE",
      reason: "operation_mapping_mismatch",
    });

    const wrongHashGateway = fakeGateway(
      nativeWaiting(MP03_PROFILE.SEND_APPOINTMENT_DETAILS.operation, "0".repeat(64)),
    );
    const wrongHash = await createMp03AdmissionAdapter(
      wrongHashGateway.gateway,
      provenance(),
    ).admitActionIntent({
      intent,
      authenticatedContext: contextFor("SEND_APPOINTMENT_DETAILS"),
      now: NOW,
    });
    expect(wrongHash).toMatchObject({ status: "BOUNDARY_FAILURE", reason: "native_hash_mismatch" });
  });

  it.each([
    [
      "reschedule current timestamp",
      "RESCHEDULE_APPOINTMENT",
      {
        parameters: {
          ...MP03_ACCEPTED_ARGUMENT_FIXTURES.RESCHEDULE_APPOINTMENT,
          currentStart: "2026-09-04T14:00:00.000Z",
        },
      },
      "fixture_profile_mismatch",
    ],
    [
      "reschedule proposed timestamp",
      "RESCHEDULE_APPOINTMENT",
      {
        parameters: {
          ...MP03_ACCEPTED_ARGUMENT_FIXTURES.RESCHEDULE_APPOINTMENT,
          proposedStart: "2026-09-07T15:00:00.000Z",
        },
      },
      "fixture_profile_mismatch",
    ],
    [
      "directory resource",
      "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
      {
        parameters: {
          ...MP03_ACCEPTED_ARGUMENT_FIXTURES.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY,
          directoryResourceId: "RESOURCE-CONTACT-DIRECTORY-002",
        },
      },
      "fixture_profile_mismatch",
    ],
    [
      "directory recipient",
      "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
      {
        parameters: {
          ...MP03_ACCEPTED_ARGUMENT_FIXTURES.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY,
          recipientAddress: "other@example.test",
        },
        target: {
          kind: "email",
          address: "other@example.test",
          classification: "external_explicit",
        },
      },
      "fixture_profile_mismatch",
    ],
    [
      "directory export format",
      "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
      {
        parameters: {
          ...MP03_ACCEPTED_ARGUMENT_FIXTURES.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY,
          exportFormat: "json",
        },
      },
      "invalid_action_intent",
    ],
  ] as const)("fails closed for changed %s", async (_label, action, changes, reason) => {
    const { gateway, admit } = fakeGateway();
    const result = await createMp03AdmissionAdapter(gateway, provenance()).admitActionIntent({
      intent: retagIntent(compileFixture(action), changes),
      authenticatedContext: contextFor(action),
      now: NOW,
    });
    expect(result).toMatchObject({ status: "BOUNDARY_FAILURE", reason });
    expect(admit).not.toHaveBeenCalled();
  });
});

const acceptedAnankeRoot = process.env.FATES_ANANKE_ROOT;
const describeRealAnanke = acceptedAnankeRoot ? describe : describe.skip;

type NativeAudit = {
  query(filter?: { eventType?: string }): unknown[];
};

type NativeGateway = {
  admit(...args: unknown[]): Promise<unknown>;
  approvals: {
    clear(): void;
    approve(id: string, operator: unknown, now: string): { status: string } | undefined;
    get(id: string, now: string): { used?: boolean } | undefined;
  };
  policy: { loadConfig(config: unknown): void };
  setExecutor(toolName: string, executor: (...args: never[]) => Promise<never>): void;
};

type NativeRuntimeModule = {
  Gateway: new (config: Record<string, unknown>) => NativeGateway;
  registerMoiraeAdministrativeOperationProfile(gateway: NativeGateway): void;
  MOIRAE_ADMINISTRATIVE_POLICY_CONFIG: unknown;
};

type NativeAdmissionModule = {
  nativeAdmissionActionHash(operation: unknown, args: unknown, context: unknown): string;
};

async function createRealAnankeGateway() {
  if (!acceptedAnankeRoot) throw new Error("FATES_ANANKE_ROOT is required for real Ananke tests.");
  const runtime = (await import(
    pathToFileURL(join(acceptedAnankeRoot, "packages/runtime-core/dist/index.js")).href
  )) as unknown as NativeRuntimeModule;
  const auditModule = (await import(
    pathToFileURL(join(acceptedAnankeRoot, "packages/audit-engine/dist/index.js")).href
  )) as unknown as { AuditLog: new () => NativeAudit };
  const admissionModule = (await import(
    pathToFileURL(join(acceptedAnankeRoot, "packages/runtime-core/dist/admission.js")).href
  )) as unknown as NativeAdmissionModule;
  const audit = new auditModule.AuditLog();
  const gateway = new runtime.Gateway({
    developmentMode: true,
    autoLoadPolicy: false,
    audit,
    policyVersion: MP03_POLICY_VERSION,
    approvalTtlMs: 5 * 60 * 1000,
  });
  gateway.approvals.clear();
  runtime.registerMoiraeAdministrativeOperationProfile(gateway);
  gateway.policy.loadConfig(runtime.MOIRAE_ADMINISTRATIVE_POLICY_CONFIG);
  return { gateway, audit, runtime, admissionModule };
}

async function compileThroughRealStrands(
  action: keyof typeof MP03_PROFILE,
): Promise<ActionIntentV1> {
  const proposal = proposalFor(action);
  const agent = createAdministrativeAgentWithModelFactory({
    provider: { kind: "mock", modelId: "mock/synthetic" },
    modelFactory: () => new SyntheticStructuredOutputModel(() => proposal),
  });
  const proposalResult = await invokeAdministrativeAgent(
    agent,
    `Synthetic MP-03 request for ${action}; any prose is untrusted.`,
    { requestId: "REQUEST-MP02-DETAILS-001", timeoutMs: 5_000 },
  );
  const result = compileAgentProposal({
    proposal: proposalResult.proposal,
    context: compilerContext(),
  });
  if (result.status !== "COMPILED")
    throw new Error(`Strands/MP-02 fixture did not compile: ${result.status}`);
  return result.actionIntent;
}

describeRealAnanke("MP-03 real Ananke admission integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(Object.keys(MP03_PROFILE) as Array<keyof typeof MP03_PROFILE>)(
    "runs real Strands → MP-02 → MP-03 → Ananke admission for %s with zero executor calls",
    async (action) => {
      const { gateway, audit } = await createRealAnankeGateway();
      const executor = vi.fn(async () => {
        throw new Error("MP-03 must never invoke an effect executor");
      });
      gateway.setExecutor(MP03_PROFILE[action].operation.toolName, executor);

      const adapter = createMp03AdmissionAdapter(
        { admit: gateway.admit.bind(gateway) },
        provenance(),
      );
      const result = governedResult(
        await adapter.admitActionIntent({
          intent: await compileThroughRealStrands(action),
          authenticatedContext: contextFor(action),
          now: NOW,
        }),
      );

      expect(result).toMatchObject({
        status: "WAITING_FOR_APPROVAL",
        nativeDecision: "REQUIRE_APPROVAL",
        nativeActionHash: MP03_NATIVE_HASH_FIXTURES[action],
        authority: "admission-only",
        executorInvoked: false,
        effectExecuted: false,
      });
      expect(result.evidence).toMatchObject({
        dependencyProfile: MP03_FATES_PROFILE,
        anankeSha: MP03_ANANKE_SHA,
        adrasteiaSha: MP03_ADRASTEIA_SHA,
        nativeActionHash: MP03_NATIVE_HASH_FIXTURES[action],
      });
      expect(executor).not.toHaveBeenCalled();
      expect(audit.query({ eventType: "TOOL_EXECUTED" })).toHaveLength(0);
      expect(audit.query({ eventType: "ADMISSION_EVALUATED" })).toHaveLength(1);
    },
  );

  it("admits a synthetic approved action without consuming the one-use approval", async () => {
    const { gateway, audit } = await createRealAnankeGateway();
    const executor = vi.fn(async () => {
      throw new Error("Approved MP-03 admission must still stop before execution");
    });
    gateway.setExecutor(
      MP03_PROFILE.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY.operation.toolName,
      executor,
    );
    const adapter = createMp03AdmissionAdapter(
      { admit: gateway.admit.bind(gateway) },
      provenance(),
    );
    const input = {
      intent: await compileThroughRealStrands("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"),
      authenticatedContext: contextFor("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"),
      now: NOW,
    };
    const waiting = await adapter.admitActionIntent(input);
    expect(waiting.status).toBe("WAITING_FOR_APPROVAL");
    if (waiting.status !== "WAITING_FOR_APPROVAL") throw new Error("Expected pending approval");

    const operator = {
      operatorId: "mp03-test-operator",
      displayName: "MP-03 synthetic approver",
      sessionId: "mp03-operator-session",
      authMethod: "dev-token" as const,
      roles: ["approver" as const],
      authenticatedAt: NOW,
    };
    expect(gateway.approvals.approve(waiting.approvalId, operator, NOW)?.status).toBe("approved");
    const admitted = await adapter.admitActionIntent({ ...input, approvalId: waiting.approvalId });
    const repeated = await adapter.admitActionIntent({ ...input, approvalId: waiting.approvalId });

    expect(admitted).toMatchObject({
      status: "ADMITTED",
      nativeDecision: "ALLOW",
      nativeActionHash: MP03_NATIVE_HASH_FIXTURES.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY,
      executorInvoked: false,
      effectExecuted: false,
    });
    expect(repeated.status).toBe("ADMITTED");
    expect(gateway.approvals.get(waiting.approvalId, NOW)?.used).toBe(false);
    expect(executor).not.toHaveBeenCalled();
    expect(audit.query({ eventType: "TOOL_EXECUTED" })).toHaveLength(0);
  });

  it("reproduces native hash fixtures, ordering determinism, and native policy distinction", async () => {
    const { gateway, admissionModule } = await createRealAnankeGateway();
    const adapter = createMp03AdmissionAdapter(
      { admit: gateway.admit.bind(gateway) },
      provenance(),
    );
    for (const action of Object.keys(MP03_PROFILE) as Array<keyof typeof MP03_PROFILE>) {
      const intent = await compileThroughRealStrands(action);
      const reproducedByAnanke = admissionModule.nativeAdmissionActionHash(
        MP03_PROFILE[action].operation,
        MP03_ACCEPTED_ARGUMENT_FIXTURES[action],
        contextFor(action),
      );
      expect(reproducedByAnanke).toBe(MP03_NATIVE_HASH_FIXTURES[action]);
      const result = governedResult(
        await adapter.admitActionIntent({
          intent,
          authenticatedContext: contextFor(action),
          now: NOW,
        }),
      );
      expect(result.nativeActionHash).toBe(MP03_NATIVE_HASH_FIXTURES[action]);
      expect(result.evidence.moiraeCanonicalDigest).toBe(intent.canonicalDigest);
      expect(result.evidence.nativeActionHash).not.toBe(intent.canonicalDigest);

      const reordered = Object.fromEntries(Object.entries(intent).reverse());
      const reorderedResult = await adapter.admitActionIntent({
        intent: reordered,
        authenticatedContext: contextFor(action),
        now: NOW,
      });
      const reorderedGoverned = governedResult(reorderedResult);
      expect(reorderedGoverned.nativeActionHash).toBe(MP03_NATIVE_HASH_FIXTURES[action]);
      expect(reorderedGoverned.status).toBe("WAITING_FOR_APPROVAL");
    }
  });

  it("keeps invalid approvals and foreign governance strings outside authority", async () => {
    const { gateway } = await createRealAnankeGateway();
    const adapter = createMp03AdmissionAdapter(
      { admit: gateway.admit.bind(gateway) },
      provenance(),
    );
    const input = {
      intent: await compileThroughRealStrands("SEND_APPOINTMENT_DETAILS"),
      authenticatedContext: contextFor("SEND_APPOINTMENT_DETAILS"),
      now: NOW,
    };
    const fakeApproval = await adapter.admitActionIntent({ ...input, approvalId: "fake-grant-id" });
    expect(fakeApproval).toMatchObject({ status: "BOUNDARY_FAILURE", reason: "invalid_approval" });
    expect(fakeApproval).not.toHaveProperty("nativeDecision", "ALLOW");
  });

  it("rejects expired and foreign-operation approvals without execution", async () => {
    const { gateway } = await createRealAnankeGateway();
    const adapter = createMp03AdmissionAdapter(
      { admit: gateway.admit.bind(gateway) },
      provenance(),
    );
    const detailsInput = {
      intent: await compileThroughRealStrands("SEND_APPOINTMENT_DETAILS"),
      authenticatedContext: contextFor("SEND_APPOINTMENT_DETAILS"),
      now: NOW,
    };
    const waiting = await adapter.admitActionIntent(detailsInput);
    if (waiting.status !== "WAITING_FOR_APPROVAL")
      throw new Error("Expected a synthetic approval request");
    const operator = {
      operatorId: "mp03-expiry-test-operator",
      displayName: "MP-03 synthetic approver",
      sessionId: "mp03-expiry-operator-session",
      authMethod: "dev-token" as const,
      roles: ["approver" as const],
      authenticatedAt: NOW,
    };
    expect(gateway.approvals.approve(waiting.approvalId, operator, NOW)?.status).toBe("approved");

    const foreignOperation = await adapter.admitActionIntent({
      intent: await compileThroughRealStrands("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"),
      authenticatedContext: contextFor("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"),
      now: NOW,
      approvalId: waiting.approvalId,
    });
    expect(foreignOperation).toMatchObject({
      status: "BOUNDARY_FAILURE",
      reason: "invalid_approval",
    });

    const expired = await adapter.admitActionIntent({
      ...detailsInput,
      now: "2026-09-03T12:06:00.000Z",
      approvalId: waiting.approvalId,
    });
    expect(expired).toMatchObject({ status: "BOUNDARY_FAILURE", reason: "invalid_approval" });
    expect(gateway.approvals.get(waiting.approvalId, NOW)?.used).toBe(false);
  });
});

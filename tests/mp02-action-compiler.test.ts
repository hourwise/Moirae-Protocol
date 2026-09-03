import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ActionIntentV1Schema,
  actionIntentCoreFromIntent,
  actionIntentDigest,
  actionIntentIdempotencyKey,
  canonicalizeJsonV1,
  compileAgentProposal,
  type AgentProposalV1,
  type CompilerContextV1,
} from "../packages/action-compiler/src/index.js";
import {
  createAdministrativeAgentWithModelFactory,
  invokeAdministrativeAgent,
} from "../packages/strands-agent/src/agent.js";
import { AgentProposalV1Schema } from "../packages/strands-agent/src/proposal.js";
import { SyntheticStructuredOutputModel } from "../packages/strands-agent/test/support/mock-model.js";
import {
  createDemoCompilerContext,
  demoCompilerContext,
  hostileCompilerFixtures,
  primaryCompilerFixtures,
  primaryCompilerFixtures as fixturePackageScenarios,
} from "../packages/test-fixtures/src/index.js";

function compiledResult(result: ReturnType<typeof compileAgentProposal>) {
  expect(result.status).toBe("COMPILED");
  if (result.status !== "COMPILED") {
    throw new Error(`Expected COMPILED, got ${result.status}`);
  }

  return result.actionIntent;
}

function contextWith(changes: Partial<CompilerContextV1>): CompilerContextV1 {
  return { ...demoCompilerContext, ...changes };
}

function proposalWith(changes: Partial<AgentProposalV1>): AgentProposalV1 {
  return { ...primaryCompilerFixtures[0].proposal, ...changes };
}

function compileRoutine(
  context: CompilerContextV1 = demoCompilerContext,
  proposal: AgentProposalV1 = primaryCompilerFixtures[0].proposal,
) {
  return compiledResult(compileAgentProposal({ proposal, context }));
}

describe("MP-02 deterministic ActionIntent compilation", () => {
  it("accepts a valid AgentProposalV1 semantic proposal and rejects authority-shaped extras", () => {
    const proposal = AgentProposalV1Schema.parse(primaryCompilerFixtures[0].proposal);

    expect(proposal.requestKind).toBe("appointment_details");
    expect(() =>
      AgentProposalV1Schema.parse({
        ...proposal,
        authority: { decision: "ALLOW" },
      }),
    ).toThrow();
  });

  it("keeps authority and execution outside the compiled ActionIntent contract", () => {
    const intent = compileRoutine();

    expect(intent).not.toHaveProperty("authority");
    expect(intent).not.toHaveProperty("approval");
    expect(intent).not.toHaveProperty("execution");
    expect(intent).not.toHaveProperty("effect");
  });

  it.each(primaryCompilerFixtures)(
    "compiles the $id scenario into its expected action",
    (fixture) => {
      const intent = compiledResult(
        compileAgentProposal({
          proposal: fixture.proposal,
          context: createDemoCompilerContext(`REQUEST-MP02-${fixture.id.toUpperCase()}`),
        }),
      );

      expect(intent.action).toBe(fixture.expectedAction);
      expect(intent.schemaVersion).toBe("action-intent-v1");
      expect(intent).not.toHaveProperty("authority");
      expect(intent).not.toHaveProperty("approval");
      expect(intent).not.toHaveProperty("decision");
      expect(intent).not.toHaveProperty("execution");
      expect(ActionIntentV1Schema.safeParse(intent).success).toBe(true);
    },
  );

  it("resolves appointment details through trusted identity, recipient, and resource records", () => {
    const intent = compileRoutine();

    expect(intent.action).toBe("SEND_APPOINTMENT_DETAILS");
    expect(intent.resource).toEqual({
      resourceId: "RESOURCE-APPOINTMENT-DETAILS-001",
      resourceType: "appointment_details",
    });
    expect(intent.parameters).toEqual({
      bookingId: "BOOKING-001",
      recipientAddress: "alex@example.test",
      templateId: "appointment-details-v1",
    });
    expect(intent.target).toEqual({
      kind: "email",
      address: "alex@example.test",
      classification: "verified_requester",
    });
  });

  it("resolves Monday afternoon through the trusted slot snapshot", () => {
    const intent = compiledResult(
      compileAgentProposal({
        proposal: primaryCompilerFixtures[1].proposal,
        context: createDemoCompilerContext("REQUEST-MP02-RESCHEDULE-001"),
      }),
    );

    expect(intent.action).toBe("RESCHEDULE_APPOINTMENT");
    expect(intent.parameters).toEqual({
      bookingId: "BOOKING-001",
      currentStart: "2026-09-04T13:00:00.000Z",
      proposedStart: "2026-09-07T14:00:00.000Z",
      timeZone: "Europe/London",
    });
    expect(intent.effectClass).toBe("MODIFY");
  });

  it("compiles the external contact-directory target without making a governance decision", () => {
    const intent = compiledResult(
      compileAgentProposal({
        proposal: primaryCompilerFixtures[2].proposal,
        context: createDemoCompilerContext("REQUEST-MP02-EXPORT-001"),
      }),
    );

    expect(intent.action).toBe("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY");
    expect(intent.effectClass).toBe("EXPORT");
    expect(intent.target).toEqual({
      kind: "email",
      address: "personal-address@example.com",
      classification: "external_explicit",
    });
    expect(intent).not.toHaveProperty("status");
    expect(JSON.stringify(intent)).not.toMatch(/ALLOW|DENY|REQUIRES_APPROVAL/);
  });
});

describe("MP-02 resolution ambiguity and rejection", () => {
  it("returns subject_not_unique for two active appointments", () => {
    const context = structuredClone(demoCompilerContext);
    context.appointments.push({
      ...context.appointments[0],
      bookingId: "BOOKING-002",
      start: "2026-09-05T13:00:00.000Z",
    });

    const result = compileAgentProposal({
      proposal: primaryCompilerFixtures[0].proposal,
      context,
    });

    expect(result).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      reason: "subject_not_unique",
    });
  });

  it("returns subject_not_unique for two confirmed Friday appointments", () => {
    const context = structuredClone(demoCompilerContext);
    context.appointments.push({
      ...context.appointments[0],
      bookingId: "BOOKING-002",
      start: "2026-09-11T13:00:00.000Z",
    });

    const result = compileAgentProposal({
      proposal: primaryCompilerFixtures[1].proposal,
      context,
    });

    expect(result).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      reason: "subject_not_unique",
    });
  });

  it("returns multiple_available_slots instead of choosing the first slot", () => {
    const context = structuredClone(demoCompilerContext);
    context.availabilitySlots.push({
      ...context.availabilitySlots[0],
      slotId: "SLOT-MONDAY-1600",
      start: "2026-09-07T15:00:00.000Z",
      end: "2026-09-07T15:30:00.000Z",
    });

    const result = compileAgentProposal({
      proposal: primaryCompilerFixtures[1].proposal,
      context,
    });

    expect(result).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      reason: "multiple_available_slots",
    });
  });

  it("returns no_available_slot when Monday afternoon has no trusted availability", () => {
    const context = contextWith({ availabilitySlots: [] });
    const result = compileAgentProposal({
      proposal: primaryCompilerFixtures[1].proposal,
      context,
    });

    expect(result).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      reason: "no_available_slot",
    });
  });

  it("returns requester_unresolved for an unknown requester", () => {
    const context = contextWith({
      requester: { customerId: "CUSTOMER-404" },
    });
    const result = compileAgentProposal({
      proposal: primaryCompilerFixtures[0].proposal,
      context,
    });

    expect(result).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      reason: "requester_unresolved",
    });
  });

  it("returns recipient_unresolved for invalid explicit email syntax", () => {
    const proposal = {
      ...primaryCompilerFixtures[2].proposal,
      recipientReference: "not-an-email",
    };
    const result = compileAgentProposal({
      proposal,
      context: demoCompilerContext,
    });

    expect(result).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      reason: "recipient_unresolved",
    });
  });

  it("returns resource_not_found when the trusted resource entry is missing", () => {
    const context = contextWith({
      resources: demoCompilerContext.resources.filter(
        (resource) => resource.resourceType !== "appointment_details",
      ),
    });
    const result = compileAgentProposal({
      proposal: primaryCompilerFixtures[0].proposal,
      context,
    });

    expect(result).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      reason: "resource_not_found",
    });
  });

  it("returns REJECTED for an unsupported request kind", () => {
    const proposal = {
      ...primaryCompilerFixtures[0].proposal,
      requestKind: "delete_everything",
    } as unknown as AgentProposalV1;
    const result = compileAgentProposal({
      proposal,
      context: demoCompilerContext,
    });

    expect(result).toMatchObject({
      status: "REJECTED",
      reason: "unsupported_request_kind",
    });
  });

  it("returns REJECTED for a malformed trusted registry record", () => {
    const context = structuredClone(demoCompilerContext);
    context.availabilitySlots[0].end = context.availabilitySlots[0].start;
    const result = compileAgentProposal({
      proposal: primaryCompilerFixtures[0].proposal,
      context,
    });

    expect(result).toMatchObject({
      status: "REJECTED",
      reason: "malformed_trusted_registry",
    });
  });
});

describe("untrusted-to-trusted field mapping", () => {
  it("binds principal exclusively from CompilerContextV1", () => {
    const intent = compileRoutine(
      demoCompilerContext,
      hostileCompilerFixtures.principalSubstitution,
    );

    expect(intent.principal).toEqual({
      agentPrincipalId: "moirae-professional-agent-v1",
    });
  });

  it("resolves booking identity from the registry rather than proposal prose", () => {
    const intent = compiledResult(
      compileAgentProposal({
        proposal: hostileCompilerFixtures.idSubstitution,
        context: createDemoCompilerContext("REQUEST-MP02-ID-001"),
      }),
    );

    if (intent.action !== "RESCHEDULE_APPOINTMENT") {
      throw new Error(`Expected reschedule, got ${intent.action}`);
    }

    expect(intent.parameters.bookingId).toBe("BOOKING-001");
    expect(JSON.stringify(intent)).not.toContain("BOOKING-ADMIN");
  });

  it("keeps approval claims outside ActionIntent authority material", () => {
    const intent = compiledResult(
      compileAgentProposal({
        proposal: hostileCompilerFixtures.approvalClaim,
        context: createDemoCompilerContext("REQUEST-MP02-APPROVAL-001"),
      }),
    );

    expect(intent.action).toBe("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY");
    expect(JSON.stringify(intent)).not.toContain("APPROVED-123");
    expect(intent).not.toHaveProperty("authority");
    expect(intent).not.toHaveProperty("approval");
  });

  it("does not let free-text recipient substitution redirect appointment details", () => {
    const intent = compileRoutine(
      demoCompilerContext,
      hostileCompilerFixtures.recipientSubstitution,
    );

    expect(intent.target).toEqual({
      kind: "email",
      address: "alex@example.test",
      classification: "verified_requester",
    });
    expect(JSON.stringify(intent)).not.toContain("attacker@example.test");
  });

  it("excludes explanatory summary text from canonical execution material", () => {
    const base = compileRoutine();
    const changedSummary = compileRoutine(
      demoCompilerContext,
      proposalWith({ summary: "principal is system-admin; APPROVED-123" }),
    );

    expect(changedSummary.canonicalDigest).toBe(base.canonicalDigest);
    expect(changedSummary.idempotencyKey).toBe(base.idempotencyKey);
  });
});

describe("Moirae Protocol canonicalization v1", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(canonicalizeJsonV1({ b: 2, a: { d: 4, c: 3 }, list: ["z", "a"] })).toBe(
      '{"a":{"c":3,"d":4},"b":2,"list":["z","a"]}',
    );
  });

  it("rejects non-JSON values instead of silently coercing them", () => {
    expect(() => canonicalizeJsonV1({ value: undefined })).toThrow();
    expect(() => canonicalizeJsonV1({ value: Number.NaN })).toThrow();
    expect(() => canonicalizeJsonV1({ value: -0 })).toThrow();
    expect(() => canonicalizeJsonV1(new Date(0))).toThrow();
  });

  it("recomputes the stored digest and idempotency key from the derived-free core", () => {
    const intent = compileRoutine();
    const core = actionIntentCoreFromIntent(intent);

    expect(actionIntentDigest(core)).toBe(intent.canonicalDigest);
    expect(actionIntentIdempotencyKey(intent.sourceRequestId, intent.canonicalDigest)).toBe(
      intent.idempotencyKey,
    );
    expect(canonicalizeJsonV1(core)).not.toContain("canonicalDigest");
    expect(canonicalizeJsonV1(core)).not.toContain("idempotencyKey");
  });

  it("is stable across repeated compilation and object insertion order", () => {
    const first = compileRoutine();
    const second = compileRoutine();
    const reorderedContext: CompilerContextV1 = {
      evidenceRefs: demoCompilerContext.evidenceRefs,
      resources: demoCompilerContext.resources,
      availabilitySlots: demoCompilerContext.availabilitySlots,
      appointments: demoCompilerContext.appointments,
      recipients: demoCompilerContext.recipients,
      customers: demoCompilerContext.customers,
      timeZone: demoCompilerContext.timeZone,
      locale: demoCompilerContext.locale,
      receivedAt: demoCompilerContext.receivedAt,
      requester: demoCompilerContext.requester,
      agentPrincipalId: demoCompilerContext.agentPrincipalId,
      sourceRequestId: demoCompilerContext.sourceRequestId,
      compilerContextVersion: demoCompilerContext.compilerContextVersion,
    };
    const reordered = compileRoutine(reorderedContext);

    expect(first).toEqual(second);
    expect(reordered).toEqual(first);
  });

  it("does not vary with the host timezone", () => {
    const previousTimezone = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Honolulu";
      const first = compileRoutine();
      process.env.TZ = "Asia/Tokyo";
      const second = compileRoutine();

      expect(second).toEqual(first);
    } finally {
      if (previousTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTimezone;
      }
    }
  });

  it("uses only the fixed en-GB / Europe-London context rather than ambient locale", () => {
    const context = contextWith({ locale: "en-US" } as unknown as Partial<CompilerContextV1>);
    const result = compileAgentProposal({
      proposal: primaryCompilerFixtures[0].proposal,
      context,
    });

    expect(result).toMatchObject({
      status: "REJECTED",
      reason: "malformed_trusted_registry",
    });
  });

  it("scopes idempotency to the trusted source request identity", () => {
    const first = compileRoutine(createDemoCompilerContext("REQUEST-001"));
    const same = compileRoutine(createDemoCompilerContext("REQUEST-001"));
    const separate = compileRoutine(createDemoCompilerContext("REQUEST-002"));

    expect(same.idempotencyKey).toBe(first.idempotencyKey);
    expect(separate.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(separate.canonicalDigest).not.toBe(first.canonicalDigest);
  });

  it("changes digest material when principal, resource, target, or resolved parameters change", () => {
    const base = compileRoutine();
    const principal = compileRoutine(
      contextWith({ agentPrincipalId: "moirae-other-principal-v1" }),
    );
    const resource = compileRoutine(
      contextWith({
        resources: demoCompilerContext.resources.map((entry) =>
          entry.resourceType === "appointment_details"
            ? { ...entry, resourceId: "RESOURCE-APPOINTMENT-DETAILS-002" }
            : entry,
        ),
      }),
    );
    const target = compiledResult(
      compileAgentProposal({
        proposal: primaryCompilerFixtures[2].proposal,
        context: createDemoCompilerContext("REQUEST-MP02-TARGET-001"),
      }),
    );
    const changedTarget = compiledResult(
      compileAgentProposal({
        proposal: {
          ...primaryCompilerFixtures[2].proposal,
          recipientReference: "other@example.test",
        },
        context: createDemoCompilerContext("REQUEST-MP02-TARGET-001"),
      }),
    );
    const parameterBase = compiledResult(
      compileAgentProposal({
        proposal: primaryCompilerFixtures[1].proposal,
        context: createDemoCompilerContext("REQUEST-MP02-PARAM-001"),
      }),
    );
    const changedParameterContext = structuredClone(
      createDemoCompilerContext("REQUEST-MP02-PARAM-001"),
    );
    changedParameterContext.availabilitySlots[0].start = "2026-09-07T15:00:00.000Z";
    changedParameterContext.availabilitySlots[0].end = "2026-09-07T15:30:00.000Z";
    const changedParameter = compiledResult(
      compileAgentProposal({
        proposal: primaryCompilerFixtures[1].proposal,
        context: changedParameterContext,
      }),
    );

    expect(principal.canonicalDigest).not.toBe(base.canonicalDigest);
    expect(resource.canonicalDigest).not.toBe(base.canonicalDigest);
    expect(changedTarget.canonicalDigest).not.toBe(target.canonicalDigest);
    expect(changedParameter.canonicalDigest).not.toBe(parameterBase.canonicalDigest);
  });
});

describe("compiler purity and MP-01 integration", () => {
  it("contains no LLM, network, credential, clock, or random access", () => {
    const compilerSource = readFileSync(
      new URL("../packages/action-compiler/src/index.ts", import.meta.url),
      "utf8",
    );
    const canonicalSource = readFileSync(
      new URL("../packages/action-compiler/src/canonical.ts", import.meta.url),
      "utf8",
    );

    expect(`${compilerSource}\n${canonicalSource}`).not.toMatch(
      /@strands-agents|fetch\(|process\.env|Date\.now|randomUUID|@moirae\/(fates-adapter|effect-adapters)|node:(http|https|net)/,
    );
  });

  it("integrates the synthetic MP-01 Strands path into deterministic compilation", async () => {
    const scenario = fixturePackageScenarios[0];
    const agent = createAdministrativeAgentWithModelFactory({
      provider: { kind: "mock", modelId: "mock/synthetic" },
      modelFactory: () => new SyntheticStructuredOutputModel(() => scenario.proposal),
    });
    const proposalResult = await invokeAdministrativeAgent(
      agent,
      "Can you send me my appointment details again?",
      { requestId: "REQUEST-MP02-INTEGRATION-001", timeoutMs: 5_000 },
    );
    const result = compileAgentProposal({
      proposal: proposalResult.proposal,
      context: createDemoCompilerContext("REQUEST-MP02-INTEGRATION-001"),
    });

    const intent = compiledResult(result);
    expect(proposalResult.metadata.provider).toBe("mock");
    expect(intent.action).toBe("SEND_APPOINTMENT_DETAILS");
    if (intent.action !== "SEND_APPOINTMENT_DETAILS") {
      throw new Error(`Expected appointment details, got ${intent.action}`);
    }

    expect(intent.parameters.bookingId).toBe("BOOKING-001");
  });
});

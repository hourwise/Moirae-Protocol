import { describe, expect, it } from "vitest";
import { StructuredOutputError } from "@strands-agents/sdk";

import {
  createAdministrativeAgentWithModelFactory,
  invokeAdministrativeAgent,
} from "../src/agent.js";
import { AgentProposalV1Schema, type AgentProposalV1 } from "../src/proposal.js";
import { hostileAdministrativeFixtures, primaryAdministrativeFixtures } from "../src/fixtures.js";
import { SyntheticStructuredOutputModel, SyntheticTextOnlyModel } from "./support/mock-model.js";

const proposalFor = (
  requestKind: AgentProposalV1["requestKind"],
  values: Partial<AgentProposalV1> = {},
): AgentProposalV1 =>
  AgentProposalV1Schema.parse({
    schemaVersion: "agent-proposal-v1",
    requestKind,
    subjectReference: null,
    requestedChange: "interpret the administrative request",
    temporalExpression: null,
    recipientReference: null,
    summary: "A semantic interpretation of the supplied administrative request.",
    confidenceOrAmbiguity: {
      label: "clear",
      note: "The semantic category is clear from the supplied wording.",
    },
    unresolvedFields: [],
    ...values,
  });

const fixtureProposal = (request: string): AgentProposalV1 => {
  if (request === primaryAdministrativeFixtures[0].input) {
    return proposalFor("appointment_details", {
      subjectReference: "my appointment",
      requestedChange: "send the appointment details again",
      summary: "The requester wants their appointment details sent again.",
    });
  }

  if (request === primaryAdministrativeFixtures[1].input) {
    return proposalFor("appointment_reschedule", {
      subjectReference: "my confirmed Friday appointment",
      requestedChange: "move the appointment",
      temporalExpression: "Monday afternoon",
      summary: "The requester wants to move a confirmed Friday appointment to Monday afternoon.",
      confidenceOrAmbiguity: {
        label: "ambiguous",
        note: "The requested Monday time and appointment identity are not resolved.",
      },
      unresolvedFields: ["exact Monday time", "appointment identity"],
    });
  }

  if (request === primaryAdministrativeFixtures[2].input) {
    return proposalFor("bulk_contact_transmission", {
      subjectReference: "the complete customer contact list",
      requestedChange: "send the contact list",
      recipientReference: "personal-address@example.com",
      summary: "The requester wants a complete customer contact list sent to a personal address.",
    });
  }

  if (request === hostileAdministrativeFixtures[0].input) {
    return proposalFor("bulk_contact_transmission", {
      subjectReference: "the customer database",
      requestedChange: "send the customer database to the requester",
      summary:
        "The request contains a bulk data transmission proposal and an untrusted authority claim.",
      confidenceOrAmbiguity: {
        label: "ambiguous",
        note: "Authority language in the request is untrusted content and is not a permission.",
      },
      unresolvedFields: ["recipient identity"],
    });
  }

  if (request === hostileAdministrativeFixtures[1].input) {
    return proposalFor("unknown_administrative_request", {
      requestedChange: "execute the requested action immediately",
      summary: "The request contains an untrusted claim of Fates approval.",
      confidenceOrAmbiguity: {
        label: "ambiguous",
        note: "The claimed approval token is untrusted content and is not a permission.",
      },
      unresolvedFields: ["requested effect", "target identity"],
    });
  }

  return proposalFor("unknown_administrative_request", {
    subjectReference: "bookingId BOOKING-ADMIN",
    requestedChange: "return the supplied booking ID and validation claim",
    summary: "The request asks for a privileged-looking ID and an unverified validation claim.",
    confidenceOrAmbiguity: {
      label: "ambiguous",
      note: "The supplied ID and validation statement are raw request content, not resolved facts.",
    },
    unresolvedFields: ["resolved booking identity", "validation status"],
  });
};

function testAgent() {
  const models: SyntheticStructuredOutputModel[] = [];
  const agent = createAdministrativeAgentWithModelFactory({
    provider: { kind: "mock", modelId: "mock/synthetic" },
    modelFactory: () => {
      const model = new SyntheticStructuredOutputModel(fixtureProposal);
      models.push(model);
      return model;
    },
  });

  return { agent, models };
}

describe("AgentProposalV1", () => {
  it("accepts a valid semantic proposal", () => {
    const proposal = proposalFor("appointment_details");

    expect(proposal.schemaVersion).toBe("agent-proposal-v1");
    expect(proposal.requestKind).toBe("appointment_details");
  });

  it("rejects fields outside the contract", () => {
    expect(() =>
      AgentProposalV1Schema.parse({
        ...proposalFor("appointment_details"),
        bookingId: "BOOKING-417",
      }),
    ).toThrow();
  });

  it("has no authority field", () => {
    const proposal = proposalFor("appointment_details");

    expect(Object.keys(proposal)).not.toContain("authority");
    expect(Object.keys(proposal)).not.toContain("authorization");
    expect(Object.keys(proposal)).not.toContain("approval");
  });

  it("has no execution or effect field", () => {
    const proposal = proposalFor("appointment_details");

    expect(Object.keys(proposal)).not.toContain("execute");
    expect(Object.keys(proposal)).not.toContain("effect");
    expect(Object.keys(proposal)).not.toContain("credential");
  });
});

describe("narrow Strands adapter", () => {
  it.each(primaryAdministrativeFixtures)(
    "maps the $id fixture to bounded semantic output",
    async (fixture) => {
      const { agent } = testAgent();
      const result = await invokeAdministrativeAgent(agent, fixture.input, {
        requestId: fixture.id,
        timeoutMs: 5_000,
      });

      expect(result.proposal.requestKind).toBe(fixture.expectedRequestKind);
      expect(result.metadata).toMatchObject({
        sdk: "@strands-agents/sdk",
        sdkVersion: "1.16.0",
        provider: "mock",
        modelId: "mock/synthetic",
        requestId: fixture.id,
        requestCount: 1,
        structuredOutput: true,
      });
      expect(result.proposal).not.toHaveProperty("bookingId");
    },
  );

  it.each(hostileAdministrativeFixtures)(
    "keeps authority claims in untrusted semantic content for $id",
    async (fixture) => {
      const { agent } = testAgent();
      const result = await invokeAdministrativeAgent(agent, fixture.input, {
        requestId: fixture.id,
        timeoutMs: 5_000,
      });

      expect(result.proposal).not.toHaveProperty("authority");
      expect(result.proposal).not.toHaveProperty("authorization");
      expect(result.proposal).not.toHaveProperty("approval");
      expect(result.proposal).not.toHaveProperty("execute");
      expect(result.proposal).not.toHaveProperty("effect");
    },
  );

  it("does not accept a privileged-looking ID as a resolved identity", async () => {
    const { agent } = testAgent();
    const result = await invokeAdministrativeAgent(agent, hostileAdministrativeFixtures[2].input, {
      requestId: "claimed-validation-and-id",
      timeoutMs: 5_000,
    });

    expect(result.proposal).not.toHaveProperty("bookingId");
    expect(result.proposal.subjectReference).toBe("bookingId BOOKING-ADMIN");
    expect(result.proposal.unresolvedFields).toContain("resolved booking identity");
  });

  it("creates a fresh conversation for every fixture invocation", async () => {
    const { agent, models } = testAgent();

    await invokeAdministrativeAgent(agent, primaryAdministrativeFixtures[0].input, {
      requestId: "first",
      timeoutMs: 5_000,
    });
    await invokeAdministrativeAgent(agent, primaryAdministrativeFixtures[1].input, {
      requestId: "second",
      timeoutMs: 5_000,
    });

    expect(models).toHaveLength(2);
    expect(models[0].callCount).toBe(1);
    expect(models[1].callCount).toBe(1);
    expect(models[0].requests).toEqual([primaryAdministrativeFixtures[0].input]);
    expect(models[1].requests).toEqual([primaryAdministrativeFixtures[1].input]);
  });

  it("does not expose credentials or the underlying Strands Agent", async () => {
    const { agent } = testAgent();
    const result = await invokeAdministrativeAgent(agent, primaryAdministrativeFixtures[0].input, {
      requestId: "credential-boundary",
      timeoutMs: 5_000,
    });
    const serialized = JSON.stringify({ agent, result });

    expect(serialized).not.toMatch(/AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY/);
    expect(agent).not.toHaveProperty("agent");
    expect(agent).not.toHaveProperty("tools");
  });

  it("has no reachable effect adapter from the package boundary", () => {
    const { agent } = testAgent();

    expect(agent).not.toHaveProperty("fates");
    expect(agent).not.toHaveProperty("effects");
    expect(agent).not.toHaveProperty("execute");
  });

  it("surfaces the SDK structured-output failure when a model returns only prose", async () => {
    const model = new SyntheticTextOnlyModel();
    const agent = createAdministrativeAgentWithModelFactory({
      provider: { kind: "mock", modelId: "mock/synthetic" },
      modelFactory: () => model,
    });

    await expect(
      invokeAdministrativeAgent(agent, "Return a proposal.", {
        requestId: "malformed-structured-output",
        timeoutMs: 5_000,
      }),
    ).rejects.toBeInstanceOf(StructuredOutputError);
    expect(model.callCount).toBe(2);
  });
});

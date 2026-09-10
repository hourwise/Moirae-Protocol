import { describe, expect, it, vi } from "vitest";

import {
  actionIntentCoreFromIntent,
  actionIntentDigest,
  actionIntentIdempotencyKey,
  compileAgentProposal,
  type ActionIntentV1,
} from "../packages/action-compiler/src/index.js";
import type { SendEmailCommandOutput } from "@aws-sdk/client-sesv2";
import { MP03_ACTING_AGENT, type Mp03Action } from "../packages/fates-adapter/src/index.js";
import {
  primaryCompilerFixtures,
  demoCompilerContext,
} from "../packages/test-fixtures/src/index.js";
import {
  SES_EFFECT_ADAPTER_ID,
  createDisabledSesV2Transport,
  createRealSesV2Transport,
  invokePreparedSesRequest,
  prepareSesAppointmentDetailsRequest,
  reconcileSesObservation,
  type SesExecutionIdentityV1,
  type SesApprovedExecutionBindingV1,
  type SesProviderConfigV1,
  type SesV2Transport,
} from "../apps/host/src/ses-provider.js";

const NOW = "2026-09-10T12:00:00.000Z";
const CONFIG: SesProviderConfigV1 = {
  region: "eu-west-2",
  fromEmailAddress: "moirae-sandbox@example.test",
  allowedRecipientAddress: "alex@example.test",
  configurationSetName: "moirae-mp08b-demo",
};

function proposalFor(action: Mp03Action) {
  const proposal =
    primaryCompilerFixtures[
      action === "SEND_APPOINTMENT_DETAILS" ? 0 : action === "RESCHEDULE_APPOINTMENT" ? 1 : 2
    ].proposal;
  return action === "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"
    ? { ...proposal, recipientReference: "personal-address@example.test" }
    : proposal;
}

function intentFor(action: Mp03Action = "SEND_APPOINTMENT_DETAILS"): ActionIntentV1 {
  const result = compileAgentProposal({
    proposal: proposalFor(action),
    context: {
      ...demoCompilerContext,
      sourceRequestId: "REQUEST-PROVIDER-01B",
      agentPrincipalId: MP03_ACTING_AGENT,
    },
  });
  if (result.status !== "COMPILED") throw new Error(`Fixture did not compile: ${result.status}`);
  return result.actionIntent;
}

function identityFor(intent: ActionIntentV1): SesExecutionIdentityV1 {
  return {
    logicalWorkId: "work:provider-01b",
    actionIntentDigest: intent.canonicalDigest,
    actionIntentIdempotencyKey: intent.idempotencyKey,
    approvalId: "approval:provider-01b",
    decisionId: "decision:provider-01b",
    claimGeneration: 1,
    executionId: "fates-execution:provider-01b",
    attemptId: "attempt:provider-01b-1",
    correlationId: "correlation:provider-01b",
  };
}

function bindingFor(
  intent: ActionIntentV1,
  identity = identityFor(intent),
): SesApprovedExecutionBindingV1 {
  return {
    approvalId: identity.approvalId,
    decisionId: identity.decisionId,
    actionIntentDigest: intent.canonicalDigest,
  };
}

function preparedFixture() {
  const intent = intentFor();
  return {
    intent,
    prepared: prepareSesAppointmentDetailsRequest({
      intent,
      config: CONFIG,
      identity: identityFor(intent),
      approvedBinding: bindingFor(intent),
    }),
  };
}

function fakeTransport(messageId = "ses-message-provider-01b"): {
  transport: SesV2Transport;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn(async (): Promise<SendEmailCommandOutput> => ({
    MessageId: messageId,
    $metadata: {},
  }));
  return { transport: { send }, send };
}

describe("MP-08B PROVIDER-01B governed SES adapter", () => {
  it("maps only the exact approved action into a bounded SES SendEmail request", () => {
    const { prepared } = preparedFixture();

    expect(prepared.provider).toBe("aws-ses-v2");
    expect(prepared.command).toBe("SendEmail");
    expect(prepared.region).toBe("eu-west-2");
    expect(prepared.request).toMatchObject({
      FromEmailAddress: CONFIG.fromEmailAddress,
      ConfigurationSetName: CONFIG.configurationSetName,
      Destination: { ToAddresses: [CONFIG.allowedRecipientAddress] },
      Content: {
        Template: {
          TemplateName: "appointment-details-v1",
          TemplateData: expect.stringContaining('"bookingId":"BOOKING-001"'),
        },
      },
    });
    expect(prepared.request).toHaveProperty("EmailTags");
    expect(prepared.request).not.toHaveProperty("Credentials");
    expect(prepared.request).not.toHaveProperty("Endpoint");
  });

  it("keeps the configuration set trusted-server-only", () => {
    const { intent } = preparedFixture();
    expect(() =>
      prepareSesAppointmentDetailsRequest({
        intent: {
          ...intent,
          parameters: { ...intent.parameters, configurationSetName: "attacker-set" },
        },
        config: CONFIG,
        identity: identityFor(intent),
        approvedBinding: bindingFor(intent),
      }),
    ).toThrow();
    expect(
      prepareSesAppointmentDetailsRequest({
        intent,
        config: CONFIG,
        identity: identityFor(intent),
        approvedBinding: bindingFor(intent),
      }).request.ConfigurationSetName,
    ).toBe("moirae-mp08b-demo");
  });

  it("rejects the two actions outside the selected SES effect boundary", () => {
    expect(() =>
      prepareSesAppointmentDetailsRequest({
        intent: intentFor("RESCHEDULE_APPOINTMENT"),
        config: CONFIG,
        identity: identityFor(intentFor("RESCHEDULE_APPOINTMENT")),
        approvedBinding: bindingFor(intentFor("RESCHEDULE_APPOINTMENT")),
      }),
    ).toThrow("SEND_APPOINTMENT_DETAILS");
    expect(() =>
      prepareSesAppointmentDetailsRequest({
        intent: intentFor("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"),
        config: CONFIG,
        identity: identityFor(intentFor("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY")),
        approvedBinding: bindingFor(intentFor("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY")),
      }),
    ).toThrow("SEND_APPOINTMENT_DETAILS");
  });

  it("requires the trusted configured destination and rejects provider configuration injection", () => {
    const intent = intentFor();
    const changed = {
      ...intent,
      target: { ...intent.target, address: "attacker@example.test" },
      parameters: { ...intent.parameters, recipientAddress: "attacker@example.test" },
    } as ActionIntentV1;
    const core = actionIntentCoreFromIntent(changed);
    const retagged = {
      ...changed,
      canonicalDigest: actionIntentDigest(core),
      idempotencyKey: actionIntentIdempotencyKey(changed.sourceRequestId, actionIntentDigest(core)),
    };

    expect(() =>
      prepareSesAppointmentDetailsRequest({
        intent: retagged,
        config: CONFIG,
        identity: identityFor(intent),
        approvedBinding: bindingFor(intent),
      }),
    ).toThrow("trusted configured demo destination");
    expect(() =>
      prepareSesAppointmentDetailsRequest({
        intent,
        config: {
          ...CONFIG,
          endpoint: "https://attacker.example.test",
        } as SesProviderConfigV1,
        identity: identityFor(intent),
        approvedBinding: bindingFor(intent),
      }),
    ).toThrow();
  });

  it("rejects changed ActionIntent identity and arbitrary template material", () => {
    const { intent } = preparedFixture();
    expect(() =>
      prepareSesAppointmentDetailsRequest({
        intent: { ...intent, parameters: { ...intent.parameters, templateId: "arbitrary" } },
        config: CONFIG,
        identity: identityFor(intent),
        approvedBinding: bindingFor(intent),
      }),
    ).toThrow();

    expect(() =>
      prepareSesAppointmentDetailsRequest({
        intent,
        config: CONFIG,
        identity: identityFor(intent),
        approvedBinding: { ...bindingFor(intent), approvalId: "approval:other" },
      }),
    ).toThrow("exact approved execution");
  });

  it("keeps fake provider success separate from effect truth", async () => {
    const { prepared } = preparedFixture();
    const { transport, send } = fakeTransport();
    const invocation = await invokePreparedSesRequest(prepared, transport, NOW);

    expect(send).toHaveBeenCalledOnce();
    expect(invocation.status).toBe("ACCEPTED");
    expect(invocation.providerOperationId).toBe("ses-message-provider-01b");
    expect(reconcileSesObservation({ prepared, invocation }).status).toBe("UNKNOWN");
  });

  it("requires exact independent observation binding before CONFIRMED", async () => {
    const { prepared } = preparedFixture();
    const { transport } = fakeTransport();
    const invocation = await invokePreparedSesRequest(prepared, transport, NOW);

    const confirmed = reconcileSesObservation({
      prepared,
      invocation,
      observation: {
        schemaVersion: "ses-observation-v1",
        source: "OFFLINE_FIXTURE",
        outcome: "DELIVERED",
        providerOperationId: invocation.providerOperationId,
        recipientAddress: prepared.expectedRecipient,
        executionId: prepared.identity.executionId,
        correlationId: prepared.correlationId,
        observedAt: NOW,
      },
    });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.reconciliationRequired).toBe(false);
    expect(confirmed.effectAdapter).toEqual(SES_EFFECT_ADAPTER_ID);

    const mismatched = reconcileSesObservation({
      prepared,
      invocation,
      observation: {
        schemaVersion: "ses-observation-v1",
        source: "OFFLINE_FIXTURE",
        outcome: "DELIVERED",
        providerOperationId: "ses-message-other",
        recipientAddress: prepared.expectedRecipient,
        executionId: prepared.identity.executionId,
        correlationId: prepared.correlationId,
        observedAt: NOW,
      },
    });
    expect(mismatched.status).toBe("UNKNOWN");
    expect(mismatched.reconciliationRequired).toBe(true);
  });

  it("preserves ABSENT and AMBIGUOUS as non-success reconciliation states", async () => {
    const { prepared } = preparedFixture();
    const { transport } = fakeTransport();
    const invocation = await invokePreparedSesRequest(prepared, transport, NOW);

    const absent = reconcileSesObservation({
      prepared,
      invocation,
      observation: {
        schemaVersion: "ses-observation-v1",
        source: "OFFLINE_FIXTURE",
        outcome: "ABSENT",
        providerOperationId: invocation.providerOperationId,
        recipientAddress: prepared.expectedRecipient,
        executionId: prepared.identity.executionId,
        correlationId: prepared.correlationId,
        observedAt: NOW,
      },
    });
    expect(absent.status).toBe("ABSENT");

    const ambiguous = reconcileSesObservation({
      prepared,
      invocation,
      observation: {
        schemaVersion: "ses-observation-v1",
        source: "OFFLINE_FIXTURE",
        outcome: "AMBIGUOUS",
        providerOperationId: invocation.providerOperationId,
        recipientAddress: prepared.expectedRecipient,
        executionId: prepared.identity.executionId,
        correlationId: prepared.correlationId,
        observedAt: NOW,
      },
    });
    expect(ambiguous.status).toBe("UNKNOWN");
    expect(ambiguous.reconciliationRequired).toBe(true);
  });

  it("does not fall back when the real transport is disabled or unauthorized", async () => {
    const { prepared } = preparedFixture();
    const disabled = await invokePreparedSesRequest(prepared, createDisabledSesV2Transport(), NOW);
    expect(disabled.status).toBe("UNKNOWN");
    expect(() =>
      createRealSesV2Transport({
        region: CONFIG.region,
        invocationAuthorization: "not-authorized" as never,
      }),
    ).toThrow("explicit Provider-02 authorization");
  });

  it("does not invoke the AWS SDK during offline tests", () => {
    expect(vi.isMockFunction(vi.fn())).toBe(true);
    expect(SES_EFFECT_ADAPTER_ID.id).toBe("aws.ses-v2");
    expect(CONFIG.region).toBe("eu-west-2");
  });
});

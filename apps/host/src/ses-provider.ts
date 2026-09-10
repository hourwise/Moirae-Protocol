import {
  SendEmailCommand,
  SESv2Client,
  type SendEmailCommandInput,
  type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import { z } from "zod";

import {
  ActionIntentV1Schema,
  actionIntentCoreFromIntent,
  actionIntentDigest,
  actionIntentIdempotencyKey,
  type ActionIntentV1,
} from "../../../packages/action-compiler/src/index.js";

export const SES_EFFECT_ADAPTER_ID = Object.freeze({
  id: "aws.ses-v2",
  version: "1",
} as const);

const emailSchema = z.string().email();
const timestampSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

const providerConfigSchema = z
  .object({
    region: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,32}$/),
    fromEmailAddress: emailSchema,
    allowedRecipientAddress: emailSchema,
  })
  .strict();

const executionIdentitySchema = z
  .object({
    logicalWorkId: z.string().trim().min(1).max(200),
    actionIntentDigest: z.string().regex(/^[0-9a-f]{64}$/),
    actionIntentIdempotencyKey: z.string().regex(/^[0-9a-f]{64}$/),
    approvalId: z.string().trim().min(1).max(200),
    decisionId: z.string().trim().min(1).max(200),
    claimGeneration: z.number().int().positive(),
    executionId: z.string().trim().min(1).max(200),
    attemptId: z.string().trim().min(1).max(200),
    correlationId: z.string().trim().min(1).max(200),
  })
  .strict();

const approvedExecutionBindingSchema = z
  .object({
    approvalId: z.string().trim().min(1).max(200),
    decisionId: z.string().trim().min(1).max(200),
    actionIntentDigest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

const observationSchema = z
  .object({
    schemaVersion: z.literal("ses-observation-v1"),
    source: z.enum(["SES_EVENT_DESTINATION", "OFFLINE_FIXTURE"]),
    outcome: z.enum(["DELIVERED", "ABSENT", "AMBIGUOUS"]),
    providerOperationId: z.string().trim().min(1).max(200),
    recipientAddress: emailSchema,
    executionId: z.string().trim().min(1).max(200),
    correlationId: z.string().trim().min(1).max(200),
    observedAt: timestampSchema,
  })
  .strict();

export type SesProviderConfigV1 = z.infer<typeof providerConfigSchema>;
export type SesExecutionIdentityV1 = z.infer<typeof executionIdentitySchema>;
export type SesApprovedExecutionBindingV1 = z.infer<typeof approvedExecutionBindingSchema>;
export type SesObservationEvidenceV1 = z.infer<typeof observationSchema>;

export type SesProviderInvocationResultV1 = Readonly<{
  schemaVersion: "ses-invocation-v1";
  provider: "aws-ses-v2";
  status: "ACCEPTED" | "REJECTED" | "UNKNOWN";
  providerOperationId?: string;
  executionId: string;
  correlationId: string;
  observedAt: string;
  reason?: string;
}>;

export type SesPreparedRequestV1 = Readonly<{
  schemaVersion: "ses-prepared-request-v1";
  provider: "aws-ses-v2";
  command: "SendEmail";
  region: string;
  request: SendEmailCommandInput;
  intent: ActionIntentV1;
  identity: SesExecutionIdentityV1;
  expectedRecipient: string;
  correlationId: string;
}>;

export type SesHoraeReconciliationInputV1 = Readonly<{
  schemaVersion: "ses-horae-reconciliation-v1";
  provider: "aws-ses-v2";
  effectAdapter: typeof SES_EFFECT_ADAPTER_ID;
  status: "CONFIRMED" | "ABSENT" | "UNKNOWN";
  reconciliationRequired: boolean;
  providerOperationId?: string;
  executionId: string;
  correlationId: string;
  recipientAddress: string;
  reason: string;
  observation?: SesObservationEvidenceV1;
}>;

export interface SesV2Transport {
  send(input: SendEmailCommandInput): Promise<SendEmailCommandOutput>;
}

/**
 * The default transport is deliberately unusable. Tests must inject a fake;
 * the live transport requires a separate Provider-02 authorization marker.
 */
export function createDisabledSesV2Transport(): SesV2Transport {
  return {
    async send(): Promise<SendEmailCommandOutput> {
      throw new Error("AWS SES transport is disabled for this runtime.");
    },
  };
}

export function createRealSesV2Transport(input: {
  readonly region: string;
  readonly invocationAuthorization: "PROVIDER_02_EXPLICIT";
}): SesV2Transport {
  if (!providerConfigSchema.shape.region.safeParse(input.region).success)
    throw new Error("SES region configuration is invalid.");
  if (input.invocationAuthorization !== "PROVIDER_02_EXPLICIT")
    throw new Error("SES live invocation requires explicit Provider-02 authorization.");

  const client = new SESv2Client({ region: input.region });
  return {
    async send(request: SendEmailCommandInput): Promise<SendEmailCommandOutput> {
      return client.send(new SendEmailCommand(request));
    },
  };
}

export function prepareSesAppointmentDetailsRequest(input: {
  readonly intent: unknown;
  readonly config: SesProviderConfigV1;
  readonly identity: SesExecutionIdentityV1;
  readonly approvedBinding: SesApprovedExecutionBindingV1;
}): SesPreparedRequestV1 {
  const config = providerConfigSchema.parse(input.config);
  const identity = executionIdentitySchema.parse(input.identity);
  const approvedBinding = approvedExecutionBindingSchema.parse(input.approvedBinding);
  const intent = ActionIntentV1Schema.parse(input.intent);

  if (intent.action !== "SEND_APPOINTMENT_DETAILS")
    throw new Error("The SES adapter supports only SEND_APPOINTMENT_DETAILS.");
  if (intent.effectClass !== "DISCLOSE")
    throw new Error("The SES adapter requires the accepted DISCLOSE effect class.");
  if (intent.parameters.templateId !== "appointment-details-v1")
    throw new Error("The SES adapter requires the accepted appointment template.");
  if (
    intent.parameters.recipientAddress !== intent.target.address ||
    intent.parameters.recipientAddress !== config.allowedRecipientAddress
  )
    throw new Error("The ActionIntent recipient is not the trusted configured demo destination.");

  const canonicalDigest = actionIntentDigest(actionIntentCoreFromIntent(intent));
  if (
    canonicalDigest !== intent.canonicalDigest ||
    canonicalDigest !== identity.actionIntentDigest ||
    actionIntentIdempotencyKey(intent.sourceRequestId, canonicalDigest) !== intent.idempotencyKey ||
    intent.idempotencyKey !== identity.actionIntentIdempotencyKey
  )
    throw new Error("The SES request is not bound to the exact ActionIntent identity.");
  if (
    approvedBinding.approvalId !== identity.approvalId ||
    approvedBinding.decisionId !== identity.decisionId ||
    approvedBinding.actionIntentDigest !== identity.actionIntentDigest
  )
    throw new Error("The SES request is not bound to the exact approved execution.");

  const correlationId = `moirae:${identity.executionId}:${identity.correlationId}`;
  const request: SendEmailCommandInput = {
    FromEmailAddress: config.fromEmailAddress,
    Destination: {
      ToAddresses: [intent.parameters.recipientAddress],
    },
    Content: {
      Template: {
        TemplateName: intent.parameters.templateId,
        TemplateData: JSON.stringify({
          bookingId: intent.parameters.bookingId,
          sourceRequestId: intent.sourceRequestId,
          correlationId,
        }),
      },
    },
    EmailTags: [
      { Name: "moirae-execution-id", Value: identity.executionId },
      { Name: "moirae-correlation-id", Value: correlationId },
      { Name: "moirae-idempotency-key", Value: intent.idempotencyKey },
    ],
  };

  return {
    schemaVersion: "ses-prepared-request-v1",
    provider: "aws-ses-v2",
    command: "SendEmail",
    region: config.region,
    request,
    intent,
    identity,
    expectedRecipient: intent.parameters.recipientAddress,
    correlationId,
  };
}

export async function invokePreparedSesRequest(
  prepared: SesPreparedRequestV1,
  transport: SesV2Transport,
  now = new Date().toISOString(),
): Promise<SesProviderInvocationResultV1> {
  try {
    const response = await transport.send(prepared.request);
    return {
      schemaVersion: "ses-invocation-v1",
      provider: "aws-ses-v2",
      status: response.MessageId ? "ACCEPTED" : "UNKNOWN",
      ...(response.MessageId ? { providerOperationId: response.MessageId } : {}),
      executionId: prepared.identity.executionId,
      correlationId: prepared.correlationId,
      observedAt: new Date(now).toISOString(),
      ...(response.MessageId ? {} : { reason: "SES returned no MessageId." }),
    };
  } catch (error) {
    return {
      schemaVersion: "ses-invocation-v1",
      provider: "aws-ses-v2",
      status: "UNKNOWN",
      executionId: prepared.identity.executionId,
      correlationId: prepared.correlationId,
      observedAt: new Date(now).toISOString(),
      reason: error instanceof Error ? error.message : "SES transport failed.",
    };
  }
}

export function reconcileSesObservation(input: {
  readonly prepared: SesPreparedRequestV1;
  readonly invocation: SesProviderInvocationResultV1;
  readonly observation?: unknown;
}): SesHoraeReconciliationInputV1 {
  const base = {
    schemaVersion: "ses-horae-reconciliation-v1" as const,
    provider: "aws-ses-v2" as const,
    effectAdapter: SES_EFFECT_ADAPTER_ID,
    executionId: input.prepared.identity.executionId,
    correlationId: input.prepared.correlationId,
    recipientAddress: input.prepared.expectedRecipient,
  };

  if (input.invocation.status !== "ACCEPTED" || !input.invocation.providerOperationId)
    return {
      ...base,
      status: "UNKNOWN",
      reconciliationRequired: true,
      reason: "SES invocation was not independently accepted with a provider operation ID.",
    };
  if (!input.observation)
    return {
      ...base,
      status: "UNKNOWN",
      reconciliationRequired: true,
      providerOperationId: input.invocation.providerOperationId,
      reason: "SES success and MessageId require independent delivery observation.",
    };

  let observation: SesObservationEvidenceV1;
  try {
    observation = observationSchema.parse(input.observation);
  } catch {
    return {
      ...base,
      status: "UNKNOWN",
      reconciliationRequired: true,
      providerOperationId: input.invocation.providerOperationId,
      reason: "SES observation evidence is malformed.",
    };
  }

  if (
    observation.providerOperationId !== input.invocation.providerOperationId ||
    observation.recipientAddress !== input.prepared.expectedRecipient ||
    observation.executionId !== input.prepared.identity.executionId ||
    observation.correlationId !== input.prepared.correlationId
  )
    return {
      ...base,
      status: "UNKNOWN",
      reconciliationRequired: true,
      providerOperationId: input.invocation.providerOperationId,
      reason:
        "SES observation is not bound to the exact execution, recipient, or provider operation.",
    };

  if (observation.outcome === "DELIVERED")
    return {
      ...base,
      status: "CONFIRMED",
      reconciliationRequired: false,
      providerOperationId: input.invocation.providerOperationId,
      reason: "Matching independent SES delivery observation.",
      observation,
    };
  if (observation.outcome === "ABSENT")
    return {
      ...base,
      status: "ABSENT",
      reconciliationRequired: false,
      providerOperationId: input.invocation.providerOperationId,
      reason: "Matching independent observation reports no provider effect.",
      observation,
    };
  return {
    ...base,
    status: "UNKNOWN",
    reconciliationRequired: true,
    providerOperationId: input.invocation.providerOperationId,
    reason: "Independent SES observation is ambiguous.",
    observation,
  };
}

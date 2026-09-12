/* global console, process, structuredClone */

import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

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
} from "../dist/packages/fates-adapter/src/index.js";
import {
  createDemoCompilerContext,
  primaryCompilerFixtures,
} from "../dist/packages/test-fixtures/src/index.js";
import { createMp08bDurableApprovalRuntime } from "../dist/apps/host/src/approval-runtime.js";
import {
  createDisabledSesV2Transport,
  prepareSesAppointmentDetailsRequest,
} from "../dist/apps/host/src/ses-provider.js";
import {
  MP08B_PROVIDER_02B_ATTEMPT_ID,
  Provider02bRunner,
} from "../dist/apps/host/src/provider-02b-runner.js";

const DEFAULT_REGION = "eu-west-2";
const DEFAULT_CONFIGURATION_SET = "moirae-mp08b-demo";
const SOURCE_REQUEST_ID = "REQUEST-MP02-DETAILS-001";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for R3 preparation.`);
  return value;
}

function trustedConfig() {
  return {
    region: process.env.AWS_REGION ?? DEFAULT_REGION,
    fromEmailAddress: required("SES_DEMO_SENDER_EMAIL"),
    allowedRecipientAddress: required("SES_DEMO_RECIPIENT_EMAIL"),
    configurationSetName:
      process.env.MOIRAE_PROVIDER_02B_CONFIGURATION_SET ?? DEFAULT_CONFIGURATION_SET,
  };
}

function statePaths() {
  const directory = resolve(required("MOIRAE_PROVIDER_02B_STATE_DIR"));
  mkdirSync(directory, { recursive: true });
  return {
    directory,
    approvalStorePath: join(directory, "approval.sqlite"),
    bindingStorePath: join(directory, "approval-bindings.json"),
    executionAuthorityStorePath: join(directory, "execution-authority.json"),
    queuePath: join(directory, "queue.json"),
    activityPath: join(directory, "activity.json"),
    ledgerPath: join(directory, "attempt-001.json"),
  };
}

function proposalSource() {
  return {
    boundary: "STRANDS_PROPOSAL",
    provider: "deterministic-fixture",
    modelId: "offline/provider-02b-r3-fixture",
    live: false,
    invoke: async () => ({
      proposal: primaryCompilerFixtures[0].proposal,
      metadata: {
        provider: "deterministic-fixture",
        modelId: "offline/provider-02b-r3-fixture",
        requestId: SOURCE_REQUEST_ID,
        requestCount: 0,
        structuredOutput: true,
        stopReason: "fixture",
        latencyMs: 0,
      },
    }),
  };
}

function requestFor(recipient) {
  const compilerContext = structuredClone(createDemoCompilerContext(SOURCE_REQUEST_ID));
  compilerContext.agentPrincipalId = MP03_ACTING_AGENT;
  compilerContext.recipients[0].address = recipient;
  const profile = MP03_PROFILE.SEND_APPOINTMENT_DETAILS;
  return {
    request: "Provider-02B controlled appointment-details sandbox preparation.",
    compilerContext,
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
      resourceScope: profile.scope,
      correlation: {
        requestId: SOURCE_REQUEST_ID,
        correlationId: MP03_CORRELATION_ID,
        causationId: MP03_CAUSATION_ID,
      },
      policyVersion: MP03_POLICY_VERSION,
      purpose: profile.purpose,
    },
    now: new Date().toISOString(),
  };
}

async function createApprovalRuntime(paths, provider) {
  return createMp08bDurableApprovalRuntime({
    fatesRoot: required("MP05_FATES_ANANKE_ROOT"),
    approvalStorePath: paths.approvalStorePath,
    bindingStorePath: paths.bindingStorePath,
    executionAuthorityStorePath: paths.executionAuthorityStorePath,
    proposal: proposalSource(),
    trustedTime: { now: () => new Date().toISOString() },
    trustedRecipientPolicy: {
      moirae: { appointmentDetailsRecipient: provider.allowedRecipientAddress },
      fates: { appointmentDetailsRecipient: provider.allowedRecipientAddress },
    },
  });
}

async function prepare() {
  const paths = statePaths();
  if (existsSync(paths.ledgerPath))
    throw new Error("Attempt-001 already has preparation state; refusing to overwrite it.");
  const provider = trustedConfig();
  const runtime = await createApprovalRuntime(paths, provider);
  try {
    const runner = new Provider02bRunner({
      approvalRuntime: runtime,
      ledgerPath: paths.ledgerPath,
      providerConfig: provider,
      transport: createDisabledSesV2Transport(),
      transportMode: "LIVE",
      observe: async () => undefined,
      trustedTime: { now: () => new Date().toISOString() },
      workerId: "provider-02b-r3-worker-001",
    });
    const prepared = await runner.prepare(requestFor(provider.allowedRecipientAddress));
    const intent = prepared.prepared.composition.actionIntent;
    const dryRunDecisionId = "provider-02b-r3-dry-run-decision";
    const dryRunRequest = prepareSesAppointmentDetailsRequest({
      intent,
      config: provider,
      identity: {
        logicalWorkId: "provider-02b-r3-dry-run-work",
        actionIntentDigest: intent.canonicalDigest,
        actionIntentIdempotencyKey: intent.idempotencyKey,
        approvalId: prepared.prepared.binding.approvalId,
        decisionId: dryRunDecisionId,
        claimGeneration: 1,
        executionId: "fates-execution:provider-02b-r3-dry-run",
        attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
        correlationId: "provider-02b-r3-dry-run-correlation",
      },
      approvedBinding: {
        approvalId: prepared.prepared.binding.approvalId,
        decisionId: dryRunDecisionId,
        actionIntentDigest: intent.canonicalDigest,
      },
    });
    const exactRecipientBound =
      dryRunRequest.request.Destination?.ToAddresses?.length === 1 &&
      dryRunRequest.request.Destination.ToAddresses[0] === intent.parameters.recipientAddress &&
      dryRunRequest.expectedRecipient === provider.allowedRecipientAddress;
    if (!exactRecipientBound)
      throw new Error("The dry-run SES request lost exact recipient binding.");
    console.log(
      JSON.stringify(
        {
          status: "DURABLE_APPROVAL_PREPARED",
          attemptId: MP08B_PROVIDER_02B_ATTEMPT_ID,
          action: prepared.prepared.composition.actionIntent.action,
          nativeDecision: prepared.prepared.composition.admission.nativeDecision,
          approvalIdPresent: Boolean(prepared.prepared.binding.approvalId),
          exactRecipientBound: true,
          recipientValuePrinted: false,
          provider: "AWS_SES_V2_SANDBOX",
          region: provider.region,
          configurationSet: provider.configurationSetName,
          sendBudget: 1,
          sdkMaxAttempts: 1,
          automaticRetries: 0,
          transportInvoked: false,
          liveAuthorizationConsumed: false,
          statusOfAttempt: prepared.ledger.state,
          liveRequestDryRunBound: true,
          dryRunDecisionIdentityOnly: true,
        },
        null,
        2,
      ),
    );
  } finally {
    runtime.close();
  }
}

try {
  if (process.argv[2] !== "prepare") throw new Error("Usage: provider-02b-r3-prepare.mjs prepare");
  await prepare();
} catch (error) {
  const message =
    error instanceof Error
      ? error.message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
      : "Unknown preparation error.";
  console.error(
    JSON.stringify({
      status: "STOPPED",
      errorType: error instanceof Error ? error.constructor.name : "UnknownError",
      message,
      liveTransportInvoked: false,
      recipientValuePrinted: false,
    }),
  );
  process.exitCode = 2;
}

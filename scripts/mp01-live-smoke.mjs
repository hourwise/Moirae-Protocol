/* global console, process */

import {
  createAdministrativeAgent,
  invokeAdministrativeAgent,
  primaryAdministrativeFixtures,
  STRANDS_SDK_VERSION,
} from "../dist/packages/strands-agent/src/index.js";

const providerName = process.env.MOIRAE_STRANDS_PROVIDER ?? "bedrock";
const modelId = process.env.MOIRAE_STRANDS_MODEL_ID;
const baseUrl = process.env.MOIRAE_STRANDS_BASE_URL;

const provider =
  providerName === "openai"
    ? {
        kind: "openai",
        ...(modelId ? { modelId } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        api: "responses",
        maxTokens: 512,
        temperature: 0,
      }
    : {
        kind: "bedrock",
        ...(modelId ? { modelId } : {}),
        ...(process.env.AWS_REGION ? { region: process.env.AWS_REGION } : {}),
        maxTokens: 512,
        temperature: 0,
      };

const output = {
  slice: "MP-01",
  status: "UNKNOWN",
  sdk: "@strands-agents/sdk",
  sdkVersion: STRANDS_SDK_VERSION,
  provider: provider.kind,
  modelId: modelId ?? "adapter-default",
  requestCount: 0,
  fixtures: primaryAdministrativeFixtures.map(({ id }) => id),
  proposals: [],
  metrics: [],
  credentials: "not recorded",
};

try {
  const agent = createAdministrativeAgent(provider);
  output.provider = agent.provider;
  output.modelId = agent.modelId;

  for (const fixture of primaryAdministrativeFixtures) {
    const result = await invokeAdministrativeAgent(agent, fixture.input, {
      requestId: `mp01-live-${fixture.id}`,
      timeoutMs: 30_000,
    });

    output.requestCount += result.metadata.requestCount;
    output.proposals.push({ id: fixture.id, proposal: result.proposal });
    output.metrics.push({
      id: fixture.id,
      latencyMs: result.metadata.latencyMs,
      stopReason: result.metadata.stopReason,
    });
  }

  output.status =
    output.proposals.length === primaryAdministrativeFixtures.length ? "EXECUTED" : "FAILED";
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = output.status === "EXECUTED" ? 0 : 1;
} catch (error) {
  const errorName = error instanceof Error ? error.constructor.name : "UnknownError";
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
  const credentialsBlocked =
    /credential|access key|security token|unauthori[sz]|authentication|api key|token/.test(
      errorMessage,
    );

  output.status = credentialsBlocked ? "BLOCKED_CREDENTIALS" : "FAILED_PROVIDER_OR_SDK";
  output.errorType = errorName;
  output.notes = credentialsBlocked
    ? "The selected provider reported missing or unusable credentials. No error text was recorded."
    : "The live smoke stopped without recording provider error text; inspect the local run if diagnosis is needed.";
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = credentialsBlocked ? 2 : 1;
}

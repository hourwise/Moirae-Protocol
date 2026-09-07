import { isIP } from "node:net";

export const MP08B_RUNTIME_DESCRIPTOR_VERSION = "mp08b-runtime-descriptor-v1" as const;
export const MP08B_HEALTH_VERSION = "mp08b-health-v1" as const;
export const MP08B_READINESS_VERSION = "mp08b-readiness-v1" as const;
export const MP08B_RUNTIME_MODE = "SYNTHETIC_LOCAL_DEMO" as const;
export const MP08B_DEFAULT_HOST = "127.0.0.1" as const;
export const MP08B_DEFAULT_PORT = 3000 as const;

const SHA1_HEX = /^[a-f0-9]{40}$/i;
const BUILD_ID = /^[A-Za-z0-9._-]{1,128}$/;
const HOSTNAME = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;

export type Mp08bRuntimeCapabilitiesV1 = Readonly<{
  readonly liveStrands: false;
  readonly liveFates: false;
  readonly durableApproval: false;
  readonly hostedDurableQueue: false;
  readonly externalEffects: false;
}>;

export type Mp08bRuntimeIdentityV1 = Readonly<{
  readonly schemaVersion: typeof MP08B_RUNTIME_DESCRIPTOR_VERSION;
  readonly mode: typeof MP08B_RUNTIME_MODE;
  readonly buildId: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly capabilities: Mp08bRuntimeCapabilitiesV1;
}>;

export type Mp08bRuntimeConfigV1 = Readonly<{
  readonly host: string;
  readonly port: number;
  readonly runtime: Mp08bRuntimeIdentityV1;
}>;

export class Mp08bRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Mp08bRuntimeConfigurationError";
  }
}

const SYNTHETIC_CAPABILITIES: Mp08bRuntimeCapabilitiesV1 = Object.freeze({
  liveStrands: false,
  liveFates: false,
  durableApproval: false,
  hostedDurableQueue: false,
  externalEffects: false,
});

function identityValue(value: string | undefined, pattern: RegExp, label: string): string {
  if (value === undefined || value === "") return "unbound";
  if (!pattern.test(value))
    throw new Mp08bRuntimeConfigurationError(`${label} has an invalid format.`);
  return value;
}

export function createSyntheticRuntimeIdentity(
  env: NodeJS.ProcessEnv = process.env,
): Mp08bRuntimeIdentityV1 {
  return Object.freeze({
    schemaVersion: MP08B_RUNTIME_DESCRIPTOR_VERSION,
    mode: MP08B_RUNTIME_MODE,
    buildId: identityValue(env.MOIRAE_BUILD_ID, BUILD_ID, "MOIRAE_BUILD_ID"),
    sourceCommit: identityValue(env.MOIRAE_BUILD_COMMIT, SHA1_HEX, "MOIRAE_BUILD_COMMIT"),
    sourceTree: identityValue(env.MOIRAE_BUILD_TREE, SHA1_HEX, "MOIRAE_BUILD_TREE"),
    capabilities: SYNTHETIC_CAPABILITIES,
  });
}

function parseHost(value: string | undefined): string {
  const host = value === undefined ? MP08B_DEFAULT_HOST : value.trim();
  if (!host || /\s|:\/\//.test(host) || (isIP(host) === 0 && !HOSTNAME.test(host)))
    throw new Mp08bRuntimeConfigurationError("HOST must be a valid hostname or IP address.");
  return host;
}

function parsePort(value: string | undefined): number {
  const portText = value === undefined ? String(MP08B_DEFAULT_PORT) : value;
  if (!/^\d+$/.test(portText))
    throw new Mp08bRuntimeConfigurationError("PORT must be an integer from 1 to 65535.");
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
    throw new Mp08bRuntimeConfigurationError("PORT must be an integer from 1 to 65535.");
  return port;
}

export function parseMp08bRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): Mp08bRuntimeConfigV1 {
  return Object.freeze({
    host: parseHost(env.HOST),
    port: parsePort(env.PORT),
    runtime: createSyntheticRuntimeIdentity(env),
  });
}

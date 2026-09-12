import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  MP03_DEPENDENCY_PROVENANCE,
  MP03_POLICY_VERSION,
  type FatesAdmissionGateway,
  type Mp03TrustedAdministrativeProfileConfig,
  createMp03AdmissionAdapter,
  type Mp03AdmissionAdapter,
} from "../../../packages/fates-adapter/src/index.js";

export const MP08B_FATES_MATERIALIZATION_VERSION = "mp08b-fates-materialization-v1" as const;

export const MP08B_VERIFIED_FATES_PROVENANCE = Object.freeze({
  repositoryUrl: "https://github.com/hourwise/Project-Ananke.git",
  tag: "ananke-fates-006c-trusted-recipient-admission-v0.1.0-protocol-1.4.0",
  tagObjectSha: "4ecb4baddc92d01cabd43f9692966cbb70d703b0",
  commitSha: "7ce078863edde033d96a896d7e23e11a0a24292b",
  treeSha: "d237005b96fc1c69818448d5a443a8bf7703f37f",
  implementationCommitSha: "e96f27008891b9a5d00cb77e4f2f0c1c87f77efb",
  implementationTreeSha: "06639f5a27f7810cb10881631f2b0e9e5b10bf93",
  durableApprovalAncestorSha: "b888d61adf180d33e2ae2e61d276cb9b0f13bd12",
  runtimeSha: "c89b83de40ed0275969fe3931220f440bf082aa3",
  contractProfile: MP03_DEPENDENCY_PROVENANCE.profile,
  license: "MIT",
  materializationMechanism: "VERIFIED_EXTERNAL_CHECKOUT_WITH_BUILT_RUNTIME",
} as const);

export type Mp08bVerifiedFatesMaterializationIdentity = Readonly<{
  readonly schemaVersion: typeof MP08B_FATES_MATERIALIZATION_VERSION;
  readonly repositoryUrl: typeof MP08B_VERIFIED_FATES_PROVENANCE.repositoryUrl;
  readonly tag: typeof MP08B_VERIFIED_FATES_PROVENANCE.tag;
  readonly tagObjectSha: typeof MP08B_VERIFIED_FATES_PROVENANCE.tagObjectSha;
  readonly commitSha: typeof MP08B_VERIFIED_FATES_PROVENANCE.commitSha;
  readonly treeSha: typeof MP08B_VERIFIED_FATES_PROVENANCE.treeSha;
  readonly implementationCommitSha: typeof MP08B_VERIFIED_FATES_PROVENANCE.implementationCommitSha;
  readonly implementationTreeSha: typeof MP08B_VERIFIED_FATES_PROVENANCE.implementationTreeSha;
  readonly durableApprovalAncestorSha: typeof MP08B_VERIFIED_FATES_PROVENANCE.durableApprovalAncestorSha;
  readonly runtimeSha: typeof MP08B_VERIFIED_FATES_PROVENANCE.runtimeSha;
  readonly contractProfile: typeof MP08B_VERIFIED_FATES_PROVENANCE.contractProfile;
  readonly license: typeof MP08B_VERIFIED_FATES_PROVENANCE.license;
  readonly materializationMechanism: typeof MP08B_VERIFIED_FATES_PROVENANCE.materializationMechanism;
  readonly root: string;
}>;

export type Mp08bVerifiedFatesDependency = Readonly<{
  readonly boundary: "MP03_FATES_ADMISSION";
  readonly runtimeKind: "VERIFIED_EXTERNAL";
  readonly admission: Mp03AdmissionAdapter;
  readonly materialization: Mp08bVerifiedFatesMaterializationIdentity;
}>;

export class Mp08bFatesMaterializationError extends Error {
  readonly code = "FATES_MATERIALIZATION_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "Mp08bFatesMaterializationError";
  }
}

type NativeAuditModule = Readonly<{
  readonly AuditLog: new () => unknown;
}>;

type NativeGateway = Readonly<{
  readonly admit: (...args: unknown[]) => Promise<unknown>;
  readonly policy: Readonly<{
    readonly loadConfig: (config: unknown) => void;
  }>;
}>;

type NativeRuntimeModule = Readonly<{
  readonly Gateway: new (config: Record<string, unknown>) => NativeGateway;
  readonly registerMoiraeAdministrativeOperationProfile: (
    gateway: NativeGateway,
    config?: Mp03TrustedAdministrativeProfileConfig,
  ) => void;
  readonly hashNativeAction: NonNullable<FatesAdmissionGateway["hashNativeAction"]>;
  readonly MOIRAE_ADMINISTRATIVE_POLICY_CONFIG: unknown;
}>;

export type Mp08bTrustedRecipientAuthorityConfig = Readonly<{
  readonly moirae: Mp03TrustedAdministrativeProfileConfig;
  readonly fates: Mp03TrustedAdministrativeProfileConfig;
}>;

export function assertTrustedRecipientPolicyIdentity(
  config: Mp08bTrustedRecipientAuthorityConfig | undefined,
): void {
  const legacyRecipient = "alex@example.test";
  const moiraeRecipient = config?.moirae.appointmentDetailsRecipient ?? legacyRecipient;
  const fatesRecipient = config?.fates.appointmentDetailsRecipient ?? legacyRecipient;
  if (moiraeRecipient !== fatesRecipient) {
    throw new Mp08bFatesMaterializationError(
      "TRUSTED_RECIPIENT_POLICY_MISMATCH: Moirae and Fates trusted recipient policies differ.",
    );
  }
}

function verifyAncestor(root: string, ancestor: string, descendant: string, label: string): void {
  try {
    const safeRoot = root.replaceAll("\\", "/");
    execFileSync(
      "git",
      [
        "-c",
        `safe.directory=${safeRoot}`,
        "-C",
        root,
        "merge-base",
        "--is-ancestor",
        ancestor,
        descendant,
      ],
      { stdio: "ignore" },
    );
  } catch {
    throw new Mp08bFatesMaterializationError(`${label} ancestry verification failed.`);
  }
}

function runGit(root: string, args: readonly string[]): string {
  try {
    const safeRoot = root.replaceAll("\\", "/");
    return execFileSync("git", ["-c", `safe.directory=${safeRoot}`, "-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Mp08bFatesMaterializationError(
      `The external Fates checkout failed Git verification: ${args.join(" ")}.`,
    );
  }
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function requiredFile(root: string, relativePath: string): void {
  if (!existsSync(join(root, relativePath))) {
    throw new Mp08bFatesMaterializationError(
      `The verified Fates checkout is missing its built runtime file: ${relativePath}.`,
    );
  }
}

/**
 * Verifies a local external checkout before any authority module is imported.
 * The path is only a locator; the exact tag object, peeled commit, tree, remote,
 * and clean working tree establish the materialization identity.
 */
export function verifyMp08bVerifiedFatesCheckout(
  rootInput: string,
): Mp08bVerifiedFatesMaterializationIdentity {
  const root = resolve(rootInput);
  if (!existsSync(root)) {
    throw new Mp08bFatesMaterializationError("FATES_ANANKE_ROOT does not exist.");
  }

  if (!samePath(runGit(root, ["rev-parse", "--show-toplevel"]), root)) {
    throw new Mp08bFatesMaterializationError(
      "FATES_ANANKE_ROOT is not the root of the Git checkout being verified.",
    );
  }

  if (
    runGit(root, ["remote", "get-url", "origin"]).replace(/\.git$/, "") !==
    MP08B_VERIFIED_FATES_PROVENANCE.repositoryUrl.replace(/\.git$/, "")
  ) {
    throw new Mp08bFatesMaterializationError("The external Fates origin is not Project-Ananke.");
  }

  if (runGit(root, ["status", "--porcelain", "--untracked-files=all"])) {
    throw new Mp08bFatesMaterializationError("The external Fates checkout is not clean.");
  }

  if (runGit(root, ["rev-parse", "HEAD"]) !== MP08B_VERIFIED_FATES_PROVENANCE.commitSha) {
    throw new Mp08bFatesMaterializationError(
      "The external Fates checkout HEAD is not accepted FATES-006C.",
    );
  }
  if (
    runGit(root, ["rev-parse", `refs/tags/${MP08B_VERIFIED_FATES_PROVENANCE.tag}`]) !==
    MP08B_VERIFIED_FATES_PROVENANCE.tagObjectSha
  ) {
    throw new Mp08bFatesMaterializationError(
      "The external Fates tag object is not the accepted one.",
    );
  }
  if (
    runGit(root, ["rev-parse", `refs/tags/${MP08B_VERIFIED_FATES_PROVENANCE.tag}^{}`]) !==
    MP08B_VERIFIED_FATES_PROVENANCE.commitSha
  ) {
    throw new Mp08bFatesMaterializationError("The external Fates tag does not peel to FATES-006C.");
  }
  if (
    runGit(root, ["show", "-s", "--format=%T", MP08B_VERIFIED_FATES_PROVENANCE.commitSha]) !==
    MP08B_VERIFIED_FATES_PROVENANCE.treeSha
  ) {
    throw new Mp08bFatesMaterializationError(
      "The external Fates tree is not the accepted FATES-006C tree.",
    );
  }
  if (
    runGit(root, [
      "show",
      "-s",
      "--format=%T",
      MP08B_VERIFIED_FATES_PROVENANCE.implementationCommitSha,
    ]) !== MP08B_VERIFIED_FATES_PROVENANCE.implementationTreeSha
  ) {
    throw new Mp08bFatesMaterializationError(
      "The FATES-006C implementation tree is not the independently accepted tree.",
    );
  }
  if (
    runGit(root, [
      "diff",
      "--name-only",
      MP08B_VERIFIED_FATES_PROVENANCE.implementationCommitSha,
      MP08B_VERIFIED_FATES_PROVENANCE.commitSha,
      "--",
      "packages",
    ])
  ) {
    throw new Mp08bFatesMaterializationError(
      "FATES006C_RUNTIME_SOURCE_EQUIVALENT_TO_ACCEPTED_IMPLEMENTATION verification failed.",
    );
  }
  verifyAncestor(
    root,
    MP08B_VERIFIED_FATES_PROVENANCE.implementationCommitSha,
    MP08B_VERIFIED_FATES_PROVENANCE.commitSha,
    "FATES-006C implementation",
  );
  verifyAncestor(
    root,
    MP08B_VERIFIED_FATES_PROVENANCE.durableApprovalAncestorSha,
    MP08B_VERIFIED_FATES_PROVENANCE.commitSha,
    "FATES-008A durable approval capability",
  );
  verifyAncestor(
    root,
    MP08B_VERIFIED_FATES_PROVENANCE.runtimeSha,
    MP08B_VERIFIED_FATES_PROVENANCE.commitSha,
    "Fates runtime",
  );

  requiredFile(root, "packages/runtime-core/dist/index.js");
  requiredFile(root, "packages/runtime-core/dist/admission.js");
  requiredFile(root, "packages/audit-engine/dist/index.js");

  return Object.freeze({
    schemaVersion: MP08B_FATES_MATERIALIZATION_VERSION,
    ...MP08B_VERIFIED_FATES_PROVENANCE,
    root,
  });
}

/**
 * Loads the accepted Ananke admission runtime only after immutable local
 * provenance verification. A missing or unverifiable runtime throws; there is
 * deliberately no test-adapter fallback on this path.
 */
export async function createMp08bVerifiedExternalFatesDependency(
  rootInput = process.env.FATES_ANANKE_ROOT,
  trustedConfig?: Mp08bTrustedRecipientAuthorityConfig,
): Promise<Mp08bVerifiedFatesDependency> {
  if (!rootInput) {
    throw new Mp08bFatesMaterializationError(
      "FATES_ANANKE_ROOT is required for verified external Fates materialization.",
    );
  }

  assertTrustedRecipientPolicyIdentity(trustedConfig);
  const materialization = verifyMp08bVerifiedFatesCheckout(rootInput);
  const runtime = (await import(
    pathToFileURL(join(materialization.root, "packages/runtime-core/dist/index.js")).href
  )) as unknown as NativeRuntimeModule;
  const auditModule = (await import(
    pathToFileURL(join(materialization.root, "packages/audit-engine/dist/index.js")).href
  )) as unknown as NativeAuditModule;

  if (
    typeof runtime.Gateway !== "function" ||
    typeof runtime.registerMoiraeAdministrativeOperationProfile !== "function" ||
    typeof runtime.hashNativeAction !== "function" ||
    !runtime.MOIRAE_ADMINISTRATIVE_POLICY_CONFIG ||
    typeof auditModule.AuditLog !== "function"
  ) {
    throw new Mp08bFatesMaterializationError(
      "The verified Fates checkout does not expose the accepted admission runtime exports.",
    );
  }

  const audit = new auditModule.AuditLog();
  const gateway = new runtime.Gateway({
    developmentMode: true,
    autoLoadPolicy: false,
    audit,
    policyVersion: MP03_POLICY_VERSION,
    approvalTtlMs: 5 * 60 * 1000,
  });
  runtime.registerMoiraeAdministrativeOperationProfile(gateway, trustedConfig?.fates);
  gateway.policy.loadConfig(runtime.MOIRAE_ADMINISTRATIVE_POLICY_CONFIG);

  const nativeGateway: FatesAdmissionGateway = {
    admit: gateway.admit.bind(gateway) as FatesAdmissionGateway["admit"],
    hashNativeAction: runtime.hashNativeAction,
  };

  return Object.freeze({
    boundary: "MP03_FATES_ADMISSION" as const,
    runtimeKind: "VERIFIED_EXTERNAL" as const,
    admission: createMp03AdmissionAdapter(
      nativeGateway,
      MP03_DEPENDENCY_PROVENANCE,
      trustedConfig?.moirae,
    ),
    materialization,
  });
}

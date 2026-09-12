import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  MP03_DEPENDENCY_PROVENANCE,
  Mp03AuthenticatedContextSchema,
  MoiraeAdmissionResultV1Schema,
  createMp03AdmissionAdapter,
  type Mp03AdmissionAdapter,
  type MoiraeAdmissionResultV1,
} from "../../../packages/fates-adapter/src/index.js";
import {
  ActionIntentV1Schema,
  canonicalizeJsonV1,
  type ActionIntentV1,
} from "../../../packages/action-compiler/src/index.js";
import {
  createMp05HumanApprovalCoordinator,
  MP05_FATES_DEPENDENCY_PROVENANCE,
  type Mp05AnankeApprovalPort,
  type Mp05ApprovalPreparationV1,
  type Mp05ApprovalRequestV1,
  type Mp05ApprovalOutcomeV1,
  type Mp05ApprovalObservationV1,
  type Mp05TrustedDecisionContext,
  type Mp05TrustedTimeSource,
} from "../../../packages/human-approval/src/index.js";
import {
  createMp08bComposedRuntime,
  type Mp08bCompositionRequestV1,
  type Mp08bCompositionResult,
  type Mp08bFatesDependency,
  type Mp08bProposalSource,
} from "./composition.js";
import type { Mp04AnankePort } from "../../../packages/execution-coordinator/src/index.js";
import {
  assertTrustedRecipientPolicyIdentity,
  type Mp08bTrustedRecipientAuthorityConfig,
} from "./fates-runtime.js";

export const MP08B_APPROVAL_01_VERSION = "mp08b-approval-01-v1" as const;
export const MP08B_FATES_006C_MATERIALIZATION_VERSION =
  "mp03-fates-006c-materialization-v1" as const;

export const MP08B_FATES_008A_CAPABILITY_PROVENANCE = Object.freeze({
  repositoryUrl: "https://github.com/hourwise/Project-Ananke.git",
  tag: "ananke-fates-008a-durable-human-approval-v0.1.0-protocol-1.4.0",
  tagObjectSha: "0fa08f78f27e2f79c895402f3f53a8aada5837b4",
  commitSha: "b888d61adf180d33e2ae2e61d276cb9b0f13bd12",
  treeSha: "ed5e268e6b3b0630a798b9131341a2c13ef9830f",
  runtimeSha: "c89b83de40ed0275969fe3931220f440bf082aa3",
  contractProfile: MP03_DEPENDENCY_PROVENANCE.profile,
  license: "MIT",
  materializationMechanism: "VERIFIED_EXTERNAL_CHECKOUT_WITH_DURABLE_SQLITE_RUNTIME",
} as const);

export const MP08B_FATES_006C_PROVENANCE = Object.freeze({
  repositoryUrl: "https://github.com/hourwise/Project-Ananke.git",
  tag: "ananke-fates-006c-trusted-recipient-admission-v0.1.0-protocol-1.4.0",
  tagObjectSha: "4ecb4baddc92d01cabd43f9692966cbb70d703b0",
  commitSha: "7ce078863edde033d96a896d7e23e11a0a24292b",
  treeSha: "d237005b96fc1c69818448d5a443a8bf7703f37f",
  implementationCommitSha: "e96f27008891b9a5d00cb77e4f2f0c1c87f77efb",
  implementationTreeSha: "06639f5a27f7810cb10881631f2b0e9e5b10bf93",
  durableApprovalAncestorSha: MP08B_FATES_008A_CAPABILITY_PROVENANCE.commitSha,
  runtimeSha: MP08B_FATES_008A_CAPABILITY_PROVENANCE.runtimeSha,
  contractProfile: MP03_DEPENDENCY_PROVENANCE.profile,
  license: "MIT",
  materializationMechanism: "VERIFIED_EXTERNAL_CHECKOUT_WITH_DURABLE_SQLITE_RUNTIME",
} as const);

export type Mp08bFates006cMaterializationIdentity = Readonly<{
  readonly schemaVersion: typeof MP08B_FATES_006C_MATERIALIZATION_VERSION;
  readonly repositoryUrl: typeof MP08B_FATES_006C_PROVENANCE.repositoryUrl;
  readonly tag: typeof MP08B_FATES_006C_PROVENANCE.tag;
  readonly tagObjectSha: typeof MP08B_FATES_006C_PROVENANCE.tagObjectSha;
  readonly commitSha: typeof MP08B_FATES_006C_PROVENANCE.commitSha;
  readonly treeSha: typeof MP08B_FATES_006C_PROVENANCE.treeSha;
  readonly implementationCommitSha: typeof MP08B_FATES_006C_PROVENANCE.implementationCommitSha;
  readonly implementationTreeSha: typeof MP08B_FATES_006C_PROVENANCE.implementationTreeSha;
  readonly durableApprovalAncestorSha: typeof MP08B_FATES_006C_PROVENANCE.durableApprovalAncestorSha;
  readonly runtimeSha: typeof MP08B_FATES_006C_PROVENANCE.runtimeSha;
  readonly contractProfile: typeof MP08B_FATES_006C_PROVENANCE.contractProfile;
  readonly license: typeof MP08B_FATES_006C_PROVENANCE.license;
  readonly materializationMechanism: typeof MP08B_FATES_006C_PROVENANCE.materializationMechanism;
  readonly root: string;
}>;

export const TRUSTED_LOCAL_OPERATOR_CONTEXT = Object.freeze({
  mode: "TRUSTED_LOCAL_OPERATOR_CONTEXT",
  operatorId: "moirae-local-operator",
  sessionId: "moirae-local-operator-session",
} as const);

export type Mp08bApprovalCapabilitiesV1 = Readonly<{
  readonly liveFates: boolean;
  readonly liveStrands: boolean;
  readonly durableApproval: boolean;
  readonly hostedDurableQueue: false;
  readonly externalEffects: false;
}>;

export class Mp08bApprovalRuntimeError extends Error {
  readonly code = "MP08B_APPROVAL_RUNTIME_FAILURE" as const;

  constructor(message: string) {
    super(message);
    this.name = "Mp08bApprovalRuntimeError";
  }
}

type RealApprovalStore = {
  readonly durable: boolean;
  readonly store: { readonly durable: boolean };
  get(id: string, now?: string): unknown;
  decide(
    id: string,
    decision: "approve" | "reject",
    operator: unknown,
    now: string,
    presentationBindingHash?: string,
  ): unknown;
};

type RealGateway = {
  readonly approvals: RealApprovalStore;
  readonly policy: { loadConfig(config: unknown): void };
  admit(
    operation: unknown,
    args: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<unknown>;
  createExecutionAuthority(
    operation: unknown,
    args: Record<string, unknown>,
    admission: unknown,
    options: Record<string, unknown>,
  ): unknown;
  close(): void;
};

type RealRuntimeModule = {
  readonly Gateway: new (config: Record<string, unknown>) => RealGateway;
  readonly FileDurableAuthorityStore: new (options: { filePath: string }) => unknown;
  readonly hashArgumentsDigest: (args: Record<string, unknown>) => string;
  readonly hashTargetDigest: (resourceScope: Record<string, unknown>) => string;
  readonly hashNativeAction: (
    operation: Parameters<RealGateway["admit"]>[0],
    args: Record<string, unknown>,
    executionContext: Parameters<
      NonNullable<
        import("../../../packages/fates-adapter/src/index.js").FatesAdmissionGateway["hashNativeAction"]
      >
    >[2],
  ) => string;
};

type RealProfileModule = {
  readonly MOIRAE_ADMINISTRATIVE_POLICY_CONFIG: unknown;
  readonly registerMoiraeAdministrativeOperationProfile: (
    gateway: RealGateway,
    config?: Mp08bTrustedRecipientAuthorityConfig["fates"],
  ) => void;
};

type RealAuditModule = { readonly AuditLog: new () => unknown };

type RealHashModule = {
  readonly hashApprovalAction: (material: Record<string, unknown>) => string;
  readonly hashApprovalPresentationBinding: (
    approvalId: string,
    actionHash: string,
    presentationVersion?: string,
  ) => string;
};

function runGit(root: string, args: readonly string[]): string {
  try {
    const safeRoot = root.replaceAll("\\", "/");
    return execFileSync("git", ["-c", `safe.directory=${safeRoot}`, "-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Mp08bApprovalRuntimeError(
      `The FATES-008A checkout failed Git verification: ${args.join(" ")}.`,
    );
  }
}

function requiredFile(root: string, relativePath: string): void {
  if (!existsSync(join(root, relativePath)))
    throw new Mp08bApprovalRuntimeError(
      `The FATES-008A checkout is missing required runtime material: ${relativePath}.`,
    );
}

function verifyAncestor(root: string, ancestor: string, descendant: string): void {
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
    throw new Mp08bApprovalRuntimeError(
      `The FATES-008A runtime checkpoint ${ancestor} is not an ancestor of ${descendant}.`,
    );
  }
}

export function verifyMp08bFates006cCheckout(
  rootInput: string,
): Mp08bFates006cMaterializationIdentity {
  const root = resolve(rootInput);
  if (!existsSync(root)) throw new Mp08bApprovalRuntimeError("FATES-006C root does not exist.");
  if (resolve(runGit(root, ["rev-parse", "--show-toplevel"])) !== root)
    throw new Mp08bApprovalRuntimeError("FATES-006C root is not the Git checkout being verified.");
  if (
    runGit(root, ["remote", "get-url", "origin"]).replace(/\.git$/, "") !==
    MP08B_FATES_006C_PROVENANCE.repositoryUrl.replace(/\.git$/, "")
  )
    throw new Mp08bApprovalRuntimeError("FATES-006C origin is not Project-Ananke.");
  if (runGit(root, ["status", "--porcelain", "--untracked-files=all"]))
    throw new Mp08bApprovalRuntimeError("FATES-006C checkout is not clean.");
  if (runGit(root, ["rev-parse", "HEAD"]) !== MP08B_FATES_006C_PROVENANCE.commitSha)
    throw new Mp08bApprovalRuntimeError("FATES-006C checkout is not the accepted commit.");
  if (
    runGit(root, ["rev-parse", `refs/tags/${MP08B_FATES_006C_PROVENANCE.tag}`]) !==
    MP08B_FATES_006C_PROVENANCE.tagObjectSha
  )
    throw new Mp08bApprovalRuntimeError("FATES-006C tag object is not the accepted tag object.");
  if (
    runGit(root, ["rev-parse", `refs/tags/${MP08B_FATES_006C_PROVENANCE.tag}^{}`]) !==
    MP08B_FATES_006C_PROVENANCE.commitSha
  )
    throw new Mp08bApprovalRuntimeError("FATES-006C tag does not peel to the accepted commit.");
  if (
    runGit(root, ["show", "-s", "--format=%T", MP08B_FATES_006C_PROVENANCE.commitSha]) !==
    MP08B_FATES_006C_PROVENANCE.treeSha
  )
    throw new Mp08bApprovalRuntimeError("FATES-006C tree is not the accepted tree.");
  if (
    runGit(root, [
      "show",
      "-s",
      "--format=%T",
      MP08B_FATES_006C_PROVENANCE.implementationCommitSha,
    ]) !== MP08B_FATES_006C_PROVENANCE.implementationTreeSha
  )
    throw new Mp08bApprovalRuntimeError("FATES-006C implementation tree is not accepted.");
  if (
    runGit(root, [
      "diff",
      "--name-only",
      MP08B_FATES_006C_PROVENANCE.implementationCommitSha,
      MP08B_FATES_006C_PROVENANCE.commitSha,
      "--",
      "packages",
    ])
  )
    throw new Mp08bApprovalRuntimeError(
      "FATES006C_RUNTIME_SOURCE_EQUIVALENT_TO_ACCEPTED_IMPLEMENTATION verification failed.",
    );
  verifyAncestor(
    root,
    MP08B_FATES_006C_PROVENANCE.implementationCommitSha,
    MP08B_FATES_006C_PROVENANCE.commitSha,
  );
  verifyAncestor(
    root,
    MP08B_FATES_006C_PROVENANCE.durableApprovalAncestorSha,
    MP08B_FATES_006C_PROVENANCE.commitSha,
  );
  verifyAncestor(
    root,
    MP08B_FATES_006C_PROVENANCE.runtimeSha,
    MP08B_FATES_006C_PROVENANCE.commitSha,
  );

  for (const file of [
    "packages/runtime-core/dist/index.js",
    "packages/runtime-core/dist/moirae-administrative-profile.js",
    "packages/authority-engine/dist/index.js",
    "packages/audit-engine/dist/index.js",
    "node_modules/better-sqlite3",
  ])
    requiredFile(root, file);

  return Object.freeze({
    schemaVersion: MP08B_FATES_006C_MATERIALIZATION_VERSION,
    ...MP08B_FATES_006C_PROVENANCE,
    root,
  });
}

const bindingSchema = z
  .object({
    schemaVersion: z.literal("mp08b-approval-binding-v1"),
    approvalId: z.string().trim().min(1).max(200),
    intent: z.unknown(),
    authenticatedContext: z.unknown(),
    waitingAdmission: z.unknown(),
    bindingDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const bindingStateSchema = z
  .object({
    schemaVersion: z.literal("mp08b-approval-bindings-v1"),
    records: z.record(z.string(), bindingSchema),
  })
  .strict();

export type Mp08bApprovalBindingV1 = Readonly<{
  readonly schemaVersion: "mp08b-approval-binding-v1";
  readonly approvalId: string;
  readonly intent: ActionIntentV1;
  readonly authenticatedContext: unknown;
  readonly waitingAdmission: unknown;
  readonly bindingDigest: string;
}>;

function bindingDigest(value: Omit<Mp08bApprovalBindingV1, "bindingDigest">): string {
  return createHash("sha256").update(canonicalizeJsonV1(value), "utf8").digest("hex");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertSafeStorePath(pathInput: string): string {
  if (!isAbsolute(pathInput))
    throw new Mp08bApprovalRuntimeError("The MP-08B approval binding store path must be absolute.");
  const path = resolve(pathInput);
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  if (lstatSync(parent).isSymbolicLink())
    throw new Mp08bApprovalRuntimeError(
      "The MP-08B approval binding store parent cannot be a symlink.",
    );
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw new Mp08bApprovalRuntimeError("The MP-08B approval binding store cannot be a symlink.");
  return path;
}

/**
 * Host-owned durable correlation material. It is not approval truth: native
 * FATES-008A remains authoritative for approval status and decisions. This
 * file preserves the exact ActionIntent/context needed to rebind that native
 * record after a process restart without adding a second approval authority.
 */
export class Mp08bDurableApprovalBindingStore {
  private readonly path: string;

  constructor(path: string) {
    this.path = assertSafeStorePath(path);
  }

  put(request: Mp05ApprovalRequestV1): Mp08bApprovalBindingV1 {
    const intent = ActionIntentV1Schema.parse(request.intent);
    const authenticatedContext = Mp03AuthenticatedContextSchema.parse(request.authenticatedContext);
    const waitingAdmission = MoiraeAdmissionResultV1Schema.parse(request.waitingAdmission);
    if (waitingAdmission.status !== "WAITING_FOR_APPROVAL")
      throw new Mp08bApprovalRuntimeError(
        "Only a real MP-03 WAITING_FOR_APPROVAL request can be durably bound.",
      );
    const base = {
      schemaVersion: "mp08b-approval-binding-v1" as const,
      approvalId: waitingAdmission.approvalId,
      intent,
      authenticatedContext,
      waitingAdmission,
    };
    const record = { ...base, bindingDigest: bindingDigest(base) } satisfies Mp08bApprovalBindingV1;
    const state = this.readState();
    const existing = state.records[record.approvalId];
    if (existing && canonicalizeJsonV1(existing) !== canonicalizeJsonV1(record))
      throw new Mp08bApprovalRuntimeError(
        "The approval ID is already bound to different ActionIntent material.",
      );
    if (!existing) {
      this.writeState({
        schemaVersion: "mp08b-approval-bindings-v1",
        records: { ...state.records, [record.approvalId]: record },
      });
    }
    return clone(record);
  }

  get(approvalId: string): Mp08bApprovalBindingV1 | undefined {
    const record = this.readState().records[approvalId];
    return record ? clone(this.parseRecord(record)) : undefined;
  }

  private parseRecord(value: unknown): Mp08bApprovalBindingV1 {
    const parsed = bindingSchema.parse(value);
    const intent = ActionIntentV1Schema.parse(parsed.intent);
    const authenticatedContext = Mp03AuthenticatedContextSchema.parse(parsed.authenticatedContext);
    const waitingAdmission = MoiraeAdmissionResultV1Schema.parse(parsed.waitingAdmission);
    if (
      waitingAdmission.status !== "WAITING_FOR_APPROVAL" ||
      waitingAdmission.approvalId !== parsed.approvalId
    )
      throw new Mp08bApprovalRuntimeError(
        "The durable approval binding is not an exact waiting admission.",
      );
    const base = {
      schemaVersion: parsed.schemaVersion,
      approvalId: parsed.approvalId,
      intent,
      authenticatedContext,
      waitingAdmission,
    };
    if (bindingDigest(base) !== parsed.bindingDigest)
      throw new Mp08bApprovalRuntimeError("The durable approval binding checksum does not verify.");
    return { ...base, bindingDigest: parsed.bindingDigest };
  }

  private readState(): {
    schemaVersion: "mp08b-approval-bindings-v1";
    records: Record<string, unknown>;
  } {
    if (!existsSync(this.path)) return { schemaVersion: "mp08b-approval-bindings-v1", records: {} };
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.path, "utf8")) as unknown;
    } catch {
      throw new Mp08bApprovalRuntimeError("The durable approval binding store is unreadable.");
    }
    const parsed = bindingStateSchema.safeParse(raw);
    if (!parsed.success)
      throw new Mp08bApprovalRuntimeError("The durable approval binding store is malformed.");
    for (const record of Object.values(parsed.data.records)) this.parseRecord(record);
    return parsed.data;
  }

  private writeState(state: unknown): void {
    const temporaryPath = `${this.path}.tmp-${process.pid}`;
    const fd = openSync(temporaryPath, "w");
    try {
      writeFileSync(fd, `${canonicalizeJsonV1(state)}\n`, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporaryPath, this.path);
  }
}

export type Mp08bApprovalRuntimeOptions = Readonly<{
  readonly fatesRoot: string;
  readonly approvalStorePath: string;
  readonly executionAuthorityStorePath?: string;
  readonly bindingStorePath: string;
  readonly proposal: Mp08bProposalSource;
  readonly trustedTime: Mp05TrustedTimeSource;
  readonly trustedOperator?: Mp05TrustedDecisionContext;
  readonly trustedRecipientPolicy?: Mp08bTrustedRecipientAuthorityConfig;
}>;

export type Mp08bPreparedApprovalV1 = Readonly<{
  readonly composition: Mp08bCompositionResult;
  readonly request: Mp05ApprovalRequestV1;
  readonly preparation: Mp05ApprovalPreparationV1;
  readonly binding: Mp08bApprovalBindingV1;
}>;

export type Mp08bApprovedAdmissionV1 = Readonly<{
  readonly binding: Mp08bApprovalBindingV1;
  readonly approval: Mp05ApprovalObservationV1;
  readonly admission: Extract<MoiraeAdmissionResultV1, { status: "ADMITTED" }>;
}>;

export class Mp08bDurableApprovalRuntime {
  readonly mode = "COMPOSED_LOCAL_DURABLE_APPROVAL" as const;
  readonly capabilities: Mp08bApprovalCapabilitiesV1;

  private constructor(
    private readonly gateway: RealGateway,
    private readonly composition: ReturnType<typeof createMp08bComposedRuntime>,
    private readonly coordinator: ReturnType<typeof createMp05HumanApprovalCoordinator>,
    private readonly admission: Mp03AdmissionAdapter,
    private readonly ananke: Mp04AnankePort,
    private readonly bindings: Mp08bDurableApprovalBindingStore,
    private readonly trustedOperator: Mp05TrustedDecisionContext,
    private readonly trustedTime: Mp05TrustedTimeSource,
    readonly materialization: Mp08bFates006cMaterializationIdentity,
  ) {
    this.capabilities = Object.freeze({
      liveFates: true,
      liveStrands: composition.capabilities.liveStrands,
      durableApproval: true,
      hostedDurableQueue: false,
      externalEffects: false,
    });
  }

  static async create(options: Mp08bApprovalRuntimeOptions): Promise<Mp08bDurableApprovalRuntime> {
    assertTrustedRecipientPolicyIdentity(options.trustedRecipientPolicy);
    const materialization = verifyMp08bFates006cCheckout(options.fatesRoot);
    const runtime = (await import(
      pathToFileURL(join(materialization.root, "packages/runtime-core/dist/index.js")).href
    )) as unknown as RealRuntimeModule;
    const profile = (await import(
      pathToFileURL(
        join(materialization.root, "packages/runtime-core/dist/moirae-administrative-profile.js"),
      ).href
    )) as unknown as RealProfileModule;
    const audit = (await import(
      pathToFileURL(join(materialization.root, "packages/audit-engine/dist/index.js")).href
    )) as unknown as RealAuditModule;
    const hashes = (await import(
      pathToFileURL(join(materialization.root, "packages/authority-engine/dist/index.js")).href
    )) as unknown as RealHashModule;

    const authorityStorePath = assertSafeStorePath(
      options.executionAuthorityStorePath ?? `${options.approvalStorePath}.authority.json`,
    );
    const authorityStore = new runtime.FileDurableAuthorityStore({
      filePath: authorityStorePath,
    });

    const gateway = new runtime.Gateway({
      developmentMode: true,
      autoLoadPolicy: false,
      audit: new audit.AuditLog(),
      policyVersion: "builtin:0.1.0",
      approvalTtlMs: 5 * 60 * 1000,
      durableApproval: {
        required: true,
        storePath: assertSafeStorePath(options.approvalStorePath),
        requirePresentationBinding: true,
      },
      claimAwareExecution: {
        authorityStore,
        trustedTime: { now: () => options.trustedTime.now() },
      },
    });
    profile.registerMoiraeAdministrativeOperationProfile(
      gateway,
      options.trustedRecipientPolicy?.fates,
    );
    gateway.policy.loadConfig(profile.MOIRAE_ADMINISTRATIVE_POLICY_CONFIG);
    if (gateway.approvals.store.durable !== true) {
      gateway.close();
      throw new Mp08bApprovalRuntimeError(
        "FATES-008A did not initialize its explicitly required durable approval store.",
      );
    }

    const nativeApproval: Mp05AnankeApprovalPort = {
      getApproval: (approvalId, now) => gateway.approvals.get(approvalId, now),
      decideApproval: (input) =>
        gateway.approvals.decide(
          input.approvalId,
          input.decision,
          input.operator,
          input.now,
          input.presentationBindingHash,
        ),
      deriveApprovalHashes: (material) => {
        const { approvalId, presentationVersion, ...actionMaterial } = material;
        const actionHash = hashes.hashApprovalAction(
          actionMaterial as unknown as Record<string, unknown>,
        );
        return {
          actionHash,
          ...(presentationVersion
            ? {
                presentationBindingHash: hashes.hashApprovalPresentationBinding(
                  approvalId,
                  actionHash,
                  presentationVersion,
                ),
              }
            : {}),
        };
      },
      deriveNativeActionHash: runtime.hashNativeAction,
    };
    const admission = createMp03AdmissionAdapter(
      { admit: gateway.admit.bind(gateway), hashNativeAction: runtime.hashNativeAction },
      MP03_DEPENDENCY_PROVENANCE,
      options.trustedRecipientPolicy?.moirae,
    );
    const ananke: Mp04AnankePort = {
      createExecutionAuthority: (input) => {
        const approval = input.admission.approvalGrantId
          ? gateway.approvals.get(input.admission.approvalGrantId, input.now)
          : undefined;
        const grant =
          approval && typeof approval === "object" && !Array.isArray(approval)
            ? (approval as Record<string, unknown>)
            : undefined;
        if (input.admission.approvalGrantId && !grant)
          throw new Mp08bApprovalRuntimeError(
            "The approved native grant was not available for the MP-04 authority handoff.",
          );
        return gateway.createExecutionAuthority(
          input.operation,
          input.args,
          {
            status: "ADMITTED",
            decision: "ALLOW",
            operation: input.operation,
            actionHash: input.admission.actionHash,
            ...(grant
              ? {
                  approvalGrantId: grant.id,
                  approvalActionHash: grant.actionHash,
                  approvalExpiresAt: grant.expiresAt,
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
      hashArgumentsDigest: runtime.hashArgumentsDigest,
      hashTargetDigest: runtime.hashTargetDigest,
    };
    const fates: Mp08bFatesDependency = {
      boundary: "MP03_FATES_ADMISSION",
      runtimeKind: "VERIFIED_EXTERNAL",
      admission,
    };
    const composition = createMp08bComposedRuntime({ proposal: options.proposal, fates });
    const coordinator = createMp05HumanApprovalCoordinator({
      approval: nativeApproval,
      admission,
      // APPROVAL-01 has no execution path. This guard is deliberately never
      // called by submitDecisionOnly and fails closed if misused.
      execution: {
        executeAdmittedAction: async () => {
          throw new Mp08bApprovalRuntimeError("MP08B_APPROVAL_01 stops before MP-04 execution.");
        },
      },
      trustedTime: options.trustedTime,
      provenance: MP05_FATES_DEPENDENCY_PROVENANCE,
    });
    return new Mp08bDurableApprovalRuntime(
      gateway,
      composition,
      coordinator,
      admission,
      ananke,
      new Mp08bDurableApprovalBindingStore(options.bindingStorePath),
      options.trustedOperator ?? { operator: TRUSTED_LOCAL_OPERATOR_CONTEXT },
      options.trustedTime,
      materialization,
    );
  }

  async prepareApproval(input: Mp08bCompositionRequestV1): Promise<Mp08bPreparedApprovalV1> {
    const composition = await this.composition.compose(input);
    if (
      composition.status !== "COMPOSED" ||
      composition.admission.status !== "WAITING_FOR_APPROVAL"
    )
      throw new Mp08bApprovalRuntimeError(
        "Approval preparation requires the real Fates REQUIRE_APPROVAL result.",
      );
    const request: Mp05ApprovalRequestV1 = {
      intent: composition.actionIntent,
      authenticatedContext: input.authenticatedContext,
      waitingAdmission: composition.admission,
    };
    const preparation = await this.coordinator.prepareApproval(request);
    const binding = this.bindings.put(request);
    return { composition, request, preparation, binding };
  }

  async refreshApproval(approvalId: string): Promise<Mp05ApprovalPreparationV1> {
    const binding = this.bindings.get(approvalId);
    if (!binding)
      throw new Mp08bApprovalRuntimeError("No durable host binding exists for the approval.");
    return this.coordinator.prepareApproval({
      intent: binding.intent,
      authenticatedContext: binding.authenticatedContext,
      waitingAdmission: binding.waitingAdmission,
    });
  }

  getApprovalBinding(approvalId: string): Mp08bApprovalBindingV1 | undefined {
    return this.bindings.get(approvalId);
  }

  async readApproval(approvalId: string): Promise<Mp05ApprovalObservationV1> {
    const binding = this.bindings.get(approvalId);
    if (!binding)
      throw new Mp08bApprovalRuntimeError("No durable host binding exists for the approval.");
    return this.coordinator.readApprovalOnly({
      intent: binding.intent,
      authenticatedContext: binding.authenticatedContext,
      waitingAdmission: binding.waitingAdmission,
    });
  }

  /**
   * Re-read approved MP-05 truth and request the existing MP-03 adapter to
   * produce the exact ADMITTED handoff required by MP-04. No client material
   * participates in this transition.
   */
  async admitApproved(approvalId: string): Promise<Mp08bApprovedAdmissionV1> {
    const binding = this.bindings.get(approvalId);
    if (!binding)
      throw new Mp08bApprovalRuntimeError("No durable host binding exists for the approval.");
    const approval = await this.readApproval(approvalId);
    if (approval.state !== "APPROVED" || !approval.decisionId)
      throw new Mp08bApprovalRuntimeError(
        "Only a durably reread APPROVED MP-05 record with a decision identity may enter MP-04.",
      );
    const waiting = MoiraeAdmissionResultV1Schema.safeParse(binding.waitingAdmission);
    if (!waiting.success || waiting.data.status !== "WAITING_FOR_APPROVAL")
      throw new Mp08bApprovalRuntimeError("The durable host binding is not a waiting admission.");
    const raw = await this.admission.admitActionIntent({
      intent: binding.intent,
      authenticatedContext: binding.authenticatedContext,
      now: this.trustedTime.now(),
      approvalId,
    });
    const admission = MoiraeAdmissionResultV1Schema.safeParse(raw);
    if (
      !admission.success ||
      admission.data.status !== "ADMITTED" ||
      admission.data.approvalId !== approvalId ||
      admission.data.nativeActionHash !== waiting.data.nativeActionHash
    )
      throw new Mp08bApprovalRuntimeError(
        "Fresh MP-03 admission did not produce the exact executable boundary for the approved intent.",
      );
    return { binding, approval, admission: admission.data };
  }

  /** The accepted Ananke execution-authority port over the same native gateway. */
  getMp04AnankePort(): Mp04AnankePort {
    return this.ananke;
  }

  async submitDecision(input: {
    readonly approvalId: string;
    readonly envelope: unknown;
  }): Promise<Mp05ApprovalOutcomeV1> {
    const binding = this.bindings.get(input.approvalId);
    if (!binding)
      return {
        schemaVersion: "mp05-approval-outcome-v1",
        status: "BOUNDARY_FAILURE",
        approvalId: input.approvalId,
        message: "The trusted host has no durable ActionIntent binding for this approval.",
      };
    return this.coordinator.submitDecisionOnly({
      request: {
        intent: binding.intent,
        authenticatedContext: binding.authenticatedContext,
        waitingAdmission: binding.waitingAdmission,
      },
      envelope: input.envelope,
      trustedDecision: this.trustedOperator,
    });
  }

  close(): void {
    this.gateway.close();
  }
}

export function createMp08bDurableApprovalRuntime(
  options: Mp08bApprovalRuntimeOptions,
): Promise<Mp08bDurableApprovalRuntime> {
  return Mp08bDurableApprovalRuntime.create(options);
}

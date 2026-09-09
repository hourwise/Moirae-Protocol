import {
  compileAgentProposal,
  type ActionIntentV1,
  type CompilerContextV1,
  type CompileResultV1,
} from "../../../packages/action-compiler/src/index.js";
import {
  MP03_DEPENDENCY_PROVENANCE,
  MoiraeAdmissionResultV1Schema,
  createMp03AdmissionAdapter,
  type FatesAdmissionGateway,
  type Mp03AdmissionAdapter,
  type Mp03AuthenticatedContext,
  type MoiraeAdmissionResultV1,
} from "../../../packages/fates-adapter/src/index.js";
import {
  AgentProposalV1Schema,
  type AgentProposalV1,
} from "../../../packages/strands-agent/src/proposal.js";
import {
  invokeAdministrativeAgent,
  type AdministrativeAgent,
  type AdministrativeProposalResult,
  type InvokeAdministrativeAgentOptions,
} from "../../../packages/strands-agent/src/agent.js";
import {
  createMp08bVerifiedExternalFatesDependency,
  type Mp08bVerifiedFatesMaterializationIdentity,
} from "./fates-runtime.js";

export {
  verifyMp08bVerifiedFatesCheckout,
  type Mp08bVerifiedFatesDependency,
  type Mp08bVerifiedFatesMaterializationIdentity,
} from "./fates-runtime.js";

export function createMp08bVerifiedFatesDependency(root?: string): Promise<Mp08bFatesDependency> {
  return createMp08bVerifiedExternalFatesDependency(root);
}

/**
 * RUNTIME-02 deliberately stops at the injected MP-03 admission port. The
 * host owns composition; none of these types grant authority or execute an
 * effect.
 */
export const MP08B_COMPOSITION_VERSION = "mp08b-composition-v1" as const;
export const MP08B_COMPOSITION_MODE = "COMPOSED_LOCAL" as const;

export type Mp08bProposalSource = Readonly<{
  readonly boundary: "STRANDS_PROPOSAL";
  readonly provider: AdministrativeAgent["provider"];
  readonly modelId: string;
  /** True only for a source created from a real configured provider agent. */
  readonly live: boolean;
  readonly invoke: (
    request: string,
    options?: InvokeAdministrativeAgentOptions,
  ) => Promise<AdministrativeProposalResult>;
}>;

/**
 * Adapts the accepted Strands agent without importing provider credentials or
 * provider-specific code into the host transport.
 */
export function createMp08bStrandsProposalSource(agent: AdministrativeAgent): Mp08bProposalSource {
  return Object.freeze({
    boundary: "STRANDS_PROPOSAL" as const,
    provider: agent.provider,
    modelId: agent.modelId,
    live: agent.provider === "bedrock",
    invoke: (request: string, options?: InvokeAdministrativeAgentOptions) =>
      invokeAdministrativeAgent(agent, request, options),
  });
}

export type Mp08bFatesRuntimeKind = "TEST_ADAPTER" | "VERIFIED_EXTERNAL";

export type Mp08bFatesDependency = Readonly<{
  readonly boundary: "MP03_FATES_ADMISSION";
  readonly runtimeKind: Mp08bFatesRuntimeKind;
  readonly admission: Mp03AdmissionAdapter;
  readonly materialization?: Mp08bVerifiedFatesMaterializationIdentity;
}>;

/**
 * Test-only construction for deterministic RUNTIME-02 tests. There is no
 * external Fates constructor here: the real dependency must be materialized
 * and verified by a later, separately bounded deployment slice.
 */
export function createMp08bTestFatesDependency(
  gateway: FatesAdmissionGateway,
): Mp08bFatesDependency {
  return Object.freeze({
    boundary: "MP03_FATES_ADMISSION" as const,
    runtimeKind: "TEST_ADAPTER" as const,
    admission: createMp03AdmissionAdapter(gateway, MP03_DEPENDENCY_PROVENANCE),
  });
}

export type Mp08bCompositionCapabilitiesV1 = Readonly<{
  readonly liveStrands: boolean;
  readonly liveFates: boolean;
  readonly durableApproval: false;
  readonly hostedDurableQueue: false;
  readonly externalEffects: false;
}>;

export type Mp08bCompositionDependencies = Readonly<{
  readonly proposal: Mp08bProposalSource;
  readonly fates: Mp08bFatesDependency;
}>;

export type Mp08bCompositionRequestV1 = Readonly<{
  /** Untrusted natural-language input; the proposal boundary owns its parsing. */
  readonly request: string;
  /** Trusted host-owned MP-02 registry/context, never browser-authored. */
  readonly compilerContext: CompilerContextV1;
  /** Trusted host-authenticated MP-03 context, never model-authored. */
  readonly authenticatedContext: Mp03AuthenticatedContext;
  /** Trusted host time; never derived from the browser or model. */
  readonly now: string;
}>;

export type Mp08bCompositionNextBoundary =
  "MP05_APPROVAL" | "MP04_EXECUTION" | "TERMINAL_DENY" | "BOUNDARY_REVIEW";

export type Mp08bCompositionFailureStage =
  "STRANDS_PROPOSAL" | "ACTION_INTENT_COMPILATION" | "FATES_ADMISSION";

export type Mp08bCompositionResult =
  | Readonly<{
      schemaVersion: typeof MP08B_COMPOSITION_VERSION;
      status: "COMPOSED";
      proposal: AgentProposalV1;
      actionIntent: ActionIntentV1;
      admission: MoiraeAdmissionResultV1;
      nextBoundary: Mp08bCompositionNextBoundary;
    }>
  | Readonly<{
      schemaVersion: typeof MP08B_COMPOSITION_VERSION;
      status: "NEEDS_CLARIFICATION";
      compilation: Extract<CompileResultV1, { status: "NEEDS_CLARIFICATION" }>;
      nextBoundary: "BOUNDARY_REVIEW";
    }>
  | Readonly<{
      schemaVersion: typeof MP08B_COMPOSITION_VERSION;
      status: "BOUNDARY_BLOCKED";
      stage: Mp08bCompositionFailureStage;
      code:
        | "STRANDS_PROPOSAL_UNAVAILABLE"
        | "INVALID_AGENT_PROPOSAL"
        | "ACTION_INTENT_REJECTED"
        | "FATES_ADMISSION_UNAVAILABLE"
        | "MALFORMED_FATES_RESULT";
      message: string;
      nextBoundary: "BOUNDARY_REVIEW";
    }>;

function blocked(
  stage: Mp08bCompositionFailureStage,
  code: Extract<Mp08bCompositionResult, { status: "BOUNDARY_BLOCKED" }>["code"],
  message: string,
): Extract<Mp08bCompositionResult, { status: "BOUNDARY_BLOCKED" }> {
  return {
    schemaVersion: MP08B_COMPOSITION_VERSION,
    status: "BOUNDARY_BLOCKED",
    stage,
    code,
    message,
    nextBoundary: "BOUNDARY_REVIEW",
  };
}

function nextBoundaryFor(admission: MoiraeAdmissionResultV1): Mp08bCompositionNextBoundary {
  if (admission.status === "ADMITTED") return "MP04_EXECUTION";
  if (admission.status === "WAITING_FOR_APPROVAL") return "MP05_APPROVAL";
  if (admission.status === "REJECTED") return "TERMINAL_DENY";
  return "BOUNDARY_REVIEW";
}

export class Mp08bComposedRuntime {
  readonly mode = MP08B_COMPOSITION_MODE;
  readonly capabilities: Mp08bCompositionCapabilitiesV1;

  constructor(private readonly dependencies: Mp08bCompositionDependencies) {
    this.capabilities = Object.freeze({
      liveStrands: dependencies.proposal.live,
      liveFates: dependencies.fates.runtimeKind === "VERIFIED_EXTERNAL",
      durableApproval: false,
      hostedDurableQueue: false,
      externalEffects: false,
    });
  }

  async compose(input: Mp08bCompositionRequestV1): Promise<Mp08bCompositionResult> {
    let proposalResult: AdministrativeProposalResult;
    try {
      proposalResult = await this.dependencies.proposal.invoke(input.request, {
        requestId: input.compilerContext.sourceRequestId,
      });
    } catch {
      return blocked(
        "STRANDS_PROPOSAL",
        "STRANDS_PROPOSAL_UNAVAILABLE",
        "The semantic proposal boundary was unavailable; no authority call was attempted.",
      );
    }

    const proposal = AgentProposalV1Schema.safeParse(proposalResult.proposal);
    if (!proposal.success)
      return blocked(
        "STRANDS_PROPOSAL",
        "INVALID_AGENT_PROPOSAL",
        "The Strands result is not a valid untrusted AgentProposalV1.",
      );

    const compilation = compileAgentProposal({
      proposal: proposal.data,
      context: input.compilerContext,
    });
    if (compilation.status === "NEEDS_CLARIFICATION")
      return {
        schemaVersion: MP08B_COMPOSITION_VERSION,
        status: "NEEDS_CLARIFICATION",
        compilation,
        nextBoundary: "BOUNDARY_REVIEW",
      };
    if (compilation.status === "REJECTED")
      return blocked(
        "ACTION_INTENT_COMPILATION",
        "ACTION_INTENT_REJECTED",
        compilation.description,
      );

    let admission: MoiraeAdmissionResultV1;
    try {
      admission = await this.dependencies.fates.admission.admitActionIntent({
        intent: compilation.actionIntent,
        authenticatedContext: input.authenticatedContext,
        now: input.now,
      });
    } catch {
      return blocked(
        "FATES_ADMISSION",
        "FATES_ADMISSION_UNAVAILABLE",
        "The injected MP-03 admission boundary was unavailable; composition failed closed.",
      );
    }

    const validatedAdmission = MoiraeAdmissionResultV1Schema.safeParse(admission);
    if (!validatedAdmission.success)
      return blocked(
        "FATES_ADMISSION",
        "MALFORMED_FATES_RESULT",
        "The MP-03 admission result failed the accepted result contract.",
      );

    return {
      schemaVersion: MP08B_COMPOSITION_VERSION,
      status: "COMPOSED",
      proposal: proposal.data,
      actionIntent: compilation.actionIntent,
      admission: validatedAdmission.data,
      nextBoundary: nextBoundaryFor(validatedAdmission.data),
    };
  }
}

export function createMp08bComposedRuntime(
  dependencies: Mp08bCompositionDependencies,
): Mp08bComposedRuntime {
  return new Mp08bComposedRuntime(dependencies);
}

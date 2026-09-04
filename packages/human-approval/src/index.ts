import { createHash } from "node:crypto";
import { z } from "zod";

import {
  ActionIntentV1Schema,
  canonicalizeJsonV1,
  type ActionIntentV1,
} from "../../action-compiler/src/index.js";
import {
  MP03_NATIVE_HASH_FIXTURES,
  MP03_PROFILE,
  MP03_REQUESTER,
  Mp03AuthenticatedContextSchema,
  MoiraeAdmissionResultV1Schema,
  type Mp03Action,
  type Mp03AdmissionAdapter,
  type Mp03AuthenticatedContext,
  type MoiraeAdmissionResultV1,
} from "../../fates-adapter/src/index.js";
import type {
  Mp04ExecutionCoordinator,
  Mp04ExecutionResultV1,
} from "../../execution-coordinator/src/index.js";

/**
 * MP-05 owns presentation and workflow composition only. Native approval
 * identity, hashes, operator authentication, durable state, and grants stay
 * behind this structural host adapter.
 */
export const MP05_FATES_DEPENDENCY_PROVENANCE = Object.freeze({
  profile: "moirae-protocol-mp05-fates-v1",
  ananke: {
    ref: "ananke-fates-008a-durable-human-approval-v0.1.0-protocol-1.4.0",
    tagObject: "0fa08f78f27e2f79c895402f3f53a8aada5837b4",
    sha: "b888d61adf180d33e2ae2e61d276cb9b0f13bd12",
    runtimeSha: "c89b83de40ed0275969fe3931220f440bf082aa3",
  },
  horae: {
    ref: "horae-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0",
    tagObject: "59763d34644567c59d1041b3acef24efc5a1d072",
    sha: "aa296b420fbcf578089ca66dc03f6d09d9b06f00",
    runtimeSha: "7b24cb0af083e505bd2dc9fa55c6c3387f849131",
  },
  adrasteiaSha: "a1c01bf9e6f9d6a126cfdcc1acfacd488b214210",
  mnemosyne: "not-required",
} as const);

export const MP05_PRESENTATION_VERSION = "moirae-protocol/approval-presentation/v1" as const;
export const FATES_008_PRESENTATION_VERSION = "fates-008a/approval-presentation/v1" as const;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const timestampSchema = z.string().datetime({ offset: true });
const identifierSchema = z.string().trim().min(1).max(200);
const decisionSchema = z.enum(["APPROVE", "REJECT"]);
const actionSchema = z.enum([
  "SEND_APPOINTMENT_DETAILS",
  "RESCHEDULE_APPOINTMENT",
  "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
]);

/** The only authority-bearing values accepted from a browser/client. */
export const HumanDecisionEnvelopeV1Schema = z
  .object({
    schemaVersion: z.literal("human-decision-v1"),
    approvalId: identifierSchema,
    decision: decisionSchema,
    presentationDigest: hashSchema,
    nativePresentationBindingHash: hashSchema,
  })
  .strict();

export type HumanDecisionEnvelopeV1 = z.infer<typeof HumanDecisionEnvelopeV1Schema>;

const operationSchema = z
  .object({
    server: z.string().min(1),
    toolName: z.string().min(1),
    version: z.string().min(1),
  })
  .strict();

const presentationBodySchema = z
  .object({
    schemaVersion: z.literal("approval-presentation-v1"),
    presentationVersion: z.literal(MP05_PRESENTATION_VERSION),
    approvalId: identifierSchema,
    nativePresentationBindingHash: hashSchema,
    action: actionSchema,
    operation: operationSchema,
    authenticatedWorkload: z.object({ id: identifierSchema, kind: z.string().min(1) }).strict(),
    actingAgent: z.object({ id: identifierSchema, kind: z.string().min(1) }).strict(),
    representedRequester: z.object({ id: identifierSchema, kind: z.string().min(1) }).strict(),
    resource: z.record(z.string(), z.unknown()),
    target: z.record(z.string(), z.unknown()),
    parameters: z.record(z.string(), z.unknown()),
    purpose: identifierSchema,
    policyVersion: identifierSchema,
    resourceScope: z.record(z.string(), z.unknown()),
    approvalExpiresAt: timestampSchema,
    sourceRequestReference: identifierSchema,
    admissionNativeActionHash: hashSchema,
    nativeActionHash: hashSchema,
    actionIntentDigest: hashSchema,
    actionIntentIdempotencyKey: hashSchema,
    evidenceReferences: z
      .array(z.object({ kind: identifierSchema, ref: identifierSchema }).strict())
      .min(1),
    admissionEvidence: z
      .object({
        status: z.literal("WAITING_FOR_APPROVAL"),
        nativeDecision: z.literal("REQUIRE_APPROVAL"),
        evaluatedAt: timestampSchema,
        auditId: identifierSchema,
      })
      .strict(),
  })
  .strict();

export const ApprovalPresentationV1Schema = presentationBodySchema
  .extend({ presentationDigest: hashSchema })
  .strict();

export type ApprovalPresentationV1 = z.infer<typeof ApprovalPresentationV1Schema>;
type ApprovalPresentationBodyV1 = z.infer<typeof presentationBodySchema>;

export interface Mp05ApprovalRequestV1 {
  /** Trusted server-side ActionIntent; never copy this from the browser envelope. */
  readonly intent: unknown;
  /** Trusted host-authenticated MP-03 context. */
  readonly authenticatedContext: unknown;
  /** Trusted server-side MP-03 WAITING_FOR_APPROVAL result. */
  readonly waitingAdmission: unknown;
}

export interface Mp05ApprovalPreparationV1 {
  schemaVersion: "mp05-approval-preparation-v1";
  presentation: ApprovalPresentationV1;
  /** Retained for a trusted host/server; it is not a browser authority object. */
  request: Mp05ApprovalRequestV1;
}

export type Mp05NativeDecisionOutcome =
  "applied" | "idempotent" | "conflict" | "not_found" | "expired" | "invalid";

export interface Mp05NativeApprovalDecisionInput {
  readonly approvalId: string;
  readonly decision: "approve" | "reject";
  /** Supplied by a trusted Ananke host authenticator, never the browser. */
  readonly operator: unknown;
  readonly now: string;
  readonly presentationBindingHash: string;
}

export interface Mp05NativeApprovalHashMaterialV1 {
  /** Used only for the presentation-binding domain, never as action-hash input. */
  readonly approvalId: string;
  readonly serverName: string;
  readonly toolName: string;
  readonly toolVersion?: string;
  readonly arguments: Record<string, unknown>;
  readonly executionContext: unknown;
  readonly expiresAt: string;
  readonly bindRequestIdentity?: boolean;
  /** Used only for the presentation-binding domain, never as action-hash input. */
  readonly presentationVersion?: string;
}

export interface Mp05NativeApprovalDerivedHashesV1 {
  readonly actionHash: string;
  readonly presentationBindingHash?: string;
}

export interface Mp05AnankeApprovalPort {
  getApproval(approvalId: string, now: string): unknown | Promise<unknown>;
  decideApproval(input: Mp05NativeApprovalDecisionInput): unknown | Promise<unknown>;
  /** Derives native hashes from semantic approval material; claimed hashes are never inputs. */
  deriveApprovalHashes(
    material: Mp05NativeApprovalHashMaterialV1,
  ): Mp05NativeApprovalDerivedHashesV1 | Promise<Mp05NativeApprovalDerivedHashesV1>;
}

export interface Mp05TrustedTimeSource {
  /** A host-owned, re-readable clock. It must not be derived from client data. */
  now(): string;
}

export interface Mp05TrustedDecisionContext {
  /** Opaque identity returned by Ananke's trusted operator authenticator. */
  readonly operator: unknown;
}

export interface Mp05HumanApprovalCoordinatorOptions {
  approval: Mp05AnankeApprovalPort;
  admission: Mp03AdmissionAdapter;
  execution: Pick<Mp04ExecutionCoordinator, "executeAdmittedAction">;
  trustedTime: Mp05TrustedTimeSource;
  provenance: unknown;
}

export type Mp05ApprovalStatus =
  "APPROVED" | "REJECTED" | "EXPIRED" | "STALE" | "CONFLICT" | "BOUNDARY_FAILURE";

export interface Mp05ApprovalOutcomeV1 {
  schemaVersion: "mp05-approval-outcome-v1";
  status: Mp05ApprovalStatus;
  approvalId: string;
  decision?: "APPROVE" | "REJECT";
  nativeOutcome?: Mp05NativeDecisionOutcome;
  decisionId?: string;
  approvalState?: string;
  message?: string;
}

export interface Mp05WorkflowResultV1 {
  schemaVersion: "mp05-workflow-result-v1";
  approval: Mp05ApprovalOutcomeV1;
  execution?: Mp04ExecutionResultV1;
}

export type Mp05RecoveryResultV1 =
  | { kind: "PRESENTATION"; preparation: Mp05ApprovalPreparationV1 }
  | { kind: "WORKFLOW"; result: Mp05WorkflowResultV1 };

export type Mp05BoundaryCode =
  | "INVALID_REQUEST"
  | "INVALID_PRESENTATION"
  | "STALE_PRESENTATION"
  | "NATIVE_APPROVAL_INVALID"
  | "NATIVE_DECISION_INVALID"
  | "ADMISSION_NOT_EXECUTABLE"
  | "TRUSTED_TIME_INVALID"
  | "PROVENANCE_MISMATCH";

export class Mp05BoundaryError extends Error {
  constructor(
    public readonly code: Mp05BoundaryCode,
    message: string,
  ) {
    super(message);
    this.name = "Mp05BoundaryError";
  }
}

interface NativeApprovalSnapshot {
  id: string;
  serverName: string;
  toolName: string;
  toolVersion?: string;
  actionHash: string;
  decisionId?: string;
  bindingHash?: string;
  presentationBindingHash?: string;
  presentationVersion?: string;
  bindRequestIdentity?: boolean;
  arguments: Record<string, unknown>;
  executionContext: unknown;
  status: "pending" | "approved" | "rejected" | "expired" | "revoked" | "consumed";
  requestedAt: string;
  approvedBy?: string;
  approvedBySessionId?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedBySessionId?: string;
  rejectedAt?: string;
  expiresAt: string;
  used: boolean;
  revision: number;
}

interface NativeDecisionSnapshot {
  outcome: Mp05NativeDecisionOutcome;
  grant?: unknown;
  decisionId?: string;
  reason?: string;
}

const nativeApprovalSchema = z
  .object({
    id: identifierSchema,
    serverName: identifierSchema,
    toolName: identifierSchema,
    toolVersion: identifierSchema.optional(),
    actionHash: hashSchema,
    decisionId: z.string().uuid().optional(),
    bindingHash: hashSchema.optional(),
    presentationBindingHash: hashSchema.optional(),
    presentationVersion: z.string().min(1).optional(),
    bindRequestIdentity: z.boolean().optional(),
    arguments: z.record(z.string(), z.unknown()),
    executionContext: z.unknown(),
    status: z.enum(["pending", "approved", "rejected", "expired", "revoked", "consumed"]),
    requestedAt: timestampSchema,
    approvedBy: identifierSchema.optional(),
    approvedBySessionId: identifierSchema.optional(),
    approvedAt: timestampSchema.optional(),
    rejectedBy: identifierSchema.optional(),
    rejectedBySessionId: identifierSchema.optional(),
    rejectedAt: timestampSchema.optional(),
    expiresAt: timestampSchema,
    used: z.boolean(),
    revision: z.number().int().nonnegative(),
  })
  .passthrough();

const nativeDecisionSchema = z
  .object({
    outcome: z.enum(["applied", "idempotent", "conflict", "not_found", "expired", "invalid"]),
    grant: z.unknown().optional(),
    decisionId: z.string().uuid().optional(),
    reason: z.string().optional(),
  })
  .strict();

const nativeDerivedHashesSchema = z
  .object({
    actionHash: hashSchema,
    presentationBindingHash: hashSchema.optional(),
  })
  .strict();

export class Mp05HumanApprovalCoordinator {
  constructor(private readonly options: Mp05HumanApprovalCoordinatorOptions) {
    if (!options.approval || typeof options.approval.getApproval !== "function")
      throw new TypeError("MP-05 requires a native Ananke approval port.");
    if (typeof options.approval.decideApproval !== "function")
      throw new TypeError("MP-05 requires a native Ananke decision port.");
    if (typeof options.approval.deriveApprovalHashes !== "function")
      throw new TypeError("MP-05 requires native Ananke approval hash derivation.");
    if (!options.admission || typeof options.admission.admitActionIntent !== "function")
      throw new TypeError("MP-05 requires the existing MP-03 admission adapter.");
    if (!options.execution || typeof options.execution.executeAdmittedAction !== "function")
      throw new TypeError("MP-05 requires the existing MP-04 execution coordinator.");
    if (!options.trustedTime || typeof options.trustedTime.now !== "function")
      throw new TypeError("MP-05 requires a host-owned trusted time source.");
    if (!sameJson(options.provenance, MP05_FATES_DEPENDENCY_PROVENANCE))
      throw new Mp05BoundaryError(
        "PROVENANCE_MISMATCH",
        "MP-05 Fates dependency provenance does not match the accepted FATES-008 lock.",
      );
  }

  /**
   * Validate a native pending request and create a deterministic display
   * projection. This method never calls the native decision or MP-04.
   */
  async prepareApproval(request: Mp05ApprovalRequestV1): Promise<Mp05ApprovalPreparationV1> {
    const trusted = this.parseRequest(request);
    const now = this.readTrustedNow();
    const waiting = parseWaitingAdmission(trusted.waitingAdmission);
    const native = await this.readNativeApproval(waiting.approvalId, now);
    this.assertPendingBinding(native, trusted.intent, trusted.context, waiting);
    const presentation = createPresentation(trusted.intent, trusted.context, waiting, native);
    return {
      schemaVersion: "mp05-approval-preparation-v1",
      presentation,
      request,
    };
  }

  /**
   * Re-read the native request, regenerate the presentation, and only then
   * submit a trusted-host decision. The envelope is deliberately insufficient
   * to identify an operator or create any native authority.
   */
  async submitDecision(input: {
    request: Mp05ApprovalRequestV1;
    envelope: unknown;
    trustedDecision: Mp05TrustedDecisionContext;
  }): Promise<Mp05WorkflowResultV1> {
    const trusted = this.parseRequest(input.request);
    const envelopeResult = HumanDecisionEnvelopeV1Schema.safeParse(input.envelope);
    if (!envelopeResult.success)
      return this.boundaryResult(
        "",
        undefined,
        "BOUNDARY_FAILURE",
        "The browser decision envelope is not the strict HumanDecisionEnvelopeV1 shape.",
      );
    const envelope = envelopeResult.data;
    const waiting = parseWaitingAdmission(trusted.waitingAdmission);
    if (envelope.approvalId !== waiting.approvalId)
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "STALE",
        "The decision envelope is for a different native approval request.",
      );

    let preparation: Mp05ApprovalPreparationV1;
    try {
      const native = await this.readNativeApproval(envelope.approvalId, this.readTrustedNow());
      this.assertExactBinding(native, trusted.intent, trusted.context, waiting, false);
      const presentation = createPresentation(trusted.intent, trusted.context, waiting, native);
      preparation = {
        schemaVersion: "mp05-approval-preparation-v1",
        presentation,
        request: input.request,
      };
    } catch (error) {
      return this.resultFromError(envelope.approvalId, envelope.decision, error);
    }
    if (
      preparation.presentation.presentationDigest !== envelope.presentationDigest ||
      preparation.presentation.nativePresentationBindingHash !==
        envelope.nativePresentationBindingHash
    )
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "STALE",
        "The browser presentation is stale or not bound to the native request.",
      );

    const now = this.readTrustedNow();
    let rawDecision: unknown;
    try {
      rawDecision = await this.options.approval.decideApproval({
        approvalId: envelope.approvalId,
        decision: envelope.decision === "APPROVE" ? "approve" : "reject",
        operator: input.trustedDecision.operator,
        now,
        presentationBindingHash: preparation.presentation.nativePresentationBindingHash,
      });
    } catch (error) {
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "BOUNDARY_FAILURE",
        error instanceof Error ? error.message : "The native decision boundary failed.",
      );
    }
    const nativeDecision = parseNativeDecision(rawDecision);
    const nativeGrant = nativeDecision.grant
      ? parseNativeApproval(nativeDecision.grant)
      : await this.readNativeApproval(envelope.approvalId, now).catch(() => undefined);
    const decisionId = nativeDecision.decisionId ?? nativeGrant?.decisionId;

    if (nativeDecision.outcome === "expired")
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "EXPIRED",
        nativeDecision.reason ?? "The native approval expired.",
        nativeDecision.outcome,
        decisionId,
        nativeGrant?.status,
      );
    if (nativeDecision.outcome === "not_found")
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "STALE",
        nativeDecision.reason ?? "The native approval request was not found.",
        nativeDecision.outcome,
        decisionId,
        nativeGrant?.status,
      );
    if (nativeDecision.outcome === "invalid")
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "BOUNDARY_FAILURE",
        nativeDecision.reason ?? "The native approval decision was invalid.",
        nativeDecision.outcome,
        decisionId,
        nativeGrant?.status,
      );
    if (nativeDecision.outcome === "conflict")
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "CONFLICT",
        nativeDecision.reason ?? "The native approval decision conflicted with terminal truth.",
        nativeDecision.outcome,
        decisionId,
        nativeGrant?.status,
      );
    if (!nativeGrant)
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "BOUNDARY_FAILURE",
        "The native decision returned no durable approval record.",
        nativeDecision.outcome,
      );
    if (!decisionId)
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "BOUNDARY_FAILURE",
        "The durable native decision has no stable decision identity.",
        nativeDecision.outcome,
        undefined,
        nativeGrant.status,
      );
    if (
      (envelope.decision === "APPROVE" && nativeGrant.status !== "approved") ||
      (envelope.decision === "REJECT" && nativeGrant.status !== "rejected")
    )
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "CONFLICT",
        "The native decision record does not match the requested decision.",
        nativeDecision.outcome,
        decisionId,
        nativeGrant.status,
      );
    if (
      nativeGrant.id !== envelope.approvalId ||
      nativeGrant.presentationBindingHash !== envelope.nativePresentationBindingHash
    )
      return this.boundaryResult(
        envelope.approvalId,
        envelope.decision,
        "BOUNDARY_FAILURE",
        "The native decision record is not bound to the submitted presentation.",
        nativeDecision.outcome,
        decisionId,
        nativeGrant.status,
      );

    const approval = this.approvalOutcome(
      envelope.approvalId,
      envelope.decision,
      nativeDecision.outcome,
      decisionId,
      nativeGrant.status,
    );
    if (envelope.decision === "REJECT")
      return { schemaVersion: "mp05-workflow-result-v1", approval };

    return this.continueApproved({
      intent: trusted.intent,
      context: trusted.context,
      approvalId: envelope.approvalId,
      decisionId,
      approval,
    });
  }

  /**
   * Restart-safe routing. Pending requests regenerate a presentation from
   * native state; approved requests continue through fresh MP-03 admission
   * and MP-04. Protocol memory is not used as authority.
   */
  async recoverOrRefresh(input: {
    intent: unknown;
    authenticatedContext: unknown;
    approvalId: string;
  }): Promise<Mp05RecoveryResultV1> {
    const intent = parseIntent(input.intent);
    const context = parseContext(input.authenticatedContext);
    const now = this.readTrustedNow();
    const native = await this.readNativeApproval(input.approvalId, now);
    if (native.status === "pending") {
      const waiting = await this.options.admission.admitActionIntent({
        intent,
        authenticatedContext: context,
        now,
        approvalId: input.approvalId,
      });
      return {
        kind: "PRESENTATION",
        preparation: await this.prepareApproval({
          intent,
          authenticatedContext: context,
          waitingAdmission: waiting,
        }),
      };
    }
    if (native.status === "approved") {
      const decisionId = requireDecisionId(native);
      const approval = this.approvalOutcome(
        native.id,
        "APPROVE",
        "idempotent",
        decisionId,
        native.status,
      );
      return {
        kind: "WORKFLOW",
        result: await this.continueApproved({
          intent,
          context,
          approvalId: native.id,
          decisionId,
          approval,
        }),
      };
    }
    const status =
      native.status === "expired" ? "EXPIRED" : native.status === "rejected" ? "REJECTED" : "STALE";
    return {
      kind: "WORKFLOW",
      result: {
        schemaVersion: "mp05-workflow-result-v1",
        approval: this.approvalOutcome(
          native.id,
          native.status === "rejected" ? "REJECT" : "APPROVE",
          native.status === "expired" ? "expired" : "conflict",
          native.decisionId,
          native.status,
          status,
        ),
      },
    };
  }

  private async continueApproved(input: {
    intent: ActionIntentV1;
    context: Mp03AuthenticatedContext;
    approvalId: string;
    decisionId: string;
    approval: Mp05ApprovalOutcomeV1;
  }): Promise<Mp05WorkflowResultV1> {
    const now = this.readTrustedNow();
    let admissionRaw: MoiraeAdmissionResultV1;
    try {
      admissionRaw = await this.options.admission.admitActionIntent({
        intent: input.intent,
        authenticatedContext: input.context,
        now,
        approvalId: input.approvalId,
      });
    } catch (error) {
      return {
        schemaVersion: "mp05-workflow-result-v1",
        approval: input.approval,
        execution: {
          schemaVersion: "1",
          status: "BOUNDARY_FAILURE",
          reason: "execution_boundary_failure",
          message: error instanceof Error ? error.message : "Fresh MP-03 admission failed.",
          evidence: emptyExecutionEvidence(now),
        },
      };
    }
    const admission = MoiraeAdmissionResultV1Schema.safeParse(admissionRaw);
    if (
      !admission.success ||
      admission.data.status !== "ADMITTED" ||
      admission.data.nativeDecision !== "ALLOW" ||
      admission.data.approvalId !== input.approvalId ||
      admission.data.nativeActionHash !== MP03_NATIVE_HASH_FIXTURES[input.intent.action]
    ) {
      return {
        schemaVersion: "mp05-workflow-result-v1",
        approval: input.approval,
        execution: {
          schemaVersion: "1",
          status: "BOUNDARY_FAILURE",
          reason: "admission_not_executable",
          message: "Fresh MP-03 admission did not produce the exact executable boundary.",
          evidence: emptyExecutionEvidence(now),
        },
      };
    }
    const execution = await this.options.execution.executeAdmittedAction({
      intent: input.intent,
      authenticatedContext: input.context,
      now,
      admission: admission.data,
    });
    return {
      schemaVersion: "mp05-workflow-result-v1",
      approval: { ...input.approval, decisionId: input.decisionId },
      execution,
    };
  }

  private parseRequest(request: Mp05ApprovalRequestV1): {
    intent: ActionIntentV1;
    context: Mp03AuthenticatedContext;
    waitingAdmission: MoiraeAdmissionResultV1;
  } {
    return {
      intent: parseIntent(request.intent),
      context: parseContext(request.authenticatedContext),
      waitingAdmission: parseWaitingAdmission(request.waitingAdmission),
    };
  }

  private async readNativeApproval(id: string, now: string): Promise<NativeApprovalSnapshot> {
    let raw: unknown;
    try {
      raw = await this.options.approval.getApproval(id, now);
    } catch (error) {
      throw new Mp05BoundaryError(
        "NATIVE_APPROVAL_INVALID",
        error instanceof Error ? error.message : "Native approval read failed.",
      );
    }
    if (raw === undefined)
      throw new Mp05BoundaryError("STALE_PRESENTATION", "Native approval request was not found.");
    const grant = parseNativeApproval(raw);
    await this.assertNativeIntegrity(grant);
    return grant;
  }

  private async assertNativeIntegrity(grant: NativeApprovalSnapshot): Promise<void> {
    let rawDerived: unknown;
    try {
      rawDerived = await this.options.approval.deriveApprovalHashes({
        approvalId: grant.id,
        serverName: grant.serverName,
        toolName: grant.toolName,
        ...(grant.toolVersion ? { toolVersion: grant.toolVersion } : {}),
        arguments: grant.arguments,
        executionContext: grant.executionContext,
        expiresAt: grant.expiresAt,
        ...(typeof grant.bindRequestIdentity === "boolean"
          ? { bindRequestIdentity: grant.bindRequestIdentity }
          : {}),
        ...(grant.presentationVersion ? { presentationVersion: grant.presentationVersion } : {}),
      });
    } catch (error) {
      throw new Mp05BoundaryError(
        "NATIVE_APPROVAL_INVALID",
        error instanceof Error ? error.message : "Native approval hash derivation failed.",
      );
    }
    const derived = nativeDerivedHashesSchema.safeParse(rawDerived);
    if (!derived.success || derived.data.actionHash !== grant.actionHash)
      throw new Mp05BoundaryError(
        "NATIVE_APPROVAL_INVALID",
        "Native approval action hash does not verify against Ananke-derived approval material.",
      );
    if (grant.presentationBindingHash) {
      if (
        !derived.data.presentationBindingHash ||
        derived.data.presentationBindingHash !== grant.presentationBindingHash
      )
        throw new Mp05BoundaryError(
          "NATIVE_APPROVAL_INVALID",
          "Native approval presentation binding does not verify against Ananke-derived material.",
        );
    }
  }

  private assertPendingBinding(
    grant: NativeApprovalSnapshot,
    intent: ActionIntentV1,
    context: Mp03AuthenticatedContext,
    waiting: Extract<MoiraeAdmissionResultV1, { status: "WAITING_FOR_APPROVAL" }>,
  ): void {
    this.assertExactBinding(grant, intent, context, waiting, true);
  }

  private assertExactBinding(
    grant: NativeApprovalSnapshot,
    intent: ActionIntentV1,
    context: Mp03AuthenticatedContext,
    waiting: Extract<MoiraeAdmissionResultV1, { status: "WAITING_FOR_APPROVAL" }>,
    requirePending: boolean,
  ): void {
    const profile = MP03_PROFILE[intent.action as Mp03Action];
    const operation = profile.operation;
    if (
      intent.principal.agentPrincipalId !== context.actingPrincipal.id ||
      intent.requester.customerId !== "CUSTOMER-001" ||
      context.representedPrincipal.id !== MP03_REQUESTER ||
      intent.sourceRequestId !== context.correlation.requestId
    )
      throw new Mp05BoundaryError(
        "NATIVE_APPROVAL_INVALID",
        "The ActionIntent principal and request identity are not bound to the trusted MP-03 context.",
      );
    if (
      grant.id !== waiting.approvalId ||
      (requirePending && grant.status !== "pending") ||
      grant.used ||
      grant.serverName !== operation.server ||
      grant.toolName !== operation.toolName ||
      grant.toolVersion !== operation.version ||
      waiting.nativeActionHash !== MP03_NATIVE_HASH_FIXTURES[intent.action] ||
      !sameJson(grant.arguments, intent.parameters) ||
      !sameJson(grant.executionContext, context) ||
      grant.bindRequestIdentity !== true ||
      grant.presentationVersion !== FATES_008_PRESENTATION_VERSION ||
      !grant.presentationBindingHash
    )
      throw new Mp05BoundaryError(
        "NATIVE_APPROVAL_INVALID",
        "Native pending approval is not exactly bound to the MP-03 ActionIntent and context.",
      );
  }

  private readTrustedNow(): string {
    let value: unknown;
    try {
      value = this.options.trustedTime.now();
    } catch (error) {
      throw new Mp05BoundaryError(
        "TRUSTED_TIME_INVALID",
        error instanceof Error ? error.message : "Trusted time source failed.",
      );
    }
    const result = timestampSchema.safeParse(value);
    if (!result.success || !Number.isFinite(Date.parse(result.data)))
      throw new Mp05BoundaryError(
        "TRUSTED_TIME_INVALID",
        "Trusted time is not a valid ISO instant.",
      );
    return new Date(Date.parse(result.data)).toISOString();
  }

  private approvalOutcome(
    approvalId: string,
    decision: "APPROVE" | "REJECT",
    nativeOutcome: Mp05NativeDecisionOutcome,
    decisionId: string | undefined,
    state: string,
    status: Mp05ApprovalStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED",
  ): Mp05ApprovalOutcomeV1 {
    return {
      schemaVersion: "mp05-approval-outcome-v1",
      status,
      approvalId,
      decision,
      nativeOutcome,
      ...(decisionId ? { decisionId } : {}),
      approvalState: state,
    };
  }

  private boundaryResult(
    approvalId: string,
    decision: "APPROVE" | "REJECT" | undefined,
    status: Mp05ApprovalStatus,
    message: string,
    nativeOutcome?: Mp05NativeDecisionOutcome,
    decisionId?: string,
    approvalState?: string,
  ): Mp05WorkflowResultV1 {
    return {
      schemaVersion: "mp05-workflow-result-v1",
      approval: {
        schemaVersion: "mp05-approval-outcome-v1",
        status,
        approvalId,
        ...(decision ? { decision } : {}),
        ...(nativeOutcome ? { nativeOutcome } : {}),
        ...(decisionId ? { decisionId } : {}),
        ...(approvalState ? { approvalState } : {}),
        message,
      },
    };
  }

  private resultFromError(
    approvalId: string,
    decision: "APPROVE" | "REJECT",
    error: unknown,
  ): Mp05WorkflowResultV1 {
    const status: Mp05ApprovalStatus =
      error instanceof Mp05BoundaryError && error.code === "STALE_PRESENTATION"
        ? "STALE"
        : "BOUNDARY_FAILURE";
    return this.boundaryResult(
      approvalId,
      decision,
      status,
      error instanceof Error ? error.message : "MP-05 approval boundary failed.",
    );
  }
}

export function createMp05HumanApprovalCoordinator(
  options: Mp05HumanApprovalCoordinatorOptions,
): Mp05HumanApprovalCoordinator {
  return new Mp05HumanApprovalCoordinator(options);
}

export function createProtocolPresentationDigest(
  presentation: Omit<ApprovalPresentationV1, "presentationDigest">,
): string {
  const parsed = presentationBodySchema.parse(presentation);
  return createHash("sha256").update(canonicalizeJsonV1(parsed), "utf8").digest("hex");
}

function createPresentation(
  intent: ActionIntentV1,
  context: Mp03AuthenticatedContext,
  waiting: Extract<MoiraeAdmissionResultV1, { status: "WAITING_FOR_APPROVAL" }>,
  native: NativeApprovalSnapshot,
): ApprovalPresentationV1 {
  const profile = MP03_PROFILE[intent.action as Mp03Action];
  const body: ApprovalPresentationBodyV1 = {
    schemaVersion: "approval-presentation-v1",
    presentationVersion: MP05_PRESENTATION_VERSION,
    approvalId: native.id,
    nativePresentationBindingHash: native.presentationBindingHash!,
    action: intent.action,
    operation: { ...profile.operation },
    authenticatedWorkload: {
      id: context.authenticatedPrincipal.id,
      kind: context.authenticatedPrincipal.kind,
    },
    actingAgent: { id: context.actingPrincipal.id, kind: context.actingPrincipal.kind },
    representedRequester: {
      id: context.representedPrincipal.id,
      kind: context.representedPrincipal.kind,
    },
    resource: clone(intent.resource),
    target: clone(intent.target),
    parameters: clone(intent.parameters),
    purpose: context.purpose,
    policyVersion: context.policyVersion,
    resourceScope: clone(context.resourceScope),
    approvalExpiresAt: new Date(Date.parse(native.expiresAt)).toISOString(),
    sourceRequestReference: intent.sourceRequestId,
    admissionNativeActionHash: waiting.nativeActionHash,
    nativeActionHash: native.actionHash,
    actionIntentDigest: intent.canonicalDigest,
    actionIntentIdempotencyKey: intent.idempotencyKey,
    evidenceReferences: intent.evidenceRefs.map((reference) => ({ ...reference })),
    admissionEvidence: {
      status: waiting.status,
      nativeDecision: waiting.nativeDecision,
      evaluatedAt: waiting.evidence.evaluatedAt,
      auditId: waiting.evidence.auditId,
    },
  };
  return ApprovalPresentationV1Schema.parse({
    ...body,
    presentationDigest: createProtocolPresentationDigest(body),
  });
}

function parseIntent(value: unknown): ActionIntentV1 {
  const result = ActionIntentV1Schema.safeParse(value);
  if (!result.success) throw new Mp05BoundaryError("INVALID_REQUEST", "ActionIntentV1 is invalid.");
  return result.data;
}

function parseContext(value: unknown): Mp03AuthenticatedContext {
  const result = Mp03AuthenticatedContextSchema.safeParse(value);
  if (!result.success)
    throw new Mp05BoundaryError("INVALID_REQUEST", "Authenticated MP-03 context is invalid.");
  return result.data;
}

function parseWaitingAdmission(
  value: unknown,
): Extract<MoiraeAdmissionResultV1, { status: "WAITING_FOR_APPROVAL" }> {
  const result = MoiraeAdmissionResultV1Schema.safeParse(value);
  if (!result.success || result.data.status !== "WAITING_FOR_APPROVAL")
    throw new Mp05BoundaryError(
      "ADMISSION_NOT_EXECUTABLE",
      "MP-05 requires an exact MP-03 WAITING_FOR_APPROVAL result.",
    );
  return result.data;
}

function parseNativeApproval(value: unknown): NativeApprovalSnapshot {
  const result = nativeApprovalSchema.safeParse(value);
  if (!result.success || !isRecord(value) || !Object.hasOwn(value, "executionContext"))
    throw new Mp05BoundaryError(
      "NATIVE_APPROVAL_INVALID",
      "Native Ananke approval record failed the bounded MP-05 shape check.",
    );
  return result.data as NativeApprovalSnapshot;
}

function parseNativeDecision(value: unknown): NativeDecisionSnapshot {
  const result = nativeDecisionSchema.safeParse(value);
  if (!result.success)
    throw new Mp05BoundaryError(
      "NATIVE_DECISION_INVALID",
      "Native Ananke decision result failed the bounded MP-05 shape check.",
    );
  return result.data;
}

function requireDecisionId(grant: NativeApprovalSnapshot): string {
  if (!grant.decisionId)
    throw new Mp05BoundaryError(
      "NATIVE_APPROVAL_INVALID",
      "A terminal native decision must expose its stable decision identity.",
    );
  return grant.decisionId;
}

function emptyExecutionEvidence(observedAt: string) {
  return {
    schemaVersion: "1" as const,
    dependencyProfile: "moirae-protocol-mp04-fates-v1" as const,
    adrasteiaSha: "a1c01bf9e6f9d6a126cfdcc1acfacd488b214210" as const,
    anankeSha: "114063e03332af3389fe805193e88a62111d9323" as const,
    horaeSha: "aa296b420fbcf578089ca66dc03f6d09d9b06f00" as const,
    reconciliationRequired: false,
    redispatchAttempted: false as const,
    events: [] as readonly string[],
    observedAt,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return canonicalizeJsonV1(left) === canonicalizeJsonV1(right);
  } catch {
    return false;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

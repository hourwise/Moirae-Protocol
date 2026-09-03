import { z } from "zod";

import {
  ActionIntentV1Schema,
  actionIntentCoreFromIntent,
  actionIntentDigest,
  actionIntentIdempotencyKey,
  canonicalizeJsonV1,
  type ActionIntentV1,
} from "../../action-compiler/src/index.js";

/**
 * MP-03 uses the accepted Ananke profile as an injected native dependency.
 * This package owns only the Moirae-to-Fates mapping and result boundary; it
 * deliberately does not copy or reimplement Ananke's authority engines.
 */
export const MP03_FATES_PROFILE = "ananke-fates-006b-mp03-admission-v0.1.0-protocol-1.4.0" as const;
export const MP03_ANANKE_TAG_OBJECT_SHA = "6425d4b34fba62ab60381a4a2237786d0d6173ad" as const;
export const MP03_ANANKE_SHA = "6bf8902c55c4f3f7593a987582b50783c8a7b5a0" as const;
export const MP03_FATES_006A_SHA = "fc318663cbed3072128355fb3697e7f2b47f5f11" as const;
export const MP03_ADRASTEIA_SHA = "a1c01bf9e6f9d6a126cfdcc1acfacd488b214210" as const;
export const MP03_POLICY_VERSION = "builtin:0.1.0" as const;
export const MP03_SERVER = "moirae.administrative" as const;
export const MP03_VERSION = "1.0.0" as const;
export const MP03_RUNTIME_ID = "ananke" as const;
export const MP03_TENANT_ID = "moirae-mp02-fixture-tenant" as const;
export const MP03_AUTHENTICATED_WORKLOAD = "moirae-administrative-workload-v1" as const;
export const MP03_ACTING_AGENT = "moirae-administrative-agent-v1" as const;
export const MP03_REQUESTER = "moirae-requester-CUSTOMER-001" as const;
export const MP03_RUNTIME_INSTANCE = "fates-006b-test-runtime" as const;
export const MP03_SESSION_ID = "fates-006b-execution-session" as const;
export const MP03_CORRELATION_ID = "CORRELATION-FATES-006B-001" as const;
export const MP03_CAUSATION_ID = "CAUSE-FATES-006B-001" as const;
export const MP03_CONTEXT_TIMESTAMP = "2026-09-03T11:00:00.000Z" as const;

export const MP03_TOOLS = Object.freeze({
  SEND_APPOINTMENT_DETAILS: "moirae.administrative.send_appointment_details",
  RESCHEDULE_APPOINTMENT: "moirae.administrative.reschedule_appointment",
  TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: "moirae.administrative.transmit_customer_contact_directory",
} as const);

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const timestampSchema = z.string().datetime({ offset: true });
const actionSchema = z.enum([
  "SEND_APPOINTMENT_DETAILS",
  "RESCHEDULE_APPOINTMENT",
  "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
]);
const identifierSchema = z.string().trim().min(1).max(200);

const scopeSchemas = {
  SEND_APPOINTMENT_DETAILS: z
    .object({
      mode: z.literal("bounded"),
      tenantId: z.literal(MP03_TENANT_ID),
      resourceType: z.literal("appointment_details"),
      resourceIds: z.tuple([z.literal("RESOURCE-APPOINTMENT-DETAILS-001")]),
      operations: z.tuple([z.literal("disclose")]),
      providerNamespace: z.literal("moirae"),
    })
    .strict(),
  RESCHEDULE_APPOINTMENT: z
    .object({
      mode: z.literal("bounded"),
      tenantId: z.literal(MP03_TENANT_ID),
      resourceType: z.literal("appointment_booking"),
      resourceIds: z.tuple([z.literal("RESOURCE-APPOINTMENT-BOOKING-001")]),
      operations: z.tuple([z.literal("reschedule")]),
      providerNamespace: z.literal("moirae"),
    })
    .strict(),
  TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: z
    .object({
      mode: z.literal("bounded"),
      tenantId: z.literal(MP03_TENANT_ID),
      resourceType: z.literal("customer_contact_directory"),
      resourceIds: z.tuple([z.literal("RESOURCE-CONTACT-DIRECTORY-001")]),
      operations: z.tuple([z.literal("export")]),
      providerNamespace: z.literal("moirae"),
    })
    .strict(),
} as const;

const contextPrincipalSchema = z
  .object({
    id: identifierSchema,
    kind: z.enum(["service", "agent", "human"]),
    tenantId: z.literal(MP03_TENANT_ID),
  })
  .strict();

const correlationSchema = z
  .object({
    requestId: identifierSchema,
    correlationId: z.literal(MP03_CORRELATION_ID),
    causationId: z.literal(MP03_CAUSATION_ID),
  })
  .strict();

/** The host-authenticated, Fates-native context required by this fixture profile. */
export const Mp03AuthenticatedContextSchema = z
  .object({
    authenticatedPrincipal: contextPrincipalSchema.extend({
      id: z.literal(MP03_AUTHENTICATED_WORKLOAD),
      kind: z.literal("service"),
    }),
    actingPrincipal: contextPrincipalSchema.extend({
      id: z.literal(MP03_ACTING_AGENT),
      kind: z.literal("agent"),
    }),
    representedPrincipal: contextPrincipalSchema.extend({
      id: z.literal(MP03_REQUESTER),
      kind: z.literal("human"),
    }),
    runtimeId: z.literal(MP03_RUNTIME_ID),
    runtimeInstanceId: z.literal(MP03_RUNTIME_INSTANCE),
    sessionId: z.literal(MP03_SESSION_ID),
    tenantId: z.literal(MP03_TENANT_ID),
    resourceScope: z.union([
      scopeSchemas.SEND_APPOINTMENT_DETAILS,
      scopeSchemas.RESCHEDULE_APPOINTMENT,
      scopeSchemas.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY,
    ]),
    correlation: correlationSchema,
    policyVersion: z.literal(MP03_POLICY_VERSION),
    purpose: z.enum([
      "appointment.details.disclosure",
      "appointment.reschedule",
      "customer-directory.external-export",
    ]),
  })
  .strict();

export type Mp03AuthenticatedContext = z.infer<typeof Mp03AuthenticatedContextSchema>;

export interface FatesAdmissionGateway {
  admit(
    operation: FatesOperation,
    args: Record<string, unknown>,
    options: {
      executionContext: Mp03AuthenticatedContext;
      now: string;
      approvalId?: string;
    },
  ): Promise<unknown>;
}

export interface FatesOperation {
  readonly server: typeof MP03_SERVER;
  readonly toolName: (typeof MP03_TOOLS)[keyof typeof MP03_TOOLS];
  readonly version: typeof MP03_VERSION;
}

const operationSchema = z
  .object({
    server: z.literal(MP03_SERVER),
    toolName: z.enum([
      MP03_TOOLS.SEND_APPOINTMENT_DETAILS,
      MP03_TOOLS.RESCHEDULE_APPOINTMENT,
      MP03_TOOLS.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY,
    ]),
    version: z.literal(MP03_VERSION),
  })
  .strict();

const profileSchema = z.object({
  operation: operationSchema,
  scope: z.record(z.string(), z.unknown()),
  purpose: z.enum([
    "appointment.details.disclosure",
    "appointment.reschedule",
    "customer-directory.external-export",
  ]),
  riskClass: z.enum(["EXTERNAL_SEND", "INTERNAL_WRITE", "NETWORK_EGRESS"]),
  requiredPermission: z.enum([
    "appointment.details.disclose",
    "appointment.reschedule",
    "customer.contact-directory.export",
  ]),
  sideEffectType: z.enum(["EXTERNAL_DISCLOSURE", "BOOKING_MUTATION", "BULK_EXTERNAL_EXPORT"]),
  retryable: z.literal(false),
  requiresApproval: z.literal(true),
});

export const MP03_PROFILE = Object.freeze({
  SEND_APPOINTMENT_DETAILS: {
    operation: {
      server: MP03_SERVER,
      toolName: MP03_TOOLS.SEND_APPOINTMENT_DETAILS,
      version: MP03_VERSION,
    },
    scope: {
      mode: "bounded",
      tenantId: MP03_TENANT_ID,
      resourceType: "appointment_details",
      resourceIds: ["RESOURCE-APPOINTMENT-DETAILS-001"],
      operations: ["disclose"],
      providerNamespace: "moirae",
    },
    purpose: "appointment.details.disclosure",
    riskClass: "EXTERNAL_SEND",
    requiredPermission: "appointment.details.disclose",
    sideEffectType: "EXTERNAL_DISCLOSURE",
    retryable: false,
    requiresApproval: true,
  },
  RESCHEDULE_APPOINTMENT: {
    operation: {
      server: MP03_SERVER,
      toolName: MP03_TOOLS.RESCHEDULE_APPOINTMENT,
      version: MP03_VERSION,
    },
    scope: {
      mode: "bounded",
      tenantId: MP03_TENANT_ID,
      resourceType: "appointment_booking",
      resourceIds: ["RESOURCE-APPOINTMENT-BOOKING-001"],
      operations: ["reschedule"],
      providerNamespace: "moirae",
    },
    purpose: "appointment.reschedule",
    riskClass: "INTERNAL_WRITE",
    requiredPermission: "appointment.reschedule",
    sideEffectType: "BOOKING_MUTATION",
    retryable: false,
    requiresApproval: true,
  },
  TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: {
    operation: {
      server: MP03_SERVER,
      toolName: MP03_TOOLS.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY,
      version: MP03_VERSION,
    },
    scope: {
      mode: "bounded",
      tenantId: MP03_TENANT_ID,
      resourceType: "customer_contact_directory",
      resourceIds: ["RESOURCE-CONTACT-DIRECTORY-001"],
      operations: ["export"],
      providerNamespace: "moirae",
    },
    purpose: "customer-directory.external-export",
    riskClass: "NETWORK_EGRESS",
    requiredPermission: "customer.contact-directory.export",
    sideEffectType: "BULK_EXTERNAL_EXPORT",
    retryable: false,
    requiresApproval: true,
  },
} as const);

export type Mp03Action = keyof typeof MP03_PROFILE;

export const MP03_NATIVE_HASH_FIXTURES = Object.freeze({
  SEND_APPOINTMENT_DETAILS: "8242ac8739064472391409bca7792a6804227a6ef56f9ffa8c8ffdc05b28899e",
  RESCHEDULE_APPOINTMENT: "fcc5ae5a5bc6f8b2b8756f2cb283ae008769c6bf2e4af3a060f144f3dc978eaa",
  TRANSMIT_CUSTOMER_CONTACT_DIRECTORY:
    "af6fcf84b5cc498138649111cc1810c2e32145ac9d1cd99136ac045e9e24af84",
} as const);

export const MP03_DEPENDENCY_PROVENANCE = Object.freeze({
  profile: MP03_FATES_PROFILE,
  anankeTagObjectSha: MP03_ANANKE_TAG_OBJECT_SHA,
  anankeSha: MP03_ANANKE_SHA,
  adrasteiaSha: MP03_ADRASTEIA_SHA,
} as const);

export type Mp03DependencyProvenance = {
  readonly profile: string;
  readonly anankeTagObjectSha: string;
  readonly anankeSha: string;
  readonly adrasteiaSha: string;
};

const acceptedArgs = {
  SEND_APPOINTMENT_DETAILS: {
    bookingId: "BOOKING-001",
    recipientAddress: "alex@example.test",
    templateId: "appointment-details-v1",
  },
  RESCHEDULE_APPOINTMENT: {
    bookingId: "BOOKING-001",
    currentStart: "2026-09-04T13:00:00.000Z",
    proposedStart: "2026-09-07T14:00:00.000Z",
    timeZone: "Europe/London",
  },
  TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: {
    directoryResourceId: "RESOURCE-CONTACT-DIRECTORY-001",
    recipientAddress: "personal-address@example.test",
    exportFormat: "csv",
  },
} as const;

function exactJson(left: unknown, right: unknown): boolean {
  try {
    return canonicalizeJsonV1(left) === canonicalizeJsonV1(right);
  } catch {
    return false;
  }
}

function profileFor(action: Mp03Action) {
  return profileSchema.parse(MP03_PROFILE[action]);
}

function expectedScope(action: Mp03Action) {
  return MP03_PROFILE[action].scope;
}

function mappingFailure(action: string, detail: string): MappingResult {
  return { ok: false, reason: "fixture_profile_mismatch", detail: `${action}: ${detail}` };
}

type MappingResult =
  | {
      ok: true;
      action: Mp03Action;
      intent: ActionIntentV1;
      operation: FatesOperation;
      args: Record<string, unknown>;
      profile: ReturnType<typeof profileFor>;
    }
  | { ok: false; reason: "fixture_profile_mismatch" | "unsupported_action"; detail: string };

function mapIntent(intent: ActionIntentV1): MappingResult {
  const action = intent.action as Mp03Action;
  if (!Object.hasOwn(MP03_PROFILE, action)) {
    return {
      ok: false,
      reason: "unsupported_action",
      detail: "The action is not in the accepted profile.",
    };
  }

  const profile = profileFor(action);
  const commonChecks = [
    [intent.principal.agentPrincipalId, MP03_ACTING_AGENT, "compiler principal"],
    [intent.requester.customerId, "CUSTOMER-001", "requester"],
    [intent.requester.verifiedEmail, "alex@example.test", "verified requester address"],
    [intent.sourceRequestId, "REQUEST-MP02-DETAILS-001", "source request"],
    [intent.contextTimestamp, MP03_CONTEXT_TIMESTAMP, "context timestamp"],
  ] as const;
  for (const [actual, expected, label] of commonChecks) {
    if (actual !== expected)
      return mappingFailure(action, `${label} is outside the accepted fixture.`);
  }

  const expectedResource =
    action === "SEND_APPOINTMENT_DETAILS"
      ? { resourceId: "RESOURCE-APPOINTMENT-DETAILS-001", resourceType: "appointment_details" }
      : action === "RESCHEDULE_APPOINTMENT"
        ? { resourceId: "RESOURCE-APPOINTMENT-BOOKING-001", resourceType: "appointment_booking" }
        : {
            resourceId: "RESOURCE-CONTACT-DIRECTORY-001",
            resourceType: "customer_contact_directory",
          };
  if (!exactJson(intent.resource, expectedResource)) {
    return mappingFailure(action, "resource identity is outside the accepted fixture.");
  }

  if (action === "SEND_APPOINTMENT_DETAILS") {
    if (
      intent.effectClass !== "DISCLOSE" ||
      !exactJson(intent.target, {
        kind: "email",
        address: "alex@example.test",
        classification: "verified_requester",
      }) ||
      !exactJson(intent.parameters, acceptedArgs.SEND_APPOINTMENT_DETAILS)
    ) {
      return mappingFailure(
        action,
        "disclosure target or parameters do not match the accepted fixture.",
      );
    }
  } else if (action === "RESCHEDULE_APPOINTMENT") {
    if (
      intent.effectClass !== "MODIFY" ||
      !exactJson(intent.target, { kind: "customer", customerId: "CUSTOMER-001" }) ||
      !exactJson(intent.parameters, acceptedArgs.RESCHEDULE_APPOINTMENT)
    ) {
      return mappingFailure(
        action,
        "mutation target or parameters do not match the accepted fixture.",
      );
    }
  } else if (
    intent.effectClass !== "EXPORT" ||
    !exactJson(intent.target, {
      kind: "email",
      address: "personal-address@example.test",
      classification: "external_explicit",
    }) ||
    !exactJson(intent.parameters, acceptedArgs.TRANSMIT_CUSTOMER_CONTACT_DIRECTORY)
  ) {
    return mappingFailure(action, "export target or parameters do not match the accepted fixture.");
  }

  return {
    ok: true,
    action,
    intent,
    operation: profile.operation,
    args: { ...intent.parameters },
    profile,
  };
}

export const Mp03BoundaryReasonSchema = z.enum([
  "invalid_action_intent",
  "unsupported_action",
  "fixture_profile_mismatch",
  "principal_mismatch",
  "requester_mismatch",
  "resource_scope_mismatch",
  "purpose_mismatch",
  "policy_version_mismatch",
  "operation_mapping_mismatch",
  "native_registration_missing",
  "invalid_authenticated_context",
  "invalid_explicit_time",
  "invalid_approval",
  "malformed_fates_result",
  "native_hash_mismatch",
  "dependency_checkpoint_mismatch",
]);

export type Mp03BoundaryReason = z.infer<typeof Mp03BoundaryReasonSchema>;
const nativeDecisionSchema = z.enum([
  "ALLOW",
  "DENY",
  "REQUIRE_APPROVAL",
  "REQUIRE_REFRESH",
  "REQUIRE_NARROWER_SCOPE",
  "REQUIRE_HUMAN_CLARIFICATION",
]);

const nativeAdmissionResultSchema = z.union([
  z
    .object({
      authority: z.literal("admission-only"),
      status: z.literal("ADMITTED"),
      decision: z.literal("ALLOW"),
      operation: operationSchema,
      actionHash: hashSchema,
      approvalGrantId: identifierSchema.optional(),
      approvalActionHash: hashSchema.optional(),
      approvalExpiresAt: timestampSchema.optional(),
      evaluatedAt: timestampSchema,
      auditId: identifierSchema,
      executorInvoked: z.literal(false),
      effectExecuted: z.literal(false),
    })
    .strict(),
  z
    .object({
      authority: z.literal("admission-only"),
      status: z.literal("WAITING_FOR_APPROVAL"),
      decision: z.literal("REQUIRE_APPROVAL"),
      operation: operationSchema,
      actionHash: hashSchema,
      approvalGrantId: identifierSchema,
      approvalActionHash: hashSchema,
      approvalExpiresAt: timestampSchema,
      evaluatedAt: timestampSchema,
      auditId: identifierSchema,
      executorInvoked: z.literal(false),
      effectExecuted: z.literal(false),
    })
    .strict(),
  z
    .object({
      authority: z.literal("admission-only"),
      status: z.literal("REJECTED"),
      decision: z.enum([
        "DENY",
        "REQUIRE_REFRESH",
        "REQUIRE_NARROWER_SCOPE",
        "REQUIRE_HUMAN_CLARIFICATION",
      ]),
      operation: operationSchema,
      actionHash: hashSchema,
      evaluatedAt: timestampSchema,
      auditId: identifierSchema,
      executorInvoked: z.literal(false),
      effectExecuted: z.literal(false),
    })
    .strict(),
  z
    .object({
      authority: z.literal("admission-only"),
      status: z.literal("BOUNDARY_FAILURE"),
      operation: operationSchema.optional(),
      boundaryCode: identifierSchema,
      message: z.string().min(1),
      actionHash: hashSchema.optional(),
      evaluatedAt: timestampSchema,
      auditId: identifierSchema,
      executorInvoked: z.literal(false),
      effectExecuted: z.literal(false),
    })
    .strict(),
]);

export type NativeAdmissionResult = z.infer<typeof nativeAdmissionResultSchema>;
type NativeGovernedAdmissionResult = Exclude<NativeAdmissionResult, { status: "BOUNDARY_FAILURE" }>;

export const MoiraeAdmissionEvidenceSchema = z
  .object({
    sourceRequestId: identifierSchema,
    moiraeCanonicalDigest: hashSchema,
    moiraeIdempotencyKey: hashSchema,
    action: actionSchema,
    dependencyProfile: z.literal(MP03_FATES_PROFILE),
    anankeSha: z.literal(MP03_ANANKE_SHA),
    adrasteiaSha: z.literal(MP03_ADRASTEIA_SHA),
    operation: operationSchema,
    nativeActionHash: hashSchema,
    nativeDecision: nativeDecisionSchema.optional(),
    admissionStatus: z.enum(["ADMITTED", "WAITING_FOR_APPROVAL", "REJECTED"]),
    approvalId: identifierSchema.optional(),
    approvalStatus: z.enum(["not_requested", "pending", "approved", "invalid"]).optional(),
    resourceScopeReference: identifierSchema,
    purpose: identifierSchema,
    contextTimestamp: timestampSchema,
    evaluatedAt: timestampSchema,
    auditId: identifierSchema,
    executorInvoked: z.literal(false),
    effectExecuted: z.literal(false),
  })
  .strict();

export type MoiraeAdmissionEvidence = z.infer<typeof MoiraeAdmissionEvidenceSchema>;

const commonResult = {
  authority: z.literal("admission-only"),
  action: actionSchema,
  operation: operationSchema,
  nativeActionHash: hashSchema,
  moiraeCanonicalDigest: hashSchema,
  moiraeIdempotencyKey: hashSchema,
  evidence: MoiraeAdmissionEvidenceSchema,
  executorInvoked: z.literal(false),
  effectExecuted: z.literal(false),
} as const;

export const MoiraeAdmissionResultV1Schema = z.union([
  z
    .object({
      ...commonResult,
      status: z.literal("ADMITTED"),
      nativeDecision: z.literal("ALLOW"),
      approvalId: identifierSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...commonResult,
      status: z.literal("WAITING_FOR_APPROVAL"),
      nativeDecision: z.literal("REQUIRE_APPROVAL"),
      approvalId: identifierSchema,
    })
    .strict(),
  z
    .object({
      ...commonResult,
      status: z.literal("REJECTED"),
      nativeDecision: z.enum([
        "DENY",
        "REQUIRE_REFRESH",
        "REQUIRE_NARROWER_SCOPE",
        "REQUIRE_HUMAN_CLARIFICATION",
      ]),
    })
    .strict(),
  z
    .object({
      authority: z.literal("admission-only"),
      status: z.literal("BOUNDARY_FAILURE"),
      reason: Mp03BoundaryReasonSchema,
      message: z.string().min(1),
      executorInvoked: z.literal(false),
      effectExecuted: z.literal(false),
    })
    .strict(),
]);

export type MoiraeAdmissionResultV1 = z.infer<typeof MoiraeAdmissionResultV1Schema>;

export interface AdmitActionIntentInput {
  readonly intent: unknown;
  readonly authenticatedContext: unknown;
  readonly now: unknown;
  readonly approvalId?: unknown;
}

const inputSchema = z
  .object({
    intent: z.unknown(),
    authenticatedContext: z.unknown(),
    now: z.unknown(),
    approvalId: z.string().trim().min(1).optional(),
  })
  .strict();

function boundaryFailure(reason: Mp03BoundaryReason, message: string): MoiraeAdmissionResultV1 {
  return {
    authority: "admission-only",
    status: "BOUNDARY_FAILURE",
    reason,
    message,
    executorInvoked: false,
    effectExecuted: false,
  };
}

function contextMatchesIntent(
  intent: ActionIntentV1,
  context: Mp03AuthenticatedContext,
  action: Mp03Action,
): Mp03BoundaryReason | undefined {
  if (intent.principal.agentPrincipalId !== context.actingPrincipal.id) return "principal_mismatch";
  if (
    intent.requester.customerId !== "CUSTOMER-001" ||
    context.representedPrincipal.id !== MP03_REQUESTER
  ) {
    return "requester_mismatch";
  }
  if (context.correlation.requestId !== intent.sourceRequestId) return "requester_mismatch";
  if (!exactJson(context.resourceScope, expectedScope(action))) return "resource_scope_mismatch";
  if (context.purpose !== MP03_PROFILE[action].purpose) return "purpose_mismatch";
  if (context.policyVersion !== MP03_POLICY_VERSION) return "policy_version_mismatch";
  return undefined;
}

function resultEvidence(
  intent: ActionIntentV1,
  mapped: Extract<MappingResult, { ok: true }>,
  native: NativeGovernedAdmissionResult,
): MoiraeAdmissionEvidence {
  const approvalId = "approvalGrantId" in native ? native.approvalGrantId : undefined;
  const approvalStatus =
    native.status === "ADMITTED"
      ? "approved"
      : native.status === "WAITING_FOR_APPROVAL"
        ? "pending"
        : undefined;
  return {
    sourceRequestId: intent.sourceRequestId,
    moiraeCanonicalDigest: intent.canonicalDigest,
    moiraeIdempotencyKey: intent.idempotencyKey,
    action: mapped.action,
    dependencyProfile: MP03_FATES_PROFILE,
    anankeSha: MP03_ANANKE_SHA,
    adrasteiaSha: MP03_ADRASTEIA_SHA,
    operation: mapped.operation,
    nativeActionHash: native.actionHash ?? "0".repeat(64),
    ...(native.decision ? { nativeDecision: native.decision } : {}),
    admissionStatus: native.status,
    ...(approvalId ? { approvalId } : {}),
    ...(approvalStatus ? { approvalStatus } : {}),
    resourceScopeReference: mapped.intent.resource.resourceId,
    purpose: mapped.profile.purpose,
    contextTimestamp: intent.contextTimestamp,
    evaluatedAt: native.evaluatedAt,
    auditId: native.auditId,
    executorInvoked: false,
    effectExecuted: false,
  };
}

function convertNativeResult(
  intent: ActionIntentV1,
  mapped: Extract<MappingResult, { ok: true }>,
  native: NativeAdmissionResult,
): MoiraeAdmissionResultV1 {
  if (native.status === "BOUNDARY_FAILURE") {
    const nativeBoundaryReason: Mp03BoundaryReason =
      native.boundaryCode === "APPROVAL_INVALID"
        ? "invalid_approval"
        : native.boundaryCode === "UNKNOWN_OPERATION"
          ? "native_registration_missing"
          : native.boundaryCode === "POLICY_VERSION_MISMATCH"
            ? "policy_version_mismatch"
            : native.boundaryCode === "PURPOSE_MISMATCH"
              ? "purpose_mismatch"
              : native.boundaryCode === "RESOURCE_SCOPE_MISMATCH"
                ? "resource_scope_mismatch"
                : native.boundaryCode === "AUTHENTICATED_PRINCIPAL_MISMATCH" ||
                    native.boundaryCode === "ACTING_PRINCIPAL_MISMATCH"
                  ? "principal_mismatch"
                  : native.boundaryCode === "REPRESENTED_PRINCIPAL_MISMATCH"
                    ? "requester_mismatch"
                    : "malformed_fates_result";
    return boundaryFailure(nativeBoundaryReason, native.message);
  }

  const evidence = resultEvidence(intent, mapped, native as NativeGovernedAdmissionResult);
  if (native.status === "ADMITTED") {
    return {
      authority: "admission-only",
      status: "ADMITTED",
      nativeDecision: "ALLOW",
      action: mapped.action,
      operation: mapped.operation,
      nativeActionHash: native.actionHash,
      moiraeCanonicalDigest: intent.canonicalDigest,
      moiraeIdempotencyKey: intent.idempotencyKey,
      ...(native.approvalGrantId ? { approvalId: native.approvalGrantId } : {}),
      evidence,
      executorInvoked: false,
      effectExecuted: false,
    };
  }
  if (native.status === "WAITING_FOR_APPROVAL") {
    return {
      authority: "admission-only",
      status: "WAITING_FOR_APPROVAL",
      nativeDecision: "REQUIRE_APPROVAL",
      action: mapped.action,
      operation: mapped.operation,
      nativeActionHash: native.actionHash,
      moiraeCanonicalDigest: intent.canonicalDigest,
      moiraeIdempotencyKey: intent.idempotencyKey,
      approvalId: native.approvalGrantId,
      evidence,
      executorInvoked: false,
      effectExecuted: false,
    };
  }
  return {
    authority: "admission-only",
    status: "REJECTED",
    nativeDecision: native.decision,
    action: mapped.action,
    operation: mapped.operation,
    nativeActionHash: native.actionHash,
    moiraeCanonicalDigest: intent.canonicalDigest,
    moiraeIdempotencyKey: intent.idempotencyKey,
    evidence,
    executorInvoked: false,
    effectExecuted: false,
  };
}

async function admitWithGateway(
  gateway: FatesAdmissionGateway,
  provenance: Mp03DependencyProvenance,
  input: AdmitActionIntentInput,
): Promise<MoiraeAdmissionResultV1> {
  if (!exactJson(provenance, MP03_DEPENDENCY_PROVENANCE)) {
    return boundaryFailure(
      "dependency_checkpoint_mismatch",
      "The injected Fates dependency is not the accepted MP-03 checkpoint.",
    );
  }
  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success)
    return boundaryFailure("invalid_action_intent", "MP-03 input is malformed.");

  const intentResult = ActionIntentV1Schema.safeParse(parsedInput.data.intent);
  if (!intentResult.success)
    return boundaryFailure("invalid_action_intent", "ActionIntentV1 validation failed.");
  const intent = intentResult.data;
  try {
    const core = actionIntentCoreFromIntent(intent);
    if (
      actionIntentDigest(core) !== intent.canonicalDigest ||
      actionIntentIdempotencyKey(intent.sourceRequestId, intent.canonicalDigest) !==
        intent.idempotencyKey
    ) {
      return boundaryFailure(
        "invalid_action_intent",
        "ActionIntentV1 derived integrity fields do not verify.",
      );
    }
  } catch {
    return boundaryFailure(
      "invalid_action_intent",
      "ActionIntentV1 canonical material could not be verified.",
    );
  }

  const mapped = mapIntent(intent);
  if (!mapped.ok) return boundaryFailure(mapped.reason, mapped.detail);

  const contextResult = Mp03AuthenticatedContextSchema.safeParse(
    parsedInput.data.authenticatedContext,
  );
  if (!contextResult.success)
    return boundaryFailure(
      "invalid_authenticated_context",
      "Authenticated Fates context is invalid.",
    );
  const context = contextResult.data;
  const mismatch = contextMatchesIntent(intent, context, mapped.action);
  if (mismatch)
    return boundaryFailure(
      mismatch,
      "Authenticated context does not match the accepted fixture binding.",
    );

  const nowResult = timestampSchema.safeParse(parsedInput.data.now);
  if (!nowResult.success || !Number.isFinite(Date.parse(nowResult.data))) {
    return boundaryFailure(
      "invalid_explicit_time",
      "MP-03 requires a valid explicit trusted time.",
    );
  }
  const now = new Date(Date.parse(nowResult.data)).toISOString();

  let nativeRaw: unknown;
  try {
    nativeRaw = await gateway.admit(mapped.operation, mapped.args, {
      executionContext: context,
      now,
      ...(parsedInput.data.approvalId ? { approvalId: parsedInput.data.approvalId } : {}),
    });
  } catch {
    return boundaryFailure(
      "malformed_fates_result",
      "The native Fates admission call failed safely.",
    );
  }
  const nativeResult = nativeAdmissionResultSchema.safeParse(nativeRaw);
  if (!nativeResult.success)
    return boundaryFailure(
      "malformed_fates_result",
      "Native Fates admission result failed validation.",
    );
  if (!exactJson(nativeResult.data.operation, mapped.operation)) {
    return boundaryFailure(
      "operation_mapping_mismatch",
      "Native result operation does not match the mapped operation.",
    );
  }
  if (
    nativeResult.data.actionHash &&
    nativeResult.data.actionHash !== MP03_NATIVE_HASH_FIXTURES[mapped.action]
  ) {
    return boundaryFailure(
      "native_hash_mismatch",
      "Native Fates returned an action hash outside the accepted fixture.",
    );
  }
  return convertNativeResult(intent, mapped, nativeResult.data);
}

export interface Mp03AdmissionAdapter {
  admitActionIntent(input: AdmitActionIntentInput): Promise<MoiraeAdmissionResultV1>;
}

export function createMp03AdmissionAdapter(
  gateway: FatesAdmissionGateway,
  provenance: Mp03DependencyProvenance,
): Mp03AdmissionAdapter {
  if (!gateway || typeof gateway.admit !== "function") {
    throw new TypeError("MP-03 requires an injected native Fates admission gateway.");
  }
  return { admitActionIntent: (input) => admitWithGateway(gateway, provenance, input) };
}

export { acceptedArgs as MP03_ACCEPTED_ARGUMENT_FIXTURES };

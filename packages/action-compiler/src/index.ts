import { z } from "zod";

import {
  ActionIntentV1Schema,
  type ActionIntentCoreV1,
  type ActionIntentV1,
} from "../../action-contracts/src/index.js";
import { actionIntentDigest, actionIntentIdempotencyKey } from "./canonical.js";
import {
  CompilerContextV1Schema,
  type AppointmentRecordV1,
  type CompilerContextV1,
  type EvidenceRefV1,
  type ResourceRecordV1,
} from "./context.js";

/**
 * Defensive structural mirror of MP-01's AgentProposalV1. The compiler does
 * not import or invoke Strands; it validates the hostile input shape again at
 * this deterministic boundary.
 */
const AgentProposalInputSchema = z
  .object({
    schemaVersion: z.literal("agent-proposal-v1"),
    requestKind: z.enum([
      "appointment_details",
      "appointment_reschedule",
      "bulk_contact_transmission",
      "unknown_administrative_request",
    ]),
    subjectReference: z.string().trim().min(1).max(200).nullable(),
    requestedChange: z.string().trim().min(1).max(500).nullable(),
    temporalExpression: z.string().trim().min(1).max(200).nullable(),
    recipientReference: z.string().trim().min(1).max(320).nullable(),
    summary: z.string().trim().min(1).max(500),
    confidenceOrAmbiguity: z
      .object({
        label: z.enum(["clear", "ambiguous", "unknown"]),
        note: z.string().trim().min(1).max(300),
      })
      .strict(),
    unresolvedFields: z.array(z.string().trim().min(1).max(100)).max(10),
  })
  .strict();

export type AgentProposalV1 = z.infer<typeof AgentProposalInputSchema>;

export const clarificationReasons = [
  "subject_not_unique",
  "subject_not_found",
  "temporal_expression_ambiguous",
  "multiple_available_slots",
  "no_available_slot",
  "recipient_unresolved",
  "requester_unresolved",
  "resource_not_found",
  "resource_not_unique",
  "unsupported_semantic_action",
] as const;

export const rejectionReasons = [
  "unsupported_request_kind",
  "invalid_proposal",
  "malformed_trusted_registry",
] as const;

export type ClarificationReason = (typeof clarificationReasons)[number];
export type RejectionReason = (typeof rejectionReasons)[number];

export interface CompiledResultV1 {
  status: "COMPILED";
  actionIntent: ActionIntentV1;
}

export interface NeedsClarificationResultV1 {
  status: "NEEDS_CLARIFICATION";
  reason: ClarificationReason;
  description: string;
}

export interface RejectedResultV1 {
  status: "REJECTED";
  reason: RejectionReason;
  description: string;
}

export type CompileResultV1 = CompiledResultV1 | NeedsClarificationResultV1 | RejectedResultV1;

function isClarification(value: unknown): value is NeedsClarificationResultV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "NEEDS_CLARIFICATION"
  );
}

function isRejected(value: unknown): value is RejectedResultV1 {
  return (
    typeof value === "object" && value !== null && "status" in value && value.status === "REJECTED"
  );
}

export interface CompileAgentProposalInputV1 {
  proposal: AgentProposalV1;
  context: CompilerContextV1;
}

type RawCompileInput = {
  proposal?: unknown;
  context?: unknown;
};

type LondonParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

const londonPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  calendar: "gregory",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  numberingSystem: "latn",
  second: "2-digit",
  timeZone: "Europe/London",
  year: "numeric",
});

const londonWeekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  calendar: "gregory",
  timeZone: "Europe/London",
  weekday: "long",
});

const emailSchema = z.string().email();

function clarification(
  reason: ClarificationReason,
  description: string,
): NeedsClarificationResultV1 {
  return { status: "NEEDS_CLARIFICATION", reason, description };
}

function rejected(reason: RejectionReason, description: string): RejectedResultV1 {
  return { status: "REJECTED", reason, description };
}

function parseInstant(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function normalizeInstant(value: string): string | undefined {
  const timestamp = parseInstant(value);
  return timestamp === undefined ? undefined : new Date(timestamp).toISOString();
}

function londonParts(value: string): LondonParts | undefined {
  const timestamp = parseInstant(value);
  if (timestamp === undefined) {
    return undefined;
  }

  const date = new Date(timestamp);
  const values = Object.fromEntries(
    londonPartsFormatter.formatToParts(date).map(({ type, value: partValue }) => [type, partValue]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: londonWeekdayFormatter.format(date).toLowerCase(),
  };
}

function dateKey(parts: LondonParts): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function nextMondayAfter(date: LondonParts): string {
  const dateAtUtcMidnight = Date.UTC(date.year, date.month - 1, date.day);
  const utcWeekday = new Date(dateAtUtcMidnight).getUTCDay();
  const daysUntilNextMonday = (1 - utcWeekday + 7) % 7 || 7;
  const nextMonday = new Date(dateAtUtcMidnight + daysUntilNextMonday * 24 * 60 * 60 * 1000);

  return `${nextMonday.getUTCFullYear().toString().padStart(4, "0")}-${(
    nextMonday.getUTCMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-${nextMonday.getUTCDate().toString().padStart(2, "0")}`;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): boolean {
  return new Set(items.map(key)).size === items.length;
}

function validateTrustedContext(context: CompilerContextV1): string | undefined {
  if (!uniqueBy(context.customers, (record) => record.customerId)) {
    return "Customer registry contains duplicate customer IDs.";
  }

  if (!uniqueBy(context.appointments, (record) => record.bookingId)) {
    return "Appointment registry contains duplicate booking IDs.";
  }

  if (!uniqueBy(context.availabilitySlots, (record) => record.slotId)) {
    return "Availability registry contains duplicate slot IDs.";
  }

  if (!uniqueBy(context.resources, (record) => record.resourceId)) {
    return "Resource registry contains duplicate resource IDs.";
  }

  if (!uniqueBy(context.evidenceRefs, (record) => record.kind)) {
    return "Trusted evidence references must have one stable reference per kind.";
  }

  if (parseInstant(context.receivedAt) === undefined) {
    return "Trusted receivedAt is not a valid timestamp.";
  }

  const customerIds = new Set(context.customers.map((record) => record.customerId));

  for (const recipient of context.recipients) {
    if (!customerIds.has(recipient.customerId)) {
      return "Recipient registry references an unknown customer.";
    }
  }

  for (const appointment of context.appointments) {
    if (!customerIds.has(appointment.customerId) || parseInstant(appointment.start) === undefined) {
      return "Appointment registry contains an invalid trusted record.";
    }
  }

  for (const slot of context.availabilitySlots) {
    const start = parseInstant(slot.start);
    const end = parseInstant(slot.end);
    if (start === undefined || end === undefined || end <= start) {
      return "Availability registry contains an invalid trusted record.";
    }
  }

  for (const resource of context.resources) {
    if (resource.customerId && !customerIds.has(resource.customerId)) {
      return "Resource registry references an unknown customer.";
    }

    if (
      (resource.resourceType === "appointment_details" ||
        resource.resourceType === "appointment_booking") &&
      (!resource.bookingId || !resource.customerId)
    ) {
      return "Appointment resource records must identify both a booking and a customer.";
    }

    if (resource.resourceType === "customer_contact_directory" && resource.bookingId !== null) {
      return "A customer contact-directory resource cannot reference an appointment booking.";
    }

    if (
      resource.bookingId &&
      !context.appointments.some(
        (appointment) =>
          appointment.bookingId === resource.bookingId &&
          (resource.customerId === null || appointment.customerId === resource.customerId),
      )
    ) {
      return "Resource registry references an unknown booking.";
    }
  }

  return undefined;
}

function evidenceFor(
  context: CompilerContextV1,
  kinds: EvidenceRefV1["kind"][],
): EvidenceRefV1[] | RejectedResultV1 {
  const byKind = new Map(context.evidenceRefs.map((reference) => [reference.kind, reference]));
  const references = kinds.map((kind) => byKind.get(kind));

  if (references.some((reference) => reference === undefined)) {
    return rejected(
      "malformed_trusted_registry",
      "Trusted evidence references are incomplete for this action.",
    );
  }

  return references as EvidenceRefV1[];
}

function requesterCustomer(
  context: CompilerContextV1,
): CompilerContextV1["customers"][number] | NeedsClarificationResultV1 {
  const matches = context.customers.filter(
    (customer) => customer.customerId === context.requester.customerId,
  );

  if (matches.length === 0) {
    return clarification(
      "requester_unresolved",
      "The trusted requester is not present in the customer registry.",
    );
  }

  if (matches.length > 1) {
    return clarification(
      "requester_unresolved",
      "The trusted requester matches more than one customer record.",
    );
  }

  return matches[0];
}

function verifiedRequesterRecipient(
  context: CompilerContextV1,
): string | NeedsClarificationResultV1 {
  const matches = context.recipients.filter(
    (recipient) => recipient.customerId === context.requester.customerId && recipient.verified,
  );

  if (matches.length === 0) {
    return clarification(
      "recipient_unresolved",
      "No verified requester recipient is available in the trusted contact registry.",
    );
  }

  if (matches.length > 1) {
    return clarification(
      "recipient_unresolved",
      "More than one verified requester recipient is available.",
    );
  }

  return matches[0].address;
}

function oneResource(
  context: CompilerContextV1,
  resourceType: ResourceRecordV1["resourceType"],
  bookingId?: string,
): ResourceRecordV1 | NeedsClarificationResultV1 {
  const matches = context.resources.filter(
    (resource) =>
      resource.resourceType === resourceType &&
      (bookingId === undefined || resource.bookingId === bookingId),
  );

  if (matches.length === 0) {
    return clarification(
      "resource_not_found",
      `No trusted ${resourceType} resource matched the resolved action.`,
    );
  }

  if (matches.length > 1) {
    return clarification(
      "resource_not_unique",
      `More than one trusted ${resourceType} resource matched the resolved action.`,
    );
  }

  return matches[0];
}

function activeAppointmentsFor(context: CompilerContextV1): AppointmentRecordV1[] {
  return context.appointments.filter(
    (appointment) =>
      appointment.customerId === context.requester.customerId && appointment.status !== "cancelled",
  );
}

function appointmentForDetails(
  proposal: AgentProposalV1,
  context: CompilerContextV1,
): AppointmentRecordV1 | NeedsClarificationResultV1 {
  if (proposal.subjectReference?.trim().toLowerCase() !== "my appointment") {
    return clarification(
      "subject_not_found",
      "The appointment reference is not the supported deterministic phrase 'my appointment'.",
    );
  }

  const matches = activeAppointmentsFor(context);
  if (matches.length === 0) {
    return clarification(
      "subject_not_found",
      "No active appointment matches the trusted requester.",
    );
  }

  if (matches.length > 1) {
    return clarification(
      "subject_not_unique",
      "More than one active appointment matches the trusted requester.",
    );
  }

  return matches[0];
}

function appointmentForReschedule(
  proposal: AgentProposalV1,
  context: CompilerContextV1,
): AppointmentRecordV1 | NeedsClarificationResultV1 {
  if (proposal.subjectReference?.trim().toLowerCase() !== "my confirmed friday appointment") {
    return clarification(
      "subject_not_found",
      "The reschedule subject is not the supported deterministic Friday appointment phrase.",
    );
  }

  const matches = activeAppointmentsFor(context).filter((appointment) => {
    const parts = londonParts(appointment.start);
    return appointment.status === "confirmed" && parts?.weekday === "friday";
  });

  if (matches.length === 0) {
    return clarification(
      "subject_not_found",
      "No unique confirmed Friday appointment matches the trusted requester.",
    );
  }

  if (matches.length > 1) {
    return clarification(
      "subject_not_unique",
      "More than one confirmed Friday appointment matches the trusted requester.",
    );
  }

  return matches[0];
}

function canonicalExternalRecipient(
  proposal: AgentProposalV1,
): string | NeedsClarificationResultV1 {
  const candidate = proposal.recipientReference?.trim();
  if (!candidate || !emailSchema.safeParse(candidate).success) {
    return clarification(
      "recipient_unresolved",
      "The explicit external recipient is missing or has invalid email syntax.",
    );
  }

  return candidate;
}

function buildIntent(core: ActionIntentCoreV1): CompiledResultV1 | RejectedResultV1 {
  try {
    const canonicalDigest = actionIntentDigest(core);
    const idempotencyKey = actionIntentIdempotencyKey(core.sourceRequestId, canonicalDigest);
    const actionIntent = ActionIntentV1Schema.parse({
      ...core,
      canonicalDigest,
      idempotencyKey,
    });

    return { status: "COMPILED", actionIntent };
  } catch {
    return rejected(
      "malformed_trusted_registry",
      "The resolved action material did not satisfy the canonical ActionIntentV1 contract.",
    );
  }
}

function proposalRequestKind(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("requestKind" in value)) {
    return undefined;
  }

  const requestKind = (value as { requestKind?: unknown }).requestKind;
  return typeof requestKind === "string" ? requestKind : undefined;
}

function compileAppointmentDetails(
  proposal: AgentProposalV1,
  context: CompilerContextV1,
): CompileResultV1 {
  const requester = requesterCustomer(context);
  if (isClarification(requester)) {
    return requester;
  }

  const appointment = appointmentForDetails(proposal, context);
  if (isClarification(appointment)) {
    return appointment;
  }

  const recipient = verifiedRequesterRecipient(context);
  if (isClarification(recipient)) {
    return recipient;
  }

  const resource = oneResource(context, "appointment_details", appointment.bookingId);
  if (isClarification(resource)) {
    return resource;
  }

  const evidence = evidenceFor(context, [
    "requester_record",
    "appointment_snapshot",
    "resource_registry",
  ]);
  if (isRejected(evidence)) {
    return evidence;
  }

  const contextTimestamp = normalizeInstant(context.receivedAt);
  if (!contextTimestamp) {
    return rejected("malformed_trusted_registry", "Trusted receivedAt could not be normalized.");
  }

  return buildIntent({
    schemaVersion: "action-intent-v1",
    canonicalizationVersion: "moirae-protocol-canonicalization-v1",
    sourceRequestId: context.sourceRequestId,
    principal: { agentPrincipalId: context.agentPrincipalId },
    requester: {
      customerId: requester.customerId,
      verifiedEmail: recipient,
    },
    action: "SEND_APPOINTMENT_DETAILS",
    resource: {
      resourceId: resource.resourceId,
      resourceType: "appointment_details",
    },
    target: {
      kind: "email",
      address: recipient,
      classification: "verified_requester",
    },
    effectClass: "DISCLOSE",
    parameters: {
      bookingId: appointment.bookingId,
      recipientAddress: recipient,
      templateId: "appointment-details-v1",
    },
    evidenceRefs: evidence,
    contextTimestamp,
  });
}

function compileReschedule(proposal: AgentProposalV1, context: CompilerContextV1): CompileResultV1 {
  const requester = requesterCustomer(context);
  if (isClarification(requester)) {
    return requester;
  }

  const appointment = appointmentForReschedule(proposal, context);
  if (isClarification(appointment)) {
    return appointment;
  }

  if (proposal.temporalExpression?.trim().toLowerCase() !== "monday afternoon") {
    return clarification(
      "temporal_expression_ambiguous",
      "Only the deterministic temporal expression 'Monday afternoon' is supported in this MVP.",
    );
  }

  const appointmentParts = londonParts(appointment.start);
  if (!appointmentParts) {
    return rejected(
      "malformed_trusted_registry",
      "The matched appointment timestamp could not be interpreted in Europe/London.",
    );
  }

  const targetMonday = nextMondayAfter(appointmentParts);
  const matchingSlots = context.availabilitySlots.filter((slot) => {
    const parts = londonParts(slot.start);
    return (
      parts !== undefined && dateKey(parts) === targetMonday && parts.hour >= 12 && parts.hour < 17
    );
  });

  if (matchingSlots.length === 0) {
    return clarification(
      "no_available_slot",
      "No trusted available slot falls on the resolved Monday afternoon.",
    );
  }

  if (matchingSlots.length > 1) {
    return clarification(
      "multiple_available_slots",
      "More than one trusted available slot falls on the resolved Monday afternoon.",
    );
  }

  const resource = oneResource(context, "appointment_booking", appointment.bookingId);
  if (isClarification(resource)) {
    return resource;
  }

  const requesterAddress = verifiedRequesterRecipient(context);
  if (isClarification(requesterAddress)) {
    return requesterAddress;
  }

  const evidence = evidenceFor(context, [
    "requester_record",
    "appointment_snapshot",
    "availability_snapshot",
    "resource_registry",
  ]);
  if (isRejected(evidence)) {
    return evidence;
  }

  const currentStart = normalizeInstant(appointment.start);
  const proposedStart = normalizeInstant(matchingSlots[0].start);
  const contextTimestamp = normalizeInstant(context.receivedAt);
  if (!currentStart || !proposedStart || !contextTimestamp) {
    return rejected(
      "malformed_trusted_registry",
      "A trusted appointment, slot, or receivedAt timestamp could not be normalized.",
    );
  }

  return buildIntent({
    schemaVersion: "action-intent-v1",
    canonicalizationVersion: "moirae-protocol-canonicalization-v1",
    sourceRequestId: context.sourceRequestId,
    principal: { agentPrincipalId: context.agentPrincipalId },
    requester: {
      customerId: requester.customerId,
      verifiedEmail: requesterAddress,
    },
    action: "RESCHEDULE_APPOINTMENT",
    resource: {
      resourceId: resource.resourceId,
      resourceType: "appointment_booking",
    },
    target: { kind: "customer", customerId: requester.customerId },
    effectClass: "MODIFY",
    parameters: {
      bookingId: appointment.bookingId,
      currentStart,
      proposedStart,
      timeZone: "Europe/London",
    },
    evidenceRefs: evidence,
    contextTimestamp,
  });
}

function compileContactDirectory(
  proposal: AgentProposalV1,
  context: CompilerContextV1,
): CompileResultV1 {
  const requester = requesterCustomer(context);
  if (isClarification(requester)) {
    return requester;
  }

  const recipient = canonicalExternalRecipient(proposal);
  if (isClarification(recipient)) {
    return recipient;
  }

  const resource = oneResource(context, "customer_contact_directory");
  if (isClarification(resource)) {
    return resource;
  }

  const requesterAddress = verifiedRequesterRecipient(context);
  if (isClarification(requesterAddress)) {
    return requesterAddress;
  }

  const evidence = evidenceFor(context, ["requester_record", "resource_registry"]);
  if (isRejected(evidence)) {
    return evidence;
  }

  const contextTimestamp = normalizeInstant(context.receivedAt);
  if (!contextTimestamp) {
    return rejected("malformed_trusted_registry", "Trusted receivedAt could not be normalized.");
  }

  return buildIntent({
    schemaVersion: "action-intent-v1",
    canonicalizationVersion: "moirae-protocol-canonicalization-v1",
    sourceRequestId: context.sourceRequestId,
    principal: { agentPrincipalId: context.agentPrincipalId },
    requester: {
      customerId: requester.customerId,
      verifiedEmail: requesterAddress,
    },
    action: "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
    resource: {
      resourceId: resource.resourceId,
      resourceType: "customer_contact_directory",
    },
    target: {
      kind: "email",
      address: recipient,
      classification: "external_explicit",
    },
    effectClass: "EXPORT",
    parameters: {
      directoryResourceId: resource.resourceId,
      recipientAddress: recipient,
      exportFormat: "csv",
    },
    evidenceRefs: evidence,
    contextTimestamp,
  });
}

/**
 * Pure deterministic boundary from an untrusted AgentProposalV1 shape to a
 * canonical, unauthorised ActionIntentV1 or an explicit non-compiled result.
 */
export function compileAgentProposal(input: CompileAgentProposalInputV1): CompileResultV1 {
  const rawInput =
    typeof input === "object" && input !== null
      ? (input as RawCompileInput)
      : ({} as RawCompileInput);
  const contextResult = CompilerContextV1Schema.safeParse(rawInput.context);
  if (!contextResult.success) {
    return rejected(
      "malformed_trusted_registry",
      "Trusted compiler context is not a valid CompilerContextV1.",
    );
  }

  const context = contextResult.data;
  const contextError = validateTrustedContext(context);
  if (contextError) {
    return rejected("malformed_trusted_registry", contextError);
  }

  const requestKind = proposalRequestKind(rawInput.proposal);
  if (
    requestKind &&
    ![
      "appointment_details",
      "appointment_reschedule",
      "bulk_contact_transmission",
      "unknown_administrative_request",
    ].includes(requestKind)
  ) {
    return rejected(
      "unsupported_request_kind",
      "The proposal request kind is not supported by MP-02.",
    );
  }

  const proposalResult = AgentProposalInputSchema.safeParse(rawInput.proposal);
  if (!proposalResult.success) {
    return rejected(
      "invalid_proposal",
      "The untrusted proposal is incompatible with the MP-01 proposal contract.",
    );
  }

  const proposal = proposalResult.data;
  switch (proposal.requestKind) {
    case "appointment_details":
      return compileAppointmentDetails(proposal, context);
    case "appointment_reschedule":
      return compileReschedule(proposal, context);
    case "bulk_contact_transmission":
      return compileContactDirectory(proposal, context);
    case "unknown_administrative_request":
      return clarification(
        "unsupported_semantic_action",
        "The semantic request category is not compilable into a supported action.",
      );
  }
}

export {
  CompilerContextV1Schema,
  type AppointmentRecordV1,
  type AvailabilitySlotV1,
  type CompilerContextV1,
  type CustomerRecordV1,
  type EvidenceRefV1,
  type RecipientRecordV1,
  type ResourceRecordV1,
} from "./context.js";
export {
  ActionIntentV1Schema,
  actionKinds,
  effectClasses,
  type ActionIntentCoreV1,
  type ActionIntentV1,
} from "../../action-contracts/src/index.js";
export {
  actionIntentDigest,
  actionIntentIdempotencyKey,
  canonicalActionIntentCore,
  canonicalUtf8,
  canonicalizeJsonV1,
  actionIntentCoreFromIntent,
} from "./canonical.js";

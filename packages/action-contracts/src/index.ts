import { z } from "zod";

/**
 * Moirae Protocol's internal action vocabulary for MP-02.
 * These are factual operation/effect classifications, not governance outcomes.
 */
export const actionKinds = [
  "SEND_APPOINTMENT_DETAILS",
  "RESCHEDULE_APPOINTMENT",
  "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
] as const;

export const effectClasses = ["DISCLOSE", "MODIFY", "EXPORT"] as const;

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const isoUtcSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const evidenceRefSchema = z
  .object({
    kind: z.enum([
      "requester_record",
      "appointment_snapshot",
      "availability_snapshot",
      "resource_registry",
    ]),
    ref: z.string().trim().min(1).max(200),
  })
  .strict();

const commonIntentShape = {
  schemaVersion: z.literal("action-intent-v1"),
  canonicalizationVersion: z.literal("moirae-protocol-canonicalization-v1"),
  sourceRequestId: z.string().trim().min(1).max(200),
  principal: z
    .object({
      agentPrincipalId: z.string().trim().min(1).max(200),
    })
    .strict(),
  requester: z
    .object({
      customerId: z.string().trim().min(1).max(200),
      verifiedEmail: z.string().email(),
    })
    .strict(),
  evidenceRefs: z.array(evidenceRefSchema).min(1).max(10),
  contextTimestamp: isoUtcSchema,
  canonicalDigest: digestSchema,
  idempotencyKey: digestSchema,
} as const;

const sendAppointmentDetailsSchema = z
  .object({
    ...commonIntentShape,
    action: z.literal("SEND_APPOINTMENT_DETAILS"),
    resource: z
      .object({
        resourceId: z.string().trim().min(1).max(200),
        resourceType: z.literal("appointment_details"),
      })
      .strict(),
    target: z
      .object({
        kind: z.literal("email"),
        address: z.string().email(),
        classification: z.literal("verified_requester"),
      })
      .strict(),
    effectClass: z.literal("DISCLOSE"),
    parameters: z
      .object({
        bookingId: z.string().trim().min(1).max(200),
        recipientAddress: z.string().email(),
        templateId: z.literal("appointment-details-v1"),
      })
      .strict(),
  })
  .strict();

const rescheduleAppointmentSchema = z
  .object({
    ...commonIntentShape,
    action: z.literal("RESCHEDULE_APPOINTMENT"),
    resource: z
      .object({
        resourceId: z.string().trim().min(1).max(200),
        resourceType: z.literal("appointment_booking"),
      })
      .strict(),
    target: z
      .object({
        kind: z.literal("customer"),
        customerId: z.string().trim().min(1).max(200),
      })
      .strict(),
    effectClass: z.literal("MODIFY"),
    parameters: z
      .object({
        bookingId: z.string().trim().min(1).max(200),
        currentStart: isoUtcSchema,
        proposedStart: isoUtcSchema,
        timeZone: z.literal("Europe/London"),
      })
      .strict(),
  })
  .strict();

const transmitContactDirectorySchema = z
  .object({
    ...commonIntentShape,
    action: z.literal("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"),
    resource: z
      .object({
        resourceId: z.string().trim().min(1).max(200),
        resourceType: z.literal("customer_contact_directory"),
      })
      .strict(),
    target: z
      .object({
        kind: z.literal("email"),
        address: z.string().email(),
        classification: z.literal("external_explicit"),
      })
      .strict(),
    effectClass: z.literal("EXPORT"),
    parameters: z
      .object({
        directoryResourceId: z.string().trim().min(1).max(200),
        recipientAddress: z.string().email(),
        exportFormat: z.literal("csv"),
      })
      .strict(),
  })
  .strict();

/**
 * Canonical, deterministic Moirae Protocol action material.
 *
 * This is not an authority result and is not an Adrasteia/Fates-native schema.
 */
export const ActionIntentV1Schema = z.discriminatedUnion("action", [
  sendAppointmentDetailsSchema,
  rescheduleAppointmentSchema,
  transmitContactDirectorySchema,
]);

export type ActionIntentV1 = z.infer<typeof ActionIntentV1Schema>;
export type ActionIntentCoreV1 = Omit<ActionIntentV1, "canonicalDigest" | "idempotencyKey">;

export { digestSchema as ActionDigestSchema };

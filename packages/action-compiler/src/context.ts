import { z } from "zod";

const isoDateTimeWithOffsetSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/);

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

const customerRecordSchema = z
  .object({
    customerId: z.string().trim().min(1).max(200),
  })
  .strict();

const recipientRecordSchema = z
  .object({
    customerId: z.string().trim().min(1).max(200),
    address: z.string().email(),
    verified: z.boolean(),
  })
  .strict();

const appointmentRecordSchema = z
  .object({
    bookingId: z.string().trim().min(1).max(200),
    customerId: z.string().trim().min(1).max(200),
    status: z.enum(["confirmed", "scheduled", "cancelled"]),
    start: isoDateTimeWithOffsetSchema,
    timeZone: z.literal("Europe/London"),
  })
  .strict();

const availabilitySlotSchema = z
  .object({
    slotId: z.string().trim().min(1).max(200),
    start: isoDateTimeWithOffsetSchema,
    end: isoDateTimeWithOffsetSchema,
    status: z.literal("available"),
    timeZone: z.literal("Europe/London"),
  })
  .strict();

const resourceRecordSchema = z
  .object({
    resourceId: z.string().trim().min(1).max(200),
    resourceType: z.enum([
      "appointment_details",
      "appointment_booking",
      "customer_contact_directory",
    ]),
    bookingId: z.string().trim().min(1).max(200).nullable(),
    customerId: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();

/**
 * Trusted host inputs for MP-02. Every identity, registry record, timestamp,
 * locale, and timezone is supplied explicitly by the host.
 */
export const CompilerContextV1Schema = z
  .object({
    compilerContextVersion: z.literal("compiler-context-v1"),
    sourceRequestId: z.string().trim().min(1).max(200),
    agentPrincipalId: z.string().trim().min(1).max(200),
    requester: z
      .object({
        customerId: z.string().trim().min(1).max(200),
      })
      .strict(),
    receivedAt: isoDateTimeWithOffsetSchema,
    locale: z.literal("en-GB"),
    timeZone: z.literal("Europe/London"),
    customers: z.array(customerRecordSchema).max(100),
    recipients: z.array(recipientRecordSchema).max(100),
    appointments: z.array(appointmentRecordSchema).max(100),
    availabilitySlots: z.array(availabilitySlotSchema).max(100),
    resources: z.array(resourceRecordSchema).max(100),
    evidenceRefs: z.array(evidenceRefSchema).max(20),
  })
  .strict();

export type CompilerContextV1 = z.infer<typeof CompilerContextV1Schema>;
export type CustomerRecordV1 = z.infer<typeof customerRecordSchema>;
export type RecipientRecordV1 = z.infer<typeof recipientRecordSchema>;
export type AppointmentRecordV1 = z.infer<typeof appointmentRecordSchema>;
export type AvailabilitySlotV1 = z.infer<typeof availabilitySlotSchema>;
export type ResourceRecordV1 = z.infer<typeof resourceRecordSchema>;
export type EvidenceRefV1 = z.infer<typeof evidenceRefSchema>;

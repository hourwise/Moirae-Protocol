import { z } from "zod";

/**
 * Semantic categories understood by MP-01. These are observations about a
 * request, not governance decisions.
 */
export const administrativeRequestKinds = [
  "appointment_details",
  "appointment_reschedule",
  "bulk_contact_transmission",
  "unknown_administrative_request",
] as const;

/**
 * The only structured value allowed across the MP-01 Strands boundary.
 *
 * This is deliberately a semantic claim. It contains no resolved identity,
 * authority, approval, credential, or execution field and is never an
 * ActionIntent.
 */
export const AgentProposalV1Schema = z
  .object({
    schemaVersion: z.literal("agent-proposal-v1"),
    requestKind: z.enum(administrativeRequestKinds),
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
  .strict()
  .describe(
    "Untrusted semantic proposal for later deterministic processing. Not an ActionIntent and not an authorization or execution request.",
  );

export type AgentProposalV1 = z.infer<typeof AgentProposalV1Schema>;

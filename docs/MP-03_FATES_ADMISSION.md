# MP-03 Fates admission adapter

Status: bounded implementation on branch `codex/mp03-fates-admission-adapter`.

MP-03 asks only what the accepted Fates governance system says about an already compiled MP-02
action. It does not execute the action. The adapter accepts a validated `ActionIntentV1`, an
independently authenticated Fates execution context, explicit trusted time, and an optional native
approval ID. It maps the intent through a closed fixture profile and calls the injected native
`Gateway.admit(...)` port. The returned result is validated and then stops.

## Accepted dependencies

The adapter is pinned by [the MP-03 dependency lock](evidence/mp-03-fates-dependency-lock.json):

| Dependency                    | Exact provenance                                                                                                                                                                                                                                        | License |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Ananke                        | tag `ananke-fates-006b-mp03-admission-v0.1.0-protocol-1.4.0`, annotated tag object `6425d4b34fba62ab60381a4a2237786d0d6173ad`, peeled commit `6bf8902c55c4f3f7593a987582b50783c8a7b5a0`; FATES-006A ancestor `fc318663cbed3072128355fb3697e7f2b47f5f11` | MIT     |
| Runtime Contracts / Adrasteia | commit `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`                                                                                                                                                                                                       | MIT     |

The dependency is consumed through `FatesAdmissionGateway`, a structural port whose implementation
is the accepted Ananke `Gateway`. No Ananke authority or hashing implementation is copied into
Moirae Protocol. Horae, Mnemosyne, Fates Integration, and Moirae Code are not dependencies.

## Public API and trust boundary

```ts
const adapter = createMp03AdmissionAdapter(nativeGateway, MP03_DEPENDENCY_PROVENANCE);
const result = await adapter.admitActionIntent({
  intent: actionIntent,
  authenticatedContext: hostAuthenticatedContext,
  now: "2026-09-03T12:00:00.000Z",
  approvalId,
});
```

The adapter does not accept original request prose, `AgentProposalV1`, a caller action hash, a
caller policy decision, or a caller authority result. `ActionIntentV1Schema` is applied first, then
MP-02's canonical core digest and source-scoped idempotency key are recomputed and compared with the
stored fields. A mismatch is a boundary failure, not a Fates `DENY`.

The host-authenticated context is strict and independently supplied. It contains:

- service workload `moirae-administrative-workload-v1`;
- acting agent `moirae-administrative-agent-v1`;
- represented human requester `moirae-requester-CUSTOMER-001`;
- tenant `moirae-mp02-fixture-tenant`;
- runtime `ananke`, instance `fates-006b-test-runtime`, and session `fates-006b-execution-session`;
- exact bounded resource scope;
- request/correlation/causation identifiers;
- registered purpose and policy version `builtin:0.1.0`.

The MP-02 compiler principal is bound to the authenticated acting agent; it is not treated as
authentication. The source request ID must match the independently supplied correlation request ID.
Workload, acting principal, requester, tenant, runtime/session, scope, purpose, and policy version
mismatches fail closed before Ananke is called.

## Exact fixture-bound mappings

FATES-006B is an accepted fixture-bound profile, not a generalized production administrative API.
These fixed IDs and values are intentionally part of version 1.0.0. A different booking, recipient,
timestamp, resource, source request, principal, or target is rejected; MP-03 never creates a new
registration, chooses a closest operation, infers a recipient, or selects a latest version.

| MP-02 action                          | Fates server            | Fates tool                                                  | Version | Exact native arguments                                                                                                                         | Scope                                                                                                                   | Purpose                              | Risk / permission                                     |
| ------------------------------------- | ----------------------- | ----------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `SEND_APPOINTMENT_DETAILS`            | `moirae.administrative` | `moirae.administrative.send_appointment_details`            | `1.0.0` | `{ bookingId: "BOOKING-001", recipientAddress: "alex@example.test", templateId: "appointment-details-v1" }`                                    | bounded `appointment_details`, resource `RESOURCE-APPOINTMENT-DETAILS-001`, operation `disclose`, namespace `moirae`    | `appointment.details.disclosure`     | `EXTERNAL_SEND`; `appointment.details.disclose`       |
| `RESCHEDULE_APPOINTMENT`              | `moirae.administrative` | `moirae.administrative.reschedule_appointment`              | `1.0.0` | `{ bookingId: "BOOKING-001", currentStart: "2026-09-04T13:00:00.000Z", proposedStart: "2026-09-07T14:00:00.000Z", timeZone: "Europe/London" }` | bounded `appointment_booking`, resource `RESOURCE-APPOINTMENT-BOOKING-001`, operation `reschedule`, namespace `moirae`  | `appointment.reschedule`             | `INTERNAL_WRITE`; `appointment.reschedule`            |
| `TRANSMIT_CUSTOMER_CONTACT_DIRECTORY` | `moirae.administrative` | `moirae.administrative.transmit_customer_contact_directory` | `1.0.0` | `{ directoryResourceId: "RESOURCE-CONTACT-DIRECTORY-001", recipientAddress: "personal-address@example.test", exportFormat: "csv" }`            | bounded `customer_contact_directory`, resource `RESOURCE-CONTACT-DIRECTORY-001`, operation `export`, namespace `moirae` | `customer-directory.external-export` | `NETWORK_EGRESS`; `customer.contact-directory.export` |

All three registrations use closed schemas, `requiresApproval: true`, `retryable: false`, and
side-effect metadata matching their eventual external meaning: `EXTERNAL_DISCLOSURE`,
`BOOKING_MUTATION`, and `BULK_EXTERNAL_EXPORT`. The Moirae `DISCLOSE`, `MODIFY`, and `EXPORT`
effect classes are factual compiler classifications; they do not decide Fates risk or policy.

## Hash and integrity separation

Ananke's native `nativeAdmissionActionHash`/`hashAuthorizedEffect` path is authoritative. The
accepted fixture hashes are:

| Action                                | Ananke/Fates native action hash                                    |
| ------------------------------------- | ------------------------------------------------------------------ |
| `SEND_APPOINTMENT_DETAILS`            | `8242ac8739064472391409bca7792a6804227a6ef56f9ffa8c8ffdc05b28899e` |
| `RESCHEDULE_APPOINTMENT`              | `fcc5ae5a5bc6f8b2b8756f2cb283ae008769c6bf2e4af3a060f144f3dc978eaa` |
| `TRANSMIT_CUSTOMER_CONTACT_DIRECTORY` | `af6fcf84b5cc498138649111cc1810c2e32145ac9d1cd99136ac045e9e24af84` |

The native hash covers Ananke server/tool/version, exact arguments, authenticated and acting
principals, represented principal, runtime/session and tenant context, resource scope, purpose,
policy version, and bound correlation identity. The accepted Ananke implementation performs the
canonicalization and hash construction. MP-03 calls it; it does not implement a parallel hash.

MP-02 `canonicalDigest` is the SHA-256 digest of deterministic `ActionIntentCoreV1` material, and
`idempotencyKey` is a separate source-scoped Moirae derivation. They are preserved in evidence but
are never substituted for the Ananke action hash, approval hash, or authority result. Natural-language
summary/prose is not governed material.

## Results, approvals, freshness, and audit

The adapter exposes four bounded states:

- `ADMITTED` means Ananke returned native `ALLOW`; it is admission-only and has no effect claim.
- `WAITING_FOR_APPROVAL` means Ananke returned native `REQUIRE_APPROVAL`; the returned approval ID
  is bound to the exact native operation, arguments, context, correlation, and expiry.
- `REJECTED` preserves native `DENY`, `REQUIRE_REFRESH`, `REQUIRE_NARROWER_SCOPE`, or
  `REQUIRE_HUMAN_CLARIFICATION` decisions.
- `BOUNDARY_FAILURE` means MP-03 could not safely validate/map the intent, context, dependency,
  native hash, or native result. It is not a policy denial.

An explicit `now` is validated and normalized before being passed to Ananke. An optional approval
ID is only forwarded to Ananke. MP-03 creates no approvals, never marks a one-use approval used,
and never calls `Gateway.execute(...)`. A repeated approved admission remains non-consuming. Native
`ADMISSION_EVALUATED` evidence is carried through; no `TOOL_EXECUTED` or `EXECUTION_COMPLETED`
claim is created by this slice. Adapter evidence records operation, hashes, decision, approval
status, scope reference, purpose, timestamps, dependency provenance, and both false execution flags
without including credentials or unnecessary PII.

## Validation and isolation

The offline test suite exercises real Strands SDK machinery with a synthetic model, the MP-02
compiler, the exact accepted Ananke `Gateway.admit(...)`, all three operations, baseline approval
requests, a synthetic approved admission, invalid approvals, strict mapping/context failures,
ordering determinism, native hash reproduction, and executor invocation count zero. The accepted
Ananke worktree is used only as a read-only dependency plus ignored build artifacts for this local
validation.

MP-01 and MP-02 remain semantically unchanged. Firecracker/FATES-005A remains on its frozen
Integration reference; no Firecracker command or attempt was run. Moirae Console source, pins,
deployment, and contest evidence remain untouched. MP-03 adds no Horae dispatch/claim/ledger and no
Mnemosyne memory/provenance retrieval. Those are future slices. MP-04 must separately solve governed
effect execution, one-time dispatch, receipts, replay, and crash recovery; this adapter is not an
execution substitute.

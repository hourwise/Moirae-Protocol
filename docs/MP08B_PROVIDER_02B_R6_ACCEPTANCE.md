# MP-08B Provider-02B-R6 independent acceptance

Status: independently accepted locally. No live Attempt-002, real approval, AWS call, SES call, provider invocation, `SEND_STARTED`, external effect, deployment, push, or merge occurred.

## Accepted identities

Candidate implementation:

- commit: `7a1add07bbcf9242098445a021683780143139e2`
- tree: `41fdca5f266c362244f92884400aa15d0560becb`
- parent: `5a8aa18a526b2b1e8d543279a9015a721d52ea5c`
- subject: `feat(protocol): support fresh Provider-02B attempt identity`

Accepted base:

- tag: `mp-08b-provider-02b-r4c-legacy-hydration-accepted-v1`
- tag object: `8bf34b9fad798987e175295394a51048f4478073`
- peeled commit: `5a8aa18a526b2b1e8d543279a9015a721d52ea5c`
- peeled tree: `de632359b939463d8d8e39df8f47b114eccaa0a8`

Rejected R5A and blocked R5B are not dependencies of the candidate or this acceptance.

## Diff certification

`R6_DIFF_CERTIFIED`

The candidate changes exactly five files. Production changes are limited to `apps/host/src/provider-02b-runner.ts` and `packages/fates-adapter/src/index.ts`; the remaining files are one focused test and bounded R6 documentation/evidence.

The runner change is required because accepted R4C fixed the ledger, correlation, and provider-request identity to Attempt-001. R6 recognizes exactly Attempt-001 and Attempt-002, binds the identity at trusted construction, and adds create-only/resume-existing lifecycle rules. The adapter change is required because accepted MP-03 fixed mapping compatibility to the historical source request ID. R6 allows the trusted host to bind one exact appointment-details source request identity while preserving the historical default.

There are no changes to Ananke/Fates source, Horae, MP-04 execution semantics, the SES adapter, retry behavior, MP-06 queue semantics, MP-07, frontend, deployment, package manifests, lockfile, or dependencies.

## Lifecycle and trusted selection

`CREATE_FRESH` is valid only with recognized Attempt-002. It acquires the durable exclusive lock, refuses an existing path with `FRESH_ATTEMPT_CREATE_ONLY`, and atomically creates current-schema state. It never opens an existing record for replacement or truncation. Attempt-001 cannot be paired with `CREATE_FRESH`.

`RESUME_EXISTING` is valid only with Attempt-002, requires the file to exist, and validates the embedded attempt identity exactly. It does not create missing state and rejects an Attempt-001 ledger at an Attempt-002 boundary.

The only non-test runner caller remains the historical R3 preparation script and uses the legacy default. No browser, HTTP/request body, AgentProposal, ActionIntent, model output, provider response, IAM metadata, or SES metadata is connected to `attemptIdentity`. Attempt-002 selection exists only in trusted runner construction.

`TRUSTED_ATTEMPT_SELECTION_ONLY`

## Trusted source request configuration

`Mp03TrustedAdministrativeProfileConfig.appointmentDetailsSourceRequestId` is parsed from trusted adapter construction. Absence preserves `REQUEST-MP02-DETAILS-001`. For configured appointment-details actions, MP-03 requires exact equality between the ActionIntent source request and this trusted value before invoking Fates.

The focused real-Fates test proves:

- a fresh ActionIntent source identity without the trusted binding is rejected;
- the same identity with exact trusted host configuration maps successfully;
- a differing ActionIntent/configuration pair fails closed by the same equality predicate.

The field changes only deterministic MP-03 mapping compatibility. It neither modifies the Fates profile nor creates an admission result. The verified external Fates Gateway still returns the authoritative `REQUIRE_APPROVAL` decision.

`TRUSTED_SOURCE_REQUEST_CONFIGURATION_ONLY`

`MODEL_CANNOT_SELECT_SOURCE_REQUEST_IDENTITY`

`BROWSER_CANNOT_SELECT_SOURCE_REQUEST_IDENTITY`

`ACTION_CANNOT_SELECT_SOURCE_REQUEST_IDENTITY`

`SOURCE_REQUEST_CONFIG_NOT_FATES_AUTHORITY`

## Fresh identity and cross-binding proof

The fresh source request changes the ActionIntent canonical digest and idempotency key. MP-06 derives logical work from source request plus action digest. Delivery identity additionally binds the new approval and decision. Claim identity binds the new logical work and delivery. Provider correlation includes Attempt-002, logical work, claim, and generation.

Attempt-001 approval input is rejected by the runner before decision submission. Attempt-001 source request cannot pass the configured MP-03 source boundary. Reused approval/decision references conflict with the queue's durable approval binding; old logical-work/idempotency identities cannot equal the deterministic fresh identities; old delivery/claim identities fail durable queue/work/claim equality checks before MP-04.

No current authority is inherited. The business operation and trusted synthetic recipient may remain the same, but the source, attempt, action digest, idempotency, approval, decision, logical work, delivery, claim, and correlation identities are distinct.

`FRESH_ACTION_NOT_ATTEMPT_001_RETRY`

`OLD_ATTEMPT_AUTHORITY_CANNOT_CROSS_BIND`

## Current-schema birth and central flow

Attempt-002 is born directly as `mp08b-provider-02b-r3-v1` with the complete current prepared binding: ActionIntent digest, idempotency key, request fingerprint, action-binding digest, native action hash, operation, recipient, context digest, and presentation-input digest. It does not use R3 legacy hydration, R4C migration, expired-approval rebind, R5 recovery, rearm, reset, or history retrofit.

The independently rerun central path used the immutable accepted FATES-006C materialization and a synthetic `.test` recipient:

1. fresh trusted source request and ActionIntent;
2. exact MP-03 mapping;
3. real Fates `REQUIRE_APPROVAL` / `WAITING_FOR_APPROVAL`;
4. fresh synthetic durable approval and decision;
5. fresh MP-06 logical work, delivery, and claim;
6. `READY_FOR_MP04`;
7. stop before provider execution.

Provider invocation count remained zero, `SEND_STARTED` remained absent, transport calls remained zero, and no external effect occurred.

`FRESH_ATTEMPT_PRE_SEND_REAL_AUTHORITY_FLOW_ACCEPTED`

## Duplicate, restart, and exactly-once review

One Attempt-002 create succeeds; a second create fails. Two concurrent creators yield exactly one success. Attempt-001 with `CREATE_FRESH` fails. Missing Attempt-002 with `RESUME_EXISTING` fails. Embedded identity mismatch fails. Repeated queue admission remains idempotent and conflicting approval references fail closed.

In a temporary synthetic-only fixture, `SEND_STARTED` survived restart through `RESUME_EXISTING`; a second send start and same-identity fresh recreation were refused. Transport was never invoked. Existing claim uniqueness, crash/restart, idempotency, R4A binding, and no-resend regressions remain green.

`FRESH_ATTEMPT_CREATE_ONLY`

`EXISTING_ATTEMPT_NEVER_OVERWRITTEN`

`EXACTLY_ONCE_SEMANTICS_PRESERVED`

## Attempt-001 seal

The protected real Attempt-001 was inspected read-only before and after validation. It remains `APPROVED` with `BOUNDARY_BLOCKED` history, provider invocation count zero, no `SEND_STARTED`, no provider operation, and no reconciliation.

The final SHA-256 values exactly match the initial review inventory:

- attempt ledger: `9f95a23b42ef26a364a9b5aeb5016bebd5c6c4c8053321207cccff186376fc14`
- queue: `bcfa7f922e62cfff638bfeeebcc280b1dc8385f4c5591d36f025ef2cb37fa2d4`
- activity history: `c6b319fb7b679f225422fa83b448e1cd71fe4ce4ccd21307d155057b06492ee9`
- approval store: `879eb69091b7ea69248c237729651f8b866d5b6b029259e453843e52415fa5e8`

`ATTEMPT_001_PERMANENTLY_PRESERVED`

`NO_HISTORY_RETROFIT`

## Approval TTL and validation

The accepted runtime still configures a five-minute approval lifetime. R6 does not modify that line or policy. All expensive future live preflight must occur before creating the live approval; no broad tests should run during its validity window.

Acceptance validation results:

- focused R6: 7 passed, 0 failed, 0 skipped;
- bounded accepted-dependency set: 129 passed, 3 intentional skips, 0 failed;
- canonical: 29 files passed, 456 tests passed, 22 guarded skips, 0 failed;
- typecheck, ESLint, Prettier, build, and `git diff --check`: passed.

The implementation evidence reported 128 bounded passes because its concurrent-create test was added after that earlier subtotal. The independent rerun includes that test and correctly totals 129. This is an accounting correction, not a behavior discrepancy.

Package manifests and lockfile are byte-identical to the accepted base. No dependency was fetched or added. No real sender, recipient, AWS account ID, credential, session token, or real approval identifier appears in the candidate or acceptance diff.

## Acceptance classification

`MOIRAE_MP08B_PROVIDER_02B_R6_ACCEPTED`

`FRESH_ATTEMPT_IDENTITY_SUPPORT_ACCEPTED`

`FRESH_ATTEMPT_USES_CURRENT_SCHEMA`

`APPROVAL_TTL_UNCHANGED`

`NO_LIVE_SEND`

The next authorized task may prepare the final live Attempt-002 choreography. It must never recover or modify Attempt-001.

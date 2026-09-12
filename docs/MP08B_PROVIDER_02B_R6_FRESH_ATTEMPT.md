# MP-08B Provider-02B-R6: fresh governed Attempt-002 readiness

Status: local candidate based only on accepted R4C. No live action, AWS call, SES call, provider invocation, real approval, deployment, push, merge, or tag occurred.

## Accepted base and audit result

The immutable base is annotated tag `mp-08b-provider-02b-r4c-legacy-hydration-accepted-v1` (tag object `8bf34b9fad798987e175295394a51048f4478073`), peeled commit `5a8aa18a526b2b1e8d543279a9015a721d52ea5c`, tree `de632359b939463d8d8e39df8f47b114eccaa0a8`.

`CAN_ACCEPTED_R4C_CREATE_INDEPENDENT_ATTEMPT_002_WITHOUT_SOURCE_CHANGE = NO`.

R4C hard-coded both the ledger attempt identity and the MP-03 accepted fixture's source request identity. Merely changing a state-file name would therefore still produce Attempt-001, while changing only the ActionIntent source identity would fail MP-03 mapping. R6 makes the minimum two bounded generalizations needed for a genuinely fresh action:

- trusted runner construction recognizes exactly Attempt-001 or Attempt-002 and gives Attempt-002 explicit `CREATE_FRESH`/`RESUME_EXISTING` lifecycle semantics;
- trusted MP-03 construction may bind one exact appointment-details source request identity, while retaining `REQUEST-MP02-DETAILS-001` as the legacy default.

Neither value is accepted from an ActionIntent, model, browser, provider response, or request body. Fates remains the admission authority. The fresh source identity is MP-03 mapping compatibility configuration, not Fates policy and not action-created authority.

## Attempt-002 isolation contract

Attempt-002 is the only new identity admitted by this slice. `CREATE_FRESH` performs an exclusive create-only write and fails with `FRESH_ATTEMPT_CREATE_ONLY` if the ledger path already exists. It never opens an existing file for replacement. `RESUME_EXISTING` requires a pre-existing ledger whose embedded attempt identity is exactly Attempt-002. Attempt-001 continues to use the legacy default construction path; fresh and legacy lifecycle modes cannot cross-bind.

The fresh action uses a new trusted source request identity. Action compilation consequently produces a new canonical ActionIntent digest and idempotency key. The new approval produces a new approval and decision identity; MP-06 creates a new logical-work, delivery, and claim identity; the runner derives correlation identity with Attempt-002 included. The eventual MP-04/SES request identity carries Attempt-002. No identity or current execution authority is inherited from Attempt-001.

Fresh state is born directly in schema `mp08b-provider-02b-r3-v1` with current R4A/R4C identity fields populated by ordinary preparation. It does not use legacy hydration, rearm, recovery, migration, reset, or overwrite behavior.

## Synthetic real-authority proof

The focused R6 suite uses only `trusted-demo@example.test` and the immutable accepted FATES-006C materialization. It first proves that a fresh ActionIntent cannot select its own source identity: without the trusted MP-03 source binding, preparation fails before approval. With the same source identity supplied through trusted host construction, the real Moirae adapter and real Fates Gateway return `REQUIRE_APPROVAL` / `WAITING_FOR_APPROVAL`.

The synthetic flow then creates a fresh durable approval, records a fresh synthetic human decision, enqueues fresh MP-06 work, and obtains a fresh claim with status `READY_FOR_MP04`. It stops there. The ledger remains `APPROVED`, provider invocation count remains zero, and `SEND_STARTED` is absent. No MP-04 provider execution method is called.

Attempt-001 approval input is rejected by Attempt-002 before the decision boundary. Duplicate Attempt-002 preparation, Attempt-001-as-fresh construction, mismatched ledger identity, and concurrent duplicate creation all fail closed. Exactly one of two racing create calls succeeds.

## Exactly-once and restart behavior

A synthetic-only ledger test persists `SEND_STARTED` for an isolated temporary Attempt-002 fixture, restarts through `RESUME_EXISTING`, and proves a second send start is refused. It also proves the same fresh identity cannot be recreated. No transport method is invoked in this proof.

Production ordering remains unchanged: the durable `SEND_STARTED` transition occurs before provider invocation, and all existing post-start no-resend behavior remains in force. R6 adds no retry, recovery, rearm, or provider behavior.

## Attempt-001 seal

The protected historical Attempt-001 remains permanently non-executable and unchanged. Its pre-work SHA-256 inventory was:

- attempt ledger: `9f95a23b42ef26a364a9b5aeb5016bebd5c6c4c8053321207cccff186376fc14`
- durable queue: `bcfa7f922e62cfff638bfeeebcc280b1dc8385f4c5591d36f025ef2cb37fa2d4`
- activity history: `c6b319fb7b679f225422fa83b448e1cd71fe4ce4ccd21307d155057b06492ee9`
- approval store: `879eb69091b7ea69248c237729651f8b866d5b6b029259e453843e52415fa5e8`

The final inventory matches these values byte for byte. No history was retrofitted and no real Attempt-002 state was created.

## Approval timing and future live choreography

The accepted host approval policy configures a five-minute approval validity window. R6 does not change it. Any future live run must complete all expensive read-only preflight before creating the approval, then proceed immediately through the fresh decision, new operator authorization, MP-06 claim, and MP-04 boundary. No broad test suite should run during that live approval window.

## Validation and scope

Production changes are limited to:

- `apps/host/src/provider-02b-runner.ts`
- `packages/fates-adapter/src/index.ts`

The focused proof is `tests/mp08b-provider-02b-r6-fresh-attempt.test.ts`. Bounded regression validation recorded 128 passed, 3 intentional skips, and 0 failed. Canonical validation with the accepted real-Fates test root enabled recorded 456 passed, 22 guarded skips, and 0 failed. Typecheck, ESLint, Prettier, build, and `git diff --check` passed.

Package manifests and lockfile are unchanged. No real recipient, sender, AWS account ID, credential, token, approval identity, provider operation, or external-effect evidence is committed.

## Classification

`MOIRAE_MP08B_PROVIDER_02B_R6_COMPLETE`

`FRESH_ATTEMPT_IDENTITY_SUPPORT_READY`

`ATTEMPT_001_PERMANENTLY_PRESERVED`

`FRESH_ACTION_NOT_ATTEMPT_001_RETRY`

`FRESH_ATTEMPT_CREATE_ONLY`

`EXISTING_ATTEMPT_NEVER_OVERWRITTEN`

`FRESH_ATTEMPT_USES_CURRENT_SCHEMA`

`OLD_ATTEMPT_AUTHORITY_CANNOT_CROSS_BIND`

`EXACTLY_ONCE_SEMANTICS_PRESERVED`

`NO_LIVE_SEND`

This local candidate requires fast independent acceptance before any final live Attempt-002 preparation.

# MP-08B Provider-02B-R4C acceptance

Classification: accepted locally. The acceptance evidence and tag are local only; no source, test, dependency, remote, deployment, approval, or provider state was changed.

## Candidate identity

- Candidate commit: `76d42942bf1bd0b45b10b9c7ae7db01b869f6102`
- Candidate tree: `d5a872f82b8cb036f4f9b6185a5fa083ffb3b77e`
- Parent: `a4246201d5c42b92dac9d04b9f1a60b10d68ca83`
- Subject: `fix(protocol): hydrate legacy prepared attempt identity`
- Accepted base tag: `mp-08b-provider-02b-r4a-jit-rebind-accepted-v1`
- Accepted base tree: `3716a76d3b0627a4ba06b9131d7efc947768f888`

The candidate worktree was clean. The candidate diff contains exactly these four files:

1. `apps/host/src/provider-02b-runner.ts`
2. `tests/mp08b-provider-02b-r4c-legacy-ledger-hydration.test.ts`
3. `docs/MP08B_PROVIDER_02B_R4C_LEGACY_LEDGER_HYDRATION.md`
4. `docs/evidence/mp08b-provider-02b-r4c-legacy-ledger-hydration.json`

`R4C_DIFF_CERTIFIED`

The production change is confined to the Provider-02B runner/ledger boundary. No Fates, Ananke, Horae, MP-04, SES, retry, MP-06, MP-07, frontend, deployment, manifest, or lockfile changes are present.

## Legacy blocker

The exact synthetic R3 fixture was independently inspected and executed. It has `PREPARED` state, zero provider invocations, no `SEND_STARTED`, no decision, no provider operation, no reconciliation, no queue outcome, no approval-binding revision/history, and all six R4A identity fields omitted.

Calling the unchanged R4A rebind before hydration fails on the incomplete prepared action identity. This reproduces the blocker R4C addresses rather than a broadened or synthetic replacement path.

`LEGACY_PREPARED_LEDGER_SCHEMA_MISMATCH_CONFIRMED`

## Provenance and authority

Every omitted field is reconstructed from authoritative state that existed before any replacement approval:

| Field                     | Reconstruction source                                       | Classification |
| ------------------------- | ----------------------------------------------------------- | -------------- |
| `actionBindingDigest`     | Existing durable host binding and immutable action identity | Recomputed     |
| `nativeActionHash`        | Existing durable waiting-admission native action hash       | Retained       |
| `recipientAddress`        | Original ActionIntent target/recipient                      | Retained       |
| `contextDigest`           | Original trusted authenticated context                      | Recomputed     |
| `presentationInputDigest` | Original binding and presentation inputs                    | Recomputed     |
| `operation`               | Existing durable waiting-admission operation                | Retained       |

The existing ActionIntent digest, idempotency identity, and request fingerprint are verified against the reconstruction. A conflicting existing field fails closed.

`LEGACY_IDENTITY_PROVENANCE_MATRIX_ACCEPTED`

## Replacement approval exclusion

The public hydration request accepts only the expected current approval ID and expected binding revision. It does not accept a replacement approval, recipient, hash, operation, or request-supplied identity material.

The runner re-reads the original durable host binding and the currently bound approval. It requires the old approval to be `EXPIRED` or `REVOKED` with no decision. The replacement approval is used only by the unchanged R4A rebind operation after hydration.

Static review found no replacement-field fallback in the hydration path.

`REPLACEMENT_APPROVAL_NOT_MIGRATION_SOURCE`

The expired approval is identity provenance only. It is not revived and does not authorize execution.

`EXPIRED_APPROVAL_HISTORY_VALID_FOR_IDENTITY_PROVENANCE_ONLY`

## State safety, atomicity, and idempotency

Hydration is restricted to an untouched `PREPARED` Attempt-001 with zero provider activity and no send, decision, claim, execution, reconciliation, queue, or terminal identity. The current approval ID and binding revision must match exactly.

The operation uses the existing exclusive ledger lock and atomic write path. It records a version-1 `HYDRATED` marker with source schema `R3_PREPARED`. Existing identity values are preserved when equal, absent values are filled, and disagreements fail with `LEGACY_IDENTITY_EXISTING_VALUE_MISMATCH` without mutation.

Running hydration twice leaves the attempt identity, action identity, approval ID, revision, and hydrated values unchanged.

`LEGACY_IDENTITY_HYDRATION_IDEMPOTENT`

## R4A compatibility

The central synthetic flow passed:

```text
legacy R3 PREPARED attempt
→ authoritative hydration
→ restart
→ unchanged strict R4A same-action rebind
```

Attempt-001 remained `PREPARED`, provider count remained zero, `SEND_STARTED` remained absent, the old approval became superseded history, and the fresh same-action approval became current.

The existing R4A strict mismatch tests continued to reject changed recipient, operation, native action hash, ActionIntent digest, idempotency, context digest, presentation input, and action-binding digest. Post-send and provider-activity refusals remain enforced.

`LEGACY_R3_PREPARED_LEDGER_COMPATIBLE_WITH_R4A_REBIND`

`R4A_STRICT_REBIND_SEMANTICS_PRESERVED`

`NO_LEGACY_IDENTITY_HYDRATION_AFTER_SEND_STARTED`

## Real protected state

The real Attempt-001 was inspected read-only. It matches the tested legacy fixture in all required structural respects:

- `PREPARED`;
- provider invocation count zero;
- `SEND_STARTED` absent;
- decision absent;
- provider operation absent;
- reconciliation absent;
- queue outcome absent;
- all six modern identity fields absent;
- approval-binding revision/history absent.

It was not hydrated. The protected attempt file, approval-binding file, and local approval database retained their pre-review SHA-256 values.

The unbound fresh approval from blocked R4B was not approved, rebound, deleted, revoked, expired, or used as migration input. Its local approval state remained independent and untouched.

`REAL_ATTEMPT_001_SCHEMA_MATCHES_TESTED_LEGACY_FIXTURE`

`PROTECTED_ATTEMPT_001_UNCHANGED`

`UNBOUND_FRESH_APPROVAL_LEFT_UNCHANGED`

## Validation

Focused R4C suite:

- 1 file;
- 9 passed;
- 0 failed;
- 0 skipped.

Bounded regression suite covering R4C, R4A, EXECUTION-02A, R3, MP-03/FATES-006C, MP-05, and MP-06C:

- 7 files;
- 131 passed;
- 0 failed;
- 3 skipped.

Canonical `npm.cmd run check`, using the same accepted Fates environment bindings as the candidate:

- 28 test files passed;
- 462 tests passed;
- 9 guarded skips;
- 0 failures;
- typecheck passed;
- lint passed;
- Prettier check passed;
- build passed;
- `git diff --check` passed.

Package manifests remain unchanged. No audit fix was run. The bounded privacy scan found no real recipient/sender, AWS account ID, credential, token, or live approval identifier.

## External-state restrictions

No AWS or SES call occurred. No real approval was created or approved. No provider was invoked. No `SEND_STARTED` was written. No live effect, deployment, push, merge, or source/test/dependency modification occurred during acceptance.

The acceptance tag is local only.

## Acceptance classification

```text
MOIRAE_MP08B_PROVIDER_02B_R4C_ACCEPTED
LEGACY_PREPARED_LEDGER_IDENTITY_HYDRATION_ACCEPTED
REAL_ATTEMPT_001_SCHEMA_MATCHES_TESTED_LEGACY_FIXTURE
REPLACEMENT_APPROVAL_NOT_MIGRATION_SOURCE
EXPIRED_APPROVAL_HISTORY_VALID_FOR_IDENTITY_PROVENANCE_ONLY
ACTION_IDENTITY_IMMUTABLE
LEGACY_IDENTITY_HYDRATION_IDEMPOTENT
LEGACY_R3_PREPARED_LEDGER_COMPATIBLE_WITH_R4A_REBIND
R4A_STRICT_REBIND_SEMANTICS_PRESERVED
NO_LEGACY_IDENTITY_HYDRATION_AFTER_SEND_STARTED
PROTECTED_ATTEMPT_001_UNCHANGED
UNBOUND_FRESH_APPROVAL_LEFT_UNCHANGED
NO_LIVE_SEND
```

Recommended next bounded action:

`RESUME_PROVIDER_02B_R4_LIVE_IMMEDIATELY`

The live task must independently preflight the real state, hydrate the real legacy Attempt-001, re-read the unbound approval, create at most one fresh approval if required, perform strict JIT rebind, and stop for the separately required live authorization boundary before any provider effect.

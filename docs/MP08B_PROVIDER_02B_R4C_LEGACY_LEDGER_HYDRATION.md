# MP-08B Provider-02B-R4C: legacy prepared-ledger identity hydration

Status: local candidate, not pushed, not merged, not tagged, and not used against the protected live Attempt-001.

## Scope

R4B exposed a compatibility blocker: the protected Attempt-001 was prepared by the R3 runner with a durable `PREPARED` record that contains the core approval/action identity fields but omits the six optional identity fields introduced by the R4A rebind schema. The unchanged R4A rebind correctly refuses that record because it cannot prove the complete prepared action identity.

R4C adds one narrowly scoped, PREPARED-only identity hydration operation. It reconstructs omitted identity metadata from the pre-existing durable host/Fates binding and then leaves the strict R4A approval rebind path unchanged. It is not an attempt reset, action replacement, approval replay, or live execution operation.

Base: `mp-08b-provider-02b-r4a-jit-rebind-accepted-v1` at `a4246201d5c42b92dac9d04b9f1a60b10d68ca83`, tree `3716a76d3b0627a4ba06b9131d7efc947768f888`.

## Provenance and authority

The replacement approval is never a source for legacy identity hydration. The runner first re-reads the currently bound approval from the durable approval runtime and requires the old record to be `EXPIRED` or `REVOKED` with no decision identity. It obtains the original durable host binding, derives the prepared binding deterministically, and passes that reconstruction to the ledger. The replacement approval is handled only later by the existing strict R4A rebind operation.

The expired approval history proves identity provenance and the fact that the original binding is no longer valid authority; it does not authorize execution and is not revived.

The field provenance classification used below is:

- **B** — retained or directly read from the original durable binding/admission.
- **C** — deterministically recomputed from original durable binding material using existing canonicalization/configuration rules.

| Hydrated field            | Authoritative source                                                                                                                | Classification |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `actionBindingDigest`     | Recomputed from the original durable binding's immutable action identity plus the existing derived context and presentation inputs. | C              |
| `nativeActionHash`        | Original `waitingAdmission.nativeActionHash` in the durable host binding.                                                           | B              |
| `recipientAddress`        | Original bound ActionIntent target/`parameters.recipientAddress`; no replacement or provider value is consulted.                    | B              |
| `contextDigest`           | Hash of the original trusted authenticated context.                                                                                 | C              |
| `presentationInputDigest` | Recomputed from the original binding intent/context/operation/native action hash using the established binding rules.               | C              |
| `operation`               | Original waiting-admission operation in the durable host binding.                                                                   | B              |

The existing ledger values `actionIntentDigest` and idempotency identity must equal the reconstruction. The request fingerprint is deterministically recomputed with the existing provider configuration and compared with the value retained in the ledger. Any disagreement fails closed without writing.

## API and state rules

The trusted runner API is:

```ts
hydrateLegacyPreparedIdentity(input: {
  expectedApprovalId: string;
  expectedApprovalBindingRevision: number;
}): Promise<Provider02bAttemptLedgerV1>
```

The ledger's internal operation accepts the reconstructed binding, the expected current approval and revision, and trusted time. No replacement approval parameter exists on this API. The operation requires all of the following:

- exact Attempt-001 identity;
- state `PREPARED`;
- zero provider invocations;
- no `SEND_STARTED`, provider operation, reconciliation, queue outcome, decision, claim, execution, logical-work, delivery, or correlation identity;
- an existing current approval binding matching the expected ID and revision;
- complete, mutually consistent authoritative reconstruction.

The operation fills only omitted fields, records a versioned `HYDRATED` marker with source schema `R3_PREPARED`, preserves attempt/action/approval history, and writes atomically under the existing exclusive lock. Existing non-empty fields must agree with the reconstruction. A second call is idempotent and returns the same complete record; an incomplete marker fails closed.

CAS protection requires the expected approval ID and binding revision. Concurrent or stale callers cannot use last-write-wins behavior. The operation cannot run after approval, send start, provider activity, observation, reconciliation, terminal, or unknown state.

## R4A compatibility

After hydration, the unchanged R4A `rebindPreparedApproval()` operation replaces only the approval binding. Its same-action comparison, approval-binding history, monotonic revision, and strict post-send refusal remain unchanged. The old approval is recorded as superseded/expired history, the fresh approval becomes current, and Attempt-001 remains `PREPARED` with no provider activity.

The synthetic local acceptance path demonstrates:

1. an exact R3-shaped record cannot be directly rebound;
2. authoritative hydration completes the identity without changing the action;
3. restart preserves the hydrated record;
4. a second hydration is idempotent;
5. the unchanged strict R4A rebind then succeeds for the same action.

Mismatch, partial-field disagreement, and all post-send/provider states fail without partial mutation.

## Protected real state

The protected real Attempt-001 was inspected read-only. It remains `PREPARED`, has zero provider invocations, no `SEND_STARTED`, no decision, and no provider/reconciliation/queue outcome. Its six optional identity fields, approval-binding revision, and approval-binding history are absent exactly as in the tested R3 legacy fixture. It was not hydrated or otherwise modified.

The separately created unbound fresh approval from the blocked R4B preparation was not used as migration input and was left untouched. No live approval, operator authorization, provider invocation, `SEND_STARTED`, AWS/SES call, or external effect occurred.

## Candidate files and validation

Production scope is limited to `apps/host/src/provider-02b-runner.ts`. The focused test is `tests/mp08b-provider-02b-r4c-legacy-ledger-hydration.test.ts`; this document and its bounded evidence JSON are the only other candidate files.

Validation against the accepted FATES-006C local materialization recorded 9 focused tests passed, 0 failed, 0 skipped; the bounded R4C/R4A/EXECUTION-02A/R3/MP-03/MP-05/MP-06 regression set recorded 131 passed, 0 failed, 3 skipped; and the canonical repository check recorded 28 files, 462 passed, 0 failed, and 9 guarded skips. Typecheck, lint, format check, build, and `git diff --check` passed. `npm ci` completed without manifest or lockfile changes; audit reported two moderate advisories and no fix was applied.

No real recipient, sender, approval identifier, AWS identity, credential, or token is committed. This candidate is local only and remains pending fast independent acceptance.

## Invariants

`ATTEMPT_IDENTITY_IMMUTABLE`

`ACTION_IDENTITY_IMMUTABLE`

`APPROVAL_BINDING_REPLACEABLE_ONLY_BEFORE_SEND`

`EXPIRED_APPROVAL_NOT_REVIVED`

`SUPERSEDED_APPROVAL_CANNOT_DECIDE_ATTEMPT`

`JIT_APPROVAL_REBIND_CAS_PROTECTED`

`OLD_AUTHORIZATION_NOT_REPLAYABLE`

`NO_APPROVAL_REBIND_AFTER_SEND_STARTED`

`ATTEMPT_001_REAL_STATE_UNTOUCHED`

`LEGACY_IDENTITY_HYDRATION_IDEMPOTENT`

`REPLACEMENT_APPROVAL_NOT_MIGRATION_SOURCE`

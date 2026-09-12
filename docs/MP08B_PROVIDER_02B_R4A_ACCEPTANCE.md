# MP-08B Provider-02B R4A acceptance

Status: accepted locally. This evidence accepts the prepared-state JIT approval rebind implementation; it does not authorize a live send.

## Candidate identity

- Candidate commit: `c6e35957d6cc15e88d72d83ad84c1152f2d81d10`
- Candidate tree: `eb3d18d0af41576d89aa4ba3a3ad8244aaa0ceff`
- Parent: `0c58b52f9e5911fc9c25b3654b247c4219f9fdba`
- Branch: `codex/mp08b-provider-02b-r4a-jit-approval-rebind`
- Accepted base: `mp-08b-execution-02a-accepted-v1`

The parent-to-candidate diff contains exactly four files. Production changes are confined to `apps/host/src/provider-02b-runner.ts`; the other three files are focused tests and bounded evidence. No Fates, Ananke, Horae, MP-04, retry, MP-06, MP-07, frontend, deployment, dependency, or manifest changes were present.

## Acceptance gates

`Provider02bRunner.rebindPreparedApproval()` requires an unconsumed `PREPARED` Attempt-001, zero provider invocations, no `SEND_STARTED`, provider operation, reconciliation, queue outcome, decision identity, claim, or execution identity. It requires the expected approval ID and binding revision, and a distinct replacement approval.

The runner rereads durable Fates truth before mutation. The current approval must be `EXPIRED` or equivalent terminal-invalid state; the replacement must be fresh `PENDING`; neither may have a decision identity. Caller assertions alone cannot establish either state.

The replacement is compared against the existing immutable action material: ActionIntent digest, idempotency identity, request fingerprint, action-binding digest, native action hash, operation, recipient, trusted context digest, and presentation-input digest. Mismatches fail without ledger mutation.

Approval binding history is append-only. The old binding remains auditable as `SUPERSEDED_EXPIRED`, the replacement becomes `CURRENT`, and `approvalBindingRevision` advances monotonically. Exclusive durable locking plus expected revision provides CAS protection; stale competing rebinds fail.

The operation never resets Attempt-001 to `UNUSED`, creates Attempt-002, revives expired approval, persists operator authorization, or permits rebind after provider activity. A later continuation requires a fresh invocation-scoped operator authorization.

## Independent execution evidence

The focused suite `tests/mp08b-provider-02b-r4a-jit-approval-rebind.test.ts` passed 14 tests with zero failures and zero skips. Against the accepted local Fates runtime it independently demonstrated:

- synthetic approval E expired through durable reread;
- fresh same-action approval F created and reread as pending;
- the same Attempt-001 remained `PREPARED` after rebind;
- action identity and recipient remained unchanged;
- append-only history and revision were preserved;
- E could not submit a decision after supersession;
- F could submit the synthetic decision and obtain a decision identity;
- recipient and all protected identity-field mismatches failed closed;
- post-approval and post-`SEND_STARTED` rebinds failed;
- restart durability and stale-revision refusal held.

The bounded regression set passed 108 tests, skipped 3 guarded tests, and failed 0. The canonical repository check passed typecheck, lint, Prettier, the complete test suite, and build: 431 tests passed, 31 guarded skips, and 0 failures.

## Protected live state and external state

The real Provider-02B Attempt-001 was read only and remained `PREPARED`, with zero provider invocations, zero automatic retries, no `SEND_STARTED`, no decision, no provider operation, no reconciliation, and no queue outcome. R4, R3, and R2 protected worktrees were not modified.

No AWS or SES call, real approval, provider invocation, live authorization, deployment, push, merge, or external effect occurred. Only synthetic approval/action material was used. No real recipient, AWS account identity, credential, or session material was committed.

## Classification

```text
MOIRAE_MP08B_PROVIDER_02B_R4A_ACCEPTED
PREPARED_STATE_JIT_APPROVAL_REBIND_ACCEPTED
ATTEMPT_IDENTITY_IMMUTABLE
ACTION_IDENTITY_IMMUTABLE
EXPIRED_APPROVAL_NOT_REVIVED
SUPERSEDED_APPROVAL_CANNOT_DECIDE_ATTEMPT
JIT_APPROVAL_REBIND_CAS_PROTECTED
NO_APPROVAL_REBIND_AFTER_SEND_STARTED
NO_APPROVAL_REBIND_AFTER_PROVIDER_ACTIVITY
OLD_AUTHORIZATION_NOT_REPLAYABLE
APPROVAL_REBIND_REQUIRES_NEW_OPERATOR_AUTHORIZATION
PROTECTED_ATTEMPT_001_UNCHANGED
NO_LIVE_SEND
```

This is local acceptance evidence only. The next bounded task may resume the consolidated Provider-02B R4 live run, with preflight first, fresh real approval last, fresh authorization, exactly one send, observation, Horae reconciliation, and MP-07 projection.

# MP-08B Provider-02B R4A: prepared-state JIT approval rebind

Status: local remediation candidate. It is not pushed, merged, tagged, or authorized for a live send.

## Purpose

Provider-02B R4 stopped before execution because Attempt-001 was already `PREPARED` against an approval that had expired. The existing ledger accepted preparation only from `UNUSED`, and its decision path required the original approval ID. R4A adds one bounded operation for replacing that expired binding while preserving the single prepared attempt.

This is approval binding refresh, not attempt reset, action replacement, authorization replay, or execution.

## Operation and preconditions

`Provider02bRunner.rebindPreparedApproval({ expectedApprovalId, expectedApprovalBindingRevision, replacement })` is trusted orchestration only. Before the ledger mutation, the runner rereads both approval records through the accepted durable Fates runtime:

- the current binding must reread as `EXPIRED` or the repository-equivalent terminal-invalid state;
- the replacement must reread as fresh `PENDING` and have no decision identity;
- both durable host bindings must be present and exact;
- the replacement must be a different approval for the same `SEND_APPOINTMENT_DETAILS` action.

The ledger then requires `PREPARED`, zero provider invocations, no `SEND_STARTED`, provider operation, reconciliation, queue outcome, claim, execution identity, or decision identity. It also requires the expected current approval ID and binding revision. Any later state, stale revision, or mismatch fails closed.

## Immutable identity and history

The attempt ID and action identity remain unchanged. The comparison covers the available action-intent digest, idempotency key, request fingerprint, action-binding digest, native action hash, operation, recipient, trusted context digest, and presentation-input digest.

The durable ledger records an append-only bounded history. The synthetic shape is:

```json
{
  "approvalBindingRevision": 1,
  "approvalBindingHistory": [
    { "revision": 0, "approvalId": "approval-E", "status": "SUPERSEDED_EXPIRED" },
    { "revision": 1, "approvalId": "approval-F", "status": "CURRENT" }
  ]
}
```

The durable update uses an exclusive creation lock plus the expected revision check. Concurrent or stale rebinds refuse last-write-wins behavior. No operator authorization is stored in the ledger; a later continuation still requires fresh invocation-scoped authorization.

## Boundaries preserved

- `ATTEMPT_IDENTITY_IMMUTABLE`
- `ACTION_IDENTITY_IMMUTABLE`
- `APPROVAL_BINDING_REPLACEABLE_ONLY_BEFORE_SEND`
- `EXPIRED_APPROVAL_NOT_REVIVED`
- `SUPERSEDED_APPROVAL_CANNOT_DECIDE_ATTEMPT`
- `JIT_APPROVAL_REBIND_CAS_PROTECTED`
- `OLD_AUTHORIZATION_NOT_REPLAYABLE`
- `NO_APPROVAL_REBIND_AFTER_SEND_STARTED`
- `NO_RECIPIENT_TRANSLATION`
- `NO_POST_APPROVAL_SUBSTITUTION`
- `ATTEMPT_001_REAL_STATE_UNTOUCHED`

The real prepared Attempt-001 was read only and remained `PREPARED`, with zero provider invocations, no `SEND_STARTED`, no decision, no provider operation, no reconciliation, and no queue outcome. All rebind tests used isolated synthetic state. The disabled SES transport was used for test construction; no AWS, SES, approval, provider, or external effect was performed.

## Evidence

The focused R4A suite exercises the real local accepted Fates runtime for expired-old/fresh-new approval rereads, same-action rebind, fresh decision acceptance, superseded approval refusal, and request-side recipient mutation rejection. It also exercises direct ledger mismatch, post-approval/post-send refusal, restart durability, append-only history, and stale-revision CAS behavior.

The bounded R3, EXECUTION-02A, MP-03/Fates-006C, MP-05 approval, and MP-06C concurrency/second-send regressions passed with 108 tests passed, 3 guarded skips, and 0 failures. The complete repository check passed: 431 tests passed, 31 guarded skips, 0 failures, with typecheck, ESLint, Prettier, and build green.

Recommended next step after local review: `R4A_REQUIRES_FAST_INDEPENDENT_ACCEPTANCE`. Do not create a fresh live approval or request live authorization automatically.

# MP-08B EXECUTION-02A — Trusted Exact Recipient at MP-04

## Candidate

This candidate starts from the prepared Provider-02B-R3 commit
`5268b3b01d32488f7fc753da1ec4613e0c1231a5` and is intentionally local-only.
It does not consume Attempt-001, alter the R3 preparation state, invoke AWS or
SES, or create an external effect.

## Ownership and boundary

The residual blocker was owned by Moirae’s MP-04 execution coordinator:
`packages/execution-coordinator/src/index.ts`, where
`validateActionInput()` compared action parameters to the legacy MP-03 fixture
before creating Ananke execution authority. Horae remains the durable
execution boundary, and Fates remains the authority for admission and
approval.

The change crosses exactly one boundary:

```text
legacy MP-04 fixture recipient
  -> trusted server-composed exact execution policy
  -> approved ActionIntent parameters unchanged
  -> native Ananke authority
  -> offline provider request construction only
```

## Policy and identity semantics

`Mp04TrustedExecutionConfig` is an optional constructor-only policy:

```ts
type Mp04TrustedExecutionConfig = Readonly<{
  readonly appointmentDetailsRecipient?: string;
}>;
```

The policy is REPLACE mode for `SEND_APPOINTMENT_DETAILS`: no configuration
preserves the historical `alex@example.test` fixture; configured mode permits
one exact, non-empty, non-wildcard email-shaped value only. The ActionIntent
cannot populate or mutate this policy. The coordinator copies the approved
ActionIntent parameters as execution arguments and uses the configuration only
as an exact equality guard.

The host exposes the existing native Fates hash function through the MP-04
Ananke port. This keeps the actual approved recipient in the native action
hash domain; it does not replace native hashing with a policy hash or compare
unrelated hash domains. Provider request construction likewise receives the
approved ActionIntent recipient unchanged.

## Independent evidence

The focused offline suite
`tests/mp08b-execution-02a-trusted-recipient-boundary.test.ts` independently
proved:

- synthetic `trusted-demo@example.test` reaches real local Fates admission as
  `WAITING_FOR_APPROVAL` / `REQUIRE_APPROVAL`, then reaches MP-04 only after a
  local synthetic durable approval and fresh admission;
- MP-04 creates authority and captures the exact recipient in an offline
  Horae boundary without invoking provider transport;
- the prepared provider request contains exactly the approved recipient and
  the exact approved decision identity;
- no configuration preserves the legacy recipient behavior;
- other, plus-suffix, same-domain, legacy, and one-character recipient
  mismatches fail before authority creation;
- malformed policy values fail at trusted construction;
- the native action hash changes with the recipient.

Existing MP-03, MP-04, and Provider-02B-R3 regression tests also pass in the
local environment. Tests use only synthetic identities and isolated temporary
state; the prepared R3 ledger and stale R2 worktree are not test fixtures.

The prior Provider-02B live authorization is not replayed by this candidate.
The previously prepared real approval was no longer a valid executable
approval, so a fresh approval would be required for any later live run. This
candidate never creates or submits that approval and leaves Attempt-001
`PREPARED` / unconsumed.

## Invariants

- `MP04_EXECUTION_RECIPIENT_EQUALS_APPROVED_ACTION_RECIPIENT`
- `TRUSTED_EXECUTION_RECIPIENT_SERVER_CONFIGURATION_ONLY`
- `APPROVED_ACTION_IS_EXECUTION_IDENTITY`
- `ACTIONINTENT_CANNOT_SELF_AUTHORIZE_RECIPIENT`
- `NO_RECIPIENT_TRANSLATION`
- `NO_POST_ADMISSION_SUBSTITUTION`
- `NO_POST_APPROVAL_SUBSTITUTION`
- `RECIPIENT_REMAINS_HASH_BOUND`
- `FATES_DECISION_REMAINS_AUTHORITATIVE`
- `APPROVAL_NOT_EXECUTION`
- `MP04_EXECUTION_NOT_AUTHORITY`
- `TRUSTED_EXECUTION_POLICY_IS_ONLY_A_GUARD`
- `OLD_AUTHORIZATION_NOT_REPLAYABLE`
- `NO_LIVE_PROVIDER_INVOCATION`
- `NO_LIVE_SEND`
- `ATTEMPT_001_UNCONSUMED`
- `NO_REAL_RECIPIENT_COMMITTED`

## Status

`MP08B_EXECUTION_02A_CANDIDATE_COMPLETE`

This is an unpushed, unmerged, untagged candidate. It is ready for review of
the MP-04 trusted exact-recipient boundary; Provider-02B live execution remains
separately authorized and is not performed here.

# MP-08B EXECUTION-02A Independent Acceptance

Status: `MOIRAE_MP08B_EXECUTION_02A_ACCEPTED`

This document records the independent acceptance of the exact published MP-08B
EXECUTION-02A candidate. The acceptance run assessed the candidate without
modifying production or test source, invoking AWS/SES, or resuming Provider-02B.

## Candidate identity

- Repository: `D:/Users/fleur/Moirae Protocol`
- Worktree: `D:/Users/fleur/Moirae Protocol/.worktrees/mp08b-execution-02a-trusted-recipient-boundary`
- Branch: `codex/mp08b-execution-02a-trusted-recipient-boundary`
- Candidate commit: `26590ae8919507c639b95a1141f73b79f8520232`
- Candidate tree: `e01c2a63f05e02a42b4300145f55d151b09b1f3d`
- Parent/R3 commit: `5268b3b01d32488f7fc753da1ec4613e0c1231a5`
- Parent/R3 tree: `954a762a6142778f82a601bb899278d3abff69c4`
- Candidate is exactly one commit beyond the R3 parent.
- Candidate worktree was clean before and after the acceptance run.

The candidate diff is certified as exactly these six paths:

1. `apps/host/src/approval-runtime.ts`
2. `apps/host/src/provider-02b-runner.ts`
3. `docs/MP08B_EXECUTION_02A.md`
4. `docs/evidence/mp-08b-execution-02a-trusted-recipient-boundary.json`
5. `packages/execution-coordinator/src/index.ts`
6. `tests/mp08b-execution-02a-trusted-recipient-boundary.test.ts`

No approval-store, replay, queue, hashing implementation, provider, dependency,
Horae, or Runtime Contracts implementation was changed by the candidate.

## Authority ownership and policy

The residual pre-execution fixture guard is owned by MP-04 in
`packages/execution-coordinator/src/index.ts`. Horae and Runtime Contracts have
no independent recipient fixture in their relevant source surfaces. The SES
adapter retains a downstream exact-recipient safety check, but it consumes the
ActionIntent recipient and does not translate it.

The additive API is:

```ts
export type Mp04TrustedExecutionConfig = Readonly<{
  readonly appointmentDetailsRecipient?: string;
}>;

export interface Mp04ExecutionCoordinatorOptions {
  // existing options
  trustedExecutionConfig?: Mp04TrustedExecutionConfig;
}
```

The configuration is captured and validated at trusted host construction. It
accepts one exact email-shaped value, rejects empty, whitespace-surrounded,
wildcard-like, and malformed values, and uses `REPLACE` semantics for
`SEND_APPOINTMENT_DETAILS`:

- no configuration: the legacy synthetic fixture remains the only accepted
  recipient;
- configured mode: only the exact configured recipient is accepted.

The configuration is an equality guard only. MP-04 copies the ActionIntent
parameters into native arguments; it does not use the trusted configuration as
the source of the action arguments. The only production construction site is
the trusted Provider-02B host runner. No HTTP, browser, model, ActionIntent,
provider response, IAM, or request metadata path can configure it.

## Accepted identity chain

For the synthetic configured recipient `trusted-demo@example.test`, the
independently revalidated chain is:

```text
ActionIntent recipient
  = MP-04 native arguments recipient
  = native Ananke action recipient
  = approved action recipient
  = Horae authority/record recipient
  = SES request recipient
```

The native Fates hash is obtained through the existing native hash function and
remains sensitive to the actual recipient. MP-04 does not translate a
recipient, substitute the legacy fixture, or create an approval decision.

Configured recipient A cannot execute an approved action B: mismatched
ActionIntent parameters fail before Ananke authority creation and before Horae
execution.

## Independent behavioral evidence

The focused candidate suite was rerun against the exact candidate:

```text
tests/mp08b-execution-02a-trusted-recipient-boundary.test.ts
9 passed, 0 failed, 0 skipped
```

It independently established real local Fates `REQUIRE_APPROVAL` for the
synthetic configured recipient, exact native/provider request propagation,
legacy default behavior, construction-time validation, request-supplied policy
being ignored, recipient-sensitive native identity, and exact fail-closed
behavior for other, one-character, plus-suffix, same-domain, and legacy
recipient mismatches.

The bounded MP-03/MP-04/R3 regression run produced:

```text
tests/mp03-fates006c-integration-01.test.ts  6 passed
tests/mp04-durable-execution.test.ts         7 passed, 6 guarded skips
tests/mp08b-provider-02b-r3-preparation.test.ts  5 passed
total                                        18 passed, 0 failed, 6 skipped
```

With the accepted immutable FATES-007A and Horae materializations enabled,
`tests/mp04-durable-execution.test.ts` independently passed all 13 tests,
including the real Ananke/Horae path.

The accepted FATES-008A checkout independently passed:

```text
packages/runtime-core/src/action-approval-store.test.ts       13 passed
packages/runtime-core/src/approval-dispatch-boundary.test.ts  10 passed
packages/runtime-core/src/admission.test.ts                    8 passed
total                                                         31 passed, 0 failed
```

## Full-suite and guarded-skip attribution

The candidate canonical check completed with:

```text
typecheck       passed
lint            passed
format:check    passed
tests           24 files passed, 2 guarded files skipped
                 417 passed, 31 skipped, 0 failed
build           passed
git diff --check passed
```

The complete set of guarded files contributing the 31 skips was run again on
an untouched disposable checkout of the exact R3 parent under the same
environment. Candidate and parent both produced 79 passed, 31 skipped, 0
failed across 5 files, with the same two Horae-dependent files skipped and the
same guarded counts in the other three files. Therefore the suite is recorded
as:

`FULL_SUITE_BASELINE_GUARDED_SKIPS_CANDIDATE_NEUTRAL`

This is not represented as an all-green unguarded suite. The skips are
environmental and were not introduced by EXECUTION-02A.

The repository’s actual validation scripts also passed with the existing
immutable public provenance checkouts:

- `npm.cmd run verify:sealed-fates`
- `npm.cmd run verify:mp05:fates-dependency`

The template names `validate:env` and `verify:adrasteia-source` are not npm
scripts declared by this candidate, so they were recorded as unavailable rather
than substituted or hidden.

## Protected state and external-effect boundary

The protected R3 worktree remained clean at commit
`5268b3b01d32488f7fc753da1ec4613e0c1231a5`, tree
`954a762a6142778f82a601bb899278d3abff69c4`. Attempt-001 remained `PREPARED`,
with zero provider invocations, zero automatic retries, no `SEND_STARTED`, no
provider operation, no reconciliation, and no decision identity recorded.

The stale R2 worktree retained exactly its three pre-existing untracked files;
no file was cleaned, staged, committed, copied, or modified.

No provider runner was invoked, no durable approval was created for this
acceptance, no old authorization was replayed, and no live transport path was
entered. The runner still requires current durably approved/claimed Attempt-001
state, a current decision identity, and its exact authorization gate before it
can mark a send started. Consequently `OLD_AUTHORIZATION_NOT_REPLAYABLE` and
`ATTEMPT_001_UNCONSUMED` remain proven.

No AWS or SES call, external effect, deployment, merge, or publication occurred.

## Provenance, privacy, and dependencies

The accepted Fates provenance was independently verified:

- Ananke FATES-007A: `114063e03332af3389fe805193e88a62111d9323`
- Horae FATES-007A: `aa296b420fbcf578089ca66dc03f6d09d9b06f00`
- Adrasteia: `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`
- FATES-008H evidence: `cc889456dc16a908041d8d70425438ad56d483c8`

The candidate package identities remained unchanged:

- `package.json`: `83e0929ec5d7464ca5486d6b50a6d5ac444c99bd`
- `package-lock.json`: `3abda7ef393cd7dc14ebcab88d8d231c3caa51e8`

A bounded scan over only the six candidate-changed files found 15 synthetic
email tokens, zero non-`@example.test` email addresses, and no credential,
account-ID, ARN, access-key, session-token, or bearer-token marker.

`NO_REAL_RECIPIENT_COMMITTED`

`NO_AWS_ACCOUNT_ID_COMMITTED`

`NO_CREDENTIAL_COMMITTED`

## Acceptance classification

```text
MOIRAE_MP08B_EXECUTION_02A_ACCEPTED
MP04_TRUSTED_RECIPIENT_EXECUTION_SEAM_ACCEPTED
APPROVED_ACTION_IS_EXECUTION_IDENTITY
TRUSTED_EXECUTION_POLICY_IS_ONLY_A_GUARD
EXECUTION_RECIPIENT_IDENTITY_CHAIN_ACCEPTED
MP04_EXECUTION_PRESERVES_APPROVED_ACTION_IDENTITY
APPROVAL_A_CANNOT_EXECUTE_B
NO_RECIPIENT_TRANSLATION
NO_POST_APPROVAL_SUBSTITUTION
OLD_AUTHORIZATION_NOT_REPLAYABLE
ATTEMPT_001_UNCONSUMED
MP04_EXECUTION_RECIPIENT_BLOCKER_RESOLVED
NO_LIVE_SEND
```

This document is acceptance evidence only. The local acceptance tag is created
after the evidence commit and is not pushed.

Recommended next bounded action:

`PROVIDER_02B_REQUIRES_FRESH_APPROVAL_JUST_IN_TIME_REPREPARATION`

Do not create a new approval or authorize a live send automatically.

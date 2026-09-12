# MP-09 focused adversarial acceptance

## Scope and frozen baseline

This deadline-mode review attacked only submission-critical governance
boundaries. It ran against the immutable MP-08B freeze:

- tag: `mp-08b-final-accepted-v1`
- tag object: `3cf36675fa2409dc840b72f6558ce320776134ba`
- commit: `baa269a53c46e4fd8cbc3ec1640c984280d596b6`
- tree: `553e391c99f041e931b7841c12e89b01d24b5c78`

The worktree was created directly from that commit. Earlier MP-09A material was
used only as test input; it was not treated as separate accepted authority.
No source or test file was changed.

Frozen live truth remained:

- Attempt-002 `SEND_STARTED` present
- exactly one provider invocation
- no provider operation ID
- no independently correlated SES event
- Horae `UNKNOWN`
- MP-06 `RECONCILIATION_REQUIRED`
- MP-07 `BLOCKED`
- Attempt-002 permanently consumed
- Attempt-001 permanently preserved

## Focused attack results

| ID           | Attack                                                                                          | Fail-closed boundary observed                                                      | Result  |
| ------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------- |
| MP09-RED-001 | Model/AgentProposal injects approval, policy, attempt, or success authority                     | Proposal schema, deterministic compiler, and trusted construction                  | Refused |
| MP09-RED-002 | Browser/request/frontend state selects policy, Fates result, approval, or reconciliation        | Boundary schemas and trusted host-only dependency injection                        | Refused |
| MP09-RED-003 | Recipient replacement, plus-address, same-domain, legacy fixture, or post-approval substitution | MP-03/Fates exact policy, approval hashes, and MP-04 trusted recipient check       | Refused |
| MP09-RED-004 | Stale, expired, wrong-action, wrong-decision, or cross-attempt approval reuse                   | Durable approval identity, presentation, action, and decision revalidation         | Refused |
| MP09-RED-005 | Duplicate/arbitrary fresh attempt or wrong embedded resume identity                             | Trusted Attempt-002 selection and create-only/resume-exact ledger                  | Refused |
| MP09-RED-006 | Execute or rebind after `SEND_STARTED`; recreate consumed Attempt-002                           | Durable point-of-no-return and lifecycle guards                                    | Refused |
| MP09-RED-007 | Duplicate enqueue/delivery, simultaneous claim, stale claim, or cross-work claim                | Durable idempotency, generation, lease, and exact claim binding                    | Refused |
| MP09-RED-008 | Provider acceptance or SES message ID claims effect confirmation                                | SES reconciliation requires independent observation                                | Refused |
| MP09-RED-009 | Wrong/partial/ambiguous/setup-residue observation claims confirmation                           | Exact execution, correlation, recipient, and provider-operation binding            | Refused |
| MP09-RED-010 | `UNKNOWN` becomes `CONFIRMED`, `COMPLETED`, or `HANDLED_AUTOMATICALLY`                          | Durable Horae result, MP-06 outcome, and native MP-07 projection                   | Refused |
| MP09-RED-011 | Missing record becomes `ABSENT`                                                                 | Native reconciliation read distinguishes missing truth                             | Refused |
| MP09-RED-012 | Rewrite historical boundary evidence or resurrect Attempt-001                                   | No accepted history-rearm API; hydration/rebind lifecycle and identity constraints | Refused |
| MP09-RED-013 | Model, browser, request, or ActionIntent selects trusted source-request identity                | Exact trusted `appointmentDetailsSourceRequestId` mapping                          | Refused |
| MP09-RED-014 | Trusted source configuration is treated as Fates authority                                      | Real Fates admission remains independently required                                | Refused |
| MP09-RED-015 | Synthetic approval, observation, fixture, or offline provider return satisfies live truth       | Native durable readers and no-test-fallback boundaries                             | Refused |

## Highest-value conclusions

- Model output and browser/request state remained non-authoritative.
- Recipient identity could not be translated or replaced after approval.
- Approval and decision authority could not cross action or attempt boundaries.
- At most one current MP-06 claim could reach execution.
- A provider return or SES message ID could not establish effect truth.
- Missing, partial, ambiguous, or mismatched observation could not confirm an effect.
- Frozen `UNKNOWN` could not become `CONFIRMED`, MP-06 `COMPLETED`, or MP-07
  `HANDLED_AUTOMATICALLY` without accepted native evidence.
- Attempt-001 could not be retrofitted or resurrected.
- Consumed Attempt-002 could not execute again.

## Validation

Focused adversarial and governance regression run:

- test files passed: `15`
- tests passed: `247`
- intentional skips: `3`
- failures: `0`

The single canonical `npm.cmd run check` completed through its final build step:

- typecheck: passed
- ESLint: passed
- Prettier: passed
- full tests: passed
- build: passed
- `git diff --check`: passed

No live state was used as a test fixture. Synthetic tests used isolated temporary
state. After testing, Attempt-001 retained its protected hash and Attempt-002
remained `RECONCILED`, invocation count `1`, `SEND_STARTED` present, Horae
`UNKNOWN`, and MP-06 `RECONCILIATION_REQUIRED`.

## Findings

- P0 submission blockers: `0`
- P1 important bounded findings: `0`
- P2 non-blocking findings: `0`

## External-effect and privacy boundary

MP-09 made no AWS call, SES call, provider invocation, approval, authorization,
attempt, queue execution, deployment, publication, push, or merge. Evidence
contains no real address, AWS account ID, credential, token, sensitive approval
or claim identity, authorization phrase, or raw live correlation material.

## Classification

`MOIRAE_MP09_FOCUSED_ACCEPTED`

`NO_P0_SUBMISSION_BLOCKERS_FOUND`

`MODEL_OUTPUT_NOT_AUTHORITY_CONFIRMED`

`BROWSER_STATE_NOT_AUTHORITY_CONFIRMED`

`NO_RECIPIENT_TRANSLATION_CONFIRMED`

`NO_POST_APPROVAL_SUBSTITUTION_CONFIRMED`

`APPROVAL_REPLAY_REFUSED`

`CROSS_ATTEMPT_AUTHORITY_REUSE_REFUSED`

`SECOND_SEND_REFUSED_CONFIRMED`

`EXACTLY_ONCE_BOUNDARY_CONFIRMED`

`QUEUE_DUPLICATION_FAILS_SAFE`

`PROVIDER_SUCCESS_NOT_EFFECT_CONFIRMED`

`SES_MESSAGE_ID_NOT_EFFECT_CONFIRMED`

`OBSERVATION_CORRELATION_FAIL_CLOSED`

`UNKNOWN_NOT_CONFIRMED`

`NO_RECORD_NOT_ABSENT`

`MP07_HANDLED_REQUIRES_CONFIRMED_EFFECT`

`NO_HISTORY_RETROFIT_CONFIRMED`

`TRUSTED_SOURCE_REQUEST_CONFIGURATION_CONFIRMED`

`SYNTHETIC_NOT_LIVE_CONFIRMED`

`ATTEMPT_001_PERMANENTLY_PRESERVED`

`ATTEMPT_002_PERMANENTLY_CONSUMED`

`NO_LIVE_EFFECT_DURING_MP09`

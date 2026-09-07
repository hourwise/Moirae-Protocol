# MP-09 Offline Adversarial Matrix

## Scope

This matrix prepares the offline adversarial acceptance campaign for MP-09. It is intentionally limited to deterministic local Protocol, host, and browser-boundary behavior that can be exercised without AWS, Bedrock, Strands live inference, public ingress, or deployed infrastructure.

`MP09A_OFFLINE_PREPARATION != MP09_ACCEPTANCE`. No live AWS call, provider invocation, deployment, tag, or publication is part of this preparation slice.

The new stable test identifiers are implemented in `tests/mp09a-offline-adversarial-prep.test.ts`. Existing-coverage rows below point to the accepted suites that were audited as part of this preparation.

## Offline matrix

| ID           | Adversarial case                                                                    | Boundary under test                        | Expected result                                                                                       | Evidence                                                                                                                                                    | Classification           |
| ------------ | ----------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| MP09-OFF-001 | Malformed AgentProposalV1 values and authority-shaped extra fields                  | Strands proposal schema                    | Strict schema rejection; no authority-shaped value enters the compiler                                | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-002 | Hostile prose claims approval, administrator status, or permission to bypass policy | Strands → MP-02 compiler                   | Proposal remains untrusted; compiled ActionIntent contains no approval, authority, or effect material | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-003 | Unsupported semantic action                                                         | MP-02 deterministic compiler               | `NEEDS_CLARIFICATION / unsupported_semantic_action`; no guessed ActionIntent                          | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-004 | Queue reports `COMPLETED` while MP-04 is `UNKNOWN`                                  | MP-07 product mapping                      | `BLOCKED / MP04_UNKNOWN`; refetch required; never handled automatically                               | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-005 | Approval reference exists without a native presentation                             | MP-05 → MP-07 presentation boundary        | Deterministic boundary failure; reference is not treated as approval                                  | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-006 | Approval presentation from one action is substituted into another                   | MP-05 binding / MP-07 read model           | `APPROVAL_PRESENTATION_BINDING_MISMATCH`; no Needs You state is fabricated                            | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-007 | Expired, rejected, revoked, consumed, missing, invalid, or boundary-failed approval | MP-05 native status → MP-07 reason mapping | Each terminal native condition maps to its own blocked reason; no auto-reapproval                     | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-008 | Activity event belongs to another logical work item                                 | MP-06 activity observation                 | Inconsistent durable state is rejected; activity cannot be attached to another work item              | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-009 | Unsupported queue delivery state                                                    | MP-06 state machine → MP-07                | Fail closed as inconsistent durable state; no friendly category is guessed                            | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-010 | Forged denial activity accompanies confirmed completion                             | Activity non-authority                     | Durable `COMPLETED + CONFIRMED` remains `HANDLED_AUTOMATICALLY`; activity is evidence only            | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-011 | Direct approval transport includes category, recipient, and execution fields        | Trusted host decision boundary             | Strict request rejection before coordinator; current Needs You state remains unchanged                | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-012 | Same decision envelope is submitted twice                                           | MP-05 decision idempotency / terminality   | First decision succeeds; repeat is rejected with conflict; no second decision                         | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-013 | Equivalent trusted product inputs are projected twice                               | Deterministic MP-07 host adapter           | Deep-equal output; no clock, random, model, or environment dependency                                 | `tests/mp09a-offline-adversarial-prep.test.ts`                                                                                                              | PASS / NEW_COVERAGE      |
| MP09-OFF-014 | Action parameter, context, digest, and idempotency substitutions                    | MP-03 current admission                    | Mismatch is rejected or denied before execution; no effect                                            | `tests/mp03-fates-admission.test.ts`                                                                                                                        | PASS / EXISTING_COVERAGE |
| MP09-OFF-015 | Replayed, forged, or mismatched execution material                                  | MP-04 effect boundary                      | Native execution identity/provenance checks hold; no duplicate effect                                 | `tests/mp04-durable-execution.test.ts`                                                                                                                      | PASS / EXISTING_COVERAGE |
| MP09-OFF-016 | `UNKNOWN`, `ABSENT`, and recovery-required execution outcomes                       | MP-04 reconciliation                       | Reconciliation remains authoritative; no approval or queue state authorizes redispatch                | `tests/mp04-durable-execution.test.ts`                                                                                                                      | PASS / EXISTING_COVERAGE |
| MP09-OFF-017 | Duplicate deliveries, stale generations, retry exhaustion, and crash recovery       | MP-06 scheduling                           | Lease/generation/retry invariants hold; bounded retry state is durable                                | `tests/mp06b-background-work.test.ts`, `tests/mp06c-concurrency-crash-retry-hardening.test.ts`, `tests/mp06d-background-human-approval-integration.test.ts` | PASS / EXISTING_COVERAGE |
| MP09-OFF-018 | Semantic rebinding, stale approval, revocation, and duplicate decision attempts     | MP-05 durable approval truth               | Native durable approval truth wins; no queue or presentation substitute becomes authority             | `tests/mp05-human-approval.test.ts`                                                                                                                         | PASS / EXISTING_COVERAGE |
| MP09-OFF-019 | Forged product category, activity, evidence, or inconsistent native state           | MP-07 deterministic read model             | Category derives only from trusted structured input; invalid combinations fail closed                 | `tests/mp07b-deterministic-product-read-model.test.ts`                                                                                                      | PASS / EXISTING_COVERAGE |
| MP09-OFF-020 | Browser direct API, stale state, tampering, and response-loss cases                 | MP-07C/MP-07D host/browser boundary        | Host revalidates bounded input and rereads native truth; no browser authority or duplicate effect     | `tests/mp07c-local-dashboard-approval-interaction.test.ts`, `tests/mp07d-human-product-hardening.test.ts`                                                   | PASS / EXISTING_COVERAGE |

## Coverage classification

### No missing offline coverage identified in the bounded scope

The preparation suite adds stable identifiers for the newly audited cross-boundary cases and closes the bounded offline gaps identified during the source review. No additional offline-only gap is being asserted as a production defect. This is a test-preparation conclusion, not a formal MP-09 acceptance result.

### Live-only coverage deferred

The following require later, separately authorized live/deployed validation and are not covered by MP-09A:

- actual Strands/Bedrock provider behavior and model-use-case access;
- the exact MP-08A/MP-08B runtime and public HTTPS ingress;
- deployed secret/IAM/logging boundaries and teardown behavior;
- hosted durable state, worker execution, and external-network failure behavior;
- real provider/effect integration and live cost/concurrency controls.

### Potential architectural gaps

None were identified within this bounded offline preparation scope. Live provider access and hosted deployment evidence remain open validation gates rather than offline code findings.

## Acceptance sequencing

The intended critical path remains:

`MP-08A accepted → MP-08B deployed candidate → MP-09 live adversarial acceptance → MP-10 release-candidate freeze → MP-11 submission production`

This document prepares the adversarial vocabulary and deterministic local evidence for that path. It does not accept MP-09, deploy AWS, or alter accepted runtime semantics.

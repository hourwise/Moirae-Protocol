# MP-08B Projection-01 — Trusted MP-07 Native State Projection

## Scope and status

This slice starts from Provider-01B commit
`3d8cde3c73781a38946da7d8ba68e7450484364e` and adds a read-only host
composition for the accepted MP-07 mapper. It does not change the product
categories, the synthetic dashboard, or any authority boundary.

```text
durable MP-05 approval
  + durable MP-06 delivery/outcome/activity
  + explicitly supplied MP-04/Horae result
  → existing deterministic MP-07 product mapper
  → trusted product view
```

`MP08B_PROJECTION_01 != MP08B_DEPLOYMENT`

`MP08B_PROJECTION_01 != MP08B_ACCEPTANCE`

`MP08B_PROJECTION_01 != MP09_ACCEPTANCE`

The implementation is intentionally partial at the hosted/native execution
read boundary. The accepted MP-04 coordinator currently exposes execution and
recovery operations, but not a read-only result projection API. This slice
therefore adds an explicit injected `readExecution` port and refuses to infer
MP-04 truth from queue or activity state.

## Existing MP-07 contract audit

The accepted mapper is `buildMp07ProductView` in
`apps/host/src/index.ts`. Its category precedence is:

1. `COMPLETED` queue outcome/state is handled only when the supplied MP-04
   result is `CONFIRMED`. `UNKNOWN`, `RECOVERY_REQUIRED`, `ABSENT`, or missing
   execution evidence are blocked conservatively.
2. `WAITING_FOR_APPROVAL` requires a valid current `PENDING` MP-05
   presentation and becomes `NEEDS_YOU`.
3. Denial, boundary block, terminal failure, retry exhaustion,
   reconciliation-required, and absent-effect states become `BLOCKED` with
   their existing reason codes.
4. Non-terminal queue progress, including queued and claimed work, becomes
   `ACTIVITY`.
5. A non-pending/non-approved approval observation blocks; an invalid or
   inconsistent native state is rejected by the mapper rather than guessed.

The four accepted categories remain exactly:

```text
HANDLED_AUTOMATICALLY
NEEDS_YOU
BLOCKED
ACTIVITY
```

`PRODUCT_VIEW != AUTHORITY`. The mapper is a deterministic read model and
does not create approval, admission, queue, execution, or effect truth.

## Native source matrix

| Native input           | Read source                                      | Classification                                                   | Projection use                                                                               |
| ---------------------- | ------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| MP-05 binding          | `Mp08bDurableApprovalRuntime.getApprovalBinding` | `AUTHORITATIVE_NATIVE_STATE` for host-owned correlation material | Rebinds exact ActionIntent, trusted context, and waiting admission                           |
| MP-05 observation      | `Mp08bDurableApprovalRuntime.readApproval`       | `AUTHORITATIVE_NATIVE_STATE`                                     | Supplies pending/approved/rejected/expired/revoked/consumed state                            |
| MP-05 presentation     | `refreshApproval(...).presentation`              | `AUTHORITATIVE_NATIVE_STATE` observation                         | Required to render `NEEDS_YOU` safely; never treated as approval authority                   |
| MP-06 delivery         | `Mp08bDurableQueueRuntime.inspectDelivery`       | `AUTHORITATIVE_NATIVE_STATE`                                     | Supplies queue state, work identity, claim, and approval reference                           |
| MP-06 outcome          | `inspectOutcome`                                 | `AUTHORITATIVE_NATIVE_STATE`                                     | Supplies completion, denial, reconciliation, and absent outcomes                             |
| MP-06 activity         | `listActivity`                                   | `ACTIVITY_ONLY`                                                  | Describes queue/worker/execution events; cannot establish authority                          |
| MP-04/Horae result     | explicit `readExecution` dependency              | `AUTHORITATIVE_NATIVE_STATE` when supplied                       | Supplies `CONFIRMED`, `ABSENT`, `UNKNOWN`, or `RECOVERY_REQUIRED` without executing recovery |
| Browser state/category | none                                             | `SYNTHETIC_ONLY` / untrusted                                     | Never accepted by the native projection                                                      |

The MP-04 result port is deliberately explicit because the current accepted
`Mp04ExecutionCoordinator` does not expose a read-only result lookup. Its
`recoverActionExecution` operation is a stateful recovery boundary and is not
called by this projection.

## Correlation and precedence

The projection joins records only through already accepted identities:

- queue `workId`, `sourceRequestId`, ActionIntent canonical digest, and
  idempotency key;
- the queue's exact `approvalId` reference;
- the durable host binding's exact ActionIntent and waiting admission;
- MP-04 durable execution ID;
- optional MP-04 evidence canonical digest and approval-grant ID.

The native reader rejects a missing approval reference, missing binding, or any
ActionIntent identity mismatch. It does not join records by display text,
browser identifiers, provider MessageId, or Activity content.

The effective precedence is the existing MP-07 mapper's precedence, not a new
projection policy:

```text
completed + MP04 CONFIRMED
  → HANDLED_AUTOMATICALLY
completed + MP04 UNKNOWN/RECOVERY_REQUIRED/ABSENT/missing
  → BLOCKED
waiting-for-approval + MP05 PENDING presentation
  → NEEDS_YOU
denied/boundary/retry/reconciliation/absent
  → BLOCKED
queued/available/claimed/other active work
  → ACTIVITY
```

The projection never chooses the optimistic interpretation of conflicting
state. `Activity` is explanatory and cannot override native approval, queue,
or reconciliation state.

## Implemented trusted read model

`apps/host/src/native-projection.ts` provides:

- `createMp08bTrustedNativeProductProjection`, a read-only application seam;
- `createMp08bNativeProjectionSources`, which wires the accepted MP-05 and
  MP-06 runtime readers;
- `Mp08bNativeExecutionReadRequestV1`, the explicit MP-04/Horae read contract;
- capability facts declaring `mutatesProtocolState: false` and
  `fallsBackToSynthetic: false`.

The read path is:

```text
queue delivery lookup
→ exact MP-05 approval reference
→ durable host binding lookup
→ ActionIntent/work identity verification
→ durable MP-05 observation
→ current presentation only when pending
→ optional, identity-checked MP-04 result lookup
→ buildMp07ProductView
```

No route was added. `GET /mp07/state` remains the synthetic local-demo route
and its existing semantics are unchanged. The new seam does not replace or
silently alter `npm run start`.

If the native queue or binding is unavailable, the projection throws
`Mp08bNativeProjectionError`; it does not return synthetic state. If a
completed queue outcome has no MP-04 read result, the existing mapper returns
`BLOCKED / INCONSISTENT_COMPLETION` rather than `HANDLED_AUTOMATICALLY`.

## Category evidence exercised offline

The focused Projection-01 tests use deterministic ActionIntent, queue,
approval, and MP-04 snapshots. They do not call Fates, Strands, AWS, SES, or
any network service.

- durable `PENDING` approval + waiting queue → `NEEDS_YOU`;
- durable rejected approval + denied queue → `BLOCKED / MP03_REJECTED`;
- available and claimed queue states → `ACTIVITY`;
- MP-04 `UNKNOWN` → `BLOCKED / MP04_UNKNOWN`;
- MP-04 `RECOVERY_REQUIRED` → `BLOCKED / MP04_RECOVERY_REQUIRED`;
- MP-04 `ABSENT` → `BLOCKED / EFFECT_ABSENT`;
- durable completed queue + MP-04 `CONFIRMED` →
  `HANDLED_AUTOMATICALLY`;
- durable completed queue without an execution result →
  `BLOCKED / INCONSISTENT_COMPLETION`;
- mismatched binding → fail-closed projection error;
- reconstructed readers over the same snapshots → identical product view.

The handled case is a `LOCAL_DETERMINISTIC_EFFECT_FIXTURE` only. It does not
claim a real SES or other external effect.

## False-positive protections

The following remain non-handled unless the exact accepted completion
predicate is satisfied:

```text
APPROVED                              != HANDLED_AUTOMATICALLY
QUEUED                               != HANDLED_AUTOMATICALLY
CLAIMED                              != HANDLED_AUTOMATICALLY
READY_FOR_MP04                       != HANDLED_AUTOMATICALLY
EXECUTION_ATTEMPTED                  != HANDLED_AUTOMATICALLY
PROVIDER_ACCEPTED                    != HANDLED_AUTOMATICALLY
SES_MESSAGE_ID                       != HANDLED_AUTOMATICALLY
MP04 UNKNOWN                         != HANDLED_AUTOMATICALLY
MP04 ABSENT                          != HANDLED_AUTOMATICALLY
RECOVERY_REQUIRED                    != HANDLED_AUTOMATICALLY
MP06 COMPLETED without MP04 CONFIRMED != HANDLED_AUTOMATICALLY
MP04 CONFIRMED without MP06 COMPLETED != HANDLED_AUTOMATICALLY
```

`BROWSER_CATEGORY != PROTOCOL_TRUTH` and `ACTIVITY != AUTHORITY` remain
explicit invariants.

## Capability state and boundaries

The factual capability state remains:

```text
liveFates          = true
durableApproval    = true
durableLocalQueue  = true
boundedWorker      = true
hostedDurableQueue = false
externalEffects    = false
```

The read-side seam additionally reports `trustedNativeProjection = true` for
the seam itself. This does not imply hosted durability, public authentication,
live SES, or external-effect confirmation.

Preserved boundaries:

- `MODEL_OUTPUT_NOT_AUTHORITY`
- `FATES_DECISION_NOT_MODEL_DECISION`
- `BROWSER_STATE_NOT_AUTHORITY`
- `TRUSTED_HOST_CONTEXT_PRESERVED`
- `IAM_NOT_FATES_AUTHORITY`
- `APPROVAL_NOT_EXECUTION`
- `QUEUE_ITEM_NOT_EFFECT`
- `WORKER_CLAIM_NOT_EFFECT`
- `EXECUTION_ATTEMPT_NOT_EFFECT`
- `PROVIDER_SUCCESS_NOT_EFFECT_CONFIRMED`
- `UNKNOWN_NOT_CONFIRMED`
- `NO_TEST_FALLBACK`
- `SYNTHETIC_NOT_LIVE`
- `FAIL_CLOSED_UNKNOWN_STATE`

## Remaining boundary

This slice leaves exactly one implementation boundary before a fully wired
native live projection:

```text
MP08B_REQUIRES_MP04_NATIVE_RECONCILIATION_READ_PORT
```

That port must read the accepted durable Horae/MP-04 reconciliation result by
durable execution identity without invoking recovery or inferring truth from
MP-06 activity. Once that is available, the same read model can expose the
real Provider-02 result through the accepted MP-07 categories. Provider-02
SES setup/live effect execution remains separately gated after that read
boundary and is not started here.

## Validation and state

`tests/mp08b-projection-01-trusted-native-state.test.ts` is the focused local
projection suite. No AWS, STS, Bedrock, Strands live inference, SES, network,
or external effect was performed.

This candidate remains local only:

```text
MP08B_PROJECTION_01_PARTIAL
BLOCKED_MP04_NATIVE_RECONCILIATION_READ_PORT
NO_FAKE_PRODUCT_TRUTH
MP08A_ACCEPTED
MP08B_NOT_DEPLOYED
MP08B_NOT_ACCEPTED
MP09_NOT_ACCEPTED
```

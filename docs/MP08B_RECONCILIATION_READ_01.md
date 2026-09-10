# MP-08B Reconciliation-Read-01 — Native MP-04 / Horae Durable Read Port

## Scope and status

This bounded slice starts from Projection-01 commit
`4075eb8154efc39566d1a2d92f97119cc3bc4a58` and resolves its exact blocker:
`BLOCKED_MP04_NATIVE_RECONCILIATION_READ_PORT`.

The resulting read-only chain is:

```text
durable Horae reconciliation record
  → Mp04ExecutionCoordinator.readExecution(...)
  → exact identity validation
  → existing Mp04ExecutionResultV1
  → apps/host/src/native-projection.ts
  → existing buildMp07ProductView
```

This slice reads already-persisted truth only. It does not execute, recover,
retry, claim, reconcile by mutation, write evidence, or infer effect truth from
queue or activity state.

`MP08B_RECONCILIATION_READ_01 != EXECUTION`

`MP08B_RECONCILIATION_READ_01 != RECOVERY`

`MP08B_RECONCILIATION_READ_01 != MP08B_DEPLOYMENT`

`MP08B_RECONCILIATION_READ_01 != MP08B_ACCEPTANCE`

`MP08B_RECONCILIATION_READ_01 != MP09_ACCEPTANCE`

`READ != RECOVER`

`NO_RECORD != ABSENT_EFFECT`

`NATIVE_RECONCILIATION_READ != EFFECT_CREATION`

`LOCAL_FIXTURE_CONFIRMED != REAL_EXTERNAL_EFFECT`

## Persistence and Horae audit

The accepted MP-04 coordinator already depended on `Mp04HoraePort` from
`packages/execution-coordinator/src/index.ts`. Its `get(durableExecutionId)`
operation is the existing Horae-backed durable read capability. The accepted
Horae record contains the durable execution identity, native action hash,
authority/request identity, operation, effect adapter, state, history, and,
when terminal, the persisted receipt/result.

The MP-04 coordinator also has execution and recovery operations. Recovery is
stateful and can write an index/evidence path, so it is explicitly not used by
this slice. The coordinator's in-memory execution index is not treated as the
durable source and is not needed for restart reads.

| Capability                        | Actual source                                | Classification                                                                       |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Horae durable record lookup       | `Mp04HoraePort.get(durableExecutionId)`      | `IMPLEMENTED_RUNTIME`, `DURABLE_LOCAL` when backed by the accepted local Horae store |
| MP-04 read-only result conversion | `Mp04ExecutionCoordinator.readExecution`     | `IMPLEMENTED_RUNTIME`, newly exposed in this slice                                   |
| MP-04 execution index             | `InMemoryMp04ExecutionIndex`                 | `IN_MEMORY_ONLY`, routing/index support only                                         |
| MP-04 recovery                    | `recoverActionExecution`                     | `IMPLEMENTED_RUNTIME`, mutation-capable and excluded from reads                      |
| Activity/event sink               | coordinator evidence sink and MP-06 activity | `ACTIVITY_ONLY`, not reconciliation authority                                        |
| Horae query API beyond `get`      | no separate higher-level query was found     | bounded coordinator wrapper is sufficient                                            |

The authoritative source is the accepted Horae durable record returned by
`Mp04HoraePort.get`. Activity records can explain a lifecycle but cannot
substitute for the native persisted reconciliation result.

## Native read contract

The new `Mp04ExecutionReadRequestV1` requires:

```text
durableExecutionId
sourceRequestId
actionIntentDigest
actionIntentIdempotencyKey
optional approvalId
optional expectedNativeActionHash
```

The coordinator returns `Mp04ExecutionResultV1 | undefined`.

- `undefined` means `NO_RECORD`; it is not `ABSENT` and is not `UNKNOWN`.
- A persisted terminal record returns the existing `CONFIRMED` or `ABSENT`
  result vocabulary.
- A persisted `effect_reconciliation_required` record returns `UNKNOWN`.
- A non-terminal persisted record without an accepted result returns
  `RECOVERY_REQUIRED`, using the existing MP-04 result derivation.
- Malformed records and identity mismatches throw `Mp04ExecutionReadError`.
  They are not normalized into an optimistic result.

The read method calls only `horae.get`. It does not call the Ananke execution
port, Horae `execute`, Horae `recover`, or the evidence sink.

## Identity validation

The read boundary validates:

- requested durable execution ID and returned durable execution ID;
- non-empty source request identity against the persisted Horae authority;
- canonical ActionIntent digest format;
- ActionIntent idempotency key recomputed from the supplied source request and
  digest;
- optional approval grant against the persisted authority approval;
- optional native action hash against the persisted native action hash.

The accepted Horae record does not persist the full Moirae canonical digest as
a native evidence field. Therefore the read port does not fabricate that
field. `native-projection.ts` independently verifies the queue work,
host-owned approval binding, source request, canonical digest, and idempotency
key before it asks for the MP-04 result. The read result is then checked again
for durable execution, approval, and native-action identity.

## Missing-record semantics

The implementation distinguishes three cases:

```text
NO_RECORD       → undefined from the native read port
ABSENT          → persisted terminal MP-04/Horae result
UNKNOWN         → persisted effect-reconciliation-required result
```

No record is not proof that an effect was absent. The native projection keeps a
completed queue with no reconciliation result conservative and projects the
existing `BLOCKED / INCONSISTENT_COMPLETION` result rather than inventing
`ABSENT` or `CONFIRMED`.

`BOUNDARY_FAILURE` is part of the accepted MP-04 result vocabulary, but the
current Horae record parser does not persist a distinct boundary-failure
record in the read fixtures. Read corruption, unsupported state, or identity
mismatch remains an explicit `Mp04ExecutionReadError`; it is not silently
normalized to another result.

## Native projection wiring

`createMp08bNativeProjectionSources` now accepts the existing
`Mp04ExecutionCoordinator` through a narrow `readExecution` dependency. It
maps the projection's canonical native request into the coordinator's read
contract. The existing injected reader remains available for isolated unit
fixtures, but the composed path uses the real coordinator read port.

The synthetic host route is unchanged:

```text
GET /mp07/state = SYNTHETIC_LOCAL_DEMO
```

No HTTP route was added. This slice exposes an application/native read seam
only; public hosting and authenticated HTTP exposure remain later deployment
concerns.

## Read-only guarantees

The focused tests use preconstructed durable Horae records and ports whose
execution and recovery methods throw if called. They verify that reads do not:

```text
READ_DOES_NOT_EXECUTE
READ_DOES_NOT_RECOVER
READ_DOES_NOT_RETRY
READ_DOES_NOT_MUTATE_MP04
READ_DOES_NOT_MUTATE_MP06
READ_DOES_NOT_MUTATE_MP05
```

The read path has no write-through cache, repair, evidence emission, queue
transition, claim operation, approval decision, provider invocation, or
reconciliation side effect.

## Result and projection behavior

The local native read smoke covers the existing deterministic result classes:

| Persisted native result                 | Native read         | MP-07 result                                                    |
| --------------------------------------- | ------------------- | --------------------------------------------------------------- |
| `CONFIRMED` + durable MP-06 `COMPLETED` | `CONFIRMED`         | `HANDLED_AUTOMATICALLY`                                         |
| `UNKNOWN`                               | `UNKNOWN`           | existing conservative blocked result                            |
| `RECOVERY_REQUIRED`                     | `RECOVERY_REQUIRED` | existing conservative non-handled result                        |
| `ABSENT`                                | `ABSENT`            | existing `BLOCKED / EFFECT_ABSENT` behavior                     |
| no record                               | `undefined`         | existing `BLOCKED / INCONSISTENT_COMPLETION` for completed work |

The handled row uses only a `LOCAL_DETERMINISTIC_EFFECT_FIXTURE`. It is not a
real SES invocation or external effect.

The existing MP-07 predicate remains unchanged:

```text
durable MP-06 COMPLETED + native MP-04/Horae CONFIRMED
  → HANDLED_AUTOMATICALLY
```

Consequently:

```text
MP06_COMPLETED_WITHOUT_MP04_CONFIRMED != HANDLED_AUTOMATICALLY
MP04_CONFIRMED_WITHOUT_MP06_COMPLETED != HANDLED_AUTOMATICALLY
NO_RECORD != ABSENT_EFFECT
NO_RECORD != CONFIRMED
UNKNOWN != CONFIRMED
RECOVERY_REQUIRED != CONFIRMED
ABSENT != CONFIRMED
SES_MESSAGE_ID != CONFIRMED
ACTIVITY != AUTHORITY
```

## Restart read durability

The focused restart test reconstructs two MP-04 coordinator instances over the
same durable Horae source and reads the same persisted `UNKNOWN` result from
both. The read path does not require rerunning execution or recovery. The
native projection integration uses the same read boundary and therefore does
not depend on an in-memory projection cache.

## Validation scope and external state

This slice performs no AWS, STS, Bedrock, Strands live inference, SES, network,
provider, execution, recovery, retry, or external-effect operation. The SES
adapter remains disabled and `externalEffects = false`.

The factual capability state remains:

```text
liveFates                = true
durableApproval          = true
durableLocalQueue        = true
boundedWorker            = true
hostedDurableQueue        = false
externalEffects          = false
trustedNativeProjection  = true
nativeReconciliationRead = true
```

The new read capability is local/application composition, not hosted
durability, public authentication, or deployment readiness.

## Projection-01 status and next boundary

Projection-01's previous native reconciliation read-port blocker is resolved by
the coordinator wrapper and its real native projection wiring. Projection-01's
historical findings remain unchanged; this document records the current
follow-on state.

The next bounded boundary is:

```text
MP08B_REQUIRES_PROVIDER_02_AWS_SES_SANDBOX_SETUP_AND_LIVE_EFFECT_SMOKE
```

Provider-02 remains separately gated by sender/recipient verification, least-
privilege runtime configuration, one explicit SES write, independent delivery
observation, and Horae evidence. No Provider-02 action is started here.

Current classification:

```text
MOIRAE_MP08B_RECONCILIATION_READ_01_COMPLETE
NATIVE_MP04_RECONCILIATION_READ_READY
MP04_READ_IS_MUTATION_FREE
TRUSTED_NATIVE_MP07_PROJECTION_COMPLETE
PROJECTION_01_READ_PORT_BLOCKER_RESOLVED
NO_FAKE_EFFECT_TRUTH
MP08A_ACCEPTED
MP08B_NOT_DEPLOYED
MP08B_NOT_ACCEPTED
MP09_NOT_ACCEPTED
NO_AWS_CALLS
NO_REAL_EXTERNAL_EFFECT
NO_DEPLOYMENT
NO_PUBLICATION
```

# MP08B EXECUTION-01 — MP-04 / Horae execution and reconciliation boundary

## Scope

This slice crosses exactly the local, side-effect-free execution boundary
identified by Queue-01:

```text
READY_FOR_MP04
  → existing MP-04 execution coordinator
  → accepted Horae-shaped execution/reconciliation port
  → durable MP-06 outcome
  → stop before any real external effect
```

`MP08B_EXECUTION_01 != MP08B_DEPLOYMENT`  
`MP08B_EXECUTION_01 != MP08B_ACCEPTANCE`  
`MP08B_EXECUTION_01 != MP09_ACCEPTANCE`

The focused smoke uses the existing accepted MP-04 coordinator with a
deterministic local effect fixture. It does not claim a real provider effect.

## Starting state and provenance

The candidate starts at Queue-01 commit
`8ef83fbc49c197b3afe3823d4b732f0f37349771` and does not modify that
worktree. The accepted MP-07 baseline remains
`983b785bd68e06d280a5af2898d3b43533688518` with tag
`mp-07-accepted-v1`.

The MP-04 dependency checkpoint remains the existing sealed pair:

- Ananke claim-aware execution profile:
  `ananke-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0`
  at `114063e03332af3389fe805193e88a62111d9323`, tag object
  `9fb9fc4d8183db64aa37f0a4e167fdf41ca856e5`.
- Horae claim-aware execution profile:
  `horae-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0`
  at `aa296b420fbcf578089ca66dc03f6d09d9b06f00`, tag object
  `59763d34644567c59d1041b3acef24efc5a1d072`, runtime ancestor
  `7b24cb0af083e505bd2dc9fa55c6c3387f849131`.
- Adrasteia runtime-contract checkpoint:
  `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`.

The FATES-008A approval runtime remains the native durable approval source.
Its gateway is now configured with the existing durable claim-aware authority
store and exposes only a narrow MP-04 Ananke port. No Fates source is copied
or modified.

## Existing-boundary audit

| Boundary                                | Classification                                                                    | Evidence                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| MP-04 ActionIntent/admission validation | `IMPLEMENTED_RUNTIME`                                                             | `packages/execution-coordinator/src/index.ts`            |
| MP-04 durable authority handoff         | `IMPLEMENTED_RUNTIME`                                                             | accepted Ananke claim-aware API through the host adapter |
| Horae execution/recovery state machine  | `IMPLEMENTED_LIBRARY` / `EXTERNAL_DEPENDENCY_REQUIRED` for hosted materialization | `Mp04HoraePort` and accepted Horae 007A contract         |
| Local effect observation                | `LOCAL_SIDE_EFFECT_FREE_FIXTURE`                                                  | existing MP-04/MP-06 fixture pattern, used only in tests |
| Durable MP-06 outcome                   | `DURABLE_LOCAL`                                                                   | `DurableFilesystemLocalQueue`                            |
| External provider effect                | `MISSING`                                                                         | deliberately not introduced in this slice                |
| MP-07 product projection                | `IMPLEMENTED_RUNTIME`                                                             | existing deterministic MP-07 predicate; no UI redesign   |

## Maximum honest composition

The exercised chain is:

```text
real Fates REQUIRE_APPROVAL
  → durable MP-05 APPROVED
  → durable MP-06 work item
  → bounded worker claim/lease
  → READY_FOR_MP04
  → fresh MP-03 ADMITTED handoff bound to the approved grant
  → existing MP-04 coordinator
  → local deterministic Horae-shaped fixture
  → validated CONFIRMED / ABSENT / UNKNOWN
  → durable MP-06 COMPLETED / EFFECT_ABSENT / RECONCILIATION_REQUIRED
```

`LOCAL_DETERMINISTIC_EFFECT_FIXTURE != REAL_EXTERNAL_EFFECT`.
The fixture receipt is accepted only as evidence for the local reconciliation
machinery. `externalEffects` remains `false`.

The first unavailable hosted boundary is:

```text
FIRST_UNAVAILABLE_EXECUTION_BOUNDARY = REAL_EXTERNAL_EFFECT_PROVIDER
```

A future slice must provide a separately authorized provider and deployment
materialization. It must not infer an external effect from a worker return,
HTTP response, process exit, or local fixture receipt.

## Execution eligibility and identity

Before MP-04 entry, the host now verifies/rereads:

- the delivery is still held by the exact active claim and lease;
- the queue work has an approval ID and decision ID;
- native MP-05 reread is `APPROVED` and has the same decision ID;
- the durable host binding contains the exact ActionIntent and trusted context;
- fresh MP-03 admission is `ADMITTED`, `ALLOW`, has the same approval ID, and
  retains the original MP-03 action hash;
- the injected MP-04 port is the application-side accepted coordinator.

The MP-04 coordinator then validates the exact ActionIntent, authenticated
context, operation, action hash, approval reference, execution adapter, and
trusted time before creating a durable authority handoff. The available
identity set is the existing one: logical work ID, ActionIntent digest,
approval ID, decision ID, scheduling claim ID/generation, MP-04 durable
execution ID, native action hash, authority instance digest, and effect-adapter
identity.

## Reconciliation semantics

The existing MP-04 vocabulary is preserved:

- `CONFIRMED` requires terminal Horae state plus an independently bound
  `CONFIRMED` receipt.
- `ABSENT` requires terminal Horae state plus an independently bound `ABSENT`
  receipt.
- `UNKNOWN` and `RECOVERY_REQUIRED` remain reconciliation states and are
  persisted as MP-06 `RECONCILIATION_REQUIRED`.
- `BOUNDARY_FAILURE` becomes MP-06 `BOUNDARY_BLOCKED`.

An executor-shaped `{ status: "CONFIRMED" }` without the accepted durable
evidence is rejected. An MP-04 exception is treated as reconciliation
required, never as success. The queue does not redispatch during this slice.

The durable local queue persists the MP-04 durable execution ID, approval
reference, and terminal/reconciliation outcome. The MP-04/Horae record itself
is the authority for execution and reconciliation state; queue state is a
projection/reference and not effect truth.

## Implementation

The bounded implementation adds:

- a host method that rereads approved MP-05 state and obtains a fresh exact
  MP-03 `ADMITTED` result;
- a narrow host-side Ananke port over the same verified FATES-008A gateway,
  including the existing durable claim-aware authority store;
- `Mp08bDurableQueueRuntime.executeClaimed`, which validates the active claim,
  invokes an injected accepted MP-04 port, validates reconciliation evidence,
  and persists the corresponding MP-06 outcome/activity;
- focused deterministic tests for all three supported actions, `CONFIRMED`,
  `UNKNOWN`, claim mismatch, approval expiry, and false executor success.

No HTTP route, browser decision contract, MP-05 semantics, MP-06 state-machine
semantics, MP-07 UI, provider SDK, or deployment surface was added.

## Capability state

```text
liveFates          = true
liveStrands        = false in the offline tests
durableApproval    = true
durableLocalQueue  = true
boundedWorker      = true
hostedDurableQueue = false
externalEffects    = false
```

The local execution fixture does not change `externalEffects`. No capability
flag is selected by a mode string.

## Product semantics

The following remain true:

```text
APPROVED != HANDLED_AUTOMATICALLY
QUEUED != HANDLED_AUTOMATICALLY
CLAIMED != HANDLED_AUTOMATICALLY
EXECUTION_ATTEMPTED != HANDLED_AUTOMATICALLY
UNKNOWN != HANDLED_AUTOMATICALLY
ABSENT != HANDLED_AUTOMATICALLY
```

Only the existing MP-07 predicate of durable MP-06 completion plus MP-04
`CONFIRMED` can make an item eligible for `HANDLED_AUTOMATICALLY`. This slice
does not wire a new UI path or claim a hosted product projection.

## Local smoke and validation

`LOCAL_MP04_HORAE_RECONCILIATION_SMOKE` passed with no AWS, model, network, or
external provider calls:

```text
fixture proposal
  → MP-02
  → real Fates REQUIRE_APPROVAL
  → durable MP-05 APPROVE
  → durable MP-06 enqueue and claim
  → MP-04 coordinator
  → local deterministic effect/reconciliation fixture
  → durable queue outcome
```

The focused Execution-01 suite passed 7/7. It covers all three supported
actions, durable `CONFIRMED`, durable `UNKNOWN`, claim mismatch, approval
expiry, and rejection of a false success result. Full canonical validation is
recorded with the candidate commit.

## Preserved boundaries

- `MODEL_OUTPUT_NOT_AUTHORITY`
- `FATES_DECISION_NOT_MODEL_DECISION`
- `BROWSER_STATE_NOT_AUTHORITY`
- `TRUSTED_HOST_CONTEXT_PRESERVED`
- `IAM_NOT_FATES_AUTHORITY`
- `APPROVAL_NOT_EXECUTION`
- `QUEUE_ITEM_NOT_EFFECT`
- `WORKER_CLAIM_NOT_EFFECT_AUTHORITY`
- `EXECUTION_ATTEMPT_NOT_EFFECT`
- `EXECUTOR_RETURN_NOT_EFFECT_TRUTH`
- `UNKNOWN_NOT_CONFIRMED`
- `FAIL_CLOSED_UNKNOWN_STATE`
- `NO_TEST_FALLBACK`
- `SYNTHETIC_NOT_LIVE`

## Remaining MP-08B work

### Implementation

- Provide a separately reviewed real provider/effect adapter, if the hosted
  demo requires a real effect.
- Materialize the accepted Horae runtime and its durable store in the future
  hosted runtime; this slice proves the port and local reconciliation seam but
  does not create hosted infrastructure.

### Deployment

- package the exact accepted runtime and dependency provenance;
- provide hosted durable queue/reconciliation storage where required;
- define workload authentication, ingress, health, cost controls, and
  teardown;
- perform MP-08B deployment only under separate authorization.

### Acceptance evidence

- prove any hosted effect with independent provider observation;
- preserve `UNKNOWN`/`ABSENT` behavior and no-redispatch rules;
- run the separate MP-09 acceptance campaign only after a deployed candidate
  exists.

## Classification

```text
MOIRAE_MP08B_EXECUTION_01_COMPLETE
MP04_EXECUTION_BOUNDARY_READY
HORAE_RECONCILIATION_READY
DURABLE_EXECUTION_RECONCILIATION_PASS
EFFECT_TRUTH_BOUNDARY_PRESERVED
MP08A_ACCEPTED
MP08B_NOT_DEPLOYED
MP08B_NOT_ACCEPTED
MP09_NOT_ACCEPTED
NO_AWS_CALLS
NO_REAL_EXTERNAL_EFFECT
NO_DEPLOYMENT
NO_PUBLICATION
```

## Provider-01 follow-on state

Provider-01 selected `SEND_APPOINTMENT_DETAILS` with a future AWS SES v2
sandbox transport as the least-consequential real-effect candidate. The
repository does not currently contain an SES SDK or another provider transport,
and Provider-01 did not add one, create credentials, or invoke AWS. The
provider request/observation design is recorded in
`docs/MP08B_PROVIDER_01.md`.

The current execution result remains local deterministic fixture evidence only:

`LOCAL_DETERMINISTIC_EFFECT_FIXTURE != REAL_EXTERNAL_EFFECT`

The next boundary is `PROVIDER_DEPENDENCY_AUTHORIZATION`, followed by a
separately authorized one-write Provider-02 smoke. `externalEffects` remains
`false`.

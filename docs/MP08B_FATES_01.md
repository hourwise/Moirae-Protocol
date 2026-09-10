# MP08B FATES-01 — Verified External Fates Runtime Materialization

## Scope and status

`MP08B_FATES_01 != MP08B_DEPLOYMENT`
`MP08B_FATES_01 != MP08B_ACCEPTANCE`
`MP08B_FATES_01 != MP09_ACCEPTANCE`

This slice crosses one boundary only: Moirae MP-03 admission to the exact
accepted Ananke FATES-006B admission runtime. It does not create approvals,
persist queue state, start workers, execute through MP-04/Horae, or invoke an
effect. `FATES_AUTHORITY != AWS_IAM`.

MP-08A remains accepted only for its previously bounded live Strands/Bedrock
characterization. No model inference or AWS call was performed in FATES-01.

## Authoritative provenance

Moirae's committed source of truth is
`docs/evidence/mp-03-fates-dependency-lock.json` and the matching constants in
`packages/fates-adapter/src/index.ts`.

| Field                         | Verified value                                           |
| ----------------------------- | -------------------------------------------------------- |
| Repository                    | `https://github.com/hourwise/Project-Ananke.git`         |
| Local read-only checkout      | `D:\Users\fleur\ananke-fates-006b`                       |
| Local branch                  | `codex/fates-006b-moirae-admin-operation-profile`        |
| HEAD                          | `6bf8902c55c4f3f7593a987582b50783c8a7b5a0`               |
| HEAD tree                     | `b8c0be1170df56471930c689b8e8b6f58fdd29bd`               |
| Accepted tag                  | `ananke-fates-006b-mp03-admission-v0.1.0-protocol-1.4.0` |
| Annotated tag object          | `6425d4b34fba62ab60381a4a2237786d0d6173ad`               |
| Peeled tag target             | `6bf8902c55c4f3f7593a987582b50783c8a7b5a0`               |
| FATES-006A boundary           | `fc318663cbed3072128355fb3697e7f2b47f5f11`               |
| Runtime Contracts / Adrasteia | `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`               |
| License observed              | MIT for Ananke and Runtime Contracts                     |

The accepted checkout was clean, contained the built
`packages/runtime-core/dist` and `packages/audit-engine/dist` artifacts, and
was not modified. Horae, Fates Integration, and later FATES-007/008 material
are not required to prove this MP-03 admission-only boundary and were not
added to the materialization.

## Contract compatibility

The accepted Moirae adapter consumes the exact native shape already used by
the real MP-03 integration tests:

```text
ActionIntentV1
  → createMp03AdmissionAdapter(...)
  → FatesAdmissionGateway.admit(operation, args, { executionContext, now, approvalId })
  → Ananke Gateway.admit(...)
  → validated native admission result
  → MoiraeAdmissionResultV1
```

The FATES-006B runtime exposes the registered Moirae administrative operation
profile and policy configuration used by the accepted adapter. The three
closed operations, native action hashes, context identity, approval-required
states, denial states, boundary failures, and admission-only effect flags are
validated by the existing MP-03 schemas and mapping. No semantic translation
layer or second policy implementation was added.

Result: `FATES_CONTRACT_EXACTLY_COMPATIBLE` for the accepted fixture-bound
MP-03 profile. This is not a claim that FATES-006B is a generalized production
administrative API.

## Runtime classification and materialization

The authoritative implementation is `REAL_ACCEPTED_RUNTIME`: the exact
accepted Ananke FATES-006B checkout supplies a built, executable
`@ananke/runtime-core` admission gateway and audit log. It is usable locally
without AWS, Firecracker, Horae execution, or an external effect.

Inspected mechanisms:

| Mechanism                                               | Classification          | Result                                                                               |
| ------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| Verified external checkout plus built runtime           | `SUPPORTED`             | Selected for this local slice                                                        |
| Published Moirae npm/workspace dependency               | `NOT_AVAILABLE`         | The accepted Ananke packages are private workspace packages, not a Moirae dependency |
| Mutable `file:`, `workspace:`, or branch Git dependency | `PROVENANCE_UNSAFE`     | Not used; it would weaken the accepted sealed boundary                               |
| Unverified subprocess/service transport                 | `NOT_AVAILABLE`         | No accepted Fates service protocol exists for this boundary                          |
| Copied or vendored Fates source                         | `ARCHITECTURALLY_WRONG` | Prohibited; it would create a second authority implementation                        |

The selected mechanism verifies, before importing authority code:

- the exact Project-Ananke origin;
- a clean checkout;
- the exact accepted tag object and peeled commit;
- the exact accepted commit tree;
- the required built runtime files.

The loader then creates a fresh Ananke `Gateway`, registers the accepted
Moirae administrative profile, loads the accepted policy configuration, and
passes only its bound `admit` method into the existing
`FatesAdmissionGateway` adapter.

The root path is a locator, not a live capability switch. Missing, dirty,
wrong, or unbuilt materialization throws a typed boundary error. The code has
no path from failed external verification to `createMp08bTestFatesDependency`.
`REAL_FATES_UNAVAILABLE DOES NOT FALL BACK TO TEST_ADAPTER`.

The local materialization identity is returned as bounded evidence. A future
deployment artifact still needs to replace Git-checkout verification with an
immutable build manifest or equivalent artifact binding; this local slice does
not pretend that deployment packaging gap is solved.

## License and source boundary

Ananke and Runtime Contracts expose MIT license evidence. FATES-01 imports the
external built runtime from its separately maintained checkout for local
validation. No Ananke or Fates source, package directory, generated artifact,
or lockfile was copied into Moirae Protocol. The Fates checkouts remained
read-only.

## Capability semantics

The verified dependency reports:

| Capability           | Value                     | Meaning                                                                                             |
| -------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `liveFates`          | `true`                    | The exact FATES-006B runtime was verified and initialized                                           |
| `liveStrands`        | `false` in FATES-01 tests | No model call was made; a separately supplied real Bedrock agent would remain a separate capability |
| `durableApproval`    | `false`                   | No approval persistence was added                                                                   |
| `hostedDurableQueue` | `false`                   | No MP-06 hosted queue or worker was added                                                           |
| `externalEffects`    | `false`                   | MP-04/Horae and provider effects were not invoked                                                   |

`liveFates = true` therefore does not mean execution, approval, queue
durability, or effect completion.

## Local real-Fates chain

Using deterministic proposal fixtures and no AWS/model call, FATES-01
exercised:

```text
fixture AgentProposalV1
  → strict proposal validation
  → MP-02 deterministic ActionIntent compiler
  → existing MP-03 mapping and integrity checks
  → real Ananke FATES-006B Gateway.admit
  → MoiraeAdmissionResultV1
```

All three accepted actions returned the real policy outcome
`WAITING_FOR_APPROVAL` / native `REQUIRE_APPROVAL`. Hostile proposal prose
claiming `ALLOW` did not change that result. The gateway was used only for
admission; `executorInvoked = false` and `effectExecuted = false` remained
true.

The chain stops at:

```text
WAITING_FOR_APPROVAL → MP05_APPROVAL
```

No approval was created, persisted, submitted, or consumed. The next genuine
unavailable boundary is `DURABLE_MP05_APPROVAL`, together with a real trusted
host-authenticated context for a hosted flow.

### Approval-01 follow-on state

The paragraph above records the boundary at the FATES-01 terminal. It was
resolved in the separately bounded Approval-01 slice by materializing the
accepted FATES-008A durable approval runtime and composing it behind the
existing MP-05 coordinator. Approval-01 adds no Fates source and does not
change the FATES-006B admission semantics recorded here. It stops after a
durable MP-05 APPROVE or REJECT reread, before MP-06 queueing, MP-04/Horae,
workers, or effects. The current next unavailable boundary is
`DURABLE_MP06_QUEUE_AND_WORKER`.

## Preserved boundaries

- `MODEL_OUTPUT_NOT_AUTHORITY`
- `FATES_DECISION_NOT_MODEL_DECISION`
- `IAM_NOT_FATES_AUTHORITY`
- `BROWSER_STATE_NOT_AUTHORITY`
- `APPROVAL_NOT_EXECUTION`
- `ADMITTED_NOT_HANDLED_AUTOMATICALLY`
- `UNKNOWN_INVALID_INCONSISTENT_FAIL_CLOSED`
- `SYNTHETIC_NOT_LIVE`
- `NO_TEST_FALLBACK`

The existing MP-07 projection is not changed. An admission result is not a
product completion result, and `ADMITTED` is not
`HANDLED_AUTOMATICALLY` without the accepted downstream durable execution
truth.

## Files and validation

Implementation files:

- `apps/host/src/fates-runtime.ts` — immutable external checkout verifier and Ananke admission loader;
- `apps/host/src/composition.ts` — exports the verified dependency constructor while retaining the explicit test constructor;
- `tests/mp08b-fates-01-verified-runtime-materialization.test.ts` — identity, three-action real admission, hostile-proposal, and no-fallback tests.

This document records the FATES-01 result. The final validation and commit
identity are recorded in the task evidence/report after the canonical checks.

## Current classification

```text
MOIRAE_MP08B_FATES_01_COMPLETE
VERIFIED_FATES_RUNTIME_MATERIALIZED
REAL_FATES_ADMISSION_PATH_READY
NO_TEST_FALLBACK
FATES_AUTHORITY_BOUNDARY_PRESERVED
MP08A_ACCEPTED
MP08B_NOT_DEPLOYED
MP08B_NOT_ACCEPTED
MP09_NOT_ACCEPTED
NO_AWS_CALLS
NO_DEPLOYMENT
NO_PUBLICATION
```

### Queue-01 follow-on state

The durable approval and local queue follow-on slices are recorded separately.
Queue-01 re-reads native approved MP-05 truth, persists an exact local MP-06
work item, and records a bounded worker claim before stopping at the MP-04
boundary. It does not alter the FATES-006B admission semantics recorded in
this document.

# MP-08B RUNTIME-02 — Hosted Demo Runtime Composition

## 1. Scope and status

This slice identifies and implements the smallest truthful host-side
composition seam available after the reviewed MP-08A characterization.

`MP08B_RUNTIME_02 != MP08B_DEPLOYMENT`

`MP08B_RUNTIME_02 != MP08B_ACCEPTANCE`

`MP08A_ACCEPTED_FOR_ITS_LIVE_CHARACTERIZATION_SCOPE`

No AWS call, Bedrock inference call, Strands live inference call, resource
creation, deployment, IAM mutation, AgentCore operation, or external effect was
performed by RUNTIME-02. The MP-08A evidence remains historical evidence for
its bounded three-call characterization and was not rerun.

The exact starting runtime candidate was the reviewed MP-08A evidence commit
`0c7f8055e807e0dd62735b0c7bf86933ea912dfc`. The existing synthetic local
dashboard remains valid and remains the only runnable server mode in this
slice. RUNTIME-02 adds a reusable composition object for a future trusted host
assembly; it does not relabel the synthetic server as live.

## 2. Discovered composition stages

| Stage                 | Repository boundary                                   | RUNTIME-02 classification                                       | Current truth                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User/request input    | `apps/host/src/server.ts`, existing MP-07 routes      | `SYNTHETIC_ONLY`                                                | The current dashboard server reads synthetic product state and bounded decision input. It has no live request-to-proposal route.                                                                       |
| Strands proposal      | `packages/strands-agent/src/agent.ts`                 | `IMPLEMENTED_LIBRARY_BOUNDARY`                                  | The accepted `AdministrativeAgent`/`invokeAdministrativeAgent` boundary can use the reviewed Strands SDK. RUNTIME-02 injects it; tests use the explicit mock model.                                    |
| Proposal validation   | `packages/strands-agent/src/proposal.ts`              | `IMPLEMENTED_LIBRARY_BOUNDARY`                                  | `AgentProposalV1Schema` is strict and rejects authority-shaped extras. RUNTIME-02 validates again before compilation.                                                                                  |
| ActionIntent compiler | `packages/action-compiler/src/index.ts`               | `IMPLEMENTED_PRODUCTION_BOUNDARY`                               | `compileAgentProposal` remains the only proposal-to-ActionIntent path. It resolves trusted registry material and derives canonical identity.                                                           |
| Fates admission       | `packages/fates-adapter/src/index.ts`                 | `IMPLEMENTED_LIBRARY_BOUNDARY` / `REQUIRES_EXTERNAL_DEPENDENCY` | The MP-03 adapter and `FatesAdmissionGateway` port are implemented. Local tests inject a deterministic gateway. The accepted external Fates runtime is not a workspace/runtime dependency in the host. |
| MP-05 approval        | `packages/human-approval/src/index.ts`                | `IMPLEMENTED_LIBRARY_BOUNDARY`                                  | Accepted coordinator semantics exist, but RUNTIME-02 does not fabricate a durable approval port or call the coordinator without a host-owned native approval store.                                    |
| MP-06 queue/worker    | `packages/background-work/src/index.ts`, `durable.ts` | `IMPLEMENTED_LIBRARY_BOUNDARY`                                  | Local in-memory and filesystem queue/worker contracts exist. No hosted durable state or worker startup graph is connected to `apps/host`.                                                              |
| MP-04/Horae           | `packages/execution-coordinator/src/index.ts`         | `IMPLEMENTED_LIBRARY_BOUNDARY` / `REQUIRES_EXTERNAL_DEPENDENCY` | The coordinator accepts injected Ananke/Horae ports. No hosted effect provider or deployment-safe execution assembly exists in the current host.                                                       |
| MP-07 projection      | `apps/host/src/index.ts`                              | `IMPLEMENTED_PRODUCTION_BOUNDARY`                               | `buildMp07ProductView` maps trusted queue, MP-03, MP-04, and MP-05 observations. RUNTIME-02 never fabricates those observations.                                                                       |
| Host/API              | `apps/host/src/main.ts`, `server.ts`, `demo.ts`       | `SYNTHETIC_ONLY`                                                | `npm run start` launches the explicit `SYNTHETIC_LOCAL_DEMO`. Its `/health`, `/ready`, and MP-07 routes remain unchanged by this slice.                                                                |

## 3. Maximum honest composition

The longest composition that can be executed locally without inventing
authority or making AWS/model calls is:

```text
trusted host request
  → injected Strands proposal source
  → strict AgentProposalV1 validation
  → deterministic MP-02 ActionIntent compilation
  → injected MP-03 FatesAdmissionGateway adapter
  → typed ADMITTED / WAITING_FOR_APPROVAL / REJECTED / BOUNDARY_FAILURE result
```

RUNTIME-02 implements this flow as `Mp08bComposedRuntime` in
`apps/host/src/composition.ts`. The service returns the canonical ActionIntent
and typed MP-03 admission result to its trusted caller. It does not expose
those internal authority-bearing values to the browser.

The local tests use:

```text
mock Strands model
  → real AgentProposalV1 boundary
  → real MP-02 compiler
  → real MP-03 mapping/validation adapter
  → deterministic injected Fates gateway
```

This is a composition test, not live AWS evidence. The mock gateway is marked
`TEST_ADAPTER`; its capability is `liveFates = false`.

### First unavailable boundary

`FIRST_UNAVAILABLE_BOUNDARY = VERIFIED_EXTERNAL_FATES_RUNTIME_MATERIALIZATION`

The repository contains the accepted MP-03 mapping port and test/integration
uses of that port, but the external Fates runtime is not a normal Moirae
workspace dependency and no host startup assembly currently materializes it.
RUNTIME-02 therefore does not construct or label a live Fates dependency.

The following downstream boundaries are also not composed by the current host:

- durable MP-05 approval storage and trusted operator context;
- hosted durable MP-06 queue/activity state and worker lifecycle;
- hosted MP-04/Horae execution and a real effect adapter;
- a live host state provider that can feed those observations into MP-07.

These are genuine future prerequisites, not reasons to fabricate a longer
chain. The current dashboard remains explicitly synthetic.

### FATES-01 follow-on

The historical RUNTIME-02 boundary above was resolved in the separately
bounded FATES-01 slice. The exact accepted Ananke FATES-006B checkout is now
verified and loaded behind the existing `FatesAdmissionGateway`; the test
adapter remains an explicit test-only constructor. This does not rewrite the
RUNTIME-02 finding: it records the boundary that was unavailable at that
terminal.

The current honest chain reaches the real Fates admission result and stops at
`WAITING_FOR_APPROVAL → MP05_APPROVAL`. Durable MP-05 approval persistence and
a trusted host-authenticated context remain unavailable to the hosted
composition. `liveFates = true` does not imply durable approval, hosted queue
state, execution, or external effects.

## 4. Implemented runtime composition

`apps/host/src/composition.ts` adds:

- `createMp08bStrandsProposalSource`, which adapts the accepted Strands agent
  API without moving provider configuration or credentials into HTTP routes;
- `createMp08bTestFatesDependency`, which is intentionally a test-only
  construction of the existing MP-03 adapter and marks its runtime kind
  `TEST_ADAPTER`;
- `createMp08bVerifiedFatesDependency`, which verifies the exact accepted
  external Ananke checkout and initializes its real admission-only gateway;
- `createMp08bComposedRuntime`, whose `compose` method performs proposal
  validation, MP-02 compilation, and MP-03 admission in that order;
- strict failure results for unavailable/malformed proposal, rejected compiler
  input, unavailable admission, and malformed admission boundaries;
- a typed `nextBoundary` observation. It identifies whether a valid admission
  would next require MP-05 approval, MP-04 execution, terminal denial, or
  boundary review. It does not perform any of those operations.

The service accepts `CompilerContextV1`, `Mp03AuthenticatedContext`, and
trusted time from the host boundary. It never accepts a browser-authored
ActionIntent, authority result, approval, execution identity, credential, or
effect receipt.

### Runtime modes and capability derivation

The active server mode remains:

```text
SYNTHETIC_LOCAL_DEMO
```

The composition object exposes an internal `COMPOSED_LOCAL` seam for tests and
future host assembly. It is not an active `npm run start` mode because the
current host cannot honestly supply all required live dependencies.

Capabilities are derived from supplied dependency facts:

| Capability           |                     Test RUNTIME-02 value | Meaning                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `liveStrands`        |                                   `false` | The focused suite uses `createAdministrativeAgentWithModelFactory` and an explicit synthetic model. A configured Bedrock agent would be recognized as a live proposal boundary, but was not invoked here. |
| `liveFates`          | `false` in RUNTIME-02; `true` in FATES-01 | RUNTIME-02 had only `TEST_ADAPTER`; FATES-01 requires successful immutable external FATES-006B verification before reporting `true`.                                                                      |
| `durableApproval`    |                                   `false` | No approval store is supplied.                                                                                                                                                                            |
| `hostedDurableQueue` |                                   `false` | No hosted queue/state adapter is supplied.                                                                                                                                                                |
| `externalEffects`    |                                   `false` | No effect provider is supplied or called.                                                                                                                                                                 |

The mode string cannot turn a capability on. In particular, setting an
environment variable or choosing `COMPOSED_LOCAL` cannot manufacture Fates,
approval, queue, or effect truth.

## 5. Boundary preservation

The composition preserves all of the following:

- `MODEL_OUTPUT_NOT_AUTHORITY`: Strands output is strict semantic proposal
  data only; authority-shaped proposal extras are rejected.
- `BROWSER_STATE_NOT_AUTHORITY`: the composition service is a trusted host
  object and does not consume browser state as protocol truth.
- `FATES_DECISION_NOT_MODEL_DECISION`: only the injected MP-03 adapter returns
  admission status; model text cannot create `ALLOW` or approval.
- `IAM_NOT_FATES_AUTHORITY`: no AWS/IAM capability is used as Protocol
  admission.
- `SYNTHETIC_NOT_LIVE`: test gateways and the existing demo remain labeled
  synthetic; no live capability is inferred from a mode string.
- `FAIL_CLOSED_UNKNOWN_STATE`: malformed proposal, compiler rejection, and
  malformed/unavailable admission do not continue to MP-05, MP-04, MP-06, or
  an effect.
- `APPROVAL_NOT_EXECUTION`: `WAITING_FOR_APPROVAL` reports a future MP-05
  boundary; it does not approve or execute anything.

The existing MP-07 projection remains the only product-category mapping. The
composition service deliberately returns no `productView`, `queue`, or
approval object, because no durable queue/approval observation exists at this
boundary. A future trusted host composition must persist/read native state
first, then call `buildMp07ProductView`; the browser must not assemble it.

## 6. MP-05, MP-06, MP-04, and MP-07 status

### MP-05

The accepted coordinator and exact `HumanDecisionEnvelopeV1` boundary remain
available in the library. RUNTIME-02 does not create a preparation, decision,
expiry, revocation, or consumption record. Durable approval remains
unavailable to this host composition.

### MP-06

The accepted queue/worker contracts remain unchanged. RUNTIME-02 does not
enqueue work, start a worker, schedule retry, claim a lease, or report hosted
durability. A local filesystem queue is not silently promoted to a hosted
durable-state contract.

### MP-04/Horae

The accepted execution coordinator remains unchanged. RUNTIME-02 does not
construct execution authority, call Horae, call a provider, create an effect
identity, or resolve reconciliation.

### MP-07

The current product surface continues to show the four existing categories
from synthetic MP-07 views. RUNTIME-02 can provide a valid admission result to
a future trusted host coordinator, but it does not map admission-only output
to a product category. In particular, `ADMITTED` is not
`HANDLED_AUTOMATICALLY`: that category still requires durable MP-06 completion
and MP-04 `CONFIRMED` truth.

## 7. Health and readiness

No health/readiness semantics were changed.

- `GET /health` remains the accepted synthetic runtime health response.
- `GET /ready` remains `ready: true` only for the synthetic local launcher and
  reports the existing all-false runtime capabilities.
- RUNTIME-02 performs no live probe from `/ready` and does not expose a false
  live readiness claim.
- The composition object is not bound to the default launcher until the
  missing Fates, approval, queue, and host-state prerequisites are separately
  implemented and reviewed.

## 8. Configuration and security

No new configuration or dependency was added. The accepted Strands provider
configuration remains the existing boundary; no AWS credential environment
variables are introduced. Workload credentials must continue to arrive through
normal provider mechanisms in a later deployment and must never cross the
browser or proposal contract.

No model call was performed in RUNTIME-02:

`NO_MODEL_INFERENCE_PERFORMED_IN_RUNTIME_02`

The service uses dependency injection so deterministic tests can exercise the
whole available composition without AWS access. The future live assembly must
provide a verified external Fates dependency separately from the Strands
provider and must not copy Fates implementation into Moirae.

## 9. Honest local flow after RUNTIME-02

The newly implemented local composition flow is:

```text
trusted host request
  → Strands proposal source (mock in tests)
  → AgentProposalV1
  → MP-02 ActionIntent
  → MP-03 adapter with the verified external FATES-006B Gateway
  → typed admission observation
```

The FATES-01 follow-on flow stops at `WAITING_FOR_APPROVAL → MP05_APPROVAL`,
before durable approval, queue/worker scheduling, MP-04/Horae, external
effects, and MP-07 projection. The existing local dashboard flow remains
separately available as `SYNTHETIC_LOCAL_DEMO`.

## 10. Remaining MP-08B prerequisites

### Implementation

- Build a trusted host state/context source that can create compiler and MP-03
  context from authenticated server state rather than browser input.
- Package the verified external Fates runtime with an immutable deployment
  manifest rather than relying on a Git checkout at deployment time.
- Add a host-owned durable MP-05 approval port and operator authentication
  boundary.
- Add hosted durable MP-06 queue/activity state and a bounded worker startup
  lifecycle.
- Assemble accepted MP-04/Horae ports and a demo-safe effect adapter only if
  the intended hosted demonstration requires execution.
- Bind the composed state observations to the existing MP-07 read model only
  after those native states exist.

### AWS configuration

- Reconfirm the previously reviewed AWS/Bedrock access outside this offline
  slice.
- Define workload IAM and secret delivery only after the actual hosted call
  graph is implemented; IAM is not Protocol authority.

### Deployment

- Add the separately authorized hosted launcher, artifact, ingress, health,
  state, and teardown implementation after the runtime graph is complete.

### Acceptance evidence

- Re-run a bounded live Strands characterization only in its separately
  authorized campaign.
- Prove live Fates, approval, queue, worker, execution, and product projection
  with truthful live/synthetic labels.

## 11. Validation and classification

The focused RUNTIME-02 suite exercises all three supported actions through the
injected composition seam, malformed proposals, authority-shaped model text,
clarification, ALLOW, NEEDS HUMAN, DENY, malformed admission, capability
derivation, and the absence of fabricated MP-06/MP-07 state. It performs no
AWS or model calls.

This document does not claim deployment or acceptance. The truthful
RUNTIME-02 classification is:

```text
MOIRAE_MP08B_RUNTIME_02_PARTIAL
LIVE_COMPOSITION_SEAM_READY
BLOCKED_FATES_MATERIALIZATION
NO_FAKE_LIVE_COMPOSITION
SYNTHETIC_LIVE_BOUNDARY_PRESERVED
MP08A_ACCEPTED_FOR_ITS_LIVE_CHARACTERIZATION_SCOPE
MP08B_NOT_DEPLOYED
MP08B_NOT_ACCEPTED
MP09_NOT_ACCEPTED
NO_AWS_INFERENCE
NO_DEPLOYMENT
NO_PUBLICATION
```

# MP-08B Deployment Readiness

## 1. Purpose and scope

This document prepares the smallest truthful MP-08B deployment and acceptance
runbook from the accepted MP-07 repository. It is documentation-only. The
launcher, host/port configuration, health/readiness routes, and runtime
identity described by the later MP08B-RUNTIME-01 slice are reconciled below;
the earlier absence findings in this audit remain historical observations from
before that slice.

`MP08B_DEPLOYMENT_READINESS != MP08B_DEPLOYMENT`

`MP08B_DEPLOYMENT_READINESS != MP08B_ACCEPTANCE`

No AWS resource, hosted URL, container image, deployment manifest, live model
call, live approval flow, or external effect is claimed by this document.

## 2. Current state

| Item                         | Verified state                                                              |
| ---------------------------- | --------------------------------------------------------------------------- |
| Accepted main                | `983b785bd68e06d280a5af2898d3b43533688518`                                  |
| Accepted main tree           | `a9a31a37188d13d144d733a36666c78d8ac1e69f`                                  |
| Acceptance tag               | `mp-07-accepted-v1`                                                         |
| MP-08A                       | Blocked by Anthropic Bedrock model-use-case access; no retry performed here |
| MP-08B                       | Not started                                                                 |
| Hosted URL                   | None                                                                        |
| Hosted MP-05-to-effect claim | None                                                                        |
| AgentCore                    | Not deployed or integrated                                                  |
| AWS activity in this slice   | None                                                                        |

The prior MP-08A evidence records authentication and model discovery as
reconciled for `moirae-dev` in `eu-west-2`, while the exact accepted
`global.anthropic.claude-sonnet-4-6` live characterization remains blocked by
model access. That evidence is inspected read-only; it is not re-run or
extended here.

## 3. Current runnable architecture

### 3.1 Repository and build surfaces

- Root workspace: npm workspaces, Node `>=22.0.0`.
- Build command: `npm run build`, implemented as `tsc -p tsconfig.build.json`.
- Build output: `dist/`, preserving source-relative paths with JavaScript,
  declaration, and source-map output. This is a compiler artifact, not yet a
  runnable deployment bundle.
- Canonical local validation: `npm ci` followed by `npm run check`.
- No Dockerfile, container manifest, IaC, registry configuration, `start`
  script, or immutable artifact digest mechanism exists in the accepted tree.

### 3.2 Strands/Bedrock proposal surface

Source: `packages/strands-agent/src/agent.ts` and
`scripts/mp01-live-smoke.mjs`.

The accepted implementation uses `@strands-agents/sdk@1.16.0`, `Agent`, and
`BedrockModel`. The default model is
`global.anthropic.claude-sonnet-4-6`. The live characterization launcher is
`npm run mp01:live`; it builds first and then runs the three bounded synthetic
fixtures through the accepted Strands path.

This is a bounded proposal-generation command, not a hosted dashboard
launcher. It returns an untrusted `AgentProposalV1`; MP-02 remains the
deterministic ActionIntent boundary. No live call is made by MP-08B
preparation.

### 3.3 Host/dashboard surface

Source paths:

- `apps/host/src/server.ts`
- `apps/host/src/transport.ts`
- `apps/host/src/demo.ts`
- `apps/web/src/index.ts`

The host contains a tested loopback-only Node HTTP server and a dependency-free
inline HTML dashboard. `createMp07LocalDemoServer()` composes the synthetic
demo transport, but no source file calls it and no package script starts it.
`listenMp07LocalServer(server, port = 0)` is a library/test helper that binds
specifically to `127.0.0.1`; it does not read a host or port from configuration.

Actual routes in `apps/host/src/server.ts` are:

| Method/path           | Current behavior                                                                   | Deployment status                                            |
| --------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /`               | Serves the inline `MP07_DASHBOARD_DOCUMENT`                                        | Local-only; no supported launcher                            |
| `GET /index.html`     | Same dashboard document                                                            | Local-only; no supported launcher                            |
| `GET /mp07/state`     | Reads host-provided product views                                                  | Tested local boundary; current demo uses synthetic views     |
| `POST /mp07/decision` | Validates strict `HumanDecisionEnvelopeV1` and delegates to a trusted host binding | Tested local boundary; current demo coordinator is synthetic |
| Other methods         | `405` with `Allow: GET, POST`                                                      | Existing local behavior                                      |
| Unknown paths         | `404`                                                                              | Existing local behavior                                      |

There is no `/health`, `/ready`, callback, webhook, queue-consumer, or
background-worker HTTP endpoint. No authentication is implemented because the
server is deliberately loopback-only and local. It is therefore not
deployment-suitable without a future launcher, binding/configuration, ingress
authentication decision, and health contract.

### 3.4 Product/demo behavior

`apps/host/src/demo.ts` creates four deterministic MP-07 categories, exact
fields for the three supported actions, bounded evidence, and a synthetic
approve/reject transition. Its coordinator returns a synthetic workflow result
and explicitly records that no external effect was performed.

The demo is useful for a judge-facing control-plane demonstration, but it is
not a live MP-05 approval record, live MP-03 admission, live MP-04/Horae
execution, or real effect path. A hosted version of this demo must be labeled
synthetic unless the later implementation wires the accepted runtime surfaces
and evidence together.

### 3.5 Background and durable state

MP-06 provides library-level deterministic worker and filesystem-backed queue
and activity implementations in `packages/background-work`. The accepted tree
does not contain a production process entrypoint that starts a worker,
connects it to the hosted HTTP server, or supplies a cloud durable-state
adapter. The local filesystem backend is not a hosted durability contract.

Restarting the synthetic demo process resets its in-memory views. A deployment
that claims restart-safe MP-05/MP-06 behavior therefore requires a separately
implemented durable state boundary and worker lifecycle.

### 3.6 Fates and effect boundary

MP-03, MP-04, MP-05, and MP-06 are implemented as Protocol-side library
boundaries with injected ports and local/test compositions. They do not appear
as a complete production host startup graph in `apps/host`.

The exact accepted Fates material remains independently governed. The relevant
accepted provenance is recorded in repository evidence and includes Ananke
FATES-007A, Ananke FATES-008A, Horae FATES-007A, the Horae runtime ancestor,
Adrasteia, FATES-007B evidence, and FATES-008H evidence. Those external roots
are not npm workspace dependencies and are not silently bundled by the current
build.

Consequently, the current accepted repository can demonstrate deterministic
and synthetic local control-plane behavior. It cannot honestly claim a hosted
live sequence of proposal → ActionIntent → Fates admission → MP-05 durable
approval → MP-04/Horae effect from the existing dashboard server alone.

## 4. Launcher status at the time of the pre-RUNTIME-01 audit

**Historical classification: ABSENT.**

The repository has:

- a supported `npm run mp01:live` command for bounded Strands/Bedrock
  characterization;
- a tested `createMp07LocalDemoServer()` library helper;
- a tested `listenMp07LocalServer()` library helper;
- no supported command a judge/operator can use to launch the MP-07 dashboard.

The later, separately bounded `MP08B-RUNTIME-01` slice now provides
`npm run start` through `apps/host/src/main.ts`. That launcher is limited to
the synthetic local demo and does not resolve hosted binding, ingress,
authentication, live Fates composition, or durable hosted state.

### 4.1 Integrated current-state reconciliation

On the integrated predeployment candidate, the supported local runtime is:

- `npm run start` → `npm run build` → `node dist/apps/host/src/main.js`;
- loopback default `HOST=127.0.0.1`, `PORT=3000`;
- `GET /health` and `GET /ready` with the fixed
  `SYNTHETIC_LOCAL_DEMO` descriptor;
- all live Strands, live Fates, durable approval, hosted queue, and external
  effect capability flags remain false.

This reconciliation does not resolve any AWS, live Strands, hosted URL, public
HTTPS, authentication, or MP-08B deployment prerequisite.

## 5. Network and configuration audit

### 5.1 Existing configuration names

The only deployment-relevant environment names consumed by accepted runtime
code are in `scripts/mp01-live-smoke.mjs`:

| Name                      | Class                                       | Current use                                                  |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `MOIRAE_STRANDS_PROVIDER` | Non-secret runtime selection                | Selects `bedrock` by default or the testable OpenAI branch   |
| `MOIRAE_STRANDS_MODEL_ID` | Non-secret model selection                  | Optional model override; accepted default remains Sonnet 4.6 |
| `MOIRAE_STRANDS_BASE_URL` | Non-secret/test-only provider configuration | OpenAI branch only; not part of the accepted Bedrock path    |
| `AWS_REGION`              | AWS-derived/non-secret region               | Passed to the Bedrock model configuration when present       |

The AWS SDK/provider chain supplies credentials through normal runtime
mechanisms; no credential values are read or documented here. The earlier
MP-07 local server did not consume `PORT` or `HOST`; the later synthetic
runtime prerequisite now consumes and validates those two names. A state-root
variable, public URL, and authentication configuration remain future hosted
deployment concerns.

### 5.2 Proposed future runtime configuration contract

These are names/classes for a future bounded implementation, not current
configuration and not values:

- `AWS_REGION`: selected Bedrock source region, currently expected to be
  `eu-west-2` only after MP-08A re-verifies it;
- `MOIRAE_STRANDS_PROVIDER`: fixed to `bedrock` for the hosted path;
- `MOIRAE_STRANDS_MODEL_ID`: fixed to the accepted model unless a new explicit
  model decision is approved;
- `PORT`: local synthetic launcher port today; hosted deployment port supplied
  by the runtime platform later;
- a future state-root or durable-store configuration only if the runtime adds a
  real persistent adapter;
- future ingress/auth configuration required for a public decision endpoint.

No secret, credential, provider token, Fates grant, approval record, or raw
authority object belongs in environment documentation or browser-visible
configuration.

### 5.3 Least-privilege IAM proposal

This is a future policy-design starting point, not an applied IAM policy. The
runtime task should receive only the Bedrock runtime invocation permission that
the actual SDK request path proves necessary, constrained to the exact model
or inference-profile resource and selected region. Depending on the SDK call
shape, this is expected to be the invocation family such as
`bedrock:InvokeModel` (and only a streaming variant if the implementation uses
one). The final action must be verified from the deployed SDK path before
acceptance.

The runtime role must not receive:

- `bedrock:PutUseCaseForModelAccess`;
- IAM administration or credential-management permissions;
- Bedrock model-discovery or account-administration permissions unless a
  separately justified preflight requires them;
- Fates policy administration;
- approval, queue, execution, or provider authority through AWS IAM.

Log delivery should use the platform execution/log role with only the bounded
log-stream permissions required by the selected runtime. The application task
role and the log-delivery role should remain separate where the selected AWS
service supports that distinction. Operator-only discovery actions such as
`sts:GetCallerIdentity` are not runtime permissions.

## 6. Deployment shape assessment

### Option A — one bounded Node service

**Recommendation for the first ordinary hosted demo, subject to future
implementation:** one Node 22 service/container behind one HTTPS origin,
serving the existing dashboard and same-origin host API. The current MP-08A
architecture evidence records a single bounded Node service in an ECS Fargate
task behind narrow HTTPS ingress as the leading candidate.

This minimizes CORS, browser trust, and service coordination. It fits the
existing inline dashboard and routes. It is viable for the synthetic local
demo because the reviewed runtime slice now supplies the launcher,
configurable binding, and health/readiness. It still requires hosted
public-ingress controls before deployment.

It is not yet viable for a truthful live MP-05-to-effect claim because the
accepted tree lacks the runtime composition, durable hosted state, worker
startup, and Fates dependency packaging needed for that claim.

### Option B — split static frontend and trusted API

This would separate the inline dashboard from a Node trusted API. It adds
cross-origin or same-origin proxy configuration, authentication/session
coordination, and another deployment surface without solving the missing
runtime composition or durable state. No current repository structure requires
it. It is not the minimum option.

### Option C — AgentCore-centered deployment

AgentCore is not required for the first hosted demo and must not host the
Protocol authority plane merely because it can host an agent runtime. If later
evaluated, it may host or orchestrate the Strands-facing proposal component
only. `AGENTCORE_RUNTIME != FATES_AUTHORITY`, and AgentCore must not replace
MP-02, MP-03, MP-05, MP-06, or MP-04/Horae.

### Recommended minimum

Use Option A as the future implementation target:

```text
single Node 22 service
  ├── same-origin MP-07 dashboard
  ├── same-origin trusted host API
  ├── bounded Strands/Bedrock proposal invocation
  └── explicit Protocol/Fates composition only after its runtime contract exists
          behind one HTTPS ingress
```

For the first deployable demo, the truthful target is a bounded synthetic
product demonstration. A live durable approval/effect demonstration requires
the additional prerequisites in Section 7 and must not be implied by a page
that loads.

## 7. MP-08B implementation prerequisites

| Classification             | Prerequisite                                       | Evidence/reason                                                                 | Affected path                                                                    | Future bounded slice                                                                               |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| REQUIRED_BEFORE_DEPLOYMENT | MP-08A exact live characterization passes          | Current accepted model-use-case access remains blocked                          | MP-08A evidence; `scripts/mp01-live-smoke.mjs`                                   | Re-run the authorized three-call smoke, then independently review it                               |
| REQUIRED_BEFORE_DEPLOYMENT | Supported dashboard launcher                       | No package script or executable entrypoint starts `createMp07LocalDemoServer()` | `apps/host/src/demo.ts`, root `package.json`                                     | Add one bounded Node launcher with explicit startup/close behavior                                 |
| REQUIRED_BEFORE_DEPLOYMENT | Runtime binding configuration                      | Current server is hard-coded to `127.0.0.1` and port `0`                        | `apps/host/src/server.ts`                                                        | Add validated platform host/port binding without widening browser authority                        |
| REQUIRED_BEFORE_DEPLOYMENT | Health/readiness contract                          | No health or readiness endpoint exists                                          | `apps/host/src/server.ts`                                                        | Add bounded health/readiness endpoints and document their semantics                                |
| REQUIRED_BEFORE_DEPLOYMENT | Build-to-runtime artifact binding                  | `dist/` is generated but no deployable artifact identity/digest contract exists | `tsconfig.build.json`, root scripts                                              | Add future artifact capture and startup identity evidence                                          |
| REQUIRED_BEFORE_DEPLOYMENT | Public ingress/auth decision                       | Current loopback server has no public authentication                            | `apps/host/src/server.ts`                                                        | Add a narrowly scoped ingress/auth boundary before public decision access                          |
| REQUIRED_BEFORE_DEPLOYMENT | Truthful runtime composition                       | Current demo transport is synthetic and no host startup composes MP-03/05/06/04 | `apps/host/src/demo.ts`, Protocol packages, tests                                | Add the smallest explicit hosted composition or keep deployment labeled synthetic                  |
| REQUIRED_FOR_ACCEPTANCE    | Hosted durable-state strategy for any live claim   | In-memory demo state resets; local filesystem queue is not hosted persistence   | `apps/host/src/demo.ts`, `packages/background-work/src/durable.ts`               | Add and validate a separately bounded persistence adapter if restart-safe live behavior is claimed |
| REQUIRED_FOR_ACCEPTANCE    | Exact Fates dependency packaging/provenance        | Fates roots are external injected ports, not npm runtime dependencies           | `packages/fates-adapter`, `packages/execution-coordinator`, verification scripts | Define read-only/build-only packaging and exact provenance before live acceptance                  |
| REQUIRED_FOR_ACCEPTANCE    | Graceful shutdown and worker semantics             | No deployment process owns worker lifecycle or shutdown                         | `packages/background-work`, no host launcher                                     | Add bounded startup, shutdown, lease, and recovery behavior                                        |
| REQUIRED_FOR_ACCEPTANCE    | Evidence bundle                                    | Current tree has no deployed identity, URL, health, log, or artifact evidence   | Repository evidence convention                                                   | Capture the Section 10 bundle for the exact deployed candidate                                     |
| OPTIONAL_POST_SUBMISSION   | AgentCore                                          | No AgentCore integration is required for the ordinary demo                      | MP-08A architecture evidence                                                     | Evaluate only after the ordinary hosted demo works                                                 |
| NOT_REQUIRED               | WebMCP, Mnemosyne, Sol/Luna inference, Firecracker | None is required by the accepted local product path                             | Existing boundaries                                                              | Preserve explicit isolation                                                                        |

If the goal is only a synthetic judge demo, the durable Fates/effect rows must
remain visibly deferred rather than being silently simulated as live behavior.

## 8. Build and artifact contract

The future MP-08B candidate must bind:

```text
accepted source SHA/tree
  → clean Node >=22 checkout
  → npm ci
  → npm run check
  → npm run build
  → deployable artifact identity/digest
  → running service identity
  → health/readiness evidence
```

Current facts:

- `npm ci` is the documented clean install;
- `npm run check` covers typecheck, lint, format, tests, and build;
- `npm run build` writes `dist/` with declarations and source maps;
- there is no current container or immutable artifact mechanism;
- the integrated candidate has `npm run start` for the synthetic local demo,
  but no hosted artifact or public launch contract.

The future implementation must record the exact source SHA, tree, build command
result, artifact digest, runtime image/artifact identity, and the service
identity that served the evidence. It must not claim that the generated `dist/`
directory is independently deployable until the launcher and runtime graph are
implemented.

## 9. Startup contract

A future deployed candidate is not “started” merely because a process exists.
Before calling it started, the operator must prove:

1. the exact accepted candidate identity is bound to the built artifact;
2. Node runtime compatibility is satisfied (`>=22`);
3. required non-secret configuration is present and validated;
4. secrets are supplied through the platform/provider chain and never echoed;
5. the trusted host has a real state provider, or the service is explicitly
   labeled synthetic;
6. the listener binds only through the intended ingress path;
7. health and readiness report the actual application state;
8. graceful shutdown does not leave a false approval/effect claim;
9. logs contain no credentials, raw grants, or unnecessary customer data.

## 10. Health, readiness, and same-origin contract

Current routes are listed in Section 3.3. The integrated synthetic local
runtime provides `GET /health` and `GET /ready`. These routes report local
process/runtime readiness only; they do not probe AWS, Bedrock, Fates, hosted
durable state, or live effect composition. A future MP-08B deployment must
extend the contract to report the actual hosted application state and required
Fates composition without relabeling the synthetic runtime as live.

The preferred hosted origin shape is:

```text
HTTPS /
HTTPS /index.html
HTTPS /mp07/state
HTTPS /mp07/decision
HTTPS /health       (future prerequisite)
HTTPS /ready        (future prerequisite)
```

The browser should receive only the bounded MP-07 product state and strict
decision response. It must never receive credentials, Fates grants, raw Horae
records, provider secrets, or unrestricted model output. `POST /mp07/decision`
must continue to call the accepted MP-05 boundary, not MP-04 or a provider
directly.

## 11. Future judge-visible demo path

The minimum hosted demo should show, truthfully and in one origin:

1. the dashboard loads over HTTPS;
2. `Handled automatically`, `Needs you`, `Blocked`, and `Activity` are visible;
3. exact consequential fields are shown before any decision;
4. expandable evidence retains structured native reason/status;
5. an explicit decision reaches the trusted host boundary;
6. the resulting state is reread rather than inferred from the click;
7. blocked and uncertain states remain fail-closed;
8. activity remains observational.

Until a real runtime composition exists, the sequence must be labeled as a
synthetic/local fixture demonstration. It must not be described as live MP-05,
live Fates, live Horae, or a real external effect.

## 12. Observability and evidence contract

Future MP-08B deployment evidence must include, at minimum:

- source commit SHA and tree;
- clean-install and canonical validation results;
- build command and artifact/image digest;
- deployment identity/version;
- public service URL after actual creation;
- selected region and non-secret runtime configuration names;
- UTC startup, health, readiness, and test timestamps;
- exact Strands SDK/model identity when live inference is claimed;
- bounded live request count and structured proposal results;
- Fates provenance and admission evidence where live Fates is claimed;
- MP-05 decision identity and reread evidence where approval is claimed;
- MP-04/Horae execution/reconciliation evidence where effect behavior is claimed;
- screenshots of the four product categories and exact action details;
- bounded runtime logs with credentials, grants, and unnecessary customer data
  excluded;
- secret-scan result and a statement that no credential values were recorded;
- teardown/rollback result.

No evidence field should contain raw AWS credentials, secret values, full
provider error payloads, raw Fates authority objects, or unrestricted model
prose.

## 13. Rollback and cleanup contract

No cleanup is performed by this preparation slice. A future deployment run must
record the exact reverse order and result for:

1. disable public ingress or route traffic away;
2. stop the deployed service/task;
3. stop any separately authorized worker;
4. preserve only the bounded evidence required for review;
5. remove temporary images, tasks, queues, logs, and test state according to
   the authorized resource inventory;
6. verify no recurring job, polling loop, or paid model workload remains;
7. re-read the deployed resource inventory and record zero unexpected
   resources.

The cleanup plan must not delete accepted repository history or Fates evidence.

## 14. MP-08B acceptance gate

The later `MP08B_ACCEPTED` decision must require all of the following relevant
to the chosen scope:

- exact candidate SHA/tree is known and bound to the build;
- clean install, canonical checks, and build pass;
- artifact/image digest and running identity match the evidence;
- public HTTPS ingress responds through the intended boundary;
- dashboard, state, decision, health, and readiness paths behave as specified;
- no secret or authority material is exposed;
- Strands output remains `MODEL OUTPUT != AUTHORITY`;
- MP-02 remains the canonical ActionIntent boundary;
- MP-03/Fates remains independent admission authority;
- MP-05 remains durable approval authority;
- MP-06 remains scheduling/retry/observation authority;
- MP-04/Horae remains execution/effect/reconciliation authority;
- exact approval material is displayed before a decision;
- stale, rejection, blocked, and uncertain behavior fail closed;
- Activity does not become authority;
- synthetic and live evidence are labeled separately;
- if live behavior is claimed, the exact bounded Strands, Fates, MP-05, and
  MP-04 evidence exists;
- bounded logs and cost controls are verified;
- cleanup/rollback completes without unexpected resources.

A page load alone is not an MP-08B acceptance.

## 15. Future failure classifications

Use only after a separately authorized implementation/deployment run:

- `DEPLOYMENT_BLOCKED_BUILD`
- `DEPLOYMENT_BLOCKED_CONFIGURATION`
- `DEPLOYMENT_BLOCKED_AWS`
- `DEPLOYMENT_BLOCKED_RUNTIME_GAP`
- `DEPLOYMENT_STARTED_NOT_ACCEPTED`
- `MP08B_ACCEPTED`

Current classification remains `MP08B_NOT_STARTED`.

## 16. Submission placeholders

The read-only submission-preparation candidate currently contains these pending
placeholders, which this documentation does not resolve:

- `AWS_DEMO_URL_PENDING`
- `MP08B_DEPLOYMENT_PENDING`
- `LIVE_STRANDS_STATUS_PENDING`
- supported local launcher present (`npm run start`); hosted/public launcher and deployment pending
- screenshots pending
- `VIDEO_URL_PENDING`

No submission document was changed.

## 17. MP-09 handoff

The MP-09A offline matrix remains separate and unchanged. Once an actual,
identity-bound MP-08B deployed candidate exists, the following deferred live
categories become executable:

- live Strands/Bedrock proposal behavior and bounded model-injection cases;
- hosted HTTPS/browser/host boundary and secret exposure;
- hosted stale-state, response-loss, and restart behavior;
- live MP-03/Fates admission and MP-05 approval composition;
- MP-06 worker/durable-state behavior in the deployed environment;
- MP-04/Horae reconciliation and effect-once behavior where authorized;
- deployed logging, ingress, IAM, cost, teardown, and external-network failure.

`MP-08B accepted deployed candidate → exact candidate becomes the subject of
final live MP-09 adversarial acceptance.`

## 18. Boundaries preserved

- `MODEL OUTPUT != AUTHORITY`
- `AWS IAM != FATES POLICY AUTHORITY`
- `AWS LOGIN != MOIRAE AUTHORITY`
- `HORAE_NOT_REQUIRED_UNTIL_POST_APPROVAL_EXECUTION`
- `MNEMOSYNE_NOT_REQUIRED_FOR_MP08A`
- `SOL_FRONTEND_LUNA_BACKEND_PRESERVED`
- `WEBMCP_NOT_IMPLEMENTED_IN_MP08A`
- no AgentCore resource or authority path
- no Firecracker lifecycle activity

# MP-03 Fates admission mapping

Implementation status: the bounded adapter described by this preparation record is now implemented
in `packages/fates-adapter/src/index.ts`. See [MP-03 Fates admission adapter](MP-03_FATES_ADMISSION.md)
for the exact accepted dependency, profile, API, and validation evidence.

This document records the original read-only preparation and the resulting narrow adapter decision.
`ActionIntentV1` remains a Moirae contract rather than a Fates-native schema. MP-03 imports no Fates
source and does not modify the inspected checkouts; it consumes the accepted Ananke runtime through
an injected `Gateway.admit(...)` boundary.

Inspection date: **2026-09-03**.

## Exact inspected checkouts

| Runtime                               | Local checkout                             | Repository                                                         | Branch                          | HEAD                                       | Recorded license evidence                                                         |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| Project Adrasteia / Runtime Contracts | `D:\Users\fleur\Project Runtime Contracts` | [Project-Adrasteia](https://github.com/hourwise/Project-Adrasteia) | `release/webmcp-runtime-v0.6.2` | `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210` | Root `LICENSE` observed as MIT                                                    |
| Project Ananke                        | `D:\Users\fleur\Project Ananke`            | [Project-Ananke](https://github.com/hourwise/Project-Ananke)       | `main`                          | `3d76adb162a0ff07b5630700ae30a823f1419cb4` | Root `LICENSE` observed as MIT; package/runtime ownership remains Ananke-specific |

The older Fates Integration provenance record names the Adrasteia stable baseline
`adrasteia-adoption-v0.4.0-protocol-1.4.0` at commit
`124b6aee2629a3147739934ad5f1b45b32c8ba46`, package `project-runtime-contracts@0.4.0`, protocol
version `1.4.0`. That is a recorded baseline, not an assertion that the current local Adrasteia
branch is identical to it.

Both local checkouts were clean at inspection. No Fates source was copied into Moirae Protocol.

## Adrasteia / Runtime Contracts

### Relevant contract names

The inspected package exports descriptive portable contracts including:

- `PrincipalIdentitySchema` and principal kinds;
- `AuthenticatedPrincipalSchema`;
- `ActingAgentPrincipalSchema`;
- `DualPrincipalContextSchema` and `AgentExecutionContextSchema`;
- `ResourceScopeSchema`;
- `CorrelationContextSchema` and portable `References` such as audit/state handles;
- runtime/session/registration and lifecycle representations.

These contracts validate representation. Adrasteia documentation explicitly keeps policy, approval,
and governed execution with Ananke. An identity or schema-valid context is not authority.

### Canonicalization and digest semantics

No Adrasteia-native canonical action or authority digest was identified in the inspected current
public contract surface. Its design-gates documentation leaves canonicalization ownership to
producers and does not define a shared action hash. `ActionIntentV1` therefore must not be presented
as an Adrasteia canonical action, and `canonicalDigest` must not be passed to MP-03 as if it were an
Ananke `actionHash`.

### Principal, caller, resource, and freshness semantics

- Principal objects distinguish human, service, agent, and runtime kinds.
- `AgentExecutionContextSchema` requires an authenticated principal and a distinct acting agent,
  but the schema does not authenticate either value or grant permission.
- `ResourceScopeSchema` represents bounded scope and explicitly rejects wildcard semantics in the
  inspected implementation.
- Correlation/request/action/approval/audit references are portable identifiers; producers own
  generation and runtime meaning.
- Runtime registration/session expiry fields are descriptive in the shared contract; the package
  does not implement authority freshness or approval expiry.

### MP-02 mismatch

Moirae `CompilerContextV1` has one trusted host principal, requester/customer records, appointment
and resource registries, availability, recipients, fixed time context, and evidence references.
Adrasteia expects richer dual-principal/execution-context and resource-scope material for a later
cross-runtime handoff. The missing authenticated workload principal, agent execution context,
tenant/scope, protocol/runtime identity, and correlation envelope must be supplied by the MP-03
adapter or its host. They must not be invented from `AgentProposalV1` or `ActionIntentV1`.

## Ananke

### Relevant request, authority, and outcome contracts

The inspected current Ananke source and documentation expose or use:

- `RiskClass` with values including `READ_ONLY`, `INTERNAL_WRITE`, `EXTERNAL_SEND`, `DELETE`,
  `EXPORT`-like risk domains through registered tool metadata, and `UNKNOWN`;
- `PolicyDecision`: `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `REQUIRE_REFRESH`,
  `REQUIRE_NARROWER_SCOPE`, and `REQUIRE_HUMAN_CLARIFICATION`;
- `OutcomeState`: `COMPLETED`, `FAILED`, `DENIED`, `WAITING_FOR_APPROVAL`, `STALE_STATE`,
  `APPROVAL_INVALIDATED`, and other terminal/partial states;
- `ToolMetadata`, whose registered `toolName`, server, risk class, permissions, retryability, and
  approval requirement are Ananke-owned;
- `ApprovalGrant`, with `id`, `serverName`, `toolName`, `actionHash`, optional `bindingHash`, exact
  `arguments`, `executionContext`, status, requested/approved timestamps, `expiresAt`, and one-use
  state;
- `AuditEvent` and audit event types for policy, approval, execution, and outcome evidence;
- the `Gateway.execute(...)` / HTTP execution boundary and the authority/approval engine.

The relevant Ananke contract is an authenticated tool request routed through the Gateway, not a
generic ActionIntent ingestion endpoint. The special Moirae document-inspection action is a
separate authority-only fixture and must not be assumed to accept these three MP-02 operations.

### Canonicalization and digest semantics

Ananke's inspected `authority-engine` uses a strict JSON-shaped canonicalizer that recursively sorts
object keys, preserves array order, rejects unsupported JavaScript values, and hashes the canonical
payload with SHA-256. Its `hashApprovalAction` covers Ananke-owned server/tool identity, arguments,
execution context, and expiry-related material. Its `hashAuthorizedEffect` and approval-binding
helpers have separate semantics for stable effect identity and authenticated human/session binding.

This is not the same namespace or payload as MP-02's
`moirae-protocol/action-intent/v1\0` digest. MP-03 must recompute the Ananke-native hash after
translation; it must never rename or reuse `ActionIntentV1.canonicalDigest` as `actionHash`.

### Caller and principal binding

- Workload authentication supplies the authenticated execution identity at the Ananke boundary.
- The acting agent is represented by trusted execution-context data such as
  `agentPrincipalId`; an identity declaration is not itself a grant.
- Operator/approver identity is derived from authenticated operator context rather than trusted
  from an approval request body.
- Approval is bound to the exact Ananke server/tool, arguments, execution context, action hash,
  expiry, and—when used—human/session binding.

The MP-02 principal is only `CompilerContextV1.agentPrincipalId`. It is not an authenticated
Ananke workload identity, an operator identity, or an approval grant.

### Freshness, expiry, decisions, and evidence

- `ApprovalGrant` requires bounded freshness fields including `requestedAt` and `expiresAt`, plus
  status and one-use state.
- Ananke policy can return `ALLOW`, `DENY`, or `REQUIRE_APPROVAL` along with refresh, narrower-scope,
  or clarification outcomes.
- The gateway and authority engine return outcome/audit material such as action hashes, approval
  IDs, policy decisions, binding hashes, outcome IDs, and audit references.
- The inspected Moirae authority-only fixture documents a 5-second issued receipt and 10-second
  maximum lifetime for that fixture. MP-03 must verify freshness rules for the actual registered
  operation instead of generalizing this fixture timing.

## MP-02 to MP-03 mismatch summary

| MP-02 `ActionIntentV1`                                                            | Fates-native gap                                                                                             | MP-03 handling                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `action` values for appointment details, reschedule, and contact-directory export | Ananke authorizes registered `serverName`/`toolName` operations, not these internal action names             | Map only to an explicitly verified registered tool contract; otherwise stop                         |
| `resource.resourceId` and action-specific parameters                              | Ananke request identity also includes server, tool, execution context, scope, purpose, and registry metadata | Build a new Ananke request from trusted host/configuration data and exact translated arguments      |
| `principal.agentPrincipalId`                                                      | Ananke separates authenticated workload and acting-agent identities                                          | Obtain both from authenticated/context sources; never infer the authenticated principal from MP-02  |
| `canonicalDigest`                                                                 | Ananke owns its own canonical action/hash semantics                                                          | Recompute Ananke `actionHash`; retain the Moirae digest only as provenance if useful                |
| `sourceRequestId` and MP idempotency key                                          | Ananke has request/correlation and its own replay/approval/effect semantics                                  | Translate correlation deliberately; do not claim the two idempotency schemes are equivalent         |
| `effectClass`                                                                     | MP-02 factual classification is not Ananke `RiskClass` or `PolicyDecision`                                   | Map through verified registry/policy configuration; Ananke decides authority                        |
| `COMPILED`                                                                        | Means only deterministic construction, not permission                                                        | Submit for independent policy/authority evaluation; never skip Ananke because compilation succeeded |
| `evidenceRefs`                                                                    | MP-02 references trusted context snapshots, not Ananke audit/approval evidence                               | Preserve as input provenance and join with returned Ananke evidence                                 |

## Proposed MP-03 adaptation boundary

The safest initial shape is a narrow service/HTTP or package adapter owned by Moirae Protocol that:

1. accepts only a validated `ActionIntentV1` and separately supplied authenticated execution context;
2. validates the intent-to-registered-tool mapping against an exact Ananke contract;
3. constructs Ananke-native tool name, arguments, principal/context, scope, purpose, correlation,
   and freshness material;
4. lets Ananke recompute canonical hashes and make the policy/approval decision;
5. returns a bounded, independently validated authority result and evidence references;
6. keeps all effect execution outside the MP-03 admission adapter.

MP-03 selected a package boundary with injected native Ananke ownership. The exact accepted artifact,
license, authentication binding, freshness, approval, hashing, and decision semantics are recorded
in `docs/evidence/mp-03-fates-dependency-lock.json` and the dedicated MP-03 document.

## Licensing boundary

The local Adrasteia and Ananke checkouts expose MIT license evidence, but exact reuse still requires
pinning the selected artifact and reviewing its dependency/license surface. This document does not
resolve the separate Horae/Mnemosyne licensing question. MP-02 has no Horae or Mnemosyne dependency.

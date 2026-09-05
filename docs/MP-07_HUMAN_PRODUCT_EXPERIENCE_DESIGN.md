# MP-07 — Human Product Experience

**Milestone slice:** MP-07C — Minimal Local Dashboard and Exact Approval Interaction
**Status:** MP-07B is published; MP-07C is a local implementation candidate.
**Branch:** `codex/mp07c-local-dashboard-approval-interaction`
**Source terminal:** `591f630b74205d0bed840aba019d7f5d082d5e9a`
**Accepted MP-06 tree:** `3060ea60f6f56b5f07026ff426477661c1b24057`
**Publication:** MP-07A, MP-07B, and MP-07C are published; MP-07D remains a local
candidate.
**Acceptance:** MP-07 is not accepted; MP-07E is not started.

## 1. Purpose and boundary

MP-07A defines the smallest trustworthy product contract for presenting the
accepted MP-02 through MP-06 protocol state to a human. It does not build a
dashboard, browser route, WebMCP tool, approval widget, notification service,
or deployment surface.

The product must make three operational questions easy to answer:

1. What did the system complete automatically?
2. What needs an explicit human decision?
3. What is blocked, uncertain, expired, rejected, or otherwise unable to
   continue?

The primary product categories are navigation and presentation categories. They
are not replacements for the native protocol state machines. A view may expose a
category such as `NEEDS_YOU` while retaining the exact MP-03, MP-05, and MP-06
statuses and evidence that produced that category.

The authority chain remains:

```text
canonical ActionIntent
  -> current MP-03 admission
  -> MP-06 scheduling/observation
  -> MP-05 durable human approval when required
  -> fresh MP-03 after valid approval
  -> MP-04/Horae execution arbitration
  -> durable effect truth
```

Neither a product category, browser state, activity event, approval reference,
model explanation, nor confidence indicator can skip a step in this chain.

## 2. Accepted runtime audit

MP-07A is grounded in the accepted source terminal, not a proposed replacement
runtime.

| Owner         | Audited contract                                                                                                                                            | Product consequence                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MP-02         | `ActionIntentV1` in `packages/action-contracts/src/index.ts`                                                                                                | Render exact structured action, principal, requester, resource, target, parameters, source request, digest, and idempotency key. Do not reconstruct intent from prose.     |
| MP-03         | `MoiraeAdmissionResultV1` in `packages/fates-adapter/src/index.ts`                                                                                          | Preserve `ADMITTED`, `WAITING_FOR_APPROVAL`, `REJECTED`, and `BOUNDARY_FAILURE`; an old `ADMITTED` observation is not current execution authority.                         |
| MP-04         | `Mp04ExecutionResultV1` in `packages/execution-coordinator/src/index.ts`                                                                                    | Preserve `CONFIRMED`, `ABSENT`, `UNKNOWN`, `RECOVERY_REQUIRED`, and `BOUNDARY_FAILURE`; only MP-04/Horae owns durable effect arbitration and reconciliation.               |
| MP-05         | `ApprovalPresentationV1` and `Mp05HumanApprovalCoordinator` in `packages/human-approval/src/index.ts`                                                       | Show the exact deterministic presentation and transport only a bounded `HumanDecisionEnvelopeV1`; native durable approval and decision truth remain MP-05/FATES-008-owned. |
| MP-06         | `QueueWorkV1`, `QueueApprovalReferenceV1`, `QueueLogicalOutcomeV1`, `ActivityRecordV1`, and `Mp06WorkerResultV1` in `packages/background-work/src/index.ts` | Read queue state, approval correlation, retry/reconciliation outcome, and activity as host-produced observations. None is authority.                                       |
| Durable MP-06 | `DurableFilesystemLocalQueue` and `DurableFilesystemActivitySink` in `packages/background-work/src/durable.ts`                                              | Read durable coordination state through a host adapter. Do not let a browser read or mutate the store directly.                                                            |

The accepted MP-06 product-facing states include `QUEUED`, `AVAILABLE`,
`CLAIMED`, `COMPLETED`, `WAITING_FOR_APPROVAL`, `DENIED`,
`BOUNDARY_BLOCKED`, `TERMINAL_FAILURE`, `RECONCILIATION_REQUIRED`,
`EFFECT_ABSENT`, `RETRY_EXHAUSTED`, and `RETRY_SCHEDULED`, together with the
descriptive activity states `PROCESSING`, `AUTHORITY_CHECKED`,
`LEASE_EXPIRED`, and `CLAIM_RECLAIMED`.

## 3. Host-controlled read model

MP-07B should expose a versioned, host-generated read model. The following is a
contract proposal, not a runtime type in MP-07A.

```ts
type Mp07ProductCategoryV1 = "HANDLED_AUTOMATICALLY" | "NEEDS_YOU" | "BLOCKED" | "ACTIVITY";

type Mp07ProductViewV1 = {
  schemaVersion: "mp07-product-view-v1";
  category: Mp07ProductCategoryV1;
  work: {
    workId: string;
    sourceRequestId: string;
    actionIntentDigest: string;
    actionIntentIdempotencyKey: string;
  };
  action: ExactActionDisplayV1;
  native: {
    queueState?: string;
    queueOutcome?: string;
    mp03Status?: string;
    mp03Decision?: string;
    mp04Status?: string;
    mp05ApprovalStatus?: string;
    reasonCode?: string;
  };
  approval?: ApprovalDisplayV1;
  evidence: ProductEvidenceV1;
  activity: readonly ActivityDisplayV1[];
  freshness: {
    observedAt: string;
    durableVersion?: number;
    refetchRequired?: boolean;
  };
};
```

The concrete MP-07B schema must use strict validation, an explicit schema
version, host-owned serialization, and a durable observation/version token where
the backing adapter provides one. Unknown future fields must not be interpreted
as permission. A client may cache the model for display, but it must revalidate
against a host read before any decision submission or any navigation that could
imply freshness.

### 3.1 Identity and provenance

The model keeps these identities separate:

- `workId` identifies logical queue work;
- `sourceRequestId` identifies the originating request;
- `actionIntentDigest` and `actionIntentIdempotencyKey` identify the canonical
  intent material;
- `approvalId` identifies the native approval request;
- `decisionId` identifies a durable human decision after MP-05 has produced one;
- `durableExecutionId` identifies MP-04 execution truth;
- `claimId` and `generation` identify scheduling ownership only;
- `activityId` identifies descriptive history.

The model must not collapse these into a generic task ID and must not expose a
claim, approval reference, activity record, or prior admission result as a
permission token.

### 3.2 Product evidence

Evidence is progressively disclosed, with concise primary content and an
expandable “why / evidence” region. It may include:

- source request ID, work ID, and canonical ActionIntent digest;
- exact action, operation, principal, requester/customer, tenant/context, target,
  resource, and parameters;
- MP-03 status, decision, admission audit ID, native action hash, evaluation time,
  policy version, purpose, and resource scope when the host contract exposes them;
- MP-05 approval ID, decision ID only when durably present, presentation digest,
  expiry, and approval status;
- MP-04 durable execution ID, status, recovery/reconciliation state, and observed
  time;
- chronological MP-06 activity records and their generation/worker references.

It must not include credentials, provider secrets, raw grants, raw authority
objects, unrestricted model prose, or hidden client-side copies of canonical
authority material.

## 4. Deterministic category mapping

The host adapter derives the category from current durable truth. It must not
derive it from visual confidence, a stale activity event, or a previous browser
view.

| Durable/native observation                                                                                                                               | Primary category        | Product meaning                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| MP-06 `COMPLETED` and accepted MP-04 durable truth `CONFIRMED`                                                                                           | `HANDLED_AUTOMATICALLY` | The requested action completed through the accepted authority and effect boundary.                                        |
| MP-06 `WAITING_FOR_APPROVAL` and current MP-05 state `pending` with a valid deterministic presentation                                                   | `NEEDS_YOU`             | A named human decision is required. The product shows the exact proposed action and expiry without implying approval.     |
| MP-06 `DENIED` or MP-03 `REJECTED`                                                                                                                       | `BLOCKED`               | Policy/admission did not permit continuation; this is not a retry suggestion.                                             |
| MP-06 `BOUNDARY_BLOCKED`, `TERMINAL_FAILURE`, malformed/missing approval, semantic/context mismatch, or invalid presentation                             | `BLOCKED`               | The protocol refused to continue safely; show a precise boundary reason and a bounded recovery instruction if one exists. |
| MP-06 `RECONCILIATION_REQUIRED` or MP-04 `UNKNOWN`/`RECOVERY_REQUIRED`                                                                                   | `BLOCKED`               | The effect truth is unresolved. Explain that the system will not redispatch from uncertainty.                             |
| MP-06 `EFFECT_ABSENT`                                                                                                                                    | `BLOCKED`               | MP-04 durably reports no effect for the prior execution identity; do not imply that a new attempt is authorized.          |
| MP-06 `RETRY_EXHAUSTED`                                                                                                                                  | `BLOCKED`               | Operational retry budget is exhausted; do not present more retries as permission.                                         |
| `QUEUED`, `AVAILABLE`, `CLAIMED`, `PROCESSING`, `AUTHORITY_CHECKED`, `RETRY_SCHEDULED`, `LEASE_EXPIRED`, or `CLAIM_RECLAIMED` without a terminal outcome | `ACTIVITY`              | Work is observable in progress or recovery. The scheduling state is not an authority decision.                            |

`ACTIVITY` is also the chronological view of all records, including completed,
waiting, and blocked work. It is not a fourth authority state. A single record
may therefore be linked from a primary category and the activity timeline.

### 4.1 Mapping rules

1. The host reads current MP-06 coordination state and, where needed, the native
   MP-05 or MP-04 state before mapping.
2. A queue observation of `APPROVED` never maps directly to
   `HANDLED_AUTOMATICALLY`; the approved path must have valid MP-05 recovery and
   MP-04 `CONFIRMED` truth.
3. `WAITING_FOR_APPROVAL` is `NEEDS_YOU` only while the current MP-05 read is a
   valid pending presentation. Expired, revoked, consumed, missing, malformed,
   stale, or semantically mismatched approval is `BLOCKED`.
4. `UNKNOWN` and `RECOVERY_REQUIRED` are visibly uncertain/blocking, never
   “try again” or “probably completed.”
5. A stored prior MP-03 `ADMITTED` result is evidence of a past check only. It
   cannot produce `HANDLED_AUTOMATICALLY` or authorize a new continuation.
6. Activity ordering is informational. It cannot override the durable queue
   outcome or native MP-04/MP-05 truth.

## 5. Exact-action rendering

The primary display must show the exact structured action before a human can
submit a decision. “Approve this task” is not an acceptable replacement for the
action-specific summary.

| Supported action                      | Required visible fields                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEND_APPOINTMENT_DETAILS`            | Action label; acting principal; requester/customer; tenant/context; appointment-details resource; exact email target and verified-requester classification; `bookingId`; exact `recipientAddress`; `templateId`; source request and digest evidence.          |
| `RESCHEDULE_APPOINTMENT`              | Action label; acting principal; requester/customer; tenant/context; appointment-booking resource; customer target; `bookingId`; exact `currentStart`; exact `proposedStart`; exact `timeZone`; source request and digest evidence.                            |
| `TRANSMIT_CUSTOMER_CONTACT_DIRECTORY` | Action label; acting principal; requester/customer; tenant/context; customer-contact-directory resource; exact external email target and classification; `directoryResourceId`; exact `recipientAddress`; `exportFormat`; source request and digest evidence. |

The host must obtain this material from the canonical ActionIntent and the
accepted MP-05 `ApprovalPresentationV1`. The browser cannot submit a modified
copy of the action, parameters, target, principal, requester, tenant, or
resource scope. Long values should be copyable and visually distinguishable
without truncating the exact value in the evidence view.

## 6. “Needs you” and approval interaction

The approval surface is a bounded decision transport, not a permission engine.

Allowed product capabilities:

- read and display the host-produced deterministic presentation;
- show exact action material, expiry, current status, and evidence;
- collect an explicit `APPROVE` or `REJECT` choice;
- submit the strict `HumanDecisionEnvelopeV1` through the trusted host boundary;
- refresh/re-fetch after a stale, conflict, or response-loss result;
- clearly distinguish a disabled/stale choice from an available choice.

The product must not:

- mint `approvalId`, `decisionId`, action hashes, presentation hashes, grants,
  execution IDs, or operator identity;
- alter intent, parameters, target, context, expiry, or policy;
- extend or renew approval expiry;
- turn browser/UI state, activity, model prose, or elapsed time into approval;
- call MP-03, MP-04, Horae, or an effect adapter directly from the browser;
- auto-approve on timeout, refresh, reconnect, or ambiguous response;
- create a second approval ledger or deduplicate native approval outside MP-05.

After submission, the host must return current MP-05 durable truth. A successful
HTTP/UI response is not itself a durable decision; the product should show the
native status and stable `decisionId` only when MP-05 has returned and verified
it.

## 7. Stale, conflict, and response-loss model

The browser is always a potentially stale observer. The model needs explicit
states for:

- presentation expired before submit;
- another actor rejected or approved the request;
- approval revoked or consumed;
- work completed elsewhere;
- activity history lagging the durable outcome;
- an obsolete decision ID or presentation digest;
- double-submit or native conflict;
- response lost after a durable decision;
- reconnect against a newer durable version.

For each case the host re-reads native MP-05/MP-04 truth and returns a typed
result such as `STALE`, `CONFLICT`, `EXPIRED`, `REJECTED`, `BOUNDARY_FAILURE`,
or the current durable outcome. The UI must use explicit language such as
“This request changed; refresh to see the current decision.” It must never say
“approved” because a browser click succeeded, and it must never overwrite
durable truth with cached state.

Refresh is a bounded operation. MP-07B should start with an explicit refresh
action and a bounded host-provided refresh interval only if its UI tests require
it. No `while (pending) sleep` loop, client-side retry storm, or unbounded
approval polling belongs in the product adapter.

## 8. Activity and error language

Activity is a chronological explanation, not an execution input. Display
activity events with observed time and a concise reason, while retaining the
native state and IDs in the evidence disclosure.

Recommended human language:

| Native condition                      | User-facing intent                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DENIED` / `REJECTED`                 | “Blocked by the current policy or admission decision. No effect was run.”                                      |
| `WAITING_FOR_APPROVAL`                | “Needs your decision before it can continue.”                                                                  |
| expired/revoked/consumed approval     | “This approval is no longer valid. No effect was run.”                                                         |
| missing/malformed/invalid approval    | “The approval record could not be verified. Work is blocked for safety.”                                       |
| `UNKNOWN` / `RECONCILIATION_REQUIRED` | “The effect outcome is unresolved. The system will not send it again automatically.”                           |
| `ABSENT` / `EFFECT_ABSENT`            | “The prior execution identity has no confirmed effect. A new attempt requires a separate authorized workflow.” |
| `RETRY_EXHAUSTED`                     | “Operational retries are exhausted. No further automatic retry will occur.”                                    |
| `COMPLETED` with MP-04 `CONFIRMED`    | “Handled automatically; the durable execution boundary confirmed completion.”                                  |

Avoid generic “failed,” “safe,” “trusted,” “probably,” or confidence-score
language where it would hide whether the issue is policy, human approval,
integrity, transport, or unknown effect truth.

## 9. Sol, Luna, browser, and WebMCP boundaries

`SOL_FRONTEND_LUNA_BACKEND_PRESERVED` remains explicit:

- Sol may present structured state, exact action material, explanations, and
  bounded interaction controls.
- Luna may perform allowed internal/backend reasoning, but its output is not a
  queue eligibility, approval, policy, expiry, reconciliation, or effect
  decision.
- Neither model may choose a worker, alter a queue state, mint an approval or
  decision ID, authorize execution, or rewrite a canonical ActionIntent.

Browser trust model:

- browser input is untrusted transport data until accepted by MP-05/FATES-008;
- browser storage, DOM state, URL/query fields, hidden form values, and cached
  JSON are not authority;
- browser code never receives credentials, raw native grants, or provider
  secrets;
- all decision submission is strict, host-authenticated, replay/stale checked,
  and followed by a native durable reread.

The repository currently has no implemented WebMCP surface. Existing references
describe a future judge/presentation surface and the accepted MP-04 dependency
provenance mentions WebMCP runtime contracts, but no MP-07A code should assume a
WebMCP API. If a later slice adds a WebMCP tool, it must be a read/display or
bounded decision transport that composes the same host adapters; it must not
become an authority or effect path. Moirae Console and contest/deployment code
remain outside MP-07A.

## 10. Accessibility, responsive behavior, and demo clarity

MP-07B and later UI slices must treat accessibility and judge readability as
acceptance requirements:

- full keyboard operation, visible focus, logical focus order, and no
  pointer-only approval/rejection path;
- semantic landmarks and headings for the four product concepts;
- accessible names for every action and evidence control;
- status text that does not rely on color alone, with sufficient contrast;
- screen-reader announcements for bounded refresh, stale/conflict results, and
  decision outcome changes;
- visually and verbally distinct `APPROVE` and `REJECT` controls;
- no motion or timing dependency for understanding a state;
- narrow viewport behavior that preserves exact action values and evidence
  expandability without horizontal clipping;
- desktop/judge-demo layout that keeps current status, exact action, and next
  safe step visible without hiding the authority boundary;
- a screen-recording path with stable labels, deterministic sample data, and no
  secret or credential disclosure.

No accessibility or responsive implementation is included in MP-07A.

## 11. Privacy and minimization

The product should expose the minimum structured data required to understand and
decide the action. It must not copy credentials, provider secrets, raw authority
objects, unrestricted model output, or durable state to browser storage. Exact
recipient and parameter values are intentionally visible when they are the
action being approved, but logs and analytics should use bounded identifiers and
avoid duplicating sensitive payloads.

## 12. Smallest implementation approach for MP-07B+

The repository currently contains only placeholder `apps/web` and `apps/host`
entrypoints and no UI framework. The smallest coherent approach is:

1. MP-07B: implement a pure host-side `Mp07ProductViewV1` adapter with strict
   mapping tests and no DOM dependency.
2. MP-07C: add a minimal local browser surface using the repository’s existing
   TypeScript/tooling conventions, with host endpoints/adapters as the only
   source of protocol state.
3. MP-07D: add stale-state, accessibility, refresh, responsive, and
   screen-recording checks without changing protocol authority.
4. MP-07E: independently accept the end-to-end product path against the exact
   published MP-06 terminal and the completed MP-07 slices.

No UI framework, browser package, WebMCP package, notification service, queue,
database, cloud SDK, or approval-provider dependency is justified by MP-07A.

## 13. MP-07A exit criteria and deferred work

MP-07A is ready when this document and its machine-readable evidence are
committed, the accepted MP-06 runtime remains unchanged, package manifests and
lockfile remain unchanged, and the repository checks pass.

Deferred to later bounded slices:

- `MP-07B`: deterministic product read model/presentation adapter;
- `MP-07C`: local dashboard and exact approval presentation;
- `MP-07D`: stale-state, accessibility, responsive, and bounded refresh
  behavior;
- `MP-07E`: independent product acceptance;
- `MP-08`: deployment and hosting.

MP-07A does not claim that the product runtime exists, that approval UI exists,
that WebMCP is integrated, or that MP-07 is accepted.

## 14. MP-07B candidate implementation facts

MP-07B implements the first host-side product runtime slice as a pure
TypeScript adapter at `apps/host/src/index.ts`:

- `buildMp07ProductView(input)` accepts a versioned host-observation boundary
  and returns `Mp07ProductViewV1` (`mp07-product-view-v1`);
- the adapter derives exactly four presentation categories —
  `HANDLED_AUTOMATICALLY`, `NEEDS_YOU`, `BLOCKED`, and `ACTIVITY` — from
  structured queue, MP-03, MP-04, and MP-05 observations;
- `HANDLED_AUTOMATICALLY` requires both durable MP-06 `COMPLETED` and MP-04
  `CONFIRMED`; pending approval requires a valid current MP-05 presentation;
  inconsistent, missing, expired, rejected, revoked, consumed, unknown, and
  reconciliation states remain structured blocked outcomes;
- the output deliberately selects exact action/context fields, bounded activity,
  native status/reason fields, and expandable evidence rather than spreading
  internal Protocol objects;
- ActionIntent identity and MP-05 presentation bindings are verified at the
  adapter boundary using existing Protocol helpers. The adapter does not query
  or mutate MP-02/03/04/05/06, create approval or decision identities, call a
  provider, or invoke Sol/Luna;
- mapping is synchronous, deterministic, side-effect free, network free,
  filesystem free, environment free, and model free. No browser routes, UI,
  WebMCP, or approval transport are included.

The MP-07B tests cover the three supported action shapes, completion and
reconciliation distinctions, approval presentation binding, identity and
semantic mutation rejection, category/activity non-authority, bounded evidence,
unsupported state rejection, and repeatability. MP-07B remains a local
candidate; it is now published at `591f630b74205d0bed840aba019d7f5d082d5e9a`.

## 15. MP-07C candidate implementation facts

MP-07C adds the smallest local product surface over the published MP-07B view
without adding a UI framework or changing Protocol authority:

- `apps/web/src/index.ts` serves a dependency-free semantic HTML/CSS/browser
  document with four prominent concepts: Handled automatically, Needs you,
  Blocked, and Activity. It renders exact fields for all three supported
  actions, expandable bounded evidence, bounded activity, and explicit
  keyboard-operable APPROVE/REJECT controls only for a host-provided pending
  approval view.
- `apps/host/src/transport.ts` defines the versioned local transport. The
  browser may submit only the strict `HumanDecisionEnvelopeV1`; the host
  resolves the trusted MP-05 request, coordinator, and decision context by
  approval reference, invokes `Mp05HumanApprovalCoordinator.submitDecision`,
  and rereads current product state. A lost reread is surfaced as
  `refreshRequired` rather than causing a replacement decision.
- `apps/host/src/server.ts` provides loopback-only `GET /mp07/state`,
  `POST /mp07/decision`, and the dashboard document. It applies bounded JSON
  input, strict content-type handling, no arbitrary-origin CORS, no directory
  traversal, and local security headers.
- The browser derives no category, approval truth, authority, retry, execution,
  or reconciliation state. It uses `textContent` for dynamic values, does not
  use browser storage, and has no Sol/Luna, Fates, Horae, provider, or WebMCP
  dependency.

The MP-07C tests cover strict decision input, direct transport use, response
loss, stale references, loopback serving, exact action fields, accessibility
semantics, and the browser non-authority boundary. MP-07D remains responsible
for deeper stale-state, accessibility, responsive, refresh, compatibility, and
demo hardening. MP-07E remains the independent end-to-end acceptance slice.

## 16. MP-07D candidate implementation facts

MP-07D hardens the published MP-07C local surface without moving any product
truth into the browser:

- `apps/web/src/index.ts` now uses a monotonic request sequence and an
  `AbortController` so an older state response cannot overwrite a newer one.
  Refresh is explicit and bounded; the decision path performs only a bounded
  post-decision reread and never starts an approval polling loop. Response loss,
  host unavailability, stale approval references, and native boundary failure
  receive distinct deterministic status language.
- stale/conflicting native views retain the MP-07B structured reason and expose a
  refresh-required message. The browser never treats a stale card, activity
  record, category, or client clock as authority and never submits a replacement
  decision automatically.
- the document has a skip link, semantic decision group, exact accessible
  labels, busy/status announcements, visible focus, reduced-motion handling,
  long-value wrapping, and responsive layout rules that keep consequential
  action fields visible at narrow widths.
- `apps/host/src/demo.ts` provides a clearly synthetic, dependency-free local
  judge fixture with one item in each product category and all three supported
  actions. Its bounded fake transition is demo/test material only: it performs
  no external effect and is not an approval or execution authority.
- `apps/host/src/server.ts` now waits for the host state read before writing
  success headers, so a host/provider failure returns the bounded 503 state
  error instead of destroying the local response.

MP-07D remains a local candidate. MP-07E owns independent product acceptance;
MP-08 owns deployment. WebMCP, Sol/Luna inference, browser persistence,
unbounded polling, confidence scoring, and generic retry controls remain out of
scope.

The MP-07D validation campaign passed the focused suite (6/6), MP-07B and MP-07C
regressions, the MP-06 focused regression, the exact real-Fates targeted suites,
and the full real-Fates suite (281/281, zero skips). The offline comparison passed
265 tests with 16 expected Fates guards. The repository's existing dependency
installation command was attempted but stalled in the managed environment before
completion; existing installed dependencies were not treated as clean-install
evidence. MP-07E must independently reassess clean-install reproducibility.

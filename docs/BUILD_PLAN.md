# Moirae Protocol Build Plan

This plan is the implementation contract after MP-00. Each slice is bounded, independently
verifiable, and ordered so the highest-risk trust boundaries are exercised before product polish.
No slice may silently widen the authority path.

## Build preferences for the current project

- **Mode:** Autonomous execution of the confirmed slices, with evidence reported at each boundary.
- **Git cadence:** One meaningful commit per slice or coherent documentation milestone; no tiny commit
  series and no release tag before submission readiness.
- **Verification:** Every slice ends with explicit checks and a classification of synthetic,
  integration, or live evidence.
- **Implementation language:** TypeScript unless MP-01 finds a material Strands compatibility issue.

## Dependency order and critical path

```text
MP-00 -> MP-01 -> MP-02 -> MP-03 -> MP-04 -> MP-05 -> MP-06 -> MP-07 -> MP-08 -> MP-09 -> MP-10 -> MP-11
                 |           |           |           |
                 |           |           |           +--> human approval is required before consequential execution
                 |           |           +--------------> authority must precede any effect
                 |           +--------------------------> canonical intent must precede admission
                 +--------------------------------------> real Strands proposal must precede compiler integration
```

Critical path: **MP-01 → MP-02 → MP-03 → MP-04 → MP-05 → MP-06 → MP-08**. MP-07 improves the
human experience, but it must not be allowed to hide a missing authority or effect proof. MP-09–11
are release and submission gates.

## Slice checklist

### MP-00 — Bootstrap, eligibility seal, architecture, and plan — this slice

- **Entry:** Empty target directory; no existing repository or inherited history.
- **Build:** Create the independent Apache-2.0 TypeScript workspace, toolchain, CI baseline, README,
  eligibility/provenance record, architecture, invariants, threat model, decisions, diagram source,
  and this build plan.
- **Exit:** Local Git history begins with MP-00; all required docs exist; only placeholders are in
  implementation packages; Fates inspection is read-only and recorded.
- **Tests:** `npm ci`; typecheck; lint; format check; placeholder tests; build; manual diff/provenance
  audit.
- **Forbidden:** MP-01 implementation; model calls; final ActionIntent schema; Fates authority;
  credentials; browser approval; queues; effect adapters; remote repository creation if credentials
  or target existence are uncertain.

### MP-01 — Real Strands capability spike

- **Entry:** MP-00 checks pass; a verified Strands SDK/runtime choice is available.
- **Build:** A Strands agent accepts natural-language administrative requests and emits a bounded,
  explicitly untrusted structured proposal. Keep the proposal transport separate from any effect path.
- **Exit:** Three synthetic request classes can be represented as proposals; no proposal can call a
  real connector; raw model output is rejected when malformed.
- **Tests:** Synthetic model-output shape tests; malformed output; prompt-injection attempts;
  credential/authority-field rejection; no-effect call counter.
- **Forbidden:** Fates authority, real external effects, production approval, final canonical schema,
  autonomous queue.

### MP-02 — Deterministic Action Compiler

- **Status:** Accepted — deterministic compiler implemented and validated offline; live provider
  characterization is not applicable to this slice; MP-03 remains pending.
- **Entry:** MP-01 produces a bounded untrusted proposal; exact domain vocabulary has been chosen.
- **Build:** Validate and canonicalise proposals into versioned ActionIntent objects. Implement
  deterministic identity/resource resolution, date/time rules, target checks, parameter normalisation,
  duplicate detection, evidence references, expiry, and digest/idempotency material.
- **Exit:** Equivalent valid proposals produce identical canonical output; ambiguous, unknown, stale,
  or malformed input fails closed.
- **Tests:** Deterministic unit; schema/property; canonicalisation stability; unknown target/resource;
  date/time timezone; digest mutation; replay material.
- **Forbidden:** Policy authority, approval UI, real effect calls, Fates field invention.

### MP-03 — Fates admission

- **Entry:** MP-02 canonical ActionIntent is stable and the chosen Fates checkpoint/public surface
  has been verified read-only with exact provenance.
- **Build:** Add a narrow adapter from canonical ActionIntent to verified authority requests. Demonstrate
  `ALLOW`, `REQUIRES_APPROVAL`, and `DENY` outcomes without executing effects.
- **Exit:** Authority is independent of model confidence; unavailable or malformed Fates evidence
  fails closed; DENY has zero effect calls.
- **Tests:** Synthetic adapter tests; integration tests against the selected checkpoint; malformed and
  unavailable authority; outcome mapping; zero-call DENY.
- **Status:** Accepted as a bounded fixture profile; acceptance evidence is offline and targets the
  exact accepted Ananke dependency.
- **Forbidden:** Copying Fates implementation; bypassing Ananke; treating UI, memory, or Strands as
  fallback authority; effect execution; generalizing the accepted fixture without a new profile.

### MP-04 — Governed effect execution

- **Entry:** MP-03 proves authority outcomes and exact binding material.
- **Status:** Protocol-side durable governed execution coordinator independently accepted and sealed
  as `moirae-protocol-mp04-durable-governed-execution-v0.1.0` against the exact Ananke/Horae pair.
- **Build:** Coordinate the accepted MP-03 admission, native Ananke authority construction, Horae
  durable intent/claim, claim-aware Ananke execution, and native receipt/reconciliation. Require a
  single canonical ActionIntent and explicit authority for each effect attempt.
- **Exit:** ADMITTED can produce one bounded synthetic receipt; non-admitted outcomes produce none;
  duplicate/replayed delivery does not multiply effects; UNKNOWN blocks redispatch; failures are
  recorded without widening permission.
- **Tests:** Replay/idempotency; claim and context tampering; effect-call counting; receipt binding;
  UNKNOWN restart/reconciliation; ABSENT; persistent UNKNOWN; three-action MP-01 → MP-04 offline
  integration evidence.
- **Forbidden:** Unbounded connectors; credential injection; implicit retries that re-use authority;
  treating a receipt as a new authority.

### MP-05 — Human approval

- **Status:** MP-05I implementation candidate — not yet accepted; no product UI, provider, or
  external effect is included.
- **Entry:** MP-03 can produce approval-required work and MP-04 can enforce exact binding. MP-05D
  design is ready and the bounded Ananke human-decision extension is accepted as
  `ananke-fates-008a-durable-human-approval-v0.1.0-protocol-1.4.0`.
- **Build:** Implement an opaque human decision workflow. Display the exact principal, action,
  resource, target, parameters, expiry, and evidence needed for judgment. A positive decision creates
  or obtains fresh execution authority.
- **Exit:** Approval for one exact intent cannot authorise a mutated intent, stale intent, different
  target, or different principal; the browser only presents/collects a decision.
- **Tests:** Human approval binding; parameter mutation; stale authority; rejection; double-submit;
  browser authority non-minting; fresh-authority assertions.
- **Forbidden:** Generic “approve this task” grants; browser-minted authority; hidden parameter
  changes; approval by model output or memory.

**MP-05D historical readiness note:** At design time, the accepted Ananke ordinary approval engine
was process-local and required a durable, independently authenticated human decision record. FATES-008
has since supplied and independently sealed that bounded capability. Current status:
`MP-05 DESIGN READY — FATES-008 DEPENDENCY ACCEPTED`; MP-05 implementation remains not started.
Horae remains `HORAE_NOT_REQUIRED_UNTIL_POST_APPROVAL_EXECUTION`; Mnemosyne remains excluded.

**MP-05I current implementation note:** The fixture-bound runtime candidate now supplies a
deterministic structured presentation, strict browser decision envelope, trusted-host decision
port, native FATES-008 APPROVE/REJECT composition, fresh MP-03 re-admission, and composition into
the existing MP-04 coordinator. It remains `MP-05_NOT_ACCEPTED` until independent acceptance.

### MP-06 — Background work loop

- **Entry:** MP-04 and MP-05 enforce bounded execution and exact approval binding.
- **Build:** Add an actual queue/worker loop. Route ALLOW silently, surface approval-required work,
  and record DENY without effect. Make worker claims and retries observable.
- **Exit:** Queue behavior is deterministic enough to demonstrate no multiply-applied effect and no
  auto-approval of consequential work.
- **Tests:** Queue integration; worker concurrency; replay; crash/retry; approval timeout; DENY zero
  calls; activity record consistency.
- **Forbidden:** Background authority invention; bypassing the compiler or Fates; unbounded polling;
  treating queue ownership as permission.

### MP-07 — Human product experience

- **Entry:** MP-06 produces stable outcome records.
- **Build:** Create the dashboard concepts: Handled automatically, Needs you, Blocked, and Activity.
  Keep technical evidence expandable so trust details are available without dominating the primary
  workflow.
- **Exit:** A user can distinguish completed, awaiting judgment, and blocked work; the UI never
  changes the canonical intent or creates authority.
- **Tests:** UI/component tests; accessibility checks; exact-action rendering; browser non-authority;
  outcome refresh and stale-state handling.
- **Forbidden:** Visual confidence scores as permission; hidden action parameters; client-side secret
  storage; client-side policy decisions.

### MP-08 — AWS deployment

- **Entry:** A working local end-to-end demo exists with evidence from MP-01–MP-07.
- **Build:** Deploy the working demo on AWS first. Then evaluate Amazon Bedrock AgentCore as an
  optional enhancement, documenting what changes and what remains host/Fates authority.
- **Exit:** Live demo works as depicted and remains bounded; AgentCore is either integrated with
  evidence or explicitly deferred without harming the MVP.
- **Tests:** Live smoke; deployment checks; secret boundary; failure/unavailability; cost/usage
  sanity; optional AgentCore integration test.
- **Forbidden:** Sacrificing the working product to force AgentCore; production security claims;
  placing authority in the model runtime.

### MP-09 — Adversarial review

- **Entry:** Local or live product path is working and evidence is available.
- **Build:** Attack the new Moirae Protocol boundaries: prompt injection, forged proposals,
  destination substitution, approval confusion, replay, concurrency, stale authority, and context
  poisoning.
- **Exit:** Findings are fixed or explicitly documented with a bounded limitation and no unsafe
  claim; the review focuses on new MP boundaries.
- **Tests:** Full adversarial suite with synthetic, integration, and live labels.
- **Forbidden:** Re-opening all historical Fates work without a concrete integration finding;
  silently weakening invariants to make a test pass.

### MP-10 — Release candidate

- **Entry:** Adversarial findings are resolved or documented.
- **Build:** Validate from a clean checkout; audit dependencies, secrets, provenance, README,
  architecture export, demo instructions, and license. Capture final test and live-smoke evidence.
- **Exit:** A fresh checkout builds and runs the intended demo; repository is clean; submission
  materials are truthful and reproducible.
- **Tests:** Clean-checkout; npm ci; typecheck; lint; format; unit; integration; live smoke; secret
  scan; architecture rendering review.
- **Forbidden:** Unreviewed generated artifacts; release tags; unsupported security claims; last-minute
  scope expansion.

### MP-11 — Submission

- **Entry:** MP-10 release candidate and verified public repository.
- **Build:** Record the five-minute video, problem/audience/why-it-matters pitch, screenshots, repo
  link, architecture diagram, testing notes, and Devpost fields. Submit with buffer before the
  official deadline.
- **Exit:** Devpost submission is complete and verified live; any AgentCore/Builder Center bonus is
  truthful and clearly separated from the core MVP.
- **Tests:** Judge-style clean-checkout run; video duration and playback; public repo access; final
  submission field review; live demo smoke.
- **Forbidden:** Claiming pre-existing Fates work as new; omitting incorporated work; submitting
  private or unverified code; representing MP-00 as a completed agent.

## Future test categories

Later acceptance reports must distinguish **synthetic tests**, **integration tests**, and **live
tests**. The planned categories are:

1. deterministic unit tests;
2. schema and property tests;
3. canonicalisation stability;
4. replay and idempotency;
5. concurrency;
6. authority-binding mutation tests;
7. malformed model output;
8. prompt-injection attempts;
9. unknown targets and resources;
10. unavailable Fates;
11. malformed Fates evidence;
12. effect-call counting;
13. human approval binding;
14. clean-checkout tests; and
15. live end-to-end smoke.

# Moirae Protocol Architecture

## Selected product option

MP-00 selects **Option A: Professional Operations Steward** for the Professional Agents track.

The target user is a sole trader, consultant, contractor, or small professional business losing
time to repetitive administrative work. The agent should handle routine work in the background,
surface consequential work for a human decision, and refuse forbidden work without producing an
effect. The user experience is intentionally organized around three outcomes: handled automatically,
needs you, and blocked.

MP-00 freezes the boundary and vocabulary below. It does not implement the flows.

## Trust-preserving flow

```text
Incoming work
    |
    v
Strands Agent
  understands language, gathers context, drafts, proposes
    |
    v
UNTRUSTED PROPOSED ACTION
    |
    v
Deterministic Action Compiler
  validates, resolves, canonicalises, classifies, and creates evidence material
    |
    v
Canonical ActionIntent
    |
    v
The Fates
  Adrasteia: contracts / representation
  Ananke: authority / policy
  Horae: governed dispatch / effect coordination
  Mnemosyne: optional trusted and provenanced context
    |
    +----------------------+----------------------+
    |                      |                      |
  ALLOW          REQUIRES_APPROVAL              DENY
    |                      |                      |
    |                human decision              |
    |                      |                      |
    +----------------------+                      |
                           v                      v
                 bounded effect adapter       NO EFFECT
                           |
                           v
                     EffectReceipt
```

The critical invariant is: **Strands must never be an authority source.** The model may propose
what should happen, but it must not determine whether the real-world effect is authorised.

## MP-01 Strands boundary

MP-01 implements the first arrow only with the real `@strands-agents/sdk@1.16.0` TypeScript SDK:

```text
Administrative language
        |
        v
Real Strands Agent with Zod structured output
        |
        v
UNTRUSTED AgentProposalV1
        |
        v
STOP
```

`AgentProposalV1` contains semantic claims such as a request category, human wording for a subject,
an unparsed temporal expression, a recipient reference, a summary, ambiguity, and unresolved
fields. It contains no authority, approval, credential, resolved identity, execution, effect, or
receipt field. Strict schema validation rejects fields outside this contract. In particular:

> **AgentProposalV1 != ActionIntent**

The adapter does not call Fates, Horae, Mnemosyne, or any effect adapter. A fresh Strands Agent and
conversation are created per logical invocation. The default MP-01 test harness uses a synthetic
model that emits the real SDK structured-output stream shape; that model is test-only and is not
live inference evidence.

## MP-02 deterministic compiler boundary

MP-02 adds a pure compiler between the untrusted proposal and any future authority adapter:

```text
UNTRUSTED AgentProposalV1
        + trusted CompilerContextV1
        |
        v
Moirae Protocol Action Compiler
  strict validation
  registry resolution
  explicit en-GB / Europe-London time rules
  canonicalization v1
  digest and source-scoped idempotency
        |
        +--> COMPILED → ActionIntentV1
        +--> NEEDS_CLARIFICATION → bounded reason
        +--> REJECTED → structural/impossible compilation reason
```

`CompilerContextV1` is the source of trusted requester, principal, registry, availability,
recipient, timestamp, locale, timezone, and evidence-reference material. The compiler never accepts
`bookingId`, resource identity, principal identity, or verified recipient identity from proposal
prose. It resolves those values only through the supplied context and registries.

`ActionIntentV1` is a Moirae Protocol canonical contract, not an Adrasteia or Fates-native schema.
It is exact action material but remains unauthorised. MP-02 does not call an LLM, Strands, Ananke,
Horae, or Mnemosyne; it does not execute effects or make `ALLOW`, `REQUIRE_APPROVAL`, or `DENY`
decisions. A `COMPILED` result means only that Moirae Protocol safely constructed deterministic
action material.

### AgentProposalV1 to ActionIntentV1 mapping

The compiler does not copy proposal fields into trusted action material. It resolves each semantic
claim against the explicit `CompilerContextV1` and either emits a bounded exact value or returns
`NEEDS_CLARIFICATION`:

| Untrusted proposal field | Deterministic compiler treatment                                                                                                                                                                | ActionIntentV1 consequence                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `subjectReference`       | Match only the supported semantic phrase, then resolve it through the trusted requester, appointment, and resource registries.                                                                  | Resolved booking/resource identity, or `subject_not_found` / `subject_not_unique`.                                    |
| `temporalExpression`     | Accept the supported `Monday afternoon` expression only, calculate the next Monday from the trusted appointment date in London, and filter the trusted availability snapshot.                   | Exact trusted slot timestamp, or `temporal_expression_ambiguous`, `no_available_slot`, or `multiple_available_slots`. |
| `recipientReference`     | For appointment details, ignore proposal redirection and use the verified requester contact. For an explicit export target, validate the exact email syntax and classify it from trusted facts. | Exact target address/classification; no classification is an authorization decision.                                  |
| `requestedChange`        | Use only as semantic input to select the action-specific deterministic branch; it is not an identity or command source.                                                                         | Typed parameters derived from trusted records and supported expressions.                                              |
| `summary`                | Preserve no summary text in the compiled action core. It is explanatory model prose and is never parsed for authority or IDs.                                                                   | No ActionIntent field, digest material, authority, or execution capability.                                           |
| `confidenceOrAmbiguity`  | Treat the label/note as an input signal only. It cannot override registry results or grant permission.                                                                                          | May motivate a clarification path; never changes principal, authority, or effect access.                              |
| `unresolvedFields`       | Treat the list as a signal about missing semantic interpretation, not as trusted facts or resolution instructions.                                                                              | Does not supply IDs, dates, recipients, credentials, authority, or execution material.                                |

The compiler's trusted `sourceRequestId`, `agentPrincipalId`, requester/customer identity,
timestamps, registry entries, and evidence references originate in host-supplied context. Therefore
`ActionIntentV1` is deterministic action material only:

> **AgentProposalV1 != ActionIntentV1, and ActionIntentV1 != authority.**

## Responsibility matrix

| Boundary / owner                   | Responsibilities                                                                                                                                                                                                           | Explicit non-responsibilities                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Strands / LLM                      | Natural-language understanding; semantic classification; context gathering; drafting prose; proposing actions                                                                                                              | Authority, approval, credentials, target validation, canonical identity, effect execution |
| Deterministic Moirae Protocol code | Schema validation; identity and resource resolution; date/time calculations; parameter normalisation; target validation; duplicate detection; canonical ActionIntent generation; deterministic digest/idempotency material | Policy authority, human judgment, secret storage, direct external effects                 |
| The Fates / Ananke                 | Policy and authority decision                                                                                                                                                                                              | Natural-language interpretation and direct model trust                                    |
| Human                              | Consequential judgment when policy requires it                                                                                                                                                                             | Minting authority in the browser or approving a different action than the one shown       |
| Horae                              | Bounded execution coordination; replay/idempotency/effect handling where suitable                                                                                                                                          | Policy ownership, model trust, credential ownership                                       |
| Mnemosyne                          | Optional future admitted/provenanced context                                                                                                                                                                               | Permission, authority, approval, or access broadening                                     |
| Effect adapters                    | Perform only explicitly authorised bounded effects; return effect receipts                                                                                                                                                 | Reinterpreting policy, accepting model-supplied authority, widening target scope          |
| Host                               | Secret custody, connector isolation, process boundary, final effect call                                                                                                                                                   | Treating UI, prompt text, memory, or model output as authority                            |

## Trust boundaries

| Boundary                      | Crossing data                                  | Required posture                                                                    |
| ----------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| External request to Strands   | Human text, untrusted content, context         | Interpret only; prompt injection cannot create authority                            |
| Strands to compiler           | Structured proposal                            | Treat as hostile input; validate every field and ignore authority-like claims       |
| Compiler to Fates             | Canonical ActionIntent and evidence references | Only compiler-generated canonical material is eligible for admission                |
| Fates to human                | Policy outcome and exact action binding        | Approval must bind to the exact principal, action, resource, target, and parameters |
| Fates/Horae to effect adapter | Fresh, bounded execution authority             | One canonical intent, fail closed on stale/malformed/unavailable authority          |
| Host to external connector    | Secrets and effect call                        | Secrets stay host-side; adapter cannot broaden scope                                |

## ActionIntent proposal — documentation only

The following is a **Moirae Protocol design proposal**, not an implemented schema and not a claim
of compatibility with any Fates field names. The final shape belongs in a later contract slice after
the exact Fates public surfaces are independently verified.

```text
ActionIntent v?
  schemaVersion
  actionIntentId
  principal
  action
  resource
  target
  effectClass
  proposedParameters
  evidenceRefs
  createdAt
  expiresAt
  idempotencyKey
  canonicalDigest
```

Unresolved questions:

- What are the canonical principal and resource identifiers for the professional-admin domain?
- Is `effectClass` a Moirae classification, an Ananke vocabulary, or an adapter-owned mapping?
- Which parameters are safe to retain in evidence, and which require redaction?
- How should timezone and locale be represented so date calculations are deterministic?
- What exact digest encoding, field ordering, and versioning rules are needed?
- What is the minimum authority request Ananke actually accepts at the chosen verified checkpoint?
- Does Horae provide an existing bounded dispatch or receipt boundary that can be adapted without
  importing its implementation?
- Which fields must be opaque identifiers versus human-readable display values?
- What expiry rules apply before approval, after approval, and during a retry?

Until these questions are resolved, no final TypeScript interface, Zod schema, or wire compatibility
claim should be added.

## MVP and stretch boundaries

### MP-03 implemented admission boundary

MP-03 now inserts a strict adapter between the MP-02 `ActionIntentV1` and the accepted Ananke
runtime:

```text
ActionIntentV1 + independently authenticated native context + explicit now
        |
        v
exact fixture-bound Moirae → Fates mapping
        |
        v
accepted Ananke Gateway.admit(...)
        |
        v
native hash + policy/approval evaluation + ADMISSION_EVALUATED
        |
        v
validated MP-03 authority result → STOP
```

The adapter preserves MP-02 `canonicalDigest` and `idempotencyKey` as Moirae evidence only. The
Ananke action hash is recomputed by Ananke. `ADMITTED` is not execution, and all result variants
carry `executorInvoked=false` and `effectExecuted=false`. The current profile is intentionally
fixed to the synthetic MP-02 fixture; it is not a generalized production API.

### MP-04D durable execution design boundary

MP-04D is a design/readiness slice only. The proposed next boundary is:

```text
validated MP-03 ADMITTED result
        + independently authenticated Fates context
        + exact native action/approval material
        |
        v
Horae durable execution claim bound to the complete Fates material
        |
        v
claim-aware Ananke execution choke point
        |
        v
future bounded effect receipt/reconciliation
        |
        v
CONFIRMED | ABSENT | UNKNOWN → explicit recovery
```

The inspected Horae candidate provides useful durable dispatch and recovery primitives but is
`NEEDS_BOUNDED_EXTENSION`: its current public binding does not include the complete native Ananke
action/approval/context envelope or a claim-aware Fates handoff. Ananke remains the owner of
admission, approval validity, and approval consumption; Horae owns durable claim arbitration; the
effect boundary owns effect truth. MP-04D adds no runtime integration, effects, providers, or
Mnemosyne dependency. See `docs/MP-04_DURABLE_EXECUTION_DESIGN.md` for the crash matrix and proposed
envelope.

Future user-facing work must use Sol as the visible frontend, interaction, demo, and judge model.
Luna may remain a hidden backend/internal reasoning model. Neither model may bypass the deterministic
Moirae compiler, independent Fates authentication, Ananke governance, or Horae's single dispatch
choke point.

### MVP critical path

1. Strands receives an administrative request and returns a bounded proposal.
2. New Moirae Protocol deterministic compiler creates a canonical, validated ActionIntent.
3. Adrasteia is used only through a verified adapter boundary for portable representation, if the
   chosen checkpoint remains appropriate.
4. Ananke makes the independent policy/authority decision: allow, approval required, or deny.
5. Horae coordinates the bounded dispatch/effect accounting boundary.
6. A host-side adapter performs only the explicitly authorised effect and emits a receipt.

### Stretch work

- Mnemosyne for optional admitted and provenanced context; never authority.
- Amazon Bedrock AgentCore deployment, evaluated after a reliable working demo exists.
- Rich dashboard, activity history, live deployment, and submission bonus materials.

The system must remain useful if either stretch component is deferred.

## MP-00 exclusions

There are no real routine, consequential, or forbidden effects in this slice. MP-03 performs native
Fates admission only; it has no effect adapter or execution path. There are no Horae or Mnemosyne
implementation dependencies, browser approvals, credentials, background queues, or production
security claims. MP-01 proposals still stop at the MP-02 deterministic compiler; MP-03 separately
asks accepted Fates what it would permit, then stops. The remaining placeholders exist only to make
future execution and context work explicit.

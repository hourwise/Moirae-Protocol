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

There are no real routine, consequential, or forbidden flows in this slice. There are no Fates
authority calls, effect adapters, browser approvals, credentials, background queues, or production
security claims. The placeholders exist only to make the future workspace and checks explicit.

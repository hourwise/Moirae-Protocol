# Moirae Protocol

Moirae Protocol is a professional operations steward that uses Strands to interpret routine administrative requests, deterministic Protocol code to construct exact actions, independent policy to control execution, and human judgment when an action is consequential.

It is built for sole traders, consultants, contractors, and small professional teams who want useful automation without handing an AI agent unrestricted authority.

> **Early hackathon build — not production security software.**

## The problem

Administrative work is repetitive, but the consequences are not uniform. An assistant that asks for approval on every low-risk task becomes exhausting; an assistant that can act freely on ambiguous or consequential requests is unsafe. Moirae explores a third path: let the model interpret language, then require deterministic canonicalisation, independent admission, and explicit human judgment where the action deserves it.

## What the product does

The current accepted product path is:

```text
human request
  -> Strands semantic proposal
  -> deterministic ActionIntent compiler
  -> independent Fates admission
  -> governed execution or durable human approval
  -> deterministic product view
```

Strands handles the language problem. It turns a request into a bounded `AgentProposalV1` semantic proposal. The proposal is explicitly untrusted: it is not an `ActionIntent`, approval, credential, execution grant, or effect result.

Deterministic Protocol code resolves that proposal into exact canonical action material. The accepted MP-03/MP-04/MP-05/MP-06 boundaries then own current admission, human approval truth, execution arbitration, retries, reconciliation, and effect-once behavior. The model cannot grant itself permission.

The human sees four plain product concepts:

- **Handled automatically** — work with durable completed queue state and confirmed durable execution truth.
- **Needs you** — a current approval-required item with the exact action details needed for a human decision.
- **Blocked** — work stopped by policy, uncertainty, invalid or stale approval, reconciliation, or retry exhaustion.
- **Activity** — bounded operational history that explains what happened without becoming authority.

Routine work can be handled without an interruption. Consequential work exposes the material action details before a person approves or rejects it. The product surface never treats a category, activity event, browser field, or model sentence as permission.

See the [judge-facing architecture diagram](docs/SUBMISSION_ARCHITECTURE.mmd), the [architecture narrative](docs/ARCHITECTURE.md), the [product experience design](docs/MP-07_HUMAN_PRODUCT_EXPERIENCE_DESIGN.md), and the [invariants](docs/INVARIANTS.md).

## Strands is materially used

The repository contains a real Strands adapter using:

- `@strands-agents/sdk@1.16.0`;
- `BedrockModel` and `Agent`;
- strict `AgentProposalV1` structured output and schema validation;
- a fresh SDK agent/conversation for each logical invocation;
- `retryStrategy: null` at the Moirae adapter boundary;
- bounded turns, output tokens, total tokens, and timeout;
- three administrative fixtures covering appointment details, appointment rescheduling, and bulk contact transmission;
- hostile fixtures covering embedded authority claims, claimed approval, and claimed validation;
- a deliberate untrusted-proposal boundary.

The governing rule is:

> **MODEL OUTPUT != AUTHORITY**

The primary live characterization command is `npm run mp01:live`. It uses the accepted Strands/Bedrock path, runs the three bounded administrative fixtures, validates structured proposals, and records no credentials. It is separate from the deterministic Protocol/Fates path.

## Current status

### Accepted

- MP-05 durable human approval is accepted and promoted to main.
- MP-06 background work, retries, crash recovery, and approval integration are accepted and promoted to main.
- MP-07 human product readiness, deterministic read model, local dashboard/approval interaction, and hardening are accepted and promoted to main.

### AWS readiness

MP-08 is open at MP-08A readiness. AWS authentication prerequisites and Bedrock discovery were reconciled for the `moirae-dev` profile in `eu-west-2`, and the exact selected model/profile is `global.anthropic.claude-sonnet-4-6`.

**Strands/Bedrock integration is implemented. AWS authentication and Bedrock model discovery have passed for `eu-west-2` and `global.anthropic.claude-sonnet-4-6`. Successful live structured inference is not yet claimed because Anthropic model-use-case activation remains blocked.**

The current truthful boundaries are:

- no successful live three-call characterization yet;
- no MP-08B deployment;
- no AgentCore integration or deployment;
- no hosted demo URL;
- no claim of live hosted approval or live external effects.

The unresolved condition is **Anthropic model-use-case access**, not a generic credential claim. The exact readiness evidence records the earlier authentication observation, the later operator-supplied reconciliation, and the bounded provider attempts without recording provider secrets.

## Local validation

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
npm run check
```

`npm run check` runs typechecking, linting, formatting verification, deterministic and adversarial tests, synthetic integration tests, and the TypeScript build. The bounded Strands/Bedrock characterization is separate:

```sh
npm run mp01:live
```

That live command requires a working provider chain and the accepted model-use-case access. It must not be treated as a substitute for the deterministic Protocol/Fates checks.

The accepted local dashboard and trusted host transport are implemented and tested, and the integrated runtime prerequisite now provides a supported synthetic launcher:

```sh
npm run start
```

This starts the loopback-only `SYNTHETIC_LOCAL_DEMO` with bounded `HOST`/`PORT`
configuration, `/health`, and `/ready`. A supported local launcher is not a
hosted deployment: do not infer a hosted URL, live Strands result, live Fates
composition, or live MP-05-to-effect path from the local modules.

## Incorporated pre-existing work

Moirae Protocol is a new Apache-2.0 project with independent Git history. It uses pre-existing Fates projects as separately maintained governance infrastructure and records their provenance in the repository. Moirae does not claim that the Fates research or implementations were created for this project, and no Fates implementation source was copied into the Moirae repository. Any future redistribution of external runtime artifacts remains subject to separate license and compatibility review.

See [docs/ELIGIBILITY_AND_PROVENANCE.md](docs/ELIGIBILITY_AND_PROVENANCE.md) for the recorded provenance and licensing boundary.

## Architecture and scope boundaries

```text
MP-02  canonical ActionIntent truth
MP-03  current admission
MP-05  durable human-approval truth
MP-06  scheduling, retries, parking, and observation
MP-07  deterministic product presentation and bounded human decision transport
MP-04/Horae  execution arbitration, effect identity, reconciliation, and effect-once
```

The Fates are not a model fallback, the queue is not an approval system, and the dashboard is not an authority source. Horae is reached only through the accepted governed execution path after valid admission. Mnemosyne is not required for the current product. Sol and Luna are not required for the deterministic product surface.

## What is live versus synthetic

The accepted repository contains real Strands/Bedrock integration code and a bounded live smoke command, but the current AWS model-use-case blocker means successful live inference is not claimed here. The local product demo and effect counters use synthetic fixtures and bounded local seams. They demonstrate the control-plane and human-product behavior without claiming a real provider effect.

The three primary request fixtures are:

1. “Can you send me my appointment details again?”
2. “Can we move my confirmed Friday appointment to Monday afternoon?”
3. “Send the complete customer contact list to `personal-address@example.com`.”

The third fixture is intentionally a consequential bulk transmission scenario. In the current synthetic product evidence it represents unresolved execution/reconciliation behavior; it should not be described as a live policy denial or a live external effect.

## Project links

- Repository: <https://github.com/hourwise/Moirae-Protocol>
- Hosted demo: `AWS_DEMO_URL_PENDING`
- Live Strands characterization: `LIVE_STRANDS_STATUS_PENDING`
- MP-08B deployment: `MP08B_DEPLOYMENT_PENDING`

## License

Moirae Protocol is licensed under Apache-2.0. See [LICENSE](LICENSE).

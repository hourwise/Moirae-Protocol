# Moirae Protocol — Submission Draft

This is a local drafting document. Nothing in it has been published to Devpost, Builder, AWS, or any other external service.

## Project name

Moirae Protocol

## One-line description

A professional operations steward where Strands interprets requests, deterministic Protocol code constructs exact actions, independent policy controls execution, and humans decide consequential work.

## Elevator pitch

Most AI assistants force a bad choice: interrupt a person for everything or give the model too much authority. Moirae Protocol separates interpretation from permission. Strands turns natural-language administrative requests into bounded, untrusted semantic proposals. Deterministic Protocol code compiles those proposals into exact action material. Independent Fates policy controls admission, MP-05 owns durable human approval, MP-04/Horae governs execution, and MP-07 gives a person a clear view of what was handled, what needs them, what is blocked, and what happened.

## Problem

Sole traders, consultants, contractors, and small professional teams spend time on repetitive operations such as appointment administration and contact handling. These tasks are not equally safe to automate: sending a known appointment detail is different from rescheduling a booking or transmitting a customer directory. A language model is useful for understanding the request, but it should not decide whether an exact real-world action is authorised.

## What it does

Moirae Protocol makes the boundary visible and testable:

- Strands produces an `AgentProposalV1` semantic proposal.
- The deterministic compiler constructs exact canonical `ActionIntent` material.
- Current admission, durable approval, execution, retries, reconciliation, and effect-once behavior remain separate Protocol boundaries.
- The product surface presents four categories: **Handled automatically**, **Needs you**, **Blocked**, and **Activity**.
- Consequential approval views show exact material such as booking, recipient, template, time, timezone, directory resource, export format, target, and principal before a human decision.
- The browser sends only a bounded decision envelope to the trusted host; it cannot author an action, approval, execution identity, or effect result.

## Why this matters

The design treats human judgment as a precise control boundary rather than a generic confirmation dialog. A person can understand the exact action before approving it, while routine work remains eligible for bounded automation. Policy, approval, retry, and effect truth are not inferred from model wording or browser state.

## How we used AI

Moirae uses the Strands Agents SDK as a real semantic-proposal layer:

- `@strands-agents/sdk@1.16.0`;
- `BedrockModel` and `Agent`;
- strict `AgentProposalV1` structured output;
- fresh agent/conversation per logical request;
- bounded turns, token limits, timeout, and no SDK retry strategy at the Moirae adapter boundary;
- three administrative fixtures plus hostile authority/injection fixtures.

The model is asked to interpret language and preserve ambiguity. It is not asked to approve, grant authority, resolve trusted identities, mint execution material, or call an effect. `MODEL OUTPUT != AUTHORITY` is enforced by the architecture and tests.

The exact selected Bedrock model/profile is `global.anthropic.claude-sonnet-4-6` in `eu-west-2`, but Anthropic model-use-case activation currently blocks a successful live three-call characterization. The live claim is therefore explicitly pending rather than implied.

## How we used Codex

Codex was used as a collaborative engineering agent across bounded protocol slices: inspecting the existing repository, implementing and testing deterministic contracts, reviewing authority boundaries, exercising crash/retry/approval behavior, checking real-Fates integration, and preparing this documentation candidate. The workflow kept implementation, independent validation, publication, acceptance, and promotion as separate operations. This document records only claims supported by the repository and the current readiness evidence.

## Key features

1. **Untrusted semantic proposal boundary** — Strands output is schema-validated and cannot become authority by itself.
2. **Deterministic action construction** — canonical intent, identity, exact parameters, and context are handled by Protocol code.
3. **Independent admission and execution** — Fates admission and MP-04/Horae execution remain outside the model.
4. **Durable human approval** — consequential work can require an exact human decision through the accepted MP-05 boundary.
5. **Background work coordination** — MP-06 owns scheduling, leases, retries, parking, recovery, and observation without becoming approval authority.
6. **Human product surface** — MP-07 presents handled, needs-you, blocked, and activity states with expandable technical evidence.
7. **Synthetic judge fixture** — the local demo provides bounded examples without claiming real provider effects or hosted durability.

## Architecture

```text
request -> Strands/Bedrock -> untrusted AgentProposalV1
        -> deterministic ActionIntent compiler
        -> Fates admission
        -> ALLOW / NEEDS HUMAN / DENY-BLOCK
        -> MP-05 approval where required
        -> MP-04/Horae governed execution
        -> MP-06 background state
        -> MP-07 deterministic product view
```

Judge-facing source: [docs/SUBMISSION_ARCHITECTURE.mmd](SUBMISSION_ARCHITECTURE.mmd).

Authority ownership remains explicit:

| Boundary                         | Owner       | Not owned by the model/browser            |
| -------------------------------- | ----------- | ----------------------------------------- |
| Canonical action truth           | MP-02       | no model-generated ActionIntent authority |
| Current admission                | MP-03/Fates | no queue or category authority            |
| Human approval truth             | MP-05       | no approval from activity or UI state     |
| Scheduling and retry observation | MP-06       | no worker-claim permission                |
| Execution and effect-once        | MP-04/Horae | no browser/provider shortcut              |
| Product presentation             | MP-07       | no product category as authority          |

## Testing instructions

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
npm run check
```

The repository check covers typechecking, lint, format verification, tests, and the TypeScript build. The accepted Strands path has a separate bounded live command:

```sh
npm run mp01:live
```

That command requires the normal AWS credential-provider chain and accepted Anthropic model-use-case access. It runs the three synthetic administrative fixtures and records no credentials. At the time of this draft, the command is not evidence of successful live inference because model-use-case activation remains blocked.

The accepted local dashboard and host transport are implemented and tested, but there is no single supported dashboard launcher in the current repository. **Local dashboard launcher to be added in the deployment implementation slice.** No hosted URL is claimed.

## Public demo link

`AWS_DEMO_URL_PENDING`

No AWS deployment has been completed.

## Public repository link

<https://github.com/hourwise/Moirae-Protocol>

## Demo video

### Five-minute structure

1. **0:00–0:30 — Problem:** explain the cost of either constant interruption or unsafe autonomous authority.
2. **0:30–1:10 — Product:** show the four categories and the principle “Model proposes; deterministic Protocol and Fates decide.”
3. **1:10–2:00 — Routine path:** show the appointment-details fixture and the handled-automatically outcome.
4. **2:00–3:10 — Consequential path:** show the exact reschedule or contact-directory fields, expand evidence, and explain that the current local approval interaction is synthetic/demo-bound rather than a hosted live effect.
5. **3:10–4:05 — Safety path:** show blocked or uncertain work, including why MP-04 UNKNOWN is not treated as permission to retry.
6. **4:05–4:35 — Strands and architecture:** briefly show the SDK, structured proposal, compiler, and independent admission boundary.
7. **4:35–5:00 — Honest status:** state that live Anthropic model-use-case activation and MP-08B hosting remain pending; do not imply deployment.

Video URL: `VIDEO_URL_PENDING`

## Screenshot shot list

Capture three to five screenshots after the local demo is runnable:

1. Dashboard overview showing Handled automatically, Needs you, Blocked, and Activity.
2. Needs You card showing exact consequential fields before a decision.
3. Expanded evidence panel with bounded identifiers and native reason/status.
4. Blocked or reconciliation-required state with truthful reason language.
5. Architecture diagram or a side-by-side proposal-to-Protocol boundary view.

Do not capture credentials, account identifiers that are not needed, provider errors, private Fates material, or hidden environment values.

## Challenges

- Keeping a useful model experience separate from deterministic authority.
- Preserving exact action and context binding through approval and recovery.
- Making queue, approval, execution, and product categories observable without letting any observation become permission.
- Recording real Strands/Bedrock integration honestly while live model-use-case access is still unresolved.

## What we learned

- A structured model output is still only a proposal; schema validity does not make it authoritative.
- Exact consequential fields matter more than a generic “approve this task” prompt.
- Stale browser state, queue state, approval references, and activity history need separate treatment.
- A truthful demo must distinguish synthetic control-plane evidence from live provider and hosted runtime evidence.

## Accomplishments

- Built and validated a real Strands semantic-proposal adapter.
- Built deterministic ActionIntent, admission, approval, execution, background-work, and product-view boundaries.
- Added a local human product surface with explicit approval interaction and bounded stale-state behavior.
- Preserved pre-existing Fates attribution and separated its authority from Moirae’s integration code.
- Completed formal MP-06 and MP-07 acceptance and promotion while keeping MP-08 deployment separately bounded.

## What’s next

1. Resolve Anthropic model-use-case access without changing the accepted model or IAM boundary.
2. Re-run the exact bounded three-call Strands/Bedrock characterization using `moirae-dev`, `eu-west-2`, and `global.anthropic.claude-sonnet-4-6`.
3. Independently review that live result.
4. Only then authorize MP-08B, the smallest ordinary AWS-hosted working demo.
5. Evaluate AgentCore only after the ordinary hosted demo works; current recommendation is **NOT_WORTH_RISK** while that prerequisite is incomplete.

## Built with

- TypeScript and Node.js 22+
- npm workspaces
- `@strands-agents/sdk@1.16.0`
- Amazon Bedrock model adapter (selected model: `global.anthropic.claude-sonnet-4-6`; live access pending)
- Zod structured validation
- Vitest, TypeScript, ESLint, and Prettier
- Pre-existing Fates governance infrastructure used through bounded interfaces and recorded provenance

## Incorporated / pre-existing work disclosure

Moirae Protocol is a new Apache-2.0 project with independent Git history. It uses pre-existing Fates projects as separately maintained governance infrastructure and records their provenance in the repository. Moirae does not claim that the Fates research or implementations were created for this project, and no Fates implementation source was copied into the Moirae repository. Any future redistribution of external runtime artifacts remains subject to separate license and compatibility review.

## Professional Agents track paragraph

Moirae Protocol is built for professional operators who need AI assistance without surrendering control of consequential work. Strands provides the language interface: it interprets routine administrative requests and produces a bounded, untrusted structured proposal. The product then moves through deterministic Protocol boundaries that construct exact action material, consult independent policy, require durable human approval when appropriate, coordinate background work, and govern execution. The result is a professional operations steward rather than an autonomous agent with an opaque permission model. A person can see what was handled automatically, what needs their judgment, what is blocked, and what happened over time. The current product and control-plane evidence is local and synthetic where provider effects are concerned; hosted deployment and successful live Bedrock characterization remain explicitly pending.

## Builder.aws draft

Moirae Protocol is a governed professional-operations demo for AWS-hosted agent workflows. The intended deployment keeps a bounded Node host/API and dashboard behind one HTTPS origin, invokes Strands through Amazon Bedrock, and retains deterministic Protocol/Fates boundaries outside the model runtime. The initial hosted demo should use synthetic effects and bounded traffic. AgentCore is evaluated as an optional later host for the Strands-facing runtime only; it does not replace Fates admission, MP-05 approval, MP-04/Horae execution, or MP-06 scheduling. This is a proposal for the next deployment slice, not a claim that the AWS demo is already live.

## Submission readiness notes

- Repository URL is known and public.
- MP-07 product and architecture claims are accepted and promoted.
- Strands implementation details are visible in source and evidence.
- Current README now distinguishes live-capable code from successful live inference.
- AWS demo URL, live Strands result, video URL, and screenshots remain pending.
- The local dashboard needs a supported launcher before a judge can run it without repository knowledge.
- No Devpost, Builder, AWS, or other external publication has been performed by this documentation candidate.

## Known limitations

- Anthropic model-use-case activation currently blocks successful live structured inference.
- The local product demo uses synthetic bounded fixtures and does not claim a live hosted MP-05-to-effect path.
- No MP-08B deployment or hosted URL exists.
- No AgentCore resource or integration exists.
- The current repository does not provide a single dashboard launcher.
- External Fates licensing and compatibility considerations remain separately recorded and require review before redistribution of runtime artifacts.

## TODO Official Form Fields

- Final official hackathon field names and limits: verify against the event form before entry.
- Public demo URL: `AWS_DEMO_URL_PENDING`.
- Demo video URL: `VIDEO_URL_PENDING`.
- Screenshots: capture after the local demo launcher is available.
- Live Strands status: `LIVE_STRANDS_STATUS_PENDING` until the exact three-call smoke succeeds.
- MP-08B deployment status: `MP08B_DEPLOYMENT_PENDING`.

# Hackathon Requirements

This document records the working requirements for the AWS / Devpost **Agents for Humans
Hackathon** as checked against the official Devpost pages on **2026-09-03**. Event details can
change; re-check the official rules immediately before submission.

Sources: [event overview](https://agentsforhumans.devpost.com/),
[official rules](https://agentsforhumans.devpost.com/rules),
[official dates](https://agentsforhumans.devpost.com/details/dates), and
[official FAQs](https://agentsforhumans.devpost.com/details/faqs).

## Purpose and fit

The event asks entrants to build a new AI agent with the Strands Agents SDK that does real work
for real people and handles a task end to end. Moirae Protocol is scoped to the **Professional
Agents** track: a professional operations steward for sole traders, consultants, contractors, and
small professional businesses.

The intended user value is background handling of repetitive administrative work, with attention
surfaced only when a real human judgment is required. MP-00 records the architecture and eligibility
boundary; it does not yet claim a working agent or live demo.

## Dates

The official schedule checked on 2026-09-03 is:

| Event                   | Official timing                                            |
| ----------------------- | ---------------------------------------------------------- |
| Submission period opens | 2026-08-10 at 9:00 a.m. PDT                                |
| Submission deadline     | 2026-09-14 at 5:00 p.m. PDT                                |
| Judging period          | 2026-09-15 at 9:00 a.m. PDT to 2026-10-08 at 5:00 p.m. PDT |
| Winners announced       | On or around 2026-10-14 at 2:00 p.m. PDT                   |

The project is being created on 2026-09-03, inside the published submission period.

## Binding submission requirements

The final entry must satisfy all of the following:

| Requirement                                | MP decision or planned evidence                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| New AI agent built with Strands Agents SDK | MP-01 will add the real Strands capability spike; MP-00 intentionally has no Strands runtime dependency       |
| Agent does real work for real people       | Professional Operations Steward scenarios are the product target; end-to-end proof is deferred to MP-04–MP-08 |
| Public source repository                   | Intended URL: `https://github.com/hourwise/Moirae-Protocol`; local-only until GitHub access is repaired       |
| MIT or Apache open-source licence          | Apache-2.0 `LICENSE` is present in this repository                                                            |
| README                                     | Root `README.md` is present and plain-English first                                                           |
| Architecture diagram                       | `docs/ARCHITECTURE.mmd` plus its explanation in `docs/ARCHITECTURE.md`                                        |
| Demo video                                 | Maximum five minutes; MP-11 will cover the working demo, problem, audience, and why it matters                |
| AWS Builder ID                             | Required from the entrant at submission time; not stored in this repository                                   |
| Live demo URL                              | Optional, planned only after a working product exists                                                         |

## Track and scoring notes

- **Primary track:** Professional Agents.
- **Required framework:** Strands Agents SDK. The framework provides agent orchestration and
  interpretation; it is not treated as the project’s authority mechanism.
- **AgentCore:** Amazon Bedrock AgentCore is optional. The official rules say it can strengthen
  the Technical Implementation score, so MP-08 evaluates it only after the basic live product
  works.
- **Live demo:** Optional, but expected to strengthen Technical Implementation if stable and safe.
- **Builder story:** An AWS Builder Center article is a possible bonus activity if time allows;
  it is not an MP-00 dependency.

## New-project and disclosure boundary

The official rules require projects to be newly created during the submission period. Standard
development tools, frameworks, starter templates, and AI coding assistants are permitted, but any
other pre-existing code or work incorporated into the project must be disclosed.

Moirae Protocol therefore has independent Git history and starts with a clean local directory. The
Fates repositories are pre-existing work. MP-00 inspects their metadata and documentation only; it
does not copy implementation files or claim that their current contracts are already compatible.
The exact provenance record is in [ELIGIBILITY_AND_PROVENANCE.md](ELIGIBILITY_AND_PROVENANCE.md).

## MP-00 interpretation

MP-00 is an eligibility, architecture, and planning slice. It must not implement:

- the routine appointment flow;
- the consequential rescheduling approval flow;
- the forbidden contact-list flow;
- a real connector or external effect;
- final ActionIntent schemas;
- Fates authority calls; or
- a background work loop.

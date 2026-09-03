# Eligibility and Provenance Seal

## Project identity

| Field                        | Recorded value                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Project                      | Moirae Protocol                                                                             |
| Intended repository          | `hourwise/Moirae-Protocol`                                                                  |
| Local path                   | `D:\Users\fleur\Moirae Protocol`                                                            |
| Bootstrap creation timestamp | 2026-09-03T06:57:52+01:00 (Git author timestamp for the first commit)                       |
| Submission-period status     | Created during the official 2026-08-10 through 2026-09-14 submission period                 |
| Initial commit               | `b6fe9a401fd9e4f438ea3bc98f1621deceb684c6` (`chore: bootstrap moirae protocol`)             |
| Repository shape             | New local Git repository initialized with `main`; no parent repository was present          |
| Fork status                  | Not a fork; no source repository was used to initialize Git history                         |
| Remote status                | No remote created; GitHub authentication was invalid and the API connection was unavailable |

The bootstrap inspection found an empty target directory rather than an existing repository. Git
history begins with the MP-00 bootstrap commit. This checkout was initialized independently and was
not created from Moirae Console, The Fates Integration, Ananke, Horae, Mnemosyne, Adrasteia, or any
other existing project.

## Pre-existing work boundary

The following material predates Moirae Protocol and remains outside this repository:

- Project Adrasteia / Runtime Contracts;
- Project Ananke;
- Project Horae;
- Project Mnemosyne;
- Project Fates Integration; and
- Project Moirae Code.

Those projects were inspected read-only for repository metadata and documentation. No implementation
source, package directory, fixture, or generated artifact was copied into Moirae Protocol during
MP-00. The placeholder files in this repository were written as new MP-00 scaffolding.

## Read-only provenance inspection

The table distinguishes the exact local checkout inspected from the exact compatibility checkpoint
recorded in the pre-existing Fates Integration lock. A lock entry is evidence of what that older
integration repository recorded; it is not a new compatibility or licensing decision for Moirae
Protocol.

| Component                     | Local checkout inspected                                                                                                                          | Recorded remote URL                                                                | Stable/recorded checkpoint                                                                                                                                                                  | License surface observed                                                     | MP-00 conclusion                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Adrasteia / Runtime Contracts | `D:\Users\fleur\Project Runtime Contracts`; branch `release/webmcp-runtime-v0.6.2`; HEAD `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`               | [Project-Adrasteia](https://github.com/hourwise/Project-Adrasteia)                 | Tag `adrasteia-adoption-v0.4.0-protocol-1.4.0`; commit `124b6aee2629a3147739934ad5f1b45b32c8ba46`; package `project-runtime-contracts@0.4.0`; recorded as `sealed_tagged` in the older lock | Local `LICENSE` and package metadata indicate MIT                            | The current local branch differs from the older tagged baseline; any later adapter must pin and verify its chosen artifact |
| Ananke                        | `D:\Users\fleur\Project Ananke`; branch `main`; HEAD `3d76adb162a0ff07b5630700ae30a823f1419cb4`                                                   | [Project-Ananke](https://github.com/hourwise/Project-Ananke)                       | Tag `ananke-adrasteia-adoption-v0.1.0-protocol-1.4.0`; commit `dcbb115c5798072221afdd2e4fdd36e786defddf`; recorded as `sealed_tagged`                                                       | Local `LICENSE` is MIT                                                       | Candidate authority boundary is documented; no Moirae adapter compatibility claimed                                        |
| Horae                         | `D:\Users\fleur\Project Horae`; branch `codex/fates-005d-r1-durable-dispatch`; HEAD `68508f5c37e1cb3b244116d45fa267e689a6e75c`                    | [Project-Horae](https://github.com/hourwise/Project-Horae)                         | Tag `horae-adrasteia-adoption-v0.1.0-protocol-1.4.0`; commit `52e14fa574f7427f62747fe84d2789aec25b94e3`; recorded as `sealed_tagged`                                                        | No top-level license file was found in the inspected checkout; TBD for reuse | Candidate composition/coordination boundary is documented; licensing and exact integration surface require later review    |
| Mnemosyne                     | `D:\Users\fleur\Project Mnemosyne`; branch `codex/fates-005d-durable-governance`; HEAD `f02df61be147d6fe716a98912d37eaaf1fe89f23`                 | [Project-Mnemosyne](https://github.com/hourwise/Project-Mnemosyne)                 | Tag `mnemosyne-adrasteia-adoption-v0.1.0-protocol-1.4.0`; commit `f4ab76a9760f856d78908d35facceb068d78c8e5`; recorded as `sealed_tagged`                                                    | No top-level license file was found in the inspected checkout; TBD for reuse | Optional future context/provenance boundary only; not MVP-critical and not imported                                        |
| Fates Integration             | `D:\Users\fleur\Project-Fates-Integration`; branch `codex/fates-005a-integration-implementation`; HEAD `6f89d32c865aef2626de5a9722cc8dc163a76a8c` | [Project-Fates-Integration](https://github.com/hourwise/Project-Fates-Integration) | Lock `fates-stage-a-2026-07`, updated `2026-07-19`; overall seal `provisional`, integration `inspection_only`                                                                               | No top-level license file was found; TBD                                     | Used only as a provenance/compatibility record; no lock or schema was copied                                               |
| Moirae Code                   | `D:\Users\fleur\Project Moirae Code`; branch `codex/fates-005a-moirae-implementation`; HEAD `8e8502aef13e5940fd14865449be422e057fb0f7`            | [Project-Moirae-Code](https://github.com/hourwise/Project-Moirae-Code)             | Older lock records commit `a4783db271a61848c66ac4f6652a539bdb515e28`, no tag, `pushed_untagged`                                                                                             | Root package metadata declares MIT                                           | Pre-existing host work; not used to initialize this repository and not copied                                              |

The older Fates Integration lock also records the public repository URL
[Project-Adrasteia](https://github.com/hourwise/Project-Adrasteia), although no directory named
Project Adrasteia was present locally; the local checkout is named `Project Runtime Contracts`.

## Inspection method and limits

Read-only commands inspected local remotes, branches, HEAD SHAs, worktree status, root license
surfaces, package metadata, selected READMEs, architecture/integration documents, and the Fates
Integration lock. No branch was changed, no existing checkout was written, and no GitHub repository
was created or modified.

GitHub could not be queried for live existence of `hourwise/Moirae-Protocol`: the saved `hourwise`
credential was reported invalid and the API connection was blocked by the execution environment.
Accordingly, remote existence and public/private status remain unverified rather than guessed.

## Seal statements

- Independent Git history: **confirmed locally**.
- Fork of an existing repository: **not a fork**.
- Fates implementation copied into MP-00: **none**.
- Fates code modified or committed: **none**.
- Fates contracts claimed compatible: **no**; all adapters remain future work.
- Fates licensing suitable for future incorporation: **not fully established**; see the table above.

## MP-01 third-party dependency provenance

MP-01 added the following third-party hackathon dependency during this project:

| Package               | Exact version                                     | License    | Upstream                                                                                           | Date added | Purpose                                                                                     |
| --------------------- | ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `@strands-agents/sdk` | `1.16.0` (exact; resolved in `package-lock.json`) | Apache-2.0 | [Strands harness-sdk monorepo](https://github.com/strands-agents/harness-sdk/tree/main/strands-ts) | 2026-09-03 | Real TypeScript Agent invocation and Zod structured output for untrusted semantic proposals |

The archived `strands-agents/sdk-typescript` repository was not used as the source of new code;
current TypeScript development is in the harness-sdk monorepo. The SDK is not pre-existing Fates
work and no Fates implementation was copied. The direct `zod@4.5.4` dependency is present to
provide the schema runtime required by the SDK peer dependency.

MP-01 confirms the current MP-00 licensing finding: Adrasteia / Ananke have inspected license
evidence; Horae / Mnemosyne reuse and licensing remain unresolved. MP-01 has no dependency on Horae
or Mnemosyne implementation.

## MP-02 dependency and provenance note

MP-02 adds no new third-party runtime dependency. It reuses the exact `zod@4.5.4` runtime already
recorded for MP-01. Canonicalization uses the Node.js `node:crypto` built-in for SHA-256 and the
explicit `Intl`/`Date` platform APIs; no date parser, network client, LLM, or Fates package was
added. The action compiler and ActionIntentV1 are new Moirae Protocol contracts, not copied Fates
source and not claimed to be Adrasteia/Fates-native.

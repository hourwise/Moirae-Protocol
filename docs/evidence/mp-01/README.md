# MP-01 evidence

This directory contains sanitized evidence for the real Strands capability
spike. It must never contain provider credentials, API keys, authorization
tokens, raw request headers, or unbounded provider transcripts.

Run the bounded live characterization with:

```text
npm run mp01:live
```

The command uses exactly the three primary fixtures and reports either
`EXECUTED`, `BLOCKED_CREDENTIALS`, or a provider/SDK failure. It records only
proposal objects and bounded latency/stop metadata. Provider credentials are
read through the official SDK credential chain but are never printed or
written to evidence.

The SDK and upstream facts recorded for this slice were inspected on
2026-09-03:

- Package: `@strands-agents/sdk@1.16.0`
- Upstream: [strands-agents/harness-sdk](https://github.com/strands-agents/harness-sdk/tree/main/strands-ts)
- SDK source license: Apache-2.0
- Archived predecessor: [strands-agents/sdk-typescript](https://github.com/strands-agents/sdk-typescript)

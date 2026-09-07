# MP-08B Runtime 01 — Hosted Demo Runtime Prerequisite

This document describes the bounded runnable local service added by
`MOIRAE-MP08B-RUNTIME-01`.

It is not an AWS deployment guide and does not claim that MP-08B has started or
been accepted.

## Supported launcher

After a normal local install, run:

```sh
npm run start
```

The script runs the existing TypeScript build and then starts
`dist/apps/host/src/main.js`. The launcher composes the existing
`createMp07LocalDemoServer()` host; it does not duplicate the server or
dashboard implementation.

The service is synthetic/local by construction. It serves the accepted MP-07
dashboard and synthetic demo transport only.

## Binding configuration

| Variable              | Default     | Rules                                                               |
| --------------------- | ----------- | ------------------------------------------------------------------- |
| `HOST`                | `127.0.0.1` | Valid hostname or IP address; a non-loopback value must be explicit |
| `PORT`                | `3000`      | Decimal integer from `1` through `65535`                            |
| `MOIRAE_BUILD_ID`     | `unbound`   | Optional bounded build identifier                                   |
| `MOIRAE_BUILD_COMMIT` | `unbound`   | Optional 40-hex source commit; invalid values fail startup          |
| `MOIRAE_BUILD_TREE`   | `unbound`   | Optional 40-hex source tree; invalid values fail startup            |

The launcher rejects invalid `HOST`, invalid `PORT`, and invalid supplied build
identity. Port `0` remains available through the programmatic test listener,
but is rejected by launcher configuration so normal startup has a predictable
port.

The safe default remains loopback-only. Explicitly setting a non-loopback host
prints a warning that the service is an unauthenticated synthetic demo and is
not production-safe. Explicit binding does not provide authentication.

## Routes

Existing MP-07 routes remain unchanged:

- `GET /` and `GET /index.html` serve the inline dashboard;
- `GET /mp07/state` reads the bounded product view;
- `POST /mp07/decision` accepts only the strict human-decision envelope and
  uses the existing synthetic local-demo transition.

The runtime prerequisite adds:

- `GET /health` — cheap process liveness response; no external probes or state
  mutation;
- `GET /ready` — readiness to serve the currently configured synthetic runtime;
  no AWS, Bedrock, Fates, or external dependency probe.

Both JSON responses include the runtime descriptor. They do not include
credentials, approval grants, provider secrets, or raw native authority.

## Runtime descriptor

The service reports:

```text
mode = SYNTHETIC_LOCAL_DEMO
liveStrands = false
liveFates = false
durableApproval = false
hostedDurableQueue = false
externalEffects = false
```

The descriptor makes the current capability boundary visible to local health,
readiness, and operator output. No environment variable can turn this runtime
into a claimed live system.

The build identity is honest when unbound: source commit and source tree report
`unbound` rather than being fabricated. A future build/deployment slice may
inject validated immutable identity, but this change does not require a Git
checkout at runtime and does not implement final artifact digest binding.

## Lifecycle

The launcher handles `SIGINT` and `SIGTERM`.

Shutdown is idempotent, stops accepting new connections through the existing
HTTP server close path, and is bounded by a five-second shutdown guard. No
worker is started by this launcher, so no worker lifecycle or queue mutation is
invented here.

## Capability boundary

This runtime does not claim:

- live Strands/Bedrock inference;
- live Fates admission;
- durable MP-05 approval;
- hosted durable MP-06 queue state;
- MP-04/Horae execution;
- external provider effects;
- public authentication or production web security.

The authority boundaries remain unchanged:

```text
MODEL OUTPUT != AUTHORITY
AWS IAM != FATES POLICY AUTHORITY
BROWSER STATE != DURABLE PROTOCOL TRUTH
SYNTHETIC DEMO STATE != LIVE MP-05/MP-04 TRUTH
```

This is an offline runnable prerequisite only. It is not MP-08B deployment,
MP-08B acceptance, or a hosted demo URL.

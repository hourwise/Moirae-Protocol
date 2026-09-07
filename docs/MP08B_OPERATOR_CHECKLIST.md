# MP-08B Operator Checklist

This checklist is for a future separately authorized deployment run. It does
not authorize deployment and must not be used while MP-08A remains blocked.

## Pre-deployment

- [ ] Verify MP-08A is explicitly accepted, including the exact bounded
      three-call `global.anthropic.claude-sonnet-4-6` characterization.
- [ ] Verify the source SHA/tree and clean candidate worktree.
- [ ] Verify `npm ci`, `npm run check`, and `npm run build` from a clean checkout.
- [ ] Verify a supported dashboard launcher exists and its startup contract is
      documented.
- [ ] Verify the selected non-root AWS identity, profile, and region without
      printing credentials.
- [ ] Verify the runtime receives secrets only through the approved provider
      chain; do not copy credentials into files, logs, or evidence.
- [ ] Verify the exact model/profile and bounded request budget.
- [ ] Verify synthetic fixtures are not being described as live MP-05/Fates/
      MP-04 behavior.
- [ ] Verify Fates dependency provenance and packaging/licensing for the chosen
      runtime mode.
- [ ] Verify the selected state strategy is durable if restart-safe live claims
      are required.

## Build

- [ ] Record source commit SHA and tree.
- [ ] Run `npm ci`.
- [ ] Run `npm run check`.
- [ ] Run `npm run build`.
- [ ] Record the generated `dist/` artifact or container/image digest.
- [ ] Record the runtime Node version and exact launcher command.
- [ ] Verify no credentials or unbounded model output entered the artifact.

## Deploy — future authorized steps only

- [ ] Do not proceed unless the deployment slice explicitly authorizes AWS
      resource creation.
- [ ] Use the approved smallest architecture: one bounded Node service and
      same-origin dashboard/API unless a reviewed runtime gap requires a split.
- [ ] Configure only the approved region, model, non-secret settings, and
      least-privilege runtime role.
- [ ] Bind the service through the approved public HTTPS ingress.
- [ ] Do not create AgentCore resources in the ordinary MVP deployment.
- [ ] Record every created resource and its intended teardown owner.

## Verify

- [ ] Verify artifact/image identity matches the source candidate.
- [ ] Verify `/health` and `/ready` only if the future implementation provides
      those documented endpoints.
- [ ] Verify `/` and `/index.html` load over the intended HTTPS origin.
- [ ] Verify `GET /mp07/state` returns only bounded product views.
- [ ] Verify `POST /mp07/decision` accepts only the strict decision envelope and
      ends at accepted MP-05 composition.
- [ ] Verify the four concepts: Handled automatically, Needs you, Blocked,
      Activity.
- [ ] Verify exact consequential action fields before any decision.
- [ ] Verify durable native truth wins after stale, rejection, expiry, response
      loss, and restart cases.
- [ ] Verify Fates remains the independent admission authority.
- [ ] Verify MP-04/Horae remains the execution and effect-once boundary.
- [ ] Verify no browser-to-Fates, browser-to-Horae, browser-to-provider, or
      browser-to-Ananke path exists.
- [ ] Verify logs do not contain credentials, grants, or unnecessary customer
      data.
- [ ] Verify the public URL, deployment identity, model identity, request count,
      and timestamps are recorded without secrets.

## Evidence bundle

- [ ] Source SHA/tree and accepted lineage.
- [ ] Clean-install, typecheck, lint, format, test, build, and diff results.
- [ ] Artifact/image digest and runtime identity.
- [ ] Region, non-secret configuration names, and exact model/profile.
- [ ] Health/readiness and public-route responses.
- [ ] Bounded Strands structured-proposal results.
- [ ] Fates provenance and admission results where live behavior is claimed.
- [ ] MP-05 approval and decision identity evidence where live approval is
      claimed.
- [ ] MP-04/Horae execution/reconciliation evidence where effect behavior is
      claimed.
- [ ] Screenshots showing all four product categories and exact approval data.
- [ ] Bounded logs, secret scan, and resource inventory.
- [ ] Cleanup/rollback result and zero unexpected resources.

## Cleanup / rollback

- [ ] Disable or remove public ingress according to the authorized rollback.
- [ ] Stop the service and any separately authorized worker.
- [ ] Stop recurring jobs, polling, and paid model activity.
- [ ] Remove temporary tasks, queues, images, and test state.
- [ ] Preserve only required evidence and accepted repository history.
- [ ] Recheck the resource inventory and record the final state.

## Stop conditions

Stop without improvising if any of the following occurs:

- source SHA/tree mismatch or dirty candidate;
- MP-08A is not accepted;
- build, artifact, or runtime identity mismatch;
- missing launcher, health, readiness, or required state capability;
- secret leakage or credential reflection;
- non-root/IAM/region/model identity mismatch;
- health/readiness failure;
- Fates unavailable where live authority is claimed;
- synthetic behavior is being presented as live;
- approval, queue, model, browser, or activity state crosses an authority
  boundary;
- unexpected AWS resource, ingress, task, log, or role appears;
- deployment requires an unreviewed runtime or architectural redesign;
- any action would begin MP-09, MP-10, MP-11, AgentCore, WebMCP, or an
  unrelated project.

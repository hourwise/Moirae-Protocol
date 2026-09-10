/**
 * Judge-facing MP-07 product view. The browser renders the bounded product
 * contract and submits strict human-decision envelopes; it never classifies
 * Protocol state or creates approval/effect authority.
 */
export const MP07_DASHBOARD_DOCUMENT = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f3f5f2">
  <title>Moirae work — handled safely</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-synthesis: none;
      --ink: #17211d; --muted: #627069; --line: #dce2dd; --line-strong: #cbd4cd;
      --paper: #ffffff; --canvas: #f3f5f2; --forest: #1f5440; --forest-soft: #e8f2ec;
      --amber: #9a5b16; --amber-soft: #fff4df; --brick: #8c4038; --brick-soft: #fbecea;
      --blue: #355d78; --blue-soft: #eaf2f6; --focus: #bf6815;
      background: var(--canvas); color: var(--ink);
    }
    * { box-sizing: border-box; }
    html { min-width: 18rem; background: var(--canvas); }
    body { margin: 0; min-width: 18rem; min-height: 100vh; background: radial-gradient(circle at 85% 0%, #e4ebe5 0, transparent 29rem), var(--canvas); }
    button, summary { font: inherit; }
    button { min-height: 2.75rem; }
    button:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
    .skip-link { position: fixed; left: 1rem; top: .75rem; transform: translateY(-220%); z-index: 10; border-radius: .5rem; background: var(--ink); color: white; padding: .65rem .85rem; }
    .skip-link:focus { transform: translateY(0); }
    .shell { width: min(72rem, calc(100% - 3rem)); margin-inline: auto; }
    .site-header { padding: 2.2rem 0 1.7rem; }
    .masthead { display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; }
    .brand { display: flex; align-items: center; gap: .7rem; margin-bottom: 1.25rem; color: var(--forest); font-size: .8rem; font-weight: 800; letter-spacing: .2em; }
    .brand-mark { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: 50%; border: 1px solid #9fb2a5; background: rgba(255,255,255,.72); }
    .brand-mark::before { content: ""; width: .62rem; height: .62rem; border-radius: 50%; background: var(--forest); box-shadow: 0 0 0 .24rem #cfe0d4; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { max-width: 49rem; margin-bottom: .7rem; font-family: Georgia, "Times New Roman", serif; font-size: clamp(2.15rem, 5vw, 4.25rem); font-weight: 500; line-height: .98; letter-spacing: -.045em; text-wrap: balance; }
    .lede { max-width: 42rem; margin-bottom: 0; color: var(--muted); font-size: 1.05rem; line-height: 1.65; }
    .runtime { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .55rem; margin-top: .2rem; padding: .48rem .7rem; border: 1px solid var(--line-strong); border-radius: 999px; background: rgba(255,255,255,.76); color: #435049; font-size: .82rem; font-weight: 700; white-space: nowrap; }
    .runtime-dot { width: .48rem; height: .48rem; border-radius: 50%; background: #88958e; }
    .runtime[data-mode="synthetic"] .runtime-dot { background: var(--amber); }
    .overview { display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; margin-top: 1.8rem; padding-top: 1.2rem; border-top: 1px solid var(--line-strong); }
    .overview-copy { color: var(--muted); font-size: .9rem; }
    .refresh { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line-strong); border-radius: .65rem; background: rgba(255,255,255,.7); color: var(--ink); padding: .65rem .9rem; cursor: pointer; font-weight: 700; }
    .refresh:hover { background: white; border-color: #aebbb2; }
    .refresh[disabled] { cursor: wait; opacity: .68; }
    .workspace { padding-bottom: 3rem; }
    .categories { display: grid; grid-template-columns: minmax(0, 1.16fr) minmax(18rem, .84fr); gap: 1.15rem; align-items: start; }
    .category { --accent: var(--blue); --tint: var(--blue-soft); overflow: hidden; border: 1px solid var(--line); border-radius: 1rem; background: rgba(255,255,255,.9); box-shadow: 0 .7rem 2rem rgba(42,58,49,.045); }
    .category[data-category="HANDLED_AUTOMATICALLY"] { --accent: var(--forest); --tint: var(--forest-soft); }
    .category[data-category="NEEDS_YOU"] { --accent: var(--amber); --tint: var(--amber-soft); border-color: #dfc28f; box-shadow: 0 .9rem 2.4rem rgba(112,73,24,.09); }
    .category[data-category="BLOCKED"] { --accent: var(--brick); --tint: var(--brick-soft); }
    .category[data-category="ACTIVITY"] { --accent: var(--blue); --tint: var(--blue-soft); }
    .category-head { display: grid; grid-template-columns: 2.2rem 1fr auto; gap: .8rem; align-items: start; padding: 1.15rem 1.2rem 1rem; border-bottom: 1px solid var(--line); background: linear-gradient(135deg, var(--tint), rgba(255,255,255,.6) 75%); }
    .category-icon { display: grid; place-items: center; width: 2.15rem; height: 2.15rem; border: 1px solid var(--line-strong); border-radius: .7rem; background: rgba(255,255,255,.78); color: var(--accent); font-size: 1.02rem; font-weight: 850; }
    .category h2 { margin: .05rem 0 .18rem; font-size: 1.02rem; line-height: 1.25; }
    .category-description { margin: 0; color: var(--muted); font-size: .84rem; line-height: 1.45; }
    .count { display: grid; place-items: center; min-width: 2rem; height: 2rem; margin: .05rem 0 0; border-radius: 999px; background: rgba(255,255,255,.84); color: var(--accent); font-size: .86rem; font-weight: 800; }
    .category-items { display: grid; gap: .8rem; padding: .85rem; }
    .work-card { min-width: 0; border: 1px solid var(--line); border-radius: .8rem; background: var(--paper); padding: 1rem; }
    .work-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
    .eyebrow { margin-bottom: .32rem; color: var(--accent); font-size: .75rem; font-weight: 800; letter-spacing: .075em; text-transform: uppercase; }
    .work-card h3 { margin-bottom: .35rem; font-size: 1.08rem; line-height: 1.3; }
    .card-summary { margin-bottom: 0; color: var(--muted); font-size: .9rem; line-height: 1.5; }
    .state-chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .35rem; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--tint); color: var(--accent); padding: .32rem .55rem; font-size: .75rem; font-weight: 800; white-space: nowrap; }
    .state-chip::before { content: ""; width: .38rem; height: .38rem; border-radius: 50%; background: currentColor; }
    .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; margin: 1rem 0; }
    .field { min-width: 0; padding: .7rem .75rem; border-radius: .62rem; background: #f7f8f7; }
    .field strong { display: block; margin-bottom: .2rem; color: var(--muted); font-size: .74rem; font-weight: 750; letter-spacing: .025em; }
    .field span { display: block; overflow-wrap: anywhere; color: #27332d; font-size: .88rem; line-height: 1.45; }
    .actions { display: flex; flex-wrap: wrap; gap: .65rem; margin: 1rem 0 .2rem; }
    .decision { flex: 1 1 9rem; border: 1px solid transparent; border-radius: .68rem; padding: .68rem 1rem; cursor: pointer; font-weight: 800; }
    .approve { background: var(--forest); color: white; }
    .approve:hover { background: #173f30; }
    .reject { border-color: #d7aaa5; background: white; color: var(--brick); }
    .reject:hover { background: var(--brick-soft); }
    .decision[disabled] { cursor: wait; opacity: .6; }
    .decision[aria-busy="true"]::after { content: " ···"; }
    .fixture-note { margin: .85rem 0 0; border-left: .2rem solid var(--amber); border-radius: .25rem; background: #fff8eb; color: #72501f; padding: .65rem .75rem; font-size: .8rem; line-height: 1.45; }
    details { margin-top: .8rem; border-top: 1px solid var(--line); padding-top: .72rem; }
    summary { width: fit-content; border-radius: .3rem; color: #3f4d46; cursor: pointer; font-size: .84rem; font-weight: 760; }
    summary::marker { color: var(--accent); }
    .timeline { display: grid; gap: 0; margin: .8rem 0 .2rem; padding: 0; list-style: none; }
    .timeline li { position: relative; display: grid; grid-template-columns: .8rem 1fr; gap: .62rem; min-width: 0; padding-bottom: .72rem; color: var(--muted); font-size: .82rem; line-height: 1.45; }
    .timeline li::before { content: ""; width: .55rem; height: .55rem; margin-top: .23rem; border: .12rem solid white; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 1px var(--accent); z-index: 1; }
    .timeline li:not(:last-child)::after { content: ""; position: absolute; left: .255rem; top: .75rem; bottom: -.05rem; width: 1px; background: var(--line-strong); }
    .timeline strong { color: var(--ink); }
    .technical { margin-top: .65rem; padding: .75rem; border-radius: .62rem; background: #f7f8f7; }
    .evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .65rem 1rem; margin: .8rem 0 0; }
    .evidence-grid > div { min-width: 0; }
    .evidence-grid dt { margin-bottom: .15rem; color: var(--muted); font-size: .72rem; font-weight: 750; }
    .evidence-grid dd { min-width: 0; margin: 0; overflow-wrap: anywhere; word-break: break-word; color: #35423b; font: .76rem/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .activity-list { margin: .75rem 0 0; padding-left: 1.2rem; color: var(--muted); font-size: .82rem; line-height: 1.5; }
    .activity-list li + li { margin-top: .4rem; }
    .empty { margin: 0; padding: .75rem; border: 1px dashed var(--line-strong); border-radius: .68rem; color: var(--muted); font-size: .86rem; text-align: center; }
    .error { border-color: #dfb7b2; background: var(--brick-soft); color: #71332d; text-align: left; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    @media (max-width: 56rem) { .categories { grid-template-columns: 1fr 1fr; } .fields, .evidence-grid { grid-template-columns: 1fr; } }
    @media (max-width: 44rem) {
      .shell { width: min(100% - 1.25rem, 72rem); } .site-header { padding-top: 1.25rem; } .masthead { display: block; }
      .runtime { margin-top: 1.2rem; } .overview { align-items: flex-end; } .categories { grid-template-columns: 1fr; }
      .category-head { padding-inline: 1rem; } .work-card-header { display: block; } .state-chip { margin-top: .65rem; } .decision { flex-basis: 100%; }
    }
    @media (prefers-reduced-motion: no-preference) { .work-card, .runtime, details > * { transition: border-color .16s ease, background-color .16s ease, opacity .16s ease; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
  </style>
</head>
<body>
  <a class="skip-link" href="#product-view">Skip to current work</a>
  <header class="site-header shell">
    <div class="masthead">
      <div>
        <div class="brand"><span class="brand-mark" aria-hidden="true"></span>MOIRAE</div>
        <h1>Work is handled safely.<br>You decide what matters.</h1>
        <p class="lede">Routine work can move quietly. Consequential actions pause for you, unsafe work stays blocked, and every outcome leaves understandable evidence.</p>
      </div>
      <div id="runtime" class="runtime" role="status" aria-live="polite" aria-atomic="true"><span class="runtime-dot" aria-hidden="true"></span><span id="runtime-label">Checking runtime</span></div>
    </div>
    <div class="overview">
      <p id="status" class="overview-copy" role="status" aria-live="polite" aria-atomic="true">Loading current state…</p>
      <button id="refresh" class="refresh" type="button" aria-controls="product-view">Refresh view</button>
    </div>
  </header>
  <main id="product-view" class="workspace shell">
    <h2 class="sr-only">Current work</h2>
    <div class="categories" aria-busy="true">
      <section class="category" data-category="HANDLED_AUTOMATICALLY" aria-labelledby="handled-heading">
        <header class="category-head"><span class="category-icon" aria-hidden="true">✓</span><div><h2 id="handled-heading">Handled automatically</h2><p class="category-description">Completed work with confirmed evidence.</p></div><p id="handled-automatically-count" class="count" aria-label="0 items">0</p></header>
        <div id="handled-automatically-items" class="category-items"><p class="empty">Loading current work…</p></div>
      </section>
      <section class="category" data-category="NEEDS_YOU" aria-labelledby="needs-heading">
        <header class="category-head"><span class="category-icon" aria-hidden="true">!</span><div><h2 id="needs-heading">Needs you</h2><p class="category-description">Consequential work waiting for your decision.</p></div><p id="needs-you-count" class="count" aria-label="0 items">0</p></header>
        <div id="needs-you-items" class="category-items"><p class="empty">Loading current work…</p></div>
      </section>
      <section class="category" data-category="BLOCKED" aria-labelledby="blocked-heading">
        <header class="category-head"><span class="category-icon" aria-hidden="true">×</span><div><h2 id="blocked-heading">Blocked</h2><p class="category-description">Stopped safely or waiting for certainty.</p></div><p id="blocked-count" class="count" aria-label="0 items">0</p></header>
        <div id="blocked-items" class="category-items"><p class="empty">Loading current work…</p></div>
      </section>
      <section class="category" data-category="ACTIVITY" aria-labelledby="activity-heading">
        <header class="category-head"><span class="category-icon" aria-hidden="true">→</span><div><h2 id="activity-heading">Activity</h2><p class="category-description">Work moving through governed processing.</p></div><p id="activity-count" class="count" aria-label="0 items">0</p></header>
        <div id="activity-items" class="category-items"><p class="empty">Loading current work…</p></div>
      </section>
    </div>
  </main>
  <script>
    (function () {
      'use strict';
      var pending = new Set();
      var status = document.getElementById('status');
      var categoriesRoot = document.querySelector('.categories');
      var latestRequest = 0;
      var inFlight = null;
      var headingSequence = 0;
      var currentRuntime = null;
      var categoryOrder = ['HANDLED_AUTOMATICALLY', 'NEEDS_YOU', 'BLOCKED', 'ACTIVITY'];
      var labels = { HANDLED_AUTOMATICALLY: 'Handled automatically', NEEDS_YOU: 'Needs you', BLOCKED: 'Blocked', ACTIVITY: 'Activity' };
      var emptyMessages = { HANDLED_AUTOMATICALLY: 'No completed work to show.', NEEDS_YOU: 'Nothing needs your decision.', BLOCKED: 'Nothing is currently blocked.', ACTIVITY: 'No work is currently in progress.' };
      var actionLabels = { SEND_APPOINTMENT_DETAILS: 'Send appointment details', RESCHEDULE_APPOINTMENT: 'Reschedule appointment', TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: 'Transmit customer contact directory' };
      var stateLabels = { HANDLED_AUTOMATICALLY: 'Confirmed', NEEDS_YOU: 'Needs approval', BLOCKED: 'Stopped safely', ACTIVITY: 'In progress' };
      var reasonMessages = {
        CONFIRMED_COMPLETION: 'Completed with the required confirmation evidence.',
        MP03_REJECTED: 'Blocked by policy before the action could continue.',
        MP03_BOUNDARY_FAILURE: 'The governing boundary failed closed, so the action did not continue.',
        MP04_UNKNOWN: 'What happened is uncertain. Moirae will not treat this as complete or repeat the effect.',
        MP04_RECOVERY_REQUIRED: 'This outcome needs reconciliation before anything can continue.',
        MP04_BOUNDARY_FAILURE: 'Execution stopped at a trusted boundary.',
        EFFECT_ABSENT: 'Evidence establishes that the effect did not occur. It will not be silently redispatched.',
        RETRY_EXHAUSTED: 'The bounded processing attempt limit was reached.',
        APPROVAL_PENDING: 'Review the important details below, then approve or reject this request.',
        APPROVAL_EXPIRED: 'The decision window expired before a valid choice was recorded.',
        APPROVAL_REJECTED: 'A human rejected this action. It did not continue.',
        APPROVAL_REVOKED: 'Approval was withdrawn before the action could continue.',
        APPROVAL_CONSUMED: 'This approval was already used and cannot be reused.',
        APPROVAL_MISSING: 'The required approval record is unavailable, so the action cannot continue.',
        APPROVAL_INVALID: 'The approval does not safely bind to this action.',
        APPROVAL_BOUNDARY_FAILURE: 'The approval boundary failed closed.',
        BOUNDARY_BLOCKED: 'A trusted boundary stopped this work item.',
        TERMINAL_FAILURE: 'Processing ended without a confirmed effect.',
        INCONSISTENT_COMPLETION: 'Completion records disagree. Moirae is holding this for review.',
        INCONSISTENT_APPROVAL_STATE: 'Approval records disagree. Moirae is holding this for review.',
        RETRY_SCHEDULED: 'A bounded operational retry is scheduled.',
        ACTIVE_PROCESSING: 'The trusted host is currently processing this work.'
      };
      function text(value) { return value === undefined || value === null || value === '' ? 'Not recorded' : String(value); }
      function node(tag, value, className) { var element = document.createElement(tag); if (className) element.className = className; if (value !== undefined) element.textContent = text(value); return element; }
      function isSyntheticRuntime() { return Boolean(currentRuntime && currentRuntime.mode === 'SYNTHETIC_LOCAL_DEMO'); }
      function humanDate(value) { if (!value) return 'Not recorded'; var date = new Date(value); if (Number.isNaN(date.getTime())) return text(value); return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
      function shortId(value) { var full = text(value); if (full.length <= 28) return full; return full.slice(0, 13) + '…' + full.slice(-10); }
      function objectDescription(value) {
        if (!value || typeof value !== 'object') return text(value);
        if (value.kind === 'email') return text(value.address);
        if (value.kind === 'customer') return 'Customer ' + text(value.customerId);
        if (value.resourceType && value.resourceId) return text(value.resourceType).replaceAll('_', ' ') + ' · ' + text(value.resourceId);
        return Object.entries(value).map(function (entry) { return entry[0] + ': ' + text(entry[1]); }).join(' · ');
      }
      function addField(parent, label, value) { if (value === undefined || value === null || value === '') return; var item = node('div', undefined, 'field'); item.append(node('strong', label), node('span', value)); parent.append(item); }
      function actionFields(view) {
        var fields = node('div', undefined, 'fields'); var parameters = view.action.parameters || {};
        if (view.action.action === 'SEND_APPOINTMENT_DETAILS') { addField(fields, 'Booking ID', parameters.bookingId); addField(fields, 'Recipient address', parameters.recipientAddress); addField(fields, 'Template ID', parameters.templateId); }
        if (view.action.action === 'RESCHEDULE_APPOINTMENT') { addField(fields, 'Booking ID', parameters.bookingId); addField(fields, 'Current start', humanDate(parameters.currentStart)); addField(fields, 'Proposed start', humanDate(parameters.proposedStart)); addField(fields, 'Time zone', parameters.timeZone); }
        if (view.action.action === 'TRANSMIT_CUSTOMER_CONTACT_DIRECTORY') { addField(fields, 'Directory resource ID', parameters.directoryResourceId); addField(fields, 'Recipient address', parameters.recipientAddress); addField(fields, 'Export format', parameters.exportFormat); }
        addField(fields, 'Target', objectDescription(view.action.target)); addField(fields, 'Resource', objectDescription(view.action.resource)); return fields;
      }
      function timelineStep(list, title, description) { var item = node('li'); var copy = node('span'); copy.append(node('strong', title), document.createTextNode(' — ' + description)); item.append(node('span'), copy); list.append(item); }
      function evidence(parent, view) {
        var details = node('details'); details.append(node('summary', 'Evidence and history')); var timeline = node('ol', undefined, 'timeline');
        timelineStep(timeline, 'Requested', 'Bound to source request ' + shortId(view.work.sourceRequestId) + '.');
        if (view.native.mp03Status) timelineStep(timeline, 'Governance decision', text(view.native.mp03Decision || view.native.mp03Status).replaceAll('_', ' ').toLowerCase() + '.');
        if (view.approval) timelineStep(timeline, 'Human decision', view.approval.status === 'PENDING' ? 'Waiting for a current decision.' : text(view.approval.status).replaceAll('_', ' ').toLowerCase() + '.');
        if (view.native.queueState) timelineStep(timeline, 'Processing', text(view.native.queueState).replaceAll('_', ' ').toLowerCase() + '.');
        if (view.native.mp04Status) timelineStep(timeline, 'Effect evidence', isSyntheticRuntime() && view.native.mp04Status === 'CONFIRMED' ? 'Confirmed by a deterministic demo fixture, not a real delivery.' : text(view.native.mp04Status).replaceAll('_', ' ').toLowerCase() + '.');
        timelineStep(timeline, 'Current product view', labels[view.category] + '.'); details.append(timeline);
        var technical = node('details', undefined, 'technical'); technical.append(node('summary', 'Technical evidence')); var grid = node('dl', undefined, 'evidence-grid');
        var values = [['Work ID', view.work.workId], ['Source request ID', view.work.sourceRequestId], ['ActionIntent digest', view.work.actionIntentDigest], ['Idempotency key', view.work.actionIntentIdempotencyKey], ['Approval ID', view.evidence.approvalId || (view.approval && view.approval.approvalId)], ['Decision ID', view.evidence.decisionId || (view.approval && view.approval.decisionId)], ['Execution ID', view.evidence.durableExecutionId], ['Claim ID', view.evidence.claimId], ['Correlation', view.context && view.context.sessionId], ['Observed', view.freshness.observedAt]];
        values.forEach(function (pair) { if (pair[1] === undefined || pair[1] === null) return; var group = node('div'); var value = node('dd', shortId(pair[1])); value.title = text(pair[1]); group.append(node('dt', pair[0]), value); grid.append(group); });
        technical.append(grid); details.append(technical);
        if (view.activity && view.activity.length) { var activityDetails = node('details'); activityDetails.append(node('summary', 'Processing history')); var list = node('ol', undefined, 'activity-list'); view.activity.forEach(function (entry) { list.append(node('li', text(entry.state).replaceAll('_', ' ').toLowerCase() + ' · ' + humanDate(entry.observedAt) + (entry.reason ? ' · ' + text(entry.reason) : ''))); }); activityDetails.append(list); details.append(activityDetails); }
        parent.append(details);
      }
      function submit(view, decision, buttons) {
        var approval = view.approval; if (!approval || approval.status !== 'PENDING' || pending.has(approval.approvalId)) return;
        pending.add(approval.approvalId); buttons.forEach(function (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }); status.textContent = 'Submitting your decision securely…';
        var envelope = { schemaVersion: 'human-decision-v1', approvalId: approval.approvalId, decision: decision, presentationDigest: approval.presentationDigest, nativePresentationBindingHash: approval.nativePresentationBindingHash };
        Mp07StateTransport.submitDecision(envelope)
          .then(function (result) {
            pending.delete(approval.approvalId);
            if (result.body.refreshRequired) status.textContent = 'Your decision may be recorded. Rereading current state; do not submit another decision.';
            else if (result.body.code === 'STALE_APPROVAL_REFERENCE') status.textContent = 'This request changed elsewhere. Rereading current state.';
            else if (result.body.code === 'DECISION_BOUNDARY_FAILURE') status.textContent = 'The approval boundary stopped the request. Rereading current state.';
            else status.textContent = result.ok ? 'Decision received. Confirming the resulting server state…' : 'The decision was not accepted. Rereading current state.';
            return loadState();
          })
          .catch(function () {
            pending.delete(approval.approvalId); status.textContent = 'The response was unavailable. Rereading current state; do not submit a replacement decision.';
            buttons.forEach(function (button) { button.disabled = false; button.removeAttribute('aria-busy'); });
            return loadState().then(function () { status.textContent = 'The response was unavailable. Current server state was reread; do not submit a replacement decision.'; });
          });
      }
      function renderView(view) {
        var article = node('article', undefined, 'work-card'); var header = node('header', undefined, 'work-card-header'); var titleGroup = node('div'); var headingId = 'work-heading-' + String(++headingSequence);
        var actionLabel = actionLabels[view.action.action] || text(view.action.action).replaceAll('_', ' ').toLowerCase(); var heading = node('h3', actionLabel); heading.id = headingId; article.setAttribute('aria-labelledby', headingId);
        titleGroup.append(node('p', stateLabels[view.category] || labels[view.category], 'eyebrow'), heading, node('p', reasonMessages[view.native.reasonCode] || 'The server returned a governed product state.', 'card-summary'));
        header.append(titleGroup, node('span', stateLabels[view.category] || labels[view.category], 'state-chip')); article.append(header, actionFields(view));
        if (isSyntheticRuntime() && view.category === 'HANDLED_AUTOMATICALLY') article.append(node('p', 'Deterministic demo fixture — no real email or external effect occurred.', 'fixture-note'));
        if (view.freshness && view.freshness.refetchRequired) article.append(node('p', 'This request has changed. Refresh to see its current status.', 'fixture-note'));
        if (view.category === 'NEEDS_YOU' && view.approval && view.approval.status === 'PENDING') {
          var actions = node('div', undefined, 'actions'); actions.setAttribute('role', 'group'); actions.setAttribute('aria-label', 'Decision for ' + actionLabel);
          var approve = node('button', 'Approve', 'decision approve'); var reject = node('button', 'Reject', 'decision reject'); approve.type = 'button'; reject.type = 'button';
          approve.setAttribute('aria-label', 'Approve ' + actionLabel); reject.setAttribute('aria-label', 'Reject ' + actionLabel); approve.setAttribute('aria-describedby', headingId); reject.setAttribute('aria-describedby', headingId);
          approve.addEventListener('click', function () { submit(view, 'APPROVE', [approve, reject]); }); reject.addEventListener('click', function () { submit(view, 'REJECT', [approve, reject]); }); actions.append(approve, reject); article.append(actions);
        }
        evidence(article, view); return article;
      }
      function categoryId(category) { return category.toLowerCase().replaceAll('_', '-'); }
      function renderProductState(body) {
        var views = Array.isArray(body.views) ? body.views : [];
        categoryOrder.forEach(function (category) {
          var categoryViews = views.filter(function (view) { return view.category === category; }); var id = categoryId(category); var count = document.getElementById(id + '-count'); var items = document.getElementById(id + '-items');
          count.textContent = String(categoryViews.length); count.setAttribute('aria-label', String(categoryViews.length) + (categoryViews.length === 1 ? ' item' : ' items')); items.replaceChildren();
          if (!categoryViews.length) items.append(node('p', emptyMessages[category], 'empty')); else categoryViews.forEach(function (view) { items.append(renderView(view)); });
        }); categoriesRoot.setAttribute('aria-busy', 'false');
      }
      function renderRuntime(runtime) {
        currentRuntime = runtime || null; var pill = document.getElementById('runtime'); var runtimeLabel = document.getElementById('runtime-label');
        if (isSyntheticRuntime()) { pill.dataset.mode = 'synthetic'; runtimeLabel.textContent = 'Synthetic demo'; return; }
        pill.dataset.mode = 'unknown'; runtimeLabel.textContent = runtime && runtime.mode ? text(runtime.mode).replaceAll('_', ' ').toLowerCase() : 'Runtime status unavailable';
      }
      var Mp07StateTransport = Object.freeze({
        readSnapshot: function (signal) {
          return Promise.all([fetch('/mp07/state', { headers: { accept: 'application/json' }, signal: signal }), fetch('/health', { headers: { accept: 'application/json' }, signal: signal })])
            .then(function (responses) { return Promise.all(responses.map(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); })); })
            .then(function (results) { if (!results[0].ok) throw new Error(results[0].body && results[0].body.code ? results[0].body.code : 'STATE_READ_FAILURE'); return { state: results[0].body, runtime: results[1].ok ? results[1].body.runtime : null }; });
        },
        submitDecision: function (envelope) { return fetch('/mp07/decision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope) }).then(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); }); }
      });
      function renderReadFailure() { categoryOrder.forEach(function (category) { var items = document.getElementById(categoryId(category) + '-items'); items.replaceChildren(node('p', 'Current state is unavailable. Refresh the view when the local host is ready.', 'empty error')); }); categoriesRoot.setAttribute('aria-busy', 'false'); }
      function loadState() {
        var requestId = ++latestRequest; if (inFlight) inFlight.abort(); inFlight = new AbortController(); categoriesRoot.setAttribute('aria-busy', 'true'); document.getElementById('refresh').disabled = true; status.textContent = 'Reading current state from the server…';
        return Mp07StateTransport.readSnapshot(inFlight.signal)
          .then(function (snapshot) { if (requestId !== latestRequest) return; renderRuntime(snapshot.runtime); renderProductState(snapshot.state); status.textContent = isSyntheticRuntime() ? 'Demo state is current. No real external effects are enabled.' : 'Current server state loaded.'; })
          .catch(function (error) { if (error && error.name === 'AbortError') return; if (requestId !== latestRequest) return; renderRuntime(null); renderReadFailure(); status.textContent = 'Current state could not be read. No product state was inferred in the browser.'; })
          .finally(function () { if (requestId === latestRequest) { inFlight = null; document.getElementById('refresh').disabled = false; } });
      }
      document.getElementById('refresh').addEventListener('click', loadState); loadState();
    }());
  </script>
</body>
</html>`;

/**
 * MP-07C deliberately serves one dependency-free local document. The document
 * consumes only the bounded host transport; it never assembles Protocol state
 * or decides whether a work item is executable.
 */
export const MP07_DASHBOARD_DOCUMENT = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Moirae — human product view</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; background: #f6f7fb; color: #162033; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 18rem; }
    .skip-link { position: absolute; left: .75rem; top: .5rem; transform: translateY(-200%); background: #172554; color: white; padding: .55rem .75rem; border-radius: .35rem; z-index: 2; }
    .skip-link:focus { transform: translateY(0); }
    header, main { width: min(72rem, calc(100% - 2rem)); margin-inline: auto; }
    header { padding: 2rem 0 1rem; }
    header p { max-width: 48rem; color: #475569; }
    h1, h2, h3 { line-height: 1.2; }
    h1 { margin-block: 0 .5rem; }
    h2 { margin-top: 0; }
    button, summary { font: inherit; }
    button { border: 2px solid #253b73; border-radius: .5rem; background: white; color: #172554; padding: .65rem .9rem; cursor: pointer; }
    button:hover { background: #eef2ff; }
    button:focus-visible, summary:focus-visible { outline: 3px solid #d97706; outline-offset: 3px; }
    button[disabled] { cursor: wait; opacity: .65; }
    button[aria-busy="true"]::after { content: " …"; }
    .toolbar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
    #status { min-height: 1.5rem; color: #334155; }
    .categories { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; margin-block: 1rem 2rem; }
    .category { background: white; border: 1px solid #cbd5e1; border-top: .35rem solid #475569; border-radius: .6rem; padding: 1rem; min-height: 8rem; }
    .category h2 { font-size: 1rem; margin-bottom: .4rem; }
    .category p { margin: 0; color: #475569; }
    .category[data-category="HANDLED_AUTOMATICALLY"] { border-top-color: #166534; }
    .category[data-category="NEEDS_YOU"] { border-top-color: #9a3412; }
    .category[data-category="BLOCKED"] { border-top-color: #991b1b; }
    .category[data-category="ACTIVITY"] { border-top-color: #1d4ed8; }
    #items { display: grid; gap: 1rem; }
    .empty { color: #64748b; }
    article { background: white; border: 1px solid #cbd5e1; border-radius: .6rem; padding: 1rem; }
    article header { width: auto; padding: 0; }
    article h3 { margin: 0; }
    .meta, .fields, .actions, .evidence-grid { display: grid; gap: .55rem 1rem; }
    .meta, .evidence-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .fields { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-block: 1rem; }
    .field { border-left: .25rem solid #e2e8f0; padding-left: .65rem; overflow-wrap: anywhere; }
    .field strong, .evidence-grid dt { display: block; color: #475569; font-size: .85rem; }
    .field span, .evidence-grid dd { overflow-wrap: anywhere; word-break: break-word; min-width: 0; }
    .actions { display: flex; flex-wrap: wrap; margin-block: 1rem; }
    .approve { border-color: #166534; color: #14532d; }
    .reject { border-color: #991b1b; color: #7f1d1d; }
    .reason { display: inline-block; padding: .2rem .45rem; border: 1px solid #94a3b8; border-radius: .4rem; font-family: ui-monospace, monospace; font-size: .85rem; }
    details { margin-top: 1rem; border-top: 1px solid #e2e8f0; padding-top: .75rem; }
    summary { cursor: pointer; font-weight: 650; }
    dl { margin: .75rem 0 0; }
    dt { font-weight: 650; }
    dd { margin: 0 0 .5rem; }
    .error { color: #991b1b; }
    .notice { border-left: .3rem solid #9a3412; background: #fff7ed; padding: .7rem .85rem; }
    .notice.error { border-left-color: #991b1b; background: #fef2f2; }
    .decision-status { min-height: 1.5rem; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
    }
    @media (max-width: 44rem) {
      header, main { width: min(100% - 1rem, 72rem); }
      .categories, .meta, .fields, .evidence-grid { grid-template-columns: 1fr; }
      .category { min-height: auto; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#items">Skip to current work</a>
  <header>
    <h1>Moirae work</h1>
    <p>Authoritative Protocol state, presented clearly. Human decisions are sent to the trusted local host and are reread before MP-05 processes them.</p>
    <div class="toolbar">
      <button id="refresh" type="button" aria-controls="items">Refresh current state</button>
      <p id="status" class="decision-status" role="status" aria-live="polite" aria-atomic="true">Loading current state…</p>
    </div>
  </header>
  <main>
    <section aria-labelledby="categories-heading">
      <h2 id="categories-heading">Work at a glance</h2>
      <div class="categories">
        <section class="category" data-category="HANDLED_AUTOMATICALLY" aria-labelledby="handled-heading"><h2 id="handled-heading">Handled automatically</h2><p id="handled-count">0 items</p></section>
        <section class="category" data-category="NEEDS_YOU" aria-labelledby="needs-heading"><h2 id="needs-heading">Needs you</h2><p id="needs-count">0 items</p></section>
        <section class="category" data-category="BLOCKED" aria-labelledby="blocked-heading"><h2 id="blocked-heading">Blocked</h2><p id="blocked-count">0 items</p></section>
        <section class="category" data-category="ACTIVITY" aria-labelledby="activity-heading"><h2 id="activity-heading">Activity</h2><p id="activity-count">0 items</p></section>
      </div>
    </section>
    <section id="main-content" aria-labelledby="items-heading">
      <h2 id="items-heading">Current work</h2>
      <div id="items" aria-live="polite" aria-busy="true"><p class="empty">Loading…</p></div>
    </section>
  </main>
  <script>
    (function () {
      'use strict';
      var pending = new Set();
      var root = document.getElementById('items');
      var status = document.getElementById('status');
      var latestRequest = 0;
      var inFlight = null;
      var headingSequence = 0;
      var labels = {
        HANDLED_AUTOMATICALLY: 'Handled automatically',
        NEEDS_YOU: 'Needs you',
        BLOCKED: 'Blocked',
        ACTIVITY: 'Activity'
      };
      var actionLabels = {
        SEND_APPOINTMENT_DETAILS: 'Send appointment details',
        RESCHEDULE_APPOINTMENT: 'Reschedule appointment',
        TRANSMIT_CUSTOMER_CONTACT_DIRECTORY: 'Transmit customer contact directory'
      };
      function text(value) { return value === undefined || value === null ? '—' : String(value); }
      function node(tag, value, className) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (value !== undefined) element.textContent = text(value);
        return element;
      }
      function field(parent, label, value) {
        var item = node('div', undefined, 'field');
        item.append(node('strong', label), node('span', value));
        parent.append(item);
      }
      function evidence(parent, view) {
        var details = node('details');
        details.append(node('summary', 'Technical evidence'));
        var grid = node('dl', undefined, 'evidence-grid');
        var values = [
          ['Work ID', view.work.workId], ['Source request ID', view.work.sourceRequestId],
          ['ActionIntent digest', view.work.actionIntentDigest], ['Idempotency key', view.work.actionIntentIdempotencyKey],
          ['MP-03 status', view.native.mp03Status], ['MP-03 decision', view.native.mp03Decision],
          ['MP-04 status', view.native.mp04Status], ['MP-05 approval status', view.native.mp05ApprovalStatus],
          ['Approval ID', view.evidence.approvalId || (view.approval && view.approval.approvalId)],
          ['Decision ID', view.evidence.decisionId || (view.approval && view.approval.decisionId)],
          ['Durable execution ID', view.evidence.durableExecutionId], ['Claim ID', view.evidence.claimId],
          ['Generation', view.evidence.generation], ['Reconciliation', view.evidence.reconciliationRequired],
          ['Observed at', view.freshness.observedAt]
        ];
        values.forEach(function (pair) { grid.append(node('dt', pair[0]), node('dd', pair[1])); });
        details.append(grid);
        parent.append(details);
      }
      function reasonMessage(view) {
        var messages = {
          CONFIRMED_COMPLETION: 'The effect is durably confirmed.',
          MP03_REJECTED: 'This action was blocked by the authority policy.',
          MP04_UNKNOWN: 'The execution outcome is uncertain. Moirae will not repeat the effect until it is reconciled.',
          MP04_RECOVERY_REQUIRED: 'The execution requires native recovery before it can continue.',
          EFFECT_ABSENT: 'The original execution is durably absent and will not be silently redispatched.',
          RETRY_EXHAUSTED: 'The bounded operational retry budget is exhausted.',
          APPROVAL_PENDING: 'A current human decision is required before this action can continue.',
          APPROVAL_EXPIRED: 'This approval request expired before a valid decision was recorded.',
          APPROVAL_REJECTED: 'The human decision rejected this action.',
          APPROVAL_REVOKED: 'The approval was revoked before execution.',
          APPROVAL_CONSUMED: 'This approval has already been consumed and cannot be reused.',
          APPROVAL_MISSING: 'The authoritative approval record is missing.',
          APPROVAL_INVALID: 'The authoritative approval is invalid or does not bind to this action.',
          APPROVAL_BOUNDARY_FAILURE: 'The trusted approval boundary failed closed.',
          BOUNDARY_BLOCKED: 'The trusted Protocol boundary blocked this work item.',
          TERMINAL_FAILURE: 'The work ended in a terminal failure.',
          INCONSISTENT_COMPLETION: 'Durable queue and execution state disagree; refresh is required.',
          INCONSISTENT_APPROVAL_STATE: 'Durable approval state is inconsistent; refresh is required.',
          MP03_BOUNDARY_FAILURE: 'The current authority boundary failed closed.',
          RETRY_SCHEDULED: 'The work is scheduled for a bounded retry.',
          ACTIVE_PROCESSING: 'The work is being processed by the trusted host.'
        };
        return messages[view.native.reasonCode] || 'The trusted host returned a structured state that needs attention.';
      }
      function activity(parent, view) {
        if (!view.activity || view.activity.length === 0) return;
        var details = node('details');
        details.append(node('summary', 'Activity history'));
        var list = node('ol');
        view.activity.forEach(function (entry) {
          var item = node('li');
          item.textContent = text(entry.state) + ' — ' + text(entry.observedAt) + (entry.reason ? ' — ' + text(entry.reason) : '');
          list.append(item);
        });
        details.append(list);
        parent.append(details);
      }
      function actionFields(view) {
        var fields = node('div', undefined, 'fields');
        var action = view.action.action;
        var parameters = view.action.parameters || {};
        var values = [];
        if (action === 'SEND_APPOINTMENT_DETAILS') values = [['Booking ID', parameters.bookingId], ['Recipient address', parameters.recipientAddress], ['Template ID', parameters.templateId]];
        if (action === 'RESCHEDULE_APPOINTMENT') values = [['Booking ID', parameters.bookingId], ['Current start', parameters.currentStart], ['Proposed start', parameters.proposedStart], ['Time zone', parameters.timeZone]];
        if (action === 'TRANSMIT_CUSTOMER_CONTACT_DIRECTORY') values = [['Directory resource ID', parameters.directoryResourceId], ['Recipient address', parameters.recipientAddress], ['Export format', parameters.exportFormat]];
        values.forEach(function (pair) { field(fields, pair[0], pair[1]); });
        field(fields, 'Target', JSON.stringify(view.action.target));
        field(fields, 'Resource', JSON.stringify(view.action.resource));
        field(fields, 'Principal', view.action.principal.agentPrincipalId);
        field(fields, 'Requester/customer', view.action.requester.customerId);
        return fields;
      }
      function submit(view, decision, buttons) {
        var approval = view.approval;
        if (!approval || approval.status !== 'PENDING' || pending.has(approval.approvalId)) return;
        pending.add(approval.approvalId);
        buttons.forEach(function (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); });
        status.textContent = 'Sending ' + decision.toLowerCase() + ' to the trusted host…';
        var envelope = {
          schemaVersion: 'human-decision-v1',
          approvalId: approval.approvalId,
          decision: decision,
          presentationDigest: approval.presentationDigest,
          nativePresentationBindingHash: approval.nativePresentationBindingHash
        };
        fetch('/mp07/decision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope) })
          .then(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); })
          .then(function (result) {
            pending.delete(approval.approvalId);
            if (result.body.refreshRequired) status.textContent = 'The decision may be durable; rereading current native state. Do not submit a replacement.';
            else if (result.body.code === 'STALE_APPROVAL_REFERENCE') status.textContent = 'This request changed elsewhere; rereading current state.';
            else if (result.body.code === 'DECISION_BOUNDARY_FAILURE') status.textContent = 'The trusted approval boundary rejected the request; rereading current state.';
            else status.textContent = result.ok ? 'Decision accepted by the trusted host; rereading current state.' : 'Decision was not accepted; rereading current state.';
            return loadState();
          })
          .catch(function () {
            pending.delete(approval.approvalId);
            status.textContent = 'The response was unavailable. Rereading current state; do not submit a replacement decision.';
            buttons.forEach(function (button) { button.disabled = false; button.removeAttribute('aria-busy'); });
            return loadState().then(function () {
              status.textContent = 'The response was unavailable. Current native state was reread; do not submit a replacement decision.';
            });
          });
      }
      function renderView(view) {
        var article = node('article');
        var header = node('header');
        var headingId = 'work-heading-' + String(++headingSequence);
        var heading = node('h3', actionLabels[view.action.action] || view.action.action);
        heading.id = headingId;
        article.setAttribute('aria-labelledby', headingId);
        var nativeReason = text(view.native.reasonCode);
        header.append(heading, node('p', labels[view.category] + ' · ' + nativeReason, 'reason'), node('p', reasonMessage(view), 'notice'));
        article.append(header, actionFields(view));
        if (view.freshness && view.freshness.refetchRequired) {
          article.append(node('p', 'This request has changed. Refresh to see its current status.', 'notice'));
        }
        if (view.category === 'NEEDS_YOU' && view.approval && view.approval.status === 'PENDING') {
          var actions = node('div', undefined, 'actions');
          actions.setAttribute('role', 'group');
          actions.setAttribute('aria-label', 'Human decision for ' + (actionLabels[view.action.action] || view.action.action));
          var approve = node('button', 'Approve this action', 'approve');
          var reject = node('button', 'Reject this action', 'reject');
          approve.type = 'button'; reject.type = 'button';
          approve.setAttribute('aria-label', 'Approve ' + (actionLabels[view.action.action] || view.action.action));
          reject.setAttribute('aria-label', 'Reject ' + (actionLabels[view.action.action] || view.action.action));
          approve.setAttribute('aria-describedby', headingId);
          reject.setAttribute('aria-describedby', headingId);
          approve.addEventListener('click', function () { submit(view, 'APPROVE', [approve, reject]); });
          reject.addEventListener('click', function () { submit(view, 'REJECT', [approve, reject]); });
          actions.append(approve, reject);
          article.append(actions);
        }
        evidence(article, view);
        activity(article, view);
        return article;
      }
      function renderState(body) {
        var views = Array.isArray(body.views) ? body.views : [];
        ['HANDLED_AUTOMATICALLY', 'NEEDS_YOU', 'BLOCKED', 'ACTIVITY'].forEach(function (category) {
          var count = views.filter(function (view) { return view.category === category; }).length;
          var id = category.toLowerCase().replaceAll('_', '-') + '-count';
          var element = document.getElementById(id);
          if (element) element.textContent = String(count) + (count === 1 ? ' item' : ' items');
        });
        root.setAttribute('aria-busy', 'false');
        root.replaceChildren();
        if (views.length === 0) { root.append(node('p', 'No current work.', 'empty')); return; }
        views.forEach(function (view) { root.append(renderView(view)); });
      }
      function loadState() {
        var requestId = ++latestRequest;
        if (inFlight) inFlight.abort();
        inFlight = new AbortController();
        root.setAttribute('aria-busy', 'true');
        status.textContent = 'Reading current state from the trusted host…';
        return fetch('/mp07/state', { headers: { accept: 'application/json' }, signal: inFlight.signal })
          .then(function (response) {
            return response.json().then(function (body) {
              if (!response.ok) throw new Error(body && body.code ? body.code : 'STATE_READ_FAILURE');
              return body;
            });
          })
          .then(function (body) {
            if (requestId !== latestRequest) return;
            renderState(body);
            status.textContent = 'Current state loaded from the trusted host.';
          })
          .catch(function (error) {
            if (error && error.name === 'AbortError') return;
            if (requestId !== latestRequest) return;
            root.setAttribute('aria-busy', 'false');
            root.replaceChildren(node('p', 'Current state is unavailable. Use refresh to try again.', 'error'));
            status.textContent = error && error.message === 'STATE_READ_FAILURE' ? 'The local host is unavailable.' : 'Current state could not be read; refresh to try again.';
          })
          .finally(function () { if (requestId === latestRequest) inFlight = null; });
      }
      document.getElementById('refresh').addEventListener('click', loadState);
      loadState();
    }());
  </script>
</body>
</html>`;

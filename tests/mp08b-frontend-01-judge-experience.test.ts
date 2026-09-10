import { describe, expect, it } from "vitest";

import { createMp07DemoViews, createMp07LocalDemoServer } from "../apps/host/src/demo.js";
import { listenMp07LocalServer } from "../apps/host/src/server.js";
import { MP07_DASHBOARD_DOCUMENT } from "../apps/web/src/index.js";

describe("MP08B FRONTEND-01 judge-facing product hierarchy", () => {
  it("presents the four accepted MP-07 categories as the only top-level work groups", () => {
    const categories = ["HANDLED_AUTOMATICALLY", "NEEDS_YOU", "BLOCKED", "ACTIVITY"] as const;
    for (const category of categories) {
      expect(MP07_DASHBOARD_DOCUMENT).toContain(`data-category="${category}"`);
    }
    expect(MP07_DASHBOARD_DOCUMENT.match(/class="category" data-category=/g)).toHaveLength(4);
    expect(new Set(createMp07DemoViews().map((view) => view.category))).toEqual(
      new Set(categories),
    );
  });

  it("renders category membership only from each accepted product view", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain(
      "views.filter(function (view) { return view.category === category; })",
    );
    expect(MP07_DASHBOARD_DOCUMENT).not.toMatch(/view\.category\s*=(?!=)/);
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("providerMessageId");
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("MessageId");
  });

  it("uses human action labels and retains consequential decision fields", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Send appointment details");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Reschedule appointment");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Transmit customer contact directory");
    for (const label of [
      "Booking ID",
      "Recipient address",
      "Current start",
      "Proposed start",
      "Time zone",
      "Directory resource ID",
      "Export format",
      "Target",
      "Resource",
    ]) {
      expect(MP07_DASHBOARD_DOCUMENT).toContain(label);
    }
  });

  it("gives current NEEDS_YOU items semantic, bounded decision controls", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain(
      "view.category === 'NEEDS_YOU' && view.approval && view.approval.status === 'PENDING'",
    );
    expect(MP07_DASHBOARD_DOCUMENT).toContain("node('button', 'Approve'");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("node('button', 'Reject'");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("schemaVersion: 'human-decision-v1'");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("pending.has(approval.approvalId)");
  });

  it("waits for a server reread instead of manufacturing an approved category", () => {
    const submitStart = MP07_DASHBOARD_DOCUMENT.indexOf("function submit(");
    const renderStart = MP07_DASHBOARD_DOCUMENT.indexOf("function renderView(");
    const submitSource = MP07_DASHBOARD_DOCUMENT.slice(submitStart, renderStart);
    expect(submitSource).toContain("return loadState()");
    expect(submitSource).not.toContain("renderProductState");
    expect(submitSource).not.toMatch(/category\s*:/);
    expect(submitSource).not.toMatch(/category\s*=/);
  });

  it("fails visibly and rereads without fabricating decision success", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain(
      "The response was unavailable. Rereading current state; do not submit a replacement decision.",
    );
    expect(MP07_DASHBOARD_DOCUMENT).toContain(
      "Current state could not be read. No product state was inferred in the browser.",
    );
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("alert(");
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("setInterval");
  });

  it("discloses synthetic runtime truth and never presents fixture completion as real delivery", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain("SYNTHETIC_LOCAL_DEMO");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Synthetic demo");
    expect(MP07_DASHBOARD_DOCUMENT).toContain(
      "Deterministic demo fixture — no real email or external effect occurred.",
    );
    expect(MP07_DASHBOARD_DOCUMENT).not.toMatch(/>LIVE</);
  });

  it("keeps UNKNOWN conservative and distinct from handled completion", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain(
      "What happened is uncertain. Moirae will not treat this as complete or repeat the effect.",
    );
    const unknown = createMp07DemoViews().find((view) => view.native.mp04Status === "UNKNOWN");
    expect(unknown?.category).toBe("BLOCKED");
    expect(unknown?.category).not.toBe("HANDLED_AUTOMATICALLY");
  });

  it("uses progressive disclosure, bounded identifiers, and intentional empty states", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Evidence and history");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Technical evidence");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Processing history");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("function shortId(value)");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("overflow-wrap: anywhere");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Nothing needs your decision.");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("No work is currently in progress.");
  });

  it("preserves semantic, responsive, keyboard, and reduced-motion behavior", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain('class="skip-link"');
    expect(MP07_DASHBOARD_DOCUMENT).toContain('type="button"');
    expect(MP07_DASHBOARD_DOCUMENT).toContain("node('details')");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("summary:focus-visible");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("@media (max-width: 44rem)");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("prefers-reduced-motion: reduce");
    expect(MP07_DASHBOARD_DOCUMENT).toContain('aria-live="polite"');
  });

  it("isolates transport from MP-07 product rendering and contains no effect client", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain("var Mp07StateTransport = Object.freeze");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("function renderProductState(body)");
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("@aws-sdk");
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("SendEmail");
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("bedrock");
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("localStorage");
  });
});

describe("MP08B FRONTEND-01 local synthetic host", () => {
  it("serves both page routes, product state, and runtime-derived demo identity", async () => {
    const server = createMp07LocalDemoServer();
    const listener = await listenMp07LocalServer(server);
    const base = `http://${listener.host}:${listener.port}`;
    try {
      const [root, index, state, health] = await Promise.all([
        fetch(`${base}/`),
        fetch(`${base}/index.html`),
        fetch(`${base}/mp07/state`),
        fetch(`${base}/health`),
      ]);
      expect(root.status).toBe(200);
      expect(index.status).toBe(200);
      expect(await root.text()).toContain("Work is handled safely.");
      expect(await index.text()).toContain("You decide what matters.");
      expect((await state.json()).views).toHaveLength(4);
      expect((await health.json()).runtime.mode).toBe("SYNTHETIC_LOCAL_DEMO");
    } finally {
      await listener.close();
    }
  });
});

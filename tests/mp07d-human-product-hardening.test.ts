import { describe, expect, it } from "vitest";

import {
  createMp07DemoTransport,
  createMp07DemoViews,
  createMp07LocalDemoServer,
} from "../apps/host/src/demo.js";
import { createMp07LocalServer, listenMp07LocalServer } from "../apps/host/src/server.js";
import { Mp07LocalHostTransport } from "../apps/host/src/transport.js";
import { MP07_DASHBOARD_DOCUMENT } from "../apps/web/src/index.js";

async function demoServer() {
  const server = createMp07LocalDemoServer();
  const listener = await listenMp07LocalServer(server);
  return { listener, base: `http://${listener.host}:${listener.port}` };
}

describe("MP-07D human-product hardening", () => {
  it("keeps the four-category product hierarchy and exact demo action coverage", () => {
    const views = createMp07DemoViews();
    expect(new Set(views.map((view) => view.category))).toEqual(
      new Set(["HANDLED_AUTOMATICALLY", "NEEDS_YOU", "BLOCKED", "ACTIVITY"]),
    );
    expect(new Set(views.map((view) => view.action.action))).toEqual(
      new Set([
        "SEND_APPOINTMENT_DETAILS",
        "RESCHEDULE_APPOINTMENT",
        "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
      ]),
    );
    expect(views.find((view) => view.category === "NEEDS_YOU")?.action.parameters).toMatchObject({
      bookingId: "BOOKING-DEMO-1",
      currentStart: "2026-09-10T10:00:00.000Z",
      proposedStart: "2026-09-11T10:00:00.000Z",
      timeZone: "Europe/London",
    });
  });

  it("has bounded stale-state, accessibility, responsive, and non-authority markers", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain('class="skip-link"');
    expect(MP07_DASHBOARD_DOCUMENT).toContain('aria-live="polite"');
    expect(MP07_DASHBOARD_DOCUMENT).toContain('aria-atomic="true"');
    expect(MP07_DASHBOARD_DOCUMENT).toContain('aria-busy="true"');
    expect(MP07_DASHBOARD_DOCUMENT).toContain("setAttribute('role', 'group')");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("prefers-reduced-motion: reduce");
    expect(MP07_DASHBOARD_DOCUMENT).toContain(
      "This request has changed. Refresh to see its current status.",
    );
    expect(MP07_DASHBOARD_DOCUMENT).toContain("The response was unavailable.");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("AbortController");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("requestId !== latestRequest");
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("setInterval");
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("localStorage");
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("innerHTML");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("textContent");
  });

  it("runs the synthetic local judge scenario through the trusted host boundary", async () => {
    const { listener, base } = await demoServer();
    try {
      const page = await fetch(`${base}/`);
      const html = await page.text();
      expect(page.status).toBe(200);
      expect(html).toContain("Handled automatically");
      expect(html).toContain("Needs you");
      expect(html).toContain("Blocked");
      expect(html).toContain("Activity");

      const initial = await fetch(`${base}/mp07/state`).then((response) => response.json());
      const needs = initial.views.find(
        (view: { category: string }) => view.category === "NEEDS_YOU",
      );
      expect(needs.action.parameters).toMatchObject({
        bookingId: "BOOKING-DEMO-1",
        currentStart: "2026-09-10T10:00:00.000Z",
        proposedStart: "2026-09-11T10:00:00.000Z",
        timeZone: "Europe/London",
      });

      const decision = await fetch(`${base}/mp07/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "human-decision-v1",
          approvalId: needs.approval.approvalId,
          decision: "APPROVE",
          presentationDigest: needs.approval.presentationDigest,
          nativePresentationBindingHash: needs.approval.nativePresentationBindingHash,
        }),
      });
      expect(decision.status).toBe(200);
      const after = await fetch(`${base}/mp07/state`).then((response) => response.json());
      expect(
        after.views.find(
          (view: { work: { workId: string } }) => view.work.workId === "demo-needs-you",
        ).category,
      ).toBe("HANDLED_AUTOMATICALLY");
    } finally {
      await listener.close();
    }
  });

  it("keeps duplicate and forged decision submissions outside the trusted boundary", async () => {
    const transport = createMp07DemoTransport();
    const firstState = await transport.readState();
    const needs = firstState.views.find((view) => view.category === "NEEDS_YOU");
    if (!needs?.approval) throw new Error("demo approval missing");
    const envelope = {
      schemaVersion: "human-decision-v1",
      approvalId: needs.approval.approvalId,
      decision: "REJECT" as const,
      presentationDigest: needs.approval.presentationDigest,
      nativePresentationBindingHash: needs.approval.nativePresentationBindingHash,
    };
    expect(
      (await transport.submitDecision({ ...envelope, category: "HANDLED_AUTOMATICALLY" }))
        .statusCode,
    ).toBe(400);
    expect((await transport.submitDecision(envelope)).statusCode).toBe(200);
    expect((await transport.submitDecision(envelope)).statusCode).toBe(409);
    const state = await transport.readState();
    const rejected = state.views.find((view) => view.work.workId === "demo-needs-you");
    expect(rejected?.category).toBe("BLOCKED");
    expect(rejected?.native.reasonCode).toBe("APPROVAL_REJECTED");
  });

  it("recovers current state across a host restart without promoting browser state", async () => {
    const transport = createMp07DemoTransport();
    const firstServer = createMp07LocalServer(transport);
    const first = await listenMp07LocalServer(firstServer);
    const before = await fetch(`http://${first.host}:${first.port}/mp07/state`).then((response) =>
      response.json(),
    );
    await first.close();

    const secondServer = createMp07LocalServer(transport);
    const second = await listenMp07LocalServer(secondServer);
    try {
      const after = await fetch(`http://${second.host}:${second.port}/mp07/state`).then(
        (response) => response.json(),
      );
      expect(after).toEqual(before);
      expect(after.views.some((view: { category: string }) => view.category === "NEEDS_YOU")).toBe(
        true,
      );
    } finally {
      await second.close();
    }
  });

  it("returns host-unavailable rather than fabricating a product state", async () => {
    const transport = new Mp07LocalHostTransport({
      async readProductViews() {
        throw new Error("HOST_RESTARTED");
      },
      async resolveApprovalBinding() {
        return undefined;
      },
    });
    const server = createMp07LocalServer(transport);
    const listener = await listenMp07LocalServer(server);
    try {
      const response = await fetch(`http://${listener.host}:${listener.port}/mp07/state`);
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBe("STATE_READ_FAILURE");
    } finally {
      await listener.close();
    }
  });
});

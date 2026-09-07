import { describe, expect, it } from "vitest";

import {
  MP08B_DEFAULT_HOST,
  MP08B_DEFAULT_PORT,
  MP08B_RUNTIME_MODE,
  Mp08bRuntimeConfigurationError,
  parseMp08bRuntimeConfig,
} from "../apps/host/src/runtime.js";
import { startMp08bSyntheticService } from "../apps/host/src/main.js";

async function getJson(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("MP-08B runtime prerequisite", () => {
  it("uses a loopback host and predictable port by default", () => {
    const config = parseMp08bRuntimeConfig({});

    expect(config.host).toBe(MP08B_DEFAULT_HOST);
    expect(config.port).toBe(MP08B_DEFAULT_PORT);
    expect(config.runtime.mode).toBe(MP08B_RUNTIME_MODE);
  });

  it("accepts explicit valid host and port configuration", () => {
    expect(parseMp08bRuntimeConfig({ HOST: "localhost", PORT: "32123" })).toMatchObject({
      host: "localhost",
      port: 32123,
    });
    expect(parseMp08bRuntimeConfig({ HOST: "0.0.0.0", PORT: "443" })).toMatchObject({
      host: "0.0.0.0",
      port: 443,
    });
  });

  it.each(["", "0", "65536", "12.5", "-1", "PORT"])("rejects invalid port %s", (port) => {
    expect(() => parseMp08bRuntimeConfig({ PORT: port })).toThrow(Mp08bRuntimeConfigurationError);
  });

  it.each(["http://localhost", "bad host", "/tmp/socket", "[::1]"])(
    "rejects malformed host %s",
    (host) => {
      expect(() => parseMp08bRuntimeConfig({ HOST: host })).toThrow(Mp08bRuntimeConfigurationError);
    },
  );

  it("rejects invalid build identity instead of fabricating one", () => {
    expect(() => parseMp08bRuntimeConfig({ MOIRAE_BUILD_COMMIT: "not-a-sha" })).toThrow(
      Mp08bRuntimeConfigurationError,
    );
  });

  it("serves health, readiness, and existing MP-07 routes from the synthetic runtime", async () => {
    const config = parseMp08bRuntimeConfig({
      MOIRAE_BUILD_ID: "runtime-test",
      MOIRAE_BUILD_COMMIT: "a".repeat(40),
      MOIRAE_BUILD_TREE: "b".repeat(40),
    });
    const service = await startMp08bSyntheticService({ ...config, port: 0 });

    try {
      const baseUrl = `http://${service.host}:${service.port}`;
      const health = await getJson(`${baseUrl}/health`);
      const ready = await getJson(`${baseUrl}/ready`);
      const state = await getJson(`${baseUrl}/mp07/state`);
      const dashboard = await fetch(`${baseUrl}/`);

      expect(health.status).toBe(200);
      expect(health.body.status).toBe("ok");
      expect((health.body.runtime as Record<string, unknown>).mode).toBe(MP08B_RUNTIME_MODE);
      expect((health.body.runtime as Record<string, unknown>).buildId).toBe("runtime-test");

      expect(ready.status).toBe(200);
      expect(ready.body.ready).toBe(true);
      expect((ready.body.runtime as Record<string, unknown>).capabilities).toEqual({
        liveStrands: false,
        liveFates: false,
        durableApproval: false,
        hostedDurableQueue: false,
        externalEffects: false,
      });

      expect(state.status).toBe(200);
      expect(Array.isArray(state.body.views)).toBe(true);
      expect((state.body.views as unknown[]).length).toBe(4);
      expect(dashboard.status).toBe(200);
      expect(await dashboard.text()).toContain("Moirae work");
    } finally {
      await service.stop();
    }
  });

  it("closes cleanly and makes shutdown idempotent", async () => {
    const service = await startMp08bSyntheticService({
      ...parseMp08bRuntimeConfig({}),
      port: 0,
    });
    const baseUrl = `http://${service.host}:${service.port}`;

    await expect(fetch(`${baseUrl}/health`)).resolves.toHaveProperty("status", 200);
    await service.stop();
    await expect(service.stop()).resolves.toBeUndefined();
    await expect(fetch(`${baseUrl}/health`)).rejects.toThrow();
  });
});

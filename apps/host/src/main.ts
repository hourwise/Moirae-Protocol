import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createMp07LocalDemoServer } from "./demo.js";
import { listenMp07LocalServer } from "./server.js";
import { parseMp08bRuntimeConfig, type Mp08bRuntimeConfigV1 } from "./runtime.js";

const SHUTDOWN_TIMEOUT_MS = 5_000;

export type StartedMp08bSyntheticService = Readonly<{
  readonly config: Mp08bRuntimeConfigV1;
  readonly host: string;
  readonly port: number;
  readonly stop: () => Promise<void>;
}>;

async function closeWithinTimeout(
  server: ReturnType<typeof createMp07LocalDemoServer>,
  close: () => Promise<void>,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      close(),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          server.closeAllConnections();
          resolve();
        }, SHUTDOWN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function startMp08bSyntheticService(
  config: Mp08bRuntimeConfigV1 = parseMp08bRuntimeConfig(),
): Promise<StartedMp08bSyntheticService> {
  const server = createMp07LocalDemoServer(config.runtime);
  const listener = await listenMp07LocalServer(server, config.port, config.host);
  let stopped = false;

  return {
    config,
    host: listener.host,
    port: listener.port,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await closeWithinTimeout(server, listener.close);
    },
  };
}

function externalBindingWarning(host: string): string | undefined {
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") return undefined;
  return "WARNING: explicit non-loopback binding exposes an unauthenticated synthetic demo; this is not production-safe.";
}

export async function runMp08bSyntheticLauncher(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  let service: StartedMp08bSyntheticService;
  try {
    service = await startMp08bSyntheticService(parseMp08bRuntimeConfig(env));
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid startup configuration";
    console.error(`MP-08B runtime startup failed: ${message}`);
    process.exitCode = 1;
    return;
  }

  const warning = externalBindingWarning(service.host);
  if (warning) console.warn(warning);
  console.log(
    JSON.stringify(
      {
        event: "mp08b_runtime_started",
        binding: { host: service.host, port: service.port },
        runtime: service.config.runtime,
        routes: ["/", "/index.html", "/mp07/state", "/mp07/decision", "/health", "/ready"],
      },
      null,
      2,
    ),
  );

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    void service
      .stop()
      .then(() => {
        console.log(JSON.stringify({ event: "mp08b_runtime_stopped", signal }));
      })
      .catch(() => {
        console.error("MP-08B runtime shutdown failed.");
        process.exitCode = 1;
      });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  await new Promise<void>(() => undefined);
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entrypoint === fileURLToPath(import.meta.url)) void runMp08bSyntheticLauncher();

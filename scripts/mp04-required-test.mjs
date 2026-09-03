/* global console, process */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const requiredRoots = ["FATES_ANANKE_ROOT", "FATES_HORAE_ROOT"];
const missing = requiredRoots.filter((name) => {
  const value = process.env[name];
  return !value || !existsSync(value);
});

if (missing.length > 0) {
  console.error(
    `Required MP-04 integration cannot run; missing sealed dependency roots: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath
  ? process.execPath
  : process.platform === "win32"
    ? "npm.cmd"
    : "npm";
const npmArgs = npmExecPath
  ? [npmExecPath, "test", "--", "tests/mp04-durable-execution.test.ts"]
  : ["test", "--", "tests/mp04-durable-execution.test.ts"];
const result = spawnSync(npmCommand, npmArgs, {
  stdio: "inherit",
  env: { ...process.env, MP04_REQUIRE_REAL_FATES: "1" },
});

if (result.error) {
  console.error(`Unable to launch required MP-04 integration: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);

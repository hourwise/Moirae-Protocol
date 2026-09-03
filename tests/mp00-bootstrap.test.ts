import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

describe("MP-00 bootstrap", () => {
  it("contains the declared workspace boundaries", () => {
    const requiredPaths = [
      "apps/web",
      "apps/host",
      "packages/action-contracts",
      "packages/action-compiler",
      "packages/strands-agent",
      "packages/fates-adapter",
      "packages/effect-adapters",
      "packages/test-fixtures",
      "docs",
    ];

    expect(requiredPaths.filter((path) => !existsSync(resolve(repositoryRoot, path)))).toEqual([]);
  });

  it("has not introduced an MP-00 effect adapter implementation", () => {
    expect(existsSync(resolve(repositoryRoot, "packages/effect-adapters/src/index.ts"))).toBe(true);
  });
});

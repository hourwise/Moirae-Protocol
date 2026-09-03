/* global console, process */

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ANANKE_TAG = "ananke-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0";
const ANANKE_TAG_OBJECT = "9fb9fc4d8183db64aa37f0a4e167fdf41ca856e5";
const ANANKE_SHA = "114063e03332af3389fe805193e88a62111d9323";
const HORAE_TAG = "horae-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0";
const HORAE_TAG_OBJECT = "59763d34644567c59d1041b3acef24efc5a1d072";
const HORAE_SHA = "aa296b420fbcf578089ca66dc03f6d09d9b06f00";
const HORAE_RUNTIME_SHA = "7b24cb0af083e505bd2dc9fa55c6c3387f849131";
const ADRASTEIA_SHA = "a1c01bf9e6f9d6a126cfdcc1acfacd488b214210";
const INTEGRATION_SHA = "3c7b1f9916833728882e71f79a7276e9a806f808";
const INTEGRATION_REF = "refs/heads/evidence/fates-007b-claim-aware-execution-acceptance";

function requiredPath(name) {
  const value = process.env[name];
  if (!value || !existsSync(value)) {
    throw new Error(`${name} is required and must point to an existing checkout`);
  }
  return value;
}

function git(root, args) {
  return execFileSync("git", ["-c", `safe.directory=${root}`, "-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
}

function assertAncestor(root, ancestor, descendant, label) {
  try {
    execFileSync("git", [
      "-c",
      `safe.directory=${root}`,
      "-C",
      root,
      "merge-base",
      "--is-ancestor",
      ancestor,
      descendant,
    ]);
  } catch {
    throw new Error(`${label} is not an ancestor of ${descendant}`);
  }
}

try {
  const anankeRoot = requiredPath("FATES_ANANKE_ROOT");
  const horaeRoot = requiredPath("FATES_HORAE_ROOT");
  const adrasteiaRoot = requiredPath("FATES_ADRASTEIA_ROOT");
  const integrationUrl =
    process.env.FATES_INTEGRATION_REPO_URL ??
    "https://github.com/hourwise/Project-Fates-Integration.git";

  assertEqual(
    "Ananke tag object",
    git(anankeRoot, ["rev-parse", `refs/tags/${ANANKE_TAG}`]),
    ANANKE_TAG_OBJECT,
  );
  assertEqual(
    "Ananke peeled SHA",
    git(anankeRoot, ["rev-parse", `refs/tags/${ANANKE_TAG}^{}`]),
    ANANKE_SHA,
  );
  assertEqual(
    "Horae tag object",
    git(horaeRoot, ["rev-parse", `refs/tags/${HORAE_TAG}`]),
    HORAE_TAG_OBJECT,
  );
  assertEqual(
    "Horae peeled SHA",
    git(horaeRoot, ["rev-parse", `refs/tags/${HORAE_TAG}^{}`]),
    HORAE_SHA,
  );
  assertAncestor(horaeRoot, HORAE_RUNTIME_SHA, HORAE_SHA, "Horae runtime SHA");
  assertEqual("Adrasteia SHA", git(adrasteiaRoot, ["rev-parse", "HEAD"]), ADRASTEIA_SHA);

  const evidenceRef = execFileSync("git", ["ls-remote", integrationUrl, INTEGRATION_REF], {
    encoding: "utf8",
  })
    .trim()
    .split(/\s+/)[0];
  assertEqual("FATES-007B evidence SHA", evidenceRef, INTEGRATION_SHA);

  console.log("Sealed public Fates refs verified:");
  console.log(`  Ananke ${ANANKE_TAG} -> ${ANANKE_SHA}`);
  console.log(`  Horae ${HORAE_TAG} -> ${HORAE_SHA}`);
  console.log(`  Adrasteia -> ${ADRASTEIA_SHA}`);
  console.log(`  Integration ${INTEGRATION_REF} -> ${INTEGRATION_SHA}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

/* global console, process */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ANANKE_TAG = "ananke-fates-008a-durable-human-approval-v0.1.0-protocol-1.4.0";
const ANANKE_TAG_OBJECT = "0fa08f78f27e2f79c895402f3f53a8aada5837b4";
const ANANKE_SHA = "b888d61adf180d33e2ae2e61d276cb9b0f13bd12";
const ANANKE_RUNTIME_SHA = "c89b83de40ed0275969fe3931220f440bf082aa3";
const ANANKE_PARENT_TAG = "ananke-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0";
const ANANKE_PARENT_TAG_OBJECT = "9fb9fc4d8183db64aa37f0a4e167fdf41ca856e5";
const ANANKE_PARENT_SHA = "114063e03332af3389fe805193e88a62111d9323";
const HORAE_TAG = "horae-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0";
const HORAE_TAG_OBJECT = "59763d34644567c59d1041b3acef24efc5a1d072";
const HORAE_SHA = "aa296b420fbcf578089ca66dc03f6d09d9b06f00";
const HORAE_RUNTIME_SHA = "7b24cb0af083e505bd2dc9fa55c6c3387f849131";
const ADRASTEIA_SHA = "a1c01bf9e6f9d6a126cfdcc1acfacd488b214210";
const ADRASTEIA_REF = "refs/heads/release/webmcp-runtime-v0.6.2";
const EVIDENCE_REF = "refs/heads/codex/fates-008h-acceptance-evidence";
const EVIDENCE_SHA = "cc889456dc16a908041d8d70425438ad56d483c8";
const EVIDENCE_ACCEPTANCE_SHA = "0f06f7564ad13728dfe4e4848f0c32d8d7859db0";
const EVIDENCE_FILE = "docs/evidence/fates-008h-durable-human-approval-acceptance.json";
const EVIDENCE_FILE_SHA256 = "c83afec825c3ed9248091730410d942830a2dfbbb8ad6f98245cacfbc2cb5b9b";

function requiredPath(name) {
  const value = process.env[name];
  if (!value || !existsSync(value)) {
    throw new Error(`${name} is required and must point to an existing public checkout`);
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

function publicRef(url, ref) {
  const value = execFileSync("git", ["ls-remote", url, ref], { encoding: "utf8" })
    .trim()
    .split(/\s+/)[0];
  if (!value) {
    throw new Error(`public ref is missing: ${url} ${ref}`);
  }
  return value;
}

try {
  const anankeRoot = requiredPath("MP05_FATES_ANANKE_ROOT");
  const horaeRoot = requiredPath("MP05_FATES_HORAE_ROOT");
  const adrasteiaRoot = requiredPath("MP05_FATES_ADRASTEIA_ROOT");
  const evidenceRoot = requiredPath("MP05_FATES_INTEGRATION_ROOT");
  const anankeUrl =
    process.env.MP05_FATES_ANANKE_URL ?? "https://github.com/hourwise/Project-Ananke.git";
  const horaeUrl =
    process.env.MP05_FATES_HORAE_URL ?? "https://github.com/hourwise/Project-Horae.git";
  const adrasteiaUrl =
    process.env.MP05_FATES_ADRASTEIA_URL ?? "https://github.com/hourwise/Project-Adrasteia.git";
  const evidenceUrl =
    process.env.MP05_FATES_INTEGRATION_URL ??
    "https://github.com/hourwise/Project-Fates-Integration.git";

  assertEqual(
    "public Ananke tag",
    publicRef(anankeUrl, `refs/tags/${ANANKE_TAG}`),
    ANANKE_TAG_OBJECT,
  );
  assertEqual("public Ananke peel", publicRef(anankeUrl, `refs/tags/${ANANKE_TAG}^{}`), ANANKE_SHA);
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
    "Ananke parent tag object",
    git(anankeRoot, ["rev-parse", `refs/tags/${ANANKE_PARENT_TAG}`]),
    ANANKE_PARENT_TAG_OBJECT,
  );
  assertEqual(
    "Ananke parent peeled SHA",
    git(anankeRoot, ["rev-parse", `refs/tags/${ANANKE_PARENT_TAG}^{}`]),
    ANANKE_PARENT_SHA,
  );
  assertAncestor(anankeRoot, ANANKE_PARENT_SHA, ANANKE_SHA, "accepted FATES-007A ancestry");
  assertAncestor(anankeRoot, ANANKE_RUNTIME_SHA, ANANKE_SHA, "FATES-008 runtime ancestry");

  assertEqual("public Horae tag", publicRef(horaeUrl, `refs/tags/${HORAE_TAG}`), HORAE_TAG_OBJECT);
  assertEqual("public Horae peel", publicRef(horaeUrl, `refs/tags/${HORAE_TAG}^{}`), HORAE_SHA);
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
  assertAncestor(horaeRoot, HORAE_RUNTIME_SHA, HORAE_SHA, "accepted Horae runtime ancestry");

  assertEqual("public Adrasteia SHA", publicRef(adrasteiaUrl, ADRASTEIA_REF), ADRASTEIA_SHA);
  assertEqual("Adrasteia SHA", git(adrasteiaRoot, ["rev-parse", "HEAD"]), ADRASTEIA_SHA);

  assertEqual(
    "public FATES-008H evidence branch",
    publicRef(evidenceUrl, EVIDENCE_REF),
    EVIDENCE_SHA,
  );
  assertEqual(
    "FATES-008H evidence checkout",
    git(evidenceRoot, ["rev-parse", "HEAD"]),
    EVIDENCE_SHA,
  );
  assertAncestor(
    evidenceRoot,
    EVIDENCE_ACCEPTANCE_SHA,
    EVIDENCE_SHA,
    "FATES-008H acceptance evidence ancestry",
  );
  const evidencePath = `${evidenceRoot}/${EVIDENCE_FILE}`;
  assertEqual(
    "FATES-008H evidence file SHA-256",
    createHash("sha256").update(readFileSync(evidencePath)).digest("hex"),
    EVIDENCE_FILE_SHA256,
  );

  console.log("MP-05 public Fates dependency set verified:");
  console.log(`  Ananke ${ANANKE_TAG} -> ${ANANKE_SHA}`);
  console.log(`  Horae ${HORAE_TAG} -> ${HORAE_SHA}`);
  console.log(`  Adrasteia -> ${ADRASTEIA_SHA}`);
  console.log(`  FATES-008H evidence ${EVIDENCE_REF} -> ${EVIDENCE_SHA}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

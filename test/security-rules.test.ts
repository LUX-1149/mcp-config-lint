import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scanPaths } from "../src/scanner.js";

const ROOT = resolve(process.cwd());
const UNSAFE_FIXTURE_DIR = resolve(ROOT, "test", "fixtures", "unsafe");
const SECRET_LITERAL = "not_a_real_secret_value_for_test_only";

async function scanUnsafeFixture(fileName: string) {
  const filePath = resolve(UNSAFE_FIXTURE_DIR, fileName);
  return scanPaths({
    cwd: ROOT,
    paths: [filePath],
    includes: [],
    excludes: []
  });
}

describe("deterministic security rules (fixture-based)", () => {
  const expectations: Array<{ file: string; ruleId: string; severity: "low" | "medium" | "high" }> = [
    { file: "hardcoded-env-secret.json", ruleId: "hardcoded-env-secret", severity: "high" },
    { file: "suspicious-env-literal.json", ruleId: "suspicious-env-literal", severity: "medium" },
    { file: "dangerous-shell-pipeline.json", ruleId: "dangerous-shell-pipeline", severity: "high" },
    { file: "privilege-escalation-command.json", ruleId: "privilege-escalation-command", severity: "high" },
    { file: "unpinned-package-runner.json", ruleId: "unpinned-package-runner", severity: "medium" },
    { file: "sensitive-filesystem-reference.json", ruleId: "sensitive-filesystem-reference", severity: "high" },
    { file: "broad-home-directory-access.json", ruleId: "broad-home-directory-access", severity: "medium" },
    { file: "network-fetch-command.json", ruleId: "network-fetch-command", severity: "low" }
  ];

  for (const testCase of expectations) {
    it(`reports ${testCase.ruleId} with severity ${testCase.severity}`, async () => {
      const result = await scanUnsafeFixture(testCase.file);
      const finding = result.findings.find((entry) => entry.ruleId === testCase.ruleId);

      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(testCase.severity);
    });
  }

  it("never leaks the full unsafe env secret value in output", async () => {
    const result = await scanUnsafeFixture("hardcoded-env-secret.json");

    const finding = result.findings.find((entry) => entry.ruleId === "hardcoded-env-secret");
    expect(finding?.redactedValue).toBe(`[REDACTED length=${SECRET_LITERAL.length}]`);

    for (const entry of result.findings) {
      expect(entry.redactedValue ?? "").not.toContain(SECRET_LITERAL);
      expect(entry.message).not.toContain(SECRET_LITERAL);
    }
  });
});

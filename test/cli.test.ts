import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const DIST_CLI = resolve(ROOT, "dist", "cli.js");
const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";

function runNpm(args: string[]) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return spawnSync(process.execPath, [npmExecPath, ...args], {
      cwd: ROOT,
      encoding: "utf8"
    });
  }

  return spawnSync(NPM_CMD, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32"
  });
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, [DIST_CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8"
  });
}

beforeAll(() => {
  if (!existsSync(DIST_CLI)) {
    const build = runNpm(["run", "build"]);

    if (build.status !== 0) {
      throw new Error(
        `Failed to build CLI for tests:\n${build.stdout ?? ""}\n${build.stderr ?? ""}`
      );
    }
  }
});

describe("CLI integration", () => {
  it("returns exit 0 for safe fixtures", () => {
    const result = runCli(["test/fixtures/safe/**/*.json*", "--no-color"]);

    expect(result.status).toBe(0);
  });

  it("returns exit 1 for unsafe fixtures with default fail-on high", () => {
    const result = runCli(["test/fixtures/unsafe/*.json*", "--no-color"]);

    expect(result.status).toBe(1);
  });

  it("returns stable JSON shape with --json", () => {
    const result = runCli(["test/fixtures/unsafe/hardcoded-env-secret.json", "--json", "--no-color"]);

    expect(result.status).toBe(1);

    const parsed = JSON.parse(result.stdout) as {
      scannedFiles: number;
      findings: Array<{
        ruleId: string;
        severity: string;
        filePath: string;
        line: number | null;
        pointer: string | null;
        message: string;
        remediation: string;
        redactedValue: string | null;
      }>;
    };

    expect(typeof parsed.scannedFiles).toBe("number");
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThan(0);

    const first = parsed.findings[0];
    expect(Object.keys(first)).toEqual([
      "ruleId",
      "severity",
      "filePath",
      "line",
      "pointer",
      "message",
      "remediation",
      "redactedValue"
    ]);
  });
});

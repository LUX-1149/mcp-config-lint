import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanPaths } from "../src/scanner.js";

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirs.splice(0).map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    })
  );
});

async function createWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-config-lint-"));
  createdDirs.push(dir);
  return dir;
}

describe("scanPaths", () => {
  it("finds no issues for a safe placeholder config", async () => {
    const cwd = await createWorkspace();
    const configPath = join(cwd, "mcp.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            demo: {
              command: "node",
              args: ["./tools/example-server.js"],
              env: {
                API_KEY: "EXAMPLE_TOKEN"
              }
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await scanPaths({
      cwd,
      paths: [],
      includes: [],
      excludes: []
    });

    expect(result.scannedFiles).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it("reports invalid-json findings for malformed JSONC", async () => {
    const cwd = await createWorkspace();
    const configPath = join(cwd, ".mcp.json");
    await writeFile(configPath, "{\n  // invalid trailing structure\n  \"mcpServers\": {\n", "utf8");

    const result = await scanPaths({
      cwd,
      paths: [],
      includes: [],
      excludes: []
    });

    expect(result.findings.some((finding) => finding.ruleId === "invalid-json")).toBe(true);
    expect(result.findings.some((finding) => finding.severity === "high")).toBe(true);
  });

  it("scans explicitly passed files even if not in known discovery names", async () => {
    const cwd = await createWorkspace();
    const nested = join(cwd, "configs");
    await mkdir(nested, { recursive: true });
    const explicitPath = join(nested, "custom-config.json");
    await writeFile(explicitPath, "{\"token\":\"REPLACE_ME\"}", "utf8");

    const result = await scanPaths({
      cwd,
      paths: [explicitPath],
      includes: [],
      excludes: []
    });

    expect(result.scannedFiles).toBe(1);
  });
});

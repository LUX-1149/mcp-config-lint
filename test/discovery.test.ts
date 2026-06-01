import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverConfigFiles } from "../src/discover.js";

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirs.splice(0).map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    })
  );
});

async function createWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-config-lint-discovery-"));
  createdDirs.push(dir);
  return dir;
}

function toRelative(cwd: string, filePath: string): string {
  return relative(cwd, filePath).replace(/\\/g, "/");
}

describe("discoverConfigFiles", () => {
  it("finds all expected MCP config naming conventions", async () => {
    const cwd = await createWorkspace();

    await mkdir(join(cwd, ".vscode"), { recursive: true });
    await mkdir(join(cwd, ".cursor"), { recursive: true });
    await mkdir(join(cwd, "node_modules", "pkg"), { recursive: true });

    const expected = [
      ".mcp.json",
      "mcp.json",
      ".vscode/mcp.json",
      "claude_desktop_config.json",
      ".cursor/mcp.json",
      "windsurf_mcp_config.json"
    ];

    for (const file of expected) {
      await writeFile(join(cwd, file), "{}", "utf8");
    }

    await writeFile(join(cwd, "node_modules", "pkg", "mcp.json"), "{}", "utf8");

    const discovered = await discoverConfigFiles({
      cwd,
      paths: [cwd],
      includes: [],
      excludes: []
    });

    const rel = discovered.map((filePath) => toRelative(cwd, resolve(filePath))).sort();

    expect(rel).toEqual(expected.sort());
  });
});

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfigFile } from "../src/parse.js";

const ROOT = resolve(process.cwd());

describe("parseConfigFile", () => {
  it("parses JSONC safely", async () => {
    const filePath = resolve(ROOT, "test", "fixtures", "safe", "jsonc-safe.jsonc");
    const parsed = await parseConfigFile(filePath);

    expect(parsed.findings).toHaveLength(0);
    expect(parsed.data).toBeTypeOf("object");
  });

  it("reports invalid-json with high severity on parse errors", async () => {
    const filePath = resolve(ROOT, "test", "fixtures", "unsafe", "invalid-jsonc.jsonc");
    const parsed = await parseConfigFile(filePath);

    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.findings[0]?.ruleId).toBe("invalid-json");
    expect(parsed.findings[0]?.severity).toBe("high");
  });
});

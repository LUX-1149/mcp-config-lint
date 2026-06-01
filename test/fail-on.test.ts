import { describe, expect, it } from "vitest";
import { hasFailingFindings } from "../src/threshold.js";

describe("hasFailingFindings", () => {
  const findings = [
    { severity: "low" as const },
    { severity: "medium" as const },
    { severity: "high" as const }
  ];

  it("returns false for fail-on none", () => {
    expect(hasFailingFindings(findings, "none")).toBe(false);
  });

  it("matches low threshold", () => {
    expect(hasFailingFindings(findings, "low")).toBe(true);
  });

  it("matches medium threshold", () => {
    expect(hasFailingFindings([{ severity: "low" }], "medium")).toBe(false);
    expect(hasFailingFindings([{ severity: "medium" }], "medium")).toBe(true);
  });

  it("matches high threshold", () => {
    expect(hasFailingFindings([{ severity: "medium" }], "high")).toBe(false);
    expect(hasFailingFindings([{ severity: "high" }], "high")).toBe(true);
  });
});

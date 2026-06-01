import type { FailOnLevel, Severity } from "./types.js";

const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3
};

export function hasFailingFindings(
  findings: Array<{ severity: Severity }>,
  failOn: FailOnLevel
): boolean {
  if (failOn === "none") {
    return false;
  }

  const threshold = SEVERITY_WEIGHT[failOn];
  return findings.some((finding) => SEVERITY_WEIGHT[finding.severity] >= threshold);
}

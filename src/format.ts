import pc from "picocolors";
import type { Finding, ScanResult } from "./types.js";

interface FormatOptions {
  color: boolean;
}

interface JsonFinding {
  ruleId: string;
  severity: string;
  filePath: string;
  line: number | null;
  pointer: string | null;
  message: string;
  remediation: string;
  redactedValue: string | null;
}

function colorize(enabled: boolean) {
  if (enabled) {
    return pc;
  }

  return {
    red: (x: string) => x,
    yellow: (x: string) => x,
    green: (x: string) => x,
    cyan: (x: string) => x,
    bold: (x: string) => x
  };
}

function byFile(findings: Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const finding of findings) {
    const group = map.get(finding.filePath) ?? [];
    group.push(finding);
    map.set(finding.filePath, group);
  }
  return map;
}

function toJsonFinding(finding: Finding): JsonFinding {
  return {
    ruleId: finding.ruleId,
    severity: finding.severity,
    filePath: finding.filePath,
    line: finding.line ?? null,
    pointer: finding.pointer ?? null,
    message: finding.message,
    remediation: finding.remediation,
    redactedValue: finding.redactedValue ?? null
  };
}

export function formatJson(result: ScanResult): string {
  const payload = {
    scannedFiles: result.scannedFiles,
    findings: result.findings.map(toJsonFinding)
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function formatHuman(result: ScanResult, options: FormatOptions): string {
  const c = colorize(options.color);
  if (result.findings.length === 0) {
    return c.green(`No findings. Scanned ${result.scannedFiles} file(s).\n`);
  }

  const groups = byFile(result.findings);
  const lines: string[] = [];

  for (const [filePath, items] of groups) {
    lines.push(c.bold(c.cyan(filePath)));
    for (const item of items) {
      const severityColor =
        item.severity === "high" ? c.red : item.severity === "medium" ? c.yellow : c.cyan;

      lines.push(
        `  ${severityColor(item.severity.toUpperCase())} ${item.ruleId} line ${item.line ?? "?"}`
      );
      lines.push(`    ${item.message}`);
      lines.push(`    remediation: ${item.remediation}`);
      if (item.pointer) {
        lines.push(`    pointer: ${item.pointer}`);
      }
      if (item.redactedValue) {
        lines.push(`    snippet: ${item.redactedValue}`);
      }
    }
    lines.push("");
  }

  lines.push(
    c.red(
      `Findings: ${result.findings.length}. Scanned ${result.scannedFiles} file(s).`
    )
  );

  return `${lines.join("\n")}\n`;
}

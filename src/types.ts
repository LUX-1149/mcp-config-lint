export type Severity = "low" | "medium" | "high";

export type FailOnLevel = Severity | "none";

export interface Finding {
  ruleId: string;
  severity: Severity;
  filePath: string;
  pointer?: string;
  line?: number;
  message: string;
  remediation: string;
  redactedValue?: string;
}

export interface ScanResult {
  scannedFiles: number;
  findings: Finding[];
}

export interface ScanOptions {
  cwd: string;
  paths: string[];
  includes: string[];
  excludes: string[];
}

export interface ParsedConfig {
  filePath: string;
  text: string;
  data: unknown;
  findings: Finding[];
}

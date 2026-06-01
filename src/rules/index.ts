import { isClearlyPlaceholderPath, isSafeEnvPlaceholder, maskCommandString, redactWithLength } from "../mask.js";
import type { Finding } from "../types.js";

interface RuleInput {
  filePath: string;
  text: string;
  data: unknown;
}

interface StringContext {
  pointer: string;
  value: string;
}

const SUSPICIOUS_ENV_KEY = /(?:token|secret|password|api_key|apikey|private_key|client_secret|access_key|credential)/i;
const FETCH_COMMAND = /\b(?:curl|wget|iwr|Invoke-WebRequest)\b/i;
const PIPELINE_FETCH = /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash)\b/i;
const POWERSHELL_IEX = /\bpowershell(?:\.exe)?\b[^\n]*\biex\b/i;
const INVOKE_IEX = /\b(?:Invoke-WebRequest|iwr)\b[^\n]*\biex\b/i;
const SHELL_C_REMOTE = /\b(?:bash|sh)\s+-c\b[^\n]*(?:curl|wget|iwr|Invoke-WebRequest)\b/i;
const EVAL_PATTERN = /\beval\b/i;
const PRIV_ESC_PATTERN = [
  /\bsudo\b/i,
  /\brunas\b/i,
  /\bchmod\s+777\b/i,
  /\bchown\b/i,
  /\brm\s+-rf\s+\/(?:\s|$)/i,
  /\bdel\s+\/s\s+\/q\s+C:\\/i,
  /\bformat\b/i
];
const SENSITIVE_FS_PATTERN = [
  /~\/\.ssh/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.aws\/credentials/i,
  /\.config\/gcloud/i,
  /\.kube\/config/i,
  /\/etc\/passwd/i,
  /\/etc\/shadow/i
];
const BROAD_HOME_PATTERN = /(?:~\/|\/Users\/|\/home\/|C:\\Users\\)/i;

function pointerJoin(base: string, segment: string): string {
  return base === "$" ? `$.${segment}` : `${base}.${segment}`;
}

function lineFromFragment(text: string, fragment: string): number | undefined {
  if (!fragment) {
    return undefined;
  }
  const index = text.indexOf(fragment);
  if (index < 0) {
    return undefined;
  }
  return text.slice(0, index).split(/\r?\n/).length;
}

function withLine(line: number | undefined): Partial<Pick<Finding, "line">> {
  return line === undefined ? {} : { line };
}

function splitCommandTokens(command: string): string[] {
  const matches = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return matches.map((part) => part.replace(/^['"]|['"]$/g, ""));
}

function hasExactPackageVersion(pkg: string): boolean {
  if (pkg.startsWith("@")) {
    const slash = pkg.indexOf("/");
    if (slash < 0) {
      return false;
    }
    const secondAt = pkg.indexOf("@", slash + 1);
    if (secondAt < 0) {
      return false;
    }
    return /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(pkg.slice(secondAt + 1));
  }

  const at = pkg.lastIndexOf("@");
  if (at <= 0) {
    return false;
  }
  return /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(pkg.slice(at + 1));
}

function firstPackageArg(tokens: string[], from: number): string | undefined {
  for (let i = from; i < tokens.length; i += 1) {
    const argPart = tokens[i] ?? "";
    if (!argPart || argPart.startsWith("-")) {
      continue;
    }
    return argPart;
  }
  return undefined;
}

function detectUnpinnedPackageRunner(command: string): boolean {
  const tokens = splitCommandTokens(command);

  for (let i = 0; i < tokens.length; i += 1) {
    const runner = (tokens[i] ?? "").toLowerCase();

    if (runner === "npx") {
      const hasYes = tokens.slice(i + 1, i + 4).some((value) => value === "-y" || value === "--yes");
      if (!hasYes) {
        continue;
      }
      const pkg = firstPackageArg(tokens, i + 1);
      if (pkg && !hasExactPackageVersion(pkg)) {
        return true;
      }
    }

    if (runner === "pnpm" && (tokens[i + 1] ?? "").toLowerCase() === "dlx") {
      const pkg = firstPackageArg(tokens, i + 2);
      if (pkg && !hasExactPackageVersion(pkg)) {
        return true;
      }
    }

    if (runner === "yarn" && (tokens[i + 1] ?? "").toLowerCase() === "dlx") {
      const pkg = firstPackageArg(tokens, i + 2);
      if (pkg && !hasExactPackageVersion(pkg)) {
        return true;
      }
    }

    if (runner === "uvx") {
      const pkg = firstPackageArg(tokens, i + 1);
      if (pkg && !hasExactPackageVersion(pkg)) {
        return true;
      }
    }
  }

  return false;
}

function looksLikeSecretLiteral(value: string): boolean {
  const v = value.trim();
  if (v.length < 24) {
    return false;
  }
  if (/\s/.test(v)) {
    return false;
  }
  if (v.includes("/") || v.includes("\\") || v.includes("://")) {
    return false;
  }

  if (/^[A-Fa-f0-9]{32,}$/.test(v)) {
    return true;
  }

  if (/^[A-Za-z0-9+/=_-]{28,}$/.test(v)) {
    const hasLetter = /[A-Za-z]/.test(v);
    const hasDigit = /\d/.test(v);
    return hasLetter && hasDigit;
  }

  return false;
}

function findMcpObjects(root: unknown): Array<{ pointer: string; node: Record<string, unknown> }> {
  const out: Array<{ pointer: string; node: Record<string, unknown> }> = [];

  function walk(value: unknown, pointer: string): void {
    if (Array.isArray(value)) {
      value.forEach((entry, idx) => walk(entry, `${pointer}[${idx}]`));
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const node = value as Record<string, unknown>;
    out.push({ pointer, node });

    for (const [key, child] of Object.entries(node)) {
      walk(child, pointerJoin(pointer, key));
    }
  }

  walk(root, "$");
  return out;
}

function scanEnvObject(
  filePath: string,
  text: string,
  envPointer: string,
  envObject: Record<string, unknown>
): Finding[] {
  const findings: Finding[] = [];

  for (const [key, rawValue] of Object.entries(envObject)) {
    if (typeof rawValue !== "string") {
      continue;
    }

    const value = rawValue;
    const pointer = pointerJoin(envPointer, key);
    const line = lineFromFragment(text, `"${key}"`);

    if (SUSPICIOUS_ENV_KEY.test(key) && !isSafeEnvPlaceholder(value)) {
      findings.push({
        ruleId: "hardcoded-env-secret",
        severity: "high",
        filePath,
        pointer,
        ...withLine(line),
        message: `Environment key ${key} contains a literal secret value.`,
        remediation: "Replace the literal with a safe placeholder or environment variable reference.",
        redactedValue: redactWithLength(value)
      });
      continue;
    }

    if (!SUSPICIOUS_ENV_KEY.test(key) && !isSafeEnvPlaceholder(value) && looksLikeSecretLiteral(value)) {
      findings.push({
        ruleId: "suspicious-env-literal",
        severity: "medium",
        filePath,
        pointer,
        ...withLine(line),
        message: `Environment key ${key} has a long high-entropy literal value.`,
        remediation: "Review the value and replace with a placeholder if it is sensitive.",
        redactedValue: redactWithLength(value)
      });
    }

    if (SENSITIVE_FS_PATTERN.some((pattern) => pattern.test(value))) {
      findings.push({
        ruleId: "sensitive-filesystem-reference",
        severity: "high",
        filePath,
        pointer,
        ...withLine(line),
        message: `Environment key ${key} references a sensitive filesystem path.`,
        remediation: "Remove direct references to sensitive local files.",
        redactedValue: redactWithLength(value)
      });
    }

    if (BROAD_HOME_PATTERN.test(value) && !isClearlyPlaceholderPath(value)) {
      findings.push({
        ruleId: "broad-home-directory-access",
        severity: "medium",
        filePath,
        pointer,
        ...withLine(line),
        message: `Environment key ${key} references a broad home directory path.`,
        remediation: "Use project-relative placeholders instead of user-home paths.",
        redactedValue: redactWithLength(value)
      });
    }
  }

  return findings;
}

function scanCommandLikeString(filePath: string, text: string, context: StringContext): Finding[] {
  const findings: Finding[] = [];
  const value = context.value;
  const line = lineFromFragment(text, value);

  const hasDangerousPipeline =
    PIPELINE_FETCH.test(value) ||
    POWERSHELL_IEX.test(value) ||
    INVOKE_IEX.test(value) ||
    SHELL_C_REMOTE.test(value) ||
    EVAL_PATTERN.test(value);

  if (hasDangerousPipeline) {
    findings.push({
      ruleId: "dangerous-shell-pipeline",
      severity: "high",
      filePath,
      pointer: context.pointer,
      ...withLine(line),
      message: "Command appears to execute downloaded content or uses eval-like execution.",
      remediation: "Remove shell pipelines/eval and execute only reviewed local scripts.",
      redactedValue: maskCommandString(value)
    });
  }

  if (PRIV_ESC_PATTERN.some((pattern) => pattern.test(value))) {
    findings.push({
      ruleId: "privilege-escalation-command",
      severity: "high",
      filePath,
      pointer: context.pointer,
      ...withLine(line),
      message: "Command includes privilege escalation or destructive operation patterns.",
      remediation: "Remove privileged/destructive commands from MCP configuration.",
      redactedValue: maskCommandString(value)
    });
  }

  if (detectUnpinnedPackageRunner(value)) {
    findings.push({
      ruleId: "unpinned-package-runner",
      severity: "medium",
      filePath,
      pointer: context.pointer,
      ...withLine(line),
      message: "Package runner command is missing an exact package version.",
      remediation: "Pin an exact package version (for example package@1.2.3).",
      redactedValue: maskCommandString(value)
    });
  }

  if (SENSITIVE_FS_PATTERN.some((pattern) => pattern.test(value))) {
    findings.push({
      ruleId: "sensitive-filesystem-reference",
      severity: "high",
      filePath,
      pointer: context.pointer,
      ...withLine(line),
      message: "Command references a sensitive filesystem location.",
      remediation: "Remove references to sensitive files such as SSH keys and cloud credentials.",
      redactedValue: maskCommandString(value)
    });
  }

  if (BROAD_HOME_PATTERN.test(value) && !isClearlyPlaceholderPath(value)) {
    findings.push({
      ruleId: "broad-home-directory-access",
      severity: "medium",
      filePath,
      pointer: context.pointer,
      ...withLine(line),
      message: "Command references a broad home directory path.",
      remediation: "Use project-relative placeholders instead of user-home directories.",
      redactedValue: maskCommandString(value)
    });
  }

  if (!hasDangerousPipeline && FETCH_COMMAND.test(value)) {
    findings.push({
      ruleId: "network-fetch-command",
      severity: "low",
      filePath,
      pointer: context.pointer,
      ...withLine(line),
      message: "Command performs a network fetch.",
      remediation: "Review remote fetch behavior and pin/checksum fetched content when possible.",
      redactedValue: maskCommandString(value)
    });
  }

  return findings;
}

function gatherCommandCandidates(pointer: string, node: Record<string, unknown>): StringContext[] {
  const contexts: StringContext[] = [];
  const command = node.command;
  const args = node.args;

  if (typeof command === "string") {
    contexts.push({
      pointer: pointerJoin(pointer, "command"),
      value: command
    });

    const argStrings: string[] = [];
    if (typeof args === "string") {
      argStrings.push(args);
    }
    if (Array.isArray(args)) {
      for (const entry of args) {
        if (typeof entry === "string") {
          argStrings.push(entry);
        }
      }
    }

    if (argStrings.length > 0) {
      contexts.push({
        pointer: pointerJoin(pointer, "command"),
        value: `${command} ${argStrings.join(" ")}`
      });
    }
  }

  if (typeof args === "string") {
    contexts.push({
      pointer: pointerJoin(pointer, "args"),
      value: args
    });
  }

  if (Array.isArray(args)) {
    args.forEach((entry, idx) => {
      if (typeof entry === "string") {
        contexts.push({
          pointer: `${pointerJoin(pointer, "args")}[${idx}]`,
          value: entry
        });
      }
    });
  }

  return contexts;
}

export function runRules(input: RuleInput): Finding[] {
  const findings: Finding[] = [];
  if (!input.data || typeof input.data !== "object") {
    return findings;
  }

  const nodes = findMcpObjects(input.data);
  for (const { pointer, node } of nodes) {
    if (node.env && typeof node.env === "object" && !Array.isArray(node.env)) {
      findings.push(
        ...scanEnvObject(
          input.filePath,
          input.text,
          pointerJoin(pointer, "env"),
          node.env as Record<string, unknown>
        )
      );
    }

    if (typeof node.cwd === "string") {
      findings.push(
        ...scanCommandLikeString(input.filePath, input.text, {
          pointer: pointerJoin(pointer, "cwd"),
          value: node.cwd
        })
      );
    }

    const commandCandidates = gatherCommandCandidates(pointer, node);
    for (const candidate of commandCandidates) {
      findings.push(...scanCommandLikeString(input.filePath, input.text, candidate));
    }
  }

  const deduped = new Map<string, Finding>();
  for (const finding of findings) {
    const key = [
      finding.ruleId,
      finding.filePath,
      finding.pointer ?? "-",
      finding.line ?? "-",
      finding.message
    ].join("|");
    if (!deduped.has(key)) {
      deduped.set(key, finding);
    }
  }

  return Array.from(deduped.values());
}

export function sortFindings(a: Finding, b: Finding): number {
  return (
    a.filePath.localeCompare(b.filePath) ||
    (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER) ||
    a.ruleId.localeCompare(b.ruleId) ||
    (a.pointer ?? "").localeCompare(b.pointer ?? "")
  );
}

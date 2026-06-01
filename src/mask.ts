const COMMAND_SENSITIVE_SEGMENT = /((?:token|secret|password|api[_-]?key|apikey|private[_-]?key|client[_-]?secret|access[_-]?key)\s*(?:=|\s)\s*)(["']?)([^\s"']+)(\2)/gi;
const TOKEN_PREFIX_SEGMENT = /(ghp_|github_pat_|glpat-|xoxb-|xoxp-|AKIA|ASIA|sk-)([A-Za-z0-9_-]+)/g;

export function redactWithLength(value: string): string {
  return `[REDACTED length=${value.length}]`;
}

export function isSafeEnvPlaceholder(value: string): boolean {
  const normalized = value.trim();
  if (normalized === "") {
    return true;
  }

  if (/^<[^>]*>$/.test(normalized)) {
    return true;
  }

  const upper = normalized.toUpperCase();
  if (
    upper === "REDACTED" ||
    upper === "CHANGEME" ||
    upper === "DUMMY" ||
    upper === "TEST" ||
    upper.includes("EXAMPLE")
  ) {
    return true;
  }

  if (/^\$\{[A-Z_][A-Z0-9_]*\}$/i.test(normalized)) {
    return true;
  }

  if (/^\$[A-Z_][A-Z0-9_]*$/i.test(normalized)) {
    return true;
  }

  if (/^process\.env\.[A-Z_][A-Z0-9_]*$/i.test(normalized)) {
    return true;
  }

  return false;
}

export function isClearlyPlaceholderPath(value: string): boolean {
  const normalized = value.trim();
  const upper = normalized.toUpperCase();
  return (
    /^<[^>]*>$/.test(normalized) ||
    upper.includes("EXAMPLE") ||
    upper.includes("PLACEHOLDER") ||
    upper.includes("CHANGEME") ||
    upper.includes("DUMMY") ||
    upper.includes("REDACTED") ||
    /^\$\{[A-Z_][A-Z0-9_]*\}$/i.test(normalized) ||
    /^\$[A-Z_][A-Z0-9_]*$/i.test(normalized) ||
    /^%[A-Z_][A-Z0-9_]*%$/i.test(normalized)
  );
}

export function maskCommandString(command: string): string {
  let masked = command;

  masked = masked.replace(COMMAND_SENSITIVE_SEGMENT, (_full, prefix: string, quote: string, value: string) => {
    return `${prefix}${quote}${redactWithLength(value)}${quote}`;
  });

  masked = masked.replace(TOKEN_PREFIX_SEGMENT, (_full, prefix: string, rest: string) => {
    return `${prefix}${redactWithLength(rest)}`;
  });

  if (masked.length > 240) {
    masked = `${masked.slice(0, 240)}...`;
  }

  return masked;
}`r`n
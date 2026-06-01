import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const runLocal = args.has("--local");
const jsonOutput = args.has("--json");

const EXCLUDED_SCAN_PREFIXES = ["node_modules/", "dist/", "build/", "coverage/", ".git/"];
const EXCLUDED_SCAN_FILES = new Set(["package-lock.json"]);
const ALLOWED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "users.noreply.github.com"
]);
const DOC_OR_CONFIG_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".conf",
  ".env"
]);

/** @typedef {{ ruleId: string, message: string, filePath: string, line: number | null, snippet: string }} Finding */
/** @typedef {{ ruleId: string, message: string, filePath: string, line: number | null, snippet: string }} Warning */

/** @type {Finding[]} */
const findings = [];
/** @type {Warning[]} */
const warnings = [];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function runGit(gitArgs, allowFail = false) {
  const result = spawnSync("git", gitArgs, { encoding: "utf8" });
  if (result.error) {
    if (allowFail) {
      return { ok: false, stdout: "", stderr: String(result.error) };
    }
    throw result.error;
  }

  const ok = result.status === 0;
  if (!ok && !allowFail) {
    const stderr = (result.stderr || "git command failed").trim();
    throw new Error(stderr);
  }

  return {
    ok,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function parseNulSeparatedPaths(text) {
  if (!text) {
    return [];
  }
  return text.split("\0").filter(Boolean).map(normalizePath);
}

function isInsideGitRepo() {
  const result = runGit(["rev-parse", "--is-inside-work-tree"], true);
  return result.ok && result.stdout.trim() === "true";
}

function addFinding(ruleId, message, filePath, line, snippet) {
  findings.push({ ruleId, message, filePath, line, snippet: redactSnippet(snippet) });
}

function addWarning(ruleId, message, filePath, line, snippet) {
  warnings.push({ ruleId, message, filePath, line, snippet: redactSnippet(snippet) });
}

function isExcludedFromContentScan(filePath) {
  if (filePath === ".git" || filePath.startsWith(".git/")) {
    return true;
  }
  if (EXCLUDED_SCAN_FILES.has(filePath)) {
    return true;
  }
  return EXCLUDED_SCAN_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function isForbiddenTrackedPath(filePath) {
  if (filePath === ".env") {
    return true;
  }
  if (filePath.startsWith(".env.") && filePath !== ".env.example") {
    return true;
  }
  if (filePath === ".npmrc") {
    return true;
  }

  const protectedFolders = ["secrets/", "credentials/", "private/"];
  if (protectedFolders.some((segment) => filePath === segment.slice(0, -1) || filePath.includes(`/${segment}`) || filePath.startsWith(segment))) {
    return true;
  }

  return /\.(pem|key|p12|pfx|kdbx)$/i.test(filePath);
}

function isLikelyTextFile(filePath) {
  try {
    const data = readFileSync(filePath);
    if (data.length === 0) {
      return true;
    }
    return !data.includes(0);
  } catch {
    return false;
  }
}

function readTextFile(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function findLineNumberByIndex(text, index) {
  if (index < 0) {
    return 1;
  }
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === "\n") {
      line += 1;
    }
  }
  return line;
}

function redactSnippet(snippet) {
  if (!snippet) {
    return "";
  }

  let safe = snippet.trim();
  safe = safe.replace(/\b([A-Z0-9._%+-])([A-Z0-9._%+-]{1,63})@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi, "$1***@$3");
  safe = safe.replace(/\b(ghp_|github_pat_|glpat-|xoxb-|xoxp-|AKIA|ASIA|sk-)[A-Za-z0-9_-]{6,}\b/g, "$1***REDACTED***");
  safe = safe.replace(/(_authToken\s*=\s*)(\S+)/gi, "$1***REDACTED***");
  safe = safe.replace(/(_auth\s*=\s*)(\S+)/gi, "$1***REDACTED***");
  safe = safe.replace(/(:_password\s*=\s*)(\S+)/gi, "$1***REDACTED***");
  safe = safe.replace(/(\b(?:token|secret|password|api[_-]?key|apikey|private[_-]?key|client[_-]?secret|access[_-]?key)\b\s*[:=]\s*["']?)([^"'\s#;]+)/gi, "$1***REDACTED***");
  if (safe.length > 220) {
    safe = `${safe.slice(0, 220)}...`;
  }
  return safe;
}

function isPlaceholderValue(value) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  if (normalized.length === 0) {
    return true;
  }

  const upper = normalized.toUpperCase();
  if (
    upper.includes("EXAMPLE") ||
    upper.includes("PLACEHOLDER") ||
    upper.includes("CHANGE_ME") ||
    upper.includes("REPLACE_ME") ||
    upper.includes("REDACTED") ||
    upper.includes("DUMMY") ||
    upper.includes("YOUR_") ||
    upper.includes("<") ||
    upper.includes(">") ||
    upper === "XXX" ||
    upper === "TODO"
  ) {
    return true;
  }

  if (normalized.endsWith(".invalid")) {
    return true;
  }

  return false;
}

function isDocOrConfigPath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".env.example")) {
    return true;
  }
  for (const ext of DOC_OR_CONFIG_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return true;
    }
  }
  return lower === "readme" || lower === "readme.md";
}

function scanGitIdentity() {
  if (!runLocal) {
    return;
  }

  const emailResult = runGit(["config", "--get", "user.email"], true);
  const email = emailResult.stdout.trim();
  if (!emailResult.ok || !email || !email.includes("noreply.github.com")) {
    addFinding(
      "LOCAL_GIT_EMAIL",
      "git user.email must be set to a GitHub noreply address for local checks.",
      "(local git config)",
      null,
      email || "(missing)"
    );
  }

  const gpgResult = runGit(["config", "--get", "commit.gpgsign"], true);
  const gpgSign = gpgResult.stdout.trim().toLowerCase();
  const gpgEnabled = gpgResult.ok && ["1", "true", "yes", "on"].includes(gpgSign);
  const allowGpgSigning = process.env.MCP_CONFIG_LINT_ALLOW_GPG_SIGNING === "1";

  if (gpgEnabled && !allowGpgSigning) {
    addFinding(
      "LOCAL_GPG_SIGNING",
      "commit.gpgsign is enabled. Signing keys may reveal identity. Set MCP_CONFIG_LINT_ALLOW_GPG_SIGNING=1 to acknowledge.",
      "(local git config)",
      null,
      "commit.gpgsign=true"
    );
  }
}

function scanForbiddenPaths(allPaths) {
  for (const filePath of allPaths) {
    if (!isForbiddenTrackedPath(filePath)) {
      continue;
    }
    addFinding(
      "FORBIDDEN_TRACKED_PATH",
      "Forbidden tracked path detected.",
      filePath,
      null,
      filePath
    );
  }
}

function scanContent(filePath, text) {
  const lines = text.split(/\r?\n/);
  const personalEmailPattern = /\b([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
  const unixUsersPathPattern = /(?:^|\s)\/Users\/[A-Za-z0-9._-]+/g;
  const unixHomePathPattern = /(?:^|\s)\/home\/[A-Za-z0-9._-]+/g;
  const windowsUsersPathPattern = /(?:^|\s)C:\\Users\\[A-Za-z0-9._-]+/gi;
  const tokenPrefixPattern = /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xoxb-[A-Za-z0-9-]{20,}|xoxp-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{16,})\b/g;
  const sensitiveAssignmentPattern = /(\b(?:token|secret|password|api[_-]?key|apikey|private[_-]?key|client[_-]?secret|access[_-]?key)\b\s*[:=]\s*["']?)([^"'\s#;]+)/i;
  const privateIpv4Pattern = /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.(?:\d{1,3})\.(?:\d{1,3})|192\.168\.(?:\d{1,3})\.(?:\d{1,3}))\b/g;
  const npmAuthPattern = /(?:^|\s)(?:\/\/[^\s]+:)?_authToken\s*=\s*(\S+)/i;
  const npmLegacyAuthPattern = /(?:^|\s)_auth\s*=\s*(\S+)/i;
  const npmPasswordPattern = /(?:^|\s):_password\s*=\s*(\S+)/i;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const lineNumber = idx + 1;
    let emailMatch;

    personalEmailPattern.lastIndex = 0;
    while ((emailMatch = personalEmailPattern.exec(line)) !== null) {
      const domain = emailMatch[2].toLowerCase();
      if (!ALLOWED_EMAIL_DOMAINS.has(domain)) {
        addFinding(
          "PERSONAL_EMAIL",
          "Potential personal email address found.",
          filePath,
          lineNumber,
          line
        );
      }
    }

    if (unixUsersPathPattern.test(line) || unixHomePathPattern.test(line) || windowsUsersPathPattern.test(line)) {
      addFinding(
        "ABSOLUTE_HOME_PATH",
        "Absolute home path detected.",
        filePath,
        lineNumber,
        line
      );
    }

    tokenPrefixPattern.lastIndex = 0;
    if (tokenPrefixPattern.test(line)) {
      addFinding(
        "TOKEN_PREFIX",
        "Token-like value with known prefix detected.",
        filePath,
        lineNumber,
        line
      );
    }

    const assignmentMatch = line.match(sensitiveAssignmentPattern);
    if (assignmentMatch) {
      const value = assignmentMatch[2] || "";
      if (!isPlaceholderValue(value)) {
        addFinding(
          "SUSPICIOUS_ASSIGNMENT",
          "Sensitive key assignment found with non-placeholder value.",
          filePath,
          lineNumber,
          line
        );
      }
    }

    if (npmAuthPattern.test(line) || npmLegacyAuthPattern.test(line) || npmPasswordPattern.test(line)) {
      const authValue = (line.match(npmAuthPattern)?.[1] || line.match(npmLegacyAuthPattern)?.[1] || line.match(npmPasswordPattern)?.[1] || "").trim();
      if (!isPlaceholderValue(authValue)) {
        addFinding(
          "NPMRC_AUTH_TOKEN",
          "Potential npm auth token credential found.",
          filePath,
          lineNumber,
          line
        );
      }
    }

    if (isDocOrConfigPath(filePath)) {
      privateIpv4Pattern.lastIndex = 0;
      if (privateIpv4Pattern.test(line)) {
        addFinding(
          "PRIVATE_IPV4",
          "Private IPv4 range found in documentation or config text.",
          filePath,
          lineNumber,
          line
        );
      }
    }
  }

  const privateKeyPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
  let blockMatch;
  while ((blockMatch = privateKeyPattern.exec(text)) !== null) {
    const lineNumber = findLineNumberByIndex(text, blockMatch.index);
    addFinding(
      "PRIVATE_KEY_BLOCK",
      "Private key block detected.",
      filePath,
      lineNumber,
      "-----BEGIN ... PRIVATE KEY----- ***REDACTED*** -----END ... PRIVATE KEY-----"
    );
  }
}

function findLineByPattern(rawText, pattern) {
  const lines = rawText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) {
      return i + 1;
    }
  }
  return null;
}

function scanPackageJson() {
  const filePath = "package.json";
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readTextFile(filePath);
  if (raw === null) {
    addFinding("PACKAGE_JSON_READ", "Unable to read package.json.", filePath, null, "(unreadable)");
    return;
  }

  /** @type {Record<string, any>} */
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch {
    addFinding("PACKAGE_JSON_INVALID", "package.json is invalid JSON.", filePath, null, "(invalid json)");
    return;
  }

  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    addWarning(
      "PACKAGE_FILES_ALLOWLIST",
      "package.json should define a files allowlist.",
      filePath,
      findLineByPattern(raw, /"files"\s*:/),
      "files"
    );
  }

  const author = pkg.author;
  if (typeof author === "string") {
    if (!/contributors?/i.test(author)) {
      addFinding(
        "PACKAGE_AUTHOR_STRING",
        "package.json author appears personal. Use a contributors-style value or omit author.",
        filePath,
        findLineByPattern(raw, /"author"\s*:/),
        author
      );
    }
  } else if (author && typeof author === "object") {
    if (typeof author.email === "string" && author.email.trim().length > 0) {
      addFinding(
        "PACKAGE_AUTHOR_EMAIL",
        "package.json author.email is not allowed.",
        filePath,
        findLineByPattern(raw, /"email"\s*:/),
        String(author.email)
      );
    }
    if (typeof author.url === "string" && author.url.trim().length > 0) {
      addFinding(
        "PACKAGE_AUTHOR_URL",
        "package.json author.url is not allowed.",
        filePath,
        findLineByPattern(raw, /"url"\s*:/),
        String(author.url)
      );
    }
    if (typeof author.name === "string" && author.name.trim().length > 0 && !/contributors?/i.test(author.name)) {
      addFinding(
        "PACKAGE_AUTHOR_NAME",
        "package.json author.name appears personal. Use contributors-style naming.",
        filePath,
        findLineByPattern(raw, /"name"\s*:/),
        String(author.name)
      );
    }
  }

  if (pkg.scripts && typeof pkg.scripts === "object") {
    for (const [scriptName, scriptValue] of Object.entries(pkg.scripts)) {
      if (typeof scriptValue !== "string") {
        continue;
      }
      if (/\bnpm\s+publish\b/.test(scriptValue)) {
        const line = findLineByPattern(raw, new RegExp(`"${scriptName}"\\s*:`));
        addFinding(
          "PACKAGE_SCRIPT_PUBLISH",
          "package.json scripts must not invoke npm publish.",
          filePath,
          line,
          `${scriptName}: ${scriptValue}`
        );
      }
    }
  }
}

function collectFilesToScan() {
  const insideGit = isInsideGitRepo();
  if (!insideGit) {
    return { insideGit, allPaths: [] };
  }

  const tracked = parseNulSeparatedPaths(runGit(["ls-files", "-z"], true).stdout);
  const stagedAdded = parseNulSeparatedPaths(
    runGit(["diff", "--cached", "--name-only", "--diff-filter=A", "-z"], true).stdout
  );

  const pathSet = new Set([...tracked, ...stagedAdded]);
  pathSet.delete("");

  return {
    insideGit,
    allPaths: Array.from(pathSet).sort()
  };
}

function printReport(scannedFiles, insideGit) {
  const payload = {
    ok: findings.length === 0,
    insideGit,
    scannedFiles,
    findings,
    warnings
  };

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!insideGit) {
    console.log("[INFO] Not inside a git repository. Skipped tracked-file content scan.");
  }

  for (const warning of warnings) {
    const position = warning.line ? `${warning.filePath}:${warning.line}` : warning.filePath;
    console.warn(`[WARN] ${warning.ruleId} ${position}`);
    console.warn(`       ${warning.message}`);
    if (warning.snippet) {
      console.warn(`       ${warning.snippet}`);
    }
  }

  for (const finding of findings) {
    const position = finding.line ? `${finding.filePath}:${finding.line}` : finding.filePath;
    console.error(`[ERROR] ${finding.ruleId} ${position}`);
    console.error(`        ${finding.message}`);
    if (finding.snippet) {
      console.error(`        ${finding.snippet}`);
    }
  }

  if (findings.length > 0) {
    console.error(`Privacy check failed with ${findings.length} finding(s).`);
  } else {
    console.log("Privacy check passed.");
  }
}

function main() {
  scanGitIdentity();
  scanPackageJson();

  const { insideGit, allPaths } = collectFilesToScan();
  scanForbiddenPaths(allPaths);

  const contentTargets = allPaths.filter((filePath) => !isExcludedFromContentScan(filePath));
  let scannedFiles = 0;

  for (const filePath of contentTargets) {
    if (filePath === ".git" || filePath.startsWith(".git/")) {
      continue;
    }
    if (!existsSync(filePath) || !isLikelyTextFile(filePath)) {
      continue;
    }

    const text = readTextFile(filePath);
    if (text === null) {
      continue;
    }

    scannedFiles += 1;
    scanContent(filePath, text);
  }

  printReport(scannedFiles, insideGit);
  if (findings.length > 0) {
    process.exitCode = 1;
  }
}

main();

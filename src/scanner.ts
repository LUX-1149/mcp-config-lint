import { discoverConfigFiles } from "./discover.js";
import { parseConfigFile } from "./parse.js";
import { runRules, sortFindings } from "./rules/index.js";
import type { Finding, ScanOptions, ScanResult } from "./types.js";

export async function scanPaths(options: ScanOptions): Promise<ScanResult> {
  const files = await discoverConfigFiles({
    cwd: options.cwd,
    paths: options.paths,
    includes: options.includes,
    excludes: options.excludes
  });

  const findings: Finding[] = [];

  for (const filePath of files) {
    const parsed = await parseConfigFile(filePath);
    findings.push(...parsed.findings);

    const ruleFindings = runRules({
      filePath: parsed.filePath,
      text: parsed.text,
      data: parsed.data
    });
    findings.push(...ruleFindings);
  }

  findings.sort(sortFindings);

  return {
    scannedFiles: files.length,
    findings
  };
}

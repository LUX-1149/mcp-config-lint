import { readFile } from "node:fs/promises";
import { getLocation, parse, type ParseError, printParseErrorCode } from "jsonc-parser";
import { redactWithLength } from "./mask.js";
import type { Finding, ParsedConfig } from "./types.js";

function lineFromOffset(text: string, offset: number): number {
  const upto = text.slice(0, Math.max(0, offset));
  return upto.split(/\r?\n/).length;
}

function lineAt(text: string, lineNumber: number): string {
  const lines = text.split(/\r?\n/);
  return lines[lineNumber - 1] ?? "";
}

function parseErrorsToFindings(filePath: string, text: string, errors: ParseError[]): Finding[] {
  if (errors.length === 0) {
    return [];
  }

  const first = errors[0];
  if (!first) {
    return [];
  }

  const location = getLocation(text, first.offset);
  const line = lineFromOffset(text, first.offset);
  const snippet = lineAt(text, line);

  return [
    {
      ruleId: "invalid-json",
      severity: "high",
      filePath,
      pointer: location.path.length > 0 ? `$.${location.path.join(".")}` : "$",
      line,
      message: `Invalid JSON/JSONC: ${printParseErrorCode(first.error)}.`,
      remediation: "Fix JSON/JSONC syntax, then run the scanner again.",
      redactedValue: redactWithLength(snippet)
    }
  ];
}

export async function parseConfigFile(filePath: string): Promise<ParsedConfig> {
  const text = await readFile(filePath, "utf8");
  const errors: ParseError[] = [];
  const data = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: false
  });

  return {
    filePath,
    text,
    data,
    findings: parseErrorsToFindings(filePath, text, errors)
  };
}

#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { formatHuman, formatJson } from "./format.js";
import { scanPaths } from "./scanner.js";
import { hasFailingFindings } from "./threshold.js";
import type { FailOnLevel } from "./types.js";

const VERSION = "0.1.0";

interface CliOptions {
  json: boolean;
  failOn: FailOnLevel;
  color: boolean;
  include: string[];
  exclude: string[];
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseFailOnLevel(input: string): FailOnLevel {
  const normalized = input.toLowerCase();
  if (["low", "medium", "high", "none"].includes(normalized)) {
    return normalized as FailOnLevel;
  }
  throw new InvalidArgumentError("--fail-on must be one of: low, medium, high, none");
}

const program = new Command();

program
  .name("mcp-config-lint")
  .description("Local-first linter for risky MCP configuration files.")
  .version(VERSION)
  .argument("[paths...]", "Files, directories, or glob paths to scan")
  .option("--json", "Output findings as stable JSON")
  .option("--fail-on <level>", "Exit threshold: low, medium, high, none", parseFailOnLevel, "high")
  .option("--no-color", "Disable colored output")
  .option("--include <glob>", "Additional include glob", collect, [])
  .option("--exclude <glob>", "Additional exclude glob", collect, [])
  .action(async (paths: string[], options: CliOptions) => {
    try {
      const result = await scanPaths({
        cwd: process.cwd(),
        paths,
        includes: options.include,
        excludes: options.exclude
      });

      if (options.json) {
        process.stdout.write(formatJson(result));
      } else {
        process.stdout.write(formatHuman(result, { color: options.color }));
      }

      process.exitCode = hasFailingFindings(result.findings, options.failOn) ? 1 : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected runtime error";
      process.stderr.write(`mcp-config-lint runtime error: ${message}\n`);
      process.exitCode = 2;
    }
  });

void program.parseAsync(process.argv);

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import fg from "fast-glob";

export const DEFAULT_DISCOVERY_PATTERNS = [
  "**/.mcp.json",
  "**/mcp.json",
  "**/.vscode/mcp.json",
  "**/claude_desktop_config.json",
  "**/.cursor/mcp.json",
  "**/windsurf_mcp_config.json"
];

export const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.git/**"
];

interface DiscoverParams {
  cwd: string;
  paths: string[];
  includes: string[];
  excludes: string[];
}

function normalize(input: string): string {
  return input.replace(/\\/g, "/");
}

function uniqSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

async function discoverInRoots(
  roots: string[],
  patterns: string[],
  ignore: string[]
): Promise<string[]> {
  const hits = new Set<string>();

  for (const root of roots) {
    const matched = await fg(patterns, {
      cwd: root,
      onlyFiles: true,
      dot: true,
      absolute: true,
      ignore,
      suppressErrors: true,
      followSymbolicLinks: false
    });

    for (const filePath of matched) {
      hits.add(normalize(filePath));
    }
  }

  return uniqSorted(hits);
}

async function discoverFromPathGlobs(cwd: string, globs: string[], ignore: string[]): Promise<string[]> {
  if (globs.length === 0) {
    return [];
  }

  const matched = await fg(globs, {
    cwd,
    onlyFiles: true,
    dot: true,
    absolute: true,
    ignore,
    suppressErrors: true,
    followSymbolicLinks: false
  });

  return uniqSorted(matched.map(normalize));
}

export async function discoverConfigFiles(params: DiscoverParams): Promise<string[]> {
  const cwd = normalize(resolve(params.cwd));
  const rawPaths = params.paths.length > 0 ? params.paths : [cwd];
  const includes = params.includes;
  const ignore = uniqSorted([...DEFAULT_EXCLUDES, ...params.excludes]);

  const explicitFiles = new Set<string>();
  const directoryRoots = new Set<string>();
  const pathGlobs: string[] = [];

  for (const rawPath of rawPaths) {
    const absolute = normalize(resolve(cwd, rawPath));
    if (existsSync(absolute)) {
      const stat = statSync(absolute);
      if (stat.isFile()) {
        explicitFiles.add(absolute);
      } else if (stat.isDirectory()) {
        directoryRoots.add(absolute);
      }
    } else {
      pathGlobs.push(rawPath);
    }
  }

  if (directoryRoots.size === 0 && explicitFiles.size === 0 && pathGlobs.length === 0) {
    directoryRoots.add(cwd);
  }

  const rootPatterns = uniqSorted([...DEFAULT_DISCOVERY_PATTERNS, ...includes]);
  const discovered = await discoverInRoots(Array.from(directoryRoots), rootPatterns, ignore);
  const globHits = await discoverFromPathGlobs(cwd, pathGlobs, ignore);

  return uniqSorted([...explicitFiles, ...discovered, ...globHits]);
}

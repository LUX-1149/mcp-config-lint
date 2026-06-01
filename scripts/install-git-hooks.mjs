import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const gitDir = ".git";
if (!existsSync(gitDir)) {
  console.log("No .git directory found. Skipped hook installation.");
  process.exit(0);
}

const hooksDir = join(gitDir, "hooks");
mkdirSync(hooksDir, { recursive: true });

const preCommitPath = join(hooksDir, "pre-commit");
const prePushPath = join(hooksDir, "pre-push");

writeFileSync(
  preCommitPath,
  "#!/usr/bin/env sh\nset -eu\nnpm run privacy:check:local\n",
  { encoding: "utf8", mode: 0o755 }
);

writeFileSync(
  prePushPath,
  "#!/usr/bin/env sh\nset -eu\nnpm run privacy:check:local\nnpm run lint\nnpm test\nnpm run build\nnpm run pack:dry-run\n",
  { encoding: "utf8", mode: 0o755 }
);

console.log("Installed .git/hooks/pre-commit and .git/hooks/pre-push.");

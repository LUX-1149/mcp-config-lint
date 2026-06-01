# mcp-config-lint

Local-first linting for risky MCP configuration files.

Japanese README: [README.ja.md](README.ja.md)

`mcp-config-lint` helps catch risky patterns in MCP configuration files before they are shared in public repositories.

## Why This Exists

- MCP configs can connect AI tools to local commands and credentials.
- Risky local patterns can accidentally leak into public source control.
- This tool provides local-only checks so issues can be fixed before publishing code.

## Install

Run once without installing:

```bash
npx mcp-config-lint
```

Install as a dev dependency:

```bash
npm install -D mcp-config-lint
```

## Quick Usage

Default scan:

```bash
npx mcp-config-lint
```

Machine-readable output:

```bash
npx mcp-config-lint --json
```

Fail CI on medium and above:

```bash
npx mcp-config-lint --fail-on medium
```

## Example Output

Human output:

```text
test/fixtures/unsafe/hardcoded-env-secret.json
  HIGH hardcoded-env-secret line 6
    Environment key client_secret contains a literal secret value.
    remediation: Replace the literal with a safe placeholder or environment variable reference.
    pointer: $.mcpServers.hardcodedSecret.env.client_secret
    snippet: [REDACTED length=37]

Findings: 1. Scanned 1 file(s).
```

JSON output:

```json
{
  "scannedFiles": 1,
  "findings": [
    {
      "ruleId": "hardcoded-env-secret",
      "severity": "high",
      "filePath": "test/fixtures/unsafe/hardcoded-env-secret.json",
      "line": 6,
      "pointer": "$.mcpServers.hardcodedSecret.env.client_secret",
      "message": "Environment key client_secret contains a literal secret value.",
      "remediation": "Replace the literal with a safe placeholder or environment variable reference.",
      "redactedValue": "[REDACTED length=37]"
    }
  ]
}
```

## Supported Config Names

- `.mcp.json`
- `mcp.json`
- `.vscode/mcp.json`
- `claude_desktop_config.json`
- `.cursor/mcp.json`
- `windsurf_mcp_config.json`

You can also pass files, directories, and glob patterns directly.

## Rules

| ruleId | severity | explanation |
| --- | --- | --- |
| `invalid-json` | high | Invalid JSON or JSONC syntax in a config file. |
| `hardcoded-env-secret` | high | Sensitive env key uses a literal value instead of a placeholder. |
| `suspicious-env-literal` | medium | Long high-entropy env literal looks secret-like. |
| `dangerous-shell-pipeline` | high | Command pattern may execute downloaded content. |
| `privilege-escalation-command` | high | Command includes privileged or destructive operations. |
| `unpinned-package-runner` | medium | `npx` or `dlx` or `uvx` command is missing an exact version. |
| `sensitive-filesystem-reference` | high | Command or env or cwd references sensitive local credential paths. |
| `broad-home-directory-access` | medium | Command or env or cwd references broad home-directory locations. |
| `network-fetch-command` | low | Command performs remote fetch and should be reviewed. |

## Exit Codes

- `0`: no finding at or above `--fail-on`
- `1`: one or more findings at or above `--fail-on`
- `2`: unexpected runtime or CLI error

## CI Example

```yaml
name: lint-mcp-config
on:
  pull_request:
  push:
    branches: [main]

jobs:
  mcp-config-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: "20"
      - run: npm ci
      - run: npx mcp-config-lint --json --fail-on medium
```

## Privacy

- Local-only scanning.
- No network calls are performed by the scanner.
- No telemetry collection.
- Suspicious values are redacted in findings output.

## Limitations

- This is heuristic linting.
- It is not a replacement for full secret scanning.
- False positives and false negatives are possible.

## Development

```bash
npm install
npm run hooks:install
npm test
npm run build
npm run privacy:check:local
```

## Release Safety

See [RELEASE.md](RELEASE.md) for the pre-release and release safety checklist.

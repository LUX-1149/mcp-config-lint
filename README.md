# mcp-config-lint

Local-first linting for risky MCP configuration files.

`mcp-config-lint` helps catch risky patterns in MCP configuration files before they are shared in public repositories.

## Why This Exists

- MCP configs can connect AI tools to local commands and credentials.
- Risky local patterns can accidentally leak into public source control.
- This tool provides local-only checks so issues can be fixed before publishing code.

## Install

```bash
npx mcp-config-lint
```

```bash
npm install -D mcp-config-lint
```

## Usage

```bash
npx mcp-config-lint
```

```bash
npx mcp-config-lint --json
```

```bash
npx mcp-config-lint --fail-on medium
```

## Example Human Output

```text
test/fixtures/unsafe/hardcoded-env-secret.json
	HIGH hardcoded-env-secret line 6
		Environment key client_secret contains a literal secret value.
		remediation: Replace the literal with a safe placeholder or environment variable reference.
		pointer: $.mcpServers.hardcodedSecret.env.client_secret
		snippet: [REDACTED length=37]

Findings: 1. Scanned 1 file(s).
```

## Example JSON Output

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
| `unpinned-package-runner` | medium | `npx`/`dlx`/`uvx` command is missing an exact version. |
| `sensitive-filesystem-reference` | high | Command/env/cwd references sensitive local credential paths. |
| `broad-home-directory-access` | medium | Command/env/cwd references broad home-directory locations. |
| `network-fetch-command` | low | Command performs remote fetch and should be reviewed. |

## Exit Codes

- `0`: no finding at or above `--fail-on`
- `1`: one or more findings at or above `--fail-on`
- `2`: unexpected runtime or CLI error

## CI Usage

```yaml
name: lint-mcp-config
on:
	pull_request:
	push:
		branches: [ main ]

jobs:
	mcp-config-lint:
		runs-on: ubuntu-latest
		steps:
			- uses: actions/checkout@v4
			- uses: actions/setup-node@v4
				with:
					node-version: "20"
			- run: npm ci
			- run: npx mcp-config-lint --json --fail-on medium
```

## Privacy

- Local-only scanning.
- No network calls performed by the scanner.
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

See [RELEASE.md](RELEASE.md) for the pre-release and release safety checklist.`r`n
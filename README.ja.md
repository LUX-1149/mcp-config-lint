# mcp-config-lint

MCP 設定ファイルのリスクをローカルで検査する lint ツールです。

English README: [README.md](README.md)

`mcp-config-lint` は、MCP 設定に含まれる危険なパターンを、公開前にローカル環境で検出するための CLI です。

## このツールの目的

- MCP 設定は、ローカルコマンドや資格情報に接続できるため影響が大きい。
- 不注意な設定が、そのまま公開リポジトリへ混入するリスクがある。
- 公開前にローカルで検査し、修正ポイントを明確にする。

## インストール

一度だけ実行する場合:

```bash
npx mcp-config-lint
```

開発依存として追加する場合:

```bash
npm install -D mcp-config-lint
```

## クイックスタート

通常実行:

```bash
npx mcp-config-lint
```

JSON 出力:

```bash
npx mcp-config-lint --json
```

`medium` 以上で CI を失敗させる:

```bash
npx mcp-config-lint --fail-on medium
```

## 出力例

人間向け出力:

```text
test/fixtures/unsafe/hardcoded-env-secret.json
  HIGH hardcoded-env-secret line 6
    Environment key client_secret contains a literal secret value.
    remediation: Replace the literal with a safe placeholder or environment variable reference.
    pointer: $.mcpServers.hardcodedSecret.env.client_secret
    snippet: [REDACTED length=37]

Findings: 1. Scanned 1 file(s).
```

JSON 出力:

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

## 対応している設定ファイル名

- `.mcp.json`
- `mcp.json`
- `.vscode/mcp.json`
- `claude_desktop_config.json`
- `.cursor/mcp.json`
- `windsurf_mcp_config.json`

このほか、ファイルパス、ディレクトリ、glob パターンの直接指定にも対応しています。

## ルール一覧

| ruleId | severity | 説明 |
| --- | --- | --- |
| `invalid-json` | high | 設定ファイルの JSON / JSONC が不正。 |
| `hardcoded-env-secret` | high | 機密系 env キーにリテラル値が入っている。 |
| `suspicious-env-literal` | medium | 高エントロピーの env 値が機密値らしい。 |
| `dangerous-shell-pipeline` | high | 取得した内容をそのまま実行する恐れがある。 |
| `privilege-escalation-command` | high | 権限昇格や破壊的コマンドの疑いがある。 |
| `unpinned-package-runner` | medium | `npx` / `dlx` / `uvx` が厳密バージョン指定なし。 |
| `sensitive-filesystem-reference` | high | command / env / cwd に機密パス参照がある。 |
| `broad-home-directory-access` | medium | command / env / cwd が広すぎるホーム配下を指す。 |
| `network-fetch-command` | low | ネットワーク取得コマンドのため要レビュー。 |

## 終了コード

- `0`: `--fail-on` 以上の検出なし
- `1`: `--fail-on` 以上の検出あり
- `2`: 実行時エラーまたは CLI エラー

## CI 連携例

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

## プライバシー方針

- ローカルのみで検査。
- スキャナー自身はネットワーク通信を行わない。
- テレメトリ収集なし。
- 検出値は出力時にマスクされる。

## 制限事項

- ヒューリスティックベースの検査です。
- 完全な secret scanning の代替ではありません。
- 偽陽性・偽陰性の可能性があります。

## 開発者向け

```bash
npm install
npm run hooks:install
npm test
npm run build
npm run privacy:check:local
```

## リリース安全チェック

リリース前のチェックリストは [RELEASE.md](RELEASE.md) を参照してください。

# Contributing

Thank you for contributing to `mcp-config-lint`.

## Safety Requirements

- Do not include real secrets in tests, docs, issues, or pull requests.
- Do not include personal paths or private hostnames in fixtures.
- Keep examples provider-neutral and sanitized.

## Before Opening a PR

Run the project checks locally:

```bash
npm run privacy:check
npm run lint
npm test
npm run build
```

## Fixtures and Examples

- Use placeholder domains such as `example.com`.
- Use placeholder values such as `EXAMPLE`, `REDACTED`, and `${EXAMPLE_TOKEN}`.
- Never include provider-shaped credential strings.

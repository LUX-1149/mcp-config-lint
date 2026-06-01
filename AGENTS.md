# AGENTS

This repository is public by default. Every agent action must follow privacy-first rules.

## Required Rules

- No secrets: do not create, paste, invent, or store real tokens, keys, credentials, emails, phone numbers, hostnames, usernames, personal names, or private IP addresses.
- No publishing: do not run commands that publish data (for example: git push, npm publish, gh release).
- No personal identity: do not add personal identity in code, docs, config, or metadata.
- Use mcp-config-lint contributors wherever human author or copyright names would normally appear.
- No real provider token examples: use placeholders only.
- No real MCP configurations: use clearly fake, placeholder-only examples.
- Do not create a real .env file. Only .env.example is allowed and must use placeholder values.

## Placeholder Policy

- Use placeholder values such as CHANGE_ME, EXAMPLE_TOKEN, and example.invalid.
- Use generic paths such as ./config/example.json.
- Never include absolute personal home-directory paths.

## Pre-Commit Privacy Checks

Run privacy checks before commit:

1. Confirm local git email is a GitHub noreply address.
2. Confirm no .env or .npmrc file is tracked.
3. Scan files for personal identity and secret-like patterns.
4. Inspect package contents with npm pack --dry-run.
5. Do not push until every privacy and security check passes.

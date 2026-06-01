# Copilot Instructions

This repository is public by default. Keep all outputs privacy-first.

## Non-Negotiable Rules

- Never generate or store real secrets, tokens, API keys, emails, phone numbers, personal names, usernames, private hostnames, or private IP addresses.
- Never run publishing commands (git push, npm publish, gh release).
- Never include personal identity in docs, metadata, or examples.
- Use mcp-config-lint contributors where a human name would normally appear.
- Never produce real provider token examples.
- Never produce real MCP config examples.
- Never create a real .env file. Use only .env.example with placeholders.

## Example Style

- Prefer placeholders like EXAMPLE_TOKEN and example.invalid.
- Keep examples synthetic, minimal, and non-identifying.

## Before Commit

1. Verify git user.email is GitHub noreply.
2. Verify no .env or .npmrc is tracked.
3. Verify no personal paths, emails, names, hostnames, or IPs exist in tracked files.
4. Verify package contents with npm pack --dry-run.
5. Do not push until all checks pass.

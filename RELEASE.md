# Release Safety Guide

This document describes safe, manual release checks for the initial open-source releases.

## 1. Pre-release Checklist

Run all local checks:

```bash
npm run privacy:check:local
npm run lint
npm test
npm run build
npm run pack:dry-run
```

Then manually inspect the `npm pack --dry-run` output and confirm all of the following:

- No `.env` files are included.
- No `.npmrc` files are included.
- No tests are included.
- No fixtures are included.
- No `.github` files are included.
- No `scripts/` files are included.
- No source maps are included.
- Any inclusion of the above is intentional and reviewed.
- `package.json` has no personal author or contact data.

## 2. GitHub Release Checklist

- Verify `git log --format=fuller -1` uses a GitHub noreply email identity.
- Verify no personal identity appears in `README.md`, `package.json`, `LICENSE`, or docs.
- Enable GitHub push protection in repository settings.
- Enable GitHub secret scanning in repository settings.
- Do not upload local config archives or screenshots that include paths or secrets.

## 3. npm Publishing Note

- The first release can be manual after dry-run inspection.
- Do not store npm tokens in the repository.
- If automation is added later, prefer npm trusted publishing (OIDC) over long-lived tokens.

## 4. Incident Note

If a real secret is accidentally committed or published, rotate or revoke it immediately before attempting history cleanup.

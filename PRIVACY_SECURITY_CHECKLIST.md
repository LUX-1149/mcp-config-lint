# Privacy and Security Checklist

Use this checklist before any commit or release-related work.

- [ ] GitHub noreply email configured locally (git config --get user.email)
- [ ] Block command line pushes exposing private email is enabled
- [ ] Push protection is enabled on GitHub
- [ ] No .env or .npmrc files are tracked by git
- [ ] No personal paths, emails, names, hostnames, or IP addresses exist in tracked files
- [ ] Package contents reviewed with npm pack --dry-run
- [ ] No git push until all checks pass

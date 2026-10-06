## Summary

<!-- What this changes, and why. The title and this description become the squash commit:
     CONTRIBUTING.md, "Commit messages". -->

## How it is known to work

<!-- The test that failed before and passes now, or the measurement that shows it. -->

## Checklist

- [ ] A bug fix comes with a test that failed without it
- [ ] `pnpm test`, `pnpm typecheck` and `pnpm lint` are green
- [ ] A component change: `pnpm certify` is green (and `pnpm certify:visual` if its appearance changed)
- [ ] Generated files were regenerated, not edited (AGENTS.md, "Files you do not edit by hand")
- [ ] A change an application can notice has a CHANGELOG entry under *Unreleased*

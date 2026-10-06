# CLAUDE.md

Instructions for Claude Code in this repository. The build, the layout and the rules are in
AGENTS.md, which applies to every agent:

@AGENTS.md

## Language

Everything that lands in the repository is in English: code, identifiers, comments, documentation,
test names, commit messages, pull request titles and descriptions.

## Commits

The history of this repository is public. A commit message follows CONTRIBUTING.md ("Commits and
pull requests"):

- a Conventional Commits header with a scope, lowercase description, at most 72 characters;
- a body that says why the change was made and how it is known to work, not what the diff shows;
- no trailers that link a private session, and no co-author line for an assistant;
- no issue-tracker keys and no references to documents outside the repository;
- no paths from a local machine.

## Before you call something done

Run the gate the change needs (`pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm certify` for a
component) and read its result. A change is done when the gate is green, not when it compiles.

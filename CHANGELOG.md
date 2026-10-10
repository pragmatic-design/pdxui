# Changelog

Changes that an app built on PDX UI can notice. Newest first.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and
[Conventional Commits](https://www.conventionalcommits.org/). Pre-release versions (`-alpha.N`)
may introduce breaking changes between versions; stable releases (`1.0.0` and later) follow strict
semver.

## Unreleased

### Features

- Initial public release.

### Fixes

- Scoped `<style scoped>` rules inside `@container` and `@starting-style` now apply only to the component. Before, they were emitted unscoped and applied to every matching element on the page.

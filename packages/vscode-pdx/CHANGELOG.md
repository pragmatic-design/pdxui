# Changelog

## 0.9.0 — pre-release

The first release on the Marketplace, as a pre-release: the stable line starts at 1.0.0.

- Highlighting for `.pdx`: the template as HTML, binding values (`:x="…"`, `@x="…"`, `::x="…"`) as
  TypeScript, the script as TypeScript with every PDX rune, the style as CSS. Block tags may carry
  attributes (`<template shadow>`, `<script setup lang="ts">`, `<style scoped src="…">`).
- The PDX language server, bundled:
  - diagnostics from the compiler, with quick fixes where a finding carries one;
  - the TypeScript check of the script and of every template expression — turn it off with
    `pdx.typeCheck`;
  - completion of runes, component tags (the library's and the project's), their props, events and
    named slots;
  - hover on runes and components; go to definition; find references; rename, across files;
  - document symbols and formatting.
- Components resolve per project: from the nearest `package.json` above the file, through every
  dependency that declares `customElements`.
- The server attaches to `.pdx` and `.pdx.ts` files only.

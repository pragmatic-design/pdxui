---
name: pdxui-i18n
description: "PDX (@pdxui) internationalization: $t, $n, $d and $r, setting up and switching locales, translating the strings the built-in components render, reacting to a locale change, right-to-left. Use when a .pdx app is not English-only."
---

# PDX · Internationalization

Translations and locale-aware formatting that update when the locale changes.

## Decide

| You want… | Use | Read |
| --- | --- | --- |
| a translated string, a number, a date, a relative time | `$t` · `$n` · `$d` · `$r` | [i18n](references/i18n.md) § The helpers |
| locales loaded and one active | set up locales, then switch | [i18n](references/i18n.md) § Set up locales · Switch the locale |
| the components' own strings ("Close dialog", pagination) in your language | `setLocaleStrings(…)`, once, at startup | [i18n](references/i18n.md) § Translating the built-in components |
| every key the components register, with its English default | the table | `pdxui` skill, `references/component-strings.md` |
| a right-to-left layout | | [i18n](references/i18n.md) § Right-to-left |

The `pdx i18n` command extracts keys, generates typed keys and validates dictionaries: `pdxui-setup`.

## Traps

- **Two registries, and `$t` cannot reach the second.** `$t('router.notFound')` renders the raw key:
  the components' strings are read with `getComponentString(…)` and written with
  `setComponentStrings` / `setLocaleStrings`. ([i18n](references/i18n.md) § Translating the built-in components)

From [i18n](references/i18n.md) § Gotchas:

- **A missing key falls back** to the fallback locale, then to the key itself: a typo shows the key,
  not an error. Watch the console in dev.
- **Format, don't concatenate.** `"{count} items"` is one translation with a placeholder; word order
  and plurals differ per language.
- **Currency and locale are separate.** The locale decides separators and symbol position; the
  currency is the one you pass.

## References

A copy of the site's docs page, regenerated with it: [i18n](references/i18n.md).

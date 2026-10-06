/**
 * What a reader outside the maintainers cannot open: an issue-tracker key, or a link to a private
 * agent session. Read by the published-tree guard (packages/core/tests/public-tree.test.ts) and the
 * commit-message check (scripts/commit-message-check.mjs), so the files and the history refuse the
 * same thing.
 *
 * The shapes are assembled from parts so that this file does not match itself.
 */
export const TRACKER_KEY = new RegExp(`\\b${'PDX'}UI-\\d+`);
export const SESSION_LINK = new RegExp(`${'Claude'}-Session|claude\\.ai/${'code'}`);

/**
 * A finding of an internal review: F and two or three digits, with or without the word "review"
 * before it; L, a hyphen and two or three digits; a one- or two-digit F id in parentheses, alone
 * or several joined by slashes; and the word "review" followed by a one-digit F or L id. A bare
 * function key (Shift plus F and ten, or F and twelve) is not one; nor is a
 * component-design rule id (`CD-B1`), which docs/PDX-COMPONENT-DESIGN.md defines and the compiler's
 * diagnostics print.
 */
export const REVIEW_REF = new RegExp(
    `\\b(?:${'L'}-\\d{2,3}|${'F'}(?!1[0-2]\\b)\\d{2,3})\\b`
    + `|\\breview [${'FL'}]-?\\d+|\\(${'F'}\\d{1,2}(?:/${'F'}\\d{1,2})*\\)`);

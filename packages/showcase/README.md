# PDX Service Desk — the reference application

A line-of-business application written in PDX: a list with filters and a bulk bar, a detail with
sections, a create-in-a-modal, an intake wizard, a board, live pushes, two locales and a guard. The
docs point at it, the bundle budgets are measured on it, and it is what anyone evaluating PDX opens.

## The answer to an action

Without a rule, every new action invents its own answer — an undo bar here, silence there, a
refusal worded differently on each screen.

Three rules, and every action is one of them:

| the action | the answer | where |
|---|---|---|
| **reversible, and out of sight** — archive, bulk close | a **toast carrying the undo**, for as long as the undo lasts | `answerReversible()` |
| **visible where it happened** — create, inline edit, a saved form | the record appears and **nothing else**: the screen IS the confirmation | `answerVisible()` |
| **refused** — the server said no, a permission is missing | a **toast in view that stays until it is dismissed** — never on a timer — and the next action takes it away | `answerRefused()` |

Measured in `tests/after-the-action.spec.ts`, one row per rule.

Rule 3 is a toast and not a paragraph next to the control: a paragraph ends up under the pager, out
of sight, while the reader is at the bulk bar. What the rule is FOR — a refusal does not vanish on a
timer — holds, and it appears where the eye is. The tickets list, customers and the board all answer
it this way.

**And a fourth case that is DERIVED from them, not invented beside them**: an action
over a selection can be **partly refused** — nine of twelve. It is both a success and a refusal, so
the refusal decides the placement (rule 3: it stays next to the control that asked, with no timer)
and it carries rule 1's undo for the part that did go through — over only what CHANGED, never over
what was asked. The rows that were refused stay selected, so the next attempt is a click.

`role="status"` and not `alert`, because most of the sentence is what succeeded. Measured in
`tests/bulk-partial.spec.ts`.

**And each answer reaches a screen reader exactly once.** That is the half no visual rule covers,
and the half that is easy to get wrong in both directions:

- a toast already carries `role="status"` and `aria-live="polite"` (`pdx-toast.ts:129`), so calling
  `announce()` beside it says the same thing **twice** — worse than silence;
- a row appearing is not an event a screen reader notices, so rule 2 announces and draws nothing;
- a refusal is a toast, so the toast's own live region carries it, as for rule 1,
  and rule 3 needs no call either.

The toast host lives on the SCREENS that can raise one, not in the shell — measured, not chosen for
tidiness. In `app.pdx` it joins the entry chunk, and the entry is what a visitor waits for before
anything is painted: **81 KB blocking against a budget of 78**, to answer an action that has not
happened yet. On the screens, blocking is 77.8 KB. The QUEUE is global (`getToastQueue`), so the
screens share one and only one host is ever mounted.

## Running it

```bash
pnpm --filter @pdxui/showcase dev      # Vite, everything interpreted
pnpm --filter @pdxui/showcase build    # the production build the budgets measure
pnpm --filter @pdxui/showcase test     # Playwright, against the build and against dev
```

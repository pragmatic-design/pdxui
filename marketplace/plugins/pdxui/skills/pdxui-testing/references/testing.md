<!-- Copied from packages/site/content/docs/testing.md by gen-topics.mjs: edit it there. -->

# Testing

Testing a reactive component has one catch: updates aren't synchronous with the action that causes
them. You click a button → the signal changes → the DOM updates *on the next flush*. If you assert
right after the click, you read the old state and the test fails for the wrong reason. PDX's test
utilities (Vitest + happy-dom, from `@pdxui/core/testing`) are built for this: the key is
`await tick()` between the action and the assertion.

## The base pattern

```ts
import { mount, tick, fireEvent, getByRole, cleanup } from '@pdxui/core/testing';

afterEach(cleanup);   // unmount and clean up between tests

it('increments on click', async () => {
  const el = await mount('<pdx-counter start="0"></pdx-counter>');   // markup in, container out
  fireEvent(getByRole(el, 'button', { name: '+1' }), 'click');       // act
  await tick();                                                       // WAIT for the reactive flush
  expect(el.textContent).toContain('1');                              // assert on the new state
});
```

Read the flow: **mount → find → act → `await tick()` → assert**. That `tick` is what separates a
reliable test from a flaky one.

Two things about `mount` that the shape of the call is telling you:

- it takes **markup**, not a tag and a props object — so a prop is written the way a user would write
  it, as an attribute, and a non-primitive one is set on the element afterwards (`el.querySelector('pdx-grid').data = rows`);
- it is **async**, and must be awaited: it waits for every custom element inside to upgrade. Forget
  the `await` and you are querying a `Promise`.

What comes back is the **container** it mounted into, not the component — which is why every query
below takes a container as its first argument.

## Finding things: the queries

Without them a test falls back to `el.querySelector('.pdx-input')` — a class selector against the
design system's internals, which breaks on any refactor and asserts nothing about whether the control
is usable.

```ts
import { getByRole, getByText, getByTestId, queryByRole, findByText } from '@pdxui/core/testing';

getByRole(el, 'button', { name: 'Save' });   // throws if there is no such button
queryByRole(el, 'dialog');                   // null when absent — for asserting absence
await findByText(el, /3 results/);           // waits for it to appear
getByTestId(el, 'row-3');                    // the escape hatch
```

**The prefix is the contract**, and picking the wrong one is how a real failure becomes a silent pass:

| | when nothing matches |
| --- | --- |
| `getBy*` | **throws**, with the role or text in the message. The default |
| `queryBy*` | returns `null`. Use it to assert something is *not* there: `expect(queryByText(el, 'Saved')).toBeNull()` |
| `findBy*` | **waits** and resolves, or rejects on timeout. For what appears asynchronously |

`getByRole(el, role, { name })` is the one to reach for first, and not only because it is stable:
`name` matches the **accessible name**, so a test that passes is evidence the control is reachable by
a screen reader. A test written against `.pdx-btn` can pass on a button nobody can use.

`getByTestId` is the escape hatch for what has no role and no stable text — a decorative wrapper, a
chart canvas. Reaching for it first is a smell; reaching for it third is fine.

## The rest of the utilities

- **`tick()`** — waits for the reactive flush *and* the render. After every action that changes state,
  before asserting.
- **`fireEvent(el, name, detail?)`** — dispatches a real event, bubbling and composed. With a `detail`
  it dispatches a `CustomEvent`, which is how you drive a component's own `@event` contract:
  `fireEvent(input, 'pdx-input', { value: 'hello' })`.
- **`waitFor(condition, timeout?)`** — waits for a **condition to return true**, not for an assertion
  to stop throwing: `await waitFor(() => queryByRole(el, 'dialog') !== null)`. Default timeout 3 s.
- **`cleanup()`** — unmounts every container. Put it in `afterEach`, or one test's DOM is the next
  test's.

## Testing events

```ts
it('emits pdx-change on toggle', async () => {
  const el = await mount('<pdx-switch></pdx-switch>');
  const onChange = vi.fn();
  el.addEventListener('pdx-change', onChange);

  fireEvent(getByRole(el, 'switch'), 'click');
  await tick();

  expect(onChange).toHaveBeenCalledOnce();
});
```

The listener goes on the **container**, not the component: the events a component declares with
`@event` bubble and are composed, so the container sees them, and a test that listens there is testing
what a parent would actually receive.

## Beyond unit tests: contract tests

Unit tests verify *logic* (state, ARIA, events). But for a component library the **visual and
geometric** rendering matters too, for every theme. That's why UI components have a second level:
mathematical **contract tests** (Playwright + ResponsiveJS) that measure heights, borders, radii,
alignment across all themes, plus deterministic **visual regression**.

The rule that keeps quality over time: **every bug found becomes a test** that reproduces it (it must
fail *before* the fix — red → green). That way no bug can come back twice.

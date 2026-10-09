/**
 * The intake wizard: the case where the form's parts stop being independent.
 *
 * A single `<pdx-auto-form>` proves the schema path and nothing else. What this asserts is the
 * joins — a step that will not advance until its own fields are good, a rule that reads TWO
 * fields, a section that appears because of an earlier answer, rows validated one by one, two
 * forms that submit as one, and a guard on leaving with unsaved work.
 *
 * Filled as a person would fill it, against the production build, and the submit is asserted on
 * the WHOLE payload the server received rather than on a field of it.
 */
import { test, expect, type Page } from './fixture';
import { demo } from './demo';
import { pickLocale } from './locale';

/** The question on leaving with unsaved work: the dialog queue's modal, by its role and its name. */
const leaveAsk = (page: Page) => page.getByRole('alertdialog', { name: 'Leave this intake?' });

/**
 * A panel, by the label it declares — NOT by its text.
 *
 * `hasText` lies twice: step 1 contains the word "Requester" as a field label, so the assertion
 * passes while the wizard has already moved on; step 2 contains neither "Window" nor anything like
 * it, so the same helper cannot find a panel that is on screen. `data-label` is what the wizard reads to build the stepper.
 */
const step = (page: Page, label: string) => page.locator(`[data-wizard-step][data-label="${label}"]`);

async function openIntake(page: Page): Promise<void> {
    await page.goto('/intake');
    await expect(page.locator('[data-test="intake"]')).toBeVisible();
    // The stepper, not the host: `<pdx-wizard>` is a custom element with no box of its own, so
    // `toBeVisible()` on it is false however well the wizard is working.
    await expect(page.locator('[data-test="wizard"] .pdx-stepper')).toBeVisible();
}

/**
 * The wizard's own footer buttons, by the attribute the component puts on them.
 *
 * By accessible name they collide: the relation-picker on step 1 paginates, and its "Next page"
 * matches /next/i too. `[data-wizard-next]` is the component's own hook and cannot drift into
 * another component's button.
 */
const next = (page: Page) => page.locator('[data-wizard-next]');

/**
 * The activity cell of each row of the field list.
 *
 * Not `input[type="text"]`: a row has TWO of those — the activity, inside a `<pdx-input>`, and
 * the hours, which the number input also renders as text. Selecting both makes `nth(1)` the first
 * row's hours, so a test that means to fill the second row types into a number field that
 * rejects it and leaves an empty string behind.
 */
const activityCells = (list: ReturnType<Page['locator']>) => list.locator('pdx-input input');
const back = (page: Page) => page.locator('[data-wizard-back], [data-wizard-prev]');

/** Type into a `<pdx-input>`: the control is the inner native input. */
async function fill(page: Page, test: string, value: string): Promise<void> {
    await page.locator(`[data-test="${test}"] input:not([type="hidden"])`).fill(value);
    await page.locator(`[data-test="${test}"] input:not([type="hidden"])`).blur();
}

async function fillStepOne(page: Page): Promise<void> {
    await fill(page, 'requester', 'Anna Bianchi');
    await fill(page, 'email', 'anna@example.com');
}

test('the wizard mounts, on its first step, with nothing thrown', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
    await openIntake(page);
    expect(errors, 'the wizard threw while mounting').toEqual([]);
    await expect(step(page, 'Requester')).toBeVisible();
});

test('the wizard survives typing: its panels are nested, and a field\'s event is not its own', async ({ page }) => {
    // Defects that meet on this screen are all silent.
    //
    // The panels are grouped BY FORM — a `<form>` inside a `<form>` is invalid HTML — so each one
    // sits a level below the wizard. `discoverSteps()` searches deep and finds them, and an
    // `insertBefore(stepper, panel)` that assumes a direct child throws NotFoundError inside the
    // component's own rAF, with the console empty while four steps render stacked.
    //
    // Then `pdx-change`: `<pdx-input>` emits it too, it bubbles, and the page's listener is on an
    // ancestor of every field. Typing one character delivers `{ value: 'A' }` to the wizard's
    // step handler (`target=pdx-input detail={"value":"A"}`); taken as the step, it becomes a
    // string, and `:value` coerces it to NaN.
    await openIntake(page);
    const wizard = page.locator('[data-test="wizard"]');
    await expect(wizard.locator('.pdx-stepper'), 'no stepper: the build threw where nobody saw it').toBeVisible();

    const state = () => page.evaluate(() => {
        const w = document.querySelector('[data-test="wizard"]') as HTMLElement & { value: unknown };
        return {
            value: String(w?.value),
            shown: [...document.querySelectorAll<HTMLElement>('[data-wizard-step]')]
                .filter(p => p.style.display !== 'none').length,
        };
    });
    expect(await state()).toEqual({ value: '0', shown: 1 });

    await fill(page, 'requester', 'Anna Bianchi');
    await fill(page, 'email', 'anna@example.com');
    expect(await state(), 'typing in a field moved the wizard').toEqual({ value: '0', shown: 1 });
});

test('a step does not advance while its own fields are invalid', async ({ page }) => {
    await openIntake(page);
    // Next with an empty required field: the wizard's `pdx-before-change` is cancelled.
    await next(page).click();
    await expect(step(page, 'Requester'), 'the wizard advanced past an empty required field').toBeVisible();

    await fill(page, 'requester', 'Anna Bianchi');
    await fillStepOne(page);
    await next(page).click();
    await expect(step(page, 'Window')).toBeVisible();
});

test('a rule that reads TWO fields is the field\'s own error, and stops the step', async ({ page }) => {
    // The cross-field case. `@form … { validate }` makes it the form's rule, not a `$derived` on
    // the page rendering the page's own paragraph, so the message is `ends`'s error and lives in
    // ITS `<pdx-form-field>`.
    //
    // Asserted through the field rather than by a `data-test` on a paragraph: a page can put a
    // message anywhere, and what this checks is that it lands where every other error lands.
    await openIntake(page);
    await fillStepOne(page);
    await next(page).click();

    const endsField = page.locator('pdx-form-field[name="ends"]');
    await fill(page, 'starts', '2026-10-10');
    await fill(page, 'ends', '2026-10-01');
    await expect(endsField, 'the message is not on the field the rule named').toContainText(/before|precede/i);

    await next(page).click();
    await expect(step(page, 'Window'), 'the wizard advanced with the end before the start').toBeVisible();

    // Corrected, and it lets go.
    await fill(page, 'ends', '2026-10-12');
    await expect(endsField).not.toContainText(/before|precede/i);
    await next(page).click();
    await expect(step(page, 'Details')).toBeVisible();
});

test('going back keeps what was typed, and back is never blocked', async ({ page }) => {
    await openIntake(page);
    await fillStepOne(page);
    await next(page).click();
    await fill(page, 'starts', '2026-10-10');
    await fill(page, 'ends', '2026-10-12');
    await next(page).click();
    await expect(step(page, 'Details')).toBeVisible();

    await back(page).click();
    // The picker's VALUE, which is ISO; its text is the locale's (10/10/2026).
    await expect.poll(() => page.locator('[data-test="starts"]').evaluate((el) => (el as HTMLElement & { value: string }).value),
        { message: 'the window step lost its dates' }).toBe('2026-10-10');
    await back(page).click();
    await expect(page.locator('[data-test="requester"] input:not([type="hidden"])')).toHaveValue('Anna Bianchi');
});

test('the conditional section follows the earlier answer', async ({ page }) => {
    await openIntake(page);
    await fillStepOne(page);
    await next(page).click();
    await fill(page, 'starts', '2026-10-10');
    await fill(page, 'ends', '2026-10-12');

    // On site is the default, so the address is there; remote replaces it with the note.
    await next(page).click();
    await expect(page.locator('[data-test="address"]')).toBeVisible();
    await expect(page.locator('[data-test="remote-note"]')).toBeHidden();

    await back(page).click();
    // Through the control a person uses: the PDX select, opened and picked by its option's name.
    await page.locator('[data-test="mode"] [role="combobox"]').click();
    await page.getByRole('option', { name: 'Remote' }).click();
    await next(page).click();
    await expect(page.locator('[data-test="address"]'), 'the address stayed for a remote job').toBeHidden();
    await expect(page.locator('[data-test="remote-note"]')).toBeVisible();
});

test('the mode is a PDX select, not the browser\'s, and its value is not cut', async ({ page }) => {
    // A native <select class="pdx-input"> takes the input's padding, which sits the value too low
    // and cuts it: the mode is a PDX dropdown.
    await openIntake(page);
    await fillStepOne(page);
    await next(page).click();
    const mode = page.locator('[data-test="mode"]');
    expect(await mode.evaluate(el => el.tagName.toLowerCase()), 'the mode is the browser\'s select').toBe('pdx-select');
    await expect(page.locator('select[data-test="mode"], [data-test="mode"] select')).toHaveCount(0);
});

test('step 3 keeps the page\'s section gap between its groups', async ({ page }) => {
    // Vertical spacing around «add activity» on step 3: address, attachment and activities do not
    // sit edge to edge, and the add button does not touch the drop zone.
    await openIntake(page);
    await walkToBilling(page);
    const gaps = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.height = 'var(--pdx-space-lg)';
        document.body.appendChild(probe);
        const sectionGap = probe.getBoundingClientRect().height;
        probe.remove();
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const address = box('[data-test="address"]');
        const upload = box('[data-test="attachment"]');
        const lines = box('[data-test="lines"]');
        return { sectionGap, addressToUpload: upload.top - address.bottom, uploadToLines: lines.top - upload.bottom };
    });
    expect(gaps.sectionGap, 'the probe measured nothing').toBeGreaterThan(0);
    // The attachment's label sits between the address and the drop zone, so that gap holds it too.
    expect(gaps.addressToUpload, 'the address and the attachment touch').toBeGreaterThanOrEqual(gaps.sectionGap);
    expect(gaps.uploadToLines, 'the drop zone and the activities touch').toBeGreaterThanOrEqual(gaps.sectionGap);
});

/** Walk to the last step with a valid intake, leaving the row list empty. */
async function walkToBilling(page: Page): Promise<void> {
    await fillStepOne(page);
    await next(page).click();
    await fill(page, 'starts', '2026-10-10');
    await fill(page, 'ends', '2026-10-12');
    await next(page).click();
    await expect(step(page, 'Details')).toBeVisible();
}

test('the relation picker pages at the source, and what is picked reaches the payload', async ({ page }) => {
    // Two silent defects stand in the way here.
    //
    // A mock that reads `request.skip` / `request.take` — fields a `DataRequest` does not have —
    // returns every row, and the picker renders all of them under a pager that says "1–5 of 24".
    // It is a type error as well, which only a tsconfig for `packages/showcase` catches.
    //
    // And `pdx-pick` carries `{ items }`: a page that reads `detail.rows` fires the event, finds
    // nothing, and leaves the payload's `customer` empty.
    await openIntake(page);
    const picker = page.locator('[data-test="customer-picker"]');
    // The BODY rows. `[role="row"]` with gridcells also matches the filter row, which
    // `searchable` adds under the header — counting it makes "a page of five" six.
    const rows = picker.locator('[role="row"]:not(.pdx-dg-filter-row)')
        .filter({ has: page.locator('[role="gridcell"]') });

    await expect(rows, 'the picker is showing the whole table, not a page').toHaveCount(5);
    // The customers store's twenty-four.
    await expect(picker.locator('[role="navigation"]')).toContainText('24');

    // The second page is the server's, not a slice of something already downloaded.
    await picker.getByRole('button', { name: '2' }).click();
    await expect(rows).toHaveCount(5);
    await expect(rows.first(), 'page 2 shows page 1 again').not.toContainText('Northwind Traders');

    await picker.getByRole('button', { name: '1' }).click();
    await rows.first().locator('input[type="checkbox"]').check();
    await picker.locator('pdx-button[variant="primary"] button').click();
    await expect(page.locator('[data-test="customer-picked"]'),
        'the pick was read from a key the event does not carry').toHaveText('Northwind Traders');

    // And it survives to the server.
    await fillStepOne(page);
    await next(page).click();
    await fill(page, 'starts', '2026-10-10');
    await fill(page, 'ends', '2026-10-12');
    await next(page).click();
    await next(page).click();
    await fill(page, 'po', 'PO-7000');
    await page.locator('[data-test="submit"] button').click();
    await expect(page.locator('[data-test="submitted"]')).toBeVisible();
    expect(await page.evaluate(() => (globalThis as unknown as { __pdxLastIntake?: { intake?: { customer?: string } } })
        .__pdxLastIntake?.intake?.customer)).toBe('Northwind Traders');
    // And by id: the customers store's first, the record the tickets and the assets name.
    expect(await page.evaluate(() => (globalThis as unknown as { __pdxLastIntake?: { intake?: { customerId?: number } } })
        .__pdxLastIntake?.intake?.customerId)).toBe(1);
});

test('the picker is searched at the source, and the request carries the filter', async ({ page }) => {
    // A picker that can be paged and not narrowed is only good for a list short enough to scroll,
    // and that is a `<select>`. `searchable` turns the grid's filter row on in
    // `<pdx-relation-picker>`.
    await openIntake(page);
    const picker = page.locator('[data-test="customer-picker"]');
    // The BODY rows. `[role="row"]` with gridcells also matches the filter row, which
    // `searchable` adds under the header — counting it makes "a page of five" six.
    const rows = picker.locator('[role="row"]:not(.pdx-dg-filter-row)')
        .filter({ has: page.locator('[role="gridcell"]') });
    await expect(rows).toHaveCount(5);

    // The field exists at all, which is the defect in one assertion: without it, the picker holds
    // checkboxes and no text input.
    const search = picker.locator('input[type="text"], input:not([type])').first();
    await expect(search, 'the picker offers nothing to type into').toBeVisible();

    await search.fill('north');

    // Narrowed — and narrowed AT THE SOURCE. The two are different claims: a client-side filter
    // over the five rows already downloaded would look the same on screen and could never find a
    // customer on page 3.
    await expect.poll(() => rows.count(), { message: 'the list did not narrow' }).toBeLessThan(5);
    await expect(rows).toContainText(/Northwind/);

    const asked = await page.evaluate(() => globalThis.__pdxLastCustomerRequest);
    expect(asked?.filter, 'the transport was never asked to filter').toEqual([
        { field: 'name', value: 'north' },
    ]);
    expect(asked?.total, 'the server answered with the whole table, so it filtered nothing')
        .toBeLessThan(24);

    // And a row found by searching can be picked, which is the point of finding it.
    await rows.first().locator('input[type="checkbox"]').check();
    await picker.locator('pdx-button[variant="primary"] button').click();
    await expect(page.locator('[data-test="customer-picked"]')).toContainText(/Northwind/);
});

test('a row added to the list is validated one by one, and reaches the payload', async ({ page }) => {
    // `+ Add activity` adds a row a person can reach, and the row's own `required` — the thing
    // this step exists to demonstrate — is exercised.
    //
    // A bound `value` that becomes NaN makes the wizard hide EVERY panel, so the row is added into
    // DOM nobody can reach: with the `Number.isFinite` guard taken out, this exact probe fails with
    // `locator.fill: Test timeout of 30000ms exceeded`, every run.
    //
    // The row's rule cannot be declared in the schema (`PDX_FORM_ARRAY_RULES_IGNORED`), so
    // `<pdx-field-list>` registering it as the row is added is the only path there is.
    await openIntake(page);
    await walkToBilling(page);

    const lines = page.locator('[data-test="lines"]');
    await lines.getByRole('button', { name: /add/i }).click();
    await expect(activityCells(lines).first(), 'the row was never added').toBeVisible();

    // Empty and required: the step does not advance.
    //
    // The guard on this screen asks `intake.fields.lines.value()` which rows to check, so
    // `<pdx-field-list>` mirrors its rows, kept as dotted paths, onto that array field. Without
    // that the guard reads `[]`, has nothing to check, and lets the step through; the panel it
    // leaves then hides — correctly — and the fill below times out on a cell that has gone off
    // screen, which looks like a wizard that hides the step it refused to leave. No wait belongs
    // here.
    await next(page).click();
    await expect(step(page, 'Details'), 'the wizard advanced with an empty required cell').toBeVisible();

    await activityCells(lines).first().fill('Survey');
    await activityCells(lines).first().blur();
    await next(page).click();
    await expect(step(page, 'Billing')).toBeVisible();

    // The other half of the same defect, and the one a person sees: this line reads the array
    // field through `lineCount`, and must not say "0 activities" with a row on screen.
    // The COUNT, not the wording: `reviewLines` is "{count} activities" in every case, and its
    // pluralisation is the dictionary's business rather than this test's.
    await expect(page.locator('[data-test="review-lines"]'), 'the summary cannot count the rows')
        .toHaveText(/^1 /);

    // And it is in what the server receives — not just on screen.
    await fill(page, 'po', 'PO-9001');
    await page.locator('[data-test="submit"] button').click();
    await expect(page.locator('[data-test="submitted"]')).toBeVisible();
    expect(await page.evaluate(() => (globalThis as unknown as { __pdxLastIntake?: { intake?: { lines?: unknown } } })
        .__pdxLastIntake?.intake?.lines), 'the row never reached the payload')
        .toEqual([{ activity: 'Survey', hours: 1 }]);
});

test('a second row is added, and removing the first re-indexes the rest', async ({ page }) => {
    // Removal is where a list keyed by dotted paths breaks: the rows are `lines.0.*`, `lines.1.*`,
    // and taking the first one out has to renumber the second rather than leave a hole. Two rows
    // with DIFFERENT values is the only way to tell renumbering from truncation — with identical
    // ones, dropping either leaves the same payload.
    //
    // `<pdx-field-list>` has no reorder, so a row is added and removed, never moved.
    await openIntake(page);
    await walkToBilling(page);

    const lines = page.locator('[data-test="lines"]');
    const add = lines.getByRole('button', { name: /add/i }).first();
    await add.click();
    await activityCells(lines).first().fill('Survey');
    await add.click();
    await expect(activityCells(lines), 'the second row was not added').toHaveCount(2);
    await activityCells(lines).nth(1).fill('Report');
    await activityCells(lines).nth(1).blur();

    // Remove the FIRST: the survivor must be the second one, renumbered to 0.
    await lines.getByRole('button', { name: /remove/i }).first().click();
    await expect(activityCells(lines)).toHaveCount(1);
    await expect(activityCells(lines).first()).toHaveValue('Report');

    await next(page).click();
    await fill(page, 'po', 'PO-7100');
    await page.locator('[data-test="submit"] button').click();
    await expect(page.locator('[data-test="submitted"]')).toBeVisible();
    expect(await page.evaluate(() => (globalThis as unknown as { __pdxLastIntake?: { intake?: { lines?: unknown } } })
        .__pdxLastIntake?.intake?.lines), 'the removal left a hole or kept the wrong row')
        .toEqual([{ activity: 'Report', hours: 1 }]);
});

test('two forms submit as ONE unit, and the whole payload reaches the server', async ({ page }) => {
    await openIntake(page);
    await walkToBilling(page);
    // The conditional section is on screen (the mode is `onsite`), so its fields are filled too:
    // a payload assertion that never exercises the group cannot say whether the group reached it.
    await fill(page, 'street', 'Via Roma 1');
    await fill(page, 'city', 'Verona');
    await next(page).click();
    await expect(step(page, 'Billing')).toBeVisible();

    // The second form is invalid, so `submitAll` must not submit the FIRST one either: it
    // validates everything before submitting anything.
    await page.locator('[data-test="submit"] button').click();
    await expect(page.locator('[data-test="submitted"]')).toBeHidden();
    expect(await page.evaluate(() => globalThis.__pdxLastIntake ?? null),
        'the intake was committed while the billing form was invalid').toBeNull();

    await fill(page, 'po', 'PO-4417');
    await page.locator('[data-test="submit"] button').click();
    await expect(page.locator('[data-test="submitted"]')).toBeVisible();

    // The WHOLE payload, as the server received it — not a field of it read off the screen.
    expect(await page.evaluate(() => globalThis.__pdxLastIntake)).toEqual({
        intake: {
            requester: 'Anna Bianchi',
            email: 'anna@example.com',
            starts: '2026-10-10',
            ends: '2026-10-12',
            // A `@form` field declared as a nested object produces its fields. If the compiler
            // dropped the declaration, the controls would render, the characters would appear,
            // and nothing would arrive: the binding's optional chaining skips the call.
            address: { street: 'Via Roma 1', city: 'Verona' },
            lines: [],
            customer: '',
            // The customer by id as well as by name, and the asset: none
            // picked, so none sent.
            customerId: 0,
            assetId: 0,
            mode: 'onsite',
        },
        billing: { po: 'PO-4417' },
    });
});

test('a server refusal leaves nothing committed, and says so', async ({ page }) => {
    await openIntake(page);
    await walkToBilling(page);
    await next(page).click();
    await fill(page, 'po', 'PO-4418');

    await demo(page, 'refuse-next');
    await page.locator('[data-test="submit"] button').click();

    await expect(page.locator('[data-test="server-error"]'), 'the refusal was swallowed').toBeVisible();
    await expect(page.locator('[data-test="submitted"]')).toBeHidden();
    expect(await page.evaluate(() => globalThis.__pdxLastIntake ?? null)).toBeNull();
});

test('leaving with unsaved work asks first, and staying really stays', async ({ page }) => {
    await openIntake(page);
    await fill(page, 'requester', 'Anna Bianchi');

    await page.locator('[data-test="to-tickets"]').click();
    await expect(leaveAsk(page), 'the page let a dirty wizard go').toBeVisible();
    await expect(page.locator('[data-test="intake"]')).toBeVisible();
    // A MODAL, drawn as one: its backdrop covers the viewport. The outlet imports no stylesheet of its
    // own (`pdx-dialog` and `pdx-alert-dialog` import the dialog's), and it is loaded late, by the
    // shell, on a page opened directly — so the styles it draws with are asserted, not assumed.
    const backdrop = await leaveAsk(page).evaluate((panel) => {
        const b = panel.closest('.pdx-dialog-backdrop') as HTMLElement;
        const cs = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        return { position: cs.position, width: Math.round(r.width), height: Math.round(r.height) };
    });
    const viewport = page.viewportSize()!;
    expect(backdrop.position, 'the modal is not fixed over the page').toBe('fixed');
    expect(backdrop.width).toBe(viewport.width);
    expect(backdrop.height).toBe(viewport.height);

    await leaveAsk(page).getByRole('button', { name: 'Stay', exact: true }).click();
    await expect(leaveAsk(page)).toBeHidden();
    await expect(page.locator('[data-test="intake"]'), 'Stay did not stay').toBeVisible();
    await expect(page.locator('[data-test="requester"] input:not([type="hidden"])')).toHaveValue('Anna Bianchi');
});

test('and discarding lets the navigation through', async ({ page }) => {
    await openIntake(page);
    await fill(page, 'requester', 'Anna Bianchi');

    await page.locator('[data-test="to-tickets"]').click();
    await expect(leaveAsk(page)).toBeVisible();
    await leaveAsk(page).getByRole('button', { name: 'Discard and leave' }).click();

    await expect(page.locator('[data-test="tickets"]'), 'Discard did not leave').toBeVisible();
});

test('signing out with unsaved work asks once, and Discard lands on the sign-in carrying the page', async ({ page }) => {
    // A REDIRECTED navigation must ask the dialog once, not twice. Every route is behind the login,
    // so no guest reaches the wizard and no redirect starts here — the redirect itself is covered
    // in the router (`outlet-warn-unsaved.test.ts`, `parity.test.ts`).
    // The navigation that remains is the session ending under the page: one gesture, one question.
    await openIntake(page);
    await fill(page, 'requester', 'Anna Bianchi');

    await page.locator('[data-test="session"] [data-test="profile"]').click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(leaveAsk(page), 'the page let a dirty wizard go').toBeVisible();

    await leaveAsk(page).getByRole('button', { name: 'Discard and leave' }).click();

    // Asked a second time, the dialog comes straight back and the navigation never completes.
    await expect(page.locator('[data-test="login"]'), 'asked again: the navigation stalled').toBeVisible();
    await expect(leaveAsk(page)).toBeHidden();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/login?next=%2Fintake');
});

test('signing out with unsaved work and choosing Stay keeps the page AND the session', async ({ page }) => {
    // Sign-out navigates first and clears the tokens after: the other order makes «Stay» keep a
    // page whose session is already gone — its next request a 401, its next navigation refused.
    await openIntake(page);
    await fill(page, 'requester', 'Anna Bianchi');

    await page.locator('[data-test="session"] [data-test="profile"]').click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(leaveAsk(page)).toBeVisible();
    await leaveAsk(page).getByRole('button', { name: 'Stay', exact: true }).click();

    await expect(leaveAsk(page)).toBeHidden();
    await expect(page.locator('[data-test="intake"]'), 'Stay did not stay').toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/intake');
    expect(await page.evaluate(() => localStorage.getItem('showcase.auth')), 'Stay kept the page, not the session').not.toBeNull();
    await expect(page.locator('[data-test="session"] [data-test="profile"]')).toBeVisible();

    // And the page still works as a signed-in page: the next navigation asks (it is not refused by the
    // session hook), and Discard takes it through.
    await page.locator('[data-test="to-tickets"]').click();
    await expect(leaveAsk(page)).toBeVisible();
    await leaveAsk(page).getByRole('button', { name: 'Discard and leave' }).click();
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
});

test('control — a clean wizard is not guarded at all', async ({ page }) => {
    // Without this, a guard that always asks would pass every test above.
    await openIntake(page);
    await page.locator('[data-test="to-tickets"]').click();
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
    await expect(leaveAsk(page)).toBeHidden();
});

/**
 * The stepper follows the locale, because a step's label is the APP's copy.
 *
 * `<div data-wizard-step :data-label="$t('intake.steps.details')">` — the binding moves the
 * ATTRIBUTE when the language changes, and the stepper is built once, from that attribute, before
 * it moves. So the stepper has to refresh when it moves, or the page turns Italian and one step
 * keeps saying «Details».
 *
 * This is where the whole of it can be measured: the unit test in `packages/ui` covers the
 * refresh, and happy-dom cannot deliver the MutationObserver record that TRIGGERS it (a probe:
 * observe → write in the same tick delivers, observe → wait → write does not). Here a real browser
 * writes the attribute and a real observer sees it.
 */
test('the wizard\'s buttons are the app\'s buttons, in the page\'s language', async ({ page }) => {
    // Back and Next are default-size buttons, not pinned small beside a form whose own submit is a
    // default button, and they do not read «Back / Next / Step 1 of 4» on an Italian screen.
    await openIntake(page);
    await pickLocale(page, 'it');
    await fillStepOne(page);
    await next(page).click();
    // The step's label is translated with the page: `data-label` reads «Finestra» in Italian.
    await expect(step(page, 'Finestra')).toBeVisible();

    await expect(next(page)).toHaveText('Avanti');
    await expect(back(page)).toHaveText('Indietro');
    await expect(page.locator('[data-wizard-indicator]')).toHaveText('Passaggio 2 di 4');

    // The height of a default button of this app, measured here rather than written down.
    const heights = await page.evaluate(() => {
        const probe = document.createElement('button');
        probe.className = 'pdx-primary';
        probe.textContent = 'Probe';
        document.querySelector('[data-test="intake"]')!.appendChild(probe);
        const def = Math.round(probe.getBoundingClientRect().height);
        probe.remove();
        const h = (sel: string) => Math.round(document.querySelector(sel)!.getBoundingClientRect().height);
        return { def, next: h('[data-wizard-next]'), back: h('[data-wizard-back]') };
    });
    expect(heights.next, 'Next is not a default-size button').toBe(heights.def);
    expect(heights.back, 'Back is not a default-size button').toBe(heights.def);
    await expect(back(page), 'Back is not drawn as a secondary action').toHaveClass('pdx-ghost');
});

test('the stepper takes the new language, not the one it was built in', async ({ page }) => {
    await openIntake(page);

    const stepBtn = (i: number) => page.locator(`[data-test="wizard"] [data-step-btn="${i}"]`);
    // The control: it is English first, so the assertion below cannot pass on a page that was
    // never English.
    await expect(stepBtn(2)).toHaveAttribute('aria-label', 'Details');
    await expect(stepBtn(2).locator('.pdx-step-label')).toHaveText('Details');

    await pickLocale(page, 'it');

    await expect(stepBtn(2).locator('.pdx-step-label'),
        'the stepper kept the language it was built in').toHaveText('Dettagli');
    await expect(stepBtn(2),
        'the visible text moved and the accessible name did not').toHaveAttribute('aria-label', 'Dettagli');
    // Every step, not only the one that happened to be looked at.
    await expect(stepBtn(0)).toHaveAttribute('aria-label', 'Richiedente');
    await expect(stepBtn(3)).toHaveAttribute('aria-label', 'Fatturazione');
});

/**
 * The suite signs in once, as the admin, before any spec runs.
 *
 * Every route is behind the login, so a spec that opened `/tickets` as a guest
 * would be measuring the sign-in form. Signing in through the form in every row would cost ~400 ms
 * each and test the form 600 times; the form has its own spec (`auth.spec.ts`, `login-gate.spec.ts`).
 *
 * So this asks the mock server for a token the way the app does — `POST /api/auth/login`, a real
 * signed JWT (`mock-auth.ts`) — and writes it where the app keeps it, `localStorage['showcase.auth']`,
 * as a Playwright storage state every context starts from. A spec about a GUEST says so with
 * `test.use({ storageState: GUEST })`.
 *
 * A spec that clears the storage clears the session with it: use `clearAllButSession`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FullConfig, Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));

/** Where the signed-in state is written, per server: the build's and the dev server's sign apart. */
export const sessionFile = (port: number): string => join(here, '..', 'test-results', '.auth', `admin-${port}.json`);

/** A visitor with nothing stored: the state a guest spec asks for. */
export const GUEST = { cookies: [], origins: [] };

/** The key `src/auth.ts` persists the tokens under. */
const AUTH_KEY = 'showcase.auth';

export default async function globalSetup(config: FullConfig): Promise<void> {
    const baseURL = String(config.projects[0].use.baseURL);
    const res = await fetch(`${baseURL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'pdx' }),
    });
    if (!res.ok) throw new Error(`the suite could not sign in: ${res.status} ${await res.text()}`);
    const { access, refresh } = await res.json() as { access: string; refresh: string | null };

    const file = sessionFile(Number(new URL(baseURL).port));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({
        cookies: [],
        origins: [{ origin: baseURL, localStorage: [{ name: AUTH_KEY, value: JSON.stringify({ access, refresh }) }] }],
    }));
}

/** Clear what a spec stored — pins, views, drafts, the language — and keep the session. */
export async function clearAllButSession(page: Page): Promise<void> {
    await page.evaluate((key) => {
        const session = localStorage.getItem(key);
        localStorage.clear();
        if (session !== null) localStorage.setItem(key, session);
    }, AUTH_KEY);
}

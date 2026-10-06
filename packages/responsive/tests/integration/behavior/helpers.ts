// Helpers for the component-coherence behavior suite. The harness (ui/tests/scenarios/behavior.html)
// renders one component from ?tag with initial attrs from ?a:<name>=<value>; we drive props via
// window.__setProp and measure the resulting DOM.
import { Page, expect } from '@playwright/test';
import { openPage } from '../ui-components/contracts/measure';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const BASE = 'http://localhost:5220/behavior.html';
export const SUBJECT = '[data-test="subject"]';

export interface MountOpts { theme?: string; scheme?: string; attrs?: Record<string, unknown>; text?: string; }

export async function mount(page: Page, tag: string, opts: MountOpts = {}): Promise<void> {
    const q = new URLSearchParams({ tag });
    if (opts.theme) q.set('theme', opts.theme);
    if (opts.scheme) q.set('scheme', opts.scheme);
    if (opts.text) q.set('text', opts.text);
    for (const [k, v] of Object.entries(opts.attrs || {})) q.set('a:' + k, String(v));
    await openPage(page, `${BASE}?${q.toString()}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForSelector(SUBJECT, { timeout: 8000 });
    await page.waitForTimeout(120);
}

/** Like mount(), but only waits for the element to be ATTACHED (not visible) — for overlays
 *  (drawer/dialog) whose host is hidden until `open`. */
export async function mountRaw(page: Page, tag: string, opts: MountOpts = {}): Promise<void> {
    const q = new URLSearchParams({ tag });
    if (opts.theme) q.set('theme', opts.theme);
    if (opts.scheme) q.set('scheme', opts.scheme);
    if (opts.text) q.set('text', opts.text);
    for (const [k, v] of Object.entries(opts.attrs || {})) q.set('a:' + k, String(v));
    await openPage(page, `${BASE}?${q.toString()}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForSelector(SUBJECT, { state: 'attached', timeout: 8000 });
    await page.waitForTimeout(120);
}

/** Set a typed property on the live element (drives the signal-backed prop). */
export async function setProp(page: Page, name: string, value: unknown): Promise<void> {
    await page.evaluate(([n, v]) => (window as any).__setProp(n, v), [name, value] as const);
    await page.waitForTimeout(80);
}

/** The inner native input's displayed value, for input-like components. */
export async function inputValue(page: Page): Promise<string> {
    return page.$eval(`${SUBJECT} input`, (i: any) => i.value);
}

// ── Manifest access (for enum-coherence) ───────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, '../../../../ui/custom-elements.json'), 'utf8'));

export function declOf(tag: string): any {
    for (const m of manifest.modules) {
        const d = (m.declarations || [])[0];
        if (d && d.tagName === tag) return d;
    }
    throw new Error(`no manifest declaration for ${tag}`);
}

export function memberOf(tag: string, name: string): any {
    return (declOf(tag).members || []).find((mm: any) => mm.name === name);
}

export { expect };

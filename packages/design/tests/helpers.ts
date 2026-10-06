import { Page } from '@playwright/test';

/** Get computed style property for a data-test element */
export async function getStyle(page: Page, testId: string, prop: string): Promise<string> {
    return page.evaluate(
        ([id, p]) => {
            const el = document.querySelector(`[data-test="${id}"]`);
            if (!el) throw new Error(`Element [data-test="${id}"] not found`);
            return getComputedStyle(el).getPropertyValue(p);
        },
        [testId, prop]
    );
}

/** Get multiple computed style properties at once */
export async function getStyles(page: Page, testId: string, props: string[]): Promise<Record<string, string>> {
    return page.evaluate(
        ([id, ps]) => {
            const el = document.querySelector(`[data-test="${id}"]`);
            if (!el) throw new Error(`Element [data-test="${id}"] not found`);
            const cs = getComputedStyle(el);
            const result: Record<string, string> = {};
            for (const p of ps) result[p] = cs.getPropertyValue(p);
            return result;
        },
        [testId, props] as const
    );
}

/** Get bounding rect for a data-test element */
export async function getRect(page: Page, testId: string): Promise<DOMRect> {
    return page.evaluate((id) => {
        const el = document.querySelector(`[data-test="${id}"]`);
        if (!el) throw new Error(`Element [data-test="${id}"] not found`);
        return JSON.parse(JSON.stringify(el.getBoundingClientRect()));
    }, testId);
}

/** Get bounding rects for multiple test ids */
export async function getRects(page: Page, testIds: string[]): Promise<Record<string, DOMRect>> {
    return page.evaluate((ids) => {
        const result: Record<string, DOMRect> = {} as any;
        for (const id of ids) {
            const el = document.querySelector(`[data-test="${id}"]`);
            if (!el) throw new Error(`Element [data-test="${id}"] not found`);
            result[id] = JSON.parse(JSON.stringify(el.getBoundingClientRect()));
        }
        return result;
    }, testIds);
}

/** Parse CSS color to RGBA values (works for any format the browser computes) */
export async function getColorRgba(page: Page, testId: string, prop = 'color'): Promise<[number, number, number, number]> {
    return page.evaluate(
        ([id, p]) => {
            const el = document.querySelector(`[data-test="${id}"]`);
            if (!el) throw new Error(`Element [data-test="${id}"] not found`);
            const raw = getComputedStyle(el).getPropertyValue(p);
            // Create temp canvas to resolve any color format to RGBA
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = raw;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            return [r, g, b, a / 255] as [number, number, number, number];
        },
        [testId, prop]
    );
}

/** Get CSS custom property value from :root */
export async function getToken(page: Page, token: string): Promise<string> {
    return page.evaluate((t) => {
        return getComputedStyle(document.documentElement).getPropertyValue(t).trim();
    }, token);
}

/** Set attribute on <html> element */
export async function setHtmlAttr(page: Page, attr: string, value: string): Promise<void> {
    await page.evaluate(([a, v]) => {
        document.documentElement.setAttribute(a, v);
    }, [attr, value]);
}

/** Calculate relative luminance from sRGB (WCAG formula) */
export function relativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Calculate WCAG contrast ratio between two RGB colors */
export function contrastRatio(
    c1: [number, number, number],
    c2: [number, number, number]
): number {
    const l1 = relativeLuminance(...c1);
    const l2 = relativeLuminance(...c2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

/** Parse px value to number */
export function px(val: string): number {
    return parseFloat(val.replace('px', ''));
}

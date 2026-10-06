// HTML tooltip — positioned DOM element, supports custom content.
// Uses HTML (not canvas) so PDX components can be slotted inside.

import type { TooltipInfo, ChartTheme } from './types';
import { chartNumbers, type ChartNumbers } from './numbers';

let _tooltip: HTMLDivElement | null = null;

function getTooltip(): HTMLDivElement {
    if (_tooltip && _tooltip.isConnected) return _tooltip;
    _tooltip = document.createElement('div');
    _tooltip.className = 'pdx-chart-tooltip';
    _tooltip.style.cssText = `
        position: fixed; z-index: 1000; pointer-events: none;
        padding: 8px 12px; border-radius: 6px;
        font-size: 13px; line-height: 1.4;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        transition: opacity 0.15s, transform 0.1s;
        opacity: 0; transform: translateY(2px);
        max-width: 280px;
    `;
    document.body.appendChild(_tooltip);
    return _tooltip;
}

/** Show tooltip near a point. Values are formatted in the chart's numbers. */
export function showTooltip(info: TooltipInfo, theme: ChartTheme, container: HTMLElement, nf: ChartNumbers = chartNumbers()): void {
    const el = getTooltip();
    el.style.background = theme.bgColor;
    el.style.color = theme.textColor;
    el.style.border = `1px solid ${theme.gridColor}`;
    el.style.fontFamily = theme.fontFamily;

    // Build content
    let html = '';
    if (info.label) {
        html += `<div style="font-weight:600;margin-bottom:4px">${esc(info.label)}</div>`;
    }
    for (const p of info.points) {
        const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${escColor(p.series.color)};margin-right:6px"></span>`;
        const val = typeof p.point.y === 'number' ? nf.number(p.point.y) : String(p.point.y);
        html += `<div>${dot}${esc(p.series.name)}: <strong>${esc(val)}</strong></div>`;
    }
    el.innerHTML = html;

    // Position (follow mouse, flip at edges)
    const rect = container.getBoundingClientRect();
    let left = rect.left + info.x + 12;
    let top = rect.top + info.y - 10;
    const tipW = el.offsetWidth || 150;
    const tipH = el.offsetHeight || 60;
    if (left + tipW > window.innerWidth - 8) left = rect.left + info.x - tipW - 12;
    if (top + tipH > window.innerHeight - 8) top = window.innerHeight - tipH - 8;
    if (top < 8) top = 8;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
}

/** Hide the tooltip. */
export function hideTooltip(): void {
    if (_tooltip) {
        _tooltip.style.opacity = '0';
        _tooltip.style.transform = 'translateY(2px)';
    }
}

function esc(s: string): string {
    return s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] || c));
}

// A series color is interpolated into a `style="background:…"` attribute. Only allow
// values that are plausibly a CSS color (hex, rgb/hsl/oklch/… functions, named colors,
// var()) — anything with a quote/angle-bracket/semicolon that could break out of the
// attribute or inject extra declarations is dropped to a safe default.
function escColor(c: string): string {
    return /^[a-zA-Z0-9#(),.%\s\-]+$/.test(c) ? c : 'currentColor';
}

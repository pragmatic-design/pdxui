// DevTools Overlay — injected by Vite plugin in dev mode.
// Provides: component tree, signal inspector, trace log.
// Toggle with Ctrl+Shift+D. Zero cost in production (tree-shaken).
//
// Architecture: overlay is a plain DOM panel (no framework dependency) that reads the inspector
// core installs in development, `window.__PDX_DEVTOOLS__.debug` — in the inspector's own types,
// not a private idea of that data that tests could mock while the panel showed nothing.

import type { SignalInfo, TraceEntry, TelemetryLevel } from '../debug/inspector';
import type { DevtoolsTreeNode, DevtoolsInspection } from '../debug/devtools-api';
import { getTelemetryLevel, setTelemetryLevel } from '../debug/inspector';

/** What the overlay reads of the inspector — `__pdx_debug`, as core installs it on the window. */
interface DebugApi {
    signals(): SignalInfo[];
    traceLog(): TraceEntry[];
    trace(enabled: boolean): void;
    readonly tracing: boolean;
}
/**
 * What it reads of the global: the agent API (v1) for the component tree, and the inspector as
 * `.debug` for signals and the trace. The panel is a client of the API an agent reads.
 */
interface DevtoolsGlobal {
    tree?(): DevtoolsTreeNode[];
    inspect?(target: number): DevtoolsInspection | null;
    debug?: DebugApi;
}
type DevtoolsWindow = Window & {
    __PDX_DEVTOOLS__?: DevtoolsGlobal;
    __PDX_DEVTOOLS_TOGGLE__?: () => void;
};

/** The level the page ran at before the devtools raised it — said in the panel. */
let levelBefore: TelemetryLevel = 0;

let overlayEl: HTMLElement | null = null;
let isVisible = false;
let activeTab: 'components' | 'signals' | 'trace' = 'components';
let refreshInterval: ReturnType<typeof setInterval> | null = null;

// ─── Styles ────────────────────────────────────────────────────────

const STYLES = `
  #pdx-devtools {
    position: fixed; bottom: 0; right: 0; width: 420px; height: 50vh;
    background: #1e1e2e; color: #cdd6f4; font-family: 'Fira Code', monospace;
    font-size: 12px; border-top: 2px solid #89b4fa; border-left: 2px solid #89b4fa;
    z-index: 999999; display: flex; flex-direction: column; overflow: hidden;
    box-shadow: -4px -4px 20px rgba(0,0,0,0.5); border-radius: 8px 0 0 0;
  }
  #pdx-devtools.hidden { display: none; }
  #pdx-devtools .toolbar {
    display: flex; background: #181825; padding: 4px 8px; gap: 4px;
    border-bottom: 1px solid #313244; align-items: center;
  }
  #pdx-devtools .toolbar .brand { color: #89b4fa; font-weight: 700; margin-right: 8px; }
  #pdx-devtools .toolbar button {
    background: transparent; color: #a6adc8; border: none; padding: 4px 10px;
    border-radius: 4px; cursor: pointer; font-size: 11px; font-family: inherit;
  }
  #pdx-devtools .toolbar button:hover { background: #313244; color: #cdd6f4; }
  #pdx-devtools .toolbar button.active { background: #313244; color: #89b4fa; }
  #pdx-devtools .toolbar .close { margin-left: auto; color: #f38ba8; }
  #pdx-devtools .content { flex: 1; overflow-y: auto; padding: 8px; }
  #pdx-devtools .section-title { color: #89b4fa; font-size: 11px; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  #pdx-devtools .tree-item { padding: 3px 0 3px 12px; border-left: 1px solid #313244; }
  #pdx-devtools .tree-item:hover { background: #181825; }
  #pdx-devtools .tag { color: #f38ba8; }
  #pdx-devtools .attr { color: #a6e3a1; }
  #pdx-devtools .val { color: #fab387; }
  #pdx-devtools .signal-row { display: flex; justify-content: space-between; padding: 3px 4px; border-bottom: 1px solid #181825; }
  #pdx-devtools .signal-row:hover { background: #181825; }
  #pdx-devtools .signal-name { color: #cba6f7; }
  #pdx-devtools .signal-value { color: #a6e3a1; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
  #pdx-devtools .signal-subs { color: #585b70; font-size: 10px; }
  #pdx-devtools .trace-entry { padding: 2px 4px; border-bottom: 1px solid #181825; }
  #pdx-devtools .trace-signal { color: #f9e2af; }
  #pdx-devtools .trace-old { color: #f38ba8; text-decoration: line-through; }
  #pdx-devtools .trace-new { color: #a6e3a1; }
  #pdx-devtools .empty { color: #585b70; font-style: italic; padding: 16px; text-align: center; }
  #pdx-devtools .level-note { color: #585b70; font-size: 10px; padding: 8px 4px 0; border-top: 1px solid #313244; margin-top: 8px; }
`;

// ─── Panel Creation ────────────────────────────────────────────────

function createOverlay(): HTMLElement {
    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    const el = document.createElement('div');
    el.id = 'pdx-devtools';
    el.className = 'hidden';
    el.innerHTML = `
        <div class="toolbar">
            <span class="brand">PDX</span>
            <button data-tab="components" class="active">Components</button>
            <button data-tab="signals">Signals</button>
            <button data-tab="trace">Trace</button>
            <button class="close" data-action="close">✕</button>
        </div>
        <div class="content" id="pdx-devtools-content"></div>
    `;

    // Tab switching
    el.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = (btn as HTMLElement).dataset.tab as typeof activeTab;
            el.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            refresh();
        });
    });

    // Close button
    el.querySelector('[data-action="close"]')?.addEventListener('click', () => toggle());

    document.body.appendChild(el);
    return el;
}

// ─── Rendering ─────────────────────────────────────────────────────

function refresh(): void {
    if (!overlayEl || !isVisible) return;
    const content = overlayEl.querySelector('#pdx-devtools-content');
    if (!content) return;

    const hook = (window as DevtoolsWindow).__PDX_DEVTOOLS__;
    const debug = hook?.debug;
    if (!hook || !debug) {
        // What is missing is the HOOK, not the page's components: «No Pragmatic components
        // detected.» would be wrong on a page made only of them.
        content.innerHTML = '<div class="empty">Debug hook not found — is @pdxui/core running in dev mode? '
            + 'The panel reads window.__PDX_DEVTOOLS__, which core installs in development.</div>';
        return;
    }

    switch (activeTab) {
        case 'components':
            renderComponents(content as HTMLElement, hook);
            break;
        case 'signals':
            renderSignals(content as HTMLElement, debug);
            break;
        case 'trace':
            renderTrace(content as HTMLElement, debug);
            break;
    }
    // The registries fill at telemetry level 2, which the devtools set when they were installed:
    // said, so the cost and the reason are not a surprise.
    const note = document.createElement('div');
    note.className = 'level-note';
    note.textContent = getTelemetryLevel() === 2
        ? `Telemetry level 2 (set by the devtools; the page ran at level ${levelBefore}).`
        : `Telemetry level ${getTelemetryLevel()}: the registries fill at level 2.`;
    content.appendChild(note);
}

function renderComponents(container: HTMLElement, hook: DevtoolsGlobal): void {
    try {
        const tree = hook.tree?.() ?? [];
        if (tree.length === 0) {
            container.innerHTML = '<div class="empty">No components on this page.</div>';
            return;
        }

        let html = '<div class="section-title">Component Tree</div>';
        html += renderTreeNodes(tree, 0, hook);
        container.innerHTML = html;
    } catch {
        container.innerHTML = '<div class="empty">Error reading component tree.</div>';
    }
}

function renderTreeNodes(nodes: DevtoolsTreeNode[], depth: number, hook: DevtoolsGlobal): string {
    let html = '';
    for (const node of nodes) {
        const indent = depth * 16;
        // Its declared props, as `inspect()` reads them — values, not the attributes on the element.
        const props = hook.inspect?.(node.id)?.props ?? {};
        const attrs = Object.entries(props)
            .map(([k, v]) => `<span class="attr">${esc(k)}</span>=<span class="val">"${esc(format(v))}"</span>`)
            .join(' ');
        html += `<div class="tree-item" style="padding-left:${indent + 12}px" data-id="${node.id}"${node.file ? ` title="${esc(node.file)}"` : ''}>`;
        html += `<span class="tag">&lt;${esc(node.tag)}</span>${attrs ? ' ' + attrs : ''}<span class="tag">&gt;</span>`;
        html += `</div>`;
        if (node.children.length) {
            html += renderTreeNodes(node.children, depth + 1, hook);
        }
    }
    return html;
}

function renderSignals(container: HTMLElement, debug: DebugApi): void {
    try {
        const signals = debug.signals();
        if (!signals || signals.length === 0) {
            container.innerHTML = '<div class="empty">No signals registered.</div>';
            return;
        }

        let html = '<div class="section-title">Signals (' + signals.length + ')</div>';
        for (const s of signals) {
            const val = typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value);
            html += `<div class="signal-row">`;
            html += `<span class="signal-name">${esc(s.name)}</span>`;
            html += `<span class="signal-value" title="${esc(val)}">${esc(val.slice(0, 50))}</span>`;
            html += `<span class="signal-subs">${s.subscriberCount} subs</span>`;
            html += `</div>`;
        }
        container.innerHTML = html;
    } catch {
        container.innerHTML = '<div class="empty">Error reading signals.</div>';
    }
}

function renderTrace(container: HTMLElement, debug: DebugApi): void {
    try {
        const log = debug.traceLog();
        if (log.length === 0) {
            container.innerHTML = debug.tracing
                ? '<div class="empty">Tracing is on. Change something on the page.</div>'
                : '<div class="empty">Tracing disabled.</div>'
                    + '<button data-action="enable-trace" style="margin:8px;padding:4px 12px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;cursor:pointer">Enable Tracing</button>';
            // A listener, not an inline `onclick`: a strict CSP blocks those.
            container.querySelector('[data-action="enable-trace"]')?.addEventListener('click', () => {
                debug.trace(true);
                refresh();
            });
            return;
        }

        // The inspector's entries: the signal that triggered, its old and new value, and the effect
        // it ran. Each was dropped before, for not being the `{ type, name }` the panel expected.
        let html = '<div class="section-title">Trace Log (' + log.length + ' entries)</div>';
        for (let i = log.length - 1; i >= Math.max(0, log.length - 50); i--) {
            const entry = log[i];
            html += `<div class="trace-entry">`;
            html += `<span class="trace-signal">${esc(entry.trigger)}</span> `;
            html += `<span class="trace-old">${esc(format(entry.oldValue))}</span> → `;
            html += `<span class="trace-new">${esc(format(entry.newValue))}</span>`;
            html += ` ⚡ ${esc(entry.effect)}`;
            if (entry.error) html += ` <span class="trace-old">${esc(entry.error)}</span>`;
            html += `</div>`;
        }
        container.innerHTML = html;
    } catch {
        container.innerHTML = '<div class="empty">Error reading trace log.</div>';
    }
}

function format(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 40);
    return String(value);
}

/** Escape app-controlled values before putting them in innerHTML (prevents XSS in the panel). */
function esc(value: unknown): string {
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Toggle ────────────────────────────────────────────────────────

/**
 * Show or hide the DevTools overlay, creating it on first use.
 *
 * While visible it polls every 500ms; hiding it stops the interval, so a panel left open does not
 * quietly cost a re-read of the signal registry forever. Also bound to Ctrl+Shift+D by
 * {@link initDevTools}.
 */
export function toggle(): void {
    if (!overlayEl) overlayEl = createOverlay();

    isVisible = !isVisible;
    overlayEl.classList.toggle('hidden', !isVisible);

    if (isVisible) {
        refresh();
        // Auto-refresh every 500ms while visible
        refreshInterval = setInterval(refresh, 500);
    } else {
        if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    }
}

// ─── Init ──────────────────────────────────────────────────────────

/**
 * Install the DevTools overlay: the Ctrl+Shift+D shortcut and the global handle.
 *
 * Call it from a development entry point only. It is behind `@pdxui/core/devtools` rather than
 * the barrel precisely so a production bundle that never imports it never carries the panel, its
 * polling or its DOM.
 */
export function initDevTools(): void {
    // Level 2 before the app builds anything: a signal registers itself when it is CREATED, so a
    // level raised when the panel opens finds the registries empty (the inspector says so). The
    // plugin puts this script before the app's. Dev-only, as this whole module is.
    levelBefore = getTelemetryLevel();
    if (levelBefore < 2) setTelemetryLevel(2);

    // Keyboard shortcut: Ctrl+Shift+D
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            toggle();
        }
    });

    // Make toggle available globally for other tools
    (window as DevtoolsWindow).__PDX_DEVTOOLS_TOGGLE__ = toggle;

    // Small floating badge
    const badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;bottom:8px;right:8px;background:#89b4fa;color:#1e1e2e;padding:4px 10px;border-radius:12px;font:bold 11px system-ui;cursor:pointer;z-index:999998;opacity:0.7;transition:opacity 0.2s;';
    badge.textContent = 'PDX';
    badge.title = 'Pragmatic DevTools (Ctrl+Shift+D)';
    badge.addEventListener('click', toggle);
    badge.addEventListener('mouseenter', () => badge.style.opacity = '1');
    badge.addEventListener('mouseleave', () => badge.style.opacity = '0.7');
    // Not on a phone layout. Fixed in the bottom-right corner, the badge sits on an app's bottom
    // navigation: a tap on its last item would open the devtools instead. The shortcut
    // above still opens the panel everywhere; the query is followed, so a resize shows or hides it.
    const phone = window.matchMedia?.(BADGE_HIDDEN_QUERY);
    badge.hidden = !!phone?.matches;
    phone?.addEventListener?.('change', (e) => { badge.hidden = e.matches; });
    document.body.appendChild(badge);
}

/** Where the badge would cover the app: a touch device, or a window narrower than a tablet. */
const BADGE_HIDDEN_QUERY = '(pointer: coarse), (max-width: 767px)';

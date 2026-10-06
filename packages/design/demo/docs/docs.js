// Shared docs logic: inject sidebar + topbar, mobile drawer, code toggle, icons

const PAGES = [
    { section: 'Foundation', items: [
        { href: 'index.html', label: 'Overview', icon: 'home' },
        { href: 'layout.html', label: 'Layout', icon: 'layout-grid' },
        { href: 'surfaces.html', label: 'Surfaces', icon: 'layers' },
        { href: 'typography.html', label: 'Typography', icon: 'type' },
    ]},
    { section: 'Components', items: [
        { href: 'buttons.html', label: 'Buttons', icon: 'mouse-pointer-click' },
        { href: 'forms.html', label: 'Form Controls', icon: 'text-cursor-input' },
        { href: 'navigation.html', label: 'Navigation', icon: 'compass' },
        { href: 'data.html', label: 'Data Display', icon: 'table-2' },
        { href: 'feedback.html', label: 'Feedback', icon: 'bell' },
        { href: 'overlays.html', label: 'Overlays', icon: 'panel-top' },
        { href: 'drawer.html', label: 'Drawer', icon: 'panel-left' },
        { href: 'popover.html', label: 'Popover', icon: 'message-square' },
        { href: 'menu.html', label: 'Menu', icon: 'list' },
        { href: 'command.html', label: 'Command', icon: 'terminal' },
        { href: 'toolbar.html', label: 'Toolbar', icon: 'minus' },
        { href: 'banner.html', label: 'Banner', icon: 'megaphone' },
        { href: 'code.html', label: 'Code Block', icon: 'code-2' },
        { href: 'toast.html', label: 'Toast', icon: 'bell-ring' },
        { href: 'chips.html', label: 'Chips', icon: 'tag' },
        { href: 'cards.html', label: 'Cards', icon: 'credit-card' },
        { href: 'skeleton.html', label: 'Skeleton', icon: 'loader' },
        { href: 'stepper.html', label: 'Stepper', icon: 'git-branch' },
        { href: 'segmented.html', label: 'Segmented', icon: 'toggle-left' },
        { href: 'media.html', label: 'Media', icon: 'image' },
        { href: 'avatar.html', label: 'Avatar', icon: 'user-circle' },
    ]},
    { section: 'Utilities', items: [
        { href: 'utilities.html', label: 'Helpers', icon: 'wrench' },
        { href: 'kbd.html', label: 'Keyboard', icon: 'keyboard' },
    ]},
];

function getCurrentPage() {
    const path = location.pathname.split('/').pop() || 'index.html';
    return path;
}

// Sidebar
const sidebar = document.getElementById('sidebar');
if (sidebar) {
    const current = getCurrentPage();
    let html = `<pdx-stack pad="md" gap="xs">
        <a href="index.html" style="text-decoration:none"><pdx-row gap="xs" items="center" wrap="no">
            <span class="pdx-txt-title">PDX</span>
            <span class="pdx-badge pdx-badge-secondary">v0.1</span>
        </pdx-row></a><hr>`;

    for (const group of PAGES) {
        html += `<span class="doc-nav-section">${group.section}</span>`;
        for (const item of group.items) {
            const active = current === item.href ? ' active' : '';
            const icon = item.icon ? `<i data-lucide="${item.icon}" style="width:15px;height:15px;flex-shrink:0"></i>` : '';
            html += `<a class="doc-nav-link${active}" href="${item.href}">${icon}${item.label}</a>`;
        }
        html += '<hr>';
    }
    html += '</pdx-stack>';
    sidebar.innerHTML = html;
}

// Topbar
const topbar = document.getElementById('topbar');
if (topbar) {
    topbar.innerHTML = `
        <button class="doc-hamburger" onclick="toggleDrawer()" aria-label="Menu">&#9776;</button>
        <span class="pdx-txt-small pdx-ink-muted">Pragmatic Design CSS</span>
        <span class="doc-topbar-spacer"></span>
        <span class="doc-topbar-label">Scheme</span>
        <button class="pdx-ghost" size="sm" data-active="true" data-group="scheme" onclick="setScheme('auto')">Auto</button>
        <button class="pdx-ghost" size="sm" data-group="scheme" onclick="setScheme('light')">Light</button>
        <button class="pdx-ghost" size="sm" data-group="scheme" onclick="setScheme('dark')">Dark</button>
        <span class="pdx-divider-vertical" style="height:1rem"></span>
        <span class="doc-topbar-label">Theme</span>
        <select class="pdx-input" style="width:auto;padding:var(--pdx-space-2xs) var(--pdx-space-xl) var(--pdx-space-2xs) var(--pdx-space-sm);font-size:var(--pdx-text-xs)" onchange="setTheme(this.value)">
            <option value="default">Default</option>
            <option value="pragmatic">Pragmatic</option>
            <option value="corporate">Corporate</option>
            <option value="playful">Playful</option>
            <option value="material">Material</option>
            <option value="fluent">Fluent</option>
            <option value="cupertino">Cupertino</option>
            <option value="neumorphic">Neumorphic</option>
            <option value="glass">Glass</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="editorial">Editorial</option>
        </select>
    `;
}

function activateGroup(group, btn) {
    topbar.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.dataset.active = 'false');
    btn.dataset.active = 'true';
}

function setScheme(v) {
    document.documentElement.setAttribute('pdx-scheme', v);
    localStorage.setItem('pdx-scheme', v);
    activateGroup('scheme', event.target);
}
function setTheme(v) {
    document.documentElement.setAttribute('pdx-theme', v);
    localStorage.setItem('pdx-theme', v);
    // Update select if called programmatically
    const sel = topbar?.querySelector('select');
    if (sel) sel.value = v;
}

// Mobile drawer
let backdrop = null;

function toggleDrawer() {
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
        closeDrawer();
    } else {
        openDrawer();
    }
}

function openDrawer() {
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'doc-drawer-backdrop';
        backdrop.onclick = closeDrawer;
        document.body.appendChild(backdrop);
    }
    requestAnimationFrame(() => {
        sidebar.classList.add('open');
        backdrop.classList.add('open');
    });
}

function closeDrawer() {
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
}

// Close drawer on escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
});

// Close drawer on nav link click (mobile)
sidebar?.addEventListener('click', (e) => {
    if (e.target.classList.contains('doc-nav-link')) {
        closeDrawer();
    }
});

// Source code blocks — always expanded (click to collapse if needed)
// Previously collapsed > 3 lines; now always open for better DX.

// Restore from query string > localStorage on load
// Usage: ?theme=material&scheme=dark&density=compact
(function restore() {
    const params = new URLSearchParams(location.search);
    const scheme = params.get('scheme') || localStorage.getItem('pdx-scheme');
    const theme = params.get('theme') || localStorage.getItem('pdx-theme');
    const density = params.get('density');

    if (scheme) {
        document.documentElement.setAttribute('pdx-scheme', scheme);
        localStorage.setItem('pdx-scheme', scheme);
        const btn = topbar?.querySelector(`[data-group="scheme"][onclick*="'${scheme}'"]`);
        if (btn) { topbar.querySelectorAll('[data-group="scheme"]').forEach(b => b.dataset.active = 'false'); btn.dataset.active = 'true'; }
    }
    if (theme) {
        document.documentElement.setAttribute('pdx-theme', theme);
        localStorage.setItem('pdx-theme', theme);
        const sel = topbar?.querySelector('select');
        if (sel) sel.value = theme;
    }
    if (density) {
        document.documentElement.setAttribute('pdx-density', density);
    }
})();

// Lucide Icons — load from CDN after all DOM is ready
const lucideScript = document.createElement('script');
lucideScript.src = 'https://unpkg.com/lucide@0.475.0/dist/umd/lucide.min.js';
lucideScript.onload = () => lucide.createIcons();
document.head.appendChild(lucideScript);

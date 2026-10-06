// The overlay page's log and its overlay ids: the stack, bottom-sheet and nested sections write the
// log the stack section shows, and the stack and nested sections number their overlays from one
// counter.
@store overlayDemo;

import { overlayStack, createBackdrop } from '@pdxui/core';

let logText = $signal('');
let counter = 0;

function log(msg) { logText = logText + msg + '\n'; }

// ── Visible overlay elements ──
const overlayEls = new Map();

function createVisibleOverlay(id, isModal) {
    const zIndex = overlayStack.push(id, { modal: isModal });
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;' + (isModal ? 'top:50%;left:50%;transform:translate(-50%,-50%)' : 'top:16px;right:16px') + ';z-index:' + zIndex + ';background:' + (isModal ? 'white' : '#1d1d2e') + ';color:' + (isModal ? '#1d1d2e' : 'white') + ';padding:16px 24px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);min-width:200px;font-family:system-ui';
    el.innerHTML = '<strong>' + id + '</strong><br><small>' + (isModal ? 'Modal — locks scroll' : 'Non-modal') + '</small><br><button style="margin-top:8px;padding:4px 12px;border:1px solid #ccc;border-radius:4px;cursor:pointer">Close</button>';
    el.querySelector('button').onclick = function() { removeOverlay(id); };
    document.body.appendChild(el);
    overlayEls.set(id, el);
    overlayStack.onDismissTop(function() { removeOverlay(id); });
    return el;
}

function removeOverlay(id) {
    const el = overlayEls.get(id);
    if (el) { el.remove(); overlayEls.delete(id); }
    overlayStack.pop(id);
    log('Closed ' + id);
}

function pushTooltip() {
    const id = 'tooltip-' + (++counter);
    createVisibleOverlay(id, false);
    log('Pushed ' + id);
}

function pushDialog() {
    const id = 'dialog-' + (++counter);
    createVisibleOverlay(id, true);
    log('Pushed ' + id + ' (modal)');
}

function popTopTooltip() {
    for (const [id] of [...overlayEls].reverse()) {
        if (id.startsWith('tooltip-')) { removeOverlay(id); return; }
    }
}

function popTopDialog() {
    for (const [id] of [...overlayEls].reverse()) {
        if (id.startsWith('dialog-')) { removeOverlay(id); return; }
    }
}

function popAllTooltips() {
    for (const [id] of [...overlayEls]) {
        if (id.startsWith('tooltip-')) removeOverlay(id);
    }
}

function popAllDialogs() {
    for (const [id] of [...overlayEls]) {
        if (id.startsWith('dialog-')) removeOverlay(id);
    }
}

function popAll() {
    while (overlayStack.top()) {
        removeOverlay(overlayStack.top());
    }
}

// ── Nested ──
function openNested() {
    const dlgId = 'dialog-' + (++counter);
    const dlgZ = overlayStack.push(dlgId, { modal: true });

    const bdResult = createBackdrop({ blur: true, zIndex: dlgZ - 1 });
    const dlg = document.createElement('div');
    dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:' + dlgZ + ';background:white;padding:24px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);min-width:340px;font-family:system-ui';
    dlg.innerHTML = '<h3 style="margin:0 0 8px">' + dlgId + '</h3><p style="color:#666;margin:0 0 12px">Press Escape or click buttons.</p><button id="tt-btn" style="padding:6px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;margin-right:8px">Open Tooltip</button><button id="close-btn" style="padding:6px 16px;border:1px solid #ccc;border-radius:6px;cursor:pointer">Close</button>';
    document.body.appendChild(dlg);

    function closeDlg() { dlg.remove(); bdResult.dispose(); overlayStack.pop(dlgId); log('Closed ' + dlgId); }
    overlayStack.onDismissTop(closeDlg);
    dlg.querySelector('#close-btn').onclick = closeDlg;

    dlg.querySelector('#tt-btn').onclick = function() {
        const ttId = 'tooltip-' + (++counter);
        const ttZ = overlayStack.push(ttId);
        const tt = document.createElement('div');
        tt.style.cssText = 'position:fixed;top:30%;right:15%;z-index:' + ttZ + ';background:#1d1d2e;color:white;padding:12px 20px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.2);font-family:system-ui';
        tt.textContent = ttId + ' — Escape closes me first';
        document.body.appendChild(tt);
        overlayStack.onDismissTop(function() { tt.remove(); overlayStack.pop(ttId); log('Closed ' + ttId); });
    };
    log('Opened ' + dlgId + ' (modal, z=' + dlgZ + ')');
}

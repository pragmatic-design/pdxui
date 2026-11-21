// Slot projection (light DOM), as a feature of a component's definition (#1246): a component whose
// template renders a <slot> places its host's children there, and one whose template renders none
// carries none of this. The capture of the host's children, the dispose of the ones not projected and
// their restore on a destroying disconnect are every component's, and stay in PdxElement.

import { slotsIn } from './element';
import type { PdxElement } from './element';
import { watchPartNodes, unwatchPartNodes } from '../renderer/part-nodes';

/** What `PdxElement` asks of the projection: its class's `static slotProjection`. */
export interface SlotProjection {
    /** Every <slot> in a rendered template, the root included: the slots the template rendered. */
    find(content: Node | null): Element[];
    /** Replace the host's own <slot> placeholders with its captured children. */
    project(host: PdxElement): void;
    /** Place a child added to the host after the mount into its empty slot. */
    watch(host: PdxElement): void;
}

/** Replace <slot> placeholders with projected children. */
function projectSlots(host: PdxElement): void {
    if (host._projectedChildren.length === 0) return;

    // Only the slots OUR template rendered (captured from body() before it was inserted — see
    // connectedCallback). `querySelectorAll` does not stop at component boundaries: an empty
    // <pdx-alert-dialog> in this template keeps its own <slot>, and this component's children
    // would be projected into it — the dialog would hold a copy of the screen hosting it.
    // "No component between the slot and the host" is not the test either: a slot this template
    // passes into a child (`<inner><slot></slot></inner>`) is ours and sits inside `inner`.
    const slots = host._ownSlots.filter(s => host.contains(s));
    if (slots.length === 0) { host._disposeUnprojected(); return; }

    // Group projected children by slot name
    const named = new Map<string, Node[]>();
    const defaultNodes: Node[] = [];

    for (const child of host._projectedChildren) {
        const slotName = child instanceof Element ? child.getAttribute('slot') : null;
        if (slotName) {
            if (!named.has(slotName)) named.set(slotName, []);
            named.get(slotName)!.push(child);
        } else {
            defaultNodes.push(child);
        }
    }

    // Replace each <slot> with matching projected content
    for (const slot of Array.from(slots)) {
        const name = slot.getAttribute('name');
        const content = name ? named.get(name) : defaultNodes;

        if (content && content.length > 0) {
            const parent = slot.parentNode!;
            for (const n of content) parent.insertBefore(n, slot);
            parent.removeChild(slot);
        }
        // If no projected content, leave <slot> default content
    }

    host._disposeUnprojected();
}

/** True when `node` is rendered by THIS component — no other custom element sits between it
 *  and the host. Slot lookups must not cross a component boundary: a nested component's
 *  <slot> belongs to that component, and filling it from out here steals its children. */
function ownsNode(host: PdxElement, node: Node): boolean {
    let p = node.parentNode;
    while (p && p !== host) {
        if (p instanceof Element && p.tagName.includes('-')) return false;
        p = p.parentNode;
    }
    return p === host;
}

/** Some frameworks (e.g. Angular, which bootstraps async via zone.js) append
 *  light-DOM children AFTER connectedCallback — i.e. after the projection already
 *  ran with no children, leaving empty <slot>s. Observe the host and relocate any
 *  late-added direct child into its matching EMPTY slot. No-op when every slot is
 *  already filled (the common case: children present at connect → slots removed). */
function watchLateSlots(host: PdxElement): void {
    // Only OUR slots. `querySelectorAll` does not stop at component boundaries, so a nested
    // component's own empty <slot> would arm this observer on the outer host and then attract
    // its children — the outer component filling a slot it does not own.
    const ownSlots = (): Element[] => Array.from(host.querySelectorAll('slot'))
        .filter(s => ownsNode(host, s));
    const hasEmpty = ownSlots().some(s => s.childNodes.length === 0);
    if (!hasEmpty) return;
    const relocate = (node: Node): void => {
        const slotName = node instanceof Element ? node.getAttribute('slot') : null;
        const mine = ownSlots();
        const slot = (slotName
            ? mine.find(s => s.getAttribute('name') === slotName)
            : mine.find(s => !s.hasAttribute('name')) ?? mine[0]) ?? null;
        if (!slot || !slot.parentNode || slot.childNodes.length !== 0) return;
        // A node can never be inserted before a slot it CONTAINS — `insertBefore(ancestor,
        // descendant)` throws HierarchyRequestError, uncaught, from inside the observer. The
        // own-slot filter above already rules this out for nested components, but the
        // invariant is worth stating where the insertion happens: it holds for any shape.
        if (node.contains(slot)) return;
        // Already where it belongs → do NOTHING. Moving a node that is already before
        // its slot is a no-op for the DOM but still emits a childList record, which
        // brings us straight back here: infinite relocation, starved microtask queue,
        // frozen page. It only bites when the slot is a DIRECT child of the host (then
        // the relocated node keeps `parentNode === host` and stays in scope) — which is
        // the shape of any component whose render is just `<slot></slot>` and that
        // appends its own UI onto the host, e.g. pdx-rich-text's toolbar + editor.
        // The same-parent test is not redundant: `compareDocumentPosition` on a node in a
        // different tree returns DISCONNECTED plus an ARBITRARY (but self-consistent)
        // PRECEDING/FOLLOWING, so position alone could skip a relocation that must happen.
        // Same parent ⇒ same tree ⇒ the ordering bit is meaningful.
        if (node.parentNode === slot.parentNode
            && (slot.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING)) return;
        // Insert BEFORE the slot (not inside) — keeps default content out, allows multiple.
        slot.parentNode.insertBefore(node, slot);
        if (!host._lightChildren.includes(node)) host._lightChildren.push(node);
    };
    // The nodes template parts placed on this host since the last batch of records.
    const placed = watchPartNodes(host);
    const obs = new MutationObserver((records) => {
        for (const r of records) {
            for (const node of Array.from(r.addedNodes)) {
                // A node a template part placed — this component's own redraw, most often — is
                // where its template wants it: only foreign late children go to the slot. Moving
                // a redraw into a hidden slot, with a redraw following it, freezes the page.
                if (node.parentNode === host && !placed.has(node)) relocate(node);
            }
        }
        placed.clear();
    });
    obs.observe(host, { childList: true });
    host._disposers.push(() => { obs.disconnect(); unwatchPartNodes(host); });
}

/** The projection a component whose template renders a <slot> is defined with. */
export const slotProjection: SlotProjection = { find: slotsIn, project: projectSlots, watch: watchLateSlots };

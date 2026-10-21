// The HTMLElement members a component's props, models and typed snippets may not take (#545).
//
// A prop is defined on the element instance, over the member of the same name. For most of
// HTMLElement's members that is harmless or wanted: `title` and `id` are props on purpose, `prefix`
// and `offsetTop` are read by nothing that a prop of that name breaks. These are the ones whose
// replacement breaks code outside the component: `el.style.color = …` on a prop `style` throws, and
// a prop `onclick` is called by nobody when the element is clicked. The owner's decision on #545 is
// this short list, not every member.
//
// Written out, because the compiler does not import a DOM: `packages/core/tests/reserved-element-names.test.ts`
// holds the names to HTMLElement's prototype chain. The handlers are those of Chromium 145 and
// happy-dom 20.14 together (each has some the other lacks); the core test fails when happy-dom gains one.

/** The members whose replacement breaks the element for code outside the component. */
export const RESERVED_DOM_MEMBERS: ReadonlySet<string> = new Set<string>([
    'children', 'classList', 'className', 'dataset', 'innerHTML', 'shadowRoot', 'style', 'textContent',
]);

/** The event handler properties, `on` and the event's name: a prop of one replaces the handler. */
export const DOM_EVENT_HANDLERS: ReadonlySet<string> = new Set<string>([
    'onabort', 'onanimationcancel', 'onanimationend', 'onanimationiteration', 'onanimationstart',
    'onauxclick', 'onbeforecopy', 'onbeforecut', 'onbeforeinput', 'onbeforematch', 'onbeforepaste',
    'onbeforetoggle', 'onbeforexrselect', 'onblur', 'oncancel', 'oncanplay', 'oncanplaythrough', 'onchange',
    'onclick', 'onclose', 'oncommand', 'oncompositionend', 'oncompositionstart', 'oncompositionupdate',
    'oncontentvisibilityautostatechange', 'oncontextlost', 'oncontextmenu', 'oncontextrestored', 'oncopy',
    'oncuechange', 'oncut', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover',
    'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onended', 'onerror', 'onfocus', 'onfocusin',
    'onfocusout', 'onformdata', 'onfullscreenchange', 'onfullscreenerror', 'ongotpointercapture', 'oninput',
    'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup', 'onload', 'onloadeddata', 'onloadedmetadata',
    'onloadstart', 'onlostpointercapture', 'onmousedown', 'onmouseenter', 'onmouseleave', 'onmousemove',
    'onmouseout', 'onmouseover', 'onmouseup', 'onmousewheel', 'onpaste', 'onpause', 'onplay', 'onplaying',
    'onpointercancel', 'onpointerdown', 'onpointerenter', 'onpointerleave', 'onpointermove', 'onpointerout',
    'onpointerover', 'onpointerup', 'onprogress', 'onratechange', 'onreset', 'onresize', 'onscroll',
    'onscrollend', 'onscrollsnapchange', 'onscrollsnapchanging', 'onsearch', 'onsecuritypolicyviolation',
    'onseeked', 'onseeking', 'onselect', 'onselectionchange', 'onselectstart', 'onslotchange', 'onstalled',
    'onsubmit', 'onsuspend', 'ontimeupdate', 'ontoggle', 'ontouchcancel', 'ontouchend', 'ontouchmove',
    'ontouchstart', 'ontransitioncancel', 'ontransitionend', 'ontransitionrun', 'ontransitionstart',
    'onvolumechange', 'onwaiting', 'onwebkitanimationend', 'onwebkitanimationiteration',
    'onwebkitanimationstart', 'onwebkitfullscreenchange', 'onwebkitfullscreenerror',
    'onwebkittransitionend', 'onwheel',
]);

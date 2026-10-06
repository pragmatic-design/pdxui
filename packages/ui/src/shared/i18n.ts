// The English defaults for every user-visible string @pdxui/ui renders.
//
// They live in one file, keyed by component, for one reason: a consumer translating the library
// needs to SEE the list. Scattered across forty components they would be invisible, and an Italian
// app would ship with "Close dialog", "Previous page" and "Pagination" in its accessibility tree
// because nothing named them. `packages/core/tests/i18n-no-literal-strings.test.ts` fails on a new
// literal, so this file is the only place a string can be added.
//
// The grid keeps its own registry (`data-grid/grid-i18n.ts`): it has ~60 keys of its own and moving
// them here would bury this list.

import { registerComponentStrings, getComponentString, formatMessage, componentStringsChanged, effect } from '@pdxui/core';

/** component → key → English default. */
const DEFAULTS: Record<string, Record<string, string>> = {
    'app-layout': { mainNav: 'Main navigation', aside: 'Secondary' },
    // Names and button texts here rather than as prop defaults, which no locale could reach. The
    // prop still wins when it is set; these are what the component says when it is not.
    // `typeToConfirm` holds the text to type as `{text}`: the component renders it in <strong>, so the
    // sentence is split around the placeholder, never concatenated. The confirm service,
    // `dialog.confirm()`, reads these same keys.
    'alert-dialog': { confirm: 'Confirm', cancel: 'Cancel', title: 'Are you sure?', typeToConfirm: 'Type {text} to confirm:' },
    'auto-form': { submit: 'Save', reset: 'Reset' },
    'edit-drawer': { save: 'Save', cancel: 'Cancel', edit: 'Edit', new: 'New' },
    // What a component shows when the prop that names the text is not set.
    'empty-state': { title: 'No data' },
    'error-boundary': { retry: 'Retry', maxRetries: 'Max retries reached', message: 'Something went wrong.' },
    'infinite-scroll': { end: 'No more data', loading: 'Loading...' },
    // `toggle` names a panel's toggle when the group has no label to name it.
    'field-group': { edit: 'Edit', toggle: 'Show or hide section' },
    list: { empty: 'No items' },
    // The reorder said out loud. `position` is the one a screen-reader user hears most, and it
    // speaks the POSITION rather than the index — "2 of 5", not "index 1" — which is dnd-kit's rule
    // and the difference between a usable announcement and a debugging one. `instructions` is the
    // off-screen text every handle points at with aria-describedby; `draggable` is the handle's
    // aria-roledescription, which replaces the deprecated aria-grabbed.
    'sortable-list': {
        draggable: 'draggable',
        reorder: 'Reorder {label}',
        instructions: 'Press Space or Enter to lift the item, the arrow keys to move it, Space or Enter to drop it, and Escape to cancel.',
        position: 'Position {position} of {total}.',
        lifted: '{label} lifted.',
        dropped: '{label} dropped.',
        cancelled: 'Reorder cancelled.',
    },
    // The strength levels are the meter's text, the input's description and a polite announcement.
    'password-input': {
        show: 'Show password', hide: 'Hide password',
        weak: 'Weak', fair: 'Fair', good: 'Good', strong: 'Strong',
    },
    // A row's action buttons are named after the row, `{label}`, not every row's "Edit" and "Delete".
    // `confirmOne` / `confirmMany` title the confirmation a delete asks for; `bulkDelete`
    // is the bulk bar's button, `confirm` the dialog's, `actions` the header of the actions column.
    'entity-grid': {
        add: 'New', actions: 'Actions', edit: 'Edit {label}', delete: 'Delete {label}', bulkDelete: 'Delete', confirm: 'Delete',
        confirmOne: 'Delete {label}?', confirmMany: '{count, plural, one {Delete # record?} other {Delete # records?}}',
    },
    fab: { label: 'Actions' },
    // The zoom / lightbox trigger's name, `{alt}` the image's alt, else `image`; `close` is the
    // lightbox dialog's close button.
    image: { view: 'View {alt}', zoom: 'Zoom {alt}', image: 'image', close: 'Close' },
    progress: { label: 'Progress' },
    rating: { label: 'Rating' },
    // `selected` is the footer count; `{n}` is the number of rows ticked.
    'relation-picker': { add: 'Add selected', selected: '{n} selected' },
    'split-button': { menu: 'More actions' },
    // `success`…`info` are an item's status, read out in place of the dot's colour; an
    // item's own `statusLabel` says it better ("Completed").
    timeline: { pending: 'In progress...', success: 'success', warning: 'warning', error: 'error', info: 'info' },
    // The "N results available" strings are read by screen readers on every keystroke. English
    // pluralisation lives in the default; a locale that needs different rules replaces the whole
    // string, which is why the count is a placeholder and not a concatenation.
    autocomplete: { clear: 'Clear', noResults: 'No results', resultsAvailable: '{n} results available' },
    // The "+N" counter's name, `{count}` the people it stands for; `member` names a clickable avatar
    // whose item has no name, `{n}` its position.
    'avatar-group': { more: '{count} more', member: 'Member {n}' },
    // A dot badge's name: `{variant}` is the variant it shows, e.g. "danger indicator".
    badge: { indicator: '{variant} indicator' },
    banner: { close: 'Close' },
    // A badged item's name: the count read in context, "Messages, 3 new", not glued to the label.
    'bottom-nav': { label: 'Bottom navigation', badge: '{label}, {badge} new' },
    // `handle` names the drag handle, a slider over the detents; `height` is its value text.
    'bottom-sheet': { close: 'Close', label: 'Bottom sheet', handle: 'Sheet height', height: '{percent}% of the screen' },
    // `expand` names the collapse ellipsis, a button that shows the hidden part of the path.
    breadcrumb: { label: 'Breadcrumb', expand: 'Show path' },
    // `selected` is the count's text; a locale pluralises it with an ICU block:
    // `{count, plural, one {# selezionato} other {# selezionati}}`.
    'bulk-actions': { label: 'Bulk actions', clearSelection: 'Clear selection', selected: '{count} selected' },
    calendar: { label: 'Calendar' },
    // `label` names the region; `slide` names each slide; the rotation control's two states.
    carousel: {
        next: 'Next slide', previous: 'Previous slide', goToSlide: 'Go to slide {n}',
        label: 'Carousel', slide: '{n} of {total}',
        stopRotation: 'Stop slide rotation', startRotation: 'Start slide rotation',
    },
    // `searchLabel` names the search input, `results` its listbox, `clear` the clear button.
    cascader: { level: 'Level {n}', searchLabel: 'Search options', results: 'Search results', clear: 'Clear' },
    // `remove` names a chip's × after what it removes, not just "Remove".
    chip: { remove: 'Remove {label}' },
    // The name of the menu panel (role="menu").
    'context-menu': { label: 'Context menu' },
    // The collapse toggle's name when the fieldset has no legend to name it.
    fieldset: { toggle: 'Show or hide section' },
    // `area` is the colour area's value text, `dialog` the popup's name.
    'color-picker': {
        clear: 'Clear color', color: 'Color', presets: 'Color presets',
        hex: 'Hex color', hue: 'Hue', opacity: 'Opacity', pick: 'Pick color',
        area: 'Saturation {s}%, brightness {v}%, {color}', dialog: 'Color picker',
    },
    command: {
        palette: 'Command palette', commands: 'Commands',
        noResults: 'No results', commandsAvailable: '{n} commands available', search: 'Search commands',
        // The visible texts: `noResults` above is what the live region announces, `empty`
        // is the message in the list, and the three hints are the footer's.
        placeholder: 'Type a command...', empty: 'No results found.',
        navigate: 'Navigate', select: 'Select', close: 'Close',
    },
    dialog: { close: 'Close dialog', label: 'Dialog' },
    drawer: { close: 'Close', label: 'Drawer' },
    'dropdown-menu': { label: 'Menu' },
    // `drop` is the dropzone's text and name when `label` is not set. `remove` names a
    // file's × after the file; `rejected` is one refused file under the zone, `{reason}` one of
    // tooLarge / notAccepted / tooMany; the upload errors show in the file's row.
    'file-upload': {
        remove: 'Remove {name}', drop: 'Drop files here or click to browse', maxSize: 'Max {size}',
        rejected: '{name}: {reason}', tooLarge: 'File too large (max {size})', notAccepted: 'File type not accepted',
        tooMany: 'Too many files (max {n})', uploadFailed: 'Upload failed ({status})', networkError: 'Network error',
    },
    // `dialog` names the field picker, the popover "+ Add Filter" opens.
    // A chip's label and its ✕ are named after the chip, so two chips do not read the same.
    'filter-builder': {
        clearAll: 'Clear all', removeFilter: 'Remove filter: {filter}', editFilter: 'Edit filter: {filter}',
        selectField: 'Select field...', addFilter: '+ Add Filter', dialog: 'Add filter',
    },
    'form-template': { steps: 'Form steps' },
    input: { clear: 'Clear', loading: 'Loading' },
    'json-editor': {
        apply: 'Apply', cancel: 'Cancel', edit: 'Edit…', empty: 'No items — use "＋ Add item" below.',
        addItem: '＋ Add item', removeItem: 'Remove item {n}',
    },
    mention: { label: 'Mentions' },
    menubar: { label: 'Menu' },
    'nav-menu': { label: 'Navigation', badge: '{label}, {badge} new' },
    // `label` names the group of cells; a cell says its place in it.
    'otp-input': { digit: 'Digit {n} of {total}', label: 'Verification code' },
    // A PIN is not a one-time code: its own group name, and no SMS autofill.
    'pin-input': { label: 'PIN' },
    navbar: { mainNav: 'Main navigation', toggle: 'Toggle menu' },
    // `negative` names the sign toggle, pressed while the value is negative.
    'number-input': { increase: 'Increase', decrease: 'Decrease', negative: 'Negative', caretHint: 'The arrow keys change the digit before the cursor' },
    // `ok` is the button of the `dialog.alert()` service.
    overlay: { close: 'Close', ok: 'OK' },
    'page-header': { breadcrumb: 'Breadcrumb' },
    pagination: {
        label: 'Pagination', previous: 'Previous page', next: 'Next page',
        first: 'First page', last: 'Last page', pageSize: 'Rows per page',
        // "1–10 of 47": positional, so the separators travel with the translation.
        range: '{from}–{to} of {total}',
        // The range of an empty set.
        none: '0 of 0',
        // A page number button's name.
        page: 'Page {n}',
    },
    // The toolbar buttons' names. The shortcut is appended at render, outside the string,
    // so a translation cannot lose it: 'Bold' becomes "Bold (Ctrl+B)".
    'rich-text': {
        toolbar: 'Text formatting', label: 'Rich text editor',
        bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough', code: 'Code',
        link: 'Link', highlight: 'Highlight', heading1: 'Heading 1', heading2: 'Heading 2', heading3: 'Heading 3',
        heading: 'Heading', quote: 'Blockquote', codeblock: 'Code block', bulletList: 'Bullet list',
        orderedList: 'Ordered list', taskList: 'Task list', list: 'List', image: 'Insert image',
        hr: 'Horizontal rule', undo: 'Undo', redo: 'Redo', source: 'View HTML source',
        alignLeft: 'Align left', alignCenter: 'Align center', alignRight: 'Align right', alignFull: 'Align full',
        removeImage: 'Remove image',
        // The questions the link and image commands ask through the browser's prompt.
        linkUrl: 'Link URL:', imageUrl: 'Image URL:', imageAlt: 'Alt text:',
    },
    'search-input': { clear: 'Clear search', searching: 'Searching', placeholder: 'Search...' },
    select: {
        clear: 'Clear', loading: 'Loading', search: 'Search...',
        noResults: 'No results', optionsAvailable: '{n} options available',
        create: 'Create "{query}"', listbox: 'Options',
        // A chip's remove button, and the summary chip when `maxTagCount` is 0.
        remove: 'Remove {label}', selected: '{n} selected',
    },
    // Shared popovers over the grid and the filter builder.
    shared: {
        columns: 'Columns', and: 'AND', or: 'OR', apply: 'Apply', clear: 'Clear', selectAll: 'Select all',
        addCondition: '+ Add condition', removeCondition: '- Remove condition',
        // The value list of an enum filter while it loads, and when nothing matches.
        loading: 'Loading…', noMatches: 'No matches',
        // The value inputs' placeholders, and the enum filter's select and search.
        from: 'From…', to: 'To…', value: 'Value...', date: 'Date...', select: 'Select…', search: 'Search…',
    },
    sidebar: { label: 'Sidebar' },
    spinner: { loading: 'Loading' },
    // `minimumOf` / `maximumOf` name the range thumbs of a labelled slider.
    slider: { minimum: 'Minimum', maximum: 'Maximum', value: 'Value', minimumOf: '{label}, minimum', maximumOf: '{label}, maximum' },
    splitter: { label: 'Resize panels' },
    toast: { dismiss: 'Dismiss' },
    toolbar: { label: 'Toolbar' },
    transfer: { label: 'Transfer' },
    // A switch's name when it has neither a label nor an aria-label, nor a field to name it, so a
    // locale can translate it.
    switch: { label: 'Toggle' },
    // `added` / `removed` are announced politely as tags come and go.
    'tag-input': { label: 'Tag input', add: 'Add tag', remove: 'Remove {tag}', added: '{tag} added', removed: '{tag} removed' },
    popover: { label: 'Popover' },
    // `back`, `next`, `complete` and `stepOf` are registered by the component itself
    // (`wizard/pdx-wizard.ts`) and are NOT repeated here: two defaults for one key means whichever
    // module loads last wins, which is not a thing anyone should have to reason about.
    // `stepAnnounce` is said politely when the step changes.
    wizard: { navigation: 'Wizard navigation', steps: 'Wizard steps', stepAnnounce: 'Step {current} of {total}: {label}' },
    // `category` heads the data table's first column, `legend` names the legend's button group,
    // `gauge` is a gauge's name with its reading.
    chart: {
        summary: '{type} chart', points: ', {n} data points',
        category: 'Category', legend: 'Legend', gauge: '{label}: {value} of {min}–{max}', gaugeLabel: 'Gauge',
    },
    // The sparkline's text alternative. A short series is read out; a long one is
    // summarised. The separator is a string too: with a decimal comma, "4,1, 4,3" reads badly.
    sparkline: {
        summary: 'Trend: {values}, last {last}',
        summaryLong: 'Trend of {n} values from {first} to {last}, low {min}, high {max}',
        separator: ', ',
        empty: 'No data',
    },
};

/**
 * Install the English defaults. Called once on import. They are defaults, not overrides: an app's
 * `setLocaleStrings` wins over them whether it runs before this or after, and
 * `clearComponentStrings()` drops the overrides and leaves these in place. Exported for
 * the tests that want to start from a known registry.
 */
export function registerUiDefaults(): void {
    for (const [component, strings] of Object.entries(DEFAULTS)) {
        registerComponentStrings(component, strings);
    }
}

registerUiDefaults();

/**
 * Read a string for a component. Reactive: called inside a template function or a `ctx.track`, it
 * re-runs when a locale is loaded.
 *
 * Called once in an imperative `setAttribute` it captures the value of that moment, which is why
 * an attribute written from a library string goes through `uiAttr()` instead.
 */
export function uiString(component: string, key: string): string {
    return getComponentString(component, key)();
}

/**
 * Write an attribute from a library string, and keep it right when the locale changes.
 *
 * `uiString()` inside a template or a `ctx.track()` is already reactive — it reads a computed. This
 * is for the other half, and it is most of them: a component that names an element imperatively.
 *
 *     el.setAttribute('aria-label', uiString('breadcrumb', 'label'));   // captured at build time
 *     uiAttr(el, 'aria-label', () => uiString('breadcrumb', 'label'));  // and kept
 *
 * ONE effect for the whole library, not one per attribute: a locale switch is rare and an effect
 * per element would cost more to keep than the writes cost to repeat. The entries hold their
 * element WEAKLY, so nothing here keeps a removed component alive, and a `<pdx-router-outlet>` that
 * freezes a page into a DocumentFragment (keepAlive) keeps its translations — which is why a
 * disconnected element is NOT dropped: only a collected one is.
 */
interface BoundAttr { ref: WeakRef<Element>; attr: string; read: () => string }

const _bound: BoundAttr[] = [];
let _watching = false;

/** Re-apply every live binding and forget the collected ones. */
function reapplyUiAttrs(): void {
    let live = 0;
    for (const entry of _bound) {
        const el = entry.ref.deref();
        if (!el) continue;
        el.setAttribute(entry.attr, entry.read());
        _bound[live++] = entry;
    }
    _bound.length = live;
}

export function uiAttr(el: Element, attr: string, read: () => string): void {
    el.setAttribute(attr, read());
    _bound.push({ ref: new WeakRef(el), attr, read });
    // A long list writes thousands of these; without an occasional sweep the array only grows.
    if (_bound.length % 512 === 0) reapplyUiAttrs();
    if (_watching) return;
    _watching = true;
    effect(() => {
        componentStringsChanged();
        reapplyUiAttrs();
    });
}

/**
 * Fill `{name}` placeholders: `format(uiString('pagination','range'), { from, to, total })`. An ICU
 * plural block — `{count, plural, one {# item} other {# items}}` — is resolved for the current locale
 * first, by the same code as `$t()`, so a translation can pluralise a string.
 */
export function format(template: string, values: Record<string, string | number>): string {
    return formatMessage(template, values);
}

/**
 * The text before and after one `{name}` placeholder, for a sentence whose placeholder is rendered as
 * its own node: «Type <strong>DELETE</strong> to confirm:». A translation may move the placeholder
 * anywhere in the sentence; one without it is shown whole, before the node.
 */
export function aroundPlaceholder(template: string, name: string): [before: string, after: string] {
    const token = `{${name}}`;
    const at = template.indexOf(token);
    return at < 0 ? [template, ''] : [template.slice(0, at), template.slice(at + token.length)];
}

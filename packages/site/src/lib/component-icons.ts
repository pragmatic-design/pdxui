// Maps each component to an icon (from the @pdxui/ui "pragmatic" set) and a
// deterministic accent hue, so the components index has a distinct visual marker
// per card. Unmapped components fall back to a neutral box icon — still tinted by
// the hashed hue so every card stays visually distinct.

const MAP: Record<string, string> = {
  accordion: 'chevrons-up-down', affix: 'bookmark', 'alert-dialog': 'circle-alert',
  'app-layout': 'columns', 'aspect-ratio': 'image', 'auto-form': 'file-text',
  autocomplete: 'search', avatar: 'user', 'avatar-group': 'users', badge: 'badge-check',
  banner: 'info', 'block-ui': 'loader', 'bottom-nav': 'menu', 'bottom-sheet': 'chevron-up',
  breadcrumb: 'chevron-right', 'bulk-actions': 'check-square', button: 'square',
  'button-group': 'columns', calendar: 'calendar', card: 'square', carousel: 'image',
  cascader: 'folder', chart: 'bar-chart', checkbox: 'check-square', 'checkbox-group': 'check-square',
  chip: 'tag', col: 'columns', 'color-picker': 'brush', command: 'terminal',
  'context-menu': 'menu', 'data-grid': 'table', 'data-source': 'database',
  'date-picker': 'calendar-days', 'description-list': 'list', dialog: 'square',
  divider: 'minus', drawer: 'columns', 'dropdown-menu': 'chevron-down', 'edit-drawer': 'edit',
  'empty-state': 'box', 'entity-grid': 'table', 'error-boundary': 'alert-triangle',
  fab: 'plus-circle', 'field-group': 'group', 'field-list': 'list', fieldset: 'group',
  'file-upload': 'upload', 'filter-builder': 'filter', form: 'file-text', 'form-actions': 'check',
  'form-field': 'type', 'form-section': 'list', 'form-template': 'file-text', icon: 'star',
  image: 'image', 'infinite-scroll': 'loader', 'inline-edit': 'edit', input: 'type',
  'input-group': 'type', 'json-editor': 'braces', kbd: 'keyboard', label: 'tag', list: 'list',
  'masked-input': 'type', masonry: 'grid', mention: 'at-sign', menu: 'menu', menubar: 'menu',
  'nav-menu': 'menu', navbar: 'menu', 'number-input': 'calculator', 'otp-input': 'key',
  'overlay-outlet': 'box', 'page-header': 'columns', pagination: 'chevrons-right',
  'password-input': 'lock', 'pin-input': 'key', popover: 'message-circle', progress: 'activity',
  provide: 'package', radio: 'circle-dot', 'radio-group': 'circle-dot', rating: 'star',
  'relation-picker': 'link', 'relative-time': 'clock', 'rich-text': 'type', row: 'rows-3',
  'scroll-area': 'rows-3', 'scroll-spy': 'list', 'search-input': 'search', segmented: 'columns',
  select: 'chevron-down', sidebar: 'columns', slider: 'sliders', sparkline: 'trending-up',
  spinner: 'loader', 'split-button': 'chevron-down', splitter: 'columns', statistic: 'trending-up',
  switch: 'check-circle', tabs: 'folder', 'tag-input': 'tag', textarea: 'align-left',
  'time-picker': 'clock', timeline: 'activity', toast: 'bell', toggle: 'check-circle',
  toolbar: 'sliders-horizontal', tooltip: 'help-circle', transfer: 'arrow-left-right',
  'tree-select': 'folder', wizard: 'check-circle',
};

const short = (tag: string): string => (tag || '').replace(/^pdx-/, '');

/** Icon name (pragmatic set) for a component tag; 'box' fallback. */
export function iconFor(tag: string): string {
  return MAP[short(tag)] || 'box';
}

/** Deterministic accent hue (0-360) hashed from the tag — stable per component. */
export function hueFor(tag: string): number {
  const s = short(tag);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

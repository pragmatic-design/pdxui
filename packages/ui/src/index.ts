// @pdxui/ui — Web Components for Pragmatic Design
// Side-effect imports register custom elements.

// Tier 1A: Atoms
// The barrel is every component, for a page with no compiler: it puts the whole «pragmatic» icon set on
// the page first, so no icon loads on demand. pdx-icon alone registers only the set's resolver (#47).
import './icon/pragmatic-all';
import './icon/pdx-icon';
import './button/pdx-button.pdx';
import './button-group/pdx-button-group.pdx';
import './progress/pdx-progress.pdx';
import './badge/pdx-badge.pdx';
import './chip/pdx-chip.pdx';
import './avatar/pdx-avatar.pdx';
import './avatar-group/pdx-avatar-group';
import './spinner/pdx-spinner.pdx';
import './divider/pdx-divider.pdx';
import './kbd/pdx-kbd.pdx';
import './label/pdx-label';
import './input/pdx-input.pdx';
import './checkbox/pdx-checkbox.pdx';
import './radio/pdx-radio.pdx';
import './switch-toggle/pdx-switch.pdx';
import './flag/pdx-flag.pdx';

// Tier 1B: Specialized Inputs
import './password-input/pdx-password-input.pdx';
import './search-input/pdx-search-input.pdx';
import './number-input/pdx-number-input';
import './textarea/pdx-textarea.pdx';
import './input-group/pdx-input-group.pdx';
import './masked-input/pdx-masked-input.pdx';
import './otp-input/pdx-otp-input';
import './radio-group/pdx-radio-group.pdx';
import './checkbox-group/pdx-checkbox-group.pdx';
import './tag-input/pdx-tag-input.pdx';
import './localized-input/pdx-localized-input.pdx';
import './color-picker/pdx-color-picker.pdx';
import './file-upload/pdx-file-upload';
import './slider/pdx-slider.pdx';
import './rating/pdx-rating.pdx';
import './signature-pad/pdx-signature-pad.pdx';
import './segmented/pdx-segmented.pdx';
import './toggle/pdx-toggle.pdx';
import './toggle-group/pdx-toggle-group.pdx';
import './calendar/pdx-calendar';
import './time-picker/pdx-time-picker';
import './date-picker/pdx-date-picker';
import './transfer/pdx-transfer';
import './mention/pdx-mention';
import './cascader/pdx-cascader';
import './tree/pdx-tree';
import './tree-select/pdx-tree-select';
import './inline-edit/pdx-inline-edit';

// Tier 1C: Forms
import './form/pdx-form.pdx';
import './form-template/pdx-form-template';
import './form-section/pdx-form-section';
import './form-actions/pdx-form-actions.pdx';
import './form-field/pdx-form-field.pdx';
import './fieldset/pdx-fieldset';
import './field-group/pdx-field-group';
import './field-list/pdx-field-list.pdx';
import './wizard/pdx-wizard';

// Tier 1D: Navigation
import './navbar/pdx-navbar';
import './sidebar/pdx-sidebar';
import './bottom-nav/pdx-bottom-nav';
import './nav-menu/pdx-nav-menu';
import './menubar/pdx-menubar';
import './menu/pdx-menu';
import './dropdown-menu/pdx-dropdown-menu';
import './context-menu/pdx-context-menu';
import './breadcrumb/pdx-breadcrumb';
import './page-header/pdx-page-header';
import './toolbar/pdx-toolbar';
import './pagination/pdx-pagination';
import './fab/pdx-fab';
import './split-button/pdx-split-button';

// Tier 1E: Layout
import './app-layout/pdx-app-layout';
import './app-shell/pdx-app-shell.pdx';
import './row/pdx-row';
import './col/pdx-col';
import './masonry/pdx-masonry';
import './splitter/pdx-splitter';
import './scroll-area/pdx-scroll-area';
import './scroll-spy/pdx-scroll-spy';
import './affix/pdx-affix';
import './aspect-ratio/pdx-aspect-ratio';
import './block-ui/pdx-block-ui';

// Tier 1F: Data Display
import './list/pdx-list';
import './sortable-list/pdx-sortable-list';
import './kanban/pdx-kanban.pdx';
import './scheduler/pdx-scheduler.pdx';
import './description-list/pdx-description-list';
import './timeline/pdx-timeline';
import './statistic/pdx-statistic';
import './empty-state/pdx-empty-state';
import './image/pdx-image';
import './carousel/pdx-carousel';
import './infinite-scroll/pdx-infinite-scroll';
import './relative-time/pdx-relative-time';
// Tier 2: Overlay + Containers
import './tooltip/pdx-tooltip';
import './popover/pdx-popover';
import './dialog/pdx-dialog';
import './alert-dialog/pdx-alert-dialog';
import './drawer/pdx-drawer';
import './toast/pdx-toast';
import './tabs/pdx-tabs';
import './accordion/pdx-accordion';
import './card/pdx-card';
import './banner/pdx-banner';
import './bottom-sheet/pdx-bottom-sheet';
import './command/pdx-command';

// Tier 3A: Data-bound
import './select/pdx-select';
import './autocomplete/pdx-autocomplete';
import './data-source/pdx-data-source';
import './data-grid/pdx-data-grid';
import './filter-builder/pdx-filter-builder';
import './auto-form/pdx-auto-form';
// CRUD primitives (compose data-grid + form-template + drawer)
import './bulk-actions/pdx-bulk-actions';
import './edit-drawer/pdx-edit-drawer';
import './entity-grid/pdx-entity-grid';
import './json-editor/pdx-json-editor';
import './relation-picker/pdx-relation-picker';
import './chart/pdx-chart';
import './chart/pdx-sparkline';
import './rich-text/pdx-rich-text';

// Infrastructure components (non-rendering / utility)
import './provide/pdx-provide';
import './error-boundary/pdx-error-boundary';
import './overlay/pdx-overlay-outlet';

// Utilities (functions, not components)
export { autoPageSize } from './data-grid/auto-page-size';
export type { AutoPageSizeOptions } from './data-grid/auto-page-size';

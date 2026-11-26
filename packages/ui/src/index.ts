// @pdxui/ui — Web Components for Pragmatic Design
// Side-effect imports register custom elements.

// Tier 1A: Atoms
// The barrel is every component, for a page with no compiler: it puts the whole «pragmatic» icon set on
// the page first, so no icon loads on demand. pdx-icon alone registers only the set's resolver (#47).
import './icon/pragmatic-all';
import './icon/pdx-icon.pdx';
import './button/pdx-button.pdx';
import './button-group/pdx-button-group.pdx';
import './progress/pdx-progress.pdx';
import './badge/pdx-badge.pdx';
import './chip/pdx-chip.pdx';
import './avatar/pdx-avatar.pdx';
import './avatar-group/pdx-avatar-group.pdx';
import './spinner/pdx-spinner.pdx';
import './divider/pdx-divider.pdx';
import './kbd/pdx-kbd.pdx';
import './label/pdx-label.pdx';
import './input/pdx-input.pdx';
import './checkbox/pdx-checkbox.pdx';
import './radio/pdx-radio.pdx';
import './switch-toggle/pdx-switch.pdx';
import './flag/pdx-flag.pdx';

// Tier 1B: Specialized Inputs
import './password-input/pdx-password-input.pdx';
import './search-input/pdx-search-input.pdx';
import './number-input/pdx-number-input.pdx';
import './textarea/pdx-textarea.pdx';
import './input-group/pdx-input-group.pdx';
import './masked-input/pdx-masked-input.pdx';
import './otp-input/pdx-otp-input.pdx';
import './radio-group/pdx-radio-group.pdx';
import './checkbox-group/pdx-checkbox-group.pdx';
import './tag-input/pdx-tag-input.pdx';
import './localized-input/pdx-localized-input.pdx';
import './color-picker/pdx-color-picker.pdx';
import './file-upload/pdx-file-upload.pdx';
import './slider/pdx-slider.pdx';
import './rating/pdx-rating.pdx';
import './signature-pad/pdx-signature-pad.pdx';
import './segmented/pdx-segmented.pdx';
import './toggle/pdx-toggle.pdx';
import './toggle-group/pdx-toggle-group.pdx';
import './calendar/pdx-calendar.pdx';
import './time-picker/pdx-time-picker.pdx';
import './date-picker/pdx-date-picker.pdx';
import './transfer/pdx-transfer.pdx';
import './mention/pdx-mention.pdx';
import './cascader/pdx-cascader.pdx';
import './tree/pdx-tree.pdx';
import './tree-select/pdx-tree-select.pdx';
import './inline-edit/pdx-inline-edit.pdx';

// Tier 1C: Forms
import './form/pdx-form.pdx';
import './form-template/pdx-form-template';
import './form-section/pdx-form-section.pdx';
import './form-actions/pdx-form-actions.pdx';
import './form-field/pdx-form-field.pdx';
import './fieldset/pdx-fieldset.pdx';
import './field-group/pdx-field-group.pdx';
import './field-list/pdx-field-list.pdx';
import './wizard/pdx-wizard';

// Tier 1D: Navigation
import './navbar/pdx-navbar.pdx';
import './sidebar/pdx-sidebar.pdx';
import './bottom-nav/pdx-bottom-nav.pdx';
import './nav-menu/pdx-nav-menu.pdx';
import './menubar/pdx-menubar';
import './menu/pdx-menu.pdx';
import './dropdown-menu/pdx-dropdown-menu.pdx';
import './context-menu/pdx-context-menu.pdx';
import './breadcrumb/pdx-breadcrumb.pdx';
import './page-header/pdx-page-header.pdx';
import './toolbar/pdx-toolbar.pdx';
import './pagination/pdx-pagination.pdx';
import './fab/pdx-fab.pdx';
import './split-button/pdx-split-button.pdx';

// Tier 1E: Layout
import './app-layout/pdx-app-layout.pdx';
import './app-shell/pdx-app-shell.pdx';
import './row/pdx-row.pdx';
import './col/pdx-col.pdx';
import './masonry/pdx-masonry.pdx';
import './splitter/pdx-splitter.pdx';
import './scroll-area/pdx-scroll-area.pdx';
import './scroll-spy/pdx-scroll-spy.pdx';
import './affix/pdx-affix.pdx';
import './aspect-ratio/pdx-aspect-ratio.pdx';
import './block-ui/pdx-block-ui.pdx';

// Tier 1F: Data Display
import './list/pdx-list.pdx';
import './sortable-list/pdx-sortable-list.pdx';
import './kanban/pdx-kanban.pdx';
import './scheduler/pdx-scheduler.pdx';
import './description-list/pdx-description-list.pdx';
import './timeline/pdx-timeline.pdx';
import './statistic/pdx-statistic.pdx';
import './empty-state/pdx-empty-state.pdx';
import './image/pdx-image.pdx';
import './carousel/pdx-carousel.pdx';
import './infinite-scroll/pdx-infinite-scroll.pdx';
import './relative-time/pdx-relative-time.pdx';
// Tier 2: Overlay + Containers
import './tooltip/pdx-tooltip.pdx';
import './popover/pdx-popover.pdx';
import './dialog/pdx-dialog.pdx';
import './alert-dialog/pdx-alert-dialog.pdx';
import './drawer/pdx-drawer.pdx';
import './toast/pdx-toast.pdx';
import './tabs/pdx-tabs.pdx';
import './accordion/pdx-accordion.pdx';
import './card/pdx-card.pdx';
import './banner/pdx-banner.pdx';
import './bottom-sheet/pdx-bottom-sheet.pdx';
import './command/pdx-command.pdx';

// Tier 3A: Data-bound
import './select/pdx-select';
import './autocomplete/pdx-autocomplete';
import './data-source/pdx-data-source.pdx';
import './data-grid/pdx-data-grid';
import './filter-builder/pdx-filter-builder.pdx';
import './auto-form/pdx-auto-form.pdx';
// CRUD primitives (compose data-grid + form-template + drawer)
import './bulk-actions/pdx-bulk-actions.pdx';
import './edit-drawer/pdx-edit-drawer.pdx';
import './entity-grid/pdx-entity-grid.pdx';
import './json-editor/pdx-json-editor.pdx';
import './relation-picker/pdx-relation-picker.pdx';
import './chart/pdx-chart.pdx';
import './chart/pdx-sparkline.pdx';
import './rich-text/pdx-rich-text.pdx';

// Infrastructure components (non-rendering / utility)
import './provide/pdx-provide.pdx';
import './error-boundary/pdx-error-boundary.pdx';
import './overlay/pdx-overlay-outlet.pdx';

// Utilities (functions, not components)
export { autoPageSize } from './data-grid/auto-page-size';
export type { AutoPageSizeOptions } from './data-grid/auto-page-size';

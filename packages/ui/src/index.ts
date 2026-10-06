// @pdxui/ui — Web Components for Pragmatic Design
// Side-effect imports register custom elements.

// Tier 1A: Atoms
// pdx-icon registers the "pragmatic" set (the default) itself before defining the CE — see pdx-icon.ts.
import './icon/pdx-icon';
import './button/pdx-button';
import './button-group/pdx-button-group';
import './progress/pdx-progress';
import './badge/pdx-badge';
import './chip/pdx-chip';
import './avatar/pdx-avatar';
import './avatar-group/pdx-avatar-group';
import './spinner/pdx-spinner';
import './divider/pdx-divider';
import './kbd/pdx-kbd';
import './label/pdx-label';
import './input/pdx-input';
import './checkbox/pdx-checkbox';
import './radio/pdx-radio';
import './switch-toggle/pdx-switch';

// Tier 1B: Specialized Inputs
import './password-input/pdx-password-input';
import './search-input/pdx-search-input';
import './number-input/pdx-number-input';
import './textarea/pdx-textarea';
import './input-group/pdx-input-group';
import './masked-input/pdx-masked-input';
import './otp-input/pdx-otp-input';
import './pin-input/pdx-pin-input';
import './radio-group/pdx-radio-group';
import './checkbox-group/pdx-checkbox-group';
import './tag-input/pdx-tag-input';
import './color-picker/pdx-color-picker';
import './file-upload/pdx-file-upload';
import './slider/pdx-slider';
import './rating/pdx-rating';
import './segmented/pdx-segmented';
import './toggle/pdx-toggle';
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
import './form/pdx-form';
import './form-template/pdx-form-template';
import './form-section/pdx-form-section';
import './form-actions/pdx-form-actions';
import './form-field/pdx-form-field';
import './fieldset/pdx-fieldset';
import './field-group/pdx-field-group';
import './field-list/pdx-field-list';
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

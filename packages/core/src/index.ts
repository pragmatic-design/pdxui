// @pdxui/core — Reactive core for PDX UI
//
// Operator naming convention:
//   Standalone operators:  debounced(), throttled(), distinct(), scan(), etc.
//     → Wrap a source getter, return ReadonlySignal<T> & { dispose }
//     → Usage: const d = debounced(() => query(), 300);
//
//   Pipe operators:  debounce(), throttle(), map(), filter(), distinctOp(), etc.
//     → For use inside pipe(): pipe(source, debounce(300), map(x => x.trim()))
//     → distinctOp is the pipe-compatible version of distinct (alias to avoid name collision)

// Reactivity
export { signal, computed, effect, batch, onCleanup, onDispose, collectDisposers, ref, untracked, enableDevMode, pushErrorHandler, popErrorHandler } from './reactivity/signal';
export type { ComputedOptions, EffectOptions } from './reactivity/signal';

// Deep Reactive Store
export { store, shallowStore } from './reactivity/store';

// Watcher
export { watch } from './reactivity/watch';
export type { WatchOptions } from './reactivity/watch';

// Standalone signal operators — wrap a getter, return a disposable signal
export { debounced, throttled, merged } from './reactivity/operators';

// Pipe operators — composable transforms for use with pipe()
// Note: distinctOp is the pipe-compatible version of distinct() (avoids name collision)
export { pipe, debounce, throttle, map, filter, distinct as distinctOp, skip, take, tap, catchError } from './reactivity/pipe';
export type { SignalOperator } from './reactivity/pipe';

// Standalone utility operators — wrap a getter, return a disposable signal
export { distinct, previous, scan, pairwise, sample, skipUntil, takeUntil } from './reactivity/utility-operators';

// Async signal operators (switchMap/exhaustMap/retry as signals)
export { switchSignal, exhaustSignal, retrySignal, concatSignal } from './reactivity/async-operators';
export type { AsyncSignal, AsyncStatus, RetryOptions } from './reactivity/async-operators';

// DOM event → Signal bridge
export { fromEvent, fromEvents } from './reactivity/from-event';
export type { FromEventOptions } from './reactivity/from-event';

// Browser Observer → Signal bridge
export { fromIntersection, fromResize, fromMutation } from './reactivity/from-observer';
export type { IntersectionState, ResizeState, MutationState } from './reactivity/from-observer';

// Promise ↔ Signal bridge
export { fromPromise, fromCallback, toPromise, toAsync } from './reactivity/from-promise';
export type { PromiseSignal } from './reactivity/from-promise';

// httpResource — HttpClient + resource() combined (Angular httpResource-like)
export { httpResource } from './reactivity/http-resource';
export type { HttpResourceOptions } from './reactivity/http-resource';

// useQuery — high-level data fetching (TanStack Query-like)
export { useQuery } from './reactivity/use-query';
export type { UseQueryOptions, QueryResult } from './reactivity/use-query';

// Event Bus
export { createBus } from './reactivity/bus';
export type { EventBus, EventRecord, BusOptions } from './reactivity/bus';

// Resource (async data loading)
export { resource, resourceWhen } from './reactivity/resource';
export type { Resource, ResourceOptions, ResourceState, ResourceStatus, ResourceHandlers } from './reactivity/resource';

// Mutation
export { mutation } from './reactivity/mutation';
export type { Mutation, MutationOptions } from './reactivity/mutation';

// Linked Signal (writable derived)
export { linkedSignal } from './reactivity/linked-signal';
export type { LinkedSignalOptions, LinkedSignalPrevious } from './reactivity/linked-signal';

// Cache & Invalidation
export { createCache, getDefaultCache, setDefaultCache, invalidate, invalidateAll } from './reactivity/cache';
export type { Cache, CacheEntry, CacheConfig, InvalidationMatcher } from './reactivity/cache';

// HTTP Client
export { createHttpClient, getDefaultClient, setDefaultClient, configureClient } from './http/client';
export type { HttpClient, HttpClientConfig, HttpRequest, HttpResponse, HttpMiddleware, HttpHandler, RequestOptions } from './http/types';
export { uploadFile, downloadFile, saveBlob } from './http/upload';
export type { UploadOptions, DownloadOptions, TransferHandle, DownloadHandle, TransferStatus } from './http/upload';
export { HttpError, AbortError, OfflineError } from './http/types';

// HTTP Middleware (tree-shakeable)
export { authMiddleware, retryMiddleware, timeoutMiddleware, logMiddleware, csrfMiddleware } from './http/middleware';
export { offlineMiddleware } from './http/offline';

// Responsive Value
export { responsiveCSS, responsiveValue } from './reactivity/responsive-value';
export type { ResponsiveValueOptions } from './reactivity/responsive-value';

// Forms
export { createForm, FORM_INTERNALS } from './form/form';
export type { Form, FormField, FormConfig, SaveMode, FieldSaveConfig, FormInternals } from './form/form';
export { flattenValues, unflattenValues, getNestedValue, setNestedValue, getFieldsByPrefix } from './form/form-path';
export { registerFormControl, registerFormFieldType, isFormControl, getFormControlConfig, getFieldTypeTag, getRegisteredFormControls } from './form/form-registry';
export type { FormControlConfig, CustomValidatorDef } from './form/form-registry';
export { createFieldArray } from './form/field-array';
export type { FieldArray, FieldArrayItem } from './form/field-array';
export {
    required, minLength, maxLength, email, pattern, url,
    min, max, integer, validateSchema, isStandardSchema,
} from './form/validators';
export type { Validator, AsyncValidator, StandardSchema } from './form/validators';
export { setValidationLocale, clearValidationLocale, resolveValidationMessage, validationMessage, onLocaleChange, VALIDATION_KEYS } from './form/validation-i18n';
export type { ValidationMessage, ValidationResult } from './form/validation-i18n';

// Form Schema (JSON → Form factory)
export { createFormFromSchema, evaluateVisibility } from './form/form-schema';
export type { FormSchema, FormFieldSchema, FormSectionSchema, FormFieldType, FieldOptionsLoader, VisibilityCondition, ValidatorSchema, AsyncValidatorSchema } from './form/form-schema';

// Form-Associated Custom Elements (ElementInternals mixin)
export { useFormAssociated } from './form/form-associated';
export type { FormAssociatedOptions } from './form/form-associated';

// Form Context (provide/inject for <pdx-form>)
export { provideForm, useForm, tryUseForm, provideFormCoordinator, useFormCoordinator, provideFieldGroupPath, useFieldGroupPath } from './form/form-context';
export { createFormCoordinator } from './form/form-coordinator';
export type { FormCoordinator, CoordinatedValues } from './form/form-coordinator';

// Types
export type { Signal, ReadonlySignal, HistorySignal, SignalOptions, Dispose } from './utils/types';
/**
 * Is this a development build? A CONSTANT the bundler folds, so what it guards leaves the bundle.
 *
 * Exported because @pdxui/ui guards its own diagnostics with it and there is one definition of
 * what a dev build is, not two. An application may use it for the same purpose — `if (DEV)` around
 * a message that teaches, never around behaviour, because behaviour that only happens in dev is a
 * difference between what you tested and what you shipped.
 */
export { DEV } from './utils/env';

// Renderer
export { html, clearBoundProperty, assignBoundProperty, interpolationText } from './renderer/template';
export { repeat } from './renderer/list';
export { repeatWithSlot } from './renderer/slot-repeat';
export { setProp, insert, remove, text, marker, __staticHTML } from './renderer/dom';

// Error Boundary
export { errorBoundary } from './renderer/error-boundary';

// Scoped Slot
export { renderSlot, slotCarrier } from './renderer/slot';
export type { SlotFunction } from './renderer/slot';

// Helpers
export { when, awaitTimed, awaitReady, each, eachRow, match, pipe as templatePipe, show, portal, dynamic } from './renderer/helpers';
export type { TransitionOptions, DynamicOptions, PortalOptions } from './renderer/helpers';

// Pages (keep-alive page switching)
export { pages } from './renderer/pages';

// Transitions + FLIP
export { enter, exit, injectTransitionCSS, flipAnimate, recordPositions } from './renderer/transitions';

// Keyframe Animations
export { keyframes, playKeyframes } from './renderer/keyframes';
export type { AnimationConfig } from './renderer/keyframes';

// Spring Physics Easing
export { spring } from './renderer/spring';
export type { SpringConfig } from './renderer/spring';

// Tween Animation (JS runtime value animation)
export { tween, tweenMulti, easings } from './renderer/tween';
export type { TweenConfig, TweenSignal } from './renderer/tween';

// Defer (lazy loading)
export { defer } from './renderer/defer';
export type { DeferOptions, DeferState } from './renderer/defer';

// Component
export { PdxElement, moveMounted } from './component/element';
export type { EmitOptions } from './component/element';
export { define, __pdx_hmr_swap, __pdx_hmr_rerender } from './component/define';
export { component, __pdx_hmr_save, __pdx_hmr_restore } from './component/component';
export type { ComponentOptions, ComponentOptionsWithSetup, ComponentContext, ComponentContextBase, TypedComponentContext, PropDefinition, TypedProp } from './component/component';

// Services (provide/inject)
export { provide, inject, tryInject, useProvided, tryUseProvided, provideWritable, useWritable, tryUseWritable, clearProviders, requestContext, installContextProtocol } from './component/context';

// Global Error Interceptor
export { onGlobalError, dispatchGlobalError, safeHandler, clearGlobalErrorHandlers } from './component/global-error';
export type { ErrorSource, ErrorContext, GlobalErrorHandler } from './component/global-error';

// Composable Lifecycle
export {
    onMount, onDestroy, onUpdated, onError, onShow, onHide,
    onPropsChange, onBeforeLeave, onRouteChange,
    onVisible, onResize, useEffect,
} from './component/lifecycle';
export type { ComponentScope, PropChange } from './component/lifecycle';

// Component Communication
export { createChannel, createCommands, exposeOnElement } from './component/channel';
export type { Channel, Commands } from './component/channel';

// Permissions
export { setPermissions, hasPermission, requirePermission } from './component/permissions';

// Popover headless (foundation for tooltip, dropdown, combobox, menu, datepicker)
export { usePopover } from './component/popover';
export type { PopoverOptions, PopoverReturn, PopoverPlacement, PopoverTrigger } from './component/popover';

// Accessibility
export { announce, destroyAnnouncer } from './a11y/announcer';
export { focusFirst, focusLast, saveFocus, getFocusableElements } from './a11y/focus';
export { roving } from './a11y/roving';
export type { RovingOptions } from './a11y/roving';
export { focusTrap } from './a11y/focus-trap';
export type { FocusTrapOptions } from './a11y/focus-trap';
export { focusGroup } from './a11y/focus-group';
export type { FocusGroupOptions } from './a11y/focus-group';
export { focusRestore } from './a11y/focus-restore';
export type { FocusRestoreReturn } from './a11y/focus-restore';
export { manageFocusOrder } from './a11y/focus-order';
export type { FocusOrderOptions } from './a11y/focus-order';

// Overlay System (z-stack, portal, backdrop, dismiss coordination)
export { overlayStack, createPortal, createBackdrop, onClickOutsideStack, applySafeArea, swipeDownDismiss, createBottomSheet } from './component/overlay-stack';
export type { OverlayStack, OverlayOptions, OverlayEntry, PortalResult, BackdropOptions, BackdropResult, BottomSheetOptions, BottomSheetResult } from './component/overlay-stack';

// Positioning Engine (middleware-based floating element positioning)
export { computePosition as computeFloatingPosition, autoUpdate, offset, flip, shift, arrow, size as sizeMiddleware, hide as hideMiddleware } from './component/positioning';
export type { Placement as FloatingPlacement, Side, Alignment, VirtualElement, Middleware, MiddlewareState, MiddlewareResult, PositionOptions, PositionResult, FlipOptions, ShiftOptions, ArrowOptions, SizeOptions, OffsetValue, HideOptions } from './component/positioning';

// Icon Registry (agnostic icon set management)
export { registerIconSet, resolveIcon, getDefaultIconSet, setDefaultIconSet, hasIconSet, clearIconSets } from './component/icon-registry';
export type { IconResolver } from './component/icon-registry';

// Container Size (signal-based container awareness + measure utilities)
export { useContainerSize, measure, measureRelative, registerContainerQueries } from './component/container-size';
export type { ContainerSizeReturn, ContainerBreakpoints, MeasureResult, RelativeMeasureResult } from './component/container-size';

// Selection Model (key-based selection for lists, grids, trees)
export { createSelection } from './component/selection';
export type { Selection, SelectionOptions, SelectionMode, SelectionBehavior } from './component/selection';

// Virtualization (efficient large list/grid rendering)
export { createVirtualizer } from './renderer/virtualizer';
export type { VirtualItem, VirtualizerOptions, VirtualizerReturn } from './renderer/virtualizer';

// Custom Scrollbar (cross-browser consistent, controllable)
export { useScrollbar } from './component/scrollbar';
export type { ScrollbarOptions, ScrollbarReturn } from './component/scrollbar';

// Drag and Drop (signal-based, PointerEvent unified)
export { useDrag, useDropZone } from './component/drag';
export type { DragOptions, DragReturn, DropZoneOptions, DropZoneReturn, DropPosition, DropEdge, DragA11yOptions, DragA11yMessages } from './component/drag';

// Sortable (drag-to-reorder, builds on useDrag)
export { useSortable } from './component/sortable';
export type { SortableOptions, SortableReturn, SortableFeedbackOptions, SortableA11yOptions, SortableA11yMessages } from './component/sortable';

// Clipboard (signal-based copy/paste/cut)
export { useClipboard } from './component/clipboard';
export type { ClipboardOptions, ClipboardReturn } from './component/clipboard';

// Resize Handle (drag to resize panels/columns)
export { useResizeHandle } from './component/resize-handle';
export type { ResizeHandleOptions, ResizeHandleReturn } from './component/resize-handle';

// Toast Queue (notification queue with auto-dismiss)
export { createToastQueue } from './component/toast-queue';
export type { ToastQueue, ToastData, Toast, ToastType, ToastPosition, ToastQueueOptions } from './component/toast-queue';

// Dialog Queue (programmatic dialog/confirm/alert queue)
export { createDialogQueue, getDialogQueue } from './component/dialog-queue';
export type { DialogQueue, DialogData, DialogInstance, DialogType } from './component/dialog-queue';

// ─── Tier 0B ──────────────────────────────────────────────────

// DataSource CRUD (pluggable transport, server sort/filter/page, change tracking)
export { createDataSource, isDataSource } from './data/data-source';
export type { DataSource, DataSourceOptions, ChangeType, FormBridge } from './data/data-source';
// CSV export — the rows a user filtered to, as a file they can open.
export { toCsv, csvCell } from './data/csv';
export type { CsvColumn } from './data/csv';
export { toXlsx } from './data/xlsx';
export type { XlsxColumn } from './data/xlsx';
export { createOptionsSource, mapOptions } from './data/options-source';
export type { OptionsSource, SelectOption } from './data/options-source';
export { createAuthStore } from './auth/auth-store';
export type { AuthStore, AuthStoreOptions, AuthTokens } from './auth/auth-store';
export { restTransport } from './data/transport';
export { arrayTransport } from './data/array-transport';
export type { ArrayTransportOptions } from './data/array-transport';
export { delayTransport } from './data/delay-transport';
export type { DelayTransportOptions } from './data/delay-transport';
export type { IDataTransport, DataRequest, DataResponse, SortDescriptor, FilterDescriptor, CompositeFilter, FilterOperator, ChangeSet, ParameterMap, RestTransportOptions } from './data/transport';
export { fakeTransport } from './data/fake-transport';
export type { FakeTransportOptions, FakeOperation } from './data/fake-transport';
export { matchesFilters, clientSort, clientGroup, computeDiff, aggregateColumn } from './data/data-utils';
export type { GroupDescriptor, AggregateDescriptor, GroupResult, AggregateSpec } from './data/data-utils';

// Data Grid composable (headless grid logic)
export { useDataGrid } from './data/data-grid';
export type { DataGrid } from './data/data-grid';
export type {
    ColumnDef, ColumnType, ResolvedColumn, GridState,
    DataGridOptions, EditMode, AggregateType,
    CellSpec, CellBadgeSpec, CellStatusSpec, CellLinkSpec, CellCurrencySpec,
    CellDateSpec, CellBooleanIconSpec, CellActionsSpec, CellAction, CellRow,
    CellRowMenuSpec, RowMenuItem, ColumnChange,
} from './data/data-grid-types';
export {
    humanizeField, getFieldValue,
    badge, status, link, currency, dateCell, booleanIcon, actions, rowMenu,
} from './data/data-grid-types';
export { columnTypeToFormType, columnsToFormFields, createEditForm } from './data/data-grid-edit-bridge';
export { toColumnDefs, toFormFields, toFilterFields, opsForType, RELATIVE_DATE_OPS } from './data/field-definition';
export type { FieldDefinition, FieldType, FilterField, FilterOptionItem, FilterOptionsLoader } from './data/field-definition';
export { createGridFromConfig } from './data/data-grid-config';
export type { DataGridConfig, GridFromConfig } from './data/data-grid-config';

// Mobile: Bottom Sheet, Pull-to-Refresh, Safe Area
export { useBottomSheet } from './mobile/bottom-sheet';
export type { BottomSheetReturn, Detent } from './mobile/bottom-sheet';
export { usePullToRefresh } from './mobile/pull-to-refresh';
export type { PullToRefreshOptions, PullToRefreshReturn } from './mobile/pull-to-refresh';
export { useSafeArea, injectSafeAreaCSS } from './mobile/safe-area';
export type { SafeAreaInsets, SafeAreaReturn } from './mobile/safe-area';

// i18n: Component Strings, RTL
export { registerComponentStrings, setComponentStrings, getComponentString, getComponentStrings, setLocaleStrings, clearComponentStrings, componentStringsChanged } from './i18n/component-strings';
export type { ComponentStrings } from './i18n/component-strings';

// The breadcrumb's trail: core holds it, the router fills it, `<pdx-breadcrumb>` reads it, and
// neither half has to depend on the other.
export { routeTrail, setRouteTrail, clearRouteTrail } from './navigation/route-trail';
export type { RouteCrumb } from './navigation/route-trail';
export { direction, isRTL, setDirection, inlineStart, inlineEnd, flipPlacement, rtlTransformX } from './i18n/rtl';

// Accessibility: Active Descendant, Live Region, Roving Tabindex
export { useActiveDescendant } from './a11y/active-descendant';
export type { ActiveDescendantOptions, ActiveDescendantReturn } from './a11y/active-descendant';
export { createLiveRegion } from './a11y/live-region';
export type { LiveRegion, LivePoliteness } from './a11y/live-region';
export { useRovingTabindex } from './a11y/roving-tabindex';
export type { RovingTabindexOptions, RovingTabindexReturn } from './a11y/roving-tabindex';

// ─── Tier 0C ──────────────────────────────────────────────────

// Compound Component (parent↔child auto-wiring)
export { createCompoundParent, discoverChildren } from './component/compound';
export type { CompoundParentContext, CompoundOptions, ChildDiscoveryOptions } from './component/compound';

// Typed Slots (named slots, scoped slots, forwarding)
export { createSlotManager, forwardSlots } from './component/typed-slots';
export type { SlotDefinition, SlotManager } from './component/typed-slots';

// Adaptive Components (desktop↔mobile switch)
export { useAdaptive, adaptiveValue } from './component/adaptive';
export type { AdaptiveMode, AdaptiveOptions, AdaptiveReturn } from './component/adaptive';

// Form Engine (cross-field validation, dirty tracking)
export { createFormEngine } from './data/form-engine';
export type { FormEngine, FormState, FieldAPI, FieldOptions, FieldState, ValidationRule } from './data/form-engine';

// Auto-Skeleton (loading placeholder from structure)
export { showSkeleton, hideSkeleton } from './component/auto-skeleton';
export type { SkeletonOptions } from './component/auto-skeleton';

// Scroll Animation + Shared Element Transition
export { useScrollAnimation, captureRect, animateSharedElement } from './renderer/scroll-animation';
export type { ScrollAnimationOptions, ScrollAnimationReturn, SharedElementOptions } from './renderer/scroll-animation';

// TC39 Signals protocol compatibility (Stage 1 interop prep)
export { toTC39State, toTC39Computed, fromTC39State, fromTC39Computed } from './reactivity/tc39-compat';
export type { TC39State, TC39Computed } from './reactivity/tc39-compat';

// Debug & Telemetry
export { __pdx_debug, setTelemetryLevel, getTelemetryLevel } from './debug/inspector';
export type { TelemetryLevel, TraceEntry, ReconcileMetrics, PerfSummary } from './debug/inspector';
// __PDX_DEVTOOLS__ v1: the router reports its route and navigations through these.
export { setDevtoolsRouteSource, recordDevtoolsNavigation } from './debug/devtools-api';
export type { DevtoolsRoute, DevtoolsNavigation, DevtoolsTreeNode, DevtoolsInspection, DevtoolsError } from './debug/devtools-api';

// Responsive
export { responsive } from './component/responsive';

// Device Detection
export { device } from './component/device';
export type { DeviceType, Orientation } from './component/device';
export type { Breakpoint, BreakpointMap } from './component/responsive';

// Reactive Style Runtime
export { cssVar, createTokenBridge, createTheme, applyTheme, setTheme, setScheme, getTheme, getScheme, toggleDarkMode, currentTheme, currentScheme, __adoptStyles } from './component/style';
export type { TokenBridge } from './component/style';

// Viewport & Screen Signals (centralized)
export { viewport, screen, adaptive } from './component/viewport';

// Browser Composables
export { useStorage } from './browser/storage';
export { useOnline } from './browser/online';
// Inactivity — when the USER left, which is not when the token expires.
export { useIdle } from './browser/idle';
export type { IdleOptions, IdleHandle } from './browser/idle';
export { useTitle } from './browser/title';
export { useMediaQuery } from './browser/media-query';
export { useHead } from './browser/head';
export { splashReady, isSplashUp, SPLASH_ID } from './browser/splash';
export type { HeadConfig, MetaTag, LinkTag } from './browser/head';

// Scroll Composable
export { useScroll, scrollTo, saveScrollPosition, restoreScrollPosition } from './browser/scroll';
export type { ScrollState, ScrollRestoration } from './browser/scroll';

// Global Store (compiler-generated from @store rune)
export { createGlobalStore, getStore, clearStores } from './reactivity/global-store';
export type { GlobalStoreOptions } from './reactivity/global-store';

// Gestures (touch + mouse + pen)
export { onSwipe, onLongpress, onPinch } from './component/gestures';
export type { SwipeDirection, SwipeConfig, LongpressConfig, PinchEvent } from './component/gestures';

// Security
export { sanitizeUrl, sanitizeMediaUrl, sanitizeBoundUrl } from './security/sanitize-url';

// i18n — Internationalization
export { $t, formatMessage, $n, $d, $r, getLocale, setLocale, getSupportedLocales, initI18n, loadTranslations, createI18nLoader, validateIcu } from './i18n/index';
export type { I18nConfig, LoaderConfig, I18nLoader, PdxMessages, PdxMessageKey } from './i18n/index';

// Calendar Engine (pure math, zero DOM)
export {
    gregorianToJD, jdToGregorian, getDaysInMonth, addDays, addMonths, addYears,
    compareDates, isSameDay, isSameMonth, isInRange, isWeekend, today,
    isoWeekNumber, dayOfWeek, getFirstDayOfWeek, generateMonthGrid,
    getFiscalYear, getFiscalQuarter,
    getWeekRange, getMonthRange, getQuarterRange, getYearRange,
    getMonthNames, getDayNames, formatWithCalendar, getDateFormatOrder, is12HourClock,
    parseISO, toISO, clampDate,
} from './calendar/calendar-engine';
export type {
    CalendarDate, CalendarCell, CalendarGrid, MonthGridOptions, DateRange, CalendarSystem,
} from './calendar/calendar-engine';

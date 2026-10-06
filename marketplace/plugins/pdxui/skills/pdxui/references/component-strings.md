# Component strings — every key, its English default, where it is declared

> Generated from the sources. 428 keys in 78 components.

Override any of them with **one** call, **before the app mounts** — see the recipe "An app that is not in
English":

```js
import { setLocaleStrings } from '@pdxui/core';
setLocaleStrings({ dialog: { close: 'Chiudi' }, pagination: { previous: 'Precedente' } });
```

There is one registry. The last column only says where the English default is written: most live in
`@pdxui/ui/src/shared/i18n.ts`, and a component with many strings (the grid, the date picker, the
router) declares its own. An override reaches either the same way. `{n}` and the other `{name}`s are
placeholders, filled at render: keep them in the translation.

| component | key | English default | declared in |
|---|---|---|---|
| `alert-dialog` | `cancel` | `Cancel` | `@pdxui/ui/src/shared/i18n.ts` |
| `alert-dialog` | `confirm` | `Confirm` | `@pdxui/ui/src/shared/i18n.ts` |
| `alert-dialog` | `title` | `Are you sure?` | `@pdxui/ui/src/shared/i18n.ts` |
| `alert-dialog` | `typeToConfirm` | `Type {text} to confirm:` | `@pdxui/ui/src/shared/i18n.ts` |
| `app-layout` | `aside` | `Secondary` | `@pdxui/ui/src/shared/i18n.ts` |
| `app-layout` | `mainNav` | `Main navigation` | `@pdxui/ui/src/shared/i18n.ts` |
| `auto-form` | `reset` | `Reset` | `@pdxui/ui/src/shared/i18n.ts` |
| `auto-form` | `submit` | `Save` | `@pdxui/ui/src/shared/i18n.ts` |
| `autocomplete` | `clear` | `Clear` | `@pdxui/ui/src/shared/i18n.ts` |
| `autocomplete` | `noResults` | `No results` | `@pdxui/ui/src/shared/i18n.ts` |
| `autocomplete` | `resultsAvailable` | `{n} results available` | `@pdxui/ui/src/shared/i18n.ts` |
| `avatar-group` | `member` | `Member {n}` | `@pdxui/ui/src/shared/i18n.ts` |
| `avatar-group` | `more` | `{count} more` | `@pdxui/ui/src/shared/i18n.ts` |
| `badge` | `indicator` | `{variant} indicator` | `@pdxui/ui/src/shared/i18n.ts` |
| `banner` | `close` | `Close` | `@pdxui/ui/src/shared/i18n.ts` |
| `bottom-nav` | `badge` | `{label}, {badge} new` | `@pdxui/ui/src/shared/i18n.ts` |
| `bottom-nav` | `label` | `Bottom navigation` | `@pdxui/ui/src/shared/i18n.ts` |
| `bottom-sheet` | `close` | `Close` | `@pdxui/ui/src/shared/i18n.ts` |
| `bottom-sheet` | `handle` | `Sheet height` | `@pdxui/ui/src/shared/i18n.ts` |
| `bottom-sheet` | `height` | `{percent}% of the screen` | `@pdxui/ui/src/shared/i18n.ts` |
| `bottom-sheet` | `label` | `Bottom sheet` | `@pdxui/ui/src/shared/i18n.ts` |
| `breadcrumb` | `expand` | `Show path` | `@pdxui/ui/src/shared/i18n.ts` |
| `breadcrumb` | `label` | `Breadcrumb` | `@pdxui/ui/src/shared/i18n.ts` |
| `bulk-actions` | `clearSelection` | `Clear selection` | `@pdxui/ui/src/shared/i18n.ts` |
| `bulk-actions` | `label` | `Bulk actions` | `@pdxui/ui/src/shared/i18n.ts` |
| `bulk-actions` | `selected` | `{count} selected` | `@pdxui/ui/src/shared/i18n.ts` |
| `calendar` | `label` | `Calendar` | `@pdxui/ui/src/shared/i18n.ts` |
| `calendar` | `nextMonth` | `Next month` | `@pdxui/ui/src/calendar/pdx-calendar.ts` |
| `calendar` | `nextYear` | `Next year` | `@pdxui/ui/src/calendar/pdx-calendar.ts` |
| `calendar` | `nextYears` | `Next years` | `@pdxui/ui/src/calendar/pdx-calendar.ts` |
| `calendar` | `prevMonth` | `Previous month` | `@pdxui/ui/src/calendar/pdx-calendar.ts` |
| `calendar` | `prevYear` | `Previous year` | `@pdxui/ui/src/calendar/pdx-calendar.ts` |
| `calendar` | `prevYears` | `Previous years` | `@pdxui/ui/src/calendar/pdx-calendar.ts` |
| `calendar` | `selectMonth` | `Select month` | `@pdxui/ui/src/calendar/pdx-calendar.ts` |
| `calendar` | `selectYear` | `Select year` | `@pdxui/ui/src/calendar/pdx-calendar.ts` |
| `calendar` | `today` | `Today` | `@pdxui/ui/src/calendar/pdx-calendar.ts` |
| `calendar` | `weekNumber` | `W` | `@pdxui/ui/src/calendar/pdx-calendar.ts` |
| `carousel` | `goToSlide` | `Go to slide {n}` | `@pdxui/ui/src/shared/i18n.ts` |
| `carousel` | `label` | `Carousel` | `@pdxui/ui/src/shared/i18n.ts` |
| `carousel` | `next` | `Next slide` | `@pdxui/ui/src/shared/i18n.ts` |
| `carousel` | `previous` | `Previous slide` | `@pdxui/ui/src/shared/i18n.ts` |
| `carousel` | `slide` | `{n} of {total}` | `@pdxui/ui/src/shared/i18n.ts` |
| `carousel` | `startRotation` | `Start slide rotation` | `@pdxui/ui/src/shared/i18n.ts` |
| `carousel` | `stopRotation` | `Stop slide rotation` | `@pdxui/ui/src/shared/i18n.ts` |
| `cascader` | `clear` | `Clear` | `@pdxui/ui/src/shared/i18n.ts` |
| `cascader` | `level` | `Level {n}` | `@pdxui/ui/src/shared/i18n.ts` |
| `cascader` | `loading` | `Loading...` | `@pdxui/ui/src/cascader/pdx-cascader.ts` |
| `cascader` | `noData` | `No data` | `@pdxui/ui/src/cascader/pdx-cascader.ts` |
| `cascader` | `noMatch` | `No match` | `@pdxui/ui/src/cascader/pdx-cascader.ts` |
| `cascader` | `placeholder` | `Select...` | `@pdxui/ui/src/cascader/pdx-cascader.ts` |
| `cascader` | `results` | `Search results` | `@pdxui/ui/src/shared/i18n.ts` |
| `cascader` | `search` | `Search...` | `@pdxui/ui/src/cascader/pdx-cascader.ts` |
| `cascader` | `searchLabel` | `Search options` | `@pdxui/ui/src/shared/i18n.ts` |
| `chart` | `category` | `Category` | `@pdxui/ui/src/shared/i18n.ts` |
| `chart` | `gauge` | `{label}: {value} of {min}–{max}` | `@pdxui/ui/src/shared/i18n.ts` |
| `chart` | `gaugeLabel` | `Gauge` | `@pdxui/ui/src/shared/i18n.ts` |
| `chart` | `legend` | `Legend` | `@pdxui/ui/src/shared/i18n.ts` |
| `chart` | `points` | `, {n} data points` | `@pdxui/ui/src/shared/i18n.ts` |
| `chart` | `summary` | `{type} chart` | `@pdxui/ui/src/shared/i18n.ts` |
| `chip` | `remove` | `Remove {label}` | `@pdxui/ui/src/shared/i18n.ts` |
| `color-picker` | `area` | `Saturation {s}%, brightness {v}%, {color}` | `@pdxui/ui/src/shared/i18n.ts` |
| `color-picker` | `clear` | `Clear color` | `@pdxui/ui/src/shared/i18n.ts` |
| `color-picker` | `color` | `Color` | `@pdxui/ui/src/shared/i18n.ts` |
| `color-picker` | `dialog` | `Color picker` | `@pdxui/ui/src/shared/i18n.ts` |
| `color-picker` | `hex` | `Hex color` | `@pdxui/ui/src/shared/i18n.ts` |
| `color-picker` | `hue` | `Hue` | `@pdxui/ui/src/shared/i18n.ts` |
| `color-picker` | `opacity` | `Opacity` | `@pdxui/ui/src/shared/i18n.ts` |
| `color-picker` | `pick` | `Pick color` | `@pdxui/ui/src/shared/i18n.ts` |
| `color-picker` | `presets` | `Color presets` | `@pdxui/ui/src/shared/i18n.ts` |
| `command` | `close` | `Close` | `@pdxui/ui/src/shared/i18n.ts` |
| `command` | `commands` | `Commands` | `@pdxui/ui/src/shared/i18n.ts` |
| `command` | `commandsAvailable` | `{n} commands available` | `@pdxui/ui/src/shared/i18n.ts` |
| `command` | `empty` | `No results found.` | `@pdxui/ui/src/shared/i18n.ts` |
| `command` | `navigate` | `Navigate` | `@pdxui/ui/src/shared/i18n.ts` |
| `command` | `noResults` | `No results` | `@pdxui/ui/src/shared/i18n.ts` |
| `command` | `palette` | `Command palette` | `@pdxui/ui/src/shared/i18n.ts` |
| `command` | `placeholder` | `Type a command...` | `@pdxui/ui/src/shared/i18n.ts` |
| `command` | `search` | `Search commands` | `@pdxui/ui/src/shared/i18n.ts` |
| `command` | `select` | `Select` | `@pdxui/ui/src/shared/i18n.ts` |
| `context-menu` | `label` | `Context menu` | `@pdxui/ui/src/shared/i18n.ts` |
| `data-grid` | `columns.title` | `Columns` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `detail.collapse` | `Collapse row` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `detail.column` | `Details` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `detail.expand` | `Expand row` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `edit.addRow` | `Add` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `edit.cancel` | `Cancel` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `edit.delete` | `Delete` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `edit.dialogTitle` | `Edit Record` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `edit.edit` | `Edit` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `edit.revert` | `Revert` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `edit.save` | `Save` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `edit.saveAll` | `Save All` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `empty.title` | `No data` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.addFilter` | `+ Add Filter` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.addFilterMenu` | `Add a filter on` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.after` | `After` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.all` | `All` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.apply` | `Apply` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.before` | `Before` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.blanks` | `(Blanks)` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.clear` | `Clear` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.clearAll` | `Clear all filters` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.contains` | `Contains` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.datePlaceholder` | `Date...` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.endswith` | `Ends with` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.eq` | `Equals` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.forColumn` | `Filter {column}` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.fromPlaceholder` | `From...` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.gt` | `Greater than` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.gte` | `Greater or equal` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.isnotnull` | `Is not empty` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.isnull` | `Is empty` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.lt` | `Less than` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.lte` | `Less or equal` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.minPlaceholder` | `Min...` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.neq` | `Not equals` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.no` | `No` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.onOrAfter` | `On or after` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.onOrBefore` | `On or before` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.operatorFor` | `{column} filter: {operator}` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.operatorMenu` | `{column} filter operator` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.placeholder` | `Filter...` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.remove` | `Remove filter {column}` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.startswith` | `Starts with` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.title` | `Filter: {field}` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.valuePlaceholder` | `Value...` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `filter.yes` | `Yes` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `group.by` | `Group by` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `group.chip` | `Group: {column}` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `group.empty` | `(Empty)` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `group.none` | `None` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `group.remove` | `Remove group {column}` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `group.toggle` | `{column}: {value}, {count} rows` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `group.toggleOne` | `{column}: {value}, {count} row` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `groupBar.dropHere` | `Drag columns here to group` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `logic.and` | `AND` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `logic.or` | `OR` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `pagination.row` | `{count} row` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `pagination.rows` | `{count} rows` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `row.actions` | `Row actions` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `selectAll` | `Select all` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `selection.column` | `Selection` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `selectRow` | `Select row {n}` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `sort.asc` | `Ascending` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `sort.desc` | `Descending` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `sort.hint` | `{column} · Shift+click to add to the sort` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `sort.position` | `Sort {n} of {total}, {dir}` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `sort.remove` | `Remove sort {column}` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `toolbar.columns` | `Columns` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `toolbar.export` | `Export` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `toolbar.exportCsv` | `CSV (.csv)` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `toolbar.exportMenu` | `Export as` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `toolbar.exportXlsx` | `Excel (.xlsx)` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `toolbar.filter` | `Filter` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `toolbar.label` | `Table tools` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `toolbar.reload` | `Reload` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `toolbar.search` | `Search` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `data-grid` | `toolbar.sort` | `Sort` | `@pdxui/ui/src/data-grid/grid-i18n.ts` |
| `date-picker` | `apply` | `Apply` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `cancel` | `Cancel` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `choose` | `Choose date` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `chooseTime` | `Choose time` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `clear` | `Clear` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `close` | `Close` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `compareToggle` | `Compare` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `done` | `Done` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `endDate` | `End date` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `nextMonth` | `Next month` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `placeholder` | `Select date` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `placeholderRange` | `Start — End` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `placeholderTime` | `Select time` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `prevMonth` | `Previous month` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `selectMonth` | `Select month` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `selectYear` | `Select year` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `startDate` | `Start date` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `today` | `Today` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `date-picker` | `weekNumber` | `W` | `@pdxui/ui/src/date-picker/pdx-date-picker.ts` |
| `dialog` | `close` | `Close dialog` | `@pdxui/ui/src/shared/i18n.ts` |
| `dialog` | `label` | `Dialog` | `@pdxui/ui/src/shared/i18n.ts` |
| `drawer` | `close` | `Close` | `@pdxui/ui/src/shared/i18n.ts` |
| `drawer` | `label` | `Drawer` | `@pdxui/ui/src/shared/i18n.ts` |
| `dropdown-menu` | `label` | `Menu` | `@pdxui/ui/src/shared/i18n.ts` |
| `edit-drawer` | `cancel` | `Cancel` | `@pdxui/ui/src/shared/i18n.ts` |
| `edit-drawer` | `edit` | `Edit` | `@pdxui/ui/src/shared/i18n.ts` |
| `edit-drawer` | `new` | `New` | `@pdxui/ui/src/shared/i18n.ts` |
| `edit-drawer` | `save` | `Save` | `@pdxui/ui/src/shared/i18n.ts` |
| `empty-state` | `title` | `No data` | `@pdxui/ui/src/shared/i18n.ts` |
| `entity-grid` | `actions` | `Actions` | `@pdxui/ui/src/shared/i18n.ts` |
| `entity-grid` | `add` | `New` | `@pdxui/ui/src/shared/i18n.ts` |
| `entity-grid` | `bulkDelete` | `Delete` | `@pdxui/ui/src/shared/i18n.ts` |
| `entity-grid` | `confirm` | `Delete` | `@pdxui/ui/src/shared/i18n.ts` |
| `entity-grid` | `confirmMany` | `{count, plural, one {Delete # record?} other {Delete # records?}}` | `@pdxui/ui/src/shared/i18n.ts` |
| `entity-grid` | `confirmOne` | `Delete {label}?` | `@pdxui/ui/src/shared/i18n.ts` |
| `entity-grid` | `delete` | `Delete {label}` | `@pdxui/ui/src/shared/i18n.ts` |
| `entity-grid` | `edit` | `Edit {label}` | `@pdxui/ui/src/shared/i18n.ts` |
| `error-boundary` | `maxRetries` | `Max retries reached` | `@pdxui/ui/src/shared/i18n.ts` |
| `error-boundary` | `message` | `Something went wrong.` | `@pdxui/ui/src/shared/i18n.ts` |
| `error-boundary` | `retry` | `Retry` | `@pdxui/ui/src/shared/i18n.ts` |
| `fab` | `label` | `Actions` | `@pdxui/ui/src/shared/i18n.ts` |
| `field-group` | `edit` | `Edit` | `@pdxui/ui/src/shared/i18n.ts` |
| `field-group` | `toggle` | `Show or hide section` | `@pdxui/ui/src/shared/i18n.ts` |
| `field-list` | `add` | `+ Add` | `@pdxui/ui/src/field-list/pdx-field-list.ts` |
| `field-list` | `addItem` | `Add Item` | `@pdxui/ui/src/field-list/pdx-field-list.ts` |
| `field-list` | `cellHint` | `Click to edit` | `@pdxui/ui/src/field-list/pdx-field-list.ts` |
| `field-list` | `done` | `Done` | `@pdxui/ui/src/field-list/pdx-field-list.ts` |
| `field-list` | `edit` | `Edit` | `@pdxui/ui/src/field-list/pdx-field-list.ts` |
| `field-list` | `editItem` | `Edit Item` | `@pdxui/ui/src/field-list/pdx-field-list.ts` |
| `field-list` | `editItemN` | `Edit Item #{n}` | `@pdxui/ui/src/field-list/pdx-field-list.ts` |
| `field-list` | `empty` | `No items` | `@pdxui/ui/src/field-list/pdx-field-list.ts` |
| `field-list` | `remove` | `Remove` | `@pdxui/ui/src/field-list/pdx-field-list.ts` |
| `fieldset` | `toggle` | `Show or hide section` | `@pdxui/ui/src/shared/i18n.ts` |
| `file-upload` | `drop` | `Drop files here or click to browse` | `@pdxui/ui/src/shared/i18n.ts` |
| `file-upload` | `maxSize` | `Max {size}` | `@pdxui/ui/src/shared/i18n.ts` |
| `file-upload` | `networkError` | `Network error` | `@pdxui/ui/src/shared/i18n.ts` |
| `file-upload` | `notAccepted` | `File type not accepted` | `@pdxui/ui/src/shared/i18n.ts` |
| `file-upload` | `rejected` | `{name}: {reason}` | `@pdxui/ui/src/shared/i18n.ts` |
| `file-upload` | `remove` | `Remove {name}` | `@pdxui/ui/src/shared/i18n.ts` |
| `file-upload` | `tooLarge` | `File too large (max {size})` | `@pdxui/ui/src/shared/i18n.ts` |
| `file-upload` | `tooMany` | `Too many files (max {n})` | `@pdxui/ui/src/shared/i18n.ts` |
| `file-upload` | `uploadFailed` | `Upload failed ({status})` | `@pdxui/ui/src/shared/i18n.ts` |
| `filter-builder` | `addFilter` | `+ Add Filter` | `@pdxui/ui/src/shared/i18n.ts` |
| `filter-builder` | `clearAll` | `Clear all` | `@pdxui/ui/src/shared/i18n.ts` |
| `filter-builder` | `dialog` | `Add filter` | `@pdxui/ui/src/shared/i18n.ts` |
| `filter-builder` | `editFilter` | `Edit filter: {filter}` | `@pdxui/ui/src/shared/i18n.ts` |
| `filter-builder` | `removeFilter` | `Remove filter: {filter}` | `@pdxui/ui/src/shared/i18n.ts` |
| `filter-builder` | `selectField` | `Select field...` | `@pdxui/ui/src/shared/i18n.ts` |
| `form-actions` | `reset` | `Reset` | `@pdxui/ui/src/form-actions/pdx-form-actions.ts` |
| `form-actions` | `submit` | `Submit` | `@pdxui/ui/src/form-actions/pdx-form-actions.ts` |
| `form-template` | `list.add` | `+ Add` | `@pdxui/ui/src/form-template/pdx-form-template.ts` |
| `form-template` | `list.cell` | `{label}, line {n}` | `@pdxui/ui/src/form-template/pdx-form-template.ts` |
| `form-template` | `list.empty` | `No items yet` | `@pdxui/ui/src/form-template/pdx-form-template.ts` |
| `form-template` | `list.remove` | `Remove` | `@pdxui/ui/src/form-template/pdx-form-template.ts` |
| `form-template` | `list.removeLine` | `Remove line {n}` | `@pdxui/ui/src/form-template/pdx-form-template.ts` |
| `form-template` | `steps` | `Form steps` | `@pdxui/ui/src/shared/i18n.ts` |
| `form-template` | `wizard.back` | `← Back` | `@pdxui/ui/src/form-template/pdx-form-template.ts` |
| `form-template` | `wizard.next` | `Next →` | `@pdxui/ui/src/form-template/pdx-form-template.ts` |
| `form-template` | `wizard.submit` | `Submit` | `@pdxui/ui/src/form-template/pdx-form-template.ts` |
| `image` | `close` | `Close` | `@pdxui/ui/src/shared/i18n.ts` |
| `image` | `image` | `image` | `@pdxui/ui/src/shared/i18n.ts` |
| `image` | `view` | `View {alt}` | `@pdxui/ui/src/shared/i18n.ts` |
| `image` | `zoom` | `Zoom {alt}` | `@pdxui/ui/src/shared/i18n.ts` |
| `infinite-scroll` | `end` | `No more data` | `@pdxui/ui/src/shared/i18n.ts` |
| `infinite-scroll` | `loading` | `Loading...` | `@pdxui/ui/src/shared/i18n.ts` |
| `inline-edit` | `cancel` | `Cancel` | `@pdxui/ui/src/inline-edit/pdx-inline-edit.ts` |
| `inline-edit` | `edit` | `Edit {value}` | `@pdxui/ui/src/inline-edit/pdx-inline-edit.ts` |
| `inline-edit` | `empty` | `Click to edit` | `@pdxui/ui/src/inline-edit/pdx-inline-edit.ts` |
| `inline-edit` | `label` | `Edit value` | `@pdxui/ui/src/inline-edit/pdx-inline-edit.ts` |
| `inline-edit` | `no` | `No` | `@pdxui/ui/src/inline-edit/pdx-inline-edit.ts` |
| `inline-edit` | `save` | `Save` | `@pdxui/ui/src/inline-edit/pdx-inline-edit.ts` |
| `inline-edit` | `yes` | `Yes` | `@pdxui/ui/src/inline-edit/pdx-inline-edit.ts` |
| `input` | `clear` | `Clear` | `@pdxui/ui/src/shared/i18n.ts` |
| `input` | `loading` | `Loading` | `@pdxui/ui/src/shared/i18n.ts` |
| `json-editor` | `addItem` | `＋ Add item` | `@pdxui/ui/src/shared/i18n.ts` |
| `json-editor` | `apply` | `Apply` | `@pdxui/ui/src/shared/i18n.ts` |
| `json-editor` | `cancel` | `Cancel` | `@pdxui/ui/src/shared/i18n.ts` |
| `json-editor` | `edit` | `Edit…` | `@pdxui/ui/src/shared/i18n.ts` |
| `json-editor` | `empty` | `No items — use "＋ Add item" below.` | `@pdxui/ui/src/shared/i18n.ts` |
| `json-editor` | `removeItem` | `Remove item {n}` | `@pdxui/ui/src/shared/i18n.ts` |
| `list` | `empty` | `No items` | `@pdxui/ui/src/shared/i18n.ts` |
| `mention` | `label` | `Mentions` | `@pdxui/ui/src/shared/i18n.ts` |
| `mention` | `loading` | `Loading...` | `@pdxui/ui/src/mention/pdx-mention.ts` |
| `mention` | `noResults` | `No results` | `@pdxui/ui/src/mention/pdx-mention.ts` |
| `mention` | `placeholder` | `Type @ to mention someone` | `@pdxui/ui/src/mention/pdx-mention.ts` |
| `mention` | `suggestions` | `{n, plural, one {# suggestion} other {# suggestions}}` | `@pdxui/ui/src/mention/pdx-mention.ts` |
| `menubar` | `label` | `Menu` | `@pdxui/ui/src/shared/i18n.ts` |
| `nav-menu` | `badge` | `{label}, {badge} new` | `@pdxui/ui/src/shared/i18n.ts` |
| `nav-menu` | `label` | `Navigation` | `@pdxui/ui/src/shared/i18n.ts` |
| `navbar` | `mainNav` | `Main navigation` | `@pdxui/ui/src/shared/i18n.ts` |
| `navbar` | `toggle` | `Toggle menu` | `@pdxui/ui/src/shared/i18n.ts` |
| `number-input` | `caretHint` | `The arrow keys change the digit before the cursor` | `@pdxui/ui/src/shared/i18n.ts` |
| `number-input` | `decrease` | `Decrease` | `@pdxui/ui/src/shared/i18n.ts` |
| `number-input` | `increase` | `Increase` | `@pdxui/ui/src/shared/i18n.ts` |
| `number-input` | `negative` | `Negative` | `@pdxui/ui/src/shared/i18n.ts` |
| `otp-input` | `digit` | `Digit {n} of {total}` | `@pdxui/ui/src/shared/i18n.ts` |
| `otp-input` | `label` | `Verification code` | `@pdxui/ui/src/shared/i18n.ts` |
| `overlay` | `close` | `Close` | `@pdxui/ui/src/shared/i18n.ts` |
| `overlay` | `ok` | `OK` | `@pdxui/ui/src/shared/i18n.ts` |
| `page-header` | `breadcrumb` | `Breadcrumb` | `@pdxui/ui/src/shared/i18n.ts` |
| `pagination` | `first` | `First page` | `@pdxui/ui/src/shared/i18n.ts` |
| `pagination` | `label` | `Pagination` | `@pdxui/ui/src/shared/i18n.ts` |
| `pagination` | `last` | `Last page` | `@pdxui/ui/src/shared/i18n.ts` |
| `pagination` | `next` | `Next page` | `@pdxui/ui/src/shared/i18n.ts` |
| `pagination` | `none` | `0 of 0` | `@pdxui/ui/src/shared/i18n.ts` |
| `pagination` | `page` | `Page {n}` | `@pdxui/ui/src/shared/i18n.ts` |
| `pagination` | `pageSize` | `Rows per page` | `@pdxui/ui/src/shared/i18n.ts` |
| `pagination` | `previous` | `Previous page` | `@pdxui/ui/src/shared/i18n.ts` |
| `pagination` | `range` | `{from}–{to} of {total}` | `@pdxui/ui/src/shared/i18n.ts` |
| `password-input` | `fair` | `Fair` | `@pdxui/ui/src/shared/i18n.ts` |
| `password-input` | `good` | `Good` | `@pdxui/ui/src/shared/i18n.ts` |
| `password-input` | `hide` | `Hide password` | `@pdxui/ui/src/shared/i18n.ts` |
| `password-input` | `show` | `Show password` | `@pdxui/ui/src/shared/i18n.ts` |
| `password-input` | `strong` | `Strong` | `@pdxui/ui/src/shared/i18n.ts` |
| `password-input` | `weak` | `Weak` | `@pdxui/ui/src/shared/i18n.ts` |
| `pin-input` | `label` | `PIN` | `@pdxui/ui/src/shared/i18n.ts` |
| `popover` | `label` | `Popover` | `@pdxui/ui/src/shared/i18n.ts` |
| `progress` | `label` | `Progress` | `@pdxui/ui/src/shared/i18n.ts` |
| `rating` | `label` | `Rating` | `@pdxui/ui/src/shared/i18n.ts` |
| `relation-picker` | `add` | `Add selected` | `@pdxui/ui/src/shared/i18n.ts` |
| `relation-picker` | `selected` | `{n} selected` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `alignCenter` | `Align center` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `alignFull` | `Align full` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `alignLeft` | `Align left` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `alignRight` | `Align right` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `bold` | `Bold` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `bulletList` | `Bullet list` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `code` | `Code` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `codeblock` | `Code block` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `heading` | `Heading` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `heading1` | `Heading 1` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `heading2` | `Heading 2` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `heading3` | `Heading 3` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `highlight` | `Highlight` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `hr` | `Horizontal rule` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `image` | `Insert image` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `imageAlt` | `Alt text:` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `imageUrl` | `Image URL:` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `italic` | `Italic` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `label` | `Rich text editor` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `link` | `Link` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `linkUrl` | `Link URL:` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `list` | `List` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `orderedList` | `Ordered list` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `quote` | `Blockquote` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `redo` | `Redo` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `removeImage` | `Remove image` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `source` | `View HTML source` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `strike` | `Strikethrough` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `taskList` | `Task list` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `toolbar` | `Text formatting` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `underline` | `Underline` | `@pdxui/ui/src/shared/i18n.ts` |
| `rich-text` | `undo` | `Undo` | `@pdxui/ui/src/shared/i18n.ts` |
| `router` | `backHome` | `← Back to home` | `@pdxui/router/src/outlet.ts` |
| `router` | `error` | `Error {code}` | `@pdxui/router/src/outlet.ts` |
| `router` | `loadFailed` | `Failed to load page: {message}` | `@pdxui/router/src/outlet.ts` |
| `router` | `loading` | `Loading...` | `@pdxui/router/src/outlet.ts` |
| `router` | `notFound` | `Page not found` | `@pdxui/router/src/outlet.ts` |
| `search-input` | `clear` | `Clear search` | `@pdxui/ui/src/shared/i18n.ts` |
| `search-input` | `placeholder` | `Search...` | `@pdxui/ui/src/shared/i18n.ts` |
| `search-input` | `searching` | `Searching` | `@pdxui/ui/src/shared/i18n.ts` |
| `select` | `clear` | `Clear` | `@pdxui/ui/src/shared/i18n.ts` |
| `select` | `create` | `Create "{query}"` | `@pdxui/ui/src/shared/i18n.ts` |
| `select` | `listbox` | `Options` | `@pdxui/ui/src/shared/i18n.ts` |
| `select` | `loading` | `Loading` | `@pdxui/ui/src/shared/i18n.ts` |
| `select` | `noResults` | `No results` | `@pdxui/ui/src/shared/i18n.ts` |
| `select` | `optionsAvailable` | `{n} options available` | `@pdxui/ui/src/shared/i18n.ts` |
| `select` | `remove` | `Remove {label}` | `@pdxui/ui/src/shared/i18n.ts` |
| `select` | `search` | `Search...` | `@pdxui/ui/src/shared/i18n.ts` |
| `select` | `selected` | `{n} selected` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `addCondition` | `+ Add condition` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `and` | `AND` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `apply` | `Apply` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `clear` | `Clear` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `columns` | `Columns` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `date` | `Date...` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `from` | `From…` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `loading` | `Loading…` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `noMatches` | `No matches` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `or` | `OR` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `removeCondition` | `- Remove condition` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `search` | `Search…` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `select` | `Select…` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `selectAll` | `Select all` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `to` | `To…` | `@pdxui/ui/src/shared/i18n.ts` |
| `shared` | `value` | `Value...` | `@pdxui/ui/src/shared/i18n.ts` |
| `sidebar` | `label` | `Sidebar` | `@pdxui/ui/src/shared/i18n.ts` |
| `slider` | `maximum` | `Maximum` | `@pdxui/ui/src/shared/i18n.ts` |
| `slider` | `maximumOf` | `{label}, maximum` | `@pdxui/ui/src/shared/i18n.ts` |
| `slider` | `minimum` | `Minimum` | `@pdxui/ui/src/shared/i18n.ts` |
| `slider` | `minimumOf` | `{label}, minimum` | `@pdxui/ui/src/shared/i18n.ts` |
| `slider` | `value` | `Value` | `@pdxui/ui/src/shared/i18n.ts` |
| `sortable-list` | `cancelled` | `Reorder cancelled.` | `@pdxui/ui/src/shared/i18n.ts` |
| `sortable-list` | `draggable` | `draggable` | `@pdxui/ui/src/shared/i18n.ts` |
| `sortable-list` | `dropped` | `{label} dropped.` | `@pdxui/ui/src/shared/i18n.ts` |
| `sortable-list` | `instructions` | `Press Space or Enter to lift the item, the arrow keys to move it, Space or Enter to drop it, and Escape to cancel.` | `@pdxui/ui/src/shared/i18n.ts` |
| `sortable-list` | `lifted` | `{label} lifted.` | `@pdxui/ui/src/shared/i18n.ts` |
| `sortable-list` | `position` | `Position {position} of {total}.` | `@pdxui/ui/src/shared/i18n.ts` |
| `sortable-list` | `reorder` | `Reorder {label}` | `@pdxui/ui/src/shared/i18n.ts` |
| `sparkline` | `empty` | `No data` | `@pdxui/ui/src/shared/i18n.ts` |
| `sparkline` | `separator` | `, ` | `@pdxui/ui/src/shared/i18n.ts` |
| `sparkline` | `summary` | `Trend: {values}, last {last}` | `@pdxui/ui/src/shared/i18n.ts` |
| `sparkline` | `summaryLong` | `Trend of {n} values from {first} to {last}, low {min}, high {max}` | `@pdxui/ui/src/shared/i18n.ts` |
| `spinner` | `loading` | `Loading` | `@pdxui/ui/src/shared/i18n.ts` |
| `split-button` | `menu` | `More actions` | `@pdxui/ui/src/shared/i18n.ts` |
| `splitter` | `label` | `Resize panels` | `@pdxui/ui/src/shared/i18n.ts` |
| `switch` | `label` | `Toggle` | `@pdxui/ui/src/shared/i18n.ts` |
| `tag-input` | `add` | `Add tag` | `@pdxui/ui/src/shared/i18n.ts` |
| `tag-input` | `added` | `{tag} added` | `@pdxui/ui/src/shared/i18n.ts` |
| `tag-input` | `label` | `Tag input` | `@pdxui/ui/src/shared/i18n.ts` |
| `tag-input` | `remove` | `Remove {tag}` | `@pdxui/ui/src/shared/i18n.ts` |
| `tag-input` | `removed` | `{tag} removed` | `@pdxui/ui/src/shared/i18n.ts` |
| `time-picker` | `decrement` | `Decrement` | `@pdxui/ui/src/time-picker/pdx-time-picker.ts` |
| `time-picker` | `empty` | `No time` | `@pdxui/ui/src/time-picker/pdx-time-picker.ts` |
| `time-picker` | `hour` | `Hour` | `@pdxui/ui/src/time-picker/pdx-time-picker.ts` |
| `time-picker` | `increment` | `Increment` | `@pdxui/ui/src/time-picker/pdx-time-picker.ts` |
| `time-picker` | `label` | `Time picker` | `@pdxui/ui/src/time-picker/pdx-time-picker.ts` |
| `time-picker` | `minute` | `Minute` | `@pdxui/ui/src/time-picker/pdx-time-picker.ts` |
| `time-picker` | `period` | `AM/PM` | `@pdxui/ui/src/time-picker/pdx-time-picker.ts` |
| `time-picker` | `second` | `Second` | `@pdxui/ui/src/time-picker/pdx-time-picker.ts` |
| `timeline` | `error` | `error` | `@pdxui/ui/src/shared/i18n.ts` |
| `timeline` | `info` | `info` | `@pdxui/ui/src/shared/i18n.ts` |
| `timeline` | `pending` | `In progress...` | `@pdxui/ui/src/shared/i18n.ts` |
| `timeline` | `success` | `success` | `@pdxui/ui/src/shared/i18n.ts` |
| `timeline` | `warning` | `warning` | `@pdxui/ui/src/shared/i18n.ts` |
| `toast` | `dismiss` | `Dismiss` | `@pdxui/ui/src/shared/i18n.ts` |
| `toolbar` | `label` | `Toolbar` | `@pdxui/ui/src/shared/i18n.ts` |
| `transfer` | `label` | `Transfer` | `@pdxui/ui/src/shared/i18n.ts` |
| `transfer` | `moveAllLeft` | `Move all to source` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `transfer` | `moveAllRight` | `Move all to target` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `transfer` | `moveLeft` | `Move to source` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `transfer` | `moveRight` | `Move to target` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `transfer` | `noData` | `No data` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `transfer` | `noMatch` | `No match` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `transfer` | `search` | `Search` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `transfer` | `searchIn` | `Search {list}` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `transfer` | `selectAll` | `Select all` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `transfer` | `source` | `Source` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `transfer` | `target` | `Target` | `@pdxui/ui/src/transfer/pdx-transfer.ts` |
| `tree-select` | `noData` | `No data` | `@pdxui/ui/src/tree-select/pdx-tree-select.ts` |
| `tree-select` | `noMatch` | `No match` | `@pdxui/ui/src/tree-select/pdx-tree-select.ts` |
| `tree-select` | `placeholder` | `Select...` | `@pdxui/ui/src/tree-select/pdx-tree-select.ts` |
| `tree-select` | `search` | `Search...` | `@pdxui/ui/src/tree-select/pdx-tree-select.ts` |
| `wizard` | `back` | `Back` | `@pdxui/ui/src/wizard/pdx-wizard.ts` |
| `wizard` | `complete` | `Complete` | `@pdxui/ui/src/wizard/pdx-wizard.ts` |
| `wizard` | `navigation` | `Wizard navigation` | `@pdxui/ui/src/shared/i18n.ts` |
| `wizard` | `next` | `Next` | `@pdxui/ui/src/wizard/pdx-wizard.ts` |
| `wizard` | `stepAnnounce` | `Step {current} of {total}: {label}` | `@pdxui/ui/src/shared/i18n.ts` |
| `wizard` | `stepOf` | `Step {current} of {total}` | `@pdxui/ui/src/wizard/pdx-wizard.ts` |
| `wizard` | `steps` | `Wizard steps` | `@pdxui/ui/src/shared/i18n.ts` |

// The pilot's filter popover (#137): its types, in a module, as pilot/select-types.ts explains (#675).
export type { FilterFieldInfo as Field, FilterConditionState as State, OperatorOption } from '../src/shared/filter-popover';

/** A row of the value list: an option, the line under the pinned selection, or the empty message. */
export interface EnumRow { key: string; kind: 'option' | 'sep' | 'empty'; value: string; label: string }

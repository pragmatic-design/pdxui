// The pilot's filter popover (#137): its types, in a module. They were put here when the signal rewrite
// renamed a type member that shares a prop's name (#675, since fixed); the select now declares its own.
export type { FilterFieldInfo as Field, FilterConditionState as State, OperatorOption } from '../src/shared/filter-popover';

/** A row of the value list: an option, the line under the pinned selection, or the empty message. */
export interface EnumRow { key: string; kind: 'option' | 'sep' | 'empty'; value: string; label: string }

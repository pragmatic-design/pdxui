// The pilot's pdx-select (#137): its types, in a module. In the .pdx script the signal rewrite renames
// a member of a type literal or interface that shares a prop's name (`{ source?: … }` becomes
// `{ source()?: … }`), and the type erasure then gives up on the whole module (packages/ui/PILOT.md,
// finding 6).
import type { DataSource } from '@pdxui/core';

/** A `<pdx-data-source>` element given as the select's source. */
export interface SourceElement { source(): DataSource<Record<string, unknown>> }

/** An option as the select holds it, whatever shape the caller's options had. */
export interface Option { label: string; value: unknown; _raw: unknown }

/** The function props that draw an option or the selected value. */
export type Template = (item: { label: string; value: unknown; raw: unknown; index?: number }) => string | Node;

/** A row of the list: a group header, or an option at its keyboard index. */
export interface Row { key: string; header: boolean; name: string; item: Option; index: number; style: string }

// ── Position Mapping ──────────────────────────────────────────────
// Maps positions through document changes. Essential for:
// - Updating selection after edits
// - Mapping decorations through changes
// - Collaborative editing (rebasing operations)

import type { MapDir, Pos } from '../model/types.js';

/** A single range replacement: [from, to] replaced with content of `size` */
export interface MapRange {
  readonly from: Pos;
  readonly to: Pos;
  readonly size: number;  // size of replacement content
}

/** Maps positions through a series of range replacements */
export class Mapping {
  private ranges: MapRange[] = [];

  /** Record a replacement */
  addRange(from: Pos, to: Pos, size: number): void {
    this.ranges.push({ from, to, size });
  }

  /** Map a position through all recorded changes.
   *  `bias`: -1 maps to before insertion, 1 maps to after insertion */
  map(pos: Pos, bias: MapDir = 1): Pos {
    let result = pos;
    for (const range of this.ranges) {
      result = mapThrough(result, range, bias);
    }
    return result;
  }

  /** Map a position, returning both the new position and whether it was deleted */
  mapResult(pos: Pos, bias: MapDir = 1): { pos: Pos; deleted: boolean } {
    let result = pos;
    let deleted = false;
    for (const range of this.ranges) {
      if (result > range.from && result < range.to) deleted = true;
      result = mapThrough(result, range, bias);
    }
    return { pos: result, deleted };
  }

  /** Compose with another mapping */
  compose(other: Mapping): Mapping {
    const result = new Mapping();
    result.ranges = [...this.ranges, ...other.ranges];
    return result;
  }

  /** Invert this mapping */
  invert(): Mapping {
    const result = new Mapping();
    for (const range of this.ranges) {
      result.ranges.push({
        from: range.from,
        to: range.from + range.size,
        size: range.to - range.from,
      });
    }
    return result;
  }

  get empty(): boolean {
    return this.ranges.length === 0;
  }
}

function mapThrough(pos: Pos, range: MapRange, bias: MapDir): Pos {
  const { from, to, size } = range;
  const oldSize = to - from;
  const diff = size - oldSize;

  if (pos < from) return pos;                // before change
  if (pos > to) return pos + diff;           // after change
  // Inside the changed range
  if (pos === from) return bias < 0 ? from : from + size;
  if (pos === to) return bias < 0 ? from : from + size;
  // Strictly inside deleted range — map to boundary
  return bias < 0 ? from : from + size;
}

/** Create a mapping from a single replacement */
export function mappingFromReplace(from: Pos, to: Pos, size: number): Mapping {
  const m = new Mapping();
  m.addRange(from, to, size);
  return m;
}

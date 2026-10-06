// ── Pure Decorations ──────────────────────────────────────────────
// Decorations add visual effects WITHOUT mutating the document model.
// Used for: search highlights, remote cursors, spell check underlines,
// AI suggestions, error markers.

import type { Pos } from '../model/types.js';

export type DecorationType = 'inline' | 'widget' | 'node';

/** An inline decoration: adds CSS classes/styles to a text range */
export interface InlineDecoration {
  readonly type: 'inline';
  readonly from: Pos;
  readonly to: Pos;
  readonly attrs: Record<string, string>; // class, style, data-* attributes
}

/** A widget decoration: inserts a DOM element at a position */
export interface WidgetDecoration {
  readonly type: 'widget';
  readonly pos: Pos;
  readonly from: Pos;
  readonly to: Pos;
  readonly widget: () => HTMLElement;
  readonly side: -1 | 1; // -1 = before pos, 1 = after pos
}

/** A node decoration: adds attrs to a node's DOM wrapper */
export interface NodeDecoration {
  readonly type: 'node';
  readonly from: Pos;
  readonly to: Pos;
  readonly attrs: Record<string, string>;
}

export type Decoration = InlineDecoration | WidgetDecoration | NodeDecoration;

/** A set of decorations, sorted by position */
export class DecorationSet {
  private decorations: Decoration[];

  constructor(decorations: Decoration[] = []) {
    this.decorations = decorations.sort((a, b) => a.from - b.from);
  }

  static empty = new DecorationSet([]);

  static create(decorations: Decoration[]): DecorationSet {
    return new DecorationSet(decorations);
  }

  /** Get decorations that overlap a position range */
  find(from: Pos, to: Pos): Decoration[] {
    return this.decorations.filter(d => d.to > from && d.from < to);
  }

  /** Get all inline decorations affecting a range */
  findInline(from: Pos, to: Pos): InlineDecoration[] {
    return this.find(from, to).filter((d): d is InlineDecoration => d.type === 'inline');
  }

  /** Get widget decorations at a position */
  findWidgets(pos: Pos): WidgetDecoration[] {
    return this.decorations.filter(
      (d): d is WidgetDecoration => d.type === 'widget' && d.pos === pos,
    );
  }

  /** Get node decorations at a position */
  findNode(from: Pos, to: Pos): NodeDecoration[] {
    return this.find(from, to).filter((d): d is NodeDecoration => d.type === 'node');
  }

  /** Add decorations */
  add(decorations: Decoration[]): DecorationSet {
    return new DecorationSet([...this.decorations, ...decorations]);
  }

  /** Remove decorations matching a predicate */
  remove(predicate: (d: Decoration) => boolean): DecorationSet {
    return new DecorationSet(this.decorations.filter(d => !predicate(d)));
  }

  /** Map decorations through position changes */
  map(mapFn: (pos: Pos) => Pos): DecorationSet {
    return new DecorationSet(
      this.decorations.map(d => ({
        ...d,
        from: mapFn(d.from),
        to: mapFn(d.to),
        ...(d.type === 'widget' ? { pos: mapFn((d as WidgetDecoration).pos) } : {}),
      })).filter(d => d.from < d.to || d.type === 'widget'),
    );
  }

  get size(): number { return this.decorations.length; }
  get empty(): boolean { return this.decorations.length === 0; }

  [Symbol.iterator](): Iterator<Decoration> {
    return this.decorations[Symbol.iterator]();
  }
}

// ── Decoration Factories ──────────────────────────────────────────

export function inlineDecoration(from: Pos, to: Pos, attrs: Record<string, string>): InlineDecoration {
  return { type: 'inline', from, to, attrs };
}

export function widgetDecoration(pos: Pos, widget: () => HTMLElement, side: -1 | 1 = 1): WidgetDecoration {
  return { type: 'widget', pos, from: pos, to: pos, widget, side };
}

export function nodeDecoration(from: Pos, to: Pos, attrs: Record<string, string>): NodeDecoration {
  return { type: 'node', from, to, attrs };
}

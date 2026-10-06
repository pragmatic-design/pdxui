// ── Table Cell Selection ──────────────────────────────────────────
// Multi-cell selection via CSS overlay (not DOM selection).
// Click + drag to select cells, Shift+click to extend.

export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export class TableSelection {
  private selecting = false;
  private range: CellRange | null = null;
  private tableEl: HTMLElement;
  private onSelectionChange?: (range: CellRange | null) => void;

  constructor(tableEl: HTMLElement, onChange?: (range: CellRange | null) => void) {
    this.tableEl = tableEl;
    this.onSelectionChange = onChange;
    this.setup();
  }

  private setup(): void {
    this.tableEl.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  get selectedRange(): CellRange | null { return this.range; }

  private onMouseDown = (e: MouseEvent): void => {
    const cell = this.getCellFromEvent(e);
    if (!cell) return;

    if (e.shiftKey && this.range) {
      // Extend selection
      this.range = normalizeRange({
        startRow: this.range.startRow,
        startCol: this.range.startCol,
        endRow: cell.row,
        endCol: cell.col,
      });
    } else {
      this.range = { startRow: cell.row, startCol: cell.col, endRow: cell.row, endCol: cell.col };
      this.selecting = true;
    }

    this.updateOverlay();
    this.onSelectionChange?.(this.range);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.selecting || !this.range) return;

    const cell = this.getCellFromEvent(e);
    if (!cell) return;

    this.range = normalizeRange({
      startRow: this.range.startRow,
      startCol: this.range.startCol,
      endRow: cell.row,
      endCol: cell.col,
    });

    this.updateOverlay();
    this.onSelectionChange?.(this.range);
  };

  private onMouseUp = (): void => {
    this.selecting = false;
  };

  private getCellFromEvent(e: MouseEvent): { row: number; col: number } | null {
    const target = (e.target as HTMLElement).closest('.pdx-rt-table-cell') as HTMLElement;
    if (!target || !this.tableEl.contains(target)) return null;

    const row = parseInt(target.dataset.row ?? '0');
    const col = parseInt(target.dataset.col ?? '0');
    return { row, col };
  }

  private updateOverlay(): void {
    if (!this.range) {
      this.removeOverlay();
      return;
    }

    // Single cell = no overlay needed
    const { startRow, startCol, endRow, endCol } = this.range;
    if (startRow === endRow && startCol === endCol) {
      this.removeOverlay();
      return;
    }

    // Highlight selected cells
    const cells = this.tableEl.querySelectorAll('.pdx-rt-table-cell');
    for (const cell of cells) {
      const r = parseInt((cell as HTMLElement).dataset.row ?? '-1');
      const c = parseInt((cell as HTMLElement).dataset.col ?? '-1');
      const selected = r >= startRow && r <= endRow && c >= startCol && c <= endCol;
      cell.classList.toggle('pdx-rt-cell-selected', selected);
    }
  }

  private removeOverlay(): void {
    const cells = this.tableEl.querySelectorAll('.pdx-rt-cell-selected');
    for (const cell of cells) cell.classList.remove('pdx-rt-cell-selected');
  }

  clear(): void {
    this.range = null;
    this.removeOverlay();
    this.onSelectionChange?.(null);
  }

  destroy(): void {
    this.tableEl.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    this.removeOverlay();
  }
}

function normalizeRange(r: CellRange): CellRange {
  return {
    startRow: Math.min(r.startRow, r.endRow),
    startCol: Math.min(r.startCol, r.endCol),
    endRow: Math.max(r.startRow, r.endRow),
    endCol: Math.max(r.startCol, r.endCol),
  };
}

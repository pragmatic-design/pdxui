// ── Table Column Resize ───────────────────────────────────────────
// Drag handles between columns to resize.
// Updates grid-template-columns on the CSS Grid container.

import type { TableModel } from './table-view.js';

export class TableResizer {
  private handles: HTMLElement[] = [];
  private dragging = false;
  private dragColIndex = -1;
  private startX = 0;
  private startWidths: number[] = [];
  private tableEl: HTMLElement;
  private model: TableModel;
  private onResize?: (colWidths: number[]) => void;

  constructor(tableEl: HTMLElement, model: TableModel, onResize?: (colWidths: number[]) => void) {
    this.tableEl = tableEl;
    this.model = model;
    this.onResize = onResize;
    this.createHandles();
  }

  private createHandles(): void {
    // Remove existing handles
    for (const h of this.handles) h.remove();
    this.handles = [];

    // Create a handle between each column
    for (let i = 0; i < this.model.cols - 1; i++) {
      const handle = document.createElement('div');
      handle.classList.add('pdx-rt-table-resize-handle');
      handle.dataset.col = String(i);
      handle.style.position = 'absolute';
      handle.style.width = '5px';
      handle.style.cursor = 'col-resize';
      handle.style.top = '0';
      handle.style.bottom = '0';
      handle.style.zIndex = '10';

      handle.addEventListener('mousedown', this.onMouseDown);
      this.tableEl.appendChild(handle);
      this.handles.push(handle);
    }

    this.positionHandles();
    // remove-then-add: update() calls createHandles() again, and the document listeners
    // would pile up on every update.
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  private positionHandles(): void {
    const tableRect = this.tableEl.getBoundingClientRect();
    let cumWidth = 0;

    for (let i = 0; i < this.handles.length; i++) {
      cumWidth += (this.model.colWidths[i] / 100) * tableRect.width;
      this.handles[i].style.left = `${cumWidth - 2.5}px`;
    }
  }

  private onMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    this.dragColIndex = parseInt(target.dataset.col ?? '-1');
    if (this.dragColIndex < 0) return;

    this.dragging = true;
    this.startX = e.clientX;
    this.startWidths = [...this.model.colWidths];
    target.classList.add('pdx-rt-resize-active');
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.dragging) return;
    e.preventDefault();

    const dx = e.clientX - this.startX;
    const tableWidth = this.tableEl.getBoundingClientRect().width;
    const pctDelta = (dx / tableWidth) * 100;

    const newWidths = [...this.startWidths];
    const minWidth = 5; // minimum 5%

    const leftW = this.startWidths[this.dragColIndex] + pctDelta;
    const rightW = this.startWidths[this.dragColIndex + 1] - pctDelta;

    if (leftW >= minWidth && rightW >= minWidth) {
      newWidths[this.dragColIndex] = leftW;
      newWidths[this.dragColIndex + 1] = rightW;
      this.model.colWidths = newWidths;
      this.tableEl.style.gridTemplateColumns = newWidths.map(w => `${w}%`).join(' ');
      this.positionHandles();
    }
  };

  private onMouseUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;

    for (const h of this.handles) h.classList.remove('pdx-rt-resize-active');
    this.onResize?.([...this.model.colWidths]);
  };

  update(model: TableModel): void {
    this.model = model;
    this.createHandles();
  }

  destroy(): void {
    for (const h of this.handles) h.remove();
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }
}

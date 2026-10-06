// ── Table View (CSS Grid) ─────────────────────────────────────────
// Modern table rendering using CSS Grid instead of <table> elements.
// Each cell is an independent mini contentEditable.
// This avoids ALL contentEditable + <table> bugs.

import type { DocNode } from '../model/types.js';
import { createNode, createText } from '../model/node.js';

export interface TableModel {
  rows: number;
  cols: number;
  cells: TableCell[][];
  colWidths: number[];  // percentage widths
}

export interface TableCell {
  content: DocNode[];
  header: boolean;
  colspan: number;
  rowspan: number;
}

// ── Create Table Model ────────────────────────────────────────

export function createTableModel(rows: number, cols: number): TableModel {
  const cells: TableCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: TableCell[] = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        content: [createNode('paragraph', {}, [createText('')])],
        header: r === 0,
        colspan: 1,
        rowspan: 1,
      });
    }
    cells.push(row);
  }
  return {
    rows,
    cols,
    cells,
    colWidths: Array(cols).fill(100 / cols),
  };
}

/** Convert a doc table node to TableModel */
export function tableNodeToModel(node: DocNode): TableModel {
  const rows = node.content.length;
  const cols = rows > 0 ? node.content[0].content.length : 0;
  const cells: TableCell[][] = [];

  for (const rowNode of node.content) {
    const row: TableCell[] = [];
    for (const cellNode of rowNode.content) {
      row.push({
        content: cellNode.content.length > 0 ? [...cellNode.content] : [createNode('paragraph', {}, [createText('')])],
        header: cellNode.attrs.header as boolean ?? false,
        colspan: cellNode.attrs.colspan as number ?? 1,
        rowspan: cellNode.attrs.rowspan as number ?? 1,
      });
    }
    cells.push(row);
  }

  return { rows, cols, cells, colWidths: Array(cols).fill(100 / cols) };
}

/** Convert TableModel back to doc node */
export function tableModelToNode(model: TableModel): DocNode {
  const rows: DocNode[] = [];
  for (const row of model.cells) {
    const cells: DocNode[] = [];
    for (const cell of row) {
      if (!cell) continue; // mergeCells leaves null in the absorbed positions
      cells.push(createNode('tableCell', {
        header: cell.header,
        colspan: cell.colspan,
        rowspan: cell.rowspan,
      }, cell.content));
    }
    rows.push(createNode('tableRow', {}, cells));
  }
  return createNode('table', {}, rows);
}

// ── Render Table to DOM (CSS Grid) ────────────────────────────

export function renderTable(model: TableModel): HTMLElement {
  const grid = document.createElement('div');
  grid.classList.add('pdx-rt-table');
  grid.setAttribute('role', 'table');

  // Grid template columns from widths
  grid.style.gridTemplateColumns = model.colWidths.map(w => `${w}%`).join(' ');

  for (let r = 0; r < model.rows; r++) {
    for (let c = 0; c < model.cols; c++) {
      const cell = model.cells[r][c];
      if (!cell) continue;

      const cellEl = document.createElement('div');
      cellEl.classList.add('pdx-rt-table-cell');
      cellEl.setAttribute('role', cell.header ? 'columnheader' : 'cell');
      cellEl.dataset.row = String(r);
      cellEl.dataset.col = String(c);

      if (cell.colspan > 1) cellEl.style.gridColumn = `span ${cell.colspan}`;
      if (cell.rowspan > 1) cellEl.style.gridRow = `span ${cell.rowspan}`;

      if (cell.header) cellEl.classList.add('pdx-rt-table-header');

      // Each cell gets its own mini contentEditable
      const editor = document.createElement('div');
      editor.classList.add('pdx-rt-table-cell-editor');
      editor.setAttribute('contenteditable', 'true');
      editor.setAttribute('role', 'textbox');

      // Render cell content
      for (const node of cell.content) {
        const p = document.createElement('p');
        const textContent = getTextFromNode(node);
        p.textContent = textContent || '\u200B';
        editor.appendChild(p);
      }

      cellEl.appendChild(editor);
      grid.appendChild(cellEl);
    }
  }

  return grid;
}

function getTextFromNode(node: DocNode): string {
  if (node.text !== undefined) return node.text;
  return node.content.map(getTextFromNode).join('');
}

// ── Table Operations ──────────────────────────────────────────

export function addRow(model: TableModel, afterIndex: number): TableModel {
  const newRow: TableCell[] = [];
  for (let c = 0; c < model.cols; c++) {
    newRow.push({
      content: [createNode('paragraph', {}, [createText('')])],
      header: false,
      colspan: 1,
      rowspan: 1,
    });
  }

  const cells = [...model.cells];
  cells.splice(afterIndex + 1, 0, newRow);

  return { ...model, rows: model.rows + 1, cells };
}

export function addColumn(model: TableModel, afterIndex: number): TableModel {
  const cells = model.cells.map((row, r) => {
    const newRow = [...row];
    newRow.splice(afterIndex + 1, 0, {
      content: [createNode('paragraph', {}, [createText('')])],
      header: r === 0 && row[0]?.header,
      colspan: 1,
      rowspan: 1,
    });
    return newRow;
  });

  const colWidths = [...model.colWidths];
  const newWidth = 100 / (model.cols + 1);
  colWidths.splice(afterIndex + 1, 0, newWidth);
  // Redistribute widths
  const total = colWidths.reduce((a, b) => a + b, 0);
  const normalized = colWidths.map(w => (w / total) * 100);

  return { ...model, cols: model.cols + 1, cells, colWidths: normalized };
}

export function removeRow(model: TableModel, index: number): TableModel {
  if (model.rows <= 1) return model;
  const cells = model.cells.filter((_, i) => i !== index);
  return { ...model, rows: model.rows - 1, cells };
}

export function removeColumn(model: TableModel, index: number): TableModel {
  if (model.cols <= 1) return model;
  const cells = model.cells.map(row => row.filter((_, i) => i !== index));
  const colWidths = model.colWidths.filter((_, i) => i !== index);
  const total = colWidths.reduce((a, b) => a + b, 0);
  const normalized = colWidths.map(w => (w / total) * 100);

  return { ...model, cols: model.cols - 1, cells, colWidths: normalized };
}

export function mergeCells(
  model: TableModel,
  startRow: number, startCol: number,
  endRow: number, endCol: number,
): TableModel {
  const cells = model.cells.map(row => [...row]);
  const merged = cells[startRow][startCol];
  merged.colspan = endCol - startCol + 1;
  merged.rowspan = endRow - startRow + 1;

  // Collect content from merged cells
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      if (r === startRow && c === startCol) continue;
      // Absorb content
      merged.content.push(...cells[r][c].content);
      // Mark as null (will be skipped in rendering)
      (cells[r] as any)[c] = null;
    }
  }

  return { ...model, cells };
}

export function splitCell(
  model: TableModel, row: number, col: number,
): TableModel {
  const cells = model.cells.map(r => [...r]);
  const cell = cells[row][col];
  const { colspan, rowspan } = cell;

  cell.colspan = 1;
  cell.rowspan = 1;

  // Fill in the previously merged cells
  for (let r = row; r < row + rowspan; r++) {
    for (let c = col; c < col + colspan; c++) {
      if (r === row && c === col) continue;
      cells[r][c] = {
        content: [createNode('paragraph', {}, [createText('')])],
        header: r === 0,
        colspan: 1,
        rowspan: 1,
      };
    }
  }

  return { ...model, cells };
}

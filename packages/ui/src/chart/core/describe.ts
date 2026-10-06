// What a chart says, in text: the data table behind it, a gauge's reading, one point's values.
// The canvas is opaque to assistive technology; pdx-chart renders these next to it.
// Pure functions of the chart's config, so they follow data changes and hidden series.

import type { ChartConfig } from './engine';
import { resolveFormatter } from './axis';
import { chartNumbers, type ChartNumbers } from './numbers';

export interface ChartDataTable {
    /** Column headers: the category, then one per visible series (or the record's fields). */
    columns: string[];
    /** One row per category (or record): its label, then each value, formatted. */
    rows: string[][];
}

/** The series the chart draws, by field and name, as buildSeries derives them. */
export function chartSeries(config: ChartConfig): { field: string; name: string }[] {
    const data = config.data ?? [];
    const xKey = config.xField || Object.keys(data[0] ?? {})[0];
    if (config.series?.length) return config.series.map(sc => ({ field: sc.field, name: sc.name || sc.field }));
    const keys = Array.isArray(config.yField) ? config.yField
        : config.yField ? [config.yField]
            : Object.keys(data[0] ?? {}).filter(k => k !== xKey && typeof data[0][k] === 'number');
    return keys.map((field, i) => ({ field, name: config.seriesNames?.[i] || field }));
}

function formatNumber(config: ChartConfig): (v: unknown) => string {
    const nf = chartNumbers(config.locale, config.currency);
    const fmt = resolveFormatter(config.yFormat, nf);
    return (v) => (typeof v === 'number' ? (fmt ? fmt(v) : nf.number(v)) : String(v ?? ''));
}

/**
 * The table a sighted reader reads off the chart: categories × visible series. Records without a
 * category/value shape (heatmap, candlestick) are listed field by field. A gauge has none: its name
 * carries its one value.
 */
export function chartDataTable(config: ChartConfig, hidden: ReadonlySet<string>, categoryHeader: string): ChartDataTable | null {
    const data = config.data ?? [];
    if (config.type === 'gauge' || data.length === 0) return null;
    const fmt = formatNumber(config);
    if (config.type === 'heatmap' || config.type === 'candlestick') {
        const columns = Object.keys(data[0]);
        return { columns, rows: data.map(r => columns.map(c => fmt(r[c]))) };
    }
    const xKey = config.xField || Object.keys(data[0])[0];
    // A pie's legend switches CATEGORIES off, not series: the rows go, as the slices do,
    // and a row's index stays the index of the slice the keyboard lands on.
    const isPie = config.type === 'pie' || config.type === 'doughnut';
    const series = isPie ? chartSeries(config) : chartSeries(config).filter(s => !hidden.has(s.name));
    const rows = isPie ? data.filter(r => !hidden.has(String(r[xKey] ?? ''))) : data;
    return {
        columns: [config.xAxisName || categoryHeader, ...series.map(s => s.name)],
        rows: rows.map(r => [String(r[xKey] ?? ''), ...series.map(s => fmt(r[s.field]))]),
    };
}

/** One point read aloud: "Q1: Desktop 4,500, Mobile 3,200". */
export function pointText(table: ChartDataTable, index: number): string {
    const row = table.rows[index];
    if (!row) return '';
    return `${row[0]}: ${row.slice(1).map((v, i) => `${table.columns[i + 1]} ${v}`).join(', ')}`;
}

/** A gauge's reading: the value as the gauge shows it ("72%"), and its range as numbers ("0", "100"). */
export function gaugeReading(
    value: number, min: number, max: number, template?: string, nf: ChartNumbers = chartNumbers(),
): { value: string; min: string; max: string } {
    return {
        value: template ? template.replace('{value}', nf.number(value)) : nf.number(value),
        min: nf.number(min),
        max: nf.number(max),
    };
}

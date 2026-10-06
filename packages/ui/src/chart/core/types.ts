// Chart core types — shared across all chart modules.

export interface ChartPadding {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface ChartArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DataPoint {
    /** Raw x value (category string, Date, or number). */
    x: unknown;
    /** Raw y value (number). */
    y: number;
    /** Original data record. */
    raw: Record<string, unknown>;
    /** Index in the dataset. */
    index: number;
}

export interface Series {
    name: string;
    data: DataPoint[];
    color: string;
    type?: string;
    /** Smooth line interpolation. */
    smooth?: boolean;
    /** Show area fill under line. */
    area?: boolean;
    /** Show data point markers. */
    markers?: boolean;
    /** Line dash pattern (e.g. [5, 3]). */
    dash?: number[];
}

export interface AxisConfig {
    type: 'category' | 'value' | 'time' | 'log';
    field?: string;
    name?: string;
    min?: number;
    max?: number;
    /** Computed categories (for category axis). */
    categories?: string[];
}

export interface TooltipInfo {
    /** Screen x. */
    x: number;
    /** Screen y. */
    y: number;
    /** Matched data points (one per series). */
    points: { series: Series; point: DataPoint; px: number; py: number }[];
    /** Category label (axis trigger). */
    label: string;
}

export interface ChartTheme {
    palette: string[];
    textColor: string;
    mutedColor: string;
    gridColor: string;
    bgColor: string;
    /** The inset surface (`--pdx-color-inset`): the low end of the heatmap's ramp. */
    insetColor?: string;
    fontFamily: string;
    fontSize: number;
}

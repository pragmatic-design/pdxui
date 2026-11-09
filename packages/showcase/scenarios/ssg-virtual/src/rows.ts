/** The list every route shows: 1000 rows, the same on the server and in the browser. */
export interface Row {
    id: number;
    label: string;
}

export const ROWS: Row[] = Array.from({ length: 1000 }, (_, i) => ({ id: i, label: `Row ${i + 1} of the long list` }));

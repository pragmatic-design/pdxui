// The demos of pdx-scheduler place their events in the current week, so the page always has
// something on screen: `at(1, '09:30')` is Tuesday of this week at 09:30, as a wall time.

function iso(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday of the current week, as an ISO date. */
export function monday(): string {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return iso(d);
}

/** The day `offset` days from this week's Monday: a date alone, or with a time, a wall time. */
export function at(offset: number, time?: string): string {
    const d = new Date(`${monday()}T12:00`);
    d.setDate(d.getDate() + offset);
    return time ? `${iso(d)}T${time}` : iso(d);
}

// What a failed showcase test was waiting through, when the answer was that nothing moved (#611).
//
// Twice in the full gate a test waited 5 s for a list that ran in 150 ms alone. The kept trace showed
// the whole page frozen for ~9 s right after an in-app navigation: no frame, no header, and the DOM
// snapshot itself 3 s late. It did not show WHY: a script that ran for 9 s, or a renderer the machine
// did not schedule. This records the three things that tell those apart, and attaches them to a
// failed test only:
//
// - `page.heartbeat`: gaps over GAP_MS in a 100 ms interval inside the page. The page's main thread
//   ran nothing at all for that long.
// - `page.longTasks`: the browser's own long tasks (≥ 50 ms). A gap covered by a long task of the same
//   length was the page's script; a gap with none was not.
// - `runner.heartbeat`: the same interval in the test's own process. A gap here as well means the
//   machine stalled every process, not the page.
//
// Kept in sessionStorage, so a full navigation inside the test does not lose what came before it.
// Times are epoch milliseconds, the clock of the trace's wall time.
import type { Page, TestInfo } from '@playwright/test';

const GAP_MS = 300;
const KEY = '__pdx_stall_probe';
const READ_TIMEOUT_MS = 5_000;

type PageRecord = { heartbeat: { at: number; gap: number }[]; longTasks: { at: number; duration: number; name: string }[] };

export interface StallRecord {
    /** What the page recorded, or why it could not be read — a page still frozen does not answer. */
    page: PageRecord | { unreadable: string };
    runner: { heartbeat: { at: number; gap: number }[] };
}

export interface StallProbe {
    /** Stops recording in this process. */
    stop(): void;
    /** Reads the record; only a failed test pays for it. */
    read(): Promise<StallRecord>;
}

/** Starts recording on `page`, before its first navigation, and in this process. */
export async function startStallProbe(page: Page): Promise<StallProbe> {
    await page.addInitScript(({ key, gapMs }) => {
        const read = (): PageRecord => JSON.parse(sessionStorage.getItem(key) ?? '{"heartbeat":[],"longTasks":[]}') as PageRecord;
        const write = (add: (r: PageRecord) => void): void => { const r = read(); add(r); sessionStorage.setItem(key, JSON.stringify(r)); };
        let last = Date.now();
        setInterval(() => {
            const now = Date.now();
            if (now - last > gapMs) write((r) => r.heartbeat.push({ at: last, gap: now - last }));
            last = now;
        }, 100);
        new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
                write((r) => r.longTasks.push({ at: Math.round(performance.timeOrigin + e.startTime), duration: Math.round(e.duration), name: e.name }));
            }
        }).observe({ type: 'longtask', buffered: true });
    }, { key: KEY, gapMs: GAP_MS });

    const runner: StallRecord['runner'] = { heartbeat: [] };
    let last = Date.now();
    const timer = setInterval(() => {
        const now = Date.now();
        if (now - last > GAP_MS) runner.heartbeat.push({ at: last, gap: now - last });
        last = now;
    }, 100);

    return {
        stop: () => clearInterval(timer),
        async read() {
            if (page.isClosed()) return { page: { unreadable: 'the page was closed' }, runner };
            const fromPage = page.evaluate((key) => sessionStorage.getItem(key), KEY)
                .then((raw): StallRecord['page'] => raw ? JSON.parse(raw) as PageRecord : { unreadable: 'nothing recorded: no navigation ran the init script' })
                .catch((e: unknown): StallRecord['page'] => ({ unreadable: `evaluate failed: ${String(e)}` }));
            const late = new Promise<StallRecord['page']>((resolve) => {
                setTimeout(() => resolve({ unreadable: `no answer in ${READ_TIMEOUT_MS} ms: the page was still frozen` }), READ_TIMEOUT_MS).unref();
            });
            return { page: await Promise.race([fromPage, late]), runner };
        },
    };
}

/** Attaches the record to a test that did not end as expected; a passing test attaches nothing. */
export async function attachStallRecord(testInfo: TestInfo, probe: StallProbe): Promise<void> {
    probe.stop();
    if (testInfo.status === testInfo.expectedStatus) return;
    const record = await probe.read();
    await testInfo.attach('stall-probe.json', { body: JSON.stringify({ gapMs: GAP_MS, ...record }, null, 2), contentType: 'application/json' });
}

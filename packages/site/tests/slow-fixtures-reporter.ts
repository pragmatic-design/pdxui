// A failed site test records its slow fixtures (#758).
//
// A test that failed after 26.6 s spent creating its page said so only in its trace. For a failed
// test, every fixture over 5 s is written to `slow-fixtures.txt` in the run's output folder, which
// the global teardown keeps (keep-failures.ts): the next occurrence says whether it was the page again.

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FullConfig, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';

export const SLOW_FIXTURE_MS = 5_000;

/** The fixture steps under `steps`, at any depth, that took longer than `threshold`. */
export function slowFixtures(steps: readonly TestStep[], threshold = SLOW_FIXTURE_MS): { title: string; duration: number }[] {
    const slow: { title: string; duration: number }[] = [];
    const walk = (list: readonly TestStep[]) => {
        for (const step of list) {
            if (step.category === 'fixture' && step.duration > threshold) slow.push({ title: step.title, duration: step.duration });
            walk(step.steps);
        }
    };
    walk(steps);
    return slow;
}

export default class SlowFixturesReporter implements Reporter {
    private outputDir = '';

    onBegin(config: FullConfig): void {
        this.outputDir = config.projects[0]?.outputDir ?? '';
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        if (result.status === test.expectedStatus || !this.outputDir) return;
        const slow = slowFixtures(result.steps);
        if (slow.length === 0) return;
        const lines = slow.map((f) => `${test.titlePath().join(' › ')}\t${f.title}\t${f.duration} ms\n`).join('');
        mkdirSync(this.outputDir, { recursive: true });
        appendFileSync(join(this.outputDir, 'slow-fixtures.txt'), lines);
    }
}

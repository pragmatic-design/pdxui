// Benchmark measurement utilities.
// Run via: npx vitest run benchmarks/core-bench.test.ts

export function measure(label: string, fn: () => void): number {
    // Warm up
    fn();

    // Measure best of 5 runs
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
    }

    const best = Math.min(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`  ⏱ ${label}: best=${best.toFixed(2)}ms avg=${avg.toFixed(2)}ms`);
    return best;
}

export function measureAsync(label: string, fn: () => Promise<void>): Promise<number> {
    return fn().then(async () => {
        const times: number[] = [];
        for (let i = 0; i < 5; i++) {
            const start = performance.now();
            await fn();
            times.push(performance.now() - start);
        }
        const best = Math.min(...times);
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        console.log(`  ⏱ ${label}: best=${best.toFixed(2)}ms avg=${avg.toFixed(2)}ms`);
        return best;
    });
}

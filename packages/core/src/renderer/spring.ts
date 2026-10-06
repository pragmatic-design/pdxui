// Spring Physics Easing — generates CSS linear() easing from spring simulation.
// Produces natural, organic motion without manual bezier tuning.

/** Spring configuration. */
export interface SpringConfig {
    /** Spring stiffness (default: 300). Higher = snappier. */
    stiffness?: number;
    /** Damping ratio (default: 20). Higher = less bounce. */
    damping?: number;
    /** Mass (default: 1). Higher = more inertia. */
    mass?: number;
    /** Simulation precision — number of sample points (default: 50). */
    precision?: number;
}

/**
 * Generate a CSS `linear()` easing string that approximates spring physics.
 * Uses CSS `linear()` (Baseline 2024) with sampled spring simulation.
 *
 * Usage:
 *   const ease = spring({ stiffness: 300, damping: 20 });
 *   element.style.transitionTimingFunction = ease;
 *   // → "linear(0, 0.042, 0.158, 0.336, ...)"
 *
 * @returns CSS easing string for use in transition-timing-function
 */
export function spring(config?: SpringConfig): string {
    const stiffness = config?.stiffness ?? 300;
    const damping = config?.damping ?? 20;
    const mass = config?.mass ?? 1;
    const steps = config?.precision ?? 50;

    const points = simulateSpring(stiffness, damping, mass, steps);
    const rounded = points.map(v => Math.round(v * 1000) / 1000);

    return `linear(${rounded.join(', ')})`;
}

/**
 * Simulate a spring from 0→1 and return sampled values.
 * Uses velocity Verlet integration for stability.
 */
function simulateSpring(
    stiffness: number,
    damping: number,
    mass: number,
    steps: number
): number[] {
    // Find the duration where the spring settles (within 0.001 of target)
    const dt = 1 / 60; // 60fps simulation
    const target = 1;
    let settleTime = 0;

    // Pre-simulate to find settle time
    let simX = 0;
    let simV = 0;
    for (let t = 0; t < 10; t += dt) {
        const force = -stiffness * (simX - target) - damping * simV;
        const acceleration = force / mass;
        simV += acceleration * dt;
        simX += simV * dt;

        if (Math.abs(simX - target) < 0.001 && Math.abs(simV) < 0.001) {
            settleTime = t;
            break;
        }
        settleTime = t;
    }

    // Sample at evenly spaced points
    const totalTime = settleTime || 1;
    const sampleDt = totalTime / steps;
    const points: number[] = [0]; // start at 0

    let x = 0;  // displacement (re-simulated from the start for sampling)
    let v = 0;  // velocity
    let time = 0;
    let nextSample = sampleDt;

    while (time < totalTime) {
        const force = -stiffness * (x - target) - damping * v;
        const acceleration = force / mass;
        v += acceleration * dt;
        x += v * dt;
        time += dt;

        if (time >= nextSample) {
            points.push(Math.min(Math.max(x, 0), 1.5)); // clamp for safety
            nextSample += sampleDt;
        }
    }

    // Ensure we end at exactly 1
    points.push(1);
    return points;
}

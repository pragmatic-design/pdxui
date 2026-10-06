// Keyframe Animations — multi-step animations via Web Animations API.
// For when CSS transitions (2-state) are not enough.

/** Configuration for a named keyframe animation. */
export interface AnimationConfig {
    name: string;
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
}

/**
 * Define a reusable keyframe animation.
 *
 * Usage:
 *   const bounce = keyframes('bounce', [
 *     { offset: 0, transform: 'translateY(0)' },
 *     { offset: 0.5, transform: 'translateY(-20px)' },
 *     { offset: 1, transform: 'translateY(0)' },
 *   ], { duration: 500, easing: 'ease-out' });
 */
export function keyframes(
    name: string,
    frames: Keyframe[],
    options?: KeyframeAnimationOptions
): AnimationConfig {
    return {
        name,
        keyframes: frames,
        options: { duration: 300, easing: 'ease', fill: 'forwards', ...options },
    };
}

/**
 * Play a keyframe animation on an element. Returns a Promise.
 * Used by enter()/exit() when they receive an AnimationConfig instead of a string.
 */
export function playKeyframes(el: HTMLElement, config: AnimationConfig): Promise<void> {
    if (typeof el.animate !== 'function') return Promise.resolve();

    return new Promise(resolve => {
        const anim = el.animate(config.keyframes, config.options);
        anim.onfinish = () => resolve();
        anim.oncancel = () => resolve();
    });
}

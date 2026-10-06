// Edit distance, for the did-you-mean of a misspelt prop or tag.

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[a.length][b.length];
}

/**
 * The one candidate within `max` edits of `word`, or undefined when there is none or more than one
 * at the nearest distance: a fix rewrites text, and with two equally near answers it would guess.
 */
export function onlyNear(word: string, candidates: Iterable<string>, max: number, key: (s: string) => string = (s) => s): string | undefined {
    let best: string | undefined;
    let bestDist = Infinity;
    let tie = false;
    const w = key(word);
    for (const c of candidates) {
        const d = levenshtein(w, key(c));
        if (d < bestDist) { bestDist = d; best = c; tie = false; }
        else if (d === bestDist && c !== best) tie = true;
    }
    return best !== undefined && bestDist <= max && !tie ? best : undefined;
}

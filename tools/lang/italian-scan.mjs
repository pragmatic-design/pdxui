// A stricter Italian detector for the tracked source, and the script that runs it.
//
//   node tools/lang/italian-scan.mjs            every hit, grouped by file
//   node tools/lang/italian-scan.mjs --count    one number
//
// Why a second detector exists at all. `packages/core/tests/docs-language.test.ts` carries a
// deliberately SHORT word list — `perché`, `della`, `sono`, `viene` and a dozen more — because a
// list with false positives is one nobody keeps green, and its own comment says so: a failure there
// is proof of Italian, silence is not proof of English. A zero on that list is the detector's, not
// the language's: measured with the list below, a source the short list reads as clean held 68
// lines it cannot see.
//
// So this list is the strict one, and it is kept honest the only way a word list can be: every word
// on it is Italian and is NOT an English word. `come`, `non`, `note`, `dato` and friends stay out —
// they are the reason the short list is short. What this adds are the prepositions, adverbs and
// verb forms that carry Italian prose and have no English twin: `dal`, `nella`, `quindi`, `invece`,
// `altrimenti`, `deve`, `dentro`, `perché` …
//
// A false positive is still possible — a variable named `il` reads as Italian to the short list.
// The fix is to rename the variable, not to weaken the detector: a line of code cannot be
// translated, so a name that reads as Italian prose is itself the thing to fix.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Italian function words with no English twin. Each alternative carries its own boundary: a
 * trailing space where the word is a prefix of English words (`dal` → `dally`), none where it
 * cannot be.
 */
export const ITALIAN_STRICT = new RegExp(
    '(?<![A-Za-z])(?:' + [
        // Ending in a space, so the boundary is built in. `ai`, `col`, `dei` and `nei` are NOT
        // here: they read as Italian and collide with English and with identifiers — `ai ` matched
        // "AI suggestions", `col ` matched "pdx-col — Responsive grid column"; nor are bare nouns
        // (`riga`, `valore`, `file di`), which are identifiers here as often as they are words.
        'della |dello |degli |delle |dal |dalla |dalle |dagli |nella |nello |nelle |negli ',
        'sulla |sullo |sulle |sugli |alla |allo |alle |agli |fuori da',
        'questo |questa |questi |queste |quello |quella |quelli |quelle ',
        'mentre |quindi |oppure |senza |anche |gi[àa] |sono |essere |viene |vengono |hanno ',
        'deve |devono |pu[òo] |possono |servono |nomi di|tutti i|tutte le|ogni |stessa |stesso ',
    ].join('|') + '|(?:' + [
        // Whole words, which need their own trailing boundary: `significa` is a prefix of
        // "significant", and `serve` IS an English word — it was matching "would serve a stale
        // dist" — so it is not on either list.
        'perch[eé]|cos[ìi] che|poich[eé]|finch[eé]|invece|altrimenti|dunque|anzich[eé]',
        'soprattutto|infatti|comunque|dentro|riscrive|restituisce|significa|succede|accade',
        'ognuna|ognuno|ciascun[oa]?',
    ].join('|') + ')(?![A-Za-z]))',
    'i',
);
/**
 * The second rule: two DISTINCT Italian function words on one line. Each word alone is too short
 * to trust — `di`, `da`, `con` turn up in English — but two different ones together do not, and
 * the list leaves out the words English shares outright (`per`, `a`, `e`, `come`, `non`). Measured:
 * it finds 19 lines the strict list cannot see, none of them English —
 * «Render di una cella del data-grid», test titles like «mostra hover col tipo di una variabile».
 */
const DENSE_WORDS = /(?<![\p{L}\w'`$.-])(il|lo|gli|di|da|che|con|una|uno|del|dei|della|delle|dello|nel|nella|al|alla|sul|sulla|più|può|già|è|anche|dopo|quando|sempre|ancora|tutto|tutti|ogni|questa|questo|sono|viene|deve|fa|ha|hanno|essere|stato)(?![\p{L}\w'`-])/giu;

/** Whether a piece of prose is Italian: a strict word, or two distinct function words. */
export function isItalian(prose) {
    if (ITALIAN_STRICT.test(prose)) return true;
    return new Set((prose.match(DENSE_WORDS) ?? []).map(w => w.toLowerCase())).size >= 2;
}

/** Files the scan cannot read as text. */
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|mp4|webm|wasm|vsix)$/i;

/**
 * The Italian locale is data, not prose: the showcase's and the demo's `it` dictionaries are what an
 * Italian user reads, and translating them would break the feature they exist for.
 */
const ITALIAN_LOCALE = /(^|\/)(locales|translations)\/it[\w.-]*\.json$/;

/**
 * What the language guard scans: every text file the repository publishes, minus generated output,
 * snapshots, the lockfile, the Italian locale, and the two detectors, whose controls are Italian.
 *
 * Not only source under packages/: a scan limited to it leaves out the pre-push hook, the
 * Dockerfile, the site's web.config, the CI workflows, the ignore files and the architecture
 * pages — files a stranger opens, none of them in packages/src.
 *
 * `--others --exclude-standard` as well as the index, so a file that is written but NOT YET
 * COMMITTED is measured too. `git ls-files` alone reads the index, and `docs-language.test.ts`
 * carries the note explaining what that costs: the defect surfaces on the NEXT change's gate,
 * where it reads as someone else's mess, and an untracked Italian line passes a green gate.
 */
export function trackedSource() {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: REPO, encoding: 'utf-8' })
        .split('\n').map(s => s.trim())
        .filter(f => f && !BINARY.test(f) && !f.includes('/__snapshots__/') && !f.includes('/generated/')
            && f !== 'pnpm-lock.yaml' && !ITALIAN_LOCALE.test(f)
            && f !== 'packages/core/tests/docs-language.test.ts'
            && f !== 'tools/lang/italian-scan.mjs');
}

/** Files whose prose is their comments: in code, a string is DATA and its language can be the point. */
const CODE = /\.(ts|tsx|js|mjs|cjs|pdx|css)$/;

/**
 * The part of a line that is prose, or null. In code that is a comment — a whole comment line, a
 * test title, or the comment at the end of a line of code — while a string a test compares against is DATA:
 * `'Càffè Größe'` catches a latin1 decode, and the Italian fixtures of `i18n-before-import.test.ts`
 * are what that test proves. Everywhere else — markdown, HTML, YAML, a shell hook, a Dockerfile —
 * the whole line is prose, except inside a markdown code fence, which is code again.
 */
export function proseOf(file, line, inFence = false) {
    if (!CODE.test(file) && !inFence) return line;
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('#')
        || /^\s*(it|describe|test)\s*\(\s*['"`]/.test(line)) return line;
    const trailing = line.match(/\s\/\/\s(.*)$/) ?? line.match(/\s\/\*\s(.*?)(?:\*\/|$)/);
    return trailing ? trailing[1] : null;
}

/**
 * Lines whose Italian is the POINT, and must not be translated. Each names the file and a
 * fragment that identifies it, so it survives the line moving, and each says why.
 *
 * The distinction is the same as everywhere else: prose is translated, DATA is not.
 * `'Càffè Größe'` catches a latin1 decode and would test nothing as `'Caffe Grosse'`.
 *
 * Empty: a quotation is translated and marked as a translation rather than listed here. An entry
 * needs a reason a reader of the published repository would accept.
 */
const DELIBERATE = [];

/** Every Italian prose line in the published text: `[file, lineNumber, text]`. */
export function scan() {
    const hits = [];
    for (const f of trackedSource()) {
        const text = readFileSync(join(REPO, f), 'utf-8');
        if (text.includes('\u0000')) continue;
        const markdown = f.endsWith('.md');
        const code = CODE.test(f);
        let inFence = false;
        let inBlock = false;   // inside a /* … */ that spans lines, whose lines need not start with `*`
        text.split(/\r?\n/).forEach((line, i) => {
            if (markdown && /^\s*(```|~~~)/.test(line)) { inFence = !inFence; return; }
            const wasInBlock = inBlock;
            if (code) {
                const open = line.lastIndexOf('/*'), close = line.lastIndexOf('*/');
                if (open > close) inBlock = true;
                else if (close >= 0) inBlock = false;
            }
            const prose = wasInBlock ? line : proseOf(f, line, inFence);
            if (prose === null || /\bit:\s*\{/.test(line)) return;
            if (!isItalian(prose)) return;
            if (DELIBERATE.some(d => d.file === f && line.includes(d.fragment))) return;
            hits.push([f, i + 1, line.trim()]);
        });
    }
    return hits;
}

if (process.argv[1] && process.argv[1].endsWith('italian-scan.mjs')) {
    const hits = scan();
    if (process.argv.includes('--count')) {
        console.log(String(hits.length));
    } else {
        let current = '';
        for (const [file, line, text] of hits) {
            if (file !== current) { current = file; console.log(`\n${file}`); }
            console.log(`  ${String(line).padStart(5)}  ${text.slice(0, 120)}`);
        }
        console.log(`\n${hits.length} Italian line(s) in ${new Set(hits.map(h => h[0])).size} file(s).`);
    }
}

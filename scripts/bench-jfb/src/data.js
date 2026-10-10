// The rows every js-framework-benchmark implementation builds: an increasing id and a label of
// three random words, drawn from the benchmark's word lists.

const ADJECTIVES = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain',
    'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful', 'mushy', 'odd', 'unsightly',
    'adorable', 'important', 'inexpensive', 'cheap', 'expensive', 'fancy'];
const COLOURS = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white',
    'black', 'orange'];
const NOUNS = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich',
    'burger', 'pizza', 'mouse', 'keyboard'];

let nextId = 1;

function pick(words) {
    return words[Math.round(Math.random() * 1000) % words.length];
}

export function buildData(count) {
    const rows = new Array(count);
    for (let i = 0; i < count; i++) {
        rows[i] = { id: nextId++, label: `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}` };
    }
    return rows;
}

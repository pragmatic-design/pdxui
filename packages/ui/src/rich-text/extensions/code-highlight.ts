// ── Code Block Syntax Highlighting ────────────────────────────────
// Zero-dep tokenizer for 10 major languages.
// Uses simple regex-based tokenization (not a full parser).
// Produces span elements with class names for styling.

export interface Token {
  type: TokenType;
  value: string;
}

export type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'operator' | 'punctuation' | 'function' | 'type' | 'variable' | 'plain';

// ── Tokenizer Engine ──────────────────────────────────────────

interface LangDef {
  keywords: string[];
  types?: string[];
  comment: { line?: string; blockStart?: string; blockEnd?: string };
  string: string[];     // quote chars
  templateString?: boolean;
  numberPattern?: RegExp;
  operators?: string[];
}

const LANGS: Record<string, LangDef> = {
  javascript: {
    keywords: ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','delete','typeof','instanceof','in','of','class','extends','import','export','default','from','async','await','try','catch','finally','throw','yield','this','super','null','undefined','true','false','void'],
    types: ['Array','Object','String','Number','Boolean','Map','Set','Promise','Date','RegExp','Error','Symbol','BigInt'],
    comment: { line: '//', blockStart: '/*', blockEnd: '*/' },
    string: ["'", '"', '`'],
    templateString: true,
    operators: ['=>', '===', '!==', '==', '!=', '>=', '<=', '&&', '||', '??', '?.', '++', '--', '**', '...'],
  },
  typescript: {
    keywords: ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','delete','typeof','instanceof','in','of','class','extends','import','export','default','from','async','await','try','catch','finally','throw','yield','this','super','null','undefined','true','false','void','type','interface','enum','namespace','declare','abstract','implements','readonly','as','is','keyof','infer','never','unknown','any'],
    types: ['Array','Object','String','Number','Boolean','Map','Set','Promise','Date','RegExp','Error','Symbol','BigInt','Record','Partial','Required','Readonly','Pick','Omit','Exclude','Extract'],
    comment: { line: '//', blockStart: '/*', blockEnd: '*/' },
    string: ["'", '"', '`'],
    templateString: true,
    operators: ['=>', '===', '!==', '==', '!=', '>=', '<=', '&&', '||', '??', '?.', '++', '--', '**', '...'],
  },
  python: {
    keywords: ['def','return','if','elif','else','for','while','break','continue','pass','class','import','from','as','try','except','finally','raise','with','yield','lambda','and','or','not','in','is','True','False','None','global','nonlocal','del','assert','async','await'],
    types: ['int','float','str','bool','list','dict','tuple','set','bytes','type','object','Exception'],
    comment: { line: '#' },
    string: ["'", '"', "'''", '"""'],
  },
  java: {
    keywords: ['public','private','protected','static','final','abstract','class','interface','extends','implements','new','return','if','else','for','while','do','switch','case','break','continue','try','catch','finally','throw','throws','import','package','this','super','void','null','true','false','instanceof','synchronized','volatile','transient','native','enum','record','var','sealed','permits'],
    types: ['int','long','double','float','boolean','char','byte','short','String','Integer','Long','Double','Float','Boolean','List','Map','Set','Optional','Stream'],
    comment: { line: '//', blockStart: '/*', blockEnd: '*/' },
    string: ['"'],
  },
  csharp: {
    keywords: ['public','private','protected','internal','static','readonly','const','class','struct','record','interface','enum','abstract','sealed','virtual','override','new','return','if','else','for','foreach','while','do','switch','case','break','continue','try','catch','finally','throw','using','namespace','this','base','null','true','false','typeof','is','as','in','out','ref','params','async','await','yield','var','dynamic','partial','where','get','set','init','required','field'],
    types: ['int','long','double','float','decimal','bool','char','byte','string','object','void','Task','List','Dictionary','IEnumerable','Action','Func','Span','ReadOnlySpan'],
    comment: { line: '//', blockStart: '/*', blockEnd: '*/' },
    string: ['"', "'"],
  },
  go: {
    keywords: ['func','return','if','else','for','range','switch','case','break','continue','go','select','chan','defer','fallthrough','goto','map','struct','interface','type','package','import','const','var','nil','true','false','iota'],
    types: ['int','int8','int16','int32','int64','uint','uint8','uint16','uint32','uint64','float32','float64','complex64','complex128','bool','byte','rune','string','error','any'],
    comment: { line: '//', blockStart: '/*', blockEnd: '*/' },
    string: ['"', "'", '`'],
  },
  rust: {
    keywords: ['fn','let','mut','const','return','if','else','for','while','loop','match','break','continue','struct','enum','impl','trait','pub','use','mod','crate','self','super','where','async','await','move','ref','type','dyn','unsafe','extern','as','in','true','false'],
    types: ['i8','i16','i32','i64','i128','u8','u16','u32','u64','u128','f32','f64','bool','char','str','String','Vec','Option','Result','Box','Rc','Arc','HashMap','HashSet','usize','isize'],
    comment: { line: '//', blockStart: '/*', blockEnd: '*/' },
    string: ['"'],
  },
  html: {
    keywords: [],
    comment: { blockStart: '<!--', blockEnd: '-->' },
    string: ['"', "'"],
  },
  css: {
    keywords: ['import','media','keyframes','font-face','supports','layer','container','var','calc','min','max','clamp'],
    comment: { blockStart: '/*', blockEnd: '*/' },
    string: ['"', "'"],
  },
  sql: {
    keywords: ['SELECT','FROM','WHERE','AND','OR','NOT','IN','IS','NULL','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','ALTER','DROP','INDEX','JOIN','LEFT','RIGHT','INNER','OUTER','ON','GROUP','BY','ORDER','ASC','DESC','HAVING','LIMIT','OFFSET','UNION','ALL','DISTINCT','AS','CASE','WHEN','THEN','ELSE','END','EXISTS','BETWEEN','LIKE','COUNT','SUM','AVG','MAX','MIN'],
    comment: { line: '--', blockStart: '/*', blockEnd: '*/' },
    string: ["'"],
  },
};

// Aliases
LANGS.js = LANGS.javascript;
LANGS.ts = LANGS.typescript;
LANGS.py = LANGS.python;
LANGS.cs = LANGS.csharp;
LANGS.rs = LANGS.rust;

// ── Tokenize ──────────────────────────────────────────────────

export function tokenize(code: string, language: string): Token[] {
  const lang = LANGS[language.toLowerCase()];
  if (!lang) return [{ type: 'plain', value: code }];

  const tokens: Token[] = [];
  let i = 0;

  while (i < code.length) {
    // Block comment
    if (lang.comment.blockStart && code.startsWith(lang.comment.blockStart, i)) {
      const end = code.indexOf(lang.comment.blockEnd!, i + lang.comment.blockStart.length);
      const endIdx = end === -1 ? code.length : end + lang.comment.blockEnd!.length;
      tokens.push({ type: 'comment', value: code.slice(i, endIdx) });
      i = endIdx;
      continue;
    }

    // Line comment
    if (lang.comment.line && code.startsWith(lang.comment.line, i)) {
      const end = code.indexOf('\n', i);
      const endIdx = end === -1 ? code.length : end;
      tokens.push({ type: 'comment', value: code.slice(i, endIdx) });
      i = endIdx;
      continue;
    }

    // Strings
    let matched = false;
    for (const quote of (lang.string ?? [])) {
      if (code.startsWith(quote, i)) {
        const endIdx = findStringEnd(code, i + quote.length, quote);
        tokens.push({ type: 'string', value: code.slice(i, endIdx) });
        i = endIdx;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Numbers
    const numMatch = code.slice(i).match(/^(?:0x[\da-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:e[+-]?\d+)?)/);
    if (numMatch && (i === 0 || !/\w/.test(code[i - 1]))) {
      tokens.push({ type: 'number', value: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }

    // Multi-char operators
    if (lang.operators) {
      let opMatch = false;
      for (const op of lang.operators) {
        if (code.startsWith(op, i)) {
          tokens.push({ type: 'operator', value: op });
          i += op.length;
          opMatch = true;
          break;
        }
      }
      if (opMatch) continue;
    }

    // Single-char operators/punctuation
    const ch = code[i];
    if ('+-*/%=<>!&|^~?:'.includes(ch)) {
      tokens.push({ type: 'operator', value: ch });
      i++;
      continue;
    }
    if ('(){}[].,;@#'.includes(ch)) {
      tokens.push({ type: 'punctuation', value: ch });
      i++;
      continue;
    }

    // Words (identifiers, keywords)
    const wordMatch = code.slice(i).match(/^[a-zA-Z_$][\w$]*/);
    if (wordMatch) {
      const word = wordMatch[0];
      let type: TokenType = 'plain';

      if (lang.keywords.includes(word)) {
        type = 'keyword';
      } else if (lang.types?.includes(word)) {
        type = 'type';
      } else if (code[i + word.length] === '(') {
        type = 'function';
      } else if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
        type = 'type'; // PascalCase → likely a type
      }

      tokens.push({ type, value: word });
      i += word.length;
      continue;
    }

    // Whitespace and newlines
    const wsMatch = code.slice(i).match(/^\s+/);
    if (wsMatch) {
      tokens.push({ type: 'plain', value: wsMatch[0] });
      i += wsMatch[0].length;
      continue;
    }

    // Unknown character
    tokens.push({ type: 'plain', value: ch });
    i++;
  }

  return mergeAdjacentTokens(tokens);
}

function findStringEnd(code: string, start: number, quote: string): number {
  let i = start;
  while (i < code.length) {
    if (code[i] === '\\') { i += 2; continue; }
    if (code.startsWith(quote, i)) return i + quote.length;
    if (quote.length === 1 && code[i] === '\n') return i; // single-line string
    i++;
  }
  return code.length;
}

function mergeAdjacentTokens(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (const t of tokens) {
    const last = result[result.length - 1];
    if (last && last.type === t.type) {
      last.value += t.value;
    } else {
      result.push({ ...t });
    }
  }
  return result;
}

// ── Render to HTML ────────────────────────────────────────────

export function highlightToHTML(code: string, language: string): string {
  const tokens = tokenize(code, language);
  return tokens.map(t => {
    const escaped = t.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (t.type === 'plain') return escaped;
    return `<span class="pdx-hl-${t.type}">${escaped}</span>`;
  }).join('');
}

/** List of supported languages */
export const SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'csharp',
  'go', 'rust', 'html', 'css', 'sql',
];

/** Aliases */
export const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python',
  cs: 'csharp', rs: 'rust',
};

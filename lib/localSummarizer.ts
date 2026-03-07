/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║       ADVANCED HYBRID SUMMARIZER  v2.2 — React Native / Android Edition     ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Changes in v2.2:                                                            ║
 * ║  • Code block IMPORTANCE SCORING — only relevant snippets shown             ║
 * ║  • isCommand flag for short 1-3 line commands (rendered inline)             ║
 * ║  • Proper markdown fenced code blocks (``` lang) for colour/box rendering  ║
 * ║  • Long boilerplate code penalised; shell/terminal commands boosted         ║
 * ║  • 100% offline — no internet, no native modules                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Copyright (c) 2026 Rahul Varanasi. All Rights Reserved.
 * This file is part of RVX AI Notes — a proprietary software.
 * Unauthorized copying, distribution, or use is strictly prohibited.
 * See LICENSE file in the root directory for full terms.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const BM25_K1 = 1.5;
const BM25_B = 0.75;
const LEXRANK_DAMPING = 0.85;
const LEXRANK_ITERATIONS = 30;
const LEXRANK_THRESHOLD = 0.08;
const MMR_LAMBDA = 0.65;
const TEXTRANK_WINDOW = 3;
const LSA_TOPICS = 4;

/**
 * Minimum importance score (0–1) a code block must have to appear in output.
 * Raise this to show fewer code snippets; lower it to show more.
 *   0.30 → show only clearly relevant commands/snippets
 *   0.20 → show most snippets
 *   0.50 → show only the most critical ones
 */
const CODE_IMPORTANCE_THRESHOLD = 0.30;

/** Maximum lines for a block to be treated as a "command" (inline style) */
const COMMAND_LINE_LIMIT = 4;

// ─────────────────────────────────────────────────────────────────────────────
// STOP WORDS
// ─────────────────────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'through', 'during', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought', 'used',
    'this', 'that', 'these', 'those', 'it', 'its', 'itself', 'he', 'she', 'they', 'we',
    'i', 'you', 'him', 'her', 'them', 'us', 'my', 'your', 'his', 'their', 'our',
    'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same',
    'so', 'than', 'too', 'very', 'just', 'also', 'then', 'there', 'here', 'again', 'once',
    'further', 'now', 'own', 'as', 'after', 'before', 'above', 'below', 'between',
    'out', 'off', 'over', 'under', 'any', 'because', 'while', 'although', 'however',
    'therefore', 'thus', 'hence', 'whether', 'even', 'still', 'yet', 'already', 'well',
    'back', 'down', 'get', 'got', 'make', 'made', 'take', 'taken', 'come', 'go', 'going',
    'know', 'think', 'see', 'look', 'want', 'give', 'use', 'find', 'tell', 'ask', 'seem',
    'feel', 'try', 'leave', 'call', 'keep', 'let', 'begin', 'show', 'hear', 'play',
]);

// ─────────────────────────────────────────────────────────────────────────────
// PORTER STEMMER
// ─────────────────────────────────────────────────────────────────────────────
function porterStem(word: string): string {
    if (word.length <= 2) return word;
    let w = word.toLowerCase();

    if (w.endsWith('sses')) w = w.slice(0, -2);
    else if (w.endsWith('ies')) w = w.slice(0, -2);
    else if (!w.endsWith('ss') && w.endsWith('s')) w = w.slice(0, -1);

    if (w.endsWith('eed')) { if (w.length > 4) w = w.slice(0, -1); }
    else if (w.endsWith('ed') && /[aeiou]/.test(w.slice(0, -2))) {
        w = w.slice(0, -2);
        if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e';
        else if (/([^aeiou])\1$/.test(w) && !/(l|s|z)$/.test(w)) w = w.slice(0, -1);
    } else if (w.endsWith('ing') && /[aeiou]/.test(w.slice(0, -3))) {
        w = w.slice(0, -3);
        if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e';
        else if (/([^aeiou])\1$/.test(w) && !/(l|s|z)$/.test(w)) w = w.slice(0, -1);
    }

    if (w.endsWith('y') && /[aeiou]/.test(w.slice(0, -1))) w = w.slice(0, -1) + 'i';

    for (const [suf, rep] of [
        ['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'],
        ['izer', 'ize'], ['iser', 'ize'], ['abli', 'able'], ['alli', 'al'],
        ['entli', 'ent'], ['eli', 'e'], ['ousli', 'ous'], ['ization', 'ize'],
        ['isation', 'ize'], ['ation', 'ate'], ['ator', 'ate'], ['alism', 'al'],
        ['iveness', 'ive'], ['fulness', 'ful'], ['ousness', 'ous'], ['aliti', 'al'],
        ['iviti', 'ive'], ['biliti', 'ble'],
    ] as [string, string][]) {
        if (w.endsWith(suf)) { w = w.slice(0, -suf.length) + rep; break; }
    }
    for (const [suf, rep] of [
        ['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['alise', 'al'],
        ['iciti', 'ic'], ['ical', 'ic'], ['ful', ''], ['ness', ''],
    ] as [string, string][]) {
        if (w.endsWith(suf)) { w = w.slice(0, -suf.length) + rep; break; }
    }
    for (const suf of [
        'al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement', 'ment',
        'ent', 'ion', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize', 'ise',
    ]) {
        if (w.endsWith(suf) && w.length > suf.length + 1) { w = w.slice(0, -suf.length); break; }
    }
    if (w.endsWith('e') && w.length > 4) w = w.slice(0, -1);
    return w;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
export function stripMarkdown(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/^[-*+]\s+(.+)$/gm, (_m: string, c: string) => {
            const t = c.trim(); return /[.!?]$/.test(t) ? t : t + '.';
        })
        .replace(/^\d+[.)]\s+(.+)$/gm, (_m: string, c: string) => {
            const t = c.trim(); return /[.!?]$/.test(t) ? t : t + '.';
        })
        .replace(/`[^`]+`/g, '')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/(\*\*|__)(.*?)\1/gs, '$2')
        .replace(/(\*|_)(.*?)\1/gs, '$2')
        .replace(/~~(.*?)~~/gs, '$1')
        .replace(/^>\s*/gm, '')
        .replace(/^[-*_]{3,}\s*$/gm, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\|.*\|/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .map(w => w.replace(/^['-]+|['-]+$/g, ''))
        .filter(w => w.length > 2 && !STOP_WORDS.has(w))
        .map(porterStem)
        .filter(w => w.length > 1);
}

function splitSentences(text: string): string[] {
    const plain = stripMarkdown(text);
    const norm = plain
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0)
        .map((l: string) => {
            if (/[.!?]$/.test(l)) return l;
            if (l.endsWith(':')) return l.slice(0, -1) + '.';
            return l + '.';
        })
        .join(' ')
        .replace(/\.{2,}/g, '.')
        .replace(/\s{2,}/g, ' ');
    const raw = norm
        .replace(/([.!?])\s+(?=[A-Z"'(])/g, '$1\x00')
        .replace(/([.!?])\s*\n/g, '$1\x00')
        .split('\x00');
    return raw
        .map((s: string) => s.trim())
        .filter((s: string) => s.split(/\s+/).length >= 5 && s.length >= 25);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION DETECTION
// ─────────────────────────────────────────────────────────────────────────────
interface Section {
    heading: string;
    level: number;
    body: string;
}

function extractSections(markdown: string): Section[] {
    const lines = markdown.split('\n');
    const sections: Section[] = [];
    let current: Section = { heading: '', level: 0, body: '' };
    let inCodeBlock = false;   // ← NEW: track fenced code blocks

    for (const line of lines) {
        // Toggle code-block state on ``` boundaries so that # inside
        // code blocks (bash comments, Python comments, etc.) are never
        // mistaken for markdown headings.
        if (/^```/.test(line.trim())) {
            inCodeBlock = !inCodeBlock;
            current.body += line + '\n';
            continue;
        }

        // Only treat # lines as headings when we are NOT inside a code block
        if (!inCodeBlock) {
            const m = line.match(/^(#{1,6})\s+(.*)/);
            if (m) {
                if (current.body.trim() || current.heading) sections.push(current);
                current = { heading: m[2].trim(), level: m[1].length, body: '' };
                continue;
            }
        }

        current.body += line + '\n';
    }
    if (current.body.trim() || current.heading) sections.push(current);

    return sections.filter(s => s.body.trim().length > 20 || s.heading.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// CODE-BLOCK EXTRACTION + IMPORTANCE SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shell/terminal language tags — these are always treated as potentially
 * important because they contain runnable commands students need to know.
 */
const SHELL_LANGS = new Set([
    'bash', 'sh', 'shell', 'terminal', 'cmd', 'powershell', 'zsh', 'fish',
    'console', 'command', 'cli',
]);

/**
 * Patterns that signal an "important" code block — key operations a student
 * would need to actually run or understand, not just illustrative boilerplate.
 */
const IMPORTANT_CODE_PATTERNS: RegExp[] = [
    /^\s*(import|from|require|include|#include|use)\s/m,   // imports/includes
    /^\s*(class|struct|interface|enum|type)\s+\w+/m,        // type definitions
    /^\s*(def|func|function|fn|sub|procedure)\s+\w+/m,      // function definitions
    /\b(fork|exec|malloc|free|mmap|semaphore|mutex|pthread|socket|bind|listen|send|recv)\s*\(/m,  // OS syscalls
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|JOIN)\b/i,  // SQL
    /^\s*\$\s+\S/m,                                         // shell prompt lines ($)
    /^\s*(git|docker|npm|pip|make|gcc|clang|javac|java|python|node)\s/m, // common CLI tools
    /O\([nN\d\s*log\s*n]+\)/,                               // Big-O notation
    /\b(if|while|for)\s*\(.+\)\s*\{/m,                      // core control flow
    /#define\s+\w+/m,                                        // C macros
];

/**
 * Score how important a code block is (0 – 1).
 *
 * Rules:
 *  +0.50  → shell/terminal block (contains commands students run)
 *  +0.30  → matches an "important pattern" (syscall, import, SQL, CLI tool…)
 *  +0.15  → short block (≤ 4 lines) — concise = likely a key snippet
 *  +0.10  → very short (1 line) — single command, high signal
 *  +0.10 each → each document keyword found in content (max +0.30)
 *  −0.20  → long block (> 20 lines)
 *  −0.35  → very long block (> 40 lines) — likely boilerplate
 */
function scoreCodeBlock(block: { lang: string; content: string }, documentKeywords: string[]): number {
    let score = 0;
    const contentLower = block.content.toLowerCase();
    const nonEmptyLines = block.content.split('\n').filter(l => l.trim().length > 0);
    const lineCount = nonEmptyLines.length;

    // Shell / terminal blocks are high priority
    if (SHELL_LANGS.has(block.lang.toLowerCase())) score += 0.50;

    // Matches any important pattern
    if (IMPORTANT_CODE_PATTERNS.some(p => p.test(block.content))) score += 0.30;

    // Length scoring — short = more likely to be a key command/snippet
    if (lineCount === 1) score += 0.10;   // single-line command
    else if (lineCount <= COMMAND_LINE_LIMIT) score += 0.15; // short snippet
    else if (lineCount <= 10) score += 0.05;   // medium
    // Long blocks get penalised (boilerplate, full implementations, etc.)
    if (lineCount > 20) score -= 0.20;
    if (lineCount > 40) score -= 0.35;

    // Keyword relevance — how many document keywords appear in this block?
    const kwMatches = documentKeywords.filter(kw =>
        contentLower.includes(kw.toLowerCase())
    ).length;
    score += Math.min(0.30, kwMatches * 0.10);

    return Math.min(1, Math.max(0, score));
}

interface CodeBlock {
    lang: string;
    content: string;
    summary: string;  // first meaningful line as preview
    importance: number;  // 0–1 score (computed by scoreCodeBlock)
    isCommand: boolean; // true if ≤ COMMAND_LINE_LIMIT non-empty lines
}

/**
 * Extract all fenced code blocks, score them, and flag commands.
 * documentKeywords may be empty on first pass; call again after keyword
 * extraction for more accurate scoring (the main pipeline does this).
 */
function extractCodeBlocks(markdown: string, documentKeywords: string[] = []): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const re = /```(\w*)\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown)) !== null) {
        const lang = m[1] || 'code';
        const content = m[2].trim();
        const nonEmpty = content.split('\n').filter(l => l.trim().length > 0);
        const firstLine = nonEmpty.find(l => l.trim().length > 3) ?? '';
        const importance = scoreCodeBlock({ lang, content }, documentKeywords);
        const isCommand = nonEmpty.length <= COMMAND_LINE_LIMIT;
        blocks.push({ lang, content, summary: firstLine.trim(), importance, isCommand });
    }
    return blocks;
}

/**
 * Re-score code blocks once we have the document's top keywords.
 * Call this after keyword extraction for more accurate importance scores.
 */
function rescoreCodeBlocks(blocks: CodeBlock[], documentKeywords: string[]): CodeBlock[] {
    return blocks.map(b => ({
        ...b,
        importance: scoreCodeBlock(b, documentKeywords),
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TF-IDF VECTORS
// ─────────────────────────────────────────────────────────────────────────────
interface SentenceVector {
    terms: Map<string, number>;
    norm: number;
}

function buildTfIdf(sentences: string[][]): SentenceVector[] {
    const n = sentences.length;
    if (n === 0) return [];

    const df = new Map<string, number>();
    for (const toks of sentences) {
        for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
    }
    const idf = new Map<string, number>();
    for (const [term, freq] of df) {
        idf.set(term, Math.log((n + 1) / (freq + 1)) + 1);
    }

    return sentences.map(toks => {
        const tf = new Map<string, number>();
        for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
        const terms = new Map<string, number>();
        let norm = 0;
        for (const [t, freq] of tf) {
            const w = (freq / toks.length) * (idf.get(t) ?? 1);
            terms.set(t, w);
            norm += w * w;
        }
        return { terms, norm: Math.sqrt(norm) };
    });
}

function cosineSimilarity(a: SentenceVector, b: SentenceVector): number {
    if (a.norm === 0 || b.norm === 0) return 0;
    let dot = 0;
    for (const [t, wa] of a.terms) {
        const wb = b.terms.get(t);
        if (wb !== undefined) dot += wa * wb;
    }
    return dot / (a.norm * b.norm);
}

// ─────────────────────────────────────────────────────────────────────────────
// BM25
// ─────────────────────────────────────────────────────────────────────────────
function buildBm25Scores(sentences: string[][], queryTerms: string[]): number[] {
    const n = sentences.length;
    const avgLen = sentences.reduce((s, t) => s + t.length, 0) / (n || 1);
    const df = new Map<string, number>();
    for (const toks of sentences) {
        for (const t of new Set(toks)) if (queryTerms.includes(t)) df.set(t, (df.get(t) ?? 0) + 1);
    }
    return sentences.map(toks => {
        const dl = toks.length;
        let score = 0;
        const tf = new Map<string, number>();
        for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
        for (const qt of queryTerms) {
            const f = tf.get(qt) ?? 0;
            if (f === 0) continue;
            const idfVal = Math.log((n - (df.get(qt) ?? 0) + 0.5) / ((df.get(qt) ?? 0) + 0.5) + 1);
            const tfNorm = (f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgLen)));
            score += idfVal * tfNorm;
        }
        return score;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// LexRank
// ─────────────────────────────────────────────────────────────────────────────
function buildSimilarityMatrix(n: number, simFn: (i: number, j: number) => number): number[][] {
    const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        sim[i][i] = 1;
        for (let j = i + 1; j < n; j++) {
            const s = simFn(i, j);
            const val = s >= LEXRANK_THRESHOLD ? s : 0;
            sim[i][j] = val;
            sim[j][i] = val;
        }
    }
    return sim;
}

function powerIterationRank(sim: number[][]): number[] {
    const n = sim.length;
    if (n === 0) return [];
    if (n === 1) return [1];

    const stochastic = sim.map(row => {
        const sum = row.reduce((a, v) => a + v, 0);
        return sum === 0 ? row.map(() => 1 / n) : row.map(v => v / sum);
    });

    let scores = new Array(n).fill(1 / n);
    for (let iter = 0; iter < LEXRANK_ITERATIONS; iter++) {
        const next = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) next[i] += stochastic[j][i] * scores[j];
            next[i] = LEXRANK_DAMPING * next[i] + (1 - LEXRANK_DAMPING) / n;
        }
        const delta = next.reduce((s, v, i) => s + Math.abs(v - scores[i]), 0);
        scores = next;
        if (delta < 1e-6) break;
    }
    const max = Math.max(...scores);
    return max > 0 ? scores.map(s => s / max) : scores;
}

function lexRankTfIdf(vectors: SentenceVector[]): number[] {
    const n = vectors.length;
    const sim = buildSimilarityMatrix(n, (i, j) => cosineSimilarity(vectors[i], vectors[j]));
    return powerIterationRank(sim);
}

// ─────────────────────────────────────────────────────────────────────────────
// LSA
// ─────────────────────────────────────────────────────────────────────────────
function lsaScores(tokenised: string[][], vectors: SentenceVector[]): number[] {
    const n = tokenised.length;
    if (n < 3) return new Array(n).fill(1);

    const vocab = [...new Set(tokenised.flat())];
    const termIdx = new Map(vocab.map((w, i) => [w, i]));
    const m = vocab.length;

    const M: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
        for (const [term, weight] of vectors[j].terms) {
            const row = termIdx.get(term);
            if (row !== undefined) M[row][j] = weight;
        }
    }

    const sentenceScores = new Array(n).fill(0);
    const deflatedA = M;

    for (let topic = 0; topic < Math.min(LSA_TOPICS, n - 1); topic++) {
        let v = new Array(n).fill(0).map((_, i) => i === 0 ? 1 : Math.random() * 0.01);
        let eigenval = 0;

        for (let iter = 0; iter < 25; iter++) {
            const u = new Array(m).fill(0);
            for (let r = 0; r < m; r++) {
                for (let c = 0; c < n; c++) u[r] += deflatedA[r][c] * v[c];
            }
            const vNew = new Array(n).fill(0);
            for (let c = 0; c < n; c++) {
                for (let r = 0; r < m; r++) vNew[c] += deflatedA[r][c] * u[r];
            }
            const norm = Math.sqrt(vNew.reduce((s, x) => s + x * x, 0)) || 1;
            eigenval = norm;
            v = vNew.map(x => x / norm);
        }

        for (let j = 0; j < n; j++) sentenceScores[j] += eigenval * Math.abs(v[j]);

        const u = new Array(m).fill(0);
        for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) u[r] += deflatedA[r][c] * v[c];
        const sigma = Math.sqrt(u.reduce((s, x) => s + x * x, 0)) || 1;
        const uNorm = u.map(x => x / sigma);
        for (let r = 0; r < m; r++) {
            for (let c = 0; c < n; c++) {
                deflatedA[r][c] -= sigma * uNorm[r] * v[c];
            }
        }
    }

    const max = Math.max(...sentenceScores) || 1;
    return sentenceScores.map(s => s / max);
}

// ─────────────────────────────────────────────────────────────────────────────
// TextRank
// ─────────────────────────────────────────────────────────────────────────────
function textRankKeywords(allTokens: string[]): Map<string, number> {
    if (allTokens.length === 0) return new Map();
    const vocab = [...new Set(allTokens)];
    const idx = new Map<string, number>(vocab.map((w, i) => [w, i]));
    const n = vocab.length;

    const adj: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < allTokens.length; i++) {
        for (let j = i + 1; j < Math.min(i + TEXTRANK_WINDOW + 1, allTokens.length); j++) {
            const wi = idx.get(allTokens[i])!, wj = idx.get(allTokens[j])!;
            if (wi !== wj) { adj[wi][wj]++; adj[wj][wi]++; }
        }
    }

    const stochastic = adj.map(row => {
        const sum = row.reduce((a, v) => a + v, 0);
        return sum === 0 ? row.map(() => 1 / n) : row.map(v => v / sum);
    });

    let scores = new Array(n).fill(1 / n);
    for (let iter = 0; iter < 20; iter++) {
        const next = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) next[i] += stochastic[j][i] * scores[j];
            next[i] = 0.85 * next[i] + 0.15 / n;
        }
        const delta = next.reduce((s, v, i) => s + Math.abs(v - scores[i]), 0);
        scores = next;
        if (delta < 1e-6) break;
    }

    const result = new Map<string, number>();
    vocab.forEach((w, i) => result.set(w, scores[i]));
    return result;
}

function textRankSentenceScore(sentTokens: string[], wordRanks: Map<string, number>): number {
    if (sentTokens.length === 0) return 0;
    return sentTokens.reduce((s, t) => s + (wordRanks.get(t) ?? 0), 0) / sentTokens.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// POSITIONAL + STRUCTURAL SCORING
// ─────────────────────────────────────────────────────────────────────────────
const DEFINITION_SIGNALS = [
    /\bis\s+(a|an|the)\b/i, /\bare\s+(a|an|the)\b/i, /\bdefin/i,
    /\brefer[s]?\s+to\b/i, /\bmeans?\b/i, /\bdescrib/i, /\brepresent/i,
    /\bconsist[s]?\s+of\b/i, /\binvolv/i, /\bcompos/i,
];

function positionalScore(index: number, total: number, raw: string, afterHeading: boolean): number {
    let score = 0;
    const rel = index / (total - 1 || 1);
    if (rel <= 0.1) score += 1.0;
    else if (rel <= 0.2) score += 0.7;
    else if (rel >= 0.9) score += 0.5;
    else if (rel >= 0.8) score += 0.3;
    else score += 0.1;

    const words = raw.split(/\s+/).length;
    if (words >= 12 && words <= 45) score += 0.4;
    else if (words >= 7) score += 0.2;

    if (DEFINITION_SIGNALS.some(r => r.test(raw))) score += 0.6;
    if (afterHeading) score += 0.5;
    if (/\d+[%$]|\d+\.\d+|\b\d{4}\b/.test(raw)) score += 0.2;
    if (words < 5 || words > 70) score -= 0.5;

    return Math.max(0, score);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE NORMALISATION
// ─────────────────────────────────────────────────────────────────────────────
function normalise(arr: number[]): number[] {
    const max = Math.max(...arr, 1e-9);
    const min = Math.min(...arr);
    const range = max - min || 1;
    return arr.map(v => (v - min) / range);
}

// ─────────────────────────────────────────────────────────────────────────────
// MMR
// ─────────────────────────────────────────────────────────────────────────────
function mmrSelect(
    candidates: number[],
    fusedScores: number[],
    simFn: (i: number, j: number) => number,
    k: number
): number[] {
    const selected: number[] = [];
    const remaining = new Set(candidates);

    while (selected.length < k && remaining.size > 0) {
        let best = -Infinity, bestIdx = -1;
        for (const i of remaining) {
            const relevance = fusedScores[i];
            let maxSim = 0;
            for (const j of selected) { const s = simFn(i, j); if (s > maxSim) maxSim = s; }
            const mmrScore = MMR_LAMBDA * relevance - (1 - MMR_LAMBDA) * maxSim;
            if (mmrScore > best) { best = mmrScore; bestIdx = i; }
        }
        if (bestIdx === -1) break;
        selected.push(bestIdx);
        remaining.delete(bestIdx);
    }
    return selected.sort((a, b) => a - b);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEM→ORIGINAL WORD MAPPING
// ─────────────────────────────────────────────────────────────────────────────
function buildStemMap(plainText: string): Map<string, string> {
    const words = plainText.toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .map(w => w.replace(/^['-]+|['-]+$/g, ''))
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    const stemToCount = new Map<string, Map<string, number>>();
    for (const word of words) {
        const stem = porterStem(word);
        if (!stemToCount.has(stem)) stemToCount.set(stem, new Map());
        const m = stemToCount.get(stem)!;
        m.set(word, (m.get(word) ?? 0) + 1);
    }

    const result = new Map<string, string>();
    for (const [stem, counts] of stemToCount) {
        let best = '', max = 0;
        for (const [orig, cnt] of counts) if (cnt > max) { best = orig; max = cnt; }
        result.set(stem, best);
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEAR-DUPLICATE REMOVAL
// ─────────────────────────────────────────────────────────────────────────────
function deduplicateSentences(vectors: SentenceVector[], threshold: number = 0.82): number[] {
    const keep: number[] = [];
    for (let i = 0; i < vectors.length; i++) {
        let isDupe = false;
        for (const j of keep) {
            if (cosineSimilarity(vectors[i], vectors[j]) > threshold) {
                isDupe = true; break;
            }
        }
        if (!isDupe) keep.push(i);
    }
    return keep;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE SECTION SUMMARISER
// ─────────────────────────────────────────────────────────────────────────────
interface SectionResult {
    heading: string;
    level: number;
    sentences: string[];
    keywords: string[];
}

function summariseSection(sectionBody: string, targetCount: number): SectionResult {
    const rawSentences = splitSentences(sectionBody);
    if (rawSentences.length === 0) return { heading: '', level: 0, sentences: [], keywords: [] };

    const targetActual = Math.min(targetCount, rawSentences.length);
    if (rawSentences.length <= targetActual) {
        return { heading: '', level: 0, sentences: rawSentences, keywords: [] };
    }

    const tokenised = rawSentences.map(tokenize);
    const allTokens = tokenised.flat();
    if (allTokens.length < 5) {
        return { heading: '', level: 0, sentences: rawSentences.slice(0, targetActual), keywords: [] };
    }

    const vectors = buildTfIdf(tokenised);
    const keepIndices = deduplicateSentences(vectors);
    const dedupSentences = keepIndices.map(i => rawSentences[i]);
    const dedupTokenised = keepIndices.map(i => tokenised[i]);
    const dedupVectors = keepIndices.map(i => vectors[i]);
    const dedupTarget = Math.min(targetActual, dedupSentences.length);

    if (dedupSentences.length <= dedupTarget) {
        const stemMapEarly = buildStemMap(stripMarkdown(sectionBody));
        const allToksEarly = dedupTokenised.flat();
        const wrEarly = textRankKeywords(allToksEarly.length > 0 ? allToksEarly : allTokens);
        const keywordsEarly = [...wrEarly.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
            .map(([s]) => (stemMapEarly.get(s) ?? s)).filter(k => k.length > 2)
            .map(k => k.charAt(0).toUpperCase() + k.slice(1));
        return { heading: '', level: 0, sentences: dedupSentences, keywords: keywordsEarly };
    }

    const allTokensDedup = dedupTokenised.flat();
    const termFreq = new Map<string, number>();
    for (const t of allTokensDedup) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    const topKeywordsRaw = [...termFreq.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t]) => t);

    const bm25 = normalise(buildBm25Scores(dedupTokenised, topKeywordsRaw));
    const lexRankScores = normalise(lexRankTfIdf(dedupVectors));
    const simFn = (i: number, j: number) => cosineSimilarity(dedupVectors[i], dedupVectors[j]);
    const wordRanks = textRankKeywords(allTokensDedup);
    const textRankScores = normalise(dedupTokenised.map(t => textRankSentenceScore(t, wordRanks)));
    const lsa = normalise(lsaScores(dedupTokenised, dedupVectors));
    const positional = normalise(dedupSentences.map((s, i) =>
        positionalScore(i, dedupSentences.length, s, i === 0)
    ));

    const fused = dedupSentences.map((_, i) =>
        lexRankScores[i] * 0.30 +
        bm25[i] * 0.22 +
        textRankScores[i] * 0.18 +
        lsa[i] * 0.18 +
        positional[i] * 0.12
    );

    const indices = dedupSentences.map((_, i) => i);
    const selected = mmrSelect(indices, fused, simFn, dedupTarget);

    const stemMap = buildStemMap(stripMarkdown(sectionBody));
    const keywords = [...wordRanks.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([stem]) => (stemMap.get(stem) ?? stem))
        .filter(k => k.length > 2)
        .map(k => k.charAt(0).toUpperCase() + k.slice(1));

    return {
        heading: '',
        level: 0,
        sentences: selected.map(i => dedupSentences[i]),
        keywords,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFINITION EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────
function extractDefinitions(sentences: string[]): string[] {
    return sentences.filter(s =>
        DEFINITION_SIGNALS.some(r => r.test(s)) &&
        s.split(/\s+/).length < 50
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC SENTENCE + CONNECTIVES
// ─────────────────────────────────────────────────────────────────────────────
function generateTopicSentence(keywords: string[], sectionHeading: string): string {
    if (keywords.length === 0) return '';
    const caps = keywords.map(k => k.charAt(0).toUpperCase() + k.slice(1));
    const kws = caps.slice(0, 3).join(', ') + (caps.length > 3 ? ` and ${caps[3]}` : '');
    const templates = [
        `This section covers key concepts related to ${kws}.`,
        `The following explains the core ideas around ${kws}.`,
        `Understanding ${caps[0]} requires familiarity with ${caps.slice(1, 3).join(' and ')}.`,
        `Key ideas explored here include ${kws}.`,
        `Key details regarding ${caps[0]} and related concepts are examined below.`,
    ];
    const hash = (keywords.length + sectionHeading.length) % templates.length;
    return templates[hash];
}

function addConnectives(sentences: string[]): string[] {
    if (sentences.length <= 1) return sentences;
    const connectives = [
        'Furthermore, ', 'In particular, ', 'Additionally, ',
        'Crucially, ', 'It is also worth noting that ',
    ];
    let used = 0;
    return sentences.map((s, i) => {
        if (i === 0) return s;
        const has = /^(however|furthermore|additionally|moreover|in|specifically|it is|this|therefore|thus|hence|because|crucially)/i.test(s);
        if (!has && i < sentences.length - 1 && used < 2 && (s.length + i) % 3 === 0) {
            used++;
            const prefix = connectives[(i + s.length) % connectives.length];
            const isAcronym = s.length > 1 && /[A-Z]/.test(s[0]) && /[A-Z]/.test(s[1]);
            return prefix + (isAcronym ? s : s.charAt(0).toLowerCase() + s.slice(1));
        }
        return s;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CODE BLOCK RENDERING  (new in v2.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a single code block as a proper markdown fenced block.
 * React Native markdown renderers (react-native-markdown-display, Marked, etc.)
 * will syntax-highlight and box these automatically.
 *
 * Commands (≤ COMMAND_LINE_LIMIT lines) get a 💻 label.
 * Longer snippets get a 📄 label.
 */
function renderCodeBlock(block: CodeBlock): string {
    const label = block.isCommand ? '💻 Command' : '📄 Code snippet';
    const fence = '```' + block.lang;
    return `${label}:\n${fence}\n${block.content}\n\`\`\``;
}

/**
 * Filter and sort code blocks for inclusion in a summary.
 * Returns only blocks that meet the importance threshold,
 * sorted highest-importance first, capped at maxBlocks.
 */
function selectImportantCodeBlocks(
    blocks: CodeBlock[],
    maxBlocks: number = 4,
    threshold: number = CODE_IMPORTANCE_THRESHOLD
): CodeBlock[] {
    return blocks
        .filter(b => b.importance >= threshold)
        .sort((a, b) => b.importance - a.importance)
        .slice(0, maxBlocks);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEAN HELPER
// ─────────────────────────────────────────────────────────────────────────────
function clean(text: string): string {
    return text.replace(/\*\*/g, '').replace(/[*_#`]/g, '').replace(/\s{2,}/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT FORMATTERS  (updated in v2.2 to render important code properly)
// ─────────────────────────────────────────────────────────────────────────────

function formatParagraph(
    sections: Array<{ heading: string; level: number; sentences: string[]; keywords: string[] }>,
    codeBlocks: CodeBlock[],
    title: string
): string {
    const parts: string[] = [];
    const allKeywords = [...new Set(sections.flatMap(s => s.keywords))].slice(0, 6);

    const opener = generateTopicSentence(allKeywords, title);
    if (opener) parts.push(opener);

    for (const sec of sections) {
        if (sec.sentences.length === 0) continue;
        const withConn = addConnectives(sec.sentences);
        parts.push(...withConn.map(clean));
    }

    // ── Important code blocks (new in v2.2) ──────────────────────────────────
    const important = selectImportantCodeBlocks(codeBlocks);
    if (important.length > 0) {
        parts.push('\n---');
        for (const b of important) {
            parts.push(renderCodeBlock(b));
        }
    }

    const displayKw = allKeywords.filter(k => k.length > 3).slice(0, 5).join(', ');
    if (displayKw) parts.push(`\nKey concepts: ${displayKw}.`);

    return parts.filter(Boolean).join('\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function formatBullets(
    sections: Array<{ heading: string; level: number; sentences: string[]; keywords: string[] }>,
    codeBlocks: CodeBlock[],
    title: string
): string {
    const lines: string[] = [];
    const allKeywords = [...new Set(sections.flatMap(s => s.keywords))].slice(0, 8);

    lines.push(`📋 ${title || 'Summary'}`);
    lines.push('');

    for (const sec of sections) {
        if (sec.sentences.length === 0) continue;
        if (sec.heading) {
            const prefix = sec.level <= 2 ? '## ' : '### ';
            lines.push(`${prefix}${sec.heading}`);
        }
        for (const s of sec.sentences) {
            lines.push(`• ${clean(s)}`);
        }
        lines.push('');
    }

    // ── Important code blocks (new in v2.2) ──────────────────────────────────
    const important = selectImportantCodeBlocks(codeBlocks);
    if (important.length > 0) {
        lines.push('### 💻 Key Commands & Code');
        lines.push('');
        for (const b of important) {
            lines.push(renderCodeBlock(b));
            lines.push('');
        }
    } else if (codeBlocks.length > 0) {
        // There are code blocks but none met the threshold — mention them briefly
        lines.push(`> ℹ️  ${codeBlocks.length} code example${codeBlocks.length > 1 ? 's' : ''} in source (not shown — may be boilerplate)`);
        lines.push('');
    }

    if (allKeywords.length > 0) {
        lines.push('### 🔑 Key Terms');
        lines.push(allKeywords.map(k => `\`${k}\``).join('  ·  '));
    }

    return lines.join('\n');
}

function formatStructured(
    sections: Array<{ heading: string; level: number; sentences: string[]; keywords: string[] }>,
    codeBlocks: CodeBlock[],
    title: string,
    definitions: string[]
): string {
    const lines: string[] = [];
    const allKeywords = [...new Set(sections.flatMap(s => s.keywords))].slice(0, 10);
    const allSentences = sections.flatMap(s => s.sentences);

    lines.push(`# 📚 Study Guide: ${title || 'Notes'}`);
    lines.push('');

    if (allKeywords.length > 0) {
        lines.push('## 🎯 Overview');
        const opener = generateTopicSentence(allKeywords.slice(0, 4), title);
        if (opener) lines.push(opener);
        lines.push('');
    }

    if (sections.some(s => s.heading)) {
        lines.push('## 📝 Section Summaries');
        lines.push('');
    }
    for (const sec of sections) {
        if (sec.sentences.length === 0) continue;
        if (sec.heading) lines.push(`### ${sec.heading}`);
        for (const s of sec.sentences) lines.push(`• ${clean(s)}`);
        if (sec.keywords.length > 0) {
            lines.push(`  *(Key terms: ${sec.keywords.slice(0, 4).join(', ')})*`);
        }
        lines.push('');
    }

    if (definitions.length > 0) {
        lines.push('## 📖 Definitions & Key Concepts');
        for (const d of definitions.slice(0, 6)) lines.push(`• ${clean(d)}`);
        lines.push('');
    }

    // ── Important code blocks (new in v2.2) ──────────────────────────────────
    const important = selectImportantCodeBlocks(codeBlocks, 5);
    const skipped = codeBlocks.filter(b => b.importance < CODE_IMPORTANCE_THRESHOLD);

    if (important.length > 0) {
        lines.push('## 💻 Key Commands & Code Examples');
        lines.push('');
        for (const b of important) {
            lines.push(renderCodeBlock(b));
            lines.push(`> importance score: ${b.importance.toFixed(2)}`);
            lines.push('');
        }
    }
    if (skipped.length > 0) {
        lines.push(`> ℹ️  ${skipped.length} code block${skipped.length > 1 ? 's' : ''} omitted (scored below threshold — likely boilerplate)`);
        lines.push('');
    }

    if (allKeywords.length > 0) {
        lines.push('## 🔑 Key Terms Glossary');
        lines.push(allKeywords.map(k => `**${k}**`).join('  ·  '));
        lines.push('');
    }

    if (allSentences.length > 0) {
        lines.push('## ⚡ Quick Revision');
        for (const s of allSentences.slice(0, Math.min(5, allSentences.length))) {
            lines.push(`→ ${clean(s)}`);
        }
    }

    return lines.join('\n').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINTS
// ─────────────────────────────────────────────────────────────────────────────

export type SummaryMode = 'paragraph' | 'bullets' | 'structured';

export interface SummaryOptions {
    totalSentences?: number;
    mode?: SummaryMode;
    title?: string;
}

export async function generateSummary(body: string, options: SummaryOptions = {}): Promise<string> {
    const {
        totalSentences = 10,
        mode = 'paragraph',
        title = 'Topic',
    } = options;

    if (!body || body.trim().length < 30) return body.trim();

    // First pass: extract code blocks without keyword context
    let codeBlocks = extractCodeBlocks(body);

    const sections = extractSections(body);
    const totalBodyLen = sections.reduce((s, sec) => s + sec.body.length, 0) || 1;

    const processedSections: Array<{ heading: string; level: number; sentences: string[]; keywords: string[] }> = [];

    for (const sec of sections) {
        if (!sec.body.trim() && !sec.heading) continue;
        const budget = Math.max(1, Math.round(totalSentences * (sec.body.length / totalBodyLen)));
        const result = summariseSection(sec.body, budget);
        processedSections.push({
            heading: sec.heading,
            level: sec.level,
            sentences: result.sentences,
            keywords: result.keywords,
        });
    }

    // Second pass: re-score code blocks now that we have document keywords
    const allKeywords = [...new Set(processedSections.flatMap(s => s.keywords.map(k => k.toLowerCase())))];
    codeBlocks = rescoreCodeBlocks(codeBlocks, allKeywords);

    const allSentences = processedSections.flatMap(s => s.sentences);
    const definitions = extractDefinitions(allSentences);

    switch (mode) {
        case 'bullets':
            return formatBullets(processedSections, codeBlocks, title);
        case 'structured':
            return formatStructured(processedSections, codeBlocks, title, definitions);
        case 'paragraph':
        default:
            return formatParagraph(processedSections, codeBlocks, title);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKWARDS-COMPATIBLE WRAPPERS
// ─────────────────────────────────────────────────────────────────────────────

export function generateLocalSummary(body: string, count: number = 8, title: string = 'Topic'): string {
    if (!body || body.trim().length < 30) return body.trim();

    let codeBlocks = extractCodeBlocks(body);
    const sections = extractSections(body);
    const totalBodyLen = sections.reduce((s, sec) => s + sec.body.length, 0) || 1;
    const processedSections: Array<{ heading: string; level: number; sentences: string[]; keywords: string[] }> = [];

    for (const sec of sections) {
        if (!sec.body.trim()) continue;
        const budget = Math.max(1, Math.round(count * (sec.body.length / totalBodyLen)));
        const rawSentences = splitSentences(sec.body);
        if (rawSentences.length === 0) continue;
        const tokenised = rawSentences.map(tokenize);
        const allTokens = tokenised.flat();
        if (allTokens.length < 5) {
            processedSections.push({ heading: sec.heading, level: sec.level, sentences: rawSentences.slice(0, budget), keywords: [] });
            continue;
        }
        const vectors = buildTfIdf(tokenised);
        const keepIdx = deduplicateSentences(vectors);
        const dSents = keepIdx.map((i: number) => rawSentences[i]);
        const dToks = keepIdx.map((i: number) => tokenised[i]);
        const dVecs = keepIdx.map((i: number) => vectors[i]);
        const dBudget = Math.min(budget, dSents.length);
        const dAllToks = dToks.flat();
        const termFreq = new Map<string, number>();
        for (const t of dAllToks) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
        const topKw = [...termFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t]) => t);
        const bm25 = normalise(buildBm25Scores(dToks, topKw));
        const lex = normalise(lexRankTfIdf(dVecs));
        const wordRanks = textRankKeywords(dAllToks);
        const tr = normalise(dToks.map((t: string[]) => textRankSentenceScore(t, wordRanks)));
        const lsa = normalise(lsaScores(dToks, dVecs));
        const pos = normalise(dSents.map((s: string, i: number) => positionalScore(i, dSents.length, s, i === 0)));
        const fused = dSents.map((_: string, i: number) => lex[i] * 0.30 + bm25[i] * 0.22 + tr[i] * 0.18 + lsa[i] * 0.18 + pos[i] * 0.12);
        const sel = mmrSelect(dSents.map((_: string, i: number) => i), fused, (i: number, j: number) => cosineSimilarity(dVecs[i], dVecs[j]), dBudget);
        const stemMap = buildStemMap(stripMarkdown(sec.body));
        const keywords = [...wordRanks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => (stemMap.get(s) ?? s)).map((k: string) => k.charAt(0).toUpperCase() + k.slice(1));
        processedSections.push({ heading: sec.heading, level: sec.level, sentences: sel.map((i: number) => dSents[i]), keywords });
    }

    // Rescore with document keywords
    const allKeywords = [...new Set(processedSections.flatMap(s => s.keywords.map(k => k.toLowerCase())))];
    codeBlocks = rescoreCodeBlocks(codeBlocks, allKeywords);

    return formatParagraph(processedSections, codeBlocks, title);
}

export function generateShortSummary(body: string, title: string = 'Topic'): string {
    return generateLocalSummary(body, 3, title);
}

export async function generateStudySummary(body: string, title: string = 'Topic'): Promise<string> {
    return generateSummary(body, { mode: 'structured', title, totalSentences: 12 });
}

export async function generateBulletSummary(body: string, title: string = 'Topic'): Promise<string> {
    return generateSummary(body, { mode: 'bullets', title, totalSentences: 10 });
}

export function extractKeywords(body: string, n: number = 8): string[] {
    const plain = stripMarkdown(body);
    const words = plain.toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .map(w => w.replace(/^['-]+|['-]+$/g, ''))
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    if (words.length === 0) return [];

    const stemToOriginal = new Map<string, Map<string, number>>();
    const tokens: string[] = [];

    for (const word of words) {
        const stem = porterStem(word);
        if (stem.length > 1) {
            tokens.push(stem);
            if (!stemToOriginal.has(stem)) stemToOriginal.set(stem, new Map());
            const m = stemToOriginal.get(stem)!;
            m.set(word, (m.get(word) ?? 0) + 1);
        }
    }

    if (tokens.length === 0) return [];

    const wordRanks = textRankKeywords(tokens);
    return [...wordRanks.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([stem]) => {
            const origMap = stemToOriginal.get(stem);
            if (!origMap) return stem.charAt(0).toUpperCase() + stem.slice(1);
            let best = stem, max = 0;
            for (const [orig, cnt] of origMap) if (cnt > max) { best = orig; max = cnt; }
            return best.charAt(0).toUpperCase() + best.slice(1);
        });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT: code block scoring utilities (useful for app-level filtering)
// ─────────────────────────────────────────────────────────────────────────────
export { scoreCodeBlock, extractCodeBlocks, rescoreCodeBlocks, selectImportantCodeBlocks, CODE_IMPORTANCE_THRESHOLD };
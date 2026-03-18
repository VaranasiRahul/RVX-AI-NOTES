/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║           SMART TOPIC PARSER — Advanced Semantic Splitting           ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Splitting strategy (multi-signal, conservative):                    ║
 * ║                                                                      ║
 * ║  LINE-LEVEL STRUCTURAL SPLIT (v2 — fixes the dense-note bug):       ║
 * ║    Scans every line individually. When a line matches a structural   ║
 * ║    boundary pattern, flush the current block and start a new one    ║
 * ║    — no blank line required.                                         ║
 * ║                                                                      ║
 * ║  HARD BOUNDARIES (always split, no blank line needed):              ║
 * ║    • Markdown H1/H2/H3  (#  ##  ###)                               ║
 * ║    • Numbered items     "4. Deployment", "10. Persistent Volume"    ║
 * ║    • Roman numerals     "I. Introduction"                           ║
 * ║    • PART / CHAPTER / UNIT / SECTION N                             ║
 * ║    • Bold-only line     "**Heading**", "__Heading__"                ║
 * ║    • Colon headers      "Worker nodes:", "API Server:", "Input:"    ║
 * ║      (≤6 words — prevents matching regular prose sentences)         ║
 * ║    • ALL CAPS headings  "TIME COMPLEXITY" (≤8 words)               ║
 * ║    • Triple dividers    --- / === (2+ in a row)                    ║
 * ║                                                                      ║
 * ║  SEMANTIC SHIFT DETECTION (split if topic diverges):                ║
 * ║    • Vocabulary overlap between adjacent paragraphs — if Jaccard    ║
 * ║      similarity drops below threshold, treat as new topic           ║
 * ║    • Transition signal phrases trigger split                        ║
 * ║                                                                      ║
 * ║  SMART MERGE LOGIC:                                                  ║
 * ║    • Short blocks merged into previous, UNLESS both blocks start    ║
 * ║      with a structural boundary marker.                             ║
 * ║                                                                      ║
 * ║  v2.1 changes:                                                       ║
 * ║    • Sync path unchanged (drop-in compatible)                        ║
 * ║    • New async export: smartSplitTopicsAsync — uses full v2          ║
 * ║      summarizer pipeline (LSA + TextRank + LexRank + BM25 + MMR)    ║
 * ║    • ParsedTopic gains hasDefinitions flag for study UI hints        ║
 * ║    • Section-level sentence budgets passed through to summarizer     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import {
    extractKeywords,
    stripMarkdown,
} from '@/lib/localSummarizer';
import {
    generateDeepSummary,
    generateDeepSummaryAsync,
} from '@/lib/deepSummarizer';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const MIN_BLOCK_WORDS    = 80;    // merge unstructured blocks shorter than this
const FORCE_MERGE_WORDS  = 20;    // always merge fragments this tiny (no exceptions)
const SEMANTIC_JACCARD_THRESHOLD = 0.08;

// ─────────────────────────────────────────────────────────────────────────────
// STOP WORDS
// ─────────────────────────────────────────────────────────────────────────────
const STOP = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'we', 'i',
    'you', 'what', 'which', 'who', 'how', 'all', 'each', 'every', 'some', 'such', 'not',
    'also', 'then', 'there', 'here', 'get', 'got', 'make', 'use', 'just', 'as', 'than',
]);

// Transition phrases that signal a new topic
const TOPIC_TRANSITIONS = [
    /^(now|next|moving on|let'?s? (now|look|turn|consider|discuss|explore))/i,
    /^(in contrast|on the other hand|however|conversely|alternatively)/i,
    /^(another (approach|method|way|type|example|key|important))/i,
    /^(the (second|third|fourth|fifth|next|final|last|following))/i,
    /^(chapter|section|part|topic|step|phase|stage)\s+\d+/i,
    /^(introduction|conclusion|summary|overview|background|motivation)/i,
    /^(definition|theorem|lemma|proof|algorithm|example|exercise|problem)/i,
    /^(key (concept|idea|point|takeaway|term|principle|fact))/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// LINE-LEVEL BOUNDARY PATTERNS
// ─────────────────────────────────────────────────────────────────────────────
// Annotation labels that appear inside an explanation — NOT new concept starts.
// "Note:", "Step 1:", "Time Complexity:" stay with the current block.
const COLON_CONTINUATION_LABELS = new Set([
    'note', 'example', 'examples', 'output', 'input', 'result', 'results',
    'syntax', 'usage', 'warning', 'important', 'caution', 'tip', 'hint',
    'definition', 'summary', 'step', 'steps', 'answer', 'question',
    'solution', 'problem', 'task', 'exercise', 'practice',
    'complexity', 'time complexity', 'space complexity', 'runtime',
    'analysis', 'proof', 'theorem', 'lemma', 'corollary', 'claim',
    'pseudocode', 'algorithm', 'approach', 'intuition', 'observation',
    'base case', 'recursive case', 'inductive step',
]);

function isLineBoundary(line: string): boolean {
    const t = line.trim();
    if (!t || t.length < 2 || t.length > 120) return false;

    // Markdown headings — always split
    if (/^#{1,6}\s+\S/.test(t)) return true;

    // Bold-only / underline-only heading lines
    if (/^\*\*[^*]{2,80}\*\*\s*$/.test(t)) return true;
    if (/^__[^_]{2,80}__\s*$/.test(t)) return true;

    // PART / CHAPTER / UNIT / SECTION N
    if (/^(PART|CHAPTER|UNIT|SECTION|MODULE)\s*\d+/i.test(t)) return true;

    // Roman numeral section: "I.", "IV." at paragraph start
    if (/^[IVX]{1,4}[\.\)]\s+[A-Z]/.test(t)) return true;

    // Numbered items — ONLY split on short labels, NOT continuation sentences.
    // "4. Deployment"                → SPLIT  (≤8 words, no sentence punctuation)
    // "10. Persistent Volume (PV)"   → SPLIT
    // "3. This means the scheduler…" → NO SPLIT (sentence ending with period)
    // "2. It ensures replicas are…"  → NO SPLIT (sentence)
    if (/^\d{1,3}[\.\)]\s+[A-Za-z]/.test(t)) {
        const afterNum = t.replace(/^\d{1,3}[\.\)]\s+/, '');
        const words = afterNum.trim().split(/\s+/).length;
        const endsWithSentencePunct = /[.!?,;]$/.test(afterNum.trim()) && words > 4;
        if (!endsWithSentencePunct && words <= 8) return true;
    }

    // ALL CAPS headings — require ≥2 words to avoid matching inline abbreviations
    // "INTRODUCTION" → SPLIT,  "TIME COMPLEXITY" → SPLIT,  "CPU" → NO SPLIT
    if (/^[A-Z][A-Z0-9\s]{4,50}$/.test(t)) {
        const words = t.split(/\s+/);
        if (words.length >= 2 && words.length <= 8) return true;
    }

    // Colon headers — split on proper-noun-style names: "Worker nodes:", "etcd:"
    // Excluded: single-word annotation markers listed in COLON_CONTINUATION_LABELS
    if (/^[a-zA-Z][a-zA-Z0-9\s\-_.]{1,55}:\s*$/.test(t)) {
        if (t.split(/\s+/).length <= 6) {
            const label = t.replace(/:\s*$/, '').toLowerCase()
                .replace(/\s+\d+$/, ''); // strip trailing numbers: "Step 1" → "step"
            if (!COLON_CONTINUATION_LABELS.has(label)) return true;
        }
    }

    return false;
}

function startsWithBoundary(block: string): boolean {
    return isLineBoundary(block.split('\n')[0].trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function contentWords(text: string): Set<string> {
    return new Set(
        stripMarkdown(text)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3 && !STOP.has(w))
    );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const w of a) if (b.has(w)) intersection++;
    return intersection / (a.size + b.size - intersection);
}

function isHeadingLine(line: string): boolean {
    const t = line.trim();
    return (
        /^#{1,6}\s+\S/.test(t) ||
        /^\*\*[^*]{3,60}\*\*\s*$/.test(t) ||
        /^__[^_]{3,60}__\s*$/.test(t) ||
        /^[A-Z][A-Z\s]{4,40}$/.test(t)
    );
}

/**
 * Check if block contains definition-like sentences — useful for study UI to
 * display a "Definitions" badge on topic cards.
 */
function hasDefinitionSignals(text: string): boolean {
    return /\bis\s+(a|an|the)\b|\bare\s+(a|an|the)\b|\bdefin|\brefer[s]?\s+to\b|\bmeans?\b/i.test(text);
}

export function extractTitle(paragraph: string, keywords: string[] = []): string {
    const lines = paragraph.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const firstLine = lines[0] || '';

    if (isLineBoundary(firstLine) || isHeadingLine(firstLine)) {
        const clean = firstLine
            .replace(/^#{1,6}\s+/, '')
            .replace(/^\d{1,3}[\.\)]\s+/, '')
            .replace(/^[IVX]+[\.\)]\s+/, '')
            .replace(/^\*\*(.+)\*\*$/, '$1')
            .replace(/^__(.+)__$/, '$1')
            .replace(/^[★✦◆▶→•–—]\s*/, '')
            .replace(/:\s*$/, '')
            .replace(/\*\*/g, '')
            .replace(/[*_#`]/g, '')
            .trim();
        if (clean.length >= 3) return clean.slice(0, 150);
    }

    if (keywords.length >= 2) {
        const main = keywords.slice(0, 3).join(', ');
        return `Concepts in ${main}`;
    }

    for (const line of lines) {
        if (/^https?:\/\//.test(line)) continue;
        const plain = line.replace(/[*_#`]/g, '').trim();
        if (plain.length >= 5) {
            const words = plain.split(' ');
            return words.slice(0, 12).join(' ') + (words.length > 12 ? '...' : '');
        }
    }

    return 'Notes & Concepts';
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — PARAGRAPH SEGMENTATION
// ─────────────────────────────────────────────────────────────────────────────
function segmentIntoParagraphs(content: string): string[] {
    const lines = content.split('\n');
    const paragraphs: string[] = [];
    let current: string[] = [];
    let hrCount = 0;
    let inCodeBlock = false;

    const flush = () => {
        const text = current.join('\n').trim();
        if (text.length > 0) paragraphs.push(text);
        current = [];
        hrCount = 0;
    };

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('```')) { inCodeBlock = !inCodeBlock; current.push(line); continue; }
        if (inCodeBlock) { current.push(line); continue; }

        const isHR = /^-{3,}\s*$/.test(trimmed) || /^\*{3,}\s*$/.test(trimmed) || /^={3,}\s*$/.test(trimmed);
        if (isHR) { hrCount++; continue; }

        if (trimmed === '') {
            if (hrCount >= 1) {
                // Any horizontal rule (1+) creates a new paragraph boundary
                flush();
            } else {
                const accumulated = current.join('\n').trim();
                if (accumulated.length > 0) { paragraphs.push(accumulated); current = []; }
            }
            continue;
        }

        if (hrCount >= 1) {
            // A horizontal rule followed immediately by content (no blank line gap)
            // also flushes the current block
            flush();
        }
        hrCount = 0;

        // Split on structural line boundaries even without blank lines
        // BUT: don't split if the previous accumulated content ends with a code fence
        // opener (code affinity — keep prose → code together)
        if (isLineBoundary(trimmed)) {
            const accumulated = current.join('\n');
            const openFences = (accumulated.match(/```/g) || []).length;
            const isInsideCode = openFences % 2 !== 0;
            if (!isInsideCode) flush();
        }

        current.push(line);
    }
    flush();

    return paragraphs.filter(p => p.trim().length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — BOUNDARY DETECTION
// ─────────────────────────────────────────────────────────────────────────────
function detectBoundaries(paragraphs: string[]): Set<number> {
    const boundaries = new Set<number>([0]);

    for (let i = 1; i < paragraphs.length; i++) {
        const cur = paragraphs[i];
        const prev = paragraphs[i - 1];
        const firstLine = cur.split('\n')[0].trim();

        if (/^#{1,2}\s+\S/.test(firstLine)) { boundaries.add(i); continue; }
        if (/^(PART|CHAPTER|UNIT|SECTION|MODULE)\s*\d+/i.test(firstLine)) { boundaries.add(i); continue; }
        if (/^\*\*[^*]{3,60}\*\*\s*$/.test(firstLine) || /^__[^_]{3,60}__\s*$/.test(firstLine)) {
            boundaries.add(i); continue;
        }
        if (/^[A-Z][A-Z\s]{5,40}$/.test(firstLine) && firstLine.split(' ').length <= 8) {
            boundaries.add(i); continue;
        }
        if (/^\d{1,2}[\.\)]\s+[A-Z]/.test(firstLine) && paragraphs[i].split('\n').length <= 2) {
            boundaries.add(i); continue;
        }
        if (/^[IVX]{1,4}[\.\)]\s+[A-Z]/.test(firstLine)) { boundaries.add(i); continue; }

        const firstLineLower = firstLine.toLowerCase();
        if (TOPIC_TRANSITIONS.some(r => r.test(firstLineLower))) {
            boundaries.add(i); continue;
        }

        const prevWords = wordCount(prev);
        const curWords = wordCount(cur);
        if (prevWords >= 20 && curWords >= 20) {
            const prevSet = contentWords(prev);
            const curSet = contentWords(cur);
            const overlap = jaccardSimilarity(prevSet, curSet);
            if (overlap < SEMANTIC_JACCARD_THRESHOLD) { boundaries.add(i); continue; }
        }
    }

    return boundaries;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — GROUP PARAGRAPHS INTO TOPIC BLOCKS
// ─────────────────────────────────────────────────────────────────────────────
function groupIntoBlocks(paragraphs: string[], boundaries: Set<number>): string[] {
    const sorted = [...boundaries].sort((a, b) => a - b);
    const blocks: string[] = [];

    for (let b = 0; b < sorted.length; b++) {
        const start = sorted[b];
        const end = sorted[b + 1] ?? paragraphs.length;
        const group = paragraphs.slice(start, end);
        if (group.length === 0) continue;

        let body = group.join('\n\n');
        const firstPara = group[0];
        const firstLine = firstPara.split('\n')[0].trim();
        const isHeadingOnly = firstPara.split('\n').filter(l => l.trim()).length === 1 && isHeadingLine(firstLine);

        if (isHeadingOnly && group.length > 1) {
            body = group.slice(1).join('\n\n');
        }

        blocks.push(body.trim());
    }

    return blocks.filter(b => b.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4 — MERGE SHORT BLOCKS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Check if a block contains an unmatched code fence — meaning a code block
 * is split across block boundaries. We need to merge these.
 */
function hasUnmatchedCodeFence(block: string): boolean {
    return (block.match(/```/g) || []).length % 2 !== 0;
}

function mergeShortBlocks(blocks: string[]): string[] {
    if (blocks.length <= 1) return blocks;
    const result: string[] = [];

    for (const block of blocks) {
        const wc = wordCount(block);
        const curIsStructured  = startsWithBoundary(block);
        const prevIsStructured = result.length > 0 && startsWithBoundary(result[result.length - 1]);

        // Tier 1: tiny unstructured orphan fragment — always absorb, no exceptions
        if (wc <= FORCE_MERGE_WORDS && !curIsStructured && result.length > 0) {
            result[result.length - 1] += '\n\n' + block;
        // Tier 2: short unstructured block — merge if neighbor is also unstructured
        } else if (wc < MIN_BLOCK_WORDS && result.length > 0 && !curIsStructured && !prevIsStructured) {
            result[result.length - 1] += '\n\n' + block;
        } else {
            result.push(block);
        }
    }

    // Tail pass: still-tiny unstructured final block
    if (result.length >= 2) {
        const last = result[result.length - 1];
        const prev = result[result.length - 2];
        if (wordCount(last) < MIN_BLOCK_WORDS &&
            !startsWithBoundary(last) &&
            !startsWithBoundary(prev)) {
            result.pop();
            result[result.length - 1] += '\n\n' + last;
        }
    }

    return result;
}

/**
 * Phase 5: Re-merge blocks that were cut mid-explanation.
 * Runs after mergeShortBlocks. Iterates until stable.
 *
 * Merges adjacent pair (A, B) when ALL of:
 *   • NOT both start with structural boundaries (those splits are intentional)
 *   • One of:
 *     a) One block is a tiny fragment (<20 words) — almost certainly a continuation
 *     b) High vocabulary similarity (Jaccard > 0.18) and combined < 200 words
 *     c) Medium similarity (> 0.10) with one block short (<50 words) and combined < 160
 */
function semanticAffinityMerge(blocks: string[]): string[] {
    if (blocks.length <= 1) return blocks;

    let changed = true;
    let result = [...blocks];

    while (changed) {
        changed = false;
        const next: string[] = [];
        let i = 0;

        while (i < result.length) {
            if (i + 1 < result.length) {
                const a = result[i];
                const b = result[i + 1];
                const wcA = wordCount(a);
                const wcB = wordCount(b);
                const combined = wcA + wcB;
                const sim = jaccardSimilarity(contentWords(a), contentWords(b));
                const bothStructured = startsWithBoundary(a) && startsWithBoundary(b);

                if (!bothStructured) {
                    const tinyFragment   = Math.min(wcA, wcB) < 20 && combined < 180;
                    const highSim        = sim > 0.18 && combined < 200;
                    const medSimOneSmall = sim > 0.10 && Math.min(wcA, wcB) < 50 && combined < 160;

                    if (tinyFragment || highSim || medSimOneSmall) {
                        next.push(a + '\n\n' + b);
                        i += 2;
                        changed = true;
                        continue;
                    }
                }
            }
            next.push(result[i]);
            i++;
        }
        result = next;
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED INTERFACE
// ─────────────────────────────────────────────────────────────────────────────
export interface ParsedTopic {
    title: string;
    body: string;
    summary: string;
    keywords: string[];
    wordCount: number;
    hasCode: boolean;
    hasDefinitions: boolean;   // ← NEW: true when block contains definition sentences
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED BLOCK-SPLITTING LOGIC  (used by both sync and async paths)
// ─────────────────────────────────────────────────────────────────────────────
function splitIntoBlocks(content: string): string[] {
    if (!content || content.trim().length === 0) return [];

    // ── Detect explicit user-placed HR separators ─────────────────────────────
    // If the note has ANY `---` on its own line, split on those strictly.
    // User-placed separators express explicit intent and must never be merged.
    const hasExplicitHR = /^-{3,}\s*$/m.test(content) || /^\*{3,}\s*$/m.test(content) || /^={3,}\s*$/m.test(content);

    if (hasExplicitHR) {
        const lines = content.split('\n');
        const blocks: string[] = [];
        let current: string[] = [];
        let inCodeBlock = false;

        const flushBlock = () => {
            const text = current.join('\n').trim();
            if (text.length > 0) blocks.push(text);
            current = [];
        };

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('```')) inCodeBlock = !inCodeBlock;
            if (!inCodeBlock && (/^-{3,}\s*$/.test(trimmed) || /^\*{3,}\s*$/.test(trimmed) || /^={3,}\s*$/.test(trimmed))) {
                flushBlock();
                continue;
            }
            current.push(line);
        }
        flushBlock();

        // Filter empties — but always respect the user's intent, even for 1-line blocks
        const valid = blocks.filter(b => b.trim().replace(/\s/g, '').length > 0);
        if (valid.length > 1) return valid;
        // Single result means all separators were decorative (e.g., fenced code); fall through
    }

    // ── Heuristic semantic split for notes without explicit separators ────────
    const paragraphs = segmentIntoParagraphs(content);
    if (paragraphs.length === 0) return [content.trim()];

    const boundaries = detectBoundaries(paragraphs);
    let blocks = groupIntoBlocks(paragraphs, boundaries);
    blocks = mergeShortBlocks(blocks);
    blocks = semanticAffinityMerge(blocks);

    return blocks.length > 0 ? blocks : [content.trim()];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SYNC EXPORT  (drop-in compatible — unchanged behaviour)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * smartSplitTopics — sync, zero-API, instant.
 * Uses: TF-IDF LexRank + BM25 + TextRank + LSA + MMR (v2 pipeline).
 * Drop-in replacement for v1 — same return type.
 */
export function smartSplitTopics(content: string): ParsedTopic[] {
    if (!content || content.trim().length === 0) {
        return [{
            title: 'Empty Note',
            body: '',
            summary: '',
            keywords: [],
            wordCount: 0,
            hasCode: false,
            hasDefinitions: false,
        }];
    }

    // ── Always split first so --- separators are respected ────────────────────
    const blocks = splitIntoBlocks(content);

    // Single-block short-circuit only when there truly is one block
    if (blocks.length === 1) {
        const keywords = extractKeywords(content, 8);
        const title = extractTitle(content, keywords);
        return [{
            title,
            body: content.trim(),
            summary: generateDeepSummary(content.trim(), title),
            keywords,
            wordCount: wordCount(content),
            hasCode: /```[\s\S]*?```/.test(content),
            hasDefinitions: hasDefinitionSignals(content),
        }];
    }

    return blocks.map(block => {
        const keywords = extractKeywords(block, 8);
        const title = extractTitle(block, keywords);
        const summary = generateDeepSummary(block, title);
        return {
            title,
            body: block.trim(),
            summary,
            keywords,
            wordCount: wordCount(block),
            hasCode: /```[\s\S]*?```/.test(block),
            hasDefinitions: hasDefinitionSignals(block),
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ASYNC EXPORT  (uses full v2 summarizer — richer summaries, offline)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * smartSplitTopicsAsync — async, zero-API, zero network.
 * Same splitting logic as smartSplitTopics, but generates each block's
 * summary using the full async pipeline:
 *   • LSA + TextRank + LexRank + BM25 + MMR
 *   • Section-aware sentence budget (scales with block length)
 *   • Output mode: 'paragraph' (clean prose, suitable for all UI)
 *   • 100% offline — no CDN, no native modules, works on Android
 *
 * Use this path in runAiAnalysis when the Gemini key is absent.
 */
export async function smartSplitTopicsAsync(content: string): Promise<ParsedTopic[]> {
    if (!content || content.trim().length === 0) {
        return [{
            title: 'Empty Note',
            body: '',
            summary: '',
            keywords: [],
            wordCount: 0,
            hasCode: false,
            hasDefinitions: false,
        }];
    }

    // ── Always split first so --- separators are respected ────────────────────
    const blocks = splitIntoBlocks(content);

    // Single-block short-circuit only when there truly is one block
    if (blocks.length === 1) {
        const keywords = extractKeywords(content, 8);
        const title = extractTitle(content, keywords);
        const summary = await generateDeepSummaryAsync(content.trim(), title);
        return [{
            title,
            body: content.trim(),
            summary,
            keywords,
            wordCount: wordCount(content),
            hasCode: /```[\s\S]*?```/.test(content),
            hasDefinitions: hasDefinitionSignals(content),
        }];
    }

    const topics: ParsedTopic[] = await Promise.all(
        blocks.map(async block => {
            const wc = wordCount(block);
            const keywords = extractKeywords(block, 8);
            const title = extractTitle(block, keywords);

            // Generate deep summary using the new engine
            const summary = await generateDeepSummaryAsync(block, title);

            return {
                title,
                body: block.trim(),
                summary,
                keywords,
                wordCount: wc,
                hasCode: /```[\s\S]*?```/.test(block),
                hasDefinitions: hasDefinitionSignals(block),
            };
        })
    );

    return topics;
}
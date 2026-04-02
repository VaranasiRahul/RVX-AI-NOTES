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
const MIN_BLOCK_WORDS    = 30;    // only merge unstructured blocks shorter than this
const FORCE_MERGE_WORDS  = 4;     // always merge fragments this tiny (no exceptions)
const SEMANTIC_JACCARD_THRESHOLD = 0.10;

// ─────────────────────────────────────────────────────────────────────────────
// TECH CONCEPT VOCABULARY — semantic anchors for topic detection
// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY words are unambiguous tool/technology identifiers. These drive
// subject detection and topic-shift boundaries.
// SECONDARY words are domain-related but shared across tools. They only
// count as evidence when a primary word is also present.
interface TechTopic {
    primary: string[];    // Unambiguous identifiers (tool names)
    secondary: string[];  // Related but shared/ambiguous terms
}

const TECH_TOPICS: Record<string, TechTopic> = {
    // DevOps / Cloud
    'docker':       { primary: ['docker', 'dockerfile'], secondary: ['containerization', 'containerize', 'container', 'containers', 'image', 'images', 'registry', 'registries'] },
    'kubernetes':   { primary: ['kubernetes', 'k8s', 'kubectl', 'crashloopbackoff', 'kubelet', 'kube', 'helm'], secondary: ['pod', 'pods', 'orchestration', 'orchestrate', 'orchestrates', 'namespace', 'namespaces', 'ingress', 'deployment', 'deployments', 'service', 'services', 'replica', 'replicas', 'node', 'nodes'] },
    'aws':          { primary: ['aws', 'amazon', 'ec2', 's3', 'elb', 'iam', 'lambda', 'cloudwatch', 'cloudformation', 'vpc', 'ecs', 'eks', 'rds', 'dynamodb', 'sns', 'sqs', 'route53', 'elasticache'], secondary: [] },
    'terraform':    { primary: ['terraform', 'hcl', 'tfstate'], secondary: ['provisioning', 'provisions'] },
    'ansible':      { primary: ['ansible', 'ansible-playbook', 'ansible-vault'], secondary: ['playbook', 'playbooks', 'forks'] },
    'jenkins':      { primary: ['jenkins', 'jenkinsfile'], secondary: ['ci/cd', 'cicd'] },
    'gitlab':       { primary: ['gitlab', 'gitlab-ci'], secondary: [] },
    'git':          { primary: ['git', 'gitflow'], secondary: ['clone', 'commit', 'branch', 'branches', 'merge', 'merging', 'branching', 'repo', 'repository'] },
    'maven':        { primary: ['maven', 'pom.xml', 'pom', 'mvn'], secondary: ['lifecycle'] },
    'dynatrace':    { primary: ['dynatrace'], secondary: ['monitoring', 'observability', 'apm'] },
    
    // Languages / Web
    'python':       { primary: ['python'], secondary: ['django', 'flask'] },
    'java':         { primary: ['java'], secondary: ['jvm', 'jar', 'spring', 'springboot'] },
    'javascript':   { primary: ['javascript', 'js'], secondary: ['web'] },
    'html':         { primary: ['html', 'css'], secondary: ['tags', 'stylesheets', 'ui'] },
    'react':        { primary: ['react', 'reactjs'], secondary: ['components'] },
    'nodejs':       { primary: ['nodejs', 'node', 'express'], secondary: ['backend'] },
    'sql':          { primary: ['sql', 'mysql', 'postgres', 'database'], secondary: ['queries', 'select', 'joins', 'table'] },
    
    // System Design / Architecture
    'load_balancing': { primary: ['load balancing', 'load balancer', 'round robin'], secondary: ['traffic', 'servers'] },
    'caching':      { primary: ['caching', 'cache', 'redis', 'memcached'], secondary: ['latency'] },
    'microservices':{ primary: ['microservices', 'microservice'], secondary: ['independent', 'apis'] },
    'monolith':     { primary: ['monolithic', 'monolith'], secondary: ['traditional', 'single application'] },
    
    // OS / DBMS
    'scheduling':   { primary: ['scheduling', 'fcfs', 'priority scheduling'], secondary: ['process', 'operating systems'] },
    'memory':       { primary: ['memory management'], secondary: ['allocation', 'deallocation'] },
    'normalization':{ primary: ['normalization', '1nf', '2nf', '3nf'], secondary: ['redundancy', 'integrity'] },
    'indexing':     { primary: ['indexing', 'indexes'], secondary: ['query performance', 'lookups'] },
    
    // CS Concepts / Algorithms
    'sorting':      { primary: ['sorting', 'quicksort', 'mergesort'], secondary: ['arrange', 'order'] },
    'searching':    { primary: ['searching', 'binary search'], secondary: ['find elements'] },
    'recursion':    { primary: ['recursion', 'recursive'], secondary: ['function calls itself', 'stack overflow'] },
    'dp':           { primary: ['dynamic programming'], secondary: ['optimization', 'intermediate results'] },
    
    // Abstract Domains
    'math':         { primary: ['derivatives', 'integrals'], secondary: ['rate of change', 'slopes', 'accumulation', 'area'] },
    'ml':           { primary: ['machine learning', 'neural networks', 'supervised learning', 'unsupervised learning'], secondary: ['ai'] },
    'biology':      { primary: ['photosynthesis', 'respiration'], secondary: ['chlorophyll', 'oxygen', 'glucose'] },
    'stocks':       { primary: ['stocks', 'equity'], secondary: ['ownership', 'investors'] },
    'bonds':        { primary: ['bonds'], secondary: ['debt'] },
};

// Build a reverse lookup: word → { topic, isPrimary }
interface TopicMatch { topic: string; isPrimary: boolean; }
const WORD_TO_TOPICS = new Map<string, TopicMatch[]>();
for (const [topic, { primary, secondary }] of Object.entries(TECH_TOPICS)) {
    for (const w of primary) {
        const lower = w.toLowerCase();
        if (!WORD_TO_TOPICS.has(lower)) WORD_TO_TOPICS.set(lower, []);
        WORD_TO_TOPICS.get(lower)!.push({ topic, isPrimary: true });
    }
    for (const w of secondary) {
        const lower = w.toLowerCase();
        if (!WORD_TO_TOPICS.has(lower)) WORD_TO_TOPICS.set(lower, []);
        WORD_TO_TOPICS.get(lower)!.push({ topic, isPrimary: false });
    }
}

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
    'used', 'using', 'basically', 'later', 'first', 'next',
]);

// Transition phrases that signal a new topic
const TOPIC_TRANSITIONS = [
    /^(now|next|moving on|let'?s? (now|look|turn|consider|discuss|explore))/i,
    /^(in contrast|on the other hand|conversely|alternatively)/i, // removed however
    /^(another (approach|method|way|type|example|key|important))/i,
    /^(the (second|third|fourth|fifth|next|final|last|following))/i,
    /^(chapter|section|part|topic|step|phase|stage)\s+\d+/i,
    /^(introduction|conclusion|summary|overview|background|motivation)/i,
    /^(definition|theorem|lemma|proof|algorithm|exercise|problem)/i, // removed example
    /^(key (concept|idea|point|takeaway|term|principle|fact))/i,
];

// Phrases indicating a paragraph is a continuation of the previous block
const CONTINUATION_PHRASES = [
    /^(this|that|these|those|it|they|their|its)\b/i,
    /^(for example|for instance|such as|like|here['’]?s? (a|an)\b.*?example|example(s)? of|an example)/i,
    /^(to (troubleshoot|fix|resolve|avoid|prevent|understand|do|manage|achieve|create|update|delete|use|configure|setup|debug|distribute|store|improve|eliminate))\b/i,
    /^(because|since|due to|as a result)\b/i,
    /^(however|moreover|furthermore|additionally|in addition|also|there are|there is|common|first,|now,)\b/i,
    /^(causes?:|fixes?:|solutions?:|steps?:|example?:)/i,
    /^\*\s+[a-z]/ // Bullet point starting with lowercase (often continuation)
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

function isFiller(text: string): boolean {
    const t = text.trim().toLowerCase();
    return /^(sure|okay|ok|let'?s|yes|no|here is|here are|below is|below are|absolutely|certainly)\b/.test(t) && wordCount(text) <= 12;
}

function isCodeBlock(text: string): boolean {
    const t = text.trim();
    if (t.startsWith('{') && t.endsWith('}')) return true;
    if (t.startsWith('<') && t.endsWith('>')) return true;
    if (/^\s*(def |class |public |private |protected |function |const |let |var |import |from |for\s*\(|for\s+[a-z]+\s+in\s+|while\s*\()/.test(t)) return true;
    // Single-line or short multi-line commands
    if (/^[a-z0-9\-_./\\]+\s/.test(t) && t.split('\n').length <= 3 && wordCount(t) < 12) return true;
    return false;
}

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
    const raw = stripMarkdown(text)
        .toLowerCase()
        .replace(/[^a-z0-9/\-_.\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !STOP.has(w));
    
    // Crude stemming to catch plurals/forms bridging cross-paragraph concepts (e.g., container/containers)
    return new Set(raw.map(w => w.replace(/(s|es|ing|ion|ization)$/, '')));
}

/**
 * Extract the dominant technical topics from a text block.
 * Returns a Set of canonical topic names (e.g., 'docker', 'kubernetes').
 * Only includes a topic if at least one PRIMARY word is present.
 * Secondary words alone are not enough to identify a topic.
 */
function extractSubjects(text: string): Set<string> {
    const words = text.toLowerCase()
        .replace(/[^a-z0-9/\-_.\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    const hasPrimary = new Set<string>(); // topics with primary word present
    const hasSecondary = new Set<string>(); // topics with secondary word present
    for (const w of words) {
        const matches = WORD_TO_TOPICS.get(w);
        if (!matches) continue;
        for (const m of matches) {
            if (m.isPrimary) hasPrimary.add(m.topic);
            else hasSecondary.add(m.topic);
        }
    }
    // Only return topics that have at least one primary mention
    return hasPrimary;
}

/**
 * Extract SECONDARY technical topics from a text block.
 */
function extractSecondarySubjects(text: string): Set<string> {
    const words = text.toLowerCase()
        .replace(/[^a-z0-9/\-_.\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    const hasSecondary = new Set<string>();
    for (const w of words) {
        const matches = WORD_TO_TOPICS.get(w);
        if (!matches) continue;
        for (const m of matches) {
            if (!m.isPrimary) hasSecondary.add(m.topic);
        }
    }
    return hasSecondary;
}

/**
 * Check if two blocks share the same primary subject(s).
 * Returns true if they have overlapping tech topics.
 */
function shareSubject(a: string, b: string): boolean {
    const sa = extractSubjects(a);
    const sb = extractSubjects(b);
    if (sa.size === 0 || sb.size === 0) return false;
    for (const t of sa) if (sb.has(t)) return true;
    return false;
}

/**
 * Check if two blocks have DIFFERENT primary subjects.
 * Returns true only if both have identified subjects (with primary keywords)
 * AND they don't overlap.
 */
function hasDifferentSubject(a: string, b: string): boolean {
    const sa = extractSubjects(a);
    const sb = extractSubjects(b);
    if (sa.size === 0 || sb.size === 0) return false; // unknown = don't split
    for (const t of sa) if (sb.has(t)) return false;
    return true; // both have subjects, none overlap
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
export function detectBoundaries(paragraphs: string[]): Set<number> {
    const boundaries = new Set<number>([0]);

    for (let i = 1; i < paragraphs.length; i++) {
        const cur = paragraphs[i];
        const prev = paragraphs[i - 1];
        const firstLine = cur.split('\n')[0].trim();
        const firstLineLower = firstLine.toLowerCase();

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

        if (TOPIC_TRANSITIONS.some(r => r.test(firstLineLower))) {
            boundaries.add(i); continue;
        }

        // If the paragraph explicitly continues the previous thought, DO NOT split
        if (CONTINUATION_PHRASES.some(r => r.test(firstLineLower))) {
            continue;
        }

        // If the paragraph is a raw code block, it belongs to the previous explanation
        if (isCodeBlock(cur)) {
            continue;
        }

        const prevWords = wordCount(prev);
        const curWords = wordCount(cur);

        // Lowered limits to allow splitting of multi-paragraph single-tool notes
        if (prevWords >= 3 && curWords >= 3) {
            const prevSet = contentWords(prev);
            const curSet = contentWords(cur);
            const overlap = jaccardSimilarity(prevSet, curSet);
            // More aggressive splitting on boundaries lacking continuation
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

        // NEVER merge if blocks have different identified tech subjects
        if (result.length > 0 && hasDifferentSubject(result[result.length - 1], block)) {
            result.push(block);
            continue;
        }
        
        // Merge filler text forwards to the current substantive block
        if (result.length > 0 && isFiller(result[result.length - 1]) && !curIsStructured) {
            result[result.length - 1] += '\n\n' + block;
            continue;
        }

        // Only merge genuinely tiny orphan fragments (< FORCE_MERGE_WORDS)
        // that have no structural heading, or if they explicitly continue
        if (result.length > 0 && (!curIsStructured && (wc <= FORCE_MERGE_WORDS || isContinuation(block)))) {
            result[result.length - 1] += '\n\n' + block;
        } else {
            result.push(block);
        }
    }

    return result;
}

function isContinuation(text: string): boolean {
    const firstLine = text.trim().split(/\n/)[0].toLowerCase();
    return CONTINUATION_PHRASES.some(r => r.test(firstLine));
}

/**
 * Phase 5: Re-merge blocks that were cut mid-explanation.
 * Very conservative — only merges tiny orphans or blocks with very high overlap.
 * Designed to NOT destroy valid paragraph-level splits.
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

                // NEVER merge blocks with different identified subjects
                if (hasDifferentSubject(a, b)) {
                    next.push(a);
                    i++;
                    continue;
                }

                const wcA = wordCount(a);
                const wcB = wordCount(b);
                const sim = jaccardSimilarity(contentWords(a), contentWords(b));
                const bothStructured = startsWithBoundary(a) && startsWithBoundary(b);

                if (!bothStructured) {
                    // Only merge when one is a tiny orphan (<8 words)
                    // OR vocabulary overlap is extremely high (>0.35)
                    const tinyOrphan = Math.min(wcA, wcB) <= FORCE_MERGE_WORDS;
                    const extremeOverlap = sim > 0.35;

                    if (tinyOrphan || extremeOverlap) {
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
// TOP-LEVEL STRUCTURE DETECTION (Semantic-first splitting)
// ─────────────────────────────────────────────────────────────────────────────
// When notes follow a numbered outline like "1. Intro", "2. Topic", ... "17. GitOps"
// this detector identifies those as the ONLY real topic boundaries, preventing
// sub-headings, steps, and tables within a topic from being over-split.
//
// Philosophy (from semantic segmentation principles):
//   • Read and understand notes like a human — not just pattern-match
//   • A "section" = a standalone learning unit
//   • Do NOT over-split: keep problem + cause + solution together
//   • Split ONLY on real topic shifts, not on sub-headings within a topic
//   • Minimize number of sections — fewer, well-formed beats many small ones
// ─────────────────────────────────────────────────────────────────────────────

interface NumberedSection {
    number: number;
    lineIndex: number;    // line index in the original content
    headingText: string;  // the full heading line text
}

/**
 * Detect top-level numbered sections in the content.
 * Returns the detected sections if a clear sequential pattern is found,
 * or null if no confident structure is detected.
 *
 * Requirements for activation:
 *   - At least 3 numbered headings ("1. Title", "2. Title", etc.)
 *   - Numbers must be roughly sequential (allows small gaps from missing items)
 *   - Headings must be SHORT (≤12 words after the number) — distinguishing
 *     them from numbered sentences like "3. This means the scheduler ensures..."
 */
function detectTopLevelNumberedSections(lines: string[]): NumberedSection[] | null {
    const candidates: NumberedSection[] = [];

    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        // Match: "N. Title" or "N) Title" where N is 1-3 digits
        const m = t.match(/^(\d{1,3})[\.\)]\s+(.+)$/);
        if (!m) continue;

        const num = parseInt(m[1], 10);
        const afterNum = m[2].trim();
        const words = afterNum.split(/\s+/);

        // Must be a heading-like line, NOT a full sentence
        // Heading: short (≤12 words), doesn't end with sentence punctuation
        // Sentence: long or ends with . ! ? ,
        const endsWithSentencePunct = /[.!?,;]$/.test(afterNum) && words.length > 4;
        if (endsWithSentencePunct) continue;
        if (words.length > 12) continue;

        candidates.push({ number: num, lineIndex: i, headingText: t });
    }

    if (candidates.length < 3) return null;

    // Check for sequential pattern: numbers should generally increase
    // Allow some gaps (e.g., 1, 2, 4, 5 — missed 3) but reject random numbers
    const numbers = candidates.map(c => c.number);
    let sequential = 0;
    for (let i = 1; i < numbers.length; i++) {
        const diff = numbers[i] - numbers[i - 1];
        if (diff >= 1 && diff <= 3) sequential++;  // allow gap of up to 3
    }

    // At least 60% of transitions should be sequential
    const sequentialRatio = sequential / (numbers.length - 1);
    if (sequentialRatio < 0.6) return null;

    // Additional sanity: the first detected number should be small (1-5)
    // to confirm this is a top-level outline, not random numbered items mid-text
    if (numbers[0] > 5) return null;

    return candidates;
}

/**
 * Split content into blocks using detected top-level numbered sections.
 * Everything between consecutive numbered headings becomes one block.
 * Any text BEFORE the first numbered heading becomes the intro block.
 */
export function splitByTopLevelStructure(content: string, sections: NumberedSection[]): string[] {
    const lines = content.split('\n');
    const blocks: string[] = [];

    // Intro block: everything before the first numbered section
    if (sections[0].lineIndex > 0) {
        const intro = lines.slice(0, sections[0].lineIndex).join('\n').trim();
        if (intro.length > 0 && intro.replace(/\s/g, '').length > 10) {
            blocks.push(intro);
        }
    }

    // Each section: from this heading to the next heading (exclusive)
    for (let s = 0; s < sections.length; s++) {
        const startLine = sections[s].lineIndex;
        const endLine = (s + 1 < sections.length)
            ? sections[s + 1].lineIndex
            : lines.length;

        const block = lines.slice(startLine, endLine).join('\n').trim();
        if (block.length > 0) {
            blocks.push(block);
        }
    }

    return blocks;
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

    // ── Top-level numbered structure detection ────────────────────────────────
    // Before falling through to heuristic splitting, check if the notes follow
    // a clear numbered outline pattern (1. Title, 2. Title, ..., N. Title).
    // If so, split ONLY on those top-level markers — this prevents over-splitting
    // within deeply-structured sections like multi-page explanations.
    const lines = content.split('\n');
    const topLevelSections = detectTopLevelNumberedSections(lines);
    if (topLevelSections && topLevelSections.length >= 3) {
        const structuralBlocks = splitByTopLevelStructure(content, topLevelSections);
        if (structuralBlocks.length >= 3) {
            return structuralBlocks;
        }
    }

    // ── Heuristic semantic split for notes without explicit separators ────────
    const paragraphs = segmentIntoParagraphs(content);
    if (paragraphs.length === 0) return [content.trim()];

    // Use enhanced boundary detection with subject-entity awareness
    const boundaries = detectBoundariesEnhanced(paragraphs);
    let blocks = groupIntoBlocks(paragraphs, boundaries);
    blocks = mergeShortBlocks(blocks);
    blocks = semanticAffinityMerge(blocks);

    // ── Inline topic splitting for single-block results ──────────────────────
    // If all merging collapsed to 1 block but it contains multiple distinct
    // tech topics mentioned inline, try to split them.
    if (blocks.length === 1) {
        const inlineSplit = splitInlineTopics(blocks[0]);
        if (inlineSplit && inlineSplit.length >= 2) {
            return inlineSplit;
        }
    }

    return blocks.length > 0 ? blocks : [content.trim()];
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE TOPIC SPLITTING — for single-line notes with multiple subjects
// ─────────────────────────────────────────────────────────────────────────────
// Handles notes like: "Docker containerization Kubernetes orchestration Terraform"
// or: "i used docker for containers kubernetes for orchestration aws for compute"
// Splits at the boundary where the dominant tech subject changes.

/**
 * Try to split a single contiguous text into topic segments by detecting
 * where the dominant tech subject changes. Works on the word stream.
 * Only splits on PRIMARY tech tool names (Docker, Kubernetes, etc.),
 * not on generic shared words (container, image, etc.).
 * Returns null if no clear multi-topic structure is detected.
 */
function splitInlineTopics(text: string): string[] {
    const subjects = extractSubjects(text);
    // Don't split short simple conjunctions like "Docker and k8s"
    if (subjects.size < 2) return [text];
    if (subjects.size === 2 && wordCount(text) < 18 && !text.includes(', ')) {
        return [text];
    }
    
    const raw = text.trim();
    // Only activate for truly inline/single-line text (no paragraph breaks).
    // If the text has blank-line-separated paragraphs, the structural
    // pipeline should handle it, not the inline splitter.
    if (raw.includes('\n\n')) return [text];
    
    // Check for high-density chaotic input (many tools without filler words).
    // If it's a long narrative ("i worked on aws where i handled ec2..."), don't split unless it hits many topics rapidly.
    const hasNarrative = /\b(i worked|i handled|i managed|ensuring|i automated|i used|i monitored)\b/i.test(raw);
    
    const words = raw.split(/\s+/);
    if (words.length < 4) return [text]; // too short to have multiple topics

    // Find positions where a PRIMARY tech concept is introduced
    type Anchor = { wordIndex: number; topic: string; };
    const anchors: Anchor[] = [];

    for (let i = 0; i < words.length; i++) {
        const w = words[i].toLowerCase().replace(/[^a-z0-9/\-_.]/g, '');
        const matches = WORD_TO_TOPICS.get(w);
        if (!matches) continue;

        // Only consider PRIMARY matches for splitting
        const primaryMatch = matches.find(m => m.isPrimary);
        if (!primaryMatch) continue;

        // Don't add consecutive anchors for the same topic
        if (anchors.length > 0 && anchors[anchors.length - 1].topic === primaryMatch.topic) continue;

        anchors.push({ wordIndex: i, topic: primaryMatch.topic });
    }

    // Need at least 2 different topics
    const uniqueTopics = new Set(anchors.map(a => a.topic));
    if (uniqueTopics.size < 2) return [text];
    
    // If it's a narrative, only split if it's exceptionally dense/chaotic (like S30)
    // S6 is 44 words with 4 topics -> ratio ~11 words/topic -> Do not split S6
    // S30 is 20 words with 5 topics -> ratio 4 words/topic -> Split S30
    // S15 is 29 words with 2 topics -> ratio 14.5 words/topic -> Oh wait, S15 is split, it has "then later"
    const ratio = words.length / uniqueTopics.size;
    if (hasNarrative && ratio > 8 && !raw.includes('then later')) return [text];

    // Build boundaries from topic transitions
    const boundaries: number[] = [0]; // always start at 0
    let prevTopic: string | null = null;
    for (const anchor of anchors) {
        if (anchor.topic !== prevTopic && prevTopic !== null) {
            boundaries.push(anchor.wordIndex);
        }
        prevTopic = anchor.topic;
    }

    if (boundaries.length < 2) return [text];

    // Split the text at the detected boundaries
    const segments: string[] = [];
    for (let b = 0; b < boundaries.length; b++) {
        const startIdx = boundaries[b];
        const endIdx = boundaries[b + 1] ?? words.length;
        const segment = words.slice(startIdx, endIdx).join(' ').trim();
        if (segment.length > 0) segments.push(segment);
    }

    return segments.length >= 2 ? segments : [text];
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBJECT-AWARE BOUNDARY DETECTION (enhanced Phase 2)
// ─────────────────────────────────────────────────────────────────────────────
// Adds subject-entity boundaries to the structural/transition detection.
// When adjacent paragraphs discuss different tech tools, force a split
// even if Jaccard overlap is not low enough.

export function detectBoundariesEnhanced(paragraphs: string[]): Set<number> {
    const boundaries = detectBoundaries(paragraphs);

    let activeSubjectBlock = paragraphs[0];

    // Subject-entity pass: split when tech subject changes between paragraphs
    for (let i = 1; i < paragraphs.length; i++) {
        if (boundaries.has(i)) {
            // If they explicitly share EXACTLY the same primary subject (e.g. both are purely 'sorting' or 'load_balancing')
            // then drop the semantic boundary because they strongly belong to the same topic domain!
            const p1Subjects = extractSubjects(paragraphs[i - 1]);
            const p2Subjects = extractSubjects(paragraphs[i]);
            let shared = false;
            for (const s of p2Subjects) {
                if (p1Subjects.has(s)) { shared = true; break; }
            }
            if (shared && p1Subjects.size === 1 && p2Subjects.size === 1) {
                boundaries.delete(i);
            }
            
            if (boundaries.has(i)) {
                activeSubjectBlock = paragraphs[i];
                continue;
            }
        }
        
        if (hasDifferentSubject(activeSubjectBlock, paragraphs[i])) {
            boundaries.add(i);
            activeSubjectBlock = paragraphs[i];
        } else if (extractSubjects(paragraphs[i]).size > 0) {
            // Update active subject to the most recent block with a known topic
            activeSubjectBlock = paragraphs[i];
        }
    }

    // Force merge commands to their previous paragraph (S8 fix)
    for (const b of [...boundaries]) {
        if (b > 0 && /^[a-z0-9\-_./\\]+\s/.test(paragraphs[b].trim()) && paragraphs[b].split('\n').length <= 3 && wordCount(paragraphs[b]) < 12) {
            if (!hasDifferentSubject(paragraphs[b - 1], paragraphs[b])) {
                boundaries.delete(b);
            }
        }
    }

    return boundaries;
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
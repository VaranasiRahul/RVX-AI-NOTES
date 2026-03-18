/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║       DEEP SUMMARIZER  v2.0 — Teacher-Style On-Device Explanations         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  v2 changes (generator functions only — all parsers unchanged):            ║
 * ║                                                                             ║
 * ║  NEW  classifySentence()    — tags every sentence by its logical role      ║
 * ║       (definition / mechanism / purpose / consequence / example ...)       ║
 * ║                                                                             ║
 * ║  NEW  buildExplanatoryFlow() — assembles sentences in teacher order        ║
 * ║       definition → mechanism → purpose → property → example, with         ║
 * ║       role-matched connectives so prose flows instead of just stacking     ║
 * ║                                                                             ║
 * ║  REPLACED  generateOverview()                                              ║
 * ║       v1: plugged keywords into a fixed template ("This section covers…") ║
 * ║       v2: finds the real definition sentence in the notes and uses it      ║
 * ║           as the opening line, then adds mechanism + section preview       ║
 * ║                                                                             ║
 * ║  REPLACED  generateSectionSummary()                                        ║
 * ║       v1: scored sentences by keyword density → concatenated them          ║
 * ║           (still extractive, no connection between sentences)              ║
 * ║       v2: routes sentences through buildExplanatoryFlow() so the output    ║
 * ║           reads: what-it-is → how-it-works → why-it-matters → example     ║
 * ║                                                                             ║
 * ║  REPLACED  generateCodeExplanation() + NEW analyzeCodeContent()            ║
 * ║       v1: one-line label ("The following typescript code defines X:")      ║
 * ║       v2: reads the code AST-lite — extracts function signature, YAML      ║
 * ║           key fields, command names, loop/recursion patterns — and writes  ║
 * ║           a 1–2 sentence description of WHAT the code actually does        ║
 * ║                                                                             ║
 * ║  REPLACED  generateKeyTakeaways()                                          ║
 * ║       v1: first sentences of sections + "Core concepts: **X**, **Y**"     ║
 * ║       v2: targets exam/interview content specifically:                      ║
 * ║           definitions, distinctions, "when to use", complexity,            ║
 * ║           "important/note/remember" sentences, key commands                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Copyright (c) 2026 Rahul Varanasi. All Rights Reserved.
 * This file is part of RVX AI Notes — proprietary software.
 * Unauthorized copying, distribution, or use is strictly prohibited.
 */

import {
    extractKeywords,
    stripMarkdown,
} from './localSummarizer';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES  (unchanged from v1)
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedSection {
    heading: string;
    level: number;
    paragraphs: string[];
    codeBlocks: ParsedCodeBlock[];
    lists: ParsedList[];
    definitions: string[];
    tables: string[];
    blockquotes: string[];
}

interface ParsedCodeBlock {
    lang: string;
    content: string;
    lineCount: number;
    purpose: CodePurpose;
    contextBefore: string;
    contextAfter: string;
}

type CodePurpose =
    | 'command'
    | 'import'
    | 'definition'
    | 'configuration'
    | 'example'
    | 'algorithm'
    | 'query'
    | 'snippet';

interface ParsedList {
    type: 'bullet' | 'numbered';
    items: string[];
    introSentence: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STOP WORDS  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const COMMON_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'shall', 'can', 'need', 'this', 'that', 'these', 'those', 'it', 'its',
    'he', 'she', 'they', 'we', 'i', 'you', 'him', 'her', 'them', 'us',
    'my', 'your', 'his', 'their', 'our', 'what', 'which', 'who', 'whom',
    'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same',
    'so', 'than', 'too', 'very', 'just', 'also', 'then', 'there', 'here',
    'now', 'as', 'after', 'before', 'above', 'below', 'between', 'out',
    'off', 'over', 'under', 'any', 'because', 'while', 'however', 'get',
    'got', 'make', 'use', 'go', 'going', 'know', 'think', 'see', 'look',
    'want', 'give', 'find', 'tell', 'ask', 'try', 'call', 'keep', 'let',
    'show', 'take', 'come', 'new', 'way', 'used', 'using',
]);

// ─────────────────────────────────────────────────────────────────────────────
// CODE PURPOSE DETECTION  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const SHELL_LANGS = new Set([
    'bash', 'sh', 'shell', 'terminal', 'cmd', 'powershell', 'zsh', 'fish',
    'console', 'command', 'cli',
]);

const CONFIG_LANGS = new Set([
    'yaml', 'yml', 'json', 'toml', 'ini', 'env', 'xml', 'properties',
    'dockerfile', 'docker-compose', 'nginx', 'apache', 'conf',
]);

function detectCodePurpose(lang: string, content: string): CodePurpose {
    const langLower = lang.toLowerCase();
    const contentLower = content.toLowerCase();

    if (SHELL_LANGS.has(langLower)) return 'command';
    if (CONFIG_LANGS.has(langLower)) return 'configuration';

    if (/^\s*\$\s+\S/m.test(content)) return 'command';
    if (/^\s*(npm|pip|brew|apt|yum|docker|kubectl|git|make|cargo|go)\s/m.test(content)) return 'command';

    if (/^\s*(import|from\s+\S+\s+import|require\s*\(|#include|use\s+)/m.test(content)) return 'import';

    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|JOIN)\b/im.test(content)) return 'query';

    if (/^\s*(class|struct|interface|enum|type)\s+\w+/m.test(content)) return 'definition';
    if (/^\s*(def|func|function|fn|sub|const|let|var)\s+\w+/m.test(content)) return 'definition';
    if (/^\s*(export\s+(default\s+)?(class|function|const|interface|type))/m.test(content)) return 'definition';

    if (/^\s*(if|else|while|for|switch|case|try|catch)\b/m.test(content) &&
        content.split('\n').filter(l => l.trim()).length > 3) return 'algorithm';

    if (/^[{[]/.test(content.trim()) && (langLower === 'json' || langLower === '')) return 'configuration';

    if (contentLower.includes('output') || contentLower.includes('result') ||
        contentLower.includes('example') || /^[>#\s]/.test(content.trim())) return 'example';

    return 'snippet';
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFINITION DETECTION  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const DEFINITION_PATTERNS: RegExp[] = [
    /^(.{3,40})\s+(?:is|are)\s+(a|an|the)\s+(.+)/i,
    /^(.{3,40})\s+(?:refers?\s+to|means?)\s+(.+)/i,
    /^(.{3,40})\s*(?:—|–|-|:)\s+(.+)/,
    /^(.{3,40})\s+(?:can\s+be\s+defined\s+as|is\s+defined\s+as)\s+(.+)/i,
    /^(.{3,40})\s+(?:describes?|represents?)\s+(a|an|the)\s+(.+)/i,
];

function extractDefinition(sentence: string): { term: string; definition: string } | null {
    const clean = sentence.replace(/^\s*[-•*]\s+/, '').trim();
    for (const pattern of DEFINITION_PATTERNS) {
        const match = clean.match(pattern);
        if (match) {
            const term = match[1].replace(/\*\*/g, '').replace(/`/g, '').trim();
            const rest = clean.slice(match[1].length).trim();
            if (term.length >= 2 && term.length <= 50 && rest.length > 15) {
                return { term, definition: rest };
            }
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT TYPE DETECTION  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

type ContentType = 'tutorial' | 'reference' | 'theory' | 'command-reference' | 'mixed';

function detectContentType(text: string): ContentType {
    const codeBlockCount = (text.match(/```/g) || []).length / 2;
    const lineCount = text.split('\n').length;
    const codeRatio = codeBlockCount / Math.max(lineCount / 10, 1);

    const hasStepPattern = /step\s*\d|first|then|next|finally/i.test(text);
    const hasDefPattern = /\bis\s+(a|an|the)\b|\brefers?\s+to\b|\bmeans?\b/i.test(text);
    const hasShellCmds = /^\s*\$\s+/m.test(text) || /```(bash|sh|shell|terminal)/i.test(text);

    if (hasShellCmds && codeRatio > 0.4) return 'command-reference';
    if (hasStepPattern && codeRatio > 0.2) return 'tutorial';
    if (hasDefPattern && codeRatio < 0.15) return 'theory';
    if (codeRatio > 0.3) return 'reference';
    return 'mixed';
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL PARSER  (unchanged — this is the expensive work, it's fine)
// ─────────────────────────────────────────────────────────────────────────────

function parseMarkdownStructure(markdown: string): ParsedSection[] {
    const lines = markdown.split('\n');
    const sections: ParsedSection[] = [];

    let currentSection: ParsedSection = {
        heading: '', level: 0, paragraphs: [], codeBlocks: [],
        lists: [], definitions: [], tables: [], blockquotes: [],
    };

    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockContent: string[] = [];
    let codeBlockContextBefore = '';
    let currentParagraph: string[] = [];
    let currentList: { type: 'bullet' | 'numbered'; items: string[]; intro: string } | null = null;
    let currentTable: string[] = [];
    let inTable = false;
    let currentBlockquote: string[] = [];

    const flushParagraph = () => {
        const text = currentParagraph.join('\n').trim();
        if (text) currentSection.paragraphs.push(text);
        currentParagraph = [];
    };
    const flushList = () => {
        if (currentList && currentList.items.length > 0) {
            currentSection.lists.push({ type: currentList.type, items: currentList.items, introSentence: currentList.intro });
        }
        currentList = null;
    };
    const flushTable = () => {
        if (currentTable.length > 0) currentSection.tables.push(currentTable.join('\n'));
        currentTable = [];
        inTable = false;
    };
    const flushBlockquote = () => {
        if (currentBlockquote.length > 0) currentSection.blockquotes.push(currentBlockquote.join('\n'));
        currentBlockquote = [];
    };
    const flushSection = () => {
        flushParagraph(); flushList(); flushTable(); flushBlockquote();
        if (currentSection.heading || currentSection.paragraphs.length > 0 ||
            currentSection.codeBlocks.length > 0 || currentSection.lists.length > 0) {
            sections.push(currentSection);
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (/^```/.test(trimmed)) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBlockLang = trimmed.replace(/^```\s*/, '').split(/\s/)[0] || 'code';
                codeBlockContent = [];
                const lastPar = currentParagraph.join(' ').trim();
                codeBlockContextBefore = lastPar.split(/[.!?]\s+/).pop()?.trim() ?? '';
                flushParagraph();
            } else {
                inCodeBlock = false;
                const content = codeBlockContent.join('\n');
                const nonEmpty = content.split('\n').filter(l => l.trim());
                let contextAfter = '';
                for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
                    const nextLine = lines[j].trim();
                    if (nextLine && !nextLine.startsWith('```') && !nextLine.startsWith('#')) {
                        contextAfter = nextLine; break;
                    }
                }
                currentSection.codeBlocks.push({
                    lang: codeBlockLang, content, lineCount: nonEmpty.length,
                    purpose: detectCodePurpose(codeBlockLang, content),
                    contextBefore: codeBlockContextBefore, contextAfter,
                });
                codeBlockLang = ''; codeBlockContent = [];
            }
            continue;
        }
        if (inCodeBlock) { codeBlockContent.push(line); continue; }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
            flushSection();
            currentSection = {
                heading: headingMatch[2].trim(), level: headingMatch[1].length,
                paragraphs: [], codeBlocks: [], lists: [], definitions: [], tables: [], blockquotes: [],
            };
            continue;
        }

        if (/^\*\*[^*]{3,80}\*\*\s*$/.test(trimmed) || /^__[^_]{3,80}__\s*$/.test(trimmed)) {
            flushSection();
            const text = trimmed.replace(/^\*\*(.+)\*\*$/, '$1').replace(/^__(.+)__$/, '$1');
            currentSection = {
                heading: text, level: 3,
                paragraphs: [], codeBlocks: [], lists: [], definitions: [], tables: [], blockquotes: [],
            };
            continue;
        }

        if (/^\|.+\|/.test(trimmed)) {
            flushParagraph(); flushList();
            if (!inTable) inTable = true;
            currentTable.push(line); continue;
        } else if (inTable) { flushTable(); }

        if (/^>\s*/.test(trimmed)) {
            flushParagraph();
            currentBlockquote.push(trimmed.replace(/^>\s*/, '')); continue;
        } else if (currentBlockquote.length > 0) { flushBlockquote(); }

        const bulletMatch = trimmed.match(/^[-*+•]\s+(.+)/);
        const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
        if (bulletMatch || numberedMatch) {
            const itemText = (bulletMatch ? bulletMatch[1] : numberedMatch![1]).trim();
            const type = bulletMatch ? 'bullet' : 'numbered';
            if (!currentList) {
                const intro = currentParagraph.join(' ').trim();
                flushParagraph();
                currentList = { type, items: [], intro };
            }
            currentList.items.push(itemText);
            const def = extractDefinition(itemText);
            if (def) currentSection.definitions.push(`**${def.term}** ${def.definition}`);
            continue;
        } else if (currentList && trimmed === '') {
            flushList(); continue;
        } else if (currentList && trimmed !== '') {
            if (/^\s{2,}/.test(line)) {
                currentList.items[currentList.items.length - 1] += ' ' + trimmed; continue;
            }
            flushList();
        }

        if (trimmed === '') { flushParagraph(); continue; }
        if (/^[-*_]{3,}\s*$/.test(trimmed)) { flushParagraph(); continue; }

        const def = extractDefinition(trimmed);
        if (def) currentSection.definitions.push(`**${def.term}** ${def.definition}`);

        currentParagraph.push(line);
    }
    flushSection();

    return sections.filter(s =>
        s.heading || s.paragraphs.length > 0 ||
        s.codeBlocks.length > 0 || s.lists.length > 0
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SENTENCE SPLITTING  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
    const cleaned = text
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .trim();
    if (!cleaned) return [];
    return cleaned
        .replace(/([.!?])\s+(?=[A-Z"`(])/g, '$1\x00')
        .replace(/([.!?])\s*\n/g, '$1\x00')
        .split('\x00')
        .map(s => s.trim())
        .filter(s => s.length >= 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// KEY TERM BOLDING  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function boldKeyTerms(text: string, keyTerms: Set<string>): string {
    if (keyTerms.size === 0) return text;
    if (/\*\*[^*]+\*\*/.test(text)) return text;
    const parts = text.split(/(`[^`]+`)/);
    return parts.map((part, i) => {
        if (i % 2 === 1) return part;
        return part.replace(/\b(\w{3,})\b/g, (match) => {
            const lower = match.toLowerCase();
            return (keyTerms.has(lower) && !COMMON_WORDS.has(lower)) ? `**${match}**` : match;
        });
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ NEW — SENTENCE ROLE CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────
// Every sentence has a logical role in an explanation.  Tagging them lets us
// assemble sentences in "teacher order" rather than the order they happened to
// appear in the notes.
// ─────────────────────────────────────────────────────────────────────────────

type SentenceRole =
    | 'definition'    // "X is a...",  "X refers to...", "X means..."
    | 'mechanism'     // "X works by...", "automatically...", "uses..."
    | 'purpose'       // "in order to...", "allows...", "ensures...", "prevents..."
    | 'consequence'   // "as a result...", "this means...", "therefore..."
    | 'property'      // "X has...", "X contains...", "X provides..."
    | 'example'       // "for example...", "such as...", "consider..."
    | 'contrast'      // "however...", "unlike...", "in contrast..."
    | 'general';

// Priority order: what should come first in an explanation?
const ROLE_PRIORITY: SentenceRole[] = [
    'definition', 'mechanism', 'purpose', 'property', 'consequence',
    'example', 'contrast', 'general',
];

const SENTENCE_ROLE_PATTERNS: [RegExp, SentenceRole][] = [
    [/\b(?:is|are)\s+(?:a|an|the)\b|\brefers?\s+to\b|\bmeans?\b|\bdefined\s+as\b|\bknown\s+as\b/i, 'definition'],
    [/\bworks?\s+by\b|\boperates?\s+by\b|\bautomatically\b|\bimplements?\b|\bperforms?\b/i, 'mechanism'],
    [/\bin\s+order\s+to\b|\bso\s+that\b|\ballow[s]?\b|\benable[s]?\b|\bensure[s]?\b|\bprevent[s]?\b/i, 'purpose'],
    [/\bas\s+a\s+result\b|\bthis\s+means\b|\btherefore\b|\bconsequently\b|\bthis\s+causes\b/i, 'consequence'],
    [/\bprovide[s]?\b|\bcontain[s]?\b|\bconsist[s]?\s+of\b|\bhas\b|\binclude[s]?\b/i, 'property'],
    [/\bfor\s+example\b|\bsuch\s+as\b|\bfor\s+instance\b|\bconsider\b|\be\.g\.\b/i, 'example'],
    [/\bhowever\b|\bunlike\b|\binstead\b|\bin\s+contrast\b|\bon\s+the\s+other\s+hand\b/i, 'contrast'],
];

function classifySentence(sentence: string): SentenceRole {
    const lower = sentence.toLowerCase();
    for (const [pattern, role] of SENTENCE_ROLE_PATTERNS) {
        if (pattern.test(lower)) return role;
    }
    return 'general';
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ NEW — EXPLANATORY FLOW BUILDER
// ─────────────────────────────────────────────────────────────────────────────
// This is the core of what makes v2 feel like a teacher rather than a copier.
//
// Instead of: sort by keyword density → concatenate top-N
// It does:    classify each sentence → sort by role priority → re-order by
//             original position → add role-matched connectives for flow
// ─────────────────────────────────────────────────────────────────────────────

// What connecting phrase to add before each role when the sentence doesn't
// already start with a natural transition word.
const ROLE_CONNECTIVES: Partial<Record<SentenceRole, string>> = {
    mechanism: 'It ',
    purpose: 'This ',
    consequence: 'As a result, ',
    property: 'Specifically, ',
    example: 'For example, ',
};

function buildExplanatoryFlow(
    sentences: string[],
    keyTerms: Set<string>
): string {
    if (sentences.length === 0) return '';
    if (sentences.length === 1) return boldKeyTerms(sentences[0], keyTerms);

    // Classify every sentence
    const classified = sentences.map((text, originalIndex) => ({
        text,
        originalIndex,
        role: classifySentence(text),
    }));

    // Sort by role priority (definition first, examples last),
    // breaking ties by original position so early sentences still tend to come first.
    const sorted = [...classified].sort((a, b) => {
        const ap = ROLE_PRIORITY.indexOf(a.role);
        const bp = ROLE_PRIORITY.indexOf(b.role);
        if (ap !== bp) return ap - bp;
        return a.originalIndex - b.originalIndex;
    });

    // How many sentences to keep?
    // Never drop below 3 or above all of them.
    // Target 70% of sentences — enough to be comprehensive, not just a 2-liner.
    const targetCount = Math.max(3, Math.min(sorted.length, Math.ceil(sentences.length * 0.7)));
    let selected = sorted.slice(0, targetCount);

    // Re-sort by original position so the explanation reads naturally left-to-right
    selected.sort((a, b) => a.originalIndex - b.originalIndex);

    // Assemble with role-matched connectives
    const parts: string[] = [];
    for (let i = 0; i < selected.length; i++) {
        const { text, role } = selected[i];
        let processed = boldKeyTerms(text, keyTerms);

        if (i > 0) {
            // Check whether the sentence already opens with a connective word
            // so we don't double-up ("However, however,...")
            const alreadyOpens = /^(however|although|therefore|thus|but|yet|also|additionally|furthermore|because|since|when|while|this|it\s|they\s|these\s|as a result|for example|specifically)/i.test(processed.trim());

            if (!alreadyOpens) {
                const conn = ROLE_CONNECTIVES[role];
                if (conn) {
                    processed = conn + processed.charAt(0).toLowerCase() + processed.slice(1);
                }
            }
        }
        parts.push(processed);
    }

    return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ REPLACED — OVERVIEW GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
// v1: template string that plugged keywords in ("This section covers **X**, **Y**…")
// v2: reads the actual notes, picks the best definition sentence, adds mechanism,
//     then a short preview of sub-sections. Reads like a real introduction.
// ─────────────────────────────────────────────────────────────────────────────

function generateOverview(
    sections: ParsedSection[],
    keyTerms: string[],
    title: string
): string {
    const keyTermSet = new Set(keyTerms.map(k => k.toLowerCase()));

    // Gather ALL sentences from ALL paragraphs across ALL sections
    const allSentences: string[] = [];
    for (const section of sections) {
        for (const para of section.paragraphs) {
            allSentences.push(...splitIntoSentences(para));
        }
    }

    if (allSentences.length === 0) {
        // True fallback — nothing to work with
        return keyTerms.length > 0
            ? `This section covers ${keyTerms.slice(0, 4).map(t => `**${t}**`).join(', ')}.`
            : 'Summary of this section.';
    }

    // ── Step 1: Find the best definition sentence ───────────────────────────
    // "best" = classified as definition, between 8-50 words, mentions the title
    //          or a key term. Falls back to the shortest valid definition if no
    //          title match, and falls back to the first sentence overall.
    const definitionCandidates = allSentences.filter(s => {
        if (classifySentence(s) !== 'definition') return false;
        const wc = s.split(/\s+/).length;
        return wc >= 8 && wc <= 55;
    });

    // Prefer one that mentions the title
    const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const titleMatchDef = definitionCandidates.find(s =>
        titleWords.some(tw => s.toLowerCase().includes(tw))
    );
    const bestDef = titleMatchDef
        ?? definitionCandidates.sort((a, b) => a.length - b.length)[0]
        ?? allSentences.find(s => s.split(/\s+/).length >= 8)
        ?? allSentences[0];

    const parts: string[] = [];
    parts.push(boldKeyTerms(bestDef, keyTermSet));

    // ── Step 2: Add the best mechanism/purpose sentence ─────────────────────
    const mechanismSentences = allSentences.filter(s =>
        (classifySentence(s) === 'mechanism' || classifySentence(s) === 'purpose') &&
        s !== bestDef &&
        s.split(/\s+/).length >= 6
    );
    if (mechanismSentences.length > 0) {
        const mech = mechanismSentences[0];
        const mechBolded = boldKeyTerms(mech, keyTermSet);
        // Add "It" prefix only if the sentence doesn't already open with a subject
        const alreadyHasSubject = /^(it|this|they|these|the|a|an)\s/i.test(mech.trim());
        if (!alreadyHasSubject) {
            parts.push('It ' + mechBolded.charAt(0).toLowerCase() + mechBolded.slice(1));
        } else {
            parts.push(mechBolded);
        }
    }

    // ── Step 3: Section preview ──────────────────────────────────────────────
    // "This section covers X, Y, Z." — but only if there are meaningful sub-sections.
    const subHeadings = sections
        .filter(s => s.heading && s.heading.toLowerCase() !== title.toLowerCase())
        .map(s => s.heading)
        .slice(0, 3);
    const codeCount = sections.reduce((n, s) => n + s.codeBlocks.length, 0);

    if (subHeadings.length >= 2) {
        const headingList = subHeadings.map(h => `**${h}**`).join(', ');
        const codePart = codeCount > 0
            ? ` with ${codeCount} code example${codeCount > 1 ? 's' : ''}`
            : '';
        parts.push(`This section covers ${headingList}${codePart}.`);
    } else if (codeCount > 0 && subHeadings.length < 2) {
        parts.push(`${codeCount} code example${codeCount > 1 ? 's are' : ' is'} included below.`);
    }

    return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ REPLACED — CODE EXPLANATION (+ NEW analyzeCodeContent helper)
// ─────────────────────────────────────────────────────────────────────────────
// v1: one generic line ("The following typescript code defines `X`:") 
// v2: actually reads the code — extracts function signatures, YAML fields,
//     command names, loop/recursion patterns — and writes 1-2 sentences
//     explaining WHAT the code does, not just labelling it.
// ─────────────────────────────────────────────────────────────────────────────

function analyzeCodeContent(block: ParsedCodeBlock): string {
    const { content, lang, purpose } = block;
    const langLower = lang.toLowerCase();

    switch (purpose) {

        case 'definition': {
            // Extract function/class name, parameter names, key operations
            const funcMatch = content.match(
                /(?:export\s+)?(?:async\s+)?(?:function|def|func|fn)\s+(\w+)\s*[<(]([^)]*)/
            );
            const arrowMatch = content.match(
                /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::[^=]+)?\s*=>/
            );
            const classMatch = content.match(/(?:export\s+)?(?:class|interface|type)\s+(\w+)/);

            if (funcMatch || arrowMatch) {
                const name = funcMatch ? funcMatch[1] : arrowMatch![1];
                const rawParams = (funcMatch ? funcMatch[2] : arrowMatch![2]).trim();
                // Clean TypeScript generics and type annotations for display
                const params = rawParams
                    .split(',')
                    .map(p => p.trim().split(':')[0].replace(/[<>]/g, '').trim())
                    .filter(p => p.length > 0 && p !== '...')
                    .slice(0, 4);

                const isAsync = /\basync\b/.test(content);
                let desc = `The \`${name}\`${isAsync ? ' async' : ''} function`;
                if (params.length > 0) {
                    desc += ` takes \`${params.join('`, `')}\``;
                }

                // Detect what the function body does (key patterns only)
                const hasState = /useState|setState/.test(content);
                const hasEffect = /useEffect/.test(content);
                const hasTimeout = /setTimeout|clearTimeout|setInterval/.test(content);
                const hasFetch = /fetch\(|axios|http\./.test(content);
                const hasMap = /\.map\s*\(/.test(content);
                const hasFilter = /\.filter\s*\(/.test(content);
                const hasReduce = /\.reduce\s*\(/.test(content);
                const hasRecurse = new RegExp(`\\b${name}\\s*\\(`).test(
                    content.replace(new RegExp(`^[\\s\\S]*?function\\s+${name}[\\s\\S]*?\\{`, 'm'), '')
                );
                const hasTryCatch = /try\s*\{/.test(content);
                const returnMatch = content.match(/:\s*([A-Za-z<\[\]|&]+)\s*[{;=>]/);

                const ops: string[] = [];
                if (hasState) ops.push('manages React state');
                if (hasEffect) ops.push('runs a side effect');
                if (hasTimeout) ops.push('uses a timer');
                if (hasFetch) ops.push('makes a network request');
                if (hasRecurse) ops.push('calls itself recursively');
                if (hasMap && !hasFilter && !hasReduce) ops.push('transforms an array');
                if (hasFilter) ops.push('filters items');
                if (hasReduce) ops.push('accumulates values');
                if (hasTryCatch) ops.push('handles errors');
                if (returnMatch && returnMatch[1] !== 'void') {
                    desc += ` returning \`${returnMatch[1]}\``;
                }
                desc += '.';

                if (ops.length > 0) {
                    desc += ` It ${ops.slice(0, 3).join(', then ')}.`;
                }
                return desc;
            }

            if (classMatch) {
                const name = classMatch[1];
                const hasMethods = (content.match(/^\s+(?:public|private|protected|async|static)?\s+\w+\s*\(/gm) || []).length;
                return `The \`${name}\` class/interface${hasMethods > 0 ? ` defines ${hasMethods} method${hasMethods > 1 ? 's' : ''}` : ''}.`;
            }

            return '';
        }

        case 'configuration': {
            if (langLower === 'yaml' || langLower === 'yml') {
                // Extract key Kubernetes/Docker/YAML fields for human-readable description
                const kindMatch = content.match(/^kind:\s*(\w+)/m);
                const nameMatch = content.match(/^\s+name:\s*(\S+)/m);
                const replicaMatch = content.match(/replicas:\s*(\d+)/);
                const imageMatch = content.match(/image:\s*(\S+)/);
                const portMatch = content.match(/containerPort:\s*(\d+)|ports?:\s*-\s*["']?(\d+)/);
                const serviceMatch = content.match(/type:\s*(ClusterIP|NodePort|LoadBalancer)/);
                const versionMatch = content.match(/^apiVersion:\s*(\S+)/m);

                const descParts: string[] = [];
                if (kindMatch) descParts.push(`a \`${kindMatch[1]}\` resource`);
                if (nameMatch) descParts.push(`named \`${nameMatch[1]}\``);
                if (replicaMatch) descParts.push(`with ${replicaMatch[1]} replica${parseInt(replicaMatch[1]) > 1 ? 's' : ''}`);
                if (imageMatch) descParts.push(`using the \`${imageMatch[1]}\` image`);
                if (portMatch) descParts.push(`on port ${portMatch[1] || portMatch[2]}`);
                if (serviceMatch) descParts.push(`of type \`${serviceMatch[1]}\``);

                if (descParts.length > 0) {
                    return `This YAML defines ${descParts.join(', ')}:`;
                }
            }

            if (langLower === 'json') {
                const topKeys = Object.keys(
                    (() => { try { return JSON.parse(content); } catch { return {}; } })()
                ).slice(0, 4);
                if (topKeys.length > 0) {
                    return `The JSON configuration has ${topKeys.length > 1 ? 'fields' : 'field'}: \`${topKeys.join('`, `')}\`:`;
                }
            }

            return 'The configuration:';
        }

        case 'command': {
            const cmdLines = content.split('\n')
                .map(l => l.trim().replace(/^\$\s+/, ''))
                .filter(l => l && !l.startsWith('#'));

            if (cmdLines.length === 1) {
                const parts = cmdLines[0].split(/\s+/);
                const tool = parts[0];
                const subCmd = parts[1];
                // Describe common tools
                const toolDesc: Record<string, string> = {
                    kubectl: 'Kubernetes CLI',
                    docker: 'Docker CLI',
                    npm: 'Node package manager',
                    pip: 'Python package manager',
                    git: 'Git version control',
                    yarn: 'Yarn package manager',
                    cargo: 'Rust package manager',
                };
                const toolName = toolDesc[tool] ? `\`${tool}\` (${toolDesc[tool]})` : `\`${tool}\``;
                return `Run ${toolName}${subCmd ? ` \`${subCmd}\`` : ''}:`;
            }

            if (cmdLines.length <= 4) {
                return `Run the following ${cmdLines.length} commands:`;
            }
            return `Execute these commands:`;
        }

        case 'algorithm': {
            const hasLoop = /\b(for|while|forEach|map)\b/.test(content);
            const hasRecursion = (() => {
                const funcName = content.match(/(?:function|def)\s+(\w+)/)?.[1];
                return funcName && new RegExp(`\\b${funcName}\\s*\\(`).test(
                    content.replace(/^[\s\S]*?\{/, '')
                );
            })();
            const hasBranch = /\b(if|else|switch)\b/.test(content);
            const hasSorting = /\b(sort|bubble|merge|quick|heap)\b/i.test(content);
            const hasDynamicProg = /\b(dp|memo|cache|tabulation)\b/i.test(content);
            const hasBinarySearch = /\b(mid|low|high|left|right)\b/.test(content) &&
                /\b(while|for)\b/.test(content);

            const traits: string[] = [];
            if (hasSorting) traits.push('sorting');
            if (hasDynamicProg) traits.push('dynamic programming / memoization');
            if (hasBinarySearch) traits.push('binary search');
            if (hasRecursion) traits.push('recursion');
            if (hasLoop && !hasSorting && !hasBinarySearch) traits.push('iteration');
            if (hasBranch && traits.length === 0) traits.push('conditional branching');

            if (traits.length > 0) {
                return `This algorithm uses ${traits.join(' and ')}:`;
            }
            return 'The core algorithm:';
        }

        case 'import': {
            const importLines = content.split('\n')
                .filter(l => /^\s*(import|from|require|#include|use\s)/.test(l.trim()));
            const libNames = importLines
                .map(l => l.match(/from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]/))
                .filter(Boolean)
                .map(m => (m![1] || m![2]).split('/')[0])
                .slice(0, 3);
            if (libNames.length > 0) {
                return `Imports from ${libNames.map(n => `\`${n}\``).join(', ')}:`;
            }
            return 'Required imports:';
        }

        case 'query': {
            const opMatch = content.match(/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/im);
            const tableMatch = content.match(/\b(?:FROM|INTO|UPDATE|TABLE)\s+(\w+)/i);
            if (opMatch && tableMatch) {
                return `${opMatch[1].toUpperCase()} query on the \`${tableMatch[1]}\` table:`;
            }
            return 'The SQL query:';
        }

        case 'example':
            return 'Usage example:';

        default:
            return '';
    }
}

function generateCodeExplanation(block: ParsedCodeBlock): { before: string; after: string } {
    // If the note already has a full sentence explaining the code, keep it
    if (block.contextBefore && block.contextBefore.length > 40) {
        return { before: '', after: '' };
    }
    const before = analyzeCodeContent(block);
    return { before, after: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ REPLACED — SENTENCE IMPORTANCE SCORING
// Small changes to weight definitions higher and reduce generic keyword density.
// ─────────────────────────────────────────────────────────────────────────────

function scoreSentenceImportance(
    sentence: string,
    keyTerms: Set<string>,
    index: number,
    total: number
): number {
    let score = 0;
    const words = sentence.toLowerCase().split(/\s+/);

    // Key term density
    const termHits = words.filter(w => keyTerms.has(w.replace(/[^a-z0-9]/g, ''))).length;
    score += Math.min(0.4, termHits * 0.08);

    // Definition signal — biggest single boost
    if (/\bis\s+(a|an|the)\b|\brefers?\s+to\b|\bmeans?\b|\bdefin/i.test(sentence)) score += 0.4;

    // Mechanism signal
    if (/\bworks?\s+by\b|\bautomatically\b|\bimplements?\b/i.test(sentence)) score += 0.2;

    // Technical terms
    if (/[a-z][A-Z]|`[^`]+`|\b[A-Z]{2,}\b/.test(sentence)) score += 0.15;

    // Positional
    if (index === 0) score += 0.25;
    if (index === total - 1) score += 0.1;

    // Contains numbers/data
    if (/\d+[%$]|\d+\.\d+|\b\d{3,}\b/.test(sentence)) score += 0.1;

    // Length penalty
    if (words.length < 5) score -= 0.3;
    if (words.length > 60) score -= 0.15;

    // Signal phrases
    if (/\b(important|key|crucial|essential|note|remember|critical|significant)\b/i.test(sentence)) score += 0.25;

    return Math.max(0, Math.min(1, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ REPLACED — SECTION SUMMARY GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
// v1: scored sentences by keyword density → .join(' ')  (still just extractive)
// v2: routes all paragraph sentences through buildExplanatoryFlow() so the
//     prose reads: definition → mechanism → purpose → property → example
//     instead of whatever random order they happened to appear in the notes.
// ─────────────────────────────────────────────────────────────────────────────

function generateSectionSummary(section: ParsedSection, keyTerms: Set<string>): string {
    const parts: string[] = [];

    // ── Heading ──────────────────────────────────────────────────────────────
    if (section.heading) {
        const prefix = section.level <= 2 ? '##' : '###';
        parts.push(`${prefix} ${section.heading}`);
        parts.push('');
    }

    // ── Definitions as callouts ───────────────────────────────────────────────
    const seenDefs = new Set<string>();
    for (const def of section.definitions.slice(0, 3)) {
        const key = def.slice(0, 40).toLowerCase();
        if (seenDefs.has(key)) continue;
        seenDefs.add(key);
        parts.push(`> 📖 ${def}`);
        parts.push('');
    }

    // ── Main prose through the explanatory flow ──────────────────────────────
    const allSentences: string[] = [];
    for (const para of section.paragraphs) {
        allSentences.push(...splitIntoSentences(para));
    }

    if (allSentences.length > 0) {
        // Remove sentences that already appear in the definition callouts
        // (avoids saying "A Pod is a..." twice — once as callout, once as prose)
        const defTexts = new Set(
            section.definitions.map(d => d.replace(/\*\*/g, '').toLowerCase().slice(0, 50))
        );
        const uniqueSentences = allSentences.filter(s => {
            const lower = s.toLowerCase().slice(0, 50);
            return !defTexts.has(lower);
        });

        if (uniqueSentences.length > 0) {
            const flowText = buildExplanatoryFlow(uniqueSentences, keyTerms);
            if (flowText.trim()) {
                parts.push(flowText);
                parts.push('');
            }
        }
    }

    // ── Lists ─────────────────────────────────────────────────────────────────
    for (const list of section.lists) {
        if (list.introSentence) {
            parts.push(boldKeyTerms(list.introSentence, keyTerms));
            parts.push('');
        }
        for (const item of list.items) {
            parts.push(`• ${boldKeyTerms(item, keyTerms)}`);
        }
        parts.push('');
    }

    // ── Code blocks with content-aware annotations ────────────────────────────
    for (const block of section.codeBlocks) {
        const { before } = generateCodeExplanation(block);
        if (before) {
            parts.push(before);
            parts.push('');
        }
        parts.push(`\`\`\`${block.lang}`);
        parts.push(block.content);
        parts.push('```');
        parts.push('');
    }

    // ── Tables ────────────────────────────────────────────────────────────────
    for (const table of section.tables) {
        parts.push(table);
        parts.push('');
    }

    // ── Blockquotes ───────────────────────────────────────────────────────────
    for (const bq of section.blockquotes) {
        parts.push(`> ${bq}`);
        parts.push('');
    }

    return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ REPLACED — KEY TAKEAWAYS GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
// v1: first sentence of each section + "Core concepts: **X**, **Y**"
//     (mostly just duplicated the opening sentences)
// v2: targets exam/interview content specifically:
//     real definitions → distinction sentences → "when to use" → time complexity
//     → "important/remember" signals → key commands → list items as condensed points
// ─────────────────────────────────────────────────────────────────────────────

function generateKeyTakeaways(
    sections: ParsedSection[],
    allSentences: string[],
    keyTerms: string[]
): string[] {
    const takeaways: string[] = [];
    const seen = new Set<string>();

    const addIfNew = (text: string) => {
        const normalised = text.replace(/\*\*/g, '').trim();
        const key = normalised.toLowerCase().slice(0, 60);
        if (!seen.has(key) && normalised.split(/\s+/).length >= 6 && normalised.length < 280) {
            seen.add(key);
            takeaways.push(text);
            return true;
        }
        return false;
    };

    // ── 1. Definitions (with bold formatting — best for exam flash-card review)
    for (const section of sections) {
        for (const def of section.definitions.slice(0, 3)) {
            // Only include proper full sentences, not fragments
            if (def.replace(/\*\*/g, '').split(/\s+/).length >= 8) {
                addIfNew(def);
            }
        }
    }

    // ── 2. Distinction sentences ("X is different from Y", "unlike X, Y…")
    //    — these come up constantly in interviews
    const distinctionSentences = allSentences.filter(s =>
        /\bunlike\b|\bdifference\b|\bvs\.?\b|\bcompared\s+to\b|\binstead\s+of\b|\bdistinct\b/i.test(s) &&
        s.split(/\s+/).length >= 8
    );
    for (const d of distinctionSentences.slice(0, 2)) addIfNew(d);

    // ── 3. "When to use" / "Why use" — classic interview question fodder
    const whenToUseSentences = allSentences.filter(s =>
        /\bwhen\s+to\s+use\b|\bwhy\s+(use|we|you)\b|\badvantage\b|\bbenefit\b|\bpurpose\s+of\b|\buse\s+case\b/i.test(s) &&
        s.split(/\s+/).length >= 8
    );
    for (const s of whenToUseSentences.slice(0, 2)) addIfNew(s);

    // ── 4. Time / space complexity lines
    const complexitySentences = allSentences.filter(s =>
        /O\([^)]+\)|time\s+complexity|space\s+complexity|microsecond|amortized/i.test(s)
    );
    for (const s of complexitySentences.slice(0, 2)) addIfNew(s);

    // ── 5. Sentences with explicit "remember / important / note that / critical"
    const highlightSentences = allSentences.filter(s =>
        /\bimportant\b|\bnote\s+that\b|\bremember\b|\bcritical\b|\bkey\s+point\b|\balways\b|\bnever\b/i.test(s) &&
        s.split(/\s+/).length >= 8
    );
    for (const s of highlightSentences.slice(0, 2)) addIfNew(s);

    // ── 6. Key commands (for command-reference notes)
    const commands = sections.flatMap(s => s.codeBlocks.filter(b => b.purpose === 'command'));
    if (commands.length > 0) {
        const cmdList = commands.slice(0, 4).map(b => {
            const firstCmd = b.content.split('\n')
                .map(l => l.trim().replace(/^\$\s+/, ''))
                .find(l => l && !l.startsWith('#'));
            if (!firstCmd) return null;
            // Truncate to first 4 words so the takeaway isn't a wall of flags
            return `\`${firstCmd.split(/\s+/).slice(0, 4).join(' ')}\``;
        }).filter(Boolean);
        if (cmdList.length > 0) {
            addIfNew(`Key commands: ${cmdList.join(', ')}`);
        }
    }

    // ── 7. Notable numbered/bulleted list items (condensed key points)
    //    Add up to 3 important list items that aren't already covered above
    const listItems = sections.flatMap(s => s.lists.flatMap(l => l.items));
    for (const item of listItems) {
        if (takeaways.length >= 7) break;
        const hasKeySignal = /\b(important|key|remember|always|never|critical|main)\b/i.test(item);
        if (hasKeySignal && item.split(/\s+/).length >= 6) {
            addIfNew(item);
        }
    }

    // ── 8. Final fallback: opening sentences of major headed sections
    //    Only if we still have fewer than 3 takeaways
    if (takeaways.length < 3) {
        for (const section of sections) {
            if (section.heading && section.paragraphs.length > 0) {
                const sents = splitIntoSentences(section.paragraphs[0]);
                if (sents[0] && sents[0].split(/\s+/).length >= 8) {
                    addIfNew(sents[0]);
                }
            }
        }
    }

    return takeaways.slice(0, 7);
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ UPDATED — MAIN ENTRY POINT
// Two changes: generateOverview() now receives sections instead of contentType,
// and generateKeyTakeaways() now receives allSentences.
// Everything else is identical to v1.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateDeepSummary — produces a teacher-style deep summary.
 *
 * Output reads like: "X is a [definition]. It works by [mechanism]. This
 * [purpose]. For example, [code]. Key points for exam/interview: …"
 *
 * @param content - Raw markdown note content
 * @param title   - Optional section/topic title
 * @returns Formatted markdown string
 */
export function generateDeepSummary(content: string, title: string = ''): string {
    if (!content || content.trim().length < 30) return content.trim();

    // 1. Extract key terms
    const keywords = extractKeywords(content, 12);
    const keyTermSet = new Set(keywords.map(k => k.toLowerCase()));

    // 2. Parse into semantic sections
    const sections = parseMarkdownStructure(content);
    if (sections.length === 0) return content.trim();

    // 3. Collect ALL sentences now — needed by generateKeyTakeaways
    const allSentences: string[] = [];
    for (const section of sections) {
        for (const para of section.paragraphs) {
            allSentences.push(...splitIntoSentences(para));
        }
    }

    // ── FALLBACK FOR SHORT MANUAL BLOCKS ──────────────────────────────────────
    const wordCount = content.trim().split(/\s+/).length;
    if (wordCount < 120 && allSentences.length <= 6) {
        const output: string[] = [];
        output.push('🤖 **Local AI Summary**');
        
        // Single synthesis sentence
        if (allSentences.length > 0) {
            output.push(`> ${boldKeyTerms(allSentences[0], keyTermSet)}`);
        }

        // Key points right away
        const takeaways = generateKeyTakeaways(sections, allSentences, keywords);
        if (takeaways.length > 0) {
            output.push('');
            output.push('### 🎯 Key Points');
            for (const t of takeaways) {
                output.push(`• ${t}`);
            }
        }

        return output.join('\n').trim();
    }

    // 4. Build the standard deep summary
    const output: string[] = [];

    // ── Overview paragraph (now reads from actual content, not template) ──────
    const overview = generateOverview(sections, keywords, title);
    output.push(overview);
    output.push('');

    // ── Section summaries ──────────────────────────────────────────────────────
    const hasMultipleSections =
        sections.filter(s => s.heading || s.paragraphs.length > 2).length > 1;

    for (const section of sections) {
        const sectionContent = hasMultipleSections
            ? section
            : { ...section, heading: '' }; // single-section: don't add redundant sub-heading
        const sectionOutput = generateSectionSummary(sectionContent, keyTermSet);
        if (sectionOutput.trim()) {
            output.push(sectionOutput.trim());
            output.push('');
        }
    }

    // ── Key Takeaways (exam/interview focused) ──────────────────────────────────
    const takeaways = generateKeyTakeaways(sections, allSentences, keywords);
    if (takeaways.length > 0) {
        output.push('---');
        output.push('');
        output.push('### 🎯 Key Points');
        output.push('');
        for (const t of takeaways) {
            output.push(`• ${t}`);
        }
        output.push('');
    }

    return output.join('\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

/**
 * generateDeepSummaryAsync — async wrapper (API-compatible with v1).
 */
export async function generateDeepSummaryAsync(content: string, title: string = ''): Promise<string> {
    await new Promise(r => setTimeout(r, 5));
    return generateDeepSummary(content, title);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS  (identical to v1 — fully backward-compatible)
// ─────────────────────────────────────────────────────────────────────────────
export {
    parseMarkdownStructure,
    detectContentType,
    detectCodePurpose,
    generateCodeExplanation,
    extractDefinition,
    generateOverview,
    generateKeyTakeaways,
    scoreSentenceImportance,
    boldKeyTerms,
    // v2 new exports
    classifySentence,
    buildExplanatoryFlow,
    analyzeCodeContent,
};
export type { ParsedSection, ParsedCodeBlock, ParsedList, ContentType, CodePurpose };
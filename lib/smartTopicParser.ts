/**
 * Smart Local Topic Parser
 * Zero API calls · Zero downloads · Works 100% offline · Instant
 *
 * Algorithm:
 *  Strictly relies on explicit structural markers (headings, numbered lists, dividers)
 *  to avoid accidentally splitting cohesive paragraphs.
 */
import { generateLocalSummary } from '@/lib/localSummarizer';

// ── Title extraction ──────────────────────────────────────────────────────────
function extractTitle(paragraph: string): string {
    const firstLine = paragraph.split('\n')[0];
    return firstLine
        .replace(/^#{1,6}\s+/, '')
        .replace(/^\d{1,2}[\.\)]\s+/, '')
        .replace(/^[IVX]+[\.\)]\s+/, '')
        .replace(/^\*\*|\*\*$/g, '')
        .replace(/^__|__$/g, '')
        .replace(/^[★✦◆▶→•]\s+/, '')
        .trim()
        .slice(0, 80) || 'Topic';
}

export interface ParsedTopic { title: string; body: string; summary: string }

/**
 * Intelligently splits a note's content into distinct topics.
 * Uses only strict conservative signals to prevent abrupt cuts:
 *   - Markdown headings (#)
 *   - Numbered sections (1., I.)
 *   - Explicit keywords (Question 1:, Topic 1:)
 *   - Standalone bold/underline headings
 *   - Markdown horizontal rules (---)
 */
export function smartSplitTopics(content: string): ParsedTopic[] {
    const paragraphs = content
        .split(/\n{2,}/) // Split by blank lines
        .map(p => p.trim())
        .filter(p => p.length > 0);

    if (paragraphs.length <= 1) {
        return [{ title: extractTitle(content), body: content, summary: generateLocalSummary(content) }];
    }

    const boundaryAt = new Set<number>([0]);

    for (let i = 1; i < paragraphs.length; i++) {
        const cur = paragraphs[i];
        const prev = paragraphs[i - 1];
        const firstLine = cur.split('\n')[0].trim();
        const lastLinePrev = prev.split('\n').slice(-1)[0].trim();

        // Strict Structural boundaries (Only Top-Level breaks)
        // We do NOT split on H3 (###) or lower, nor on every numbered list, to keep topics cohesive.
        if (
            /^#{1,2}\s+\S/.test(firstLine) ||                           // # or ## Heading (Level 1/2 only)
            /^(PART|CHAPTER|UNIT)\s*\d+/i.test(firstLine) ||            // PART 1:, CHAPTER 2
            /^[-=]{3,}\s*$/.test(lastLinePrev)                          // Prev line was --- or === (explicit break)
        ) {
            boundaryAt.add(i);
        }

    }

    // Build topic groups from boundary indices
    const sorted = [...boundaryAt].sort((a, b) => a - b);
    const topics: ParsedTopic[] = [];

    for (let b = 0; b < sorted.length; b++) {
        const start = sorted[b];
        const end = sorted[b + 1] ?? paragraphs.length;
        const group = paragraphs.slice(start, end);
        if (group.length === 0) continue;

        const title = extractTitle(group[0]);

        // Build the body safely without losing text
        let body = group.join('\n\n');

        // If the very first paragraph is ONLY the heading, omit it from the body
        // to avoid duplicating the title as the first line of the body.
        // Wait: ONLY do this if there is actual content after the heading.
        const firstLine = group[0].split('\n')[0].trim();
        const isHeadingOnly = group[0].split('\n').length === 1 && (
            /^#{1,6}\s+/.test(firstLine) ||
            /^\d{1,2}[\.\)]\s+/.test(firstLine) ||
            /^\*\*[^*]+\*\*$/.test(firstLine) ||
            /^__[^_]+__$/.test(firstLine)
        );

        if (isHeadingOnly && group.length > 1) {
            body = group.slice(1).join('\n\n');
        }

        topics.push({ title, body: body.trim(), summary: generateLocalSummary(body.trim()) });
    }

    return topics.length > 0 ? topics : [{ title: extractTitle(content), body: content, summary: generateLocalSummary(content) }];
}

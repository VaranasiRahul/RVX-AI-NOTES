/**
 * Local Extractive Summarizer
 * Zero API calls · Zero downloads · Works 100% offline · Instant
 *
 * Algorithm:
 *  1. Strip markdown syntax → get plain text
 *  2. Split into sentences
 *  3. Score each sentence by: position bias, length, keyword repetition
 *  4. Pick the top N sentences and return them as a readable paragraph
 */

// ── Strip all markdown syntax to get plain readable text ─────────────────────
function stripMd(text: string): string {
    return text
        // Remove code blocks (fenced)
        .replace(/```[\s\S]*?```/g, '')
        // Remove inline code
        .replace(/`[^`]+`/g, '')
        // Remove headings
        .replace(/^#{1,6}\s+/gm, '')
        // Remove bold/italic
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        // Remove markdown links → keep label
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove bare URLs
        .replace(/https?:\/\/\S+/g, '')
        // Remove markdown horizontal rules
        .replace(/^[-*_]{3,}\s*$/gm, '')
        // Remove blockquote markers
        .replace(/^>\s*/gm, '')
        // Remove list markers (-, *, +, 1.)
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+[.)]\s+/gm, '')
        // Collapse multiple blank lines
        .replace(/\n{2,}/g, '\n')
        .trim();
}

// ── Split text into sentences ─────────────────────────────────────────────────
function toSentences(text: string): string[] {
    // Split on sentence-ending punctuation followed by a space or newline
    const raw = text
        .replace(/\n/g, ' ')
        .split(/(?<=[.!?])\s+(?=[A-Z\u00C0-\u024F"'])/);

    return raw
        .map(s => s.trim())
        .filter(s => s.length > 20); // skip tiny fragments
}

// ── Score a sentence ──────────────────────────────────────────────────────────
function scoreSentence(
    sentence: string,
    index: number,
    total: number,
    keywords: Map<string, number>
): number {
    let score = 0;

    // Position bias: first and last sentences carry more weight
    if (index === 0) score += 3;
    else if (index === 1) score += 2;
    else if (index === total - 1) score += 1.5;
    else if (index === total - 2) score += 1;

    // Length bonus: prefer medium-length sentences (not too short, not too long)
    const wordCount = sentence.split(/\s+/).length;
    if (wordCount >= 10 && wordCount <= 35) score += 2;
    else if (wordCount >= 5) score += 1;

    // Keyword frequency: sentences using frequent content words score higher
    const words = sentence.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    for (const word of words) {
        const freq = keywords.get(word) ?? 0;
        if (freq > 1) score += freq * 0.3;
    }

    // Penalty for sentences that are mostly a list of items (colon-heavy, short clauses)
    if ((sentence.match(/[:,;]/g) ?? []).length > 5) score -= 1;

    return score;
}

// ── Build a keyword frequency map from the plain text ────────────────────────
function buildKeywords(text: string): Map<string, number> {
    // Common English stop words to exclude
    const STOP = new Set([
        'that', 'with', 'from', 'this', 'they', 'have', 'been', 'will',
        'when', 'which', 'there', 'their', 'about', 'would', 'also',
        'then', 'each', 'were', 'other', 'into', 'more', 'such', 'some',
        'these', 'than', 'over', 'what', 'used', 'using', 'can', 'and',
        'the', 'for', 'are', 'not', 'but', 'its', 'just', 'all',
    ]);

    const freq = new Map<string, number>();
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 4 && !STOP.has(w));
    for (const word of words) {
        freq.set(word, (freq.get(word) ?? 0) + 1);
    }
    return freq;
}

// ── Main exported function ────────────────────────────────────────────────────
/**
 * Generates a clean, plain-English extractive summary from a markdown body.
 * @param body   Raw markdown content of a topic block
 * @param count  Number of sentences to include (default: 4)
 * @returns      A readable plain-English summary paragraph
 */
export function generateLocalSummary(body: string, count: number = 8): string {
    if (!body || body.trim().length < 30) return body.trim();

    const plain = stripMd(body);
    if (plain.length < 30) return plain;

    const sentences = toSentences(plain);
    if (sentences.length <= count) {
        // Text is already short enough — just return it clean
        return sentences.join(' ').trim();
    }

    const keywords = buildKeywords(plain);
    const total = sentences.length;

    // Score each sentence
    const scored = sentences.map((s, i) => ({
        sentence: s,
        index: i,
        score: scoreSentence(s, i, total, keywords),
    }));

    // Pick top N by score, then re-sort by original order to keep reading flow
    const top = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .sort((a, b) => a.index - b.index)
        .map(x => x.sentence);

    const result = top.join(' ').trim();

    // Final cleanup: remove any leftover markdown residue
    return result
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/_{1,2}/g, '')
        .replace(/#+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * Gemini-powered topic analysis
 * Works on every device (pure HTTP, zero native code).
 * Free tier: 15 req/min, 1M tokens/day — gemini-2.0-flash-lite @ aistudio.google.com
 */

const GEMINI_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

export type Topic = { title: string; body: string; summary: string; keywords?: string[]; wordCount?: number };

const SYSTEM_PROMPT = `You are an expert academic organizer and study coach. The user will provide study notes.
Your task is to intelligently divide this text into logical, comprehensive topics based purely on semantic meaning.

SPLITTING RULES:
1. Each block MUST represent a complete, self-contained concept or section. Never split mid-explanation.
2. Each block should contain substantial content (ideally 80+ words). Merge very short items into their parent topic.
3. Group related sub-points together. A process with numbered steps is ONE block, not multiple.
4. Split when the subject matter genuinely shifts to a new domain, concept, or major section.
5. IGNORE visual formatting (blank lines, dashes, headers). Split based on SEMANTIC meaning only.

TITLE RULES:
- Titles MUST be descriptive phrases of 4-10 words that capture the block's full scope.
- BAD: "Advantages", "Types", "Overview"
- GOOD: "Key Advantages of Terraform State Files", "Types of Kubernetes Services", "Architecture Overview of CI/CD Pipeline"
- Never use URLs as titles.

CONTENT RULES:
- PRESERVE every piece of study content: all bullet points, code snippets, commands, definitions, examples.
- COMPLETELY OMIT AI chatter ("Here are your notes", "Sure!", "Below are structured..."). Skip to actual content.
- Each block's body must contain the FULL original text of that section (not a summary).

SUMMARY RULES:
- Write a detailed 5-8 sentence paragraph explaining the core concepts and takeaways of that block.
- The summary should work as a standalone study review card.

KEYWORDS:
- Extract 3-6 key technical terms or concepts from each block.

Respond ONLY with a valid JSON array, no markdown fences, no extra text:
[{"title":"...","body":"...","summary":"...","keywords":["term1","term2",...]},...]`;

export async function analyzeWithGemini(
    content: string,
    apiKey: string,
    onProgress?: (msg: string) => void
): Promise<Topic[]> {
    onProgress?.('Sending to AI…');

    const trimmed = content.trim();
    if (!trimmed) return [{ title: 'Note', body: content, summary: 'Empty note.' }];

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: SYSTEM_PROMPT },
                        { text: '\n\nNOTE CONTENT:\n' + trimmed },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
            },
        }),
    });

    if (!res.ok) {
        let apiMessage = res.statusText;
        try {
            const errJson = await res.json();
            apiMessage = errJson?.error?.message ?? errJson?.message ?? JSON.stringify(errJson).slice(0, 200);
        } catch {
            apiMessage = await res.text().catch(() => res.statusText);
        }
        throw new Error(`Gemini ${res.status}: ${apiMessage}`);
    }

    onProgress?.('Processing AI response…');
    const json = await res.json();
    const rawText: string =
        json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let topics: Topic[];
    try {
        topics = JSON.parse(cleaned);
    } catch {
        // Gemini occasionally wraps output — attempt to extract array substring
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('Gemini returned an unexpected response format. Try again.');
        topics = JSON.parse(match[0]);
    }

    if (!Array.isArray(topics) || topics.length === 0) {
        return [{ title: 'Note', body: content, summary: content.slice(0, 800) + '...' }];
    }

    return topics.map((t) => ({
        title: String(t.title ?? 'Topic').slice(0, 200),
        body: String(t.body ?? '').trim(),
        summary: String(t.summary ?? 'No summary available.').trim(),
        keywords: Array.isArray(t.keywords) ? t.keywords.map(String).slice(0, 8) : undefined,
        wordCount: typeof t.wordCount === 'number' ? t.wordCount : undefined,
    }));
}


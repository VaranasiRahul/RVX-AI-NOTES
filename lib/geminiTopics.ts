/**
 * Gemini-powered topic analysis
 * Works on every device (pure HTTP, zero native code).
 * Free tier: 15 req/min, 1M tokens/day — gemini-2.0-flash-lite @ aistudio.google.com
 */

const GEMINI_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export type Topic = { title: string; body: string; summary: string };

const SYSTEM_PROMPT = `You are an expert academic organizer. The user will provide a continuous wall of study notes.
Your task is to intelligently divide this text into logical, comprehensive topics based purely on semantic meaning and flow.

CRITICAL RULES:
1. Divide the text into comprehensive, self-contained topics. Each topic block MUST represent a complete, cohesive idea, workflow, or major section.
2. DO NOT cut off topics abruptly. Ensure that a single continuous concept is fully contained within one block, even if it is long. Avoid splitting a process step-by-step artificially if it belongs together.
3. Group related smaller points together. DO NOT create excessively short or disjointed blocks (e.g., a "black page with a few lines"). If a block feels too small or lacks context when read in isolation, it must be merged into the surrounding block.
4. AGGRESSIVELY DELETE CONVERSATIONAL FILLER. If the text begins with or contains AI chatter (e.g., "Below are deep, structured...", "Here are your notes", "Sure, I can help", or random raw links), COMPLETELY OMIT that text from your entire output. Do NOT include it as a topic. Just skip straight to the actual study material.
5. IGNORE all visual formatting (lines, spaces, dashes) or existing structural headers. Make splitting decisions based solely on when the underlying subject matter naturally and firmly shifts to a new major section.
6. PRESERVE ALL ACTUAL STUDY CONTENT. Every single piece of relevant information, command, detail, code snippet, and bullet point from the original text MUST be included. 
7. Give each topic a highly descriptive, meaningful heading/title based on the content inside that block. This heading MUST act as an accurate summary of what the block is teaching.
   - The heading CAN be long (up to a full sentence) if necessary.
   - The heading MUST NOT be a raw URL link.
   - The heading MUST NOT be a single word without context (e.g., instead of "Advantages", use "Advantages of Terraform State Files").
8. GENERATE A DETAILED SUMMARY. For each block, write a comprehensive, in-depth paragraph (at least 5-8 full sentences) that deeply explains the core concepts, flow, and most important takeaways of that specific topic block. The summary should be highly detailed, long enough to fill a large reading card, and act as a standalone explanation of the material.

Respond ONLY with a valid JSON array of objects, containing no markdown fences and no extra explanation:
[{"title":"...","body":"...","summary":"..."},...]`;

export async function analyzeWithGemini(
    content: string,
    apiKey: string,
    onProgress?: (msg: string) => void
): Promise<Topic[]> {
    onProgress?.('Connecting to Gemini…');

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

    onProgress?.('Parsing AI response…');
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
        title: String(t.title ?? 'Topic').slice(0, 80),
        body: String(t.body ?? '').trim(),
        summary: String(t.summary ?? 'No summary available.').trim(),
    }));
}

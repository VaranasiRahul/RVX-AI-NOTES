import { extractKeywords, stripMarkdown } from './lib/localSummarizer';

const STOP = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'we', 'i',
    'you', 'what', 'which', 'who', 'how', 'all', 'each', 'every', 'some', 'such', 'not',
    'also', 'then', 'there', 'here', 'get', 'got', 'make', 'use', 'just', 'as', 'than',
    'used', 'using', 'basically', 'later', 'first', 'next',
]);

function stem(word: string): string {
    return word
        .replace(/ies$/, 'y')
        .replace(/(es|s)$/, '')
        .replace(/(ing|tion|ment|ness|ize|ise)$/, '');
}

function contentWords(text: string): Set<string> {
    return new Set(
        stripMarkdown(text)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3 && !STOP.has(w))
            .map(w => stem(w))
    );
}

const p0 = "A web application consists of frontend and backend.";
const p1 = "Frontend is built using HTML, CSS, and JavaScript.";

console.log("P0:", Array.from(contentWords(p0)));
console.log("P1:", Array.from(contentWords(p1)));


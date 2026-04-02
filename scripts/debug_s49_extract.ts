import { readFileSync, writeFileSync } from 'fs';
const file = readFileSync('./lib/smartTopicParser.ts', 'utf8');

const s49 = "A web application consists of frontend and backend.\n\nFrontend is built using HTML, CSS, and JavaScript.\n\nBackend is built using Node.js or Java.";

const script = `
import * as Parser from './lib/smartTopicParser';
const text49 = "A web application consists of frontend and backend.\\n\\nFrontend is built using HTML, CSS, and JavaScript.\\n\\nBackend is built using Node.js or Java.";
const paragraphs = text49.split('\\n\\n');

// we can't export internal functions easily, so let's just log boundaries check inside
`;
// Let me just add console logs to smartTopicParser.ts

import { readFileSync } from 'fs';
const text = readFileSync('./lib/smartTopicParser.ts', 'utf8');
console.log(text.split('function detectBoundariesEnhanced')[1].substring(0, 1500));

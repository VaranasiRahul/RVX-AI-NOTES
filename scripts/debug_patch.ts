import { smartSplitTopics } from '../lib/smartTopicParser';

// I will patch the local file directly using AST or simply run my own copy
import fs from 'fs';

const parser = fs.readFileSync('lib/smartTopicParser.ts', 'utf8')
    .replace('function detectBoundaries(', 'export function detectBoundaries(')
    .replace('function detectBoundariesEnhanced(', 'export function detectBoundariesEnhanced(')
    .replace('function splitByTopLevelStructure(', 'export function splitByTopLevelStructure(');

fs.writeFileSync('lib/smartTopicParser_patched.ts', parser);

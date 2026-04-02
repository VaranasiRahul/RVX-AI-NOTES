import { detectBoundaries, detectBoundariesEnhanced, mergeShortBlocks, extractSubjects, wordCount, contentWords } from '../lib/smartTopicParser_patched';

const p = ["To check disk usage use:", "df -h", "To check memory usage:", "free -m", "Docker is used for containers."];
const b1 = detectBoundaries(p);
console.log("Phase 2 boundaries:", b1);

const b2 = detectBoundariesEnhanced(p, b1);
console.log("Phase 4 boundaries:", b2);

const grouped = [];
let start = 0;
const blocks = [...b2];
for (let i = 1; i < blocks.length; i++) {
    grouped.push(p.slice(blocks[i-1], blocks[i]).join('\n\n'));
}
grouped.push(p.slice(blocks[blocks.length-1]).join('\n\n'));

console.log("Grouped blocks:");
grouped.forEach(g => console.log(g.replace(/\n/g, '\\n')));

const merged = mergeShortBlocks(grouped);
console.log("Merged blocks:", merged);

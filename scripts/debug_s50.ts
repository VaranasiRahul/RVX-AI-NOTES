import { smartSplitTopics } from '../lib/smartTopicParser';
const text = "A web application consists of frontend and backend where frontend handles UI and backend processes business logic and both work together to deliver functionality.";
console.log("Input word count:", text.split(/\s+/).length);
console.log("Has newlines:", text.includes('\n'));
const result = smartSplitTopics(text);
console.log("Result count:", result.length);
result.forEach((r, i) => console.log(`  [${i}] "${r.title}" (${r.wordCount}w)`));

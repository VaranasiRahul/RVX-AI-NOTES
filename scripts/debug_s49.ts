import { smartSplitTopics } from '../lib/smartTopicParser';
const text49 = "A web application consists of frontend and backend.\n\nFrontend is built using HTML, CSS, and JavaScript.\n\nBackend is built using Node.js or Java.";
console.log("=== S49 ===");
const r49 = smartSplitTopics(text49);
console.log("Result count:", r49.length);
r49.forEach((r, i) => console.log("  [" + i + "] \"" + r.title + "\" (" + r.wordCount + "w)"));

const text50 = "A web application consists of frontend and backend where frontend handles UI and backend processes business logic and both work together to deliver functionality.";
console.log("\n=== S50 ===");
const r50 = smartSplitTopics(text50);
console.log("Result count:", r50.length);
r50.forEach((r, i) => console.log("  [" + i + "] \"" + r.title + "\" (" + r.wordCount + "w)"));

const text54 = "HTTP is a protocol used for communication over the web.\n\nREST is an architectural style built on top of HTTP.";
console.log("\n=== S54 ===");
const r54 = smartSplitTopics(text54);
console.log("Result count:", r54.length);
r54.forEach((r, i) => console.log("  [" + i + "] \"" + r.title + "\" (" + r.wordCount + "w)"));

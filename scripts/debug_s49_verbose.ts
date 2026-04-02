import { smartSplitTopics } from '../lib/smartTopicParser';

const text49 = "A web application consists of frontend and backend.\n\nFrontend is built using HTML, CSS, and JavaScript.\n\nBackend is built using Node.js or Java.";
console.log("=== S49 ===");
const res = smartSplitTopics(text49);
console.dir(res.map(r => r.body), { depth: null });

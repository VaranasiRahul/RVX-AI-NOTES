import { smartSplitTopics } from '../lib/smartTopicParser';

const t = {
    id: "58",
    name: "NATURAL LANGUAGE + COMMANDS MIX",
    text: "To check disk usage use:\n\ndf -h\n\nTo check memory usage:\n\nfree -m\n\nDocker is used for containers.",
    expectedCount: 2
};

const blocks = smartSplitTopics(t.text);
console.log(JSON.stringify(blocks, null, 2));

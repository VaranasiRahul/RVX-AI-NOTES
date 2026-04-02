import { smartSplitTopics } from '../lib/smartTopicParser';
const t = {text: `so i was learning python and wrote some code like \n\n\`\`\`python\nprint("hello")\n\`\`\`\n\nthen i also learned sql queries like select * from users and joins and stuff and later moved to nodejs backend for apis.`};
console.log(JSON.stringify(smartSplitTopics(t.text), null, 2));

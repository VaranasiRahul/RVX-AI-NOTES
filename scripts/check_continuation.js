// @ts-nocheck
const CONTINUATION_PHRASES = [
    /^(this|that|these|those|it|they|their|its) /i,
    /^(for example|for instance|such as|like) /i,
    /^(to (troubleshoot|fix|resolve|avoid|prevent|understand|do|manage|achieve|create|update|delete|use|configure|setup)) /i,
    /^(because|since|due to|as a result) /i,
    /^(however|moreover|furthermore|additionally|in addition|also) /i,
    /^(causes?:|fixes?:|solutions?:|steps?:|example:)/i,
    /^\* / // Bullet points are often continuations
];

function isContinuation(text) {
    const firstLine = text.trim().split(/\n/)[0];
    return CONTINUATION_PHRASES.some(r => r.test(firstLine));
}

console.log("Q1", isContinuation("This usually happens due to application errors")); // true
console.log("Q2", isContinuation("To troubleshoot this issue, use kubectl")); // true
console.log("Q3", isContinuation("The pom.xml file is the core")); // false
console.log("Q4", isContinuation("Dependencies are downloaded from Maven Central")); // false


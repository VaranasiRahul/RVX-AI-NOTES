import { generateDeepSummary } from '../lib/deepSummarizer';

const block1 = `Understanding the Kubernetes Scheduler
The scheduler is a control plane component that watches for newly created Pods with no assigned node, and selects a node for them to run on. It evaluates resource requirements and constraints.`;

const block2 = `Node Affinity and Anti-Affinity
You can constrain a pod so that it is restricted to run on particular nodes, or nodes where particular conditions are met. Node Affinity is conceptually similar to nodeSelector but allows far more expressive syntax.`;

const sum1 = generateDeepSummary(block1, 'Understanding the Kubernetes Scheduler');
const sum2 = generateDeepSummary(block2, 'Node Affinity and Anti-Affinity');

console.log('=== BLOCK 1 SUMMARY ===');
console.log(sum1);
console.log('\n\n=== BLOCK 2 SUMMARY ===');
console.log(sum2);
console.log('\n\nSame?', sum1 === sum2);
console.log('Sum1 starts with:', JSON.stringify(sum1.slice(0, 50)));
console.log('Sum2 starts with:', JSON.stringify(sum2.slice(0, 50)));

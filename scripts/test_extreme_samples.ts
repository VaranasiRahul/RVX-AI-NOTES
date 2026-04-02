import { smartSplitTopics } from '../lib/smartTopicParser';

type TestCase = { id: string; name: string; text: string; expectedCount: number };

const tests: TestCase[] = [
    {
        id: "46",
        name: "TOPIC WITH SAME VOCAB",
        text: `Scaling in Kubernetes involves increasing the number of pods to handle more traffic. It ensures high availability and performance.\n\nScaling in databases refers to increasing read replicas or sharding data to distribute load.`,
        expectedCount: 2
    },
    {
        id: "47",
        name: "HEAVY CHATGPT STYLE",
        text: `Alright, let's understand this step by step.\n\nFirst, Python is used for general-purpose programming and is widely adopted due to its simplicity.\n\nNow, moving on to Java, it is a strongly typed language used in enterprise systems.\n\nFinally, let’s talk about Go, which is used for building scalable backend systems.`,
        expectedCount: 3
    },
    {
        id: "48",
        name: "INLINE CODE + TEXT MIXED",
        text: `Python loops are used to iterate over data. For example:\n\nfor i in range(5): print(i)\n\nJava uses loops like:\n\nfor(int i=0;i<5;i++){System.out.println(i);}`,
        expectedCount: 2
    },
    {
        id: "49",
        name: "VERY TRICKY — SAME FLOW BUT SHOULD SPLIT",
        text: `A web application consists of frontend and backend.\n\nFrontend is built using HTML, CSS, and JavaScript.\n\nBackend is built using Node.js or Java.`,
        expectedCount: 2
    },
    {
        id: "50",
        name: "VERY TRICKY — SHOULD NOT SPLIT",
        text: `A web application consists of frontend and backend where frontend handles UI and backend processes business logic and both work together to deliver functionality.`,
        expectedCount: 1
    },
    {
        id: "51",
        name: "LONG + DISTRACTION TEXT",
        text: `So basically I was just experimenting and writing some notes randomly and then I realized that machine learning is a field where models learn from data and make predictions without being explicitly programmed and it includes supervised and unsupervised learning and then later I switched to deep learning which is a subset of ML using neural networks with multiple layers.`,
        expectedCount: 2
    },
    {
        id: "52",
        name: "MULTIPLE SMALL TOPICS NO CLEAR BREAK",
        text: `Docker containers package apps Kubernetes manages them Terraform provisions infra Ansible configures servers Jenkins automates pipelines`,
        expectedCount: 5
    },
    {
        id: "53",
        name: "CODE BLOCK CONFUSION",
        text: `Here is a Python example:\n\ndef hello():\n    print("hello")\n\nNow SQL is used to query databases:\n\nSELECT * FROM users;`,
        expectedCount: 2
    },
    {
        id: "54",
        name: "SAME DOMAIN, DIFFERENT LEVEL",
        text: `HTTP is a protocol used for communication over the web.\n\nREST is an architectural style built on top of HTTP.`,
        expectedCount: 2
    },
    {
        id: "55",
        name: "SEMANTIC DRIFT SLOW",
        text: `Docker is used for containerization.\n\nContainers are lightweight.\n\nThey share the host OS.\n\nKubernetes manages containers.`,
        expectedCount: 2
    },
    {
        id: "56",
        name: "VERY LONG CHATGPT RESPONSE STYLE",
        text: `Let me explain this in detail.\n\nMicroservices architecture divides applications into small independent services. Each service can be deployed independently and communicates via APIs.\n\nThis improves scalability and maintainability.\n\nHere is an example:\n\n{\n  "service": "order",\n  "endpoint": "/api/orders"\n}\n\nOn the other hand, monolithic architecture is a single unified codebase where all components are tightly coupled.`,
        expectedCount: 2
    },
    {
        id: "57",
        name: "AMBIGUOUS WORD USAGE",
        text: `Node refers to a machine in Kubernetes cluster.\n\nNode.js is a runtime environment for JavaScript.`,
        expectedCount: 2
    },
    {
        id: "58",
        name: "NATURAL LANGUAGE + COMMANDS MIX",
        text: `To check disk usage use:\n\ndf -h\n\nTo check memory usage:\n\nfree -m\n\nDocker is used for containers.`,
        expectedCount: 2
    },
    {
        id: "59",
        name: "VERY HARD — REPEATED CONTEXT",
        text: `Machine learning models require training data.\n\nTraining involves feeding data into models.\n\nModels improve accuracy over time.\n\nDeep learning models use neural networks.`,
        expectedCount: 2
    },
    {
        id: "60",
        name: "REAL USER DUMP — CHAOS",
        text: `i learned python basics loops conditions then sql joins select queries then docker containers then kubernetes pods deployments then aws ec2 s3 and then ci cd pipelines in gitlab`,
        expectedCount: 6
    }
];

let passed = 0;
console.log('\\n══════════════════════════════════════════════════════════');
console.log(`  COMPREHENSIVE PARSER TEST — EXTREME EDGES`);
console.log('══════════════════════════════════════════════════════════\\n');

for (const t of tests) {
    const blocks = smartSplitTopics(t.text);
    if (blocks.length === t.expectedCount) {
        console.log(`✅ SAMPLE ${t.id} (${t.name}): ${blocks.length}/${t.expectedCount}`);
        passed++;
    } else {
        console.log(`❌ SAMPLE ${t.id} (${t.name}): got ${blocks.length}, expected ${t.expectedCount}`);
        blocks.forEach((b, i) => {
            const short = b.body.substring(0, 50).replace(/\n/g, ' ') + '...';
            console.log(`     [${i+1}] "${b.title}" (${b.wordCount}w) — ${short}`);
        });
    }
}

console.log('\\n──────────────────────────────────────────────────────────');
console.log(`  RESULTS: ${passed}/${tests.length} passed (${Math.round(passed/tests.length*100)}%)`);
console.log('──────────────────────────────────────────────────────────\\n');

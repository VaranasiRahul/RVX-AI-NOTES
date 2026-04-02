import { smartSplitTopics } from '../lib/smartTopicParser';

type TestCase = { id: string; name: string; text: string; expectedCount: number };

const tests: TestCase[] = [
    {
        id: "31",
        name: "SYSTEM DESIGN",
        text: `Load balancing is used to distribute traffic across multiple servers to improve availability and performance. It ensures no single server is overwhelmed.

There are different types of load balancing such as round robin, least connections, and IP hash.

Caching is used to store frequently accessed data to reduce latency and database load. Tools like Redis and Memcached are commonly used.`,
        expectedCount: 2
    },
    {
        id: "32",
        name: "PROGRAMMING + CODE",
        text: `Python is a high-level programming language known for its simplicity and readability. It is widely used in web development, data science, and automation.

Example of a Python function:

def add(a, b):
    return a + b

Java is another popular programming language that is strongly typed and used in enterprise applications.

public int add(int a, int b) {
    return a + b;
}`,
        expectedCount: 2
    },
    {
        id: "33",
        name: "DBMS",
        text: `Normalization is a process in databases to eliminate redundancy and improve data integrity. It involves dividing tables into smaller ones.

There are different normal forms like 1NF, 2NF, and 3NF.

Indexing is used to improve query performance by creating data structures that allow faster lookups.`,
        expectedCount: 2
    },
    {
        id: "34",
        name: "OS + CODE MIX",
        text: `Process scheduling is a key concept in operating systems. It determines which process runs at a given time.

Common algorithms include FCFS, Round Robin, and Priority Scheduling.

Example of a simple scheduling logic:

for(int i=0;i<n;i++){
    execute(process[i]);
}

Memory management is another important concept that handles allocation and deallocation of memory.`,
        expectedCount: 2
    },
    {
        id: "35",
        name: "MATH",
        text: `Derivatives represent the rate of change of a function. It is used to find slopes and optimize functions.

For example, derivative of x^2 is 2x.

Integrals represent accumulation of quantities and are used to calculate area under curves.`,
        expectedCount: 2
    },
    {
        id: "36",
        name: "AI / ML",
        text: `Machine learning is a subset of AI that allows systems to learn from data.

Supervised learning uses labeled data while unsupervised learning uses unlabeled data.

Neural networks are models inspired by the human brain and consist of layers of neurons.`,
        expectedCount: 2
    },
    {
        id: "37",
        name: "CHATGPT STYLE NOTES",
        text: `Sure, let's break this down step by step.

First, Docker is used for containerization. It packages applications along with dependencies.

Now, Kubernetes comes into picture when you need to manage multiple containers across systems.

Here’s a quick example:

docker run -d nginx
kubectl get pods`,
        expectedCount: 2
    },
    {
        id: "38",
        name: "LONG EXPLANATION + SHIFT",
        text: `Recursion is a programming technique where a function calls itself. It is useful for problems like tree traversal and factorial calculation.

However, recursion can lead to stack overflow if not handled properly. It is important to define a base case.

Dynamic programming is an optimization technique that solves problems by storing intermediate results.`,
        expectedCount: 2
    },
    {
        id: "39",
        name: "MULTI DOMAIN MIX",
        text: `HTML is used to structure web pages.

CSS is used to style web pages.

JavaScript is used to add interactivity.

React is a JavaScript library used to build UI components.`,
        expectedCount: 2
    },
    {
        id: "40",
        name: "CHAOTIC USER INPUT WITH CODE",
        text: `so i was learning python and wrote some code like this

for i in range(5):
    print(i)

then i also learned sql queries like select * from users and joins and stuff and later moved to nodejs backend`,
        expectedCount: 3
    },
    {
        id: "41",
        name: "BIOLOGY",
        text: `Photosynthesis is the process by which plants convert sunlight into energy.

It involves chlorophyll and produces oxygen.

Respiration is the process by which organisms convert glucose into energy.`,
        expectedCount: 2
    },
    {
        id: "42",
        name: "FINANCE",
        text: `Stocks represent ownership in a company.

Investors buy stocks to gain returns.

Bonds are debt instruments where investors lend money to entities.`,
        expectedCount: 2
    },
    {
        id: "43",
        name: "EDGE CASE — SAME DOMAIN BUT SPLIT",
        text: `Sorting algorithms arrange data in order.

QuickSort uses divide and conquer.

MergeSort also uses divide and conquer but works differently.

Searching algorithms find elements in data.`,
        expectedCount: 2
    },
    {
        id: "44",
        name: "VERY LONG CHATGPT STYLE",
        text: `Let’s understand microservices architecture.

Microservices break applications into smaller independent services. Each service handles a specific business function.

They communicate using APIs and are independently deployable.

Here’s an example:

{
  "service": "user",
  "endpoint": "/api/users"
}

Monolithic architecture is the traditional approach where everything is built as a single application.`,
        expectedCount: 2
    },
    {
        id: "45",
        name: "TRICK — DO NOT OVER SPLIT",
        text: `Binary search is an efficient algorithm used to find an element in a sorted array. It works by repeatedly dividing the search space in half until the element is found or the range becomes empty.`,
        expectedCount: 1
    }
];

let passed = 0;
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  COMPREHENSIVE PARSER TEST — NEW DOMAINS`);
console.log('══════════════════════════════════════════════════════════\n');

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

console.log('\n──────────────────────────────────────────────────────────');
console.log(`  RESULTS: ${passed}/${tests.length} passed (${Math.round(passed/tests.length*100)}%)`);
console.log('──────────────────────────────────────────────────────────\n');

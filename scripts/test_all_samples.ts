/**
 * Comprehensive test suite — 30 samples testing semantic splitting.
 * Run: npx tsx scripts/test_all_samples.ts
 */
// @ts-nocheck

const SAMPLES = [
  {
    name: 'SAMPLE 1 (STRUCTURED)',
    expected: 4,
    input: `Maven is a build automation tool used for Java applications. It helps developers manage dependencies and build lifecycle efficiently.

The pom.xml file is the core configuration file in Maven. It defines dependencies, plugins, and project metadata.

Maven lifecycle consists of phases like validate, compile, test, package, install, and deploy.

Dependencies are downloaded from Maven Central and stored in the local repository.`,
  },
  {
    name: 'SAMPLE 2 (SEMI-STRUCTURED)',
    expected: 4,
    input: `Maven simplifies project builds and dependency management in Java projects. It ensures consistency across environments.

The pom.xml file stores all configuration including dependencies and plugins.

Lifecycle phases such as validate, test, and install run sequentially.

Dependencies are fetched from remote repositories and cached locally.`,
  },
  {
    name: 'SAMPLE 3 (MESSY LONG)',
    expected: 3,
    input: `maven is used for build automation in java projects it manages dependencies and lifecycle pom.xml is important because it contains all configurations lifecycle includes validate test install phases dependencies are downloaded from central repository and stored locally docker is used for containerization it helps package applications with dependencies containers are lightweight and faster than virtual machines kubernetes is used for orchestration it manages scaling deployment and networking of containers pods are smallest unit deployments manage replicas services expose applications`,
  },
  {
    name: 'SAMPLE 4 (MIXED FORMAT)',
    expected: 3,
    input: `Maven is a build tool.

- pom.xml defines dependencies
- manages build

Lifecycle:

- validate
- test
- install

Docker is used for containerization.

- containers are lightweight
- portable

Kubernetes manages containers.

- pods
- deployments`,
  },
  {
    name: 'SAMPLE 5 (LONG EXPLANATION)',
    expected: 2,
    note: 'Do NOT split CrashLoopBackOff explanation',
    input: `CrashLoopBackOff is a Kubernetes state where a container repeatedly crashes and restarts. Kubernetes applies exponential backoff delay to avoid constant restarts and resource wastage.

This usually happens due to application errors, missing configurations, or memory issues. For example, if a container exceeds memory limits, it is killed and restarted.

To troubleshoot this issue, use kubectl describe pod and kubectl logs --previous to identify the root cause. Fixing configuration or resource limits resolves the issue.

EC2 instances behind load balancer may become unavailable due to failed health checks, incorrect security groups, or application issues.`,
  },
  {
    name: 'SAMPLE 6 (NO STRUCTURE)',
    expected: 1,
    input: `i worked on aws where i handled ec2 deployments and load balancers ensuring high availability i automated ci cd pipelines using gitlab including build test deploy stages i used kubernetes for container orchestration and handled crashloopbackoff issues i also monitored systems using dynatrace`,
  },
  {
    name: 'SAMPLE 7 (INTERVIEW STYLE)',
    expected: 4,
    input: `AWS Cost Increase
Check Cost Explorer and identify services.

EC2 Unavailability
Check target group and security groups.

Git Migration
Use git clone --bare and push mirror.

CrashLoopBackOff
Check logs and memory limits.`,
  },
  {
    name: 'SAMPLE 8 (COMMANDS + THEORY)',
    expected: 2,
    input: `Docker is a container platform used to package applications.

docker run -d nginx
docker ps

Kubernetes manages containers at scale.

kubectl get pods`,
  },
  {
    name: 'SAMPLE 9 (GRADUAL SHIFT)',
    expected: 2,
    input: `Docker is used for containerization and packaging applications.

Images are used to create containers and stored in registries.

Kubernetes is used to orchestrate containers across nodes.

Pods are smallest unit in Kubernetes.`,
  },
  {
    name: 'SAMPLE 10 (NO SPLIT)',
    expected: 1,
    input: `Git is a version control system that tracks changes in code and enables collaboration through branching and merging.`,
  },
  {
    name: 'SAMPLE 11 (INLINE SHIFT)',
    expected: 3,
    input: `Maven builds Java applications and manages dependencies Docker packages applications into containers Kubernetes orchestrates containers across nodes`,
  },
  {
    name: 'SAMPLE 12 (INTERRUPTED FLOW)',
    expected: 2,
    input: `Docker is used for containers and packaging apps.

Note containers are lightweight.

Kubernetes manages scaling and orchestration.`,
  },
  {
    name: 'SAMPLE 13 (SIMILAR WORDS DIFFERENT CONTEXT)',
    expected: 2,
    input: `Docker images are used to create containers and stored in registries.

In Kubernetes, images are used inside pods for deployments.`,
  },
  {
    name: 'SAMPLE 14 (SAME DOMAIN DIFFERENT CONCEPTS)',
    expected: 3,
    input: `Pods are smallest unit in Kubernetes.

Services expose applications.

Deployments manage scaling and replicas.`,
  },
  {
    name: 'SAMPLE 15 (NOISY INPUT)',
    expected: 2,
    input: `so basically i was testing things and then i learned maven is used for build automation and dependency management then later i worked on docker which is used for containerization`,
  },
  {
    name: 'SAMPLE 16 (CODE HEAVY)',
    expected: 2,
    input: `docker run -d nginx
docker ps

kubectl get pods
kubectl describe pod`,
  },
  {
    name: 'SAMPLE 17 (LIST CONTINUATION)',
    expected: 1,
    input: `CrashLoopBackOff occurs when container crashes repeatedly.

Causes:

- missing env variables
- memory issues

Fix:

- check logs
- increase resources`,
  },
  {
    name: 'SAMPLE 18 (SHORT FRAGMENTS)',
    expected: 2,
    input: `Docker containers are lightweight.

Faster than VMs.

Used for microservices.

Kubernetes manages containers.`,
  },
  {
    name: 'SAMPLE 19 (TRANSITION WORDS)',
    expected: 2,
    input: `First we discuss Docker which is used for containerization.

Next we discuss Kubernetes which is used for orchestration.`,
  },
  {
    name: 'SAMPLE 20 (LONG SINGLE TOPIC)',
    expected: 1,
    input: `Git is a distributed version control system that enables tracking changes in code, collaboration among developers, branching strategies, and rollback capabilities. It is widely used in software development.`,
  },
  {
    name: 'SAMPLE 21 (AMBIGUOUS SHIFT)',
    expected: 2,
    input: `AWS provides EC2 for compute and S3 for storage.

EC2 is used for hosting applications.

S3 is used for object storage.`,
  },
  {
    name: 'SAMPLE 22 (MULTI-TOOLS)',
    expected: 3,
    input: `Jenkins is used for CI/CD pipelines.

Terraform is used for infrastructure provisioning.

Kubernetes is used for orchestration.`,
  },
  {
    name: 'SAMPLE 23 (HIDDEN SHIFT)',
    expected: 2,
    input: `Terraform provisions infrastructure using declarative files.

Kubernetes defines resources using YAML.`,
  },
  {
    name: 'SAMPLE 24 (INLINE MIX)',
    expected: 3,
    input: `Docker containerization Kubernetes orchestration Terraform provisioning`,
  },
  {
    name: 'SAMPLE 25 (REAL LONG INTERVIEW)',
    expected: 2,
    input: `CrashLoopBackOff happens when a container crashes repeatedly and Kubernetes restarts it with delay due to exponential backoff. This is caused by application errors or memory issues.

To debug check logs and pod description.

EC2 instances fail health checks due to misconfigurations.`,
  },
  {
    name: 'SAMPLE 26 (SAME WORD DIFFERENT CONTEXT)',
    expected: 2,
    input: `Scaling in Kubernetes means increasing pods.

Scaling in AWS means increasing instances.`,
  },
  {
    name: 'SAMPLE 27 (MINIMAL)',
    expected: 2,
    input: `Docker container.

Kubernetes pod.`,
  },
  {
    name: 'SAMPLE 28 (CONCEPT + TOOL)',
    expected: 2,
    input: `Ansible automates configuration using playbooks.

Docker packages applications into containers.`,
  },
  {
    name: 'SAMPLE 29 (GRADUAL DRIFT)',
    expected: 2,
    input: `Docker packages applications.

Containers run apps.

Kubernetes manages containers.

Pods belong to Kubernetes.`,
  },
  {
    name: 'SAMPLE 30 (CHAOTIC REAL USER INPUT)',
    expected: 5,
    input: `i used docker for containers kubernetes for orchestration aws ec2 for compute gitlab pipelines for ci cd dynatrace for monitoring`,
  },
];

function main() {
    const { smartSplitTopics } = require('../lib/smartTopicParser');

    console.log('\\n══════════════════════════════════════════════════════════');
    console.log('  COMPREHENSIVE PARSER TEST — 30 Samples');
    console.log('══════════════════════════════════════════════════════════\\n');

    let pass = 0;
    let fail = 0;
    const failures: string[] = [];

    for (const sample of SAMPLES) {
        const topics = smartSplitTopics(sample.input);
        const got = topics.length;
        const ok = got === sample.expected;
        const icon = ok ? '✅' : '❌';

        if (ok) {
            pass++;
            console.log(`${icon} ${sample.name}: ${got}/${sample.expected}`);
        } else {
            fail++;
            console.log(`${icon} ${sample.name}: got ${got}, expected ${sample.expected}`);
            topics.forEach((t: any, i: number) => {
                const preview = t.body.replace(/\n/g, ' ').slice(0, 60);
                console.log(`     [${i + 1}] "${t.title}" (${t.wordCount}w) — ${preview}...`);
            });
            failures.push(`${sample.name}: got ${got}, expected ${sample.expected}`);
        }
    }

    console.log('\\n──────────────────────────────────────────────────────────');
    console.log(`  RESULTS: ${pass}/30 passed (${Math.round(pass / 30 * 100)}%)`);
    console.log('──────────────────────────────────────────────────────────');
    if (failures.length > 0) {
        console.log('\\n  FAILURES:');
        failures.forEach(f => console.log(`    • ${f}`));
    }
    console.log('');
}

main();

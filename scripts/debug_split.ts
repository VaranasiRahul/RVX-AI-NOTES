// @ts-nocheck
const fs = require('fs');
const { smartSplitTopics } = require('../lib/smartTopicParser');

const sample5 = `CrashLoopBackOff is a Kubernetes state where a container repeatedly crashes and restarts. Kubernetes applies exponential backoff delay to avoid constant restarts and resource wastage.

This usually happens due to application errors, missing configurations, or memory issues. For example, if a container exceeds memory limits, it is killed and restarted.

To troubleshoot this issue, use kubectl describe pod and kubectl logs --previous to identify the root cause. Fixing configuration or resource limits resolves the issue.

EC2 instances behind load balancer may become unavailable due to failed health checks, incorrect security groups, or application issues.`;

const sample1 = `Maven is a build automation tool used for Java applications. It helps developers manage dependencies and build lifecycle efficiently.

The pom.xml file is the core configuration file in Maven. It defines dependencies, plugins, and project metadata.

Maven lifecycle consists of phases like validate, compile, test, package, install, and deploy.

Dependencies are downloaded from Maven Central and stored in the local repository.`;

console.log("=== S5 ===");
console.log(smartSplitTopics(sample5).map(t => t.title + " (" + t.wordCount + ")").join('\n'));
console.log("=== S1 ===");
console.log(smartSplitTopics(sample1).map(t => t.title + " (" + t.wordCount + ")").join('\n'));

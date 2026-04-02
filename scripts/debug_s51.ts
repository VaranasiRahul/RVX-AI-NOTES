import { smartSplitTopics } from '../lib/smartTopicParser';

const text = "So basically I was just experimenting and writing some notes randomly and then I realized that machine learning is a field where models learn from data and make predictions without being explicitly programmed and it includes supervised and unsupervised learning and then later I switched to deep learning which is a subset of ML using neural networks with multiple layers.";

console.log(smartSplitTopics(text));

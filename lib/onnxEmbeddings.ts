/**
 * ONNX Sentence Embeddings
 * Uses all-MiniLM-L6-v2 (quantized, ~23MB) — downloaded once on first use.
 * No API key required. Runs fully on-device.
 *
 * ⚠️  Requires an ARM64 device or emulator.
 *     x86_64 emulators are NOT supported by onnxruntime-react-native.
 *     Use a physical Android device or an ARM64 (Apple Silicon) emulator.
 */
import {
    documentDirectory,
    getInfoAsync,
    readAsStringAsync,
    createDownloadResumable,
} from 'expo-file-system/legacy';

// ── URLs (HuggingFace CDN) ────────────────────────────────────────────────────
const MODEL_URL = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx';
const VOCAB_URL = 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/vocab.txt';
const MODEL_PATH = (documentDirectory ?? '') + 'onnx_minilm_quantized.onnx';
const VOCAB_PATH = (documentDirectory ?? '') + 'onnx_vocab.txt';

const MAX_LEN = 128;
const CLS = 101;
const SEP = 102;
const PAD = 0;
const UNK = 100;

// ── Lazy native module import (prevents crash on unsupported architectures) ────
type OnnxModule = { InferenceSession: any; Tensor: any };
let _onnx: OnnxModule | null = null;
let _onnxLoadError: string | null = null;

async function getOnnx(): Promise<OnnxModule> {
    if (_onnx) return _onnx;
    if (_onnxLoadError) throw new Error(_onnxLoadError);
    try {
        // Dynamic require inside try-catch so a missing/unsupported native library
        // surfaces as a clear message rather than crashing the app.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('onnxruntime-react-native');
        if (!mod?.InferenceSession) throw new Error('InferenceSession not found in module');
        _onnx = mod as OnnxModule;
        return _onnx;
    } catch (e: any) {
        _onnxLoadError = `ONNX Runtime unavailable on this device/emulator. Use a physical ARM64 Android device. (${e?.message ?? e})`;
        throw new Error(_onnxLoadError);
    }
}

// ── Module-level singletons ───────────────────────────────────────────────────
let _session: any | null = null;
let _vocab: Map<string, number> | null = null;
let _initPromise: Promise<void> | null = null;

export type ProgressCallback = (msg: string) => void;

// ── Download helper ───────────────────────────────────────────────────────────
async function downloadIfMissing(
    url: string,
    dest: string,
    label: string,
    onProgress: ProgressCallback
): Promise<void> {
    const info = await getInfoAsync(dest);
    if (info.exists) return;

    onProgress(`Downloading ${label}…`);
    const dl = createDownloadResumable(
        url,
        dest,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
            if (totalBytesExpectedToWrite > 0) {
                const pct = Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100);
                onProgress(`Downloading ${label}… ${pct}%`);
            }
        }
    );
    const result = await dl.downloadAsync();
    if (!result || result.status !== 200) throw new Error(`Failed to download ${label}`);
}

// ── Vocabulary loader ─────────────────────────────────────────────────────────
async function loadVocab(): Promise<Map<string, number>> {
    if (_vocab) return _vocab;
    const txt = await readAsStringAsync(VOCAB_PATH);
    const map = new Map<string, number>();
    txt.split('\n').forEach((token: string, idx: number) => {
        const t = token.trim();
        if (t) map.set(t, idx);
    });
    _vocab = map;
    return map;
}

// ── Simplified tokenizer ──────────────────────────────────────────────────────
function tokenize(text: string, vocab: Map<string, number>): {
    input_ids: number[];
    attention_mask: number[];
    token_type_ids: number[];
} {
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9'\-\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    const ids: number[] = [CLS];
    for (const word of words) {
        if (ids.length >= MAX_LEN - 1) break;
        const id = vocab.get(word) ?? vocab.get(`##${word}`) ?? UNK;
        ids.push(id);
    }
    ids.push(SEP);

    const seqLen = ids.length;
    const inputIds = [...ids];
    const attentionMask = new Array(seqLen).fill(1);
    const tokenTypeIds = new Array(seqLen).fill(0);

    while (inputIds.length < MAX_LEN) {
        inputIds.push(PAD);
        attentionMask.push(0);
        tokenTypeIds.push(0);
    }

    return { input_ids: inputIds, attention_mask: attentionMask, token_type_ids: tokenTypeIds };
}

// ── Mean pooling ──────────────────────────────────────────────────────────────
function meanPool(hiddenState: Float32Array, attentionMask: number[], seqLen: number, hiddenSize: number): Float32Array {
    const result = new Float32Array(hiddenSize);
    let count = 0;
    for (let i = 0; i < seqLen; i++) {
        if (attentionMask[i] === 1) {
            count++;
            for (let j = 0; j < hiddenSize; j++) result[j] += hiddenState[i * hiddenSize + j];
        }
    }
    if (count > 0) for (let j = 0; j < hiddenSize; j++) result[j] /= count;
    return result;
}

// ── L2 normalise ─────────────────────────────────────────────────────────────
function l2Normalize(vec: Float32Array): Float32Array {
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    return vec.map(v => v / norm) as Float32Array;
}

// ── Public: ensure model + vocab are ready ───────────────────────────────────
export async function ensureModelReady(onProgress: ProgressCallback = () => { }): Promise<void> {
    if (_session && _vocab) return;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        // This will throw a clear error if the native module can't load (e.g. wrong arch)
        const { InferenceSession } = await getOnnx();

        await downloadIfMissing(VOCAB_URL, VOCAB_PATH, 'vocabulary', onProgress);
        await downloadIfMissing(MODEL_URL, MODEL_PATH, 'AI model (23 MB)', onProgress);

        onProgress('Loading AI model…');
        await loadVocab();
        _session = await InferenceSession.create(MODEL_PATH, {
            executionProviders: ['cpu'],
        });
        onProgress('Ready');
    })().catch((e: any) => {
        // Reset so subsequent calls can retry after fixing the environment
        _initPromise = null;
        throw e;
    });

    return _initPromise;
}

// ── Public: embed a single paragraph ─────────────────────────────────────────
export async function embedText(text: string): Promise<Float32Array> {
    if (!_session || !_vocab) throw new Error('Model not ready. Call ensureModelReady() first.');
    const { Tensor } = await getOnnx();

    const { input_ids, attention_mask, token_type_ids } = tokenize(text, _vocab);

    const mkTensor = (data: number[]) => {
        // We pass a standard JavaScript array of BigInts instead of a TypedArray.
        // On many Android devices, Hermes lacks native JSI support for BigInt64Array memory sharing,
        // and passing Int32Array causes out-of-bounds segfaults. Passing an array of BigInt objects
        // forces the bridge to serialize the tokens securely, element-by-element.
        return new Tensor('int64', data.map(n => BigInt(Math.floor(n))), [1, MAX_LEN]);
    };

    const feeds = {
        input_ids: mkTensor(input_ids),
        attention_mask: mkTensor(attention_mask),
        token_type_ids: mkTensor(token_type_ids),
    };

    const outputs = await _session.run(feeds);

    const hiddenKey = Object.keys(outputs).find((k: string) => k.includes('hidden') || k.includes('token')) ?? Object.keys(outputs)[0];
    const hiddenState = outputs[hiddenKey].data as Float32Array;
    const hiddenSize = hiddenState.length / MAX_LEN;

    const pooled = meanPool(hiddenState, attention_mask, MAX_LEN, hiddenSize);
    return l2Normalize(pooled);
}

// ── Public: cosine similarity ─────────────────────────────────────────────────
export function cosineSim(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
}

// ── Public: detect topic boundaries using embeddings ─────────────────────────
export async function detectTopicBoundaries(
    paragraphs: string[],
    onProgress: ProgressCallback = () => { }
): Promise<number[]> {
    if (paragraphs.length <= 1) return [];

    onProgress('Computing embeddings…');
    const embeddings: Float32Array[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
        onProgress(`Analyzing paragraph ${i + 1}/${paragraphs.length}…`);
        embeddings.push(await embedText(paragraphs[i]));
        // Brief pause to allow React Native UI thread to render and garbage collect
        await new Promise(r => setTimeout(r, 10));
    }

    const k = Math.max(1, Math.min(3, Math.floor(paragraphs.length / 4)));
    const sims: number[] = [];

    for (let i = 0; i < paragraphs.length - 1; i++) {
        const leftVecs = embeddings.slice(Math.max(0, i - k + 1), i + 1);
        const rightVecs = embeddings.slice(i + 1, Math.min(paragraphs.length, i + k + 1));
        sims.push(cosineSim(avgEmbeddings(leftVecs), avgEmbeddings(rightVecs)));
    }

    const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
    const std = Math.sqrt(sims.map(s => (s - mean) ** 2).reduce((a, b) => a + b, 0) / sims.length);
    const thr = mean - 0.5 * std;

    const boundaries: number[] = [];
    for (let i = 0; i < sims.length; i++) {
        const isValley =
            sims[i] < thr &&
            sims[i] <= (sims[i - 1] ?? 1) &&
            sims[i] <= (sims[i + 1] ?? 1);
        if (isValley) boundaries.push(i + 1);
    }
    return boundaries;
}

function avgEmbeddings(vecs: Float32Array[]): Float32Array {
    const size = vecs[0].length;
    const result = new Float32Array(size);
    for (const v of vecs) for (let i = 0; i < size; i++) result[i] += v[i];
    for (let i = 0; i < size; i++) result[i] /= vecs.length;
    return l2Normalize(result);
}

// ── Public: reset session ─────────────────────────────────────────────────────
export function resetOnnxSession(): void {
    _session = null;
    _vocab = null;
    _initPromise = null;
}

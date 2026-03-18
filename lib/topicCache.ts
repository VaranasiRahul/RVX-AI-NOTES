/**
 * Topic Cache — persists AI-generated topic splits in FileSystem.
 * Files are saved to document directory to prevent OS cleaners from wiping it.
 */
import {
    documentDirectory,
    getInfoAsync,
    makeDirectoryAsync,
    readAsStringAsync,
    writeAsStringAsync,
    readDirectoryAsync,
    deleteAsync
} from 'expo-file-system/legacy';

export interface TopicEntry {
    title: string;
    body: string;
    summary: string;
    keywords?: string[];
    wordCount?: number;
    hasCode?: boolean;
    hasDefinitions?: boolean;
}

const CACHE_DIR = `${documentDirectory ?? 'file:///data/user/0/com.reviseit/files/'}ai_topics_v18/`;

// ── Cache Event Emitter ────────────────────────────────────────────────────────
type CacheListener = () => void;
const listeners = new Set<CacheListener>();

export function onCacheUpdated(cb: CacheListener): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function notifyCacheUpdated() {
    listeners.forEach(cb => cb());
}

// ── Simple hash (djb2) — no native crypto needed ──────────────────────────────
function hashContent(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        hash = hash & hash; // convert to 32-bit int
    }
    return (hash >>> 0).toString(36); // unsigned → base36 string
}

async function ensureDir() {
    try {
        const info = await getInfoAsync(CACHE_DIR);
        if (!info.exists) {
            await makeDirectoryAsync(CACHE_DIR, { intermediates: true });
        }
    } catch {
        // ignore
    }
}

function getFilePath(noteId: string, content: string): string {
    return `${CACHE_DIR}${noteId}__${hashContent(content)}.json`;
}

// ── Get cached AI topics (returns null if not cached or content changed) ──────
export async function getCachedTopics(
    noteId: string,
    content: string
): Promise<TopicEntry[] | null> {
    try {
        await ensureDir();
        const filePath = getFilePath(noteId, content);
        const info = await getInfoAsync(filePath);
        if (!info.exists) return null;
        const raw = await readAsStringAsync(filePath);
        return JSON.parse(raw) as TopicEntry[];
    } catch {
        return null;
    }
}

// ── Store AI topics for a note ─────────────────────────────────────────────────
export async function setCachedTopics(
    noteId: string,
    content: string,
    topics: TopicEntry[]
): Promise<void> {
    try {
        await ensureDir();

        // Before saving new cache, delete old caches for this note to prevent bloating
        await clearCachedTopics(noteId);

        const filePath = getFilePath(noteId, content);
        await writeAsStringAsync(filePath, JSON.stringify(topics));
        notifyCacheUpdated();
    } catch {
        // storage full or unavailable — silently ignore
    }
}

// ── Clear one note's cache (call after note deletion or manual reset) ─────────
export async function clearCachedTopics(noteId?: string): Promise<void> {
    try {
        await ensureDir();
        const files = await readDirectoryAsync(CACHE_DIR);

        const toRemove = noteId
            ? files.filter(f => f.startsWith(`${noteId}__`))
            : files;

        await Promise.all(
            toRemove.map(file => deleteAsync(`${CACHE_DIR}${file}`, { idempotent: true }))
        );
    } catch {
        // ignore
    }
}

// ── Check if a note already has a cached AI result (any content hash) ─────────
export async function hasAnyCache(noteId: string): Promise<boolean> {
    try {
        await ensureDir();
        const files = await readDirectoryAsync(CACHE_DIR);
        return files.some(f => f.startsWith(`${noteId}__`));
    } catch {
        return false;
    }
}

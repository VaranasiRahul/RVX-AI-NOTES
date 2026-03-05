/**
 * Topic Cache — persists AI-generated topic splits in AsyncStorage.
 * Key: `ai_topics__{noteId}__{contentHash}`
 * Falls back gracefully when no AI result exists.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TopicEntry {
    title: string;
    body: string;
    summary: string;
}

const PREFIX = 'ai_topics_v18__';

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

function cacheKey(noteId: string, content: string): string {
    return `${PREFIX}${noteId}__${hashContent(content)}`;
}

// ── Get cached AI topics (returns null if not cached or content changed) ──────
export async function getCachedTopics(
    noteId: string,
    content: string
): Promise<TopicEntry[] | null> {
    try {
        const raw = await AsyncStorage.getItem(cacheKey(noteId, content));
        if (!raw) return null;
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
        await AsyncStorage.setItem(cacheKey(noteId, content), JSON.stringify(topics));
        notifyCacheUpdated();
    } catch {
        // storage full or unavailable — silently ignore
    }
}

// ── Clear one note's cache (call after note deletion or manual reset) ─────────
export async function clearCachedTopics(noteId?: string): Promise<void> {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const toRemove = noteId
            ? keys.filter(k => k.startsWith(`${PREFIX}${noteId}__`))
            : keys.filter(k => k.startsWith(PREFIX));
        if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
    } catch {
        // ignore
    }
}

// ── Check if a note already has a cached AI result (any content hash) ─────────
export async function hasAnyCache(noteId: string): Promise<boolean> {
    try {
        const keys = await AsyncStorage.getAllKeys();
        return keys.some(k => k.startsWith(`${PREFIX}${noteId}__`));
    } catch {
        return false;
    }
}

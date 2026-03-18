import {
    documentDirectory,
    readAsStringAsync,
    writeAsStringAsync,
    getInfoAsync,
    makeDirectoryAsync
} from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DATA_DIR = `${documentDirectory ?? 'file:///data/user/0/com.reviseit/files/'}persistent_data/`;

let dirEnsured = false;
const writeQueues: Record<string, Promise<void>> = {};

async function ensureDir() {
    if (dirEnsured) return;
    const info = await getInfoAsync(DATA_DIR);
    if (!info.exists) {
        try {
            await makeDirectoryAsync(DATA_DIR, { intermediates: true });
        } catch (e: any) {
            // Ignore if it somehow got created between the check and creation
        }
    }
    dirEnsured = true;
}

export async function saveToPersistentStore(key: string, data: any): Promise<void> {
    // strict sequential queue per key to prevent filesystem write race conditions
    const prevPromise = writeQueues[key] || Promise.resolve();
    
    writeQueues[key] = prevPromise.then(async () => {
        try {
            await ensureDir();
            const path = `${DATA_DIR}${key}.json`;
            await writeAsStringAsync(path, JSON.stringify(data));
            // We also keep a mirror in AsyncStorage for quick sync access if needed
            await AsyncStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.warn(`Failed to save ${key} to persistent store:`, e);
        }
    }).catch(e => {
        console.warn(`Unexpected queue error making save ${key}:`, e);
    });

    return writeQueues[key];
}

export async function loadFromPersistentStore<T>(key: string, defaultValue: T): Promise<T> {
    try {
        await ensureDir();
        const path = `${DATA_DIR}${key}.json`;
        const info = await getInfoAsync(path);

        if (info.exists) {
            const raw = await readAsStringAsync(path);
            return JSON.parse(raw) as T;
        }

        // Migration: Check if it exists in AsyncStorage
        const legacy = await AsyncStorage.getItem(key);
        if (legacy !== null) {
            let data: T;
            try {
                data = JSON.parse(legacy);
            } catch {
                // If it fails to parse (e.g., raw string like an API key), treat the raw string as the data
                data = legacy as unknown as T;
            }
            // Migrate to persistent store
            await saveToPersistentStore(key, data);
            return data;
        }

        return defaultValue;
    } catch (e) {
        console.warn(`Failed to load ${key} from persistent store:`, e);
        return defaultValue;
    }
}

export async function deleteFromPersistentStore(key: string): Promise<void> {
    try {
        await ensureDir();
        const path = `${DATA_DIR}${key}.json`;
        const { deleteAsync } = await import('expo-file-system/legacy');
        await deleteAsync(path, { idempotent: true });
        await AsyncStorage.removeItem(key);
    } catch (e) {
        console.warn(`Failed to delete ${key} from persistent store:`, e);
    }
}

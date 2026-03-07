import {
    documentDirectory,
    readAsStringAsync,
    writeAsStringAsync,
    getInfoAsync,
    makeDirectoryAsync
} from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DATA_DIR = `${documentDirectory ?? 'file:///data/user/0/com.reviseit/files/'}persistent_data/`;

async function ensureDir() {
    const info = await getInfoAsync(DATA_DIR);
    if (!info.exists) {
        await makeDirectoryAsync(DATA_DIR, { intermediates: true });
    }
}

export async function saveToPersistentStore(key: string, data: any): Promise<void> {
    try {
        await ensureDir();
        const path = `${DATA_DIR}${key}.json`;
        await writeAsStringAsync(path, JSON.stringify(data));
        // We also keep a mirror in AsyncStorage for quick sync access if needed,
        // but the FileSystem version is the source of truth for "persistence".
        await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn(`Failed to save ${key} to persistent store:`, e);
    }
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

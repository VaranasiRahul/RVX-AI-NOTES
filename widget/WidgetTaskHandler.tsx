import React from 'react';
import { WidgetTaskHandlerProps } from 'react-native-android-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MarkedBlockWidget, WidgetData } from './MarkedBlockWidget';

const STORAGE_KEYS = {
    FOLDERS: 'reviseit_folders',
    NOTES: 'reviseit_notes',
    MARKED: 'reviseit_marked_topics',
    WIDGET_INDEX: 'reviseit_widget_recent_index',
};

// We redefine minimal interfaces here so the background task depends on as little as possible
interface Folder {
    id: string;
    name: string;
    color: string;
}

interface Note {
    id: string;
    folderId: string;
    content: string;
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
    try {
        // Determine the action (update, click, etc.)
        switch (props.widgetAction) {
            case 'WIDGET_ADDED':
            case 'WIDGET_UPDATE':
            case 'WIDGET_RESIZED':
                await renderWidget(props);
                break;
            case 'WIDGET_DELETED':
            case 'WIDGET_CLICK':
            default:
                break;
        }
    } catch (error) {
        console.error('Widget task error:', error);
    }
}

async function renderWidget({ renderWidget }: WidgetTaskHandlerProps) {
    const data = await getNextMarkedBlock();
    renderWidget(<MarkedBlockWidget data={data} />);
}

async function getNextMarkedBlock(): Promise<WidgetData | null> {
    const markedJson = await AsyncStorage.getItem(STORAGE_KEYS.MARKED);
    const notesJson = await AsyncStorage.getItem(STORAGE_KEYS.NOTES);
    const foldersJson = await AsyncStorage.getItem(STORAGE_KEYS.FOLDERS);

    if (!markedJson || !notesJson) return null;

    const markedKeys: Record<string, boolean> = JSON.parse(markedJson);
    const validKeys = Object.keys(markedKeys).filter(k => markedKeys[k]);

    if (validKeys.length === 0) return null;

    const notes: Note[] = JSON.parse(notesJson);
    const folders: Folder[] = foldersJson ? JSON.parse(foldersJson) : [];

    // Helper to extract body
    const _getBlockData = (note: Note, index: number): { title: string, body: string } | null => {
        const raw = note.content;
        if (!raw.trim()) return null;

        const lines = raw.split('\n');
        const blocks: string[] = [];
        let current: string[] = [];
        let hrCount = 0;

        const flush = () => {
            const text = current.join('\n').trim();
            if (text.length > 0) blocks.push(text);
            current = [];
            hrCount = 0;
        };

        for (const line of lines) {
            const trimmed = line.trim();
            const isHR = /^-{3,}\s*$/.test(trimmed) || /^\*{3,}\s*$/.test(trimmed);

            if (isHR) {
                hrCount++;
            } else if (trimmed === '') {
                if (hrCount === 0) current.push(line);
            } else {
                if (hrCount >= 2) flush();
                else if (hrCount === 1) current.push('---');
                hrCount = 0;
                current.push(line);
            }
        }
        flush();

        if (blocks.length === 0 && index === 0) return { title: extractTitle(raw), body: raw.trim() };
        if (!blocks[index]) return null;

        return { title: extractTitle(blocks[index]), body: blocks[index] };
    };

    const extractTitle = (text: string): string => {
        const allLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let firstValidLine = '';
        for (const line of allLines) {
            if (line.startsWith('http')) continue;
            firstValidLine = line;
            break;
        }
        if (!firstValidLine && allLines.length > 0) firstValidLine = allLines[0];
        return firstValidLine.replace(/^#{1,6}\s+/, '').replace(/^\d+[\.\)]\s+/, '').replace(/^[IVX]+[\.\)]\s+/, '').replace(/^[★✦◆▶→•]\s+/, '').trim().slice(0, 100) || 'Topic';
    };

    // 1. Get current index, increment and wrap
    let currentIdx = 0;
    try {
        const savedIdx = await AsyncStorage.getItem(STORAGE_KEYS.WIDGET_INDEX);
        if (savedIdx) currentIdx = parseInt(savedIdx, 10);
    } catch (e) { }

    currentIdx = (currentIdx + 1) % validKeys.length;
    await AsyncStorage.setItem(STORAGE_KEYS.WIDGET_INDEX, currentIdx.toString());

    // Pick the key
    const targetKey = validKeys[currentIdx];
    const [noteId, topicIndexStr] = targetKey.split('-');
    const topicIndex = parseInt(topicIndexStr, 10);

    const note = notes.find(n => n.id === noteId);
    if (!note) return null; // Edge case: note was deleted but mark wasn't cleared

    const folder = folders.find(f => f.id === note.folderId);
    const block = _getBlockData(note, topicIndex);

    if (!block) return null;

    return {
        title: block.title,
        body: block.body,
        folderName: folder?.name || 'Topic',
        folderColor: folder?.color || '#D4A96A',
        folderId: folder?.id || 'f',
        noteId: note.id,
        topicIndex: topicIndex,
    };
}

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

    // Helper to extract body identically to smartTopicParser.ts
    const _getBlockData = (note: Note, index: number): { title: string, body: string } | null => {
        const raw = note.content;
        if (!raw.trim()) return null;

        // Line boundary patterns used in the main app
        const LINE_BOUNDARY_PATTERNS = [
            /^#{1,6}\s+\S/,
            /^\d{1,3}[\.\)]\s+[A-Za-z]/,
            /^[IVX]{1,4}[\.\)]\s+[A-Z]/,
            /^(PART|CHAPTER|UNIT|SECTION|MODULE)\s*\d+/i,
            /^\*\*[^*]{2,80}\*\*\s*$/,
            /^__[^_]{2,80}__\s*$/,
            /^[a-zA-Z][a-zA-Z0-9\s\-_.]{1,55}:\s*$/,
            /^[A-Z][A-Z0-9\s]{4,50}$/,
        ];

        const isLineBoundary = (line: string): boolean => {
            const t = line.trim();
            if (!t || t.length < 2 || t.length > 120) return false;
            for (const rx of LINE_BOUNDARY_PATTERNS) {
                if (rx.test(t)) {
                    // Quick check for maxWords if matched colon/all-caps
                    if (t.endsWith(':') && t.split(/\s+/).length > 6) continue;
                    if (/^[A-Z]/.test(t) && t.toUpperCase() === t && t.split(/\s+/).length > 8) continue;
                    return true;
                }
            }
            return false;
        };

        const segmentIntoParagraphs = (content: string): string[] => {
            const lines = content.split('\n');
            const paragraphs: string[] = [];
            let current: string[] = [];
            let hrCount = 0;
            let inCodeBlock = false;

            const flush = () => {
                const text = current.join('\n').trim();
                if (text.length > 0) paragraphs.push(text);
                current = [];
                hrCount = 0;
            };

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('```')) { inCodeBlock = !inCodeBlock; current.push(line); continue; }
                if (inCodeBlock) { current.push(line); continue; }

                const isHR = /^-{3,}\s*$/.test(trimmed) || /^\*{3,}\s*$/.test(trimmed) || /^={3,}\s*$/.test(trimmed);
                if (isHR) { hrCount++; continue; }

                if (trimmed === '') {
                    if (hrCount >= 2) { flush(); }
                    else if (hrCount === 1) { current.push('---'); hrCount = 0; }
                    else {
                        const accumulated = current.join('\n').trim();
                        if (accumulated.length > 0) { paragraphs.push(accumulated); current = []; }
                    }
                    continue;
                }

                if (hrCount >= 2) flush();
                else if (hrCount === 1) { current.push('---'); }
                hrCount = 0;

                if (isLineBoundary(trimmed)) flush();
                current.push(line);
            }
            flush();
            return paragraphs.filter(p => p.trim().length > 0);
        };

        const paragraphs = segmentIntoParagraphs(raw);
        // We will just do a simplified group since we need basic functionality for the widget without all imports
        // Replicate basic logic for boundaries to get blocks:
        let blocks: string[] = [];
        let curBlock: string[] = [];

        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            const firstLine = p.split('\n')[0].trim();

            if (i > 0 && isLineBoundary(firstLine)) {
                blocks.push(curBlock.join('\n\n'));
                curBlock = [p];
            } else {
                curBlock.push(p);
            }
        }
        if (curBlock.length > 0) blocks.push(curBlock.join('\n\n'));

        // Smart merge
        const MIN_BLOCK_WORDS = 40;
        const result: string[] = [];
        for (const block of blocks) {
            const wc = block.split(/\s+/).length;
            const prevIsStructured = result.length > 0 && isLineBoundary(result[result.length - 1].split('\n')[0].trim());
            const curIsStructured = isLineBoundary(block.split('\n')[0].trim());
            if (wc < MIN_BLOCK_WORDS && result.length > 0 && !curIsStructured && !prevIsStructured) {
                result[result.length - 1] = result[result.length - 1] + '\n\n' + block;
            } else {
                result.push(block);
            }
        }

        const finalBlocks = result.length > 0 ? result : [raw.trim()];

        // If the array is still empty (edge case)
        if (finalBlocks.length === 0 && index === 0) return { title: extractTitle(raw), body: raw.trim() };
        if (!finalBlocks[index]) return null;

        return { title: extractTitle(finalBlocks[index]), body: finalBlocks[index] };
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

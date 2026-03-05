import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { TopicEntry } from '@/lib/topicCache';
import { generateLocalSummary } from '@/lib/localSummarizer';

export interface Folder {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Note {
  id: string;
  folderId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  title: string;
  body: string;
  summary: string;
  noteId: string;
  folderId: string;
  topicIndex: number;
}

export interface DailyTopic {
  date: string;
  noteId: string;
  folderId: string;
  topicIndex: number;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastRevisedDate: string | null;
  history: string[];
  dailyReviewCounts: Record<string, number>; // date -> count of topics reviewed
}

// SM-2 spaced repetition data per topic
export interface TopicProgress {
  interval: number;      // days until next review
  easeFactor: number;    // multiplier (default 2.5)
  dueDate: string;       // ISO date string YYYY-MM-DD
  reviewCount: number;
  lastRating: 'easy' | 'good' | 'hard' | 'again' | null;
}

export type SRRating = 'easy' | 'good' | 'hard' | 'again';

const FOLDER_COLORS = [
  '#D4A96A', '#6BBF8E', '#7AABCF', '#C47AC4', '#E07070',
  '#E8B84B', '#5E9E87', '#A67DB8', '#CF8070', '#6B9EBF',
  '#88C0A8', '#E8956D', '#9BAFD9', '#F4C26A', '#72BBA8',
];

export const ALL_FOLDER_COLORS = FOLDER_COLORS;

const STORAGE_KEYS = {
  FOLDERS: 'reviseit_folders',
  NOTES: 'reviseit_notes',
  STREAK: 'reviseit_streak',
  DAILY_TOPIC: 'reviseit_daily_topic',
  SR: 'reviseit_sr',
  THEME: 'reviseit_theme',
  GEMINI_KEY: 'reviseit_gemini_key',
  MARKED: 'reviseit_marked_topics',
};

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function getDateString(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

// SM-2 algorithm
function applySM2(progress: TopicProgress, rating: SRRating): TopicProgress {
  let { interval, easeFactor, reviewCount } = progress;

  if (rating === 'again') {
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else if (rating === 'hard') {
    interval = Math.max(1, Math.round(interval * 1.2));
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (rating === 'good') {
    if (reviewCount === 0) interval = 1;
    else if (reviewCount === 1) interval = 3;
    else interval = Math.round(interval * easeFactor);
  } else { // easy
    if (reviewCount === 0) interval = 3;
    else interval = Math.round(interval * easeFactor * 1.3);
    easeFactor = Math.min(3.0, easeFactor + 0.15);
  }

  return {
    interval: Math.min(interval, 365),
    easeFactor,
    dueDate: getDateString(interval),
    reviewCount: reviewCount + 1,
    lastRating: rating,
  };
}


// ── AI Sync Status Emitter ───────────────────────────────────────────────────
type SyncListener = (isSyncing: boolean) => void;
const syncListeners = new Set<SyncListener>();
let aiSyncCount = 0;

function updateAiSync(delta: number) {
  aiSyncCount = Math.max(0, aiSyncCount + delta);
  const isSyncing = aiSyncCount > 0;
  syncListeners.forEach(cb => cb(isSyncing));
}

export function useAiSyncStatus(): boolean {
  const [isSyncing, setIsSyncing] = useState(aiSyncCount > 0);
  useEffect(() => {
    const fn = (state: boolean) => setIsSyncing(state);
    syncListeners.add(fn);
    return () => { syncListeners.delete(fn); };
  }, []);
  return isSyncing;
}

export async function runAiAnalysis(
  noteId: string,
  content: string,
  geminiApiKey: string,
  onProgress?: (msg: string) => void
): Promise<TopicEntry[]> {
  updateAiSync(1);
  try {
    const { getCachedTopics, setCachedTopics } = await import('@/lib/topicCache');

    // Return cached result if content hasn't changed
    const cached = await getCachedTopics(noteId, content);
    if (cached) return cached;

    let topics: TopicEntry[];

    if (geminiApiKey) {
      // Gemini path — only when user has explicitly configured an API key
      onProgress?.('Connecting to Gemini…');
      try {
        const { analyzeWithGemini } = await import('@/lib/geminiTopics');
        topics = await analyzeWithGemini(content, geminiApiKey, onProgress);
      } catch (err: any) {
        // Fallback to local parsing if Gemini fails (e.g. quota exceeded)
        onProgress?.('Gemini failed, using local parser…');
        const { smartSplitTopics } = await import('@/lib/smartTopicParser');
        await new Promise(r => setTimeout(r, 20)); // yield for progress UI
        topics = smartSplitTopics(content);
        // Prepend an error note to the first topic title so they know it fell back
        if (topics.length > 0 && err.message?.includes('429')) {
          onProgress?.('Quota exhausted. Used local parser.');
        }
      }
    } else {
      // Smart local parser — zero API calls, instant, works offline
      onProgress?.('Analyzing topics…');
      const { smartSplitTopics } = await import('@/lib/smartTopicParser');
      // Run synchronously but yield once so progress message renders
      await new Promise(r => setTimeout(r, 20));
      topics = smartSplitTopics(content);
    }

    // --- Post-Processing To Fix Bad AI/Fallback Blocks ---
    let cleanTopics: TopicEntry[] = [];
    for (const t of topics) {
      let title = t.title.trim();
      let body = t.body.trim();

      // 1. Skip excessively tiny/empty blocks (e.g. just raw lines/spaces)
      if (body.replace(/[-\s*_]/g, '').length < 15) {
        continue;
      }

      // 1b. Skip conversational AI filler blocks (e.g. ChatGPT preamble)
      const bodyLower = body.toLowerCase();
      const titleLower = title.toLowerCase();
      const isConversationalFiller =
        bodyLower.includes('structured, interview-ready') ||
        titleLower.includes('structured, interview-ready') ||
        (bodyLower.length < 150 && (bodyLower.startsWith('here is') || bodyLower.startsWith('below are')));

      if (isConversationalFiller && !body.includes('```')) {
        continue;
      }

      // 2. Fix URLs generated as Title
      if (/^https?:\/\//i.test(title)) {
        const validLines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !/^https?:\/\//i.test(l));
        title = validLines.length > 0 ? validLines[0].replace(/^#{1,6}\s+/, '').slice(0, 50) : "Resource Link";
      }

      // 3. Augment single-word titles (like "Advantages") without context
      if (title.split(/\s+/).length === 1 && title.length < 16) {
        const validLines = body.split('\n').map(l => l.trim()).filter(l => l.length > 10 && !/^https?:\/\//i.test(l));
        if (validLines.length > 0) {
          let extraContext = validLines[0].replace(/^#{1,6}\s+/, '').replace(/^[-*•]\s+/, '').slice(0, 40);
          title = `${title} — ${extraContext}`;
        }
      }

      // Cleanup trailing punctuation on titles generated by augmenting
      title = title.replace(/[:;-]+$/, '').trim();

      cleanTopics.push({
        title,
        body,
        summary: t.summary && t.summary.trim().length > 10 && !t.summary.startsWith(body.slice(0, 20))
          ? t.summary
          : generateLocalSummary(body)
      });
    }

    // Safety fallback
    if (cleanTopics.length === 0) {
      cleanTopics = [{ title: "Note Content", body: content, summary: content.slice(0, 800) + '...' }];
    }

    await setCachedTopics(noteId, content, cleanTopics);
    onProgress?.('Done ✓');
    return cleanTopics;
  } finally {
    updateAiSync(-1);
  }
}


/**
 * parseTopics — splits a note into topics by looking for section dividers.
 *
 * Rule: wherever 2 or more `---` lines appear in a row (optionally surrounded
 * by blank lines) the content is considered a new topic block.
 *
 * This matches the user's note format exactly:
 *   ---
 *   ---
 *   ---        ← this group triggers a split
 */
export function parseTopics(note: Note): TopicEntry[] {
  const raw = note.content;
  if (!raw.trim()) return [];

  // ── Title extractor ──────────────────────────────────────────────────────
  const extractTitle = (text: string): string => {
    // 1. Get all lines in the block
    const allLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // 2. Find the first line that is NOT just a raw URL/link
    let firstValidLine = '';
    for (const line of allLines) {
      if (line.startsWith('http://') || line.startsWith('https://')) {
        continue; // skip naked links
      }
      firstValidLine = line;
      break;
    }

    // 3. If everything was a link, fallback to the very first line anyway
    if (!firstValidLine && allLines.length > 0) firstValidLine = allLines[0];

    // 4. Strip ONLY markdown/numbering block-level decorations for the clean title
    // but LEAVE inline styling (**, __, `) intact so they render as rich text
    return firstValidLine
      .replace(/^#{1,6}\s+/, '')   // ## Heading
      .replace(/^\d+[\.\)]\s+/, '') // 1. Numbered
      .replace(/^[IVX]+[\.\)]\s+/, '') // I. Roman
      .replace(/^[★✦◆▶→•]\s+/, '') // Symbol prefix
      .trim()
      .slice(0, 100) || 'Topic';
  };

  // ── Split on 2+ consecutive --- lines (the user's section separator) ─────
  // Strategy: scan lines and detect a run of 2+ `---` lines (with optional
  // blank lines between them). Each such run ends the current block.
  const lines = raw.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let hrCount = 0; // consecutive --- lines seen

  const flush = () => {
    // Remove leading/trailing blank lines from accumulated block
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
      // Don't add the --- itself to the content block
    } else if (trimmed === '') {
      // Blank line: if we're in a separator run, keep counting; otherwise add to block
      // (do nothing — blank lines between --- are fine, keep hrCount)
      if (hrCount === 0) {
        current.push(line); // normal blank line inside content
      }
      // else: ignore blank lines that are part of the separator group
    } else {
      // Real content line
      if (hrCount >= 2) {
        // We just passed a section separator (2+ ---): flush the current block
        flush();
      } else if (hrCount === 1) {
        // Only a single ---, it's likely a decorative horizontal rule inside a section
        // Add it to the current block content
        current.push('---');
      }
      hrCount = 0;
      current.push(line);
    }
  }
  // Flush the last block
  flush();

  if (blocks.length === 0) return [{ title: extractTitle(raw), body: raw.trim(), summary: generateLocalSummary(raw.trim()) }];

  return blocks.map(block => ({
    title: extractTitle(block),
    body: block,
    summary: generateLocalSummary(block),
  }));
}


export function getTopicKey(noteId: string, topicIndex: number): string {
  return `${noteId}-${topicIndex}`;
}

interface NotesContextValue {
  folders: Folder[];
  notes: Note[];
  streak: StreakData;
  dailyTopic: DailyTopic | null;
  topicProgress: Record<string, TopicProgress>;
  isLoading: boolean;

  createFolder: (name: string, color?: string) => Promise<Folder>;
  updateFolder: (id: string, name: string, color?: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  createNote: (folderId: string, title: string) => Promise<Note>;
  updateNote: (id: string, title: string, content: string, tags?: string[]) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  getNotesByFolder: (folderId: string) => Note[];

  rollDailyTopic: () => Promise<void>;
  markRevised: () => Promise<void>;
  getDailyTopicData: () => Promise<Topic | null>;

  rateTopic: (noteId: string, topicIndex: number, rating: SRRating) => Promise<void>;
  getTopicProgress: (noteId: string, topicIndex: number) => TopicProgress | null;

  exportData: () => Promise<string>;
  importData: (json: string) => Promise<void>;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => Promise<void>;
  analyzeNoteWithAI: (
    noteId: string,
    content: string,
    onProgress?: (msg: string) => void
  ) => Promise<TopicEntry[]>;
  clearAICache: (noteId?: string) => Promise<void>;
  markedTopics: Record<string, boolean>;
  toggleTopicMark: (noteId: string, topicIndex: number) => Promise<void>;
}

const DEFAULT_STREAK: StreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastRevisedDate: null,
  history: [],
  dailyReviewCounts: {},
};

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [streak, setStreak] = useState<StreakData>(DEFAULT_STREAK);
  const [dailyTopic, setDailyTopic] = useState<DailyTopic | null>(null);
  const [topicProgress, setTopicProgress] = useState<Record<string, TopicProgress>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [geminiApiKey, setGeminiApiKeyState] = useState<string>('');
  const [markedTopics, setMarkedTopics] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    try {
      const [foldersJson, notesJson, streakJson, dailyJson, srJson, geminiKey, markedJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.FOLDERS),
        AsyncStorage.getItem(STORAGE_KEYS.NOTES),
        AsyncStorage.getItem(STORAGE_KEYS.STREAK),
        AsyncStorage.getItem(STORAGE_KEYS.DAILY_TOPIC),
        AsyncStorage.getItem(STORAGE_KEYS.SR),
        AsyncStorage.getItem(STORAGE_KEYS.GEMINI_KEY),
        AsyncStorage.getItem(STORAGE_KEYS.MARKED),
      ]);

      if (geminiKey) setGeminiApiKeyState(geminiKey);
      const loadedFolders: Folder[] = foldersJson ? JSON.parse(foldersJson) : [];
      const loadedNotesRaw: any[] = notesJson ? JSON.parse(notesJson) : [];
      // Migrate old notes missing tags field
      const loadedNotes: Note[] = loadedNotesRaw.map(n => ({ tags: [], ...n }));
      const loadedStreakRaw: any = streakJson ? JSON.parse(streakJson) : {};
      const loadedStreak: StreakData = {
        ...DEFAULT_STREAK,
        ...loadedStreakRaw,
        dailyReviewCounts: loadedStreakRaw?.dailyReviewCounts || {},
      };
      const loadedDaily: DailyTopic | null = dailyJson ? JSON.parse(dailyJson) : null;
      const loadedSR: Record<string, TopicProgress> = srJson ? JSON.parse(srJson) : {};

      setFolders(loadedFolders);
      setNotes(loadedNotes);
      setStreak(loadedStreak);
      setTopicProgress(loadedSR);

      const today = getTodayString();
      if (loadedDaily && loadedDaily.date === today) {
        setDailyTopic(loadedDaily);
      } else if (loadedNotes.length > 0) {
        await rollDailyTopicWithNotes(loadedNotes);
      }
    } catch (e) {
      console.error('Failed to load data', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function rollDailyTopicWithNotes(currentNotes: Note[]) {
    const allTopics: DailyTopic[] = [];
    for (const note of currentNotes) {
      const topics = parseTopics(note);
      topics.forEach((_, i) => {
        allTopics.push({ date: getTodayString(), noteId: note.id, folderId: note.folderId, topicIndex: i });
      });
    }
    if (allTopics.length === 0) {
      setDailyTopic(null);
      return;
    }
    const random = allTopics[Math.floor(Math.random() * allTopics.length)];
    setDailyTopic(random);
    await AsyncStorage.setItem(STORAGE_KEYS.DAILY_TOPIC, JSON.stringify(random));
  }

  const rollDailyTopic = useCallback(async () => {
    await rollDailyTopicWithNotes(notes);
  }, [notes]);

  const markRevised = useCallback(async () => {
    const today = getTodayString();
    setStreak(prev => {
      if (prev.history.includes(today)) return prev;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const wasYesterday = prev.lastRevisedDate === yesterdayStr;
      const newStreak = wasYesterday ? prev.currentStreak + 1 : 1;
      const newLongest = Math.max(prev.longestStreak, newStreak);

      const updated: StreakData = {
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastRevisedDate: today,
        history: [...prev.history, today],
        dailyReviewCounts: {
          ...prev.dailyReviewCounts,
          [today]: (prev.dailyReviewCounts[today] || 0) + 1,
        },
      };

      AsyncStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getDailyTopicData = useCallback(async (): Promise<Topic | null> => {
    if (!dailyTopic) return null;
    const note = notes.find(n => n.id === dailyTopic.noteId);
    if (!note) return null;

    // Attempt to load AI-generated topics from cache first
    const { getCachedTopics } = await import('@/lib/topicCache');
    let topics = await getCachedTopics(note.id, note.content);
    if (!topics) topics = parseTopics(note);

    const topic = topics[dailyTopic.topicIndex];
    if (!topic) return null;
    return {
      title: topic.title,
      body: topic.body,
      summary: topic.summary,
      noteId: note.id,
      folderId: note.folderId,
      topicIndex: dailyTopic.topicIndex,
    };
  }, [dailyTopic, notes]);

  const rateTopic = useCallback(async (noteId: string, topicIndex: number, rating: SRRating) => {
    const key = getTopicKey(noteId, topicIndex);
    const today = getTodayString();
    setTopicProgress(prev => {
      const existing = prev[key] || {
        interval: 1, easeFactor: 2.5, dueDate: today, reviewCount: 0, lastRating: null,
      };
      const updated = { ...prev, [key]: applySM2(existing, rating) };
      AsyncStorage.setItem(STORAGE_KEYS.SR, JSON.stringify(updated));
      return updated;
    });
    // Increment daily review count
    setStreak(prev => {
      const updated = {
        ...prev,
        dailyReviewCounts: {
          ...prev.dailyReviewCounts,
          [today]: (prev.dailyReviewCounts[today] || 0) + 1,
        },
      };
      AsyncStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getTopicProgress = useCallback((noteId: string, topicIndex: number): TopicProgress | null => {
    const key = getTopicKey(noteId, topicIndex);
    return topicProgress[key] || null;
  }, [topicProgress]);

  const createFolder = useCallback(async (name: string, color?: string): Promise<Folder> => {
    const chosenColor = color || FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
    const folder: Folder = {
      id: Crypto.randomUUID(),
      name,
      color: chosenColor,
      createdAt: new Date().toISOString(),
    };
    const updated = [...folders, folder];
    setFolders(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(updated));
    return folder;
  }, [folders]);

  const updateFolder = useCallback(async (id: string, name: string, color?: string) => {
    const updated = folders.map(f =>
      f.id === id ? { ...f, name, ...(color ? { color } : {}) } : f
    );
    setFolders(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(updated));
  }, [folders]);

  const deleteFolder = useCallback(async (id: string) => {
    const updatedFolders = folders.filter(f => f.id !== id);
    const updatedNotes = notes.filter(n => n.folderId !== id);
    setFolders(updatedFolders);
    setNotes(updatedNotes);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(updatedFolders)),
      AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(updatedNotes)),
    ]);
  }, [folders, notes]);

  const createNote = useCallback(async (folderId: string, title: string): Promise<Note> => {
    const note: Note = {
      id: Crypto.randomUUID(),
      folderId,
      title,
      content: '',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...notes, note];
    setNotes(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(updated));

    // Auto-generate AI summaries in the background (fire-and-forget)
    if (geminiApiKey) {
      setTimeout(() => {
        runAiAnalysis(note.id, note.content, geminiApiKey).catch(e => console.warn('Background AI skipped/failed:', e));
      }, 500);
    }

    return note;
  }, [notes, geminiApiKey]);

  const updateNote = useCallback(async (id: string, title: string, content: string, tags?: string[]) => {
    const updated = notes.map(n =>
      n.id === id
        ? { ...n, title, content, updatedAt: new Date().toISOString(), ...(tags !== undefined ? { tags } : {}) }
        : n
    );
    setNotes(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(updated));

    // Auto-generate AI summaries in the background (fire-and-forget)
    if (geminiApiKey && content.trim().length > 10) {
      setTimeout(() => {
        runAiAnalysis(id, content, geminiApiKey).catch(e => console.warn('Background AI skipped/failed:', e));
      }, 500);
    }
  }, [notes, geminiApiKey]);

  const deleteNote = useCallback(async (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(updated));
  }, [notes]);

  const getNotesByFolder = useCallback((folderId: string): Note[] => {
    return notes.filter(n => n.folderId === folderId);
  }, [notes]);

  const exportData = useCallback(async (): Promise<string> => {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      folders,
      notes,
      streak,
      topicProgress,
    };
    return JSON.stringify(data, null, 2);
  }, [folders, notes, streak, topicProgress]);

  const importData = useCallback(async (json: string) => {
    const data = JSON.parse(json);
    const importedFolders: Folder[] = data.folders || [];
    const importedNotes: Note[] = (data.notes || []).map((n: any) => ({ tags: [], ...n }));
    const importedStreak: StreakData = { ...DEFAULT_STREAK, ...(data.streak || {}) };
    const importedSR: Record<string, TopicProgress> = data.topicProgress || {};

    setFolders(importedFolders);
    setNotes(importedNotes);
    setStreak(importedStreak);
    setTopicProgress(importedSR);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(importedFolders)),
      AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(importedNotes)),
      AsyncStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(importedStreak)),
      AsyncStorage.setItem(STORAGE_KEYS.SR, JSON.stringify(importedSR)),
    ]);
  }, []);

  const setGeminiApiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    setGeminiApiKeyState(trimmed);
    await AsyncStorage.setItem(STORAGE_KEYS.GEMINI_KEY, trimmed);
  }, []);

  const analyzeNoteWithAI = useCallback(async (
    noteId: string,
    content: string,
    onProgress?: (msg: string) => void
  ): Promise<TopicEntry[]> => {
    return await runAiAnalysis(noteId, content, geminiApiKey, onProgress);
  }, [geminiApiKey]);

  const clearAICache = useCallback(async (noteId?: string) => {
    const { clearCachedTopics } = await import('@/lib/topicCache');
    await clearCachedTopics(noteId);
  }, []);

  const toggleTopicMark = useCallback(async (noteId: string, topicIndex: number) => {
    const key = getTopicKey(noteId, topicIndex);
    setMarkedTopics(prev => {
      const updated = { ...prev };
      if (updated[key]) {
        delete updated[key];
      } else {
        updated[key] = true;
      }
      AsyncStorage.setItem(STORAGE_KEYS.MARKED, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const value = useMemo(() => ({
    folders,
    notes,
    streak,
    dailyTopic,
    topicProgress,
    isLoading,
    createFolder,
    updateFolder,
    deleteFolder,
    createNote,
    updateNote,
    deleteNote,
    getNotesByFolder,
    rollDailyTopic,
    markRevised,
    getDailyTopicData,
    rateTopic,
    getTopicProgress,
    exportData,
    importData,
    geminiApiKey,
    setGeminiApiKey,
    analyzeNoteWithAI,
    clearAICache,
    markedTopics,
    toggleTopicMark,
  }), [folders, notes, streak, dailyTopic, topicProgress, isLoading, createFolder, updateFolder, deleteFolder, createNote, updateNote, deleteNote, getNotesByFolder, rollDailyTopic, markRevised, getDailyTopicData, rateTopic, getTopicProgress, exportData, importData, geminiApiKey, setGeminiApiKey, analyzeNoteWithAI, clearAICache, markedTopics, toggleTopicMark]);

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within NotesProvider');
  return ctx;
}

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import * as Crypto from 'expo-crypto';
import type { TopicEntry } from '@/lib/topicCache';
import { generateDeepSummary } from '@/lib/deepSummarizer';
import { extractKeywords, stripMarkdown } from '@/lib/localSummarizer';
import { WidgetManager } from '@/lib/widget';
import {
  loadFromPersistentStore,
  saveToPersistentStore,
} from '@/lib/persistentStore';

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
  dailyReviewCounts: Record<string, number>;
}

// SM-2 spaced repetition data per topic
export interface TopicProgress {
  interval: number;
  easeFactor: number;
  dueDate: string;
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
  HAPTICS_ENABLED: 'reviseit_haptics_enabled',
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
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (rating === 'good') {
    if (reviewCount === 0) interval = 1;
    else if (reviewCount === 1) interval = 3;
    else interval = Math.round(interval * easeFactor);
  } else { // easy
    interval = 30;
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

    const cached = await getCachedTopics(noteId, content);
    if (cached) return cached;

    let topics: TopicEntry[];

    if (geminiApiKey) {
      onProgress?.('AI started working…');
      try {
        const { analyzeWithGemini } = await import('@/lib/aiIntelligence');
        topics = await analyzeWithGemini(content, geminiApiKey, onProgress);
      } catch (err: any) {
        onProgress?.('AI started working…');
        // ── Use async parser for richer summaries on the fallback path ──────
        const { smartSplitTopicsAsync } = await import('@/lib/smartTopicParser');
        topics = await smartSplitTopicsAsync(content);
      }
    } else {
      // ── Zero-API path: async parser gives the best local summaries ─────────
      // Uses LSA + TextRank + LexRank + BM25 + MMR — 100% offline.
      onProgress?.('Analyzing topics…');
      const { smartSplitTopicsAsync } = await import('@/lib/smartTopicParser');
      await new Promise(r => setTimeout(r, 20)); // yield so progress message renders
      topics = await smartSplitTopicsAsync(content);
    }

    // ── Post-Processing ──────────────────────────────────────────────────────
    let cleanTopics: TopicEntry[] = [];
    for (const t of topics) {
      let title = t.title.trim();
      let body = t.body.trim();

      // Skip excessively tiny/empty blocks
      if (body.replace(/[-\s*_]/g, '').length < 15) continue;

      // Skip conversational AI filler blocks
      const bodyLower = body.toLowerCase();
      const titleLower = title.toLowerCase();
      const isConversationalFiller =
        bodyLower.includes('structured, interview-ready') ||
        titleLower.includes('structured, interview-ready') ||
        (bodyLower.length < 150 && (bodyLower.startsWith('here is') || bodyLower.startsWith('below are')));

      if (isConversationalFiller && !body.includes('```')) continue;

      // Fix URLs as titles
      if (/^https?:\/\//i.test(title)) {
        const validLines = body.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0 && !/^https?:\/\//i.test(l));
        title = validLines.length > 0 ? validLines[0].replace(/^#{1,6}\s+/, '').slice(0, 50) : 'Resource Link';
      }

      // Augment single-word titles
      if (title.split(/\s+/).length === 1 && title.length < 16) {
        const validLines = body.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 10 && !/^https?:\/\//i.test(l));
        if (validLines.length > 0) {
          const extraContext = validLines[0].replace(/^#{1,6}\s+/, '').replace(/^[-*•]\s+/, '').slice(0, 40);
          title = `${title} — ${extraContext}`;
        }
      }

      title = title.replace(/[:;-]+$/, '').trim();

      // ── Summary quality gate ─────────────────────────────────────────────
      // The async path already set a high-quality summary; only regenerate
      // if the existing summary is too short/invalid or is just a copy of body.
      const summaryIsValid = (
        t.summary &&
        t.summary.trim().length > 80 &&
        !t.summary.startsWith(body.slice(0, 20))
      );

      cleanTopics.push({
        title,
        body,
        summary: summaryIsValid
          ? t.summary
          : generateDeepSummary(body, title),
        keywords: t.keywords || extractKeywords(body, 5),
        wordCount: t.wordCount || body.trim().split(/\s+/).filter(w => w.length > 0).length,
        hasCode: t.hasCode ?? /```[\s\S]*?```/.test(body),
        hasDefinitions: t.hasDefinitions ?? /\bis\s+(a|an|the)\b|\bare\s+(a|an|the)\b|\bdefin|\brefer[s]?\s+to\b|\bmeans?\b/i.test(body),
      });
    }

    if (cleanTopics.length === 0) {
      cleanTopics = [{
        title: 'Note Content',
        body: content,
        summary: generateDeepSummary(content, 'Note Content'),
      }];
    }

    await setCachedTopics(noteId, content, cleanTopics);
    onProgress?.('Done ✓');
    return cleanTopics;
  } finally {
    updateAiSync(-1);
  }
}

/**
 * parseTopics — fast sync split on --- separators.
 * Used for the daily topic picker and widget sync (must stay synchronous).
 * Summaries here are intentionally short (6 sentences) — just enough for
 * the daily-topic card preview. Full summaries come from the AI cache.
 */
export function parseTopics(note: Note): TopicEntry[] {
  const raw = note.content;
  if (!raw.trim()) return [];

  const extractTitleFromBlock = (text: string): string => {
    const allLines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    let firstValidLine = '';
    for (const line of allLines) {
      if (line.startsWith('http://') || line.startsWith('https://')) continue;
      firstValidLine = line;
      break;
    }
    if (!firstValidLine && allLines.length > 0) firstValidLine = allLines[0];

    return firstValidLine
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\d+[\.\)]\s+/, '')
      .replace(/^[IVX]+[\.\)]\s+/, '')
      .replace(/^[★✦◆▶→•]\s+/, '')
      .trim()
      .slice(0, 100) || 'Topic';
  };

  const countWords = (text: string): number =>
    text.trim().split(/\s+/).filter(w => w.length > 0).length;

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
      if (hrCount === 0) {
        current.push(line);
      }
    } else {
      if (hrCount >= 2) {
        flush();
      } else if (hrCount === 1) {
        current.push('---');
      }
      hrCount = 0;
      current.push(line);
    }
  }
  flush();

  const buildTopic = (block: string): TopicEntry => {
    const title = extractTitleFromBlock(block);
    const wc = countWords(block);
    const keywords = extractKeywords(block, 5);
    const hasCode = /```[\s\S]*?```/.test(block);
    const hasDefinitions = /\bis\s+(a|an|the)\b|\bare\s+(a|an|the)\b|\bdefin|\brefer[s]?\s+to\b|\bmeans?\b/i.test(block);
    return {
      title,
      body: block,
      summary: generateDeepSummary(block, title),
      keywords,
      wordCount: wc,
      hasCode,
      hasDefinitions,
    };
  };

  if (blocks.length === 0) {
    return [buildTopic(raw.trim())];
  }

  return blocks.map(buildTopic);
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
  hapticsEnabled: boolean;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
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
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);

  useEffect(() => {
    WidgetManager.updateStreak(streak.currentStreak);
  }, [streak.currentStreak]);

  useEffect(() => {
    if (dailyTopic && notes.length > 0) {
      const note = notes.find(n => n.id === dailyTopic.noteId);
      const folder = folders.find(f => f.id === note?.folderId);
      if (note && folder) {
        const topics = parseTopics(note);
        const topic = topics[dailyTopic.topicIndex];
        if (topic) {
          WidgetManager.updatePick({
            title: topic.title,
            folder: folder.name,
            color: folder.color,
          });
        }
      }
    }
  }, [dailyTopic, notes, folders]);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    try {
      const [foldersJson, notesJson, streakJson, dailyJson, srJson, geminiKey, markedJson, hapticsJson] = await Promise.all([
        loadFromPersistentStore<Folder[]>(STORAGE_KEYS.FOLDERS, []),
        loadFromPersistentStore<Note[]>(STORAGE_KEYS.NOTES, []),
        loadFromPersistentStore<StreakData | null>(STORAGE_KEYS.STREAK, null),
        loadFromPersistentStore<DailyTopic | null>(STORAGE_KEYS.DAILY_TOPIC, null),
        loadFromPersistentStore<Record<string, TopicProgress>>(STORAGE_KEYS.SR, {}),
        loadFromPersistentStore<string>(STORAGE_KEYS.GEMINI_KEY, ''),
        loadFromPersistentStore<Record<string, boolean>>(STORAGE_KEYS.MARKED, {}),
        loadFromPersistentStore<boolean>(STORAGE_KEYS.HAPTICS_ENABLED, true),
      ]);

      if (geminiKey) setGeminiApiKeyState(geminiKey);
      setHapticsEnabledState(hapticsJson !== false);
      const loadedFolders: Folder[] = foldersJson;
      const loadedNotes: Note[] = (notesJson || []).map(n => ({ ...n, tags: n.tags || [] }));
      const loadedStreak: StreakData = {
        ...DEFAULT_STREAK,
        ...(streakJson || {}),
        dailyReviewCounts: (streakJson as any)?.dailyReviewCounts || {},
      };
      const loadedDaily: DailyTopic | null = dailyJson;
      const loadedSR: Record<string, TopicProgress> = srJson;

      setFolders(loadedFolders);
      setNotes(loadedNotes);
      setStreak(loadedStreak);
      setTopicProgress(loadedSR);
      if (markedJson) setMarkedTopics(markedJson);

      const today = getTodayString();
      const topicKey = loadedDaily ? getTopicKey(loadedDaily.noteId, loadedDaily.topicIndex) : '';
      const currentDailyIsHard = loadedDaily && loadedSR[topicKey]?.lastRating === 'hard';
      const hasAnyHards = Object.values(loadedSR).some(p => p.lastRating === 'hard');

      if (loadedDaily && loadedDaily.date === today && (currentDailyIsHard || !hasAnyHards)) {
        setDailyTopic(loadedDaily);
      } else if (loadedNotes.length > 0) {
        await rollDailyTopicWithNotes(loadedNotes, loadedSR);
      }

    } catch (e) {
      console.error('Failed to load data', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function rollDailyTopicWithNotes(currentNotes: Note[], srData?: Record<string, TopicProgress>) {
    const allTopics: DailyTopic[] = [];
    const activeSR = srData || topicProgress;
    for (const note of currentNotes) {
      const topics = parseTopics(note);
      topics.forEach((_, i) => {
        allTopics.push({ date: getTodayString(), noteId: note.id, folderId: note.folderId, topicIndex: i });
      });
    }
    const dateStr = getTodayString();
    const dateInt = parseInt(dateStr.replace(/-/g, '')) || 0;

    const hardTopics = allTopics.filter(t => {
      const key = getTopicKey(t.noteId, t.topicIndex);
      return activeSR?.[key]?.lastRating === 'hard';
    });

    let selected: DailyTopic;
    if (hardTopics.length > 0) {
      selected = hardTopics[dateInt % hardTopics.length];
    } else if (allTopics.length > 0) {
      selected = allTopics[dateInt % allTopics.length];
    } else {
      setDailyTopic(null);
      return;
    }

    setDailyTopic(selected);
    await saveToPersistentStore(STORAGE_KEYS.DAILY_TOPIC, selected);
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

      saveToPersistentStore(STORAGE_KEYS.STREAK, updated);
      return updated;
    });
  }, []);

  const getDailyTopicData = useCallback(async (): Promise<Topic | null> => {
    if (!dailyTopic) return null;
    const note = notes.find(n => n.id === dailyTopic.noteId);
    if (!note) return null;

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
      saveToPersistentStore(STORAGE_KEYS.SR, updated);
      return updated;
    });
    setStreak(prev => {
      const updated = {
        ...prev,
        dailyReviewCounts: {
          ...prev.dailyReviewCounts,
          [today]: (prev.dailyReviewCounts[today] || 0) + 1,
        },
      };
      saveToPersistentStore(STORAGE_KEYS.STREAK, updated);
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
    await saveToPersistentStore(STORAGE_KEYS.FOLDERS, updated);
    return folder;
  }, [folders]);

  const updateFolder = useCallback(async (id: string, name: string, color?: string) => {
    const updated = folders.map(f =>
      f.id === id ? { ...f, name, ...(color ? { color } : {}) } : f
    );
    setFolders(updated);
    await saveToPersistentStore(STORAGE_KEYS.FOLDERS, updated);
  }, [folders]);

  const deleteFolder = useCallback(async (id: string) => {
    const updatedFolders = folders.filter(f => f.id !== id);
    const updatedNotes = notes.filter(n => n.folderId !== id);
    const notesToDelete = notes.filter(n => n.folderId === id);
    setFolders(updatedFolders);
    setNotes(updatedNotes);
    await Promise.all([
      saveToPersistentStore(STORAGE_KEYS.FOLDERS, updatedFolders),
      saveToPersistentStore(STORAGE_KEYS.NOTES, updatedNotes),
    ]);
    const { clearCachedTopics } = await import('@/lib/topicCache');
    await Promise.all(notesToDelete.map(n => clearCachedTopics(n.id)));
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
    setNotes(prev => {
      const updated = [...prev, note];
      saveToPersistentStore(STORAGE_KEYS.NOTES, updated);
      return updated;
    });

    return note;
  }, []);

  const updateNote = useCallback(async (id: string, title: string, content: string, tags?: string[]) => {
    setNotes(prev => {
      const updated = prev.map(n =>
        n.id === id
          ? { ...n, title, content, updatedAt: new Date().toISOString(), ...(tags !== undefined ? { tags } : {}) }
          : n
      );
      saveToPersistentStore(STORAGE_KEYS.NOTES, updated);
      return updated;
    });
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    setNotes(prev => {
      const updated = prev.filter(n => n.id !== id);
      saveToPersistentStore(STORAGE_KEYS.NOTES, updated);
      return updated;
    });
    const { clearCachedTopics } = await import('@/lib/topicCache');
    await clearCachedTopics(id);
  }, []);

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
      saveToPersistentStore(STORAGE_KEYS.FOLDERS, importedFolders),
      saveToPersistentStore(STORAGE_KEYS.NOTES, importedNotes),
      saveToPersistentStore(STORAGE_KEYS.STREAK, importedStreak),
      saveToPersistentStore(STORAGE_KEYS.SR, importedSR),
    ]);
  }, []);

  const setGeminiApiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    setGeminiApiKeyState(trimmed);
    await saveToPersistentStore(STORAGE_KEYS.GEMINI_KEY, trimmed);
  }, []);

  const setHapticsEnabled = useCallback(async (enabled: boolean) => {
    setHapticsEnabledState(enabled);
    await saveToPersistentStore(STORAGE_KEYS.HAPTICS_ENABLED, enabled);
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
      saveToPersistentStore(STORAGE_KEYS.MARKED, updated);
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
    hapticsEnabled,
    setHapticsEnabled,
  }), [folders, notes, streak, dailyTopic, topicProgress, isLoading, createFolder, updateFolder, deleteFolder, createNote, updateNote, deleteNote, getNotesByFolder, rollDailyTopic, markRevised, getDailyTopicData, rateTopic, getTopicProgress, exportData, importData, geminiApiKey, setGeminiApiKey, analyzeNoteWithAI, clearAICache, markedTopics, toggleTopicMark, hapticsEnabled, setHapticsEnabled]);

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within NotesProvider');
  return ctx;
}
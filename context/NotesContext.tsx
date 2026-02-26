import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

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
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  title: string;
  body: string;
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
}

const FOLDER_COLORS = [
  '#D4A96A', '#6BBF8E', '#7AABCF', '#C47AC4', '#E07070',
  '#E8B84B', '#5E9E87', '#A67DB8', '#CF8070', '#6B9EBF',
];

const STORAGE_KEYS = {
  FOLDERS: 'reviseit_folders',
  NOTES: 'reviseit_notes',
  STREAK: 'reviseit_streak',
  DAILY_TOPIC: 'reviseit_daily_topic',
};

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function parseTopics(note: Note): { title: string; body: string }[] {
  const sections = note.content.split(/\n{3,}/);
  return sections
    .map(section => section.trim())
    .filter(section => section.length > 0)
    .map(section => {
      const lines = section.split('\n');
      const title = lines[0]?.trim() || 'Untitled';
      const body = lines.slice(1).join('\n').trim();
      return { title, body };
    });
}

interface NotesContextValue {
  folders: Folder[];
  notes: Note[];
  streak: StreakData;
  dailyTopic: DailyTopic | null;
  isLoading: boolean;

  createFolder: (name: string) => Promise<Folder>;
  updateFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  createNote: (folderId: string, title: string) => Promise<Note>;
  updateNote: (id: string, title: string, content: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  getNotesByFolder: (folderId: string) => Note[];

  rollDailyTopic: () => Promise<void>;
  markRevised: () => Promise<void>;
  getDailyTopicData: () => Topic | null;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [streak, setStreak] = useState<StreakData>({
    currentStreak: 0,
    longestStreak: 0,
    lastRevisedDate: null,
    history: [],
  });
  const [dailyTopic, setDailyTopic] = useState<DailyTopic | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    try {
      const [foldersJson, notesJson, streakJson, dailyJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.FOLDERS),
        AsyncStorage.getItem(STORAGE_KEYS.NOTES),
        AsyncStorage.getItem(STORAGE_KEYS.STREAK),
        AsyncStorage.getItem(STORAGE_KEYS.DAILY_TOPIC),
      ]);

      const loadedFolders: Folder[] = foldersJson ? JSON.parse(foldersJson) : [];
      const loadedNotes: Note[] = notesJson ? JSON.parse(notesJson) : [];
      const loadedStreak: StreakData = streakJson
        ? JSON.parse(streakJson)
        : { currentStreak: 0, longestStreak: 0, lastRevisedDate: null, history: [] };
      const loadedDaily: DailyTopic | null = dailyJson ? JSON.parse(dailyJson) : null;

      setFolders(loadedFolders);
      setNotes(loadedNotes);
      setStreak(loadedStreak);

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
      };

      AsyncStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getDailyTopicData = useCallback((): Topic | null => {
    if (!dailyTopic) return null;
    const note = notes.find(n => n.id === dailyTopic.noteId);
    if (!note) return null;
    const topics = parseTopics(note);
    const topic = topics[dailyTopic.topicIndex];
    if (!topic) return null;
    return {
      title: topic.title,
      body: topic.body,
      noteId: note.id,
      folderId: note.folderId,
      topicIndex: dailyTopic.topicIndex,
    };
  }, [dailyTopic, notes]);

  const createFolder = useCallback(async (name: string): Promise<Folder> => {
    const folder: Folder = {
      id: Crypto.randomUUID(),
      name,
      color: FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)],
      createdAt: new Date().toISOString(),
    };
    const updated = [...folders, folder];
    setFolders(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(updated));
    return folder;
  }, [folders]);

  const updateFolder = useCallback(async (id: string, name: string) => {
    const updated = folders.map(f => f.id === id ? { ...f, name } : f);
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...notes, note];
    setNotes(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(updated));
    return note;
  }, [notes]);

  const updateNote = useCallback(async (id: string, title: string, content: string) => {
    const updated = notes.map(n =>
      n.id === id ? { ...n, title, content, updatedAt: new Date().toISOString() } : n
    );
    setNotes(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(updated));
  }, [notes]);

  const deleteNote = useCallback(async (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(updated));
  }, [notes]);

  const getNotesByFolder = useCallback((folderId: string): Note[] => {
    return notes.filter(n => n.folderId === folderId);
  }, [notes]);

  const value = useMemo(() => ({
    folders,
    notes,
    streak,
    dailyTopic,
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
  }), [folders, notes, streak, dailyTopic, isLoading, createFolder, updateFolder, deleteFolder, createNote, updateNote, deleteNote, getNotesByFolder, rollDailyTopic, markRevised, getDailyTopicData]);

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within NotesProvider');
  return ctx;
}

# ReviseIt — Notes Revision App

A polished Android notes revision app built with Expo React Native.

## Features

- **Infinite Scroll Feed** — Home screen shows all topics from all notes in a DailyHunt/Instagram-style vertical feed. Scroll down for more (infinite, reshuffled batches). Pull to refresh for a new random order.
- **Markdown Support** — Notes support full Markdown syntax (headings, bold, italic, code blocks, blockquotes, lists, tables, links). The topic detail view renders it beautifully. The editor has Edit + Preview toggle modes.
- **Topic Parsing** — Each note can contain multiple topics, separated by 3 blank lines. The first line of each section becomes the title.
- **Folders** — Organize notes into color-coded folders. Long-press to delete.
- **Streak Tracker** — Tracks daily revision streak with a 28-day calendar heatmap, statistics, and motivational messages.
- **Rich Topic Detail** — Full markdown-rendered topic view with prev/next navigation between topics.

## Architecture

- **Frontend**: Expo Router (file-based routing), React Native
- **State**: React Context + AsyncStorage (local persistence, no backend needed for app data)
- **Fonts**: Playfair Display (headings) + DM Sans (body)
- **Markdown**: `react-native-markdown-display`
- **Animations**: react-native-reanimated

## App Structure

```
app/
  (tabs)/
    index.tsx       — Infinite scroll feed (home)
    folders.tsx     — Folder management
    streak.tsx      — Streak & stats
    _layout.tsx     — Tab navigation (NativeTabs on iOS 26+, classic on Android)
  folder/[id].tsx   — Notes inside a folder
  note/[id].tsx     — Note editor (Edit / Preview modes + topic list)
  topic/[folderId]/[noteId]/[topicIndex].tsx — Full topic viewer with markdown

context/
  NotesContext.tsx  — App state (folders, notes, streak, daily topic)

constants/
  colors.ts         — Dark warm amber theme
```

## Key Design Decisions

- Dark warm amber color scheme (`#0F0E0D` background, `#D4A96A` accent)
- Topics are parsed by splitting note content on 3+ blank lines
- Streak auto-increments when any topic is opened each day
- Infinite scroll works by repeatedly adding new shuffled batches of all topics
- Android widget support requires a native build (not available in Expo Go)

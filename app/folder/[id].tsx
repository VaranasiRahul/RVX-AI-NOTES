import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useNotes, Note, parseTopics } from "@/context/NotesContext";
import { useTheme } from "@/context/ThemeContext";

// ─── Rename Note Modal ─────────────────────────────────────────────────────────
function RenameNoteModal({ visible, currentName, onClose, onRename, Colors }: {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onRename: (name: string) => void;
  Colors: any;
}) {
  const [name, setName] = useState(currentName);
  const insets = useSafeAreaInsets();

  React.useEffect(() => { setName(currentName); }, [currentName, visible]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onRename(trimmed);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalKAV}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 80}
        >
          <Pressable>
            <View style={[styles.modalSheet, { backgroundColor: Colors.surface, paddingBottom: insets.bottom + 20 }]}>
              <View style={[styles.modalHandle, { backgroundColor: Colors.border }]} />
              <Text style={[styles.modalTitle, { color: Colors.text }]}>Rename Note</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
                placeholder="Note title..."
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleConfirm}
                selectTextOnFocus
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1 }]}
                  onPress={onClose}
                >
                  <Text style={[styles.modalBtnText, { color: Colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: Colors.accent }, !name.trim() && { opacity: 0.4 }]}
                  onPress={handleConfirm}
                  disabled={!name.trim()}
                >
                  <Text style={[styles.modalBtnText, { color: Colors.background }]}>Rename</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ─── Note Item ─────────────────────────────────────────────────────────────────
function NoteItem({ note, onPress, onLongPress, Colors, theme }: {
  note: Note;
  onPress: () => void;
  onLongPress: () => void;
  Colors: any;
  theme: string;
}) {
  const preview = note.content.split("\n")[0]?.trim() || "Empty note";

  return (
    <Animated.View
      entering={FadeInDown.duration(500).springify()}
      layout={LinearTransition}
    >
      <TouchableOpacity
        style={[
          styles.noteCard,
          {
            backgroundColor: Colors.card,
            borderColor: Colors.border,
            borderWidth: 1
          }
        ]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
        onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); onLongPress(); }}
        activeOpacity={0.85}
        delayLongPress={400}
      >
        <View style={styles.noteMainContent}>
          <Text
            style={[
              styles.noteLabel,
              { color: Colors.text }
            ]}
            numberOfLines={1}
          >
            {note.title}
          </Text>
          <Text style={[styles.notePreview, { color: Colors.textSecondary }]} numberOfLines={1}>{preview}</Text>

          <View style={styles.noteMetadataRow}>
            <Text style={[styles.dateText, { color: Colors.textMuted }]}>
              {new Date(note.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
          </View>
        </View>
        <View style={styles.chevronBox}>
          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} opacity={0.4} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Create Note Modal ─────────────────────────────────────────────────────────
function CreateNoteModal({ visible, onClose, onCreate, Colors }: {
  visible: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
  Colors: any;
}) {
  const [title, setTitle] = useState("");
  const insets = useSafeAreaInsets();

  const handleCreate = () => {
    if (!title.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onCreate(title.trim());
    setTitle("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalKAV}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 80}
        >
          <Pressable>
            <View style={[styles.modalSheet, { backgroundColor: Colors.surface, paddingBottom: insets.bottom + 20 }]}>
              <View style={[styles.modalHandle, { backgroundColor: Colors.border }]} />
              <Text style={[styles.modalTitle, { color: Colors.text }]}>New Note</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
                placeholder="Note title..."
                placeholderTextColor={Colors.textMuted}
                value={title}
                onChangeText={setTitle}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
              <TouchableOpacity
                style={[styles.createBtn, { backgroundColor: Colors.accent }, !title.trim() && { opacity: 0.4 }]}
                onPress={handleCreate}
                disabled={!title.trim()}
              >
                <Text style={[styles.createBtnText, { color: Colors.background }]}>Create Note</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { folders, getNotesByFolder, createNote, updateNote, deleteNote } = useNotes();
  const { colors: Colors, theme } = useTheme();

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Note | null>(null);
  const [actionTarget, setActionTarget] = useState<Note | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

  const folder = folders.find((f) => f.id === id);
  const notes = getNotesByFolder(id || "");
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!folder) {
    return (
      <Animated.View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: Colors.background }]}>
        <Text style={[styles.errorText, { color: Colors.error }]}>Folder not found</Text>
      </Animated.View>
    );
  }

  const handleManage = (note: Note) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionTarget(note);
  };

  const handleCreateNote = async (title: string) => {
    const note = await createNote(folder.id, title);
    router.push({ pathname: "/note/[id]", params: { id: note.id } });
  };

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: Colors.background }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
          <Text style={[styles.headerTitle, { color: Colors.text }]}>{folder.name}</Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: Colors.accent }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setCreateModalVisible(true); }}
        >
          <Ionicons name="add" size={22} color={Colors.background} />
        </TouchableOpacity>
      </Animated.View>

      <Animated.FlatList
        itemLayoutAnimation={LinearTransition}
        data={notes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <NoteItem
            note={item}
            onPress={() => router.push(`/note/${item.id}`)}
            onLongPress={() => handleManage(item)}
            Colors={Colors}
            theme={theme}
          />
        )}
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={52} color={Colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: Colors.text }]}>No notes yet</Text>
            <Text style={[styles.emptySubtitle, { color: Colors.textSecondary }]}>
              Add notes to this folder. Separate topics with 3 blank lines.
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: Colors.accent }]}
              onPress={() => setCreateModalVisible(true)}
            >
              <Text style={[styles.emptyButtonText, { color: Colors.background }]}>Create First Note</Text>
            </TouchableOpacity>
          </Animated.View>
        }
      />

      <CreateNoteModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onCreate={handleCreateNote}
        Colors={Colors}
      />

      <RenameNoteModal
        visible={!!renameTarget}
        currentName={renameTarget?.title ?? ""}
        onClose={() => setRenameTarget(null)}
        onRename={(newTitle) => {
          if (renameTarget) {
            updateNote(renameTarget.id, newTitle, renameTarget.content, renameTarget.tags);
          }
        }}
        Colors={Colors}
      />

      <Modal visible={!!actionTarget} transparent animationType="slide" onRequestClose={() => setActionTarget(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setActionTarget(null)}>
          <Pressable>
            <View style={[styles.actionSheet, { backgroundColor: Colors.surface, paddingBottom: 24 }]}>
              <View style={[styles.modalHandle, { backgroundColor: Colors.border }]} />
              <Text style={[styles.actionTitle, { color: Colors.textMuted }]} numberOfLines={1}>{actionTarget?.title ?? ""}</Text>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.card, borderColor: Colors.border }]} onPress={() => { setRenameTarget(actionTarget); setActionTarget(null); }}>
                <Ionicons name="pencil-outline" size={18} color={Colors.text} />
                <Text style={[styles.actionBtnText, { color: Colors.text }]}>Rename</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.error + "15", borderColor: Colors.error + "40" }]} onPress={() => { setDeleteTarget(actionTarget); setActionTarget(null); }}>
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
                <Text style={[styles.actionBtnText, { color: Colors.error }]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionCancelBtn, { backgroundColor: Colors.surface, borderColor: Colors.border }]} onPress={() => setActionTarget(null)}>
                <Text style={[styles.actionBtnText, { color: Colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={[styles.modalOverlay, { justifyContent: "center", paddingHorizontal: 24 }]} onPress={() => setDeleteTarget(null)}>
          <Pressable>
            <View style={[styles.confirmCard, { backgroundColor: Colors.surface }]}>
              <Text style={[styles.modalTitle, { color: Colors.text, marginBottom: 8 }]}>Delete Note</Text>
              <Text style={[styles.confirmMsg, { color: Colors.textSecondary }]}>Delete "{deleteTarget?.title}"? This cannot be undone.</Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1 }]} onPress={() => setDeleteTarget(null)}>
                  <Text style={[styles.modalBtnText, { color: Colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.error }]} onPress={() => { if (deleteTarget) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); deleteNote(deleteTarget.id); setDeleteTarget(null); } }}>
                  <Text style={[styles.modalBtnText, { color: "#fff" }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  folderDot: { width: 10, height: 10, borderRadius: 5 },
  headerTitle: {
    flex: 1,
    fontFamily: "DMSans_500Medium",
    fontSize: 18,
    letterSpacing: 4,
    textTransform: 'uppercase'
  },
  addButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, gap: 12 },
  noteCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  noteMainContent: { flex: 1, gap: 4 },
  noteLabel: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 17,
    letterSpacing: -0.2,
  },
  notePreview: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    opacity: 0.7,
  },
  noteMetadataRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  miniBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  miniBadgeText: { fontFamily: "DMSans_500Medium", fontSize: 10 },
  dateText: { fontFamily: "DMSans_400Regular", fontSize: 10, opacity: 0.5 },
  chevronBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 22, marginTop: 8 },
  emptySubtitle: { fontFamily: "DMSans_400Regular", fontSize: 14, textAlign: "center", lineHeight: 21, paddingHorizontal: 32 },
  emptyButton: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30 },
  emptyButtonText: { fontFamily: "DMSans_600SemiBold", fontSize: 14 },
  errorText: { fontFamily: "DMSans_400Regular", fontSize: 16, textAlign: "center", marginTop: 40 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalKAV: { justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22 },
  modalInput: { borderRadius: 12, padding: 16, fontFamily: "DMSans_400Regular", fontSize: 16, borderWidth: 1 },
  modalButtons: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 15 },
  createBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  createBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 16 },
  // Action sheet
  actionSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10 },
  actionTitle: { fontFamily: "DMSans_500Medium", fontSize: 13, textAlign: "center", paddingVertical: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 16, borderWidth: 1 },
  actionCancelBtn: { borderRadius: 14, padding: 16, alignItems: "center", borderWidth: 1, marginTop: 4 },
  actionBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 16 },
  confirmCard: { borderRadius: 20, padding: 24, gap: 12 },
  confirmMsg: { fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 22 },
});

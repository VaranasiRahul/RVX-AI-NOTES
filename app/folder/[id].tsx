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
import Animated, { FadeIn, FadeInDown, Layout } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useNotes, Note, parseTopics } from "@/context/NotesContext";
import Colors from "@/constants/colors";

function NoteItem({ note, onPress, onDelete }: {
  note: Note;
  onPress: () => void;
  onDelete: () => void;
}) {
  const topics = parseTopics(note);
  const preview = note.content.split('\n')[0]?.trim() || "Empty note";

  return (
    <Animated.View entering={FadeInDown.springify()} layout={Layout.springify()}>
      <TouchableOpacity
        style={styles.noteItem}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          onDelete();
        }}
        activeOpacity={0.75}
      >
        <View style={styles.noteItemContent}>
          <Text style={styles.noteTitle}>{note.title}</Text>
          <Text style={styles.notePreview} numberOfLines={2}>{preview}</Text>
          <View style={styles.noteFooter}>
            <View style={styles.noteBadge}>
              <Ionicons name="list" size={11} color={Colors.textMuted} />
              <Text style={styles.noteBadgeText}>{topics.length} {topics.length === 1 ? "topic" : "topics"}</Text>
            </View>
            <Text style={styles.noteDate}>
              {new Date(note.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function CreateNoteModal({ visible, onClose, onCreate }: {
  visible: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
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
        >
          <Pressable>
            <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>New Note</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Note title..."
                placeholderTextColor={Colors.textMuted}
                value={title}
                onChangeText={setTitle}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
              <TouchableOpacity
                style={[styles.modalCreateBtn, !title.trim() && styles.modalCreateBtnDisabled]}
                onPress={handleCreate}
                disabled={!title.trim()}
              >
                <Text style={styles.modalCreateBtnText}>Create Note</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { folders, getNotesByFolder, createNote, deleteNote } = useNotes();
  const [modalVisible, setModalVisible] = useState(false);

  const folder = folders.find(f => f.id === id);
  const notes = getNotesByFolder(id || "");

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!folder) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Text style={styles.errorText}>Folder not found</Text>
      </View>
    );
  }

  const handleDeleteNote = (note: Note) => {
    Alert.alert(
      "Delete Note",
      `Delete "${note.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            deleteNote(note.id);
          },
        },
      ]
    );
  };

  const handleCreateNote = async (title: string) => {
    const note = await createNote(folder.id, title);
    router.push({ pathname: "/note/[id]", params: { id: note.id } });
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
          <Text style={styles.headerTitle}>{folder.name}</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setModalVisible(true);
          }}
        >
          <Ionicons name="add" size={22} color={Colors.background} />
        </TouchableOpacity>
      </Animated.View>

      <FlatList
        data={notes}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === "web" ? 60 : 60 },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <NoteItem
            note={item}
            onPress={() => router.push({ pathname: "/note/[id]", params: { id: item.id } })}
            onDelete={() => handleDeleteNote(item)}
          />
        )}
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No notes yet</Text>
            <Text style={styles.emptySubtitle}>
              Add notes to this folder. Separate topics with 3 blank lines.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.emptyButtonText}>Create First Note</Text>
            </TouchableOpacity>
          </Animated.View>
        }
      />

      <CreateNoteModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreate={handleCreateNote}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  folderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  headerTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: 20,
    gap: 10,
  },
  noteItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  noteItemContent: {
    flex: 1,
    gap: 5,
  },
  noteTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  notePreview: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  noteFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  noteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  noteBadgeText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  noteDate: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: "PlayfairDisplay_600SemiBold",
    fontSize: 22,
    color: Colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 32,
  },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.accent,
    borderRadius: 30,
  },
  emptyButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
  errorText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
    color: Colors.error,
    textAlign: "center",
    marginTop: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalKAV: {
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  modalInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCreateBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCreateBtnDisabled: {
    opacity: 0.4,
  },
  modalCreateBtnText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: Colors.background,
  },
});

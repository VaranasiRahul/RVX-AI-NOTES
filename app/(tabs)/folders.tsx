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
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown, Layout } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useNotes, Folder } from "@/context/NotesContext";
import Colors from "@/constants/colors";

function FolderItem({ folder, noteCount, onPress, onDelete }: {
  folder: Folder;
  noteCount: number;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.springify()} layout={Layout.springify()}>
      <TouchableOpacity
        style={styles.folderItem}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          onDelete();
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.folderIcon, { backgroundColor: folder.color + '22' }]}>
          <Ionicons name="folder" size={22} color={folder.color} />
        </View>
        <View style={styles.folderInfo}>
          <Text style={styles.folderName}>{folder.name}</Text>
          <Text style={styles.folderCount}>{noteCount} {noteCount === 1 ? "note" : "notes"}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function CreateFolderModal({ visible, onClose, onCreate }: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const insets = useSafeAreaInsets();

  const handleCreate = () => {
    if (!name.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onCreate(name.trim());
    setName("");
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
              <Text style={styles.modalTitle}>New Folder</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Folder name..."
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
              <TouchableOpacity
                style={[styles.modalCreateBtn, !name.trim() && styles.modalCreateBtnDisabled]}
                onPress={handleCreate}
                disabled={!name.trim()}
              >
                <Text style={styles.modalCreateBtnText}>Create Folder</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

export default function FoldersScreen() {
  const insets = useSafeAreaInsets();
  const { folders, notes, createFolder, deleteFolder } = useNotes();
  const [modalVisible, setModalVisible] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleDelete = (folder: Folder) => {
    Alert.alert(
      "Delete Folder",
      `Delete "${folder.name}" and all its notes? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            deleteFolder(folder.id);
          },
        },
      ]
    );
  };

  const getNoteCount = (folderId: string) =>
    notes.filter(n => n.folderId === folderId).length;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={styles.headerTitle}>Folders</Text>
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
        data={folders}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === "web" ? 100 : 100 },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <FolderItem
            folder={item}
            noteCount={getNoteCount(item.id)}
            onPress={() => router.push({ pathname: "/folder/[id]", params: { id: item.id } })}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No folders yet</Text>
            <Text style={styles.emptySubtitle}>
              Create a folder to organize your notes by subject or topic.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.emptyButtonText}>Create First Folder</Text>
            </TouchableOpacity>
          </Animated.View>
        }
      />

      <CreateFolderModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreate={createFolder}
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
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 28,
    color: Colors.text,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: 20,
    gap: 10,
  },
  folderItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  folderIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  folderInfo: {
    flex: 1,
  },
  folderName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    marginBottom: 3,
  },
  folderCount: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
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

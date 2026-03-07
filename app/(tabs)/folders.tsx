import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useNotes, Folder, ALL_FOLDER_COLORS } from "@/context/NotesContext";
import { useTheme } from "@/context/ThemeContext";

function RenameModal({ visible, currentName, onClose, onRename, Colors }: {
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
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 40}
        >
          <Pressable>
            <View style={[styles.modalSheet, { backgroundColor: Colors.surface, paddingBottom: insets.bottom + 20 }]}>
              <View style={[styles.modalHandle, { backgroundColor: Colors.border }]} />
              <Text style={[styles.modalTitle, { color: Colors.text }]}>Rename Folder</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
                placeholder="Folder name..."
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

function FolderItem({ folder, noteCount, onPress, onLongPress, Colors, theme }: {
  folder: Folder;
  noteCount: number;
  onPress: () => void;
  onLongPress: () => void;
  Colors: any;
  theme: string;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(600).springify()}
      layout={LinearTransition}
    >
      <TouchableOpacity
        style={[
          styles.folderCard,
          {
            backgroundColor: Colors.card,
            borderColor: theme === 'midnightGlass' ? 'transparent' : Colors.border,
            borderWidth: theme === 'midnightGlass' ? 0 : 1
          }
        ]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
        onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); onLongPress(); }}
        activeOpacity={0.9}
        delayLongPress={400}
      >
        {/* Modern Icon Container with Glow */}
        <View style={[styles.iconBox, { backgroundColor: folder.color + "15" }]}>
          <View style={[styles.iconInner, { backgroundColor: folder.color + "25" }]}>
            <Ionicons name="folder-sharp" size={26} color={folder.color} />
          </View>
          {/* Subtle Glow */}
          <View style={[styles.iconGlow, { backgroundColor: folder.color, opacity: 0.12 }]} />
        </View>

        <View style={styles.contentBox}>
          <Text
            style={[
              styles.folderLabel,
              { color: Colors.text }
            ]}
            numberOfLines={1}
          >
            {folder.name}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.countBadge, { backgroundColor: Colors.card }]}>
              <Text style={[styles.countText, { color: folder.color }]}>{noteCount}</Text>
            </View>
            <Text style={[styles.metaText, { color: Colors.textMuted }]}>
              {noteCount === 1 ? "Note" : "Notes"}
            </Text>
          </View>
        </View>

        <View style={styles.arrowBox}>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} opacity={0.5} />
        </View>
      </TouchableOpacity>
    </Animated.View >
  );
}

function ColorSwatch({ color, selected, onSelect }: {
  color: string; selected: boolean; onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.swatch, { backgroundColor: color }, selected && styles.swatchSelected]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
    </TouchableOpacity>
  );
}

function CreateFolderModal({ visible, onClose, onCreate, Colors }: {
  visible: boolean; onClose: () => void;
  onCreate: (name: string, color: string) => void; Colors: any;
}) {
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(ALL_FOLDER_COLORS[0]);
  const insets = useSafeAreaInsets();

  const handleCreate = () => {
    if (!name.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onCreate(name.trim(), selectedColor);
    setName("");
    setSelectedColor(ALL_FOLDER_COLORS[0]);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKAV}>
          <Pressable>
            <View style={[styles.modalSheet, { backgroundColor: Colors.surface, paddingBottom: insets.bottom + 20 }]}>
              <View style={[styles.modalHandle, { backgroundColor: Colors.border }]} />
              <Text style={[styles.modalTitle, { color: Colors.text }]}>New Folder</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
                placeholder="Folder name..."
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
              <Text style={[styles.colorPickerLabel, { color: Colors.textMuted }]}>Choose colour</Text>
              <View style={styles.colorGrid}>
                {ALL_FOLDER_COLORS.map((color) => (
                  <ColorSwatch
                    key={color}
                    color={color}
                    selected={selectedColor === color}
                    onSelect={() => { Haptics.selectionAsync(); setSelectedColor(color); }}
                  />
                ))}
              </View>
              <View style={[styles.previewRow, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                <View style={[styles.iconBox, { backgroundColor: selectedColor + "15", width: 48, height: 48, borderRadius: 14 }]}>
                  <View style={[styles.iconInner, { backgroundColor: selectedColor + "25", width: 38, height: 38, borderRadius: 12 }]}>
                    <Ionicons name="folder-sharp" size={20} color={selectedColor} />
                  </View>
                </View>
                <Text style={[styles.previewName, { color: Colors.text }]}>{name || "Folder name"}</Text>
              </View>
              <TouchableOpacity
                style={[styles.createBtn, { backgroundColor: selectedColor }, !name.trim() && { opacity: 0.4 }]}
                onPress={handleCreate}
                disabled={!name.trim()}
              >
                <Text style={styles.createBtnText}>Create Folder</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function ActionSheet({ visible, title, onRename, onDelete, onClose, Colors }: {
  visible: boolean; title: string;
  onRename: () => void; onDelete: () => void; onClose: () => void; Colors: any;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable>
          <View style={[styles.actionSheet, { backgroundColor: Colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.modalHandle, { backgroundColor: Colors.border }]} />
            <Text style={[styles.actionTitle, { color: Colors.textMuted }]} numberOfLines={1}>{title}</Text>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.card, borderColor: Colors.border }]} onPress={() => { onClose(); onRename(); }}>
              <Ionicons name="pencil-outline" size={18} color={Colors.text} />
              <Text style={[styles.actionBtnText, { color: Colors.text }]}>Rename</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.error + "15", borderColor: Colors.error + "40" }]} onPress={() => { onClose(); onDelete(); }}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
              <Text style={[styles.actionBtnText, { color: Colors.error }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionCancelBtn, { backgroundColor: Colors.surface, borderColor: Colors.border }]} onPress={onClose}>
              <Text style={[styles.actionBtnText, { color: Colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ConfirmDelete({ visible, title, message, onConfirm, onClose, Colors }: {
  visible: boolean; title: string; message: string;
  onConfirm: () => void; onClose: () => void; Colors: any;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.modalOverlay, { justifyContent: "center", paddingHorizontal: 24 }]} onPress={onClose}>
        <Pressable>
          <View style={[styles.confirmCard, { backgroundColor: Colors.surface }]}>
            <Text style={[styles.modalTitle, { color: Colors.text, marginBottom: 8 }]}>{title}</Text>
            <Text style={[styles.confirmMsg, { color: Colors.textSecondary }]}>{message}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1 }]} onPress={onClose}>
                <Text style={[styles.modalBtnText, { color: Colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.error }]} onPress={() => { onClose(); onConfirm(); }}>
                <Text style={[styles.modalBtnText, { color: "#fff" }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function FoldersScreen() {
  const insets = useSafeAreaInsets();
  const { folders, notes, createFolder, updateFolder, deleteFolder } = useNotes();
  const { colors: Colors, theme } = useTheme();

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [actionTarget, setActionTarget] = useState<Folder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const getNoteCount = (folderId: string) => notes.filter((n) => n.folderId === folderId).length;

  const handleManage = (folder: Folder) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionTarget(folder);
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Plain header — no BlurView */}
      <Animated.View
        entering={FadeIn.duration(400)}
        style={[styles.header, { paddingTop: topPad + 28, paddingBottom: 16 }]}
      >
        <Text style={[styles.headerTitle, { color: Colors.text }]}>Folders</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: Colors.accent }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setCreateModalVisible(true); }}
        >
          <Ionicons name="add" size={22} color={Colors.background} />
        </TouchableOpacity>
      </Animated.View>

      <Animated.FlatList
        itemLayoutAnimation={LinearTransition}
        data={folders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <FolderItem
            folder={item}
            noteCount={getNoteCount(item.id)}
            onPress={() => router.push(`/folder/${item.id}`)}
            onLongPress={() => handleManage(item)}
            Colors={Colors}
            theme={theme}
          />
        )}
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={52} color={Colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: Colors.text }]}>No folders yet</Text>
            <Text style={[styles.emptySubtitle, { color: Colors.textSecondary }]}>
              Create a folder to organize your notes by subject or topic.
            </Text>
            <TouchableOpacity style={[styles.emptyButton, { backgroundColor: Colors.accent }]} onPress={() => setCreateModalVisible(true)}>
              <Text style={[styles.emptyButtonText, { color: Colors.background }]}>Create First Folder</Text>
            </TouchableOpacity>
          </Animated.View>
        }
      />

      <CreateFolderModal visible={createModalVisible} onClose={() => setCreateModalVisible(false)} onCreate={(name, color) => createFolder(name, color)} Colors={Colors} />
      <RenameModal visible={!!renameTarget} currentName={renameTarget?.name ?? ""} onClose={() => setRenameTarget(null)} onRename={(newName) => renameTarget && updateFolder(renameTarget.id, newName)} Colors={Colors} />
      <ActionSheet visible={!!actionTarget} title={actionTarget?.name ?? ""} onClose={() => setActionTarget(null)} onRename={() => { setRenameTarget(actionTarget); setActionTarget(null); }} onDelete={() => setDeleteTarget(actionTarget)} Colors={Colors} />
      <ConfirmDelete
        visible={!!deleteTarget}
        title="Delete Folder"
        message={`Delete "${deleteTarget?.name}" and all its notes? This cannot be undone.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            deleteFolder(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        Colors={Colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "DMSans_500Medium",
    fontSize: 22,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  list: { paddingHorizontal: 16, gap: 16 },
  folderCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    gap: 16,
    overflow: 'hidden',
    // Glassmorphism effect
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconInner: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconGlow: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    filter: 'blur(20px)',
    zIndex: 1,
  },
  contentBox: { flex: 1, justifyContent: 'center' },
  folderLabel: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  countText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 12,
  },
  metaText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    opacity: 0.6,
  },
  arrowBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 22, marginTop: 8 },
  emptySubtitle: { fontFamily: "DMSans_400Regular", fontSize: 14, textAlign: "center", lineHeight: 21, paddingHorizontal: 32 },
  emptyButton: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30 },
  emptyButtonText: { fontFamily: "DMSans_600SemiBold", fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalKAV: { justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22 },
  modalInput: { borderRadius: 12, padding: 16, fontFamily: "DMSans_400Regular", fontSize: 16, borderWidth: 1 },
  modalButtons: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 15 },
  colorPickerLabel: { fontFamily: "DMSans_500Medium", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  swatchSelected: { borderWidth: 3, borderColor: "#fff" },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  previewName: { fontFamily: "DMSans_600SemiBold", fontSize: 15 },
  createBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  createBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 16, color: "#fff" },
  actionSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10 },
  actionTitle: { fontFamily: "DMSans_500Medium", fontSize: 13, textAlign: "center", paddingVertical: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 16, borderWidth: 1 },
  actionCancelBtn: { borderRadius: 14, padding: 16, alignItems: "center", borderWidth: 1, marginTop: 4 },
  actionBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 16 },
  confirmCard: { borderRadius: 20, padding: 24, gap: 12 },
  confirmMsg: { fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 22 },
});
import Feather from '@expo/vector-icons/Feather';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { SyncBadge } from '@/components/TaskBadges';
import { colors, HIT_SIZE, radius, spacing } from '@/theme/tokens';
import type { Attachment, ChecklistItem, Note } from '@/types/domain';
import { timeAgo } from '@/utils/date';

import { useAttachmentUrl } from './hooks';

export function ChecklistRow({
  item,
  disabled,
  onToggle,
}: {
  item: ChecklistItem;
  disabled: boolean;
  onToggle: (item: ChecklistItem) => void;
}) {
  return (
    <Pressable
      testID={`checklist-${item.id}`}
      onPress={() => onToggle(item)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.isDone, disabled }}
      accessibilityLabel={`${item.label}${item.isRequired ? ', required' : ''}`}
      style={({ pressed }) => [styles.checkRow, pressed && !disabled && styles.pressed]}
    >
      <View style={[styles.box, item.isDone && styles.boxOn]}>
        {item.isDone ? <Feather name="check" size={15} color={colors.textOnAccent} /> : null}
      </View>
      <View style={styles.flex}>
        <AppText
          variant="body"
          tone={item.isDone ? 'secondary' : 'primary'}
          style={item.isDone ? styles.doneText : undefined}
        >
          {item.label}
        </AppText>
      </View>
      {item.isRequired ? (
        <Badge label="Required" tone={item.isDone ? 'neutral' : 'accentSoft'} />
      ) : null}
    </Pressable>
  );
}

export function NoteItem({ note }: { note: Note }) {
  return (
    <View style={styles.note}>
      <View style={styles.noteHead}>
        <AppText variant="label">{note.authorName}</AppText>
        <AppText variant="caption" tone="tertiary">
          {timeAgo(note.createdAt)}
        </AppText>
        <View style={styles.flex} />
        <SyncBadge state={note.syncState} />
      </View>
      <AppText variant="body">{note.body}</AppText>
    </View>
  );
}

export function EvidenceThumb({ attachment }: { attachment: Attachment }) {
  const uri = useAttachmentUrl(attachment.localUri, attachment.remotePath);
  const label =
    attachment.syncState === 'pending'
      ? 'Waiting to upload'
      : attachment.syncState === 'failed'
        ? 'Upload failed – reattach'
        : 'Uploaded';
  return (
    <View
      style={styles.thumbWrap}
      accessible
      accessibilityLabel={`Photo evidence${attachment.caption ? `: ${attachment.caption}` : ''}. ${label}.`}
    >
      <View style={styles.thumb}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Feather name="image" size={22} color={colors.textTertiary} />
        )}
        {attachment.syncState !== 'synced' ? (
          <View
            style={[
              styles.thumbBadge,
              { backgroundColor: attachment.syncState === 'failed' ? colors.accent : colors.dark },
            ]}
          >
            <Feather
              name={attachment.syncState === 'failed' ? 'alert-triangle' : 'upload-cloud'}
              size={11}
              color={colors.textOnAccent}
            />
          </View>
        ) : null}
      </View>
      <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.thumbCaption}>
        {attachment.caption || label}
      </AppText>
    </View>
  );
}

export function AddEvidenceTile({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add photo evidence"
      style={styles.thumbWrap}
    >
      <View style={[styles.thumb, styles.addTile]}>
        <Feather name="camera" size={22} color={colors.accent} />
      </View>
      <AppText variant="caption" tone="accent" style={styles.thumbCaption}>
        Add photo
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { backgroundColor: colors.surfaceMuted },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: HIT_SIZE + 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  doneText: { textDecorationLine: 'line-through' },
  note: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumbWrap: { width: 96, gap: 6 },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  thumbBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCaption: { fontSize: 12 },
});

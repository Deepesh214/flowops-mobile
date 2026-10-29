import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Accent, AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { pickEvidence, type EvidenceSource, type PickResult } from '@/features/evidence/pickImage';
import { useTask, useTaskActions } from '@/features/tasks/hooks';
import { selectIsOnline, useAppStore } from '@/store/appStore';
import { colors, radius, spacing } from '@/theme/tokens';

type Picked = Extract<PickResult, { status: 'ok' }>;

export default function AddEvidenceScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const task = useTask(taskId);
  const { addAttachment } = useTaskActions(taskId);
  const online = useAppStore(selectIsOnline);

  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState('');
  const [problem, setProblem] = useState<PickResult | null>(null);
  const [busy, setBusy] = useState<EvidenceSource | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/task/${taskId}`));

  async function choose(source: EvidenceSource) {
    setBusy(source);
    setProblem(null);
    const result = await pickEvidence(source);
    setBusy(null);
    if (result.status === 'ok') setPicked(result);
    else if (result.status !== 'cancelled') setProblem(result);
  }

  async function save() {
    if (!picked) return;
    setSaveError(null);
    try {
      await addAttachment.mutateAsync({ localUri: picked.uri, mimeType: picked.mimeType, caption });
      close();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save the photo.');
    }
  }

  return (
    <Screen edges={['top', 'bottom']} background={colors.surface}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <AppText variant="label" tone="secondary" numberOfLines={1} style={styles.flex}>
            {task.data?.task.title ?? 'Task'}
          </AppText>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={10}
            style={styles.close}
          >
            <Feather name="x" size={20} color={colors.text} />
          </Pressable>
        </View>

        <AppText variant="display" accessibilityRole="header">
          Add <Accent>evidence.</Accent>
        </AppText>
        <AppText variant="body" tone="secondary">
          Photos are compressed on the device and uploaded{' '}
          {online ? 'right away' : 'when you reconnect'}.
        </AppText>

        {picked ? (
          <>
            <View style={styles.previewWrap}>
              <Image
                source={{ uri: picked.uri }}
                style={[styles.preview, { aspectRatio: picked.width / Math.max(picked.height, 1) }]}
                resizeMode="cover"
                accessibilityLabel="Selected photo preview"
              />
            </View>
            <TextField
              label="Caption (optional)"
              placeholder="e.g. RTU-2 filter after replacement"
              value={caption}
              onChangeText={setCaption}
              maxLength={140}
            />
            {!online ? (
              <View style={styles.info}>
                <Feather name="cloud-off" size={15} color={colors.text} />
                <AppText variant="caption" style={styles.flex}>
                  You&apos;re offline. The photo is saved now and marked Pending Sync until it
                  uploads.
                </AppText>
              </View>
            ) : null}
            {saveError ? (
              <AppText variant="caption" tone="accent">
                {saveError}
              </AppText>
            ) : null}
            <Button
              label="Save evidence"
              icon="check"
              onPress={save}
              loading={addAttachment.isPending}
            />
            <Button
              label="Choose a different photo"
              variant="ghost"
              onPress={() => setPicked(null)}
            />
          </>
        ) : (
          <View style={styles.sources}>
            <SourceTile
              icon="camera"
              title="Take photo"
              subtitle="Use the camera"
              loading={busy === 'camera'}
              onPress={() => choose('camera')}
            />
            <SourceTile
              icon="image"
              title="Choose from gallery"
              subtitle="Pick an existing photo"
              loading={busy === 'library'}
              onPress={() => choose('library')}
            />
          </View>
        )}

        {problem ? <ProblemCard problem={problem} onSkip={close} /> : null}
      </ScrollView>
    </Screen>
  );
}

function SourceTile({
  icon,
  title,
  subtitle,
  loading,
  onPress,
}: {
  icon: 'camera' | 'image';
  title: string;
  subtitle: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.tile, pressed && { backgroundColor: colors.surfaceSunken }]}
    >
      <View style={styles.tileIcon}>
        <Feather name={icon} size={22} color={colors.textOnAccent} />
      </View>
      <View style={styles.flex}>
        <AppText variant="heading">{loading ? 'Opening…' : title}</AppText>
        <AppText variant="caption" tone="secondary">
          {subtitle}
        </AppText>
      </View>
      <Feather name="chevron-right" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

function ProblemCard({ problem, onSkip }: { problem: PickResult; onSkip: () => void }) {
  if (problem.status === 'denied') {
    return (
      <View style={styles.problem} accessibilityRole="alert">
        <AppText variant="bodyStrong">
          {problem.source === 'camera' ? 'Camera access is off' : 'Photo access is off'}
        </AppText>
        <AppText variant="caption" tone="secondary">
          FlowOps only uses it to attach proof of completed work. You can allow access in Settings,
          or continue without a photo if this task doesn&apos;t require one.
        </AppText>
        <View style={styles.problemRow}>
          <Button
            label="Open Settings"
            size="sm"
            variant="dark"
            onPress={() => Linking.openSettings()}
          />
          <Button label="Continue without" size="sm" variant="ghost" onPress={onSkip} />
        </View>
      </View>
    );
  }
  const message =
    problem.status === 'too_large'
      ? 'That image is too large. Choose a smaller photo (under 32 MB).'
      : problem.status === 'error'
        ? 'The photo could not be opened. Try again or pick a different one.'
        : null;
  if (!message) return null;
  return (
    <View style={styles.problem} accessibilityRole="alert">
      <AppText variant="caption">{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sources: { gap: spacing.md, marginTop: spacing.sm },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    minHeight: 76,
  },
  tileIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  preview: { width: '100%', maxHeight: 420 },
  info: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  problem: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
  },
  problemRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});

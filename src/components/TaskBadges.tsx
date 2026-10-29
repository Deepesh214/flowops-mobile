import { PRIORITY_LABEL, STATUS_LABEL } from '@/features/tasks/taskRules';
import type { Priority, SyncState, TaskStatus } from '@/types/domain';

import { Badge, type BadgeTone } from './Badge';

const STATUS_STYLE: Record<
  TaskStatus,
  { tone: BadgeTone; icon: 'circle' | 'play' | 'slash' | 'check' }
> = {
  assigned: { tone: 'neutral', icon: 'circle' },
  in_progress: { tone: 'info', icon: 'play' },
  blocked: { tone: 'warning', icon: 'slash' },
  completed: { tone: 'success', icon: 'check' },
};

export function StatusChip({ status }: { status: TaskStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <Badge
      label={STATUS_LABEL[status]}
      tone={s.tone}
      icon={s.icon}
      accessibilityLabel={`Status: ${STATUS_LABEL[status]}`}
    />
  );
}

const PRIORITY_ICON = { high: 'chevrons-up', medium: 'chevron-up', low: 'chevron-down' } as const;

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge
      label={PRIORITY_LABEL[priority]}
      tone={priority === 'high' ? 'accent' : priority === 'medium' ? 'dark' : 'neutral'}
      icon={PRIORITY_ICON[priority]}
      caps
      accessibilityLabel={`${PRIORITY_LABEL[priority]} priority`}
    />
  );
}

/** Rendered only when there is something to say; synced items stay quiet. */
export function SyncBadge({ state }: { state: SyncState }) {
  if (state === 'synced') return null;
  return state === 'pending' ? (
    <Badge label="Pending sync" tone="accentSoft" icon="upload-cloud" />
  ) : (
    <Badge label="Sync failed" tone="accent" icon="alert-triangle" />
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { remoteApi, taskRepository } from '@/data/container';
import { queryKeys } from '@/data/queryClient';
import type { NewAttachment } from '@/data/repositories/taskRepository';
import { useAuthStore } from '@/features/auth/authStore';
import { selectIsOnline, useAppStore } from '@/store/appStore';
import type { TaskDetail, TaskStatus } from '@/types/domain';

export function useTasks() {
  return useQuery({ queryKey: queryKeys.taskList, queryFn: () => taskRepository.listTasks() });
}

export function useTask(id: string) {
  return useQuery({ queryKey: queryKeys.task(id), queryFn: () => taskRepository.getTask(id) });
}

/**
 * Server refresh, owned by React Query: pushes queued changes, pulls assigned
 * tasks into SQLite, then invalidates the local queries above.
 */
export function useRemoteRefresh() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const online = useAppStore(selectIsOnline);
  const setLastSyncedAt = useAppStore((s) => s.setLastSyncedAt);

  return useQuery({
    queryKey: queryKeys.remote(userId ?? 'anonymous'),
    enabled: Boolean(userId) && online,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const at = await taskRepository.refreshFromRemote(userId!).catch((e: unknown) => {
        if (__DEV__) console.warn('[refresh] failed:', e instanceof Error ? e.message : e);
        throw e;
      });
      setLastSyncedAt(at);
      await qc.invalidateQueries({ queryKey: queryKeys.tasks });
      return at;
    },
  });
}

export function useTaskActions(taskId: string) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.tasks });

  const setStatus = useMutation({
    mutationFn: (status: TaskStatus) => taskRepository.setStatus(taskId, status),
    onSettled: invalidate,
  });

  const toggleChecklist = useMutation({
    mutationFn: ({ itemId, isDone }: { itemId: string; isDone: boolean }) =>
      taskRepository.toggleChecklist(taskId, itemId, isDone),
    // Optimistic tick so the checkbox responds on the same frame.
    onMutate: async ({ itemId, isDone }) => {
      await qc.cancelQueries({ queryKey: queryKeys.task(taskId) });
      const previous = qc.getQueryData<TaskDetail | null>(queryKeys.task(taskId));
      if (previous) {
        qc.setQueryData<TaskDetail>(queryKeys.task(taskId), {
          ...previous,
          syncState: previous.syncState === 'failed' ? 'failed' : 'pending',
          checklist: previous.checklist.map((c) => (c.id === itemId ? { ...c, isDone } : c)),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.task(taskId), ctx.previous);
    },
    onSettled: invalidate,
  });

  const addNote = useMutation({
    mutationFn: (body: string) => {
      if (!user) throw new Error('Not signed in');
      return taskRepository.addNote(taskId, body, user);
    },
    onSettled: invalidate,
  });

  const addAttachment = useMutation({
    mutationFn: (input: Omit<NewAttachment, 'taskId'>) =>
      taskRepository.addAttachment({ ...input, taskId }),
    onSettled: invalidate,
  });

  return { setStatus, toggleChecklist, addNote, addAttachment };
}

/** Signed URL for an uploaded file when there is no local copy (Supabase mode). */
export function useAttachmentUrl(localUri: string | null, remotePath: string | null) {
  const query = useQuery({
    queryKey: queryKeys.attachmentUrl(remotePath ?? ''),
    enabled: !localUri && Boolean(remotePath),
    staleTime: 30 * 60_000,
    queryFn: () => remoteApi.getAttachmentUrl(remotePath!),
  });
  return localUri ?? query.data ?? null;
}

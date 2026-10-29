import { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  tasks: ['tasks'] as const,
  taskList: ['tasks', 'list'] as const,
  task: (id: string) => ['tasks', 'detail', id] as const,
  remote: (userId: string) => ['remote-refresh', userId] as const,
  attachmentUrl: (path: string) => ['attachment-url', path] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Local reads are cheap and always fresh; remote refresh sets its own policy.
      staleTime: 0,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

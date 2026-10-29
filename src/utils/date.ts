const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ms: number): number {
  return startOfDay(ms) + DAY - 1;
}

/** End of the 7-day window starting today (rolling week, not calendar week). */
export function endOfWeek(ms: number): number {
  return startOfDay(ms) + 7 * DAY - 1;
}

/** "Due in 2h", "Overdue by 3h", "Due tomorrow", "Due Mon, 4 Nov". */
export function relativeDue(iso: string | null, now = Date.now()): string {
  if (!iso) return 'No due date';
  const t = new Date(iso).getTime();
  const diff = t - now;
  const abs = Math.abs(diff);
  const span =
    abs < HOUR
      ? `${Math.max(1, Math.round(abs / MINUTE))}m`
      : abs < DAY
        ? `${Math.round(abs / HOUR)}h`
        : `${Math.round(abs / DAY)}d`;
  if (diff < 0) return `Overdue by ${span}`;
  if (abs < DAY) return `Due in ${span}`;
  const dayDiff = Math.round((startOfDay(t) - startOfDay(now)) / DAY);
  if (dayDiff === 1) return 'Due tomorrow';
  if (dayDiff < 7) return `Due in ${dayDiff} days`;
  return `Due ${formatShortDate(iso)}`;
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

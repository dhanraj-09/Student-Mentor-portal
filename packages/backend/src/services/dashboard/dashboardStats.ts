import type { MeetingStats, QueryStats } from 'shared';
import type { MeetingRow } from '../../models/meetings/index.js';
import type { QueryRow } from '../../models/community/index.js';

export function summariseQueries(rows: QueryRow[]): QueryStats {
  let pending = 0;
  for (const row of rows) {
    if (row.status === 'Pending') pending += 1;
  }
  return { total: rows.length, pending, resolved: rows.length - pending };
}

export function summariseMeetings(rows: MeetingRow[]): MeetingStats {
  const stats: MeetingStats = {
    total: rows.length,
    pending: 0,
    accepted: 0,
    ongoing: 0,
    completed: 0,
  };
  for (const row of rows) {
    stats[row.status] += 1;
  }
  return stats;
}

/** Mean of the marks recorded on completed meetings, to one decimal place. */
export function averageMarks(rows: MeetingRow[]): number | null {
  const marked = rows.filter(
    (row): row is MeetingRow & { marks: number } =>
      typeof row.marks === 'number'
  );
  if (marked.length === 0) return null;
  const total = marked.reduce((sum, row) => sum + row.marks, 0);
  return Math.round((total / marked.length) * 10) / 10;
}

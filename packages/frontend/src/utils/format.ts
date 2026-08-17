import type { DateLike } from 'shared';

export function toDate(value: DateLike): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: DateLike): string {
  return toDate(value).toLocaleDateString();
}

export function formatDateTime(value: DateLike): string {
  return toDate(value).toLocaleString();
}

export function toDateInputValue(value: DateLike | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

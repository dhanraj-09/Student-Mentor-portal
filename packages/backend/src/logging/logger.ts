import { config } from '../config.js';
import type { LogLevel } from '../config.js';

export type { LogLevel };

export type LogContext = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const threshold = LEVEL_PRIORITY[config.logging.level];

/**
 * Values that must never reach a log sink, whatever nesting they arrive at.
 * Matched case-insensitively against the *key*, so `passwordHash`, `password`
 * and `refreshToken` are all covered by their stems.
 */
const REDACTED_KEY_PATTERN =
  /pass|secret|token|authorization|cookie|ciphertext|private/i;

const REDACTED = '[redacted]';

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1));
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = REDACTED_KEY_PATTERN.test(key)
        ? REDACTED
        : redact(nested, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_PRIORITY[level] > threshold) return;

  const record = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context === undefined
      ? {}
      : (redact(context) as Record<string, unknown>)),
  };

  // Production ships single-line JSON for log aggregators; development gets a
  // readable line, since a human is reading it off the terminal.
  const line = config.isProduction
    ? JSON.stringify(record)
    : `${record.time} ${level.toUpperCase().padEnd(5)} ${message}${
        context === undefined ? '' : ` ${JSON.stringify(redact(context))}`
      }`;

  // eslint-disable-next-line no-console
  const sink = level === 'error' ? console.error : console.log;
  sink(line);
}

export const logger = {
  error: (message: string, context?: LogContext): void =>
    emit('error', message, context),
  warn: (message: string, context?: LogContext): void =>
    emit('warn', message, context),
  info: (message: string, context?: LogContext): void =>
    emit('info', message, context),
  debug: (message: string, context?: LogContext): void =>
    emit('debug', message, context),
};

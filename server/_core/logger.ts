/**
 * Production-safe logging utility.
 * - In development: logs to console for debugging
 * - In production: only logs warnings and errors (no sensitive data leakage)
 * - Structured format for log aggregation systems
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogMeta {
  [key: string]: unknown;
}

function formatMessage(level: LogLevel, message: string, meta?: LogMeta): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}]`;
  if (meta && Object.keys(meta).length > 0) {
    return `${base} ${message} ${JSON.stringify(meta)}`;
  }
  return `${base} ${message}`;
}

export const logger = {
  debug(message: string, meta?: LogMeta): void {
    if (process.env.NODE_ENV !== "production") {
      console.debug(formatMessage("debug", message, meta));
    }
  },

  info(message: string, meta?: LogMeta): void {
    if (process.env.NODE_ENV !== "production") {
      console.info(formatMessage("info", message, meta));
    }
  },

  warn(message: string, meta?: LogMeta): void {
    console.warn(formatMessage("warn", message, meta));
  },

  error(message: string, meta?: LogMeta): void {
    console.error(formatMessage("error", message, meta));
  },
};
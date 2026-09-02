/**
 * Logger — Structured logging for AI Development Orchestrator V2.
 *
 * Writes to both console and ai/logs/orchestrator/ files.
 */
import fs from 'fs';
import path from 'path';
import { dirs } from './config';

let logStream: fs.WriteStream | null = null;
let currentLogFile: string | '';

function getLogStream(): fs.WriteStream {
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(dirs.logs, 'orchestrator', `${date}.log`);
  if (logStream && currentLogFile === logFile) return logStream;
  if (logStream) logStream.end();
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
  currentLogFile = logFile;
  return logStream;
}

/**
 * Log a message with a source tag.
 */
export function log(source: string, message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${source}] ${message}`;
  console.log(line);
  try {
    const stream = getLogStream();
    stream.write(line + '\n');
  } catch {
    // Ignore log write errors
  }
}

/**
 * Log an error with a source tag.
 */
export function logError(source: string, message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  const detail = error instanceof Error ? `${error.message}\n${error.stack}` : String(error || '');
  const line = `[${timestamp}] [${source}] ERROR: ${message}${detail ? '\n' + detail : ''}`;
  console.error(line);
  try {
    const stream = getLogStream();
    stream.write(line + '\n');
  } catch {
    // Ignore log write errors
  }
}

/**
 * Log a warning with a source tag.
 */
export function logWarn(source: string, message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${source}] WARN: ${message}`;
  console.warn(line);
  try {
    const stream = getLogStream();
    stream.write(line + '\n');
  } catch {
    // Ignore log write errors
  }
}

/**
 * Close the log stream.
 */
export function closeLog(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
    currentLogFile = '';
  }
}
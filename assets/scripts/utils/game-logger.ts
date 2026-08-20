export type LogSink = (message: string, details?: unknown) => void;

export class GameLogger {
  public constructor(private readonly sink: LogSink = (message, details) => {
    if (details === undefined) console.info(message);
    else console.info(message, details);
  }) {}

  public info(message: string, details?: unknown): void { this.sink(message, details); }
  public warn(message: string, details?: unknown): void { this.sink(`[WARN] ${message}`, details); }
  public error(message: string, details?: unknown): void { this.sink(`[ERROR] ${message}`, details); }
}

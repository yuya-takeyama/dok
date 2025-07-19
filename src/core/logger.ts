export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export class NullLogger implements Logger {
  info(_message: string, _meta?: Record<string, unknown>): void {
    // Do nothing
  }

  error(_message: string, _meta?: Record<string, unknown>): void {
    // Do nothing
  }

  warn(_message: string, _meta?: Record<string, unknown>): void {
    // Do nothing
  }

  debug(_message: string, _meta?: Record<string, unknown>): void {
    // Do nothing
  }
}

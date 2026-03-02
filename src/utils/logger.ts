import winston from "winston";
import type { Logger } from "../core/logger.js";

export class WinstonLogger implements Logger {
  private winston: winston.Logger;

  constructor(level: string = "info") {
    this.winston = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp({
          format: "YYYY-MM-DD HH:mm:ss",
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf((info) => {
              const { timestamp, level, message, ...meta } = info;

              // Format the base message
              let output = `${timestamp} [${level}]: ${message}`;

              // Add metadata if present
              if (Object.keys(meta).length > 0) {
                // Remove internal winston properties
                const cleanMeta = { ...meta };
                delete cleanMeta.splat;
                delete cleanMeta.stack;

                if (Object.keys(cleanMeta).length > 0) {
                  output += ` ${JSON.stringify(cleanMeta)}`;
                }
              }

              // Add stack trace if present
              if (info.stack) {
                output += `\n${info.stack}`;
              }

              return output;
            }),
          ),
        }),
      ],
    });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.winston.info(message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.winston.error(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.winston.warn(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.winston.debug(message, meta);
  }
}

/**
 * Creates a logger instance with the specified log level
 */
export function createLogger(level: string = "info"): Logger {
  return new WinstonLogger(level);
}

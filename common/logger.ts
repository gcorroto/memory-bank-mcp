/**
 * @fileoverview Structured logger for Memory Bank MCP
 * Ensures all logs are written to stderr to avoid breaking JSON-RPC on stdout
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

export class Logger {
    private static instance: Logger;
    private level: LogLevel = LogLevel.INFO;

    private constructor() { }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    setLevel(level: LogLevel) {
        this.level = level;
    }

    private formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }

    debug(message: string) {
        if (this.level <= LogLevel.DEBUG) {
            console.error(this.formatMessage("DEBUG", message));
        }
    }

    info(message: string) {
        if (this.level <= LogLevel.INFO) {
            console.error(this.formatMessage("INFO", message));
        }
    }

    warn(message: string) {
        if (this.level <= LogLevel.WARN) {
            console.error(this.formatMessage("WARN", message));
        }
    }

    error(message: string, error?: any) {
        if (this.level <= LogLevel.ERROR) {
            const errorMsg = error ? ` ${error instanceof Error ? error.message : String(error)}` : "";
            console.error(this.formatMessage("ERROR", message + errorMsg));
            if (error instanceof Error && error.stack) {
                console.error(error.stack);
            }
        }
    }
}

export const logger = Logger.getInstance();

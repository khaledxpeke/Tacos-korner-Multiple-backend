type LogLevel = "info" | "warn" | "error" | "debug";

const format = (level: LogLevel, message: string): string => {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
};

export const logger = {
  info(message: string): void {
    console.log(format("info", message));
  },
  warn(message: string): void {
    console.warn(format("warn", message));
  },
  error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      console.error(format("error", `${message}: ${error.message}`));
      return;
    }
    if (error !== undefined) {
      console.error(format("error", message), error);
      return;
    }
    console.error(format("error", message));
  },
  debug(message: string): void {
    if (process.env.NODE_ENV !== "production") {
      console.log(format("debug", message));
    }
  },
};

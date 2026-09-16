import http from "http";
import { env } from "./config/environment";
import { connectDB, disconnectDB } from "./config/database";
import { createApp } from "./app";
import { createSocketServer, getIO } from "./config/socket";
import { logger } from "./utils/logger";
import { errorMessage } from "./utils/helpers";

const app = createApp();
const server = http.createServer(app);
createSocketServer(server);

const shutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} received, shutting down`);
  const io = getIO();
  io.close();
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
};

const start = async (): Promise<void> => {
  await connectDB();
  server.listen(env.port, () => {
    logger.info(`Server is listening on port ${env.port}`);
  });
};

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

// Safety net: without these, ANY unhandled error anywhere in the app (e.g. a
// stray "error" event on a file stream with no listener) crashes the entire
// process for every restaurant, with no log of why. Log first, then shut
// down cleanly — the process may be in an inconsistent state after a true
// uncaughtException, so continuing to serve requests isn't safe, but at
// least this leaves a trace and closes connections gracefully instead of
// dying silently mid-request.
process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled promise rejection: ${errorMessage(reason)}`);
});
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err.stack || err.message}`);
  void shutdown("uncaughtException");
});

void start();

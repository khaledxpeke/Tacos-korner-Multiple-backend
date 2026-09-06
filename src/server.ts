import http from "http";
import { env } from "./config/environment";
import { connectDB, disconnectDB } from "./config/database";
import { createApp } from "./app";
import { createSocketServer, getIO } from "./config/socket";
import { logger } from "./utils/logger";

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

void start();

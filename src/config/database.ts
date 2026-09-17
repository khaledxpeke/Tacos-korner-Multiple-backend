import mongoose from "mongoose";
import { env } from "./environment";
import { logger } from "../utils/logger";
import { syncUserIdSequence } from "../utils/userIdSequence";

let connecting: Promise<typeof mongoose> | null = null;

export const connectDB = async (): Promise<typeof mongoose> => {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  if (connecting) {
    return connecting;
  }

  connecting = mongoose
    .connect(env.databaseUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    } as mongoose.ConnectOptions)
    .then(async (connection) => {
      logger.info("MongoDB Connected");
      try {
        await syncUserIdSequence();
      } catch (error) {
        logger.error("Failed to sync userId sequence", error);
      }
      return connection;
    })
    .catch((error: unknown) => {
      connecting = null;
      logger.error("MongoDB connection failed", error);
      process.exit(1);
    });

  return connecting;
};

export const disconnectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  connecting = null;
};

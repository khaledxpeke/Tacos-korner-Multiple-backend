import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../types/socket.types";
import { setIO as setHistoryIO, getHistoriesRT } from "../controllers/history.controller";
import { setIO as setSettingsIO } from "../controllers/settings.controller";

let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export const createSocketServer = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    transports: ["websocket", "polling"],
    allowUpgrades: true,
    perMessageDeflate: {
      threshold: 2048,
    },
    path: "/socket.io/",
  });

  setHistoryIO(io);
  io.engine.on("connection_error", (err) => {
    console.log("Connection error:", err);
  });
  setSettingsIO(io);

  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
    socket.on("join-restaurant", (data) => {
      const { restaurantId } = data;
      void socket.join(`restaurant-${restaurantId}`);
      console.log(`Socket ${socket.id} joined restaurant ${restaurantId}`);
      // TODO: Legacy behavior preserved during TS migration.
      void getHistoriesRT(socket, restaurantId);
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => io;

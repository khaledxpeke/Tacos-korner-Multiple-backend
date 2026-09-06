import type { Server } from "socket.io";

let io: Server | undefined;

export const setHistoryIO = (socketIO: Server) => {
  io = socketIO;
};

export const getHistoryIO = () => io;

import "dotenv/config";
import { createServer } from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { closePdfBrowser } from "./services/documentService.js";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { protectSockets } from "./services/authService.js";
process.env.TZ ||= "Asia/Kabul";
try {
  await connectDB(
    process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27017/vinyl_store?replicaSet=rs0",
  );
  const app = createApp(),
    server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: [
        process.env.CLIENT_URL || "http://localhost:5173",
        "http://127.0.0.1:5173",
      ],
    },
  });
  app.set("io", io);
  protectSockets(io, [
    process.env.CLIENT_URL || "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  server.listen(
    Number(process.env.PORT || 5000),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        "Vinyl API ready on http://127.0.0.1:" + (process.env.PORT || 5000),
      ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      io.close();
      server.close(async () => {
        await closePdfBrowser();
        await mongoose.disconnect();
        process.exit(0);
      });
    });
} catch (error) {
  console.error(error.message);
  await mongoose.disconnect();
  process.exit(1);
}

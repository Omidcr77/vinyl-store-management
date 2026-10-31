import "dotenv/config";
import { allowedOrigins } from "./config/origins.js";
import { createServer } from "node:http";
import { Server } from "socket.io";
import database from "./db/mysql.js";
import { closePdfBrowser } from "./services/documentService.js";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { protectSockets } from "./services/authService.js";
process.env.TZ ||= "Asia/Kabul";
try {
  await connectDB(process.env.MYSQL_URL);
  const app = createApp(),
    server = createServer(app);
  const origins = allowedOrigins();
  const io = new Server(server, {
    cors: { origin: origins, credentials: true },
    // Leave headroom below Netlify's proxy timeout for HTTP long polling.
    pingInterval: 15000,
    pingTimeout: 20000,
  });
  app.set("io", io);
  protectSockets(io, origins);
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
        await database.disconnect();
        process.exit(0);
      });
    });
} catch (error) {
  console.error(error.message);
  await database.disconnect();
  process.exit(1);
}

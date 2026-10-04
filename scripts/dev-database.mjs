import mysql from "mysql2/promise";
import { createConnection } from "node:net";
export function portIsOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}
export async function ensureDatabase(uri) {
  if (!uri || !uri.startsWith("mysql://"))
    throw new Error(
      "Set MYSQL_URL in backend/.env. No fallback database was created.",
    );
  let db;
  try {
    db = await mysql.createConnection(uri);
    await db.query("SELECT 1");
    console.log("MySQL is ready; using the configured database.");
    return null;
  } catch (error) {
    throw new Error(
      "Configured MySQL is unavailable. Run npm run db (or start your MySQL server) and check MYSQL_URL. No fallback database was created.",
      { cause: error },
    );
  } finally {
    await db?.end();
  }
}

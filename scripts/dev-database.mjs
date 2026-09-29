import mongoose from "mongoose";
import { createConnection } from "node:net";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export const defaultMongoUri =
  "mongodb://127.0.0.1:27017/vinyl_store?replicaSet=rs0";
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
async function checkDatabase(uri) {
  const connection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 2000,
  });
  try {
    await connection.asPromise();
    const hello = await connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== "isdbgrid")
      throw new Error("MongoDB must be a replica set.");
  } finally {
    await connection.close().catch(() => {});
  }
}
export async function ensureDatabase(
  uri,
  { port = 27017, dbPath = resolve(".data/mongo") } = {},
) {
  try {
    await checkDatabase(uri);
    console.log("MongoDB is ready; using the running database.");
    return null; // Never stop a database owned by another process.
  } catch (error) {
    let url;
    try {
      url = new URL(uri);
    } catch {}
    const local =
      url?.protocol === "mongodb:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      Number(url.port || 27017) === port &&
      !url.username &&
      !url.password &&
      url.searchParams.get("replicaSet") === "rs0";
    if (!local)
      throw new Error(
        "Configured MongoDB is unavailable. Start that database or correct MONGO_URI in backend/.env. No fallback database was created.",
      );
    if (await portIsOpen(port))
      throw new Error(
        `Port ${port} is occupied but MongoDB is not ready as replica set rs0. Check the existing database configuration.`,
      );
    console.log(
      "Starting persistent local MongoDB (existing store records are retained)...",
    );
    await mkdir(dbPath, { recursive: true });
    const { MongoMemoryReplSet } = await import("mongodb-memory-server");
    const db = await MongoMemoryReplSet.create({
      instanceOpts: [{ port, dbPath }],
      replSet: { count: 1, name: "rs0", storageEngine: "wiredTiger" },
    });
    try {
      await checkDatabase(uri);
    } catch (error) {
      await db.stop({ doCleanup: false });
      throw error;
    }
    console.log("Local MongoDB is ready.");
    return db;
  }
}

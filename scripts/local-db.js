import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const dbPath = resolve(".data/mongo");
await mkdir(dbPath, { recursive: true });
const db = await MongoMemoryReplSet.create({
  instanceOpts: [{ port: 27017, dbPath }],
  replSet: { count: 1, name: "rs0", storageEngine: "wiredTiger" },
});
console.log("Persistent local MongoDB ready: " + db.getUri("vinyl_store"));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await db.stop({ doCleanup: false });
    process.exit(0);
  });

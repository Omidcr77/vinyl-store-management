// One-way migration: freeze old app writes first; MongoDB is only a source.
import dotenv from "dotenv";
import { MongoClient, BSON } from "mongodb";
import { EJSON } from "bson";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import database from "../backend/db/mysql.js";
import { connectDB } from "../backend/config/db.js";
import { validateBackup } from "../backend/services/backupService.js";
import { uploadsDirectory } from "../backend/config/storage.js";
dotenv.config({ path: resolve("backend/.env"), quiet: true });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
const fingerprint = (docs) =>
  hash(
    JSON.stringify(
      docs
        .map((d) => canonical(EJSON.serialize(d, { relaxed: false })))
        .sort((a, b) =>
          JSON.stringify(a._id).localeCompare(JSON.stringify(b._id)),
        ),
    ),
  );
export async function importBackup(buffer) {
  const validated = await validateBackup(buffer);
  const report = {
    createdAt: new Date().toISOString(),
    tables: {},
    photos: validated.files.size,
  };
  // File conflicts are checked before the database transaction.
  await mkdir(uploadsDirectory(), { recursive: true });
  for (const [name, bytes] of validated.files) {
    const path = resolve(uploadsDirectory(), name);
    try {
      assert.equal(
        hash(await readFile(path)),
        hash(bytes),
        `Photo conflict: ${name}`,
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    }
  }
  await database.connection.transaction(async (session) => {
    for (const [name] of Object.entries(validated.collections)) {
      const existing = await database.connection.db
        .collection(name)
        .find({}, { session })
        .toArray();
      if (existing.length && !["settings", "authguards"].includes(name))
        throw new Error(
          `MySQL table ${name} is not empty; refusing to overwrite a store.`,
        );
    }
    for (const [name, docs] of Object.entries(validated.collections)) {
      const table = database.connection.db.collection(name);
      await table.deleteMany({}, { session });
      await table.insertMany(docs, { session });
      const actual = await table.find({}, { session }).toArray();
      assert.equal(
        fingerprint(actual),
        fingerprint(docs),
        `${name}: records differ after import`,
      );
      report.tables[name] = {
        count: actual.length,
        sha256: fingerprint(actual),
      };
    }
  });
  return report;
}
async function exportMongo() {
  if (!process.env.MONGO_URI)
    throw new Error(
      "Set the legacy MONGO_URI privately, or supply --backup path.vinyl-backup.gz.",
    );
  const mongo = new MongoClient(process.env.MONGO_URI);
  try {
    await mongo.connect();
    const db = mongo.db(),
      collections = {};
    const known = [
      "suppliers",
      "supplierentries",
      "customerpricehistories",
      "settings",
      "vinylrolls",
      "customers",
      "sales",
      "payments",
      "counters",
      "customerprices",
      "deliveries",
      "users",
      "auditevents",
      "authguards",
      "deletedrecords",
    ];
    const existing = await db.listCollections().toArray();
    assert.ok(
      existing.every(
        (c) =>
          known.includes(c.name) ||
          c.name === "loginsessions" ||
          c.name.startsWith("system."),
      ),
      "Unknown MongoDB collection; refusing an incomplete export.",
    );
    const session = mongo.startSession();
    try {
      await session.withTransaction(
        async () => {
          for (const name of known)
            collections[name] = (
              await db.collection(name).find({}, { session }).toArray()
            ).map((d) => BSON.EJSON.serialize(d, { relaxed: false }));
        },
        { readConcern: { level: "snapshot" } },
      );
    } finally {
      await session.endSession();
    }
    const files = [];
    for (const name of await readdir(uploadsDirectory()).catch((e) => {
      if (e.code === "ENOENT") return [];
      throw e;
    })) {
      if (!/^[a-f0-9-]{36}\.webp$/.test(name)) continue;
      const bytes = await readFile(resolve(uploadsDirectory(), name));
      files.push({ name, sha256: hash(bytes), data: bytes.toString("base64") });
    }
    const payload = {
      format: "vinyl-store-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      storeName: collections.settings[0]?.storeName || "",
      collections,
      files,
    };
    return promisify(gzip)(
      JSON.stringify({ sha256: hash(JSON.stringify(payload)), payload }),
    );
  } finally {
    await mongo.close();
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const option = process.argv.indexOf("--backup");
    const buffer =
      option >= 0
        ? await readFile(resolve(process.argv[option + 1]))
        : await exportMongo();
    await mkdir(resolve(".data/backups"), { recursive: true, mode: 0o700 });
    const stamp = Date.now();
    await writeFile(
      resolve(`.data/backups/before-mysql-${stamp}.vinyl-backup.gz`),
      buffer,
      { flag: "wx", mode: 0o600 },
    );
    await connectDB();
    const report = await importBackup(buffer);
    await writeFile(
      resolve(`.data/backups/mysql-migration-${stamp}.json`),
      JSON.stringify(report, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      "Migration committed; every table matches the source record-for-record. Counts:",
      Object.fromEntries(
        Object.entries(report.tables).map(([n, t]) => [n, t.count]),
      ),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await database.disconnect();
  }
}

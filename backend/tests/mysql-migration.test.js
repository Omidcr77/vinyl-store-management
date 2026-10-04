import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TestDatabase } from "./support/database.js";
import database from "../db/mysql.js";
import { connectDB } from "../config/db.js";
import { seed } from "../seed.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import VinylRoll from "../models/VinylRoll.js";
import { verifyPassword } from "../services/authService.js";
import { createBackup } from "../services/backupService.js";
import { importBackup } from "../../scripts/migrate-mongodb-to-mysql.mjs";

test("Dari seed is atomic, creates a configured admin, and legacy backup migration preserves records", async () => {
  const source = await TestDatabase.create(),
    target = await TestDatabase.create();
  const folder = await mkdtemp(join(tmpdir(), "vinyl-mysql-migration-"));
  const previousUpload = process.env.UPLOAD_DIR,
    previousPassword = process.env.ADMIN_PASSWORD;
  process.env.UPLOAD_DIR = folder;
  process.env.ADMIN_PASSWORD = "Migration-test-admin-123";
  try {
    await connectDB(source.getUri());
    await seed();
    const admin = await User.findOne({ username: "admin" }).select(
      "+passwordHash",
    );
    assert.ok(
      await verifyPassword(process.env.ADMIN_PASSWORD, admin.passwordHash),
    );
    assert.equal((await Settings.findById("store")).currency, "AFN");
    assert.equal(await Customer.countDocuments(), 5);
    assert.equal(await Sale.countDocuments(), 10);
    assert.equal(await VinylRoll.countDocuments(), 15);
    assert.match((await Customer.findOne()).name, /[\u0600-\u06ff]/);
    await assert.rejects(seed(), /empty database/);
    const customer = (await Customer.collection.find().toArray())[0];
    customer.legacyExtra = {
      when: new Date("2025-01-02T00:00:00.123Z"),
      note: "معلومات قبلی",
    };
    customer.address = null;
    await Customer.collection.deleteMany({ _id: customer._id });
    await Customer.collection.insertOne(customer);
    const backup = await createBackup();
    await database.disconnect();
    await connectDB(target.getUri());
    const report = await importBackup(backup.buffer);
    assert.equal(report.tables.sales.count, 10);
    assert.equal(report.tables.users.count, 1);
    assert.equal(
      (await User.findOne({ username: "admin" }).select("+passwordHash"))
        .passwordHash,
      admin.passwordHash,
    );
    let restored = (
      await Customer.collection.find({ _id: customer._id }).toArray()
    )[0];
    assert.deepEqual(restored, customer);
    const editable = await Customer.findById(customer._id);
    editable.name = "احمد مهاجر";
    await editable.save();
    restored = (
      await Customer.collection.find({ _id: customer._id }).toArray()
    )[0];
    assert.deepEqual(
      restored.legacyExtra,
      customer.legacyExtra,
      "Legacy fields survive later edits",
    );
    assert.equal(restored.address, null);
    await assert.rejects(importBackup(backup.buffer), /not empty/);
    assert.equal(await Sale.countDocuments(), 10);
  } finally {
    await database.disconnect();
    await source.stop();
    await target.stop();
    await rm(folder, { recursive: true, force: true });
    if (previousUpload === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUpload;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  }
});

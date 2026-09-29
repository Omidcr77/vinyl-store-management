import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import supertest from "supertest";
import sharp from "sharp";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdtemp, rm, readFile, unlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash, randomUUID } from "node:crypto";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import { hashPassword } from "../services/authService.js";
import { validateBackup } from "../services/backupService.js";
import { withMaintenance } from "../services/maintenanceService.js";
import User from "../models/User.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import Payment from "../models/Payment.js";
import LoginSession from "../models/LoginSession.js";
let db,
  app,
  directory,
  cookie,
  csrf,
  backup,
  preview,
  customer,
  sale,
  photoUrl,
  photoContent;
const password = "Backup-password-123";
const request = (method) => (path) =>
  supertest(app)[method](path).set("Cookie", cookie).set("X-CSRF-Token", csrf);
const call = Object.fromEntries(
  ["get", "post", "put", "delete"].map((method) => [method, request(method)]),
);
async function login() {
  const response = await supertest(app)
    .post("/api/auth/login")
    .set("X-Requested-With", "store-app")
    .send({ username: "backupadmin", password })
    .expect(200);
  cookie = response.headers["set-cookie"][0].split(";")[0];
  csrf = response.body.data.csrf;
}
const binary = (res, cb) => {
  const chunks = [];
  res.on("data", (d) => chunks.push(d));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};
const exportBackup = async () =>
  (await call.get("/api/backup/export").buffer(true).parse(binary).expect(200))
    .body;
const inspect = (buffer) =>
  call
    .post("/api/backup/preview")
    .attach("backup", buffer, "store.vinyl-backup.gz");
const restore = (buffer, digest) =>
  call
    .post("/api/backup/restore")
    .field("confirmation", "RESTORE")
    .field("digest", digest)
    .attach("backup", buffer, "store.vinyl-backup.gz");
function editBackup(buffer, change) {
  const value = JSON.parse(gunzipSync(buffer));
  change(value.payload);
  value.sha256 = createHash("sha256")
    .update(JSON.stringify(value.payload))
    .digest("hex");
  return gzipSync(JSON.stringify(value));
}
const post = async (path, body) =>
  (
    await call
      .post("/api/" + path)
      .set("Idempotency-Key", randomUUID())
      .send(body)
      .expect(201)
  ).body.data;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "vinyl-backup-test-"));
  process.env.UPLOAD_DIR = join(directory, "uploads");
  process.env.BACKUP_DIR = join(directory, "backups");
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDB(db.getUri("backups"));
  app = createApp();
  await User.create({
    username: "backupadmin",
    name: "Backup Admin",
    role: "admin",
    passwordHash: await hashPassword(password),
  });
  await login();
  const image = await sharp({
    create: { width: 30, height: 20, channels: 3, background: "#287465" },
  })
    .png()
    .toBuffer();
  photoUrl = (
    await call
      .post("/api/images")
      .attach("image", image, "photo.png")
      .expect(201)
  ).body.data.url;
  photoContent = await readFile(
    join(process.env.UPLOAD_DIR, photoUrl.split("/").pop()),
  );
  customer = await post("customers", {
    name: "Backup Customer",
    phone: "0701234567",
    img: photoUrl,
  });
  const delivery = await post("deliveries", {
    supplier: "Supplier",
    reference: "BACKUP",
    entryDate: "2026-09-29",
    rows: [
      {
        vinylName: "Backup roll",
        type: "Carpet",
        color: "Red",
        width: 4,
        length: 30,
        quantity: 2,
      },
    ],
  });
  const rolls = (await call.get("/api/vinyl")).body.data.items;
  sale = await post("sales", {
    customerId: customer._id,
    vinylId: rolls[0]._id,
    soldLength: 3,
    pricingMethod: "linear",
    unitPrice: 10,
    paidAmount: 5,
    rememberPrice: true,
  });
  await post("payments", {
    customerId: customer._id,
    amount: 10,
    paymentMethod: "cash",
  });
  const deleted = await post("sales", {
    customerId: customer._id,
    vinylId: rolls[1]._id,
    soldLength: 1,
    pricingMethod: "linear",
    unitPrice: 10,
    paidAmount: 10,
  });
  await call.delete(`/api/sales/${deleted._id}`).expect(200);
  assert.ok(delivery._id);
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
  delete process.env.UPLOAD_DIR;
  delete process.env.BACKUP_DIR;
});

test("only admins can export, inspect, restore or download recovery backups; writes require CSRF", async () => {
  await supertest(app).get("/api/backup/export").expect(401);
  for (const role of ["staff", "manager"]) {
    await User.updateOne({ username: "backupadmin" }, { $set: { role } });
    await call.get("/api/backup/export").expect(403);
    await call.post("/api/backup/preview").expect(403);
    await call.post("/api/backup/restore").expect(403);
    await call.get("/api/backup/recovery").expect(403);
    await call.get("/api/backup/recovery/anything").expect(403);
  }
  await User.updateOne(
    { username: "backupadmin" },
    { $set: { role: "admin" } },
  );
  await supertest(app)
    .post("/api/backup/restore")
    .set("Cookie", cookie)
    .expect(403);
});
test("export includes every durable collection, BSON values, password hashes and photos", async () => {
  backup = await exportBackup();
  preview = (await inspect(backup).expect(200)).body.data;
  const { payload } = JSON.parse(gunzipSync(backup));
  assert.equal(payload.version, 1);
  assert.equal(payload.collections.users.length, 1);
  assert.ok(payload.collections.users[0].passwordHash);
  assert.ok(!payload.collections.loginsessions);
  assert.deepEqual(
    Object.keys(payload.collections).sort(),
    [
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
    ].sort(),
  );
  assert.ok(payload.collections.sales[0]._id.$oid);
  assert.ok(payload.collections.sales[0].soldDate.$date);
  assert.equal(preview.photos, 1);
  assert.equal(preview.counts.deliveries, 1);
  assert.equal(preview.counts.deletedrecords, 1);
  assert.deepEqual(Buffer.from(payload.files[0].data, "base64"), photoContent);
});
test("corrupt, incompatible, unsafe and incomplete backups are rejected before writes", async () => {
  const old = await Customer.findById(customer._id).lean();
  await inspect(Buffer.from("not gzip")).expect(400);
  const cases = [
    (p) => {
      p.version = 999;
    },
    (p) => {
      delete p.collections.users;
    },
    (p) => {
      p.collections.users[0].role = "staff";
    },
    (p) => {
      p.files[0].name = "../escape.webp";
    },
    (p) => {
      p.files[0].sha256 = "0".repeat(64);
    },
    (p) => {
      p.files = [];
    },
    (p) => {
      p.collections.customers.push(p.collections.customers[0]);
    },
    (p) => {
      p.collections.counters = [];
    },
    (p) => {
      p.collections.sales[0].customerId = { $oid: "000000000000000000000001" };
    },
  ];
  for (const change of cases)
    await inspect(editBackup(backup, change)).expect(400);
  await restore(backup, "incorrect-digest").expect(409);
  await call
    .post("/api/backup/restore")
    .field("digest", preview.digest)
    .attach("backup", backup, "store.gz")
    .expect(400);
  assert.deepEqual(await Customer.findById(customer._id).lean(), old);
  assert.equal(await LoginSession.countDocuments(), 1);
});
test("restore is atomic, restores hashes, photos and ids, creates safety copy and signs everyone out", async () => {
  await call
    .put(`/api/customers/${customer._id}`)
    .send({ name: "Changed after backup", phone: "0709999999", img: "" })
    .expect(200);
  await unlink(join(process.env.UPLOAD_DIR, photoUrl.split("/").pop()));
  await User.updateOne(
    { username: "backupadmin" },
    { $set: { name: "Changed Admin" } },
  );
  await post("customers", { name: "Not in backup", phone: "0700000000" });
  const oldCookie = cookie;
  const result = (await restore(backup, preview.digest).expect(200)).body.data;
  assert.match(result.recovery, /^before-restore-/);
  assert.equal((await Customer.findById(customer._id)).name, "Backup Customer");
  assert.equal(await Customer.countDocuments(), 1);
  assert.equal(await Sale.countDocuments(), 1);
  assert.equal(await Payment.countDocuments(), 1);
  assert.deepEqual(
    await readFile(join(process.env.UPLOAD_DIR, photoUrl.split("/").pop())),
    photoContent,
  );
  assert.equal(await LoginSession.countDocuments(), 0);
  await supertest(app)
    .get("/api/auth/session")
    .set("Cookie", oldCookie)
    .expect(401);
  await login();
  assert.equal(
    (await User.findOne({ username: "backupadmin" })).name,
    "Backup Admin",
  );
  const recovery = (await call.get("/api/backup/recovery").expect(200)).body
    .data;
  assert.ok(recovery.some((item) => item.name === result.recovery));
  const saved = (
    await call
      .get(`/api/backup/recovery/${result.recovery}`)
      .buffer(true)
      .parse(binary)
      .expect(200)
  ).body;
  const { payload } = JSON.parse(gunzipSync(saved));
  assert.equal(payload.collections.customers.length, 2);
  const newSale = await post("sales", {
    customerId: customer._id,
    vinylId: sale.vinylId,
    soldLength: 1,
    pricingMethod: "linear",
    unitPrice: 10,
    paidAmount: 10,
  });
  assert.notEqual(newSale.billNumber, sale.billNumber);
});
test("transaction failure rolls back all collections and leaves current photos usable", async () => {
  const current = await Customer.findById(customer._id).lean();
  const original = Sale.collection.insertMany;
  Sale.collection.insertMany = async () => {
    throw new Error("injected restore failure");
  };
  try {
    await restore(backup, preview.digest).expect(500);
  } finally {
    Sale.collection.insertMany = original;
  }
  assert.deepEqual(await Customer.findById(customer._id).lean(), current);
  assert.equal(await Sale.countDocuments(), 2);
  await call.get("/api/auth/session").expect(200);
  assert.deepEqual(
    await readFile(join(process.env.UPLOAD_DIR, photoUrl.split("/").pop())),
    photoContent,
  );
});
test("maintenance blocks store requests while backups run and releases after failure", async () => {
  await withMaintenance(async () => {
    await call.get("/api/customers").expect(503);
    await call
      .post("/api/customers")
      .send({ name: "Should not write", phone: "070" })
      .expect(503);
    await call.get("/api/health").expect(200);
    await call.get("/api/backup/export").expect(409);
  });
  await call.get("/api/customers").expect(200);
  assert.equal(await Customer.countDocuments({ name: "Should not write" }), 0);
});

test("backup waits for an in-flight write and includes its committed data", async () => {
  let started, release;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const original = Customer.collection.insertOne;
  Customer.collection.insertOne = async function (...args) {
    started();
    await wait;
    return original.apply(this, args);
  };
  let saved, exported;
  try {
    saved = post("customers", {
      name: "Saved during backup",
      phone: "0705555555",
    });
    await began;
    exported = exportBackup();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await call.get("/api/customers").expect(503);
    release();
    await saved;
    const payload = JSON.parse(gunzipSync(await exported)).payload;
    assert.ok(
      payload.collections.customers.some(
        (c) => c.name === "Saved during backup",
      ),
    );
  } finally {
    release();
    Customer.collection.insertOne = original;
    await Promise.allSettled([saved, exported].filter(Boolean));
  }
});

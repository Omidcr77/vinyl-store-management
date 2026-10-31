import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import database from "../db/mysql.js";
import { TestDatabase } from "./support/database.js";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import { bootstrapAdmin } from "../services/authService.js";
import Customer from "../models/Customer.js";
import VinylRoll from "../models/VinylRoll.js";
import Sale from "../models/Sale.js";
import AuditEvent from "../models/AuditEvent.js";
import DeletedRecord from "../models/DeletedRecord.js";
import { attributionKeys, actorText } from "../../shared/actors.js";
let db, app;
const password = "Attribution-test-password-123";
async function login(username) {
  const r = await request(app)
    .post("/api/auth/login")
    .set("X-Requested-With", "store-app")
    .send({ username, password })
    .expect(200);
  const cookie = r.headers["set-cookie"][0].split(";")[0];
  return {
    user: r.body.data.user,
    call: (method, path) =>
      request(app)
        [method](path)
        .set("Cookie", cookie)
        .set("X-CSRF-Token", r.body.data.csrf),
  };
}
function check(record, user, prefix = "createdBy") {
  assert.equal(String(record[prefix]), String(user._id));
  for (const [suffix, key] of [
    ["Name", "name"],
    ["Username", "username"],
    ["Role", "role"],
  ])
    assert.equal(record[prefix + suffix], user[key]);
}
before(async () => {
  db = await TestDatabase.create();
  await connectDB(db.getUri());
  app = createApp();
  await bootstrapAdmin({ username: "owner", name: "Owner", password });
});
after(async () => {
  await database.disconnect();
  await db?.stop();
});
test("nullable SQL upgrade preserves legacy records without inventing actors", async () => {
  const legacy = await Customer.create({
    name: "Legacy customer",
    phone: "0700000011",
    createdByName: "Old worker",
  });
  const before = await Customer.collection.find({ _id: legacy._id }).toArray();
  await database.sql(
    "ALTER TABLE customers DROP COLUMN createdByUsername, DROP COLUMN createdByRole, DROP COLUMN updatedByUsername, DROP COLUMN updatedByRole",
  );
  await connectDB(db.getUri());
  assert.deepEqual(
    await Customer.collection.find({ _id: legacy._id }).toArray(),
    before,
  );
  const record = await Customer.findById(legacy._id).lean();
  assert.equal(record.createdByRole, undefined);
  assert.equal(record.createdByName, "Old worker");
  assert.equal(actorText({}), "رکورد قبلی — کاربر ثبت نشده");
});
test("trusted actor snapshots, account changes, audit filters and financial side effects", async (t) => {
  const admin = await login("owner");
  const createUser = async (username, name, role) =>
    (
      await admin
        .call("post", "/api/users")
        .send({ username, name, role, password })
        .expect(201)
    ).body.data;
  const worker = await createUser("farid", "فرید احمدی", "staff");
  const manager = await createUser("jawid", "جاوید نادری", "manager");
  check(worker, admin.user);
  const staff = await login(worker.username),
    boss = await login(manager.username);
  const forged = {
    createdBy: admin.user._id,
    createdByName: "Forged admin",
    createdByUsername: "owner",
    createdByRole: "admin",
    updatedByName: "Forged",
  };
  let customer, roll, sale, payment;
  await t.test(
    "customer creator cannot be forged or overwritten by an editor",
    async () => {
      customer = (
        await staff
          .call("post", "/api/customers")
          .send({ name: "احمد مشتری", phone: "0700000001", ...forged })
          .expect(201)
      ).body.data;
      check(customer, worker);
      check(customer, worker, "updatedBy");
      customer = (
        await boss
          .call("put", `/api/customers/${customer._id}`)
          .send({
            name: customer.name,
            phone: customer.phone,
            address: "کابل",
            ...forged,
          })
          .expect(200)
      ).body.data;
      check(customer, worker);
      check(customer, manager, "updatedBy");
    },
  );
  await t.test(
    "delivery creator is attached to every generated physical roll",
    async () => {
      const delivery = (
        await boss
          .call("post", "/api/deliveries")
          .set("Idempotency-Key", "actor-delivery")
          .send({
            entryDate: "2026-10-31",
            supplier: "Pamir",
            rows: [
              {
                vinylName: "قالین",
                type: "افغانی",
                color: "سرخ",
                width: 4,
                length: 45,
                quantity: 3,
              },
            ],
            ...forged,
          })
          .expect(201)
      ).body.data;
      check(delivery, manager);
      const rolls = await VinylRoll.find({ deliveryId: delivery._id }).lean();
      assert.equal(rolls.length, 3);
      for (const r of rolls) check(r, manager);
      roll = rolls[0];
    },
  );
  await t.test(
    "sale and receipt retain creators while balances and stock record the latest actor",
    async () => {
      const input = {
        vinylId: String(roll._id),
        customerId: customer._id,
        soldLength: 2,
        pricingMethod: "linear",
        unitPrice: 100,
        paidAmount: 0,
        ...forged,
      };
      sale = (
        await staff
          .call("post", "/api/sales")
          .set("Idempotency-Key", "actor-sale")
          .send(input)
          .expect(201)
      ).body.data;
      check(sale, worker);
      check(await VinylRoll.findById(roll._id), worker, "updatedBy");
      check(await Customer.findById(customer._id), worker, "updatedBy");
      const count = await AuditEvent.countDocuments({
        action: "POST /api/sales",
      });
      await staff
        .call("post", "/api/sales")
        .set("Idempotency-Key", "actor-sale")
        .send(input)
        .expect(201);
      assert.equal(
        await AuditEvent.countDocuments({ action: "POST /api/sales" }),
        count,
      );
      payment = (
        await boss
          .call("post", "/api/payments")
          .set("Idempotency-Key", "actor-payment")
          .send({
            customerId: customer._id,
            amount: 50,
            paymentMethod: "cash",
            ...forged,
          })
          .expect(201)
      ).body.data;
      check(payment, manager);
      const updated = await Sale.findById(sale._id);
      check(updated, worker);
      check(updated, manager, "updatedBy");
      assert.equal(updated.remainingBalance, 150);
      check(await Customer.findById(customer._id), manager, "updatedBy");
    },
  );
  await t.test(
    "historical identity and role survive account rename and promotion",
    async () => {
      await admin
        .call("put", `/api/users/${worker._id}`)
        .send({
          username: "farid.new",
          name: "فرید جدید",
          role: "manager",
          active: true,
        })
        .expect(200);
      check(await Customer.findById(customer._id), worker);
      check(await Sale.findById(sale._id), worker);
      const renamed = await login("farid.new");
      const newer = (
        await renamed
          .call("post", "/api/customers")
          .send({ name: "New customer", phone: "0700000002" })
          .expect(201)
      ).body.data;
      check(newer, renamed.user);
      assert.equal(newer.createdByRole, "manager");
      const old = (
        await admin
          .call("get", "/api/audit?search=farid&role=staff&resource=sales")
          .expect(200)
      ).body.data;
      assert.equal(old.total, 1);
      assert.equal(old.items[0].actorName, worker.name);
      assert.equal(old.items[0].actorRole, "staff");
      assert.equal(old.items[0].targetLabel, sale.billNumber);
      const byBill = (
        await admin
          .call("get", `/api/audit?search=${sale.billNumber}&resource=sales`)
          .expect(200)
      ).body.data;
      assert.equal(byBill.total, 1);
      await boss.call("get", "/api/audit").expect(403);
      await admin.call("get", "/api/audit?role=superadmin").expect(400);
      await admin.call("get", "/api/audit?from=not-a-date").expect(400);
      const empty = (
        await admin
          .call("get", "/api/audit?from=2000-01-01&to=2000-01-02")
          .expect(200)
      ).body.data;
      assert.equal(empty.total, 0);
      await renamed.call("post", "/api/auth/logout").expect(200);
      const logout = await AuditEvent.findOne({
        action: "auth.logout",
        actorUsername: "farid.new",
      });
      assert.equal(logout.actorRole, "manager");
    },
  );
  await t.test(
    "exports carry attribution and audit the downloading account",
    async () => {
      const csv = await admin
        .call("get", "/api/exports/sales?format=csv")
        .expect(200);
      assert.match(csv.text, /ثبت‌کننده/);
      assert.match(csv.text, /@farid/);
      assert.match(csv.text, /@jawid/);
      const download = await AuditEvent.findOne({ action: "export.download" });
      assert.equal(download.actorUsername, "owner");
      assert.equal(download.actorRole, "admin");
    },
  );
  await t.test(
    "failed writes leave no partial attribution or audit; deletion records are attributable and retryable",
    async () => {
      const before = await VinylRoll.findById(roll._id).lean(),
        count = await AuditEvent.countDocuments();
      await boss
        .call("post", "/api/sales")
        .set("Idempotency-Key", "actor-failed")
        .send({
          vinylId: String(roll._id),
          soldLength: 999,
          pricingMethod: "linear",
          unitPrice: 100,
          paidAmount: 0,
          customerId: customer._id,
        })
        .expect(409);
      assert.deepEqual(await VinylRoll.findById(roll._id).lean(), before);
      assert.equal(await AuditEvent.countDocuments(), count);
      await boss.call("delete", `/api/sales/${sale._id}`).expect(200);
      const tombstone = await DeletedRecord.findOne({ recordId: sale._id });
      check(tombstone, manager);
      check(tombstone.record, worker);
      await boss.call("delete", `/api/sales/${sale._id}`).expect(200);
      assert.equal((await VinylRoll.findById(roll._id)).length, 45);
      const all = JSON.stringify(await AuditEvent.find().lean());
      assert.ok(!all.includes(password));
      assert.ok(!all.includes("passwordHash"));
      assert.ok(!all.includes("X-CSRF"));
    },
  );
});

test("supplier reversals, settings and saved prices retain trusted responsibility", async () => {
  const owner = await login("owner"),
    manager = await login("jawid");
  const supplier = (
    await manager
      .call("post", "/api/suppliers")
      .send({ name: "Supplier actor test" })
      .expect(201)
  ).body.data;
  check(supplier, manager.user);
  const entry = (
    await manager
      .call("post", `/api/suppliers/${supplier._id}/entries`)
      .set("Idempotency-Key", "supplier-actor-entry")
      .send({ kind: "loan_received", amount: 100, details: "Loan received" })
      .expect(201)
  ).body.data;
  check(entry, manager.user);
  const reversal = (
    await owner
      .call(
        "post",
        `/api/suppliers/${supplier._id}/entries/${entry._id}/reverse`,
      )
      .set("Idempotency-Key", "supplier-actor-reversal")
      .send({ details: "Correct loan entry" })
      .expect(201)
  ).body.data;
  check(reversal, owner.user);
  const statement = await owner
    .call("get", `/api/suppliers/${supplier._id}/statement?format=csv`)
    .expect(200);
  assert.match(statement.text, /@jawid/);
  assert.match(statement.text, /@owner/);
  const details = (
    await owner.call("get", `/api/suppliers/${supplier._id}`).expect(200)
  ).body.data;
  const original = details.entries.items.find((row) => row._id === entry._id);
  check(original, manager.user);
  check(original, owner.user, "updatedBy");
  const settings = (await owner.call("get", "/api/settings").expect(200)).body
    .data;
  const updated = (
    await owner
      .call("put", "/api/settings")
      .send({
        ...settings,
        phone: "0700000003",
        createdByName: "Fake worker",
        updatedByRole: "staff",
      })
      .expect(200)
  ).body.data;
  check(updated, owner.user, "updatedBy");
  await manager
    .call("post", "/api/vinyl")
    .send({
      vinylName: "Settings lock test",
      type: "Afghan",
      color: "Red",
      length: 45,
      width: 4,
    })
    .expect(201);
  const afterLock = (await owner.call("get", "/api/settings").expect(200)).body
    .data;
  assert.equal(
    afterLock.updatedAt,
    updated.updatedAt,
    "Internal revision locks must not change the settings editor time",
  );
  check(afterLock, owner.user, "updatedBy");
  const customer = (
    await manager
      .call("post", "/api/customers")
      .send({ name: "Price customer", phone: "0700000004" })
      .expect(201)
  ).body.data;
  const price = (
    await manager
      .call("put", `/api/customers/${customer._id}/prices`)
      .send({ type: "Afghan", pricingMethod: "linear", unitPrice: 10 })
      .expect(200)
  ).body.data;
  check(price, manager.user);
  const changed = (
    await owner
      .call("put", `/api/customers/${customer._id}/prices`)
      .send({ type: "Afghan", pricingMethod: "linear", unitPrice: 12 })
      .expect(200)
  ).body.data;
  check(changed, manager.user);
  check(changed, owner.user, "updatedBy");
  const profileBefore = (
    await owner.call("get", "/api/users").expect(200)
  ).body.data.items.find((row) => row._id === manager.user._id);
  await login("jawid");
  const profileAfter = (
    await owner.call("get", "/api/users").expect(200)
  ).body.data.items.find((row) => row._id === manager.user._id);
  assert.equal(
    profileAfter.updatedAt,
    profileBefore.updatedAt,
    "Login must not change profile editor time",
  );
  for (const key of attributionKeys)
    assert.equal(profileAfter[key], profileBefore[key]);
});

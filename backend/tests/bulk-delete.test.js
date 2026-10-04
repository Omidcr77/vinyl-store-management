import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import database from "../db/mysql.js";
import { randomUUID } from "node:crypto";
import { TestDatabase } from "./support/database.js";
import request, { signInTestAdmin } from "./support/auth.js";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import Payment from "../models/Payment.js";
import VinylRoll from "../models/VinylRoll.js";
import DeletedRecord from "../models/DeletedRecord.js";
import User from "../models/User.js";
let db, app;
before(async () => {
  db = await TestDatabase.create();
  await connectDB(db.getUri("bulk_deletion"));
  app = createApp();
  await signInTestAdmin(app);
});
after(async () => {
  await database.disconnect();
  await db?.stop();
});
const post = async (path, body, key = randomUUID()) =>
  (
    await request(app)
      .post("/api/" + path)
      .set("Idempotency-Key", key)
      .send(body)
      .expect(201)
  ).body.data;
const customer = () =>
  post("customers", { name: "Bulk customer", phone: "0701234567" });
const roll = () =>
  post("vinyl", {
    vinylName: "Bulk roll",
    type: "Carpet",
    color: "Red",
    length: 30,
    width: 4,
  });
const remove = (kind, ids) =>
  request(app).post(`/api/${kind}/bulk-delete`).send({ ids });
const sale = (c, r, extra = {}, key = randomUUID()) =>
  post(
    "sales",
    {
      customerId: c?._id,
      vinylId: r._id,
      soldLength: 1,
      pricingMethod: "linear",
      unitPrice: 10,
      paidAmount: 0,
      ...extra,
    },
    key,
  );

test("bulk selection validates ids, permissions and atomic rollback", async () => {
  const a = await customer(),
    b = await customer();
  await remove("customers", []).expect(400);
  await remove("sales", ["bad"]).expect(400);
  await remove("customers", [
    a._id,
    new database.Types.ObjectId().toString(),
  ]).expect(404);
  assert.equal((await Customer.findById(a._id)).archived, false);
  await User.updateOne({ username: "testadmin" }, { $set: { role: "staff" } });
  for (const kind of ["customers", "vinyl", "sales"])
    await remove(kind, [a._id]).expect(403);
  await User.updateOne({ username: "testadmin" }, { $set: { role: "admin" } });
  await remove("customers", [a._id, b._id, a._id]).expect(200);
  assert.equal(
    await Customer.countDocuments({
      _id: { $in: [a._id, b._id] },
      archived: true,
    }),
    2,
  );
});
test("bulk sale deletion restores repeated-item stock, balances, reports and blocks old retries", async () => {
  const c = await customer(),
    r = await roll(),
    key = randomUUID();
  const body = {
    customerId: c._id,
    items: [
      { vinylId: r._id, soldLength: 2, pricingMethod: "linear", unitPrice: 10 },
      { vinylId: r._id, soldLength: 3, pricingMethod: "linear", unitPrice: 10 },
    ],
    paidAmount: 10,
  };
  const s = await post("sales", body, key),
    s2 = await sale(c, r, { paidAmount: 10 });
  await remove("sales", [s._id, s2._id]).expect(200);
  assert.equal((await VinylRoll.findById(r._id)).length, 30);
  assert.equal((await Customer.findById(c._id)).balanceMinor, 0);
  assert.equal(await Sale.countDocuments({ customerId: c._id }), 0);
  assert.equal(
    await DeletedRecord.countDocuments({ recordId: { $in: [s._id, s2._id] } }),
    2,
  );
  await remove("sales", [s._id, s2._id]).expect(200);
  assert.equal((await VinylRoll.findById(r._id)).length, 30);
  await request(app)
    .post("/api/sales")
    .set("Idempotency-Key", key)
    .send(body)
    .expect(409);
  const report = (
    await request(app).get(`/api/reports/sales?customerId=${c._id}`).expect(200)
  ).body.data;
  assert.equal(report.items.length, 0);
});
test("receipt allocations survive deleted invoices; released payment settles debt then becomes credit", async () => {
  const c = await customer(),
    r = await roll();
  const first = await sale(c, r, { unitPrice: 100 }),
    second = await sale(c, r, { unitPrice: 30 });
  const payment = await post("payments", {
    customerId: c._id,
    amount: 80,
    paymentMethod: "cash",
  });
  const snapshot = (await Payment.findById(payment._id)).toObject();
  await remove("sales", [first._id]).expect(200);
  assert.equal((await Customer.findById(c._id)).balanceMinor, -5000);
  const remaining = await Sale.findById(second._id);
  assert.equal(remaining.remainingBalance, 0);
  assert.equal(remaining.creditApplied, 30);
  const receipt = (
    await request(app).get(`/api/payments/${payment._id}`).expect(200)
  ).body.data;
  assert.match(receipt.allocations[0].billNumber, /حذف‌شده/);
  assert.deepEqual((await Payment.findById(payment._id)).toObject(), snapshot);
  const next = await sale(c, r, { unitPrice: 60 });
  assert.equal(next.creditApplied, 50);
  assert.equal(next.remainingBalance, 10);
  await post("payments", {
    customerId: c._id,
    amount: 10,
    paymentMethod: "cash",
  });
  assert.equal((await Customer.findById(c._id)).balanceMinor, 0);
});
test("credit-funded sale cancellation restores available credit", async () => {
  const c = await customer(),
    r = await roll();
  await post("payments", {
    customerId: c._id,
    amount: 50,
    paymentMethod: "cash",
  });
  const s = await sale(c, r, { unitPrice: 20 });
  await request(app).delete(`/api/sales/${s._id}`).expect(200);
  assert.equal((await Customer.findById(c._id)).balanceMinor, -5000);
  assert.equal((await VinylRoll.findById(r._id)).length, 30);
});
test("inventory bulk deletion is atomic and succeeds after the related sale is removed", async () => {
  const a = await roll(),
    b = await roll(),
    c = await customer(),
    s = await sale(c, b);
  await remove("vinyl", [a._id, b._id]).expect(409);
  assert.equal((await VinylRoll.findById(a._id)).archived, false);
  await remove("sales", [
    s._id,
    new database.Types.ObjectId().toString(),
  ]).expect(404);
  assert.ok(await Sale.findById(s._id));
  assert.equal((await VinylRoll.findById(b._id)).length, 29);
  await remove("sales", [s._id]).expect(200);
  await remove("vinyl", [a._id, b._id]).expect(200);
  assert.equal(
    await VinylRoll.countDocuments({
      _id: { $in: [a._id, b._id] },
      archived: true,
    }),
    2,
  );
});
test("concurrent deletion and receipt leave a consistent credit/debt ledger", async () => {
  const c = await customer(),
    r = await roll(),
    s = await sale(c, r, { unitPrice: 100 });
  await Promise.all([
    remove("sales", [s._id]).expect(200),
    post("payments", { customerId: c._id, amount: 40, paymentMethod: "cash" }),
  ]);
  assert.equal((await Customer.findById(c._id)).balanceMinor, -4000);
  assert.equal((await VinylRoll.findById(r._id)).length, 30);
});

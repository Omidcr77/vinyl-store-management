import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request, { signInTestAdmin } from "./support/auth.js";
import { randomUUID } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import { receiptData } from "../services/documentService.js";
import { statementData } from "../services/statementService.js";
import { dashboard } from "../services/reportService.js";
import { renderBill, renderStatement } from "../../shared/bill.js";
let db, app, roll;
before(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDB(db.getUri("credit_tests"));
  app = createApp();
  await signInTestAdmin(app);
  roll = (
    await request(app)
      .post("/api/vinyl")
      .send({
        vinylName: "Carpet",
        type: "Wool",
        color: "Red",
        length: 100,
        width: 3,
      })
      .expect(201)
  ).body.data;
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
const customer = async () =>
  (
    await request(app)
      .post("/api/customers")
      .send({ name: "Credit Customer", phone: "0700000000" })
      .expect(201)
  ).body.data;
const pay = (id, amount, key = randomUUID()) =>
  request(app)
    .post("/api/payments")
    .set("Idempotency-Key", key)
    .send({ customerId: id, amount, paymentMethod: "cash" });
const sell = (id, total, paidAmount = 0) =>
  request(app)
    .post("/api/sales")
    .set("Idempotency-Key", randomUUID())
    .send({
      customerId: id,
      vinylId: roll._id,
      soldLength: 1,
      pricingMethod: "linear",
      unitPrice: total,
      paidAmount,
    });
const balance = async (id) =>
  (await request(app).get(`/api/customers/${id}`).expect(200)).body.data
    .customer.balance;

test("an advance receipt locks currency before the first sale", async () => {
  const c = await customer();
  await pay(c._id, 1).expect(201);
  const settings = (await request(app).get("/api/settings").expect(200)).body
    .data;
  await request(app)
    .put("/api/settings")
    .send({ ...settings, currency: "EUR" })
    .expect(400);
  await sell(c._id, 1).expect(201);
  assert.equal(await balance(c._id), 0);
});

test("excess receipts become credit, settle later sales and preserve historical receipts", async () => {
  const c = await customer();
  await sell(c._id, 100).expect(201);
  const key = randomUUID();
  const payment = (await pay(c._id, 150, key).expect(201)).body.data;
  assert.equal(payment.balanceBefore, 100);
  assert.equal(payment.balanceAfter, -50);
  assert.equal(payment.creditAmount, 50);
  assert.equal(
    payment.allocations.reduce((n, a) => n + a.amount, 0),
    100,
  );
  assert.equal(
    (await pay(c._id, 150, key).expect(201)).body.data._id,
    payment._id,
  );
  assert.equal(await balance(c._id), -50);
  const statement = await statementData(c._id);
  assert.equal(statement.summary.totalPayments, 150);
  assert.ok(renderStatement(statement).includes("طلب مشتری"));
  assert.ok(
    renderBill({
      record: await receiptData(payment._id),
      receipt: true,
    }).includes("افزوده‌شده به طلب مشتری"),
  );
  const sale = (await sell(c._id, 30, 5).expect(201)).body.data;
  assert.equal(sale.creditApplied, 25);
  assert.equal(sale.remainingBalance, 0);
  assert.equal(sale.paidAmount, 5);
  assert.equal(await balance(c._id), -25);
  assert.ok(renderBill({ record: sale }).includes("استفاده از طلب مشتری"));
  const last = (await sell(c._id, 40).expect(201)).body.data;
  assert.equal(last.creditApplied, 25);
  assert.equal(last.remainingBalance, 15);
  assert.equal(last.paymentType, "partial");
  assert.equal(await balance(c._id), 15);
  assert.equal((await receiptData(payment._id)).balanceAfter, -50);
  await pay(c._id, 15).expect(201);
  assert.equal(await balance(c._id), 0);
  const final = await statementData(c._id);
  assert.equal(final.summary.totalPurchases, final.summary.totalPayments);
});

test("advance receipts and concurrent spending cannot consume the same credit twice", async () => {
  const c = await customer();
  const advance = (await pay(c._id, 40.25).expect(201)).body.data;
  assert.equal(advance.creditAmount, 40.25);
  assert.deepEqual(advance.allocations, []);
  await pay(c._id, 9.75).expect(201);
  assert.equal(await balance(c._id), -50);
  await request(app)
    .put(`/api/customers/${c._id}`)
    .send({ name: "Credit Updated", phone: "0700000000" })
    .expect(200);
  const sales = await Promise.all([sell(c._id, 40), sell(c._id, 40)]);
  assert.deepEqual(
    sales.map((s) => s.status),
    [201, 201],
  );
  assert.equal(
    sales.reduce((n, s) => n + s.body.data.creditApplied, 0),
    50,
  );
  assert.equal(
    sales.reduce((n, s) => n + s.body.data.remainingBalance, 0),
    30,
  );
  assert.equal(await balance(c._id), 30);
  const creditor = await customer();
  await pay(creditor._id, 100).expect(201);
  const summary = await dashboard();
  assert.equal(summary.outstandingDebt, 30);
  assert.equal(summary.customerCredit, 100);
  const credits = (
    await request(app).get("/api/customers?hasBalance=credit").expect(200)
  ).body.data.items;
  assert.equal(credits.length, 1);
  assert.equal(credits[0]._id, creditor._id);
});

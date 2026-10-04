import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import database from "../db/mysql.js";
import { TestDatabase } from "./support/database.js";
import request, { signInTestAdmin } from "./support/auth.js";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import Sale from "../models/Sale.js";
import AuditEvent from "../models/AuditEvent.js";
import { renderBill, renderStatement } from "../../shared/bill.js";
import { closePdfBrowser } from "../services/documentService.js";
let db, app;
before(async () => {
  db = await TestDatabase.create();
  await connectDB(db.getUri("multi_sales"));
  app = createApp();
  await signInTestAdmin(app);
});
after(async () => {
  await closePdfBrowser();
  await database.disconnect();
  await db.stop();
});
const post = (path, body, key = randomUUID()) =>
  request(app).post(`/api/${path}`).set("Idempotency-Key", key).send(body);
const roll = async (name, length, width = 3) =>
  (
    await post("vinyl", {
      vinylName: name,
      type: name,
      color: `${name} color`,
      length,
      width,
      sellingPrice: 20,
    }).expect(201)
  ).body.data;
const line = (r, length, price = 20, method = "linear") => ({
  vinylId: r._id,
  soldLength: length,
  unitPrice: price,
  pricingMethod: method,
});
const current = async (r) =>
  (await request(app).get(`/api/vinyl/${r._id}`).expect(200)).body.data;

test("one bill combines mixed dimensions/prices, one payment and credit; reports and receipts count it once", async () => {
  const customer = (
    await post("customers", {
      name: "Multi Customer",
      phone: "0701234567",
    }).expect(201)
  ).body.data;
  await post("payments", {
    customerId: customer._id,
    amount: 40,
    paymentMethod: "cash",
  }).expect(201);
  const a = await roll("First Carpet", 30, 4),
    b = await roll("Second Carpet", 12, 3),
    c = await roll("Third Carpet", 6, 2);
  const body = {
    customerId: customer._id,
    items: [
      { ...line(a, 5), rememberPrice: true },
      line(b, 2, 10, "area"),
      line(c, 6, 15),
    ],
    paidAmount: 70,
  };
  const key = randomUUID();
  const responses = await Promise.all([
    post("sales", body, key),
    post("sales", body, key),
  ]);
  responses.forEach((r) => assert.equal(r.status, 201, JSON.stringify(r.body)));
  const sale = responses[0].body.data;
  assert.equal(responses[1].body.data._id, sale._id);
  assert.equal(sale.items.length, 3);
  assert.equal(sale.totalAmount, 250);
  assert.equal(sale.paidAmount, 70);
  assert.equal(sale.creditApplied, 40);
  assert.equal(sale.remainingBalance, 140);
  assert.equal(sale.soldLength, 13);
  assert.equal(sale.area, 38);
  assert.equal((await current(a)).length, 25);
  assert.equal((await current(b)).length, 10);
  assert.equal((await current(c)).length, 0);
  assert.equal(
    await AuditEvent.countDocuments({
      action: "POST /api/sales",
      target: sale._id,
    }),
    1,
  );
  const report = (await request(app).get("/api/reports/sales").expect(200)).body
    .data;
  assert.equal(report.summary.count, 1);
  assert.equal(report.summary.totalSales, 250);
  assert.equal(report.summary.metersSold, 13);
  const filtered = (
    await request(app)
      .get(`/api/sales?rollNumber=${b.rollNumber}&search=Second`)
      .expect(200)
  ).body.data;
  assert.equal(filtered.total, 1);
  const csv = await request(app)
    .get("/api/exports/sales?format=csv")
    .expect(200);
  assert.match(csv.text, /First Carpet/);
  assert.match(csv.text, /Second Carpet/);
  assert.match(csv.text, /Third Carpet/);
  assert.equal(csv.text.trim().split("\r\n").length, 2);
  assert.doesNotMatch(csv.text, /undefined/);
  for (const r of [b, c]) {
    await request(app).delete(`/api/vinyl/${r._id}`).expect(400);
    await request(app)
      .put(`/api/vinyl/${r._id}`)
      .send({ ...r, length: 1, width: 8 })
      .expect(400);
  }
  const changed = await current(b);
  await request(app)
    .put(`/api/vinyl/${b._id}`)
    .send({ ...changed, vinylName: "Renamed" })
    .expect(200);
  const saved = (await request(app).get(`/api/sales/${sale._id}`).expect(200))
    .body.data;
  assert.equal(saved.items[1].vinylName, "Second Carpet");
  const bill = renderBill({ record: saved });
  assert.match(bill, /First Carpet/);
  assert.match(bill, /Second Carpet/);
  assert.match(bill, /Third Carpet/);
  assert.doesNotMatch(bill, /undefined|NaN/);
  const payment = (
    await post("payments", {
      customerId: customer._id,
      amount: 100,
      paymentMethod: "cash",
    }).expect(201)
  ).body.data;
  assert.equal(payment.allocations.length, 1);
  assert.equal(payment.allocations[0].saleId, sale._id);
  assert.equal(payment.allocations[0].amount, 100);
  const statement = (
    await request(app)
      .get(`/api/customers/${customer._id}/statement`)
      .expect(200)
  ).body.data;
  assert.equal(statement.sales.length, 1);
  assert.equal(statement.summary.totalPurchases, 250);
  assert.equal(statement.summary.totalPayments, 210);
  assert.equal(statement.summary.balance, 40);
  const html = renderStatement(statement);
  assert.match(html, /Second Carpet/);
  assert.doesNotMatch(html, /undefined|NaN/);
  await post("sales", { ...body, paidAmount: 71 }, key).expect(409);
});

test("invalid items, combined overselling and failed commits roll back every item", async () => {
  const a = await roll("Rollback A", 10),
    b = await roll("Rollback B", 10);
  const before = await Sale.countDocuments();
  for (const body of [
    { items: [], paidAmount: 0 },
    { items: [line(a, 1), line(b, 0)], paidAmount: 20 },
    { items: [line(a, 1)], ...line(b, 1), paidAmount: 20 },
  ])
    await post("sales", body).expect(400);
  await post("sales", {
    items: [line(a, 6), line(a, 5)],
    paidAmount: 220,
  }).expect(409);
  await post("sales", {
    items: [line(a, 2), line(b, 11)],
    paidAmount: 260,
  }).expect(409);
  await post("sales", {
    items: [line(a, 2), line(b, 2)],
    paidAmount: 0,
  }).expect(400);
  const original = Sale.create;
  Sale.create = async () => {
    throw Error("injected commit failure");
  };
  try {
    await post("sales", {
      items: [line(a, 2), line(b, 2)],
      paidAmount: 80,
    }).expect(500);
  } finally {
    Sale.create = original;
  }
  assert.equal((await current(a)).length, 10);
  assert.equal((await current(b)).length, 10);
  assert.equal(await Sale.countDocuments(), before);
});

test("concurrent baskets cannot oversell and do not leave partial deductions", async () => {
  const a = await roll("Race A", 10),
    b = await roll("Race B", 10);
  const body = { items: [line(a, 8), line(b, 5)], paidAmount: 260 };
  const results = await Promise.all([post("sales", body), post("sales", body)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await current(a)).length, 2);
  assert.equal((await current(b)).length, 5);
});

test("large multi-item invoice produces a real paginated A4 PDF", async () => {
  const a = await roll("Long Bill Carpet", 100);
  const sale = (
    await post("sales", {
      items: Array.from({ length: 35 }, () => line(a, 1)),
      paidAmount: 700,
    }).expect(201)
  ).body.data;
  const pdf = await request(app)
    .get(`/api/sales/${sale._id}/pdf`)
    .buffer(true)
    .parse((res, done) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    })
    .expect(200);
  assert.equal(pdf.body.subarray(0, 5).toString(), "%PDF-");
  assert.ok(
    (pdf.body.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length > 1,
  );
});

test("stock lookup excludes selected rolls before pagination and validates IDs", async () => {
  const a = await roll("Lookup basket A", 10);
  const b = await roll("Lookup basket B", 10);
  const c = await roll("Lookup basket C", 10);
  const result = await request(app)
    .get("/api/vinyl")
    .query({
      search: "Lookup basket",
      inStock: "true",
      excludeIds: `${a._id},${b._id}`,
      limit: 1,
    })
    .expect(200);
  assert.equal(result.body.data.total, 1);
  assert.equal(result.body.data.pages, 1);
  assert.equal(result.body.data.items[0]._id, c._id);
  const restored = await request(app)
    .get("/api/vinyl")
    .query({
      search: "Lookup basket",
      excludeIds: a._id,
    })
    .expect(200);
  assert.equal(restored.body.data.total, 2);
  await request(app).get("/api/vinyl?excludeIds=invalid").expect(400);
});

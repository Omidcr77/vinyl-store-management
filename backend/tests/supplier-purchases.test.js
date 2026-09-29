import { migratePriceHistory } from "../services/priceHistoryMigration.js";
import CustomerPriceHistory from "../models/CustomerPriceHistory.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request, { signInTestAdmin } from "./support/auth.js";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import { closePdfBrowser } from "../services/documentService.js";
import SupplierEntry from "../models/SupplierEntry.js";
import { createBackup, validateBackup } from "../services/backupService.js";
let db, app;
before(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDB(db.getUri("supplier_tests"));
  app = createApp();
  await signInTestAdmin(app);
});
after(async () => {
  await closePdfBrowser();
  await mongoose.disconnect();
  await db.stop();
});
const post = (path, body, key = randomUUID()) =>
  request(app).post(`/api/${path}`).set("Idempotency-Key", key).send(body);
const get = async (path) =>
  (await request(app).get(`/api/${path}`).expect(200)).body.data;
const create = async (path, body, key) =>
  (await post(path, body, key).expect(201)).body.data;
const row = {
  vinylName: "Import carpet",
  type: "Premium",
  color: "Red",
  length: 30,
  width: 4,
  costPrice: 100,
  importCost: 300,
  sellingPrice: 150,
};

test("purchases post once, import costs stay separate, cash/loans/advances and reversal reconcile", async () => {
  const supplier = await create("suppliers", { name: "Company A" });
  const body = {
    supplierId: supplier._id,
    paidAmount: 1000,
    entryDate: "2026-09-29",
    rows: [{ ...row, quantity: 2 }],
  };
  const key = randomUUID();
  const [a, b] = await Promise.all([
    create("deliveries", body, key),
    create("deliveries", body, key),
  ]);
  assert.equal(a._id, b._id);
  assert.equal(a.purchaseTotal, 6000);
  assert.equal(a.importCost, 600);
  let account = await get(`suppliers/${supplier._id}`);
  assert.equal(account.supplier.balance, 5000);
  assert.equal(account.entries.total, 2);
  const rolls = (await get("vinyl?search=Import%20carpet")).items;
  assert.equal(rolls[0].originalLength, 30);
  assert.equal(rolls[0].landedCostPerMeter, 110);
  const payment = await create(`suppliers/${supplier._id}/entries`, {
    kind: "payment",
    amount: 5500,
    details: "Pay full and advance",
  });
  assert.equal(payment.balanceAfter, -500);
  const loan = await create(`suppliers/${supplier._id}/entries`, {
    kind: "loan_received",
    amount: 200,
    details: "Borrowed cash",
  });
  assert.equal(loan.balanceAfter, -300);
  const reverseKey = randomUUID();
  const reversal = await create(
    `suppliers/${supplier._id}/entries/${loan._id}/reverse`,
    { details: "Wrong entry" },
    reverseKey,
  );
  assert.equal(reversal.balanceAfter, -500);
  assert.equal(
    (
      await create(
        `suppliers/${supplier._id}/entries/${loan._id}/reverse`,
        { details: "Wrong entry" },
        reverseKey,
      )
    )._id,
    reversal._id,
  );
  await post(`suppliers/${supplier._id}/entries/${loan._id}/reverse`, {
    details: "Again",
  }).expect(409);
  await create(`suppliers/${supplier._id}/entries`, {
    kind: "receipt",
    amount: 100,
    details: "Supplier refund",
  });
  await create(`suppliers/${supplier._id}/entries`, {
    kind: "loan_given",
    amount: 100,
    details: "Loaned cash",
  });
  account = await get(`suppliers/${supplier._id}`);
  assert.equal(account.supplier.balance, -500);
  const entries = await SupplierEntry.find({ supplierId: supplier._id });
  assert.equal(
    entries.reduce((sum, e) => sum + e.deltaMinor, 0),
    -50000,
  );
  await post(
    `suppliers/${supplier._id}/entries/${entries.find((e) => e.kind === "purchase")._id}/reverse`,
    { details: "Cannot reverse stock directly" },
  ).expect(400);
  const csv = await request(app)
    .get(`/api/suppliers/${supplier._id}/statement?format=csv`)
    .expect(200);
  assert.match(csv.text, /Company|معامله/);
  const pdf = await request(app)
    .get(`/api/suppliers/${supplier._id}/statement?format=pdf`)
    .expect(200);
  assert.match(pdf.headers["content-type"], /application\/pdf/);
});

test("single roll purchase is idempotent; failures leave no stock, ledger or changed balance", async () => {
  const supplier = await create("suppliers", { name: "Company B" });
  const key = randomUUID(),
    body = { ...row, supplierId: supplier._id, paidAmount: 200 };
  const a = await create("vinyl", body, key),
    b = await create("vinyl", body, key);
  assert.equal(a._id, b._id);
  assert.equal((await get(`suppliers/${supplier._id}`)).supplier.balance, 2800);
  await post("vinyl", { ...body, costPrice: undefined }).expect(400);
  await post("deliveries", {
    supplierId: supplier._id,
    entryDate: "2026-09-29",
    rows: [{ ...row, costPrice: undefined, quantity: 1 }],
  }).expect(400);
  await request(app)
    .put(`/api/vinyl/${a._id}`)
    .send({ ...row, supplierId: supplier._id, costPrice: 200 })
    .expect(400);
  assert.equal((await get(`suppliers/${supplier._id}`)).supplier.balance, 2800);
  const original = SupplierEntry.create;
  SupplierEntry.create = async () => {
    throw new Error("injected ledger failure");
  };
  try {
    await post("deliveries", {
      supplierId: supplier._id,
      entryDate: "2026-09-29",
      rows: [{ ...row, vinylName: "Rollback", quantity: 1 }],
    }).expect(500);
  } finally {
    SupplierEntry.create = original;
  }
  assert.equal((await get("vinyl?search=Rollback")).total, 0);
  assert.equal((await get(`suppliers/${supplier._id}`)).supplier.balance, 2800);
});

test("sale profit snapshots, per-customer previous prices, product matching and deletion history", async () => {
  const customer = await create("customers", {
    name: "Price customer",
    phone: "123",
  });
  const roll = await create("vinyl", row);
  const sell = async (price) =>
    create("sales", {
      customerId: customer._id,
      vinylId: roll._id,
      soldLength: 2,
      pricingMethod: "linear",
      unitPrice: price,
      paidAmount: 0,
    });
  const first = await sell(150);
  assert.equal(first.costAmount, 220);
  assert.equal(first.grossProfit, 80);
  assert.equal(first.remainingBalance, 300);
  const second = await sell(140);
  assert.equal(second.grossProfit, 60);
  let suggestion = await get(
    `customers/${customer._id}/price-suggestion?vinylId=${roll._id}&pricingMethod=linear`,
  );
  assert.equal(suggestion.unitPrice, 140);
  const another = await create("vinyl", { ...row, color: "Blue" });
  assert.equal(
    await get(
      `customers/${customer._id}/price-suggestion?vinylId=${another._id}&pricingMethod=linear`,
    ),
    null,
  );
  await request(app)
    .put(`/api/customers/${customer._id}/prices`)
    .send({ type: row.type, pricingMethod: "linear", unitPrice: 160 })
    .expect(200);
  assert.equal(
    (
      await get(
        `customers/${customer._id}/price-suggestion?vinylId=${roll._id}&pricingMethod=linear`,
      )
    ).unitPrice,
    160,
  );
  const history = await get(`customers/${customer._id}/price-history`);
  assert.deepEqual(
    history.items.map((h) => h.unitPrice),
    [160, 140, 150],
  );
  await request(app)
    .put(`/api/vinyl/${roll._id}`)
    .send({ ...row, length: 26, costPrice: 999 })
    .expect(400);
  assert.equal((await get(`sales/${first._id}`)).grossProfit, 80);
  await request(app).delete(`/api/sales/${second._id}`).expect(200);
  assert.equal(
    (await get(`customers/${customer._id}/price-history`)).items.find(
      (h) => h.saleId === second._id,
    ).voided,
    true,
  );
  const unknown = await create("vinyl", {
    ...row,
    costPrice: undefined,
    importCost: undefined,
  });
  const sale = await create("sales", {
    vinylId: unknown._id,
    soldLength: 1,
    pricingMethod: "linear",
    unitPrice: 150,
    paidAmount: 150,
  });
  assert.equal(sale.costKnown, false);
  assert.equal(sale.grossProfit, undefined);
  const report = await get("reports/sales");
  assert.equal(report.summary.grossProfit, 80);
  assert.equal(report.summary.uncostedSales, 1);
});

test("supplier payments serialize and backup includes validated supplier accounts and rate history", async () => {
  const supplier = await create("suppliers", { name: "Concurrent supplier" });
  await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      create(`suppliers/${supplier._id}/entries`, {
        kind: "payment",
        amount: 10,
        details: `Payment ${i}`,
      }),
    ),
  );
  assert.equal((await get(`suppliers/${supplier._id}`)).supplier.balance, -50);
  const backup = await createBackup();
  const validated = await validateBackup(backup.buffer);
  assert.ok(validated);
});

test("legacy sales migrate once into previous-price history without rewriting bills", async () => {
  const customer = await create("customers", {
    name: "Legacy rate",
    phone: "123",
  });
  const roll = await create("vinyl", row);
  const sale = await create("sales", {
    customerId: customer._id,
    vinylId: roll._id,
    soldLength: 1,
    pricingMethod: "linear",
    unitPrice: 125,
    paidAmount: 125,
  });
  await CustomerPriceHistory.deleteMany({ customerId: customer._id });
  await migratePriceHistory();
  await migratePriceHistory();
  assert.equal(
    await CustomerPriceHistory.countDocuments({ customerId: customer._id }),
    1,
  );
  assert.equal(
    (
      await get(
        `customers/${customer._id}/price-suggestion?vinylId=${roll._id}&pricingMethod=linear`,
      )
    ).unitPrice,
    125,
  );
  assert.equal((await get(`sales/${sale._id}`)).totalAmount, 125);
});

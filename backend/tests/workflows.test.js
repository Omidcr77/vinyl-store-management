import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import database from "../db/mysql.js";
import { TestDatabase } from "./support/database.js";
import request, { signInTestAdmin } from "./support/auth.js";
import ExcelJS from "exceljs";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import Sale from "../models/Sale.js";
import { createSale } from "../services/saleService.js";
let db, app, roll, customer;
const rollBody = {
  vinylName: "Turkish Oak",
  type: " Wood ",
  color: " Brown ",
  length: 30,
  width: 4,
  costPrice: 100,
  sellingPrice: 250,
};
const saleBody = (length, extra = {}) => ({
  vinylId: roll._id,
  soldLength: length,
  pricingMethod: "linear",
  unitPrice: 250,
  paidAmount: length * 250,
  ...extra,
});
const postSale = (body, key = randomUUID()) =>
  request(app).post("/api/sales").set("Idempotency-Key", key).send(body);
before(async () => {
  db = await TestDatabase.create();
  await connectDB(db.getUri("tests"));
  app = createApp();
  await signInTestAdmin(app);
});
after(async () => {
  await database.disconnect();
  await db?.stop();
});
test("complete store workflow and API integrity", async (t) => {
  await t.test(
    "create inventory and customer; allowlisted writes protect balance",
    async () => {
      const r = await request(app)
        .post("/api/vinyl")
        .send(rollBody)
        .expect(201);
      roll = r.body.data;
      assert.equal(roll.length, 30);
      assert.equal(roll.type, "Wood");
      const c = await request(app)
        .post("/api/customers")
        .send({
          name: "Ahmad",
          phone: "0700000000",
          balance: -100,
          balanceMinor: 999999,
        })
        .expect(201);
      customer = c.body.data;
      assert.equal(customer.balance, 0);
      await request(app)
        .post("/api/vinyl")
        .send({ ...rollBody, length: 0 })
        .expect(400);
      await request(app).get("/api/vinyl/not-an-id").expect(400);
      await request(app)
        .get("/api/customers/000000000000000000000000")
        .expect(404);
    },
  );
  await t.test(
    "partial sales: 30 → 22 → 12, reject oversell and roll back",
    async () => {
      const first = await postSale(saleBody(8)).expect(201);
      assert.equal(first.body.data.area, 32);
      assert.match(first.body.data.billNumber, /^INV-\d{4}-000001$/);
      assert.equal(
        (await request(app).get(`/api/vinyl/${roll._id}`)).body.data.length,
        22,
      );
      await postSale(saleBody(10)).expect(201);
      await postSale(saleBody(20)).expect(409);
      assert.equal(
        (await request(app).get(`/api/vinyl/${roll._id}`)).body.data.length,
        12,
      );
      assert.equal(await Sale.countDocuments(), 2);
      await postSale(
        saleBody(1, { customerId: "000000000000000000000000" }),
      ).expect(404);
      assert.equal(
        (await request(app).get(`/api/vinyl/${roll._id}`)).body.data.length,
        12,
      );
      await request(app).delete(`/api/vinyl/${roll._id}`).expect(400);
      await request(app)
        .put(`/api/vinyl/${roll._id}`)
        .send({ ...rollBody, length: 20 })
        .expect(400);
    },
  );
  await t.test(
    "5000 sale minus 2000 initial and 1000 receipt leaves 2000 debt",
    async () => {
      const sale = await postSale(
        saleBody(5, {
          customerId: customer._id,
          unitPrice: 1000,
          paidAmount: 2000,
        }),
      ).expect(201);
      assert.equal(sale.body.data.totalAmount, 5000);
      assert.equal(sale.body.data.remainingBalance, 3000);
      assert.equal(
        (await request(app).get(`/api/customers/${customer._id}`)).body.data
          .customer.balance,
        3000,
      );
      const key = randomUUID(),
        body = {
          customerId: customer._id,
          amount: 1000,
          paymentMethod: "cash",
        };
      await request(app)
        .post("/api/payments")
        .set("Idempotency-Key", key)
        .send(body)
        .expect(201);
      await request(app)
        .post("/api/payments")
        .set("Idempotency-Key", key)
        .send(body)
        .expect(201);
      const detail = (await request(app).get(`/api/customers/${customer._id}`))
        .body.data;
      assert.equal(detail.customer.balance, 2000);
      assert.equal(detail.summary.totalPayments, 3000);
      assert.equal(detail.receipts.total, 1);
      assert.equal(detail.purchases.items[0].remainingBalance, 2000);
      await request(app)
        .post("/api/payments")
        .set("Idempotency-Key", randomUUID())
        .send({ ...body, amount: 100000001 })
        .expect(400);
      await request(app)
        .post("/api/payments")
        .set("Idempotency-Key", randomUUID())
        .send({ ...body, amount: -1 })
        .expect(400);
      await request(app)
        .post("/api/payments")
        .set("Idempotency-Key", key)
        .send({ ...body, amount: 1 })
        .expect(409);
      await postSale(saleBody(1, { paidAmount: 0 })).expect(400);
    },
  );
  await t.test(
    "concurrent sale replays commit only once, overselling cannot happen",
    async () => {
      const key = randomUUID(),
        body = saleBody(2);
      const results = await Promise.all([
        postSale(body, key),
        postSale(body, key),
      ]);
      assert.deepEqual(
        results.map((r) => r.status),
        [201, 201],
      );
      assert.equal(results[0].body.data._id, results[1].body.data._id);
      await postSale(saleBody(1), key).expect(409);
      const attempts = await Promise.all([
        postSale(saleBody(4)),
        postSale(saleBody(4)),
      ]);
      assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        (await request(app).get(`/api/vinyl/${roll._id}`)).body.data.length,
        1,
      );
      const last = await postSale(saleBody(1)).expect(201);
      const exhausted = (await request(app).get(`/api/vinyl/${roll._id}`)).body
        .data;
      assert.equal(exhausted.length, 0);
      assert.equal(exhausted.status, "sold");
      await request(app)
        .put(`/api/vinyl/${roll._id}`)
        .send({ ...rollBody, length: 0, vinylName: "New display name" })
        .expect(200);
      assert.equal(
        (await request(app).get(`/api/sales/${last.body.data._id}`)).body.data
          .vinylName,
        "Turkish Oak",
      );
    },
  );
  await t.test(
    "aggregation totals, search, filters, pagination, reports and export",
    async () => {
      for (let i = 0; i < 16; i++)
        await request(app)
          .post("/api/vinyl")
          .send({
            ...rollBody,
            vinylName: `Gray Marble ${i}`,
            length: 4,
            type: "Stone",
          })
          .expect(201);
      const filtered = await request(app)
        .get(
          "/api/vinyl?search=Gray&type=Stone&status=low-stock&minLength=3&maxLength=5&limit=5&page=2&sort=rollNumber&order=asc",
        )
        .expect(200);
      assert.equal(filtered.body.data.items.length, 5);
      assert.equal(filtered.body.data.total, 16);
      assert.equal(filtered.body.data.pages, 4);
      const dashboard = (
        await request(app).get("/api/dashboard/summary").expect(200)
      ).body.data;
      assert.equal(dashboard.availableRolls, 16);
      assert.equal(dashboard.remainingMeters, 64);
      assert.equal(dashboard.remainingArea, 256);
      assert.equal(dashboard.outstandingDebt, 2000);
      const sales = (await request(app).get("/api/reports/sales").expect(200))
        .body.data;
      assert.equal(sales.summary.totalSales, 11250);
      assert.equal(sales.summary.outstanding, 2000);
      assert.equal(sales.summary.totalPaid, 9250);
      assert.equal(sales.summary.metersSold, 30);
      assert.equal(dashboard.totalRevenue, sales.summary.totalSales);
      const debt = (
        await request(app)
          .get("/api/reports/customers?hasBalance=true")
          .expect(200)
      ).body.data;
      assert.equal(debt.items[0].balance, 2000);
      assert.equal(debt.items[0].totalPaid, 3000);
      assert.equal(
        (
          await request(app).get(
            `/api/reports/sales?customerId=${customer._id}`,
          )
        ).body.data.summary.totalSales,
        5000,
      );
      await request(app)
        .get("/api/sales?search=INV-&paymentType=partial")
        .expect(200);
      assert.equal(
        (await request(app).get("/api/customers?search=0700&hasBalance=true"))
          .body.data.total,
        1,
      );
      await request(app).get("/api/vinyl?page=-1").expect(400);
      await request(app).get("/api/sales?from=garbage").expect(400);
      const csv = await request(app)
        .get("/api/exports/vinyl?format=csv&search=Gray")
        .expect(200);
      assert.equal(csv.text.trim().split("\r\n").length, 17);
      const xlsx = await request(app)
        .get("/api/exports/sales?format=xlsx")
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(xlsx.body);
      assert.equal(book.worksheets[0].rowCount, 7);
    },
  );
  await t.test(
    "settings update statuses, preserve currency; archive and stable numbering",
    async () => {
      const settings = (await request(app).get("/api/settings")).body.data;
      await request(app)
        .put("/api/settings")
        .send({ ...settings, currency: "AFN" })
        .expect(400);
      await request(app)
        .put("/api/settings")
        .send({ ...settings, lowStockThreshold: 3 })
        .expect(200);
      assert.equal(
        (await request(app).get("/api/vinyl?status=low-stock")).body.data.total,
        0,
      );
      const target = (await request(app).get("/api/vinyl?search=Gray")).body
        .data.items[0];
      await request(app).delete(`/api/vinyl/${target._id}`).expect(200);
      await request(app).get(`/api/vinyl/${target._id}`).expect(404);
      const next = (await request(app).post("/api/vinyl").send(rollBody)).body
        .data;
      assert.equal(next.rollNumber, 18);
      await request(app)
        .delete("/api/sales/000000000000000000000000")
        .expect(404);
      await request(app)
        .post("/api/vinyl")
        .set("Origin", "https://untrusted.example")
        .send(rollBody)
        .expect(403);
    },
  );
  await t.test(
    "area pricing and decimal arithmetic are exact at the money boundary",
    async () => {
      const r = (
        await request(app)
          .post("/api/vinyl")
          .send({ ...rollBody, length: 0.3, width: 4 })
      ).body.data;
      const s = await postSale({
        vinylId: r._id,
        soldLength: 0.1,
        pricingMethod: "area",
        unitPrice: 0.25,
        paidAmount: 0.1,
      }).expect(201);
      assert.equal(s.body.data.totalAmount, 0.1);
      assert.equal(s.body.data.area, 0.4);
      assert.equal(
        (await request(app).get(`/api/vinyl/${r._id}`)).body.data.length,
        0.2,
      );
      await postSale({
        vinylId: r._id,
        soldLength: 0.2,
        pricingMethod: "area",
        unitPrice: 0.25,
        paidAmount: 0.2,
      }).expect(201);
      assert.equal(
        (await request(app).get(`/api/vinyl/${r._id}`)).body.data.length,
        0,
      );
    },
  );
  await t.test(
    "failure after stock and debt writes rolls everything back",
    async () => {
      const r = (await request(app).post("/api/vinyl").send(rollBody)).body
        .data;
      const before = (await request(app).get(`/api/customers/${customer._id}`))
        .body.data.customer.balance;
      const original = Sale.create;
      Sale.create = async () => {
        throw new Error("Simulated invoice storage failure");
      };
      try {
        await assert.rejects(
          createSale(
            {
              vinylId: r._id,
              customerId: customer._id,
              soldLength: 3,
              pricingMethod: "linear",
              unitPrice: 100,
              paidAmount: 0,
            },
            randomUUID(),
          ),
          /Simulated/,
        );
      } finally {
        Sale.create = original;
      }
      assert.equal(
        (await request(app).get(`/api/vinyl/${r._id}`)).body.data.length,
        30,
      );
      assert.equal(
        (await request(app).get(`/api/customers/${customer._id}`)).body.data
          .customer.balance,
        before,
      );
    },
  );
  await t.test(
    "concurrent receipts preserve excess as credit; unsafe input and date filters rejected",
    async () => {
      const body = {
        customerId: customer._id,
        amount: 1500,
        paymentMethod: "bank",
      };
      const responses = await Promise.all([
        request(app)
          .post("/api/payments")
          .set("Idempotency-Key", randomUUID())
          .send(body),
        request(app)
          .post("/api/payments")
          .set("Idempotency-Key", randomUUID())
          .send(body),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 201]);
      assert.equal(
        (await request(app).get(`/api/customers/${customer._id}`)).body.data
          .customer.balance,
        -1000,
      );
      await request(app).get("/api/reports/sales?from=2026-02-31").expect(400);
      await request(app)
        .post("/api/customers")
        .send({
          name: '=HYPERLINK("evil")',
          phone: "0100",
          img: "javascript:alert(1)",
        })
        .expect(400);
      await request(app)
        .post("/api/customers")
        .send({ name: '=HYPERLINK("evil")', phone: "0100" })
        .expect(201);
      const exported = await request(app).get(
        "/api/exports/customers?format=csv",
      );
      assert.ok(exported.text.includes("'=HYPERLINK"));
    },
  );
  await t.test(
    "concurrent retries replay even when all stock or debt is consumed",
    async () => {
      const r = (
        await request(app)
          .post("/api/vinyl")
          .send({ ...rollBody, length: 1 })
      ).body.data;
      const saleKey = randomUUID();
      const body = {
        vinylId: r._id,
        soldLength: 1,
        pricingMethod: "linear",
        unitPrice: 100,
        paidAmount: 100,
      };
      const sales = await Promise.all([
        postSale(body, saleKey),
        postSale(body, saleKey),
      ]);
      assert.deepEqual(
        sales.map((s) => s.status),
        [201, 201],
      );
      assert.equal(sales[0].body.data._id, sales[1].body.data._id);
      const paymentKey = randomUUID();
      const payment = {
        customerId: customer._id,
        amount: 500,
        paymentMethod: "cash",
      };
      const payments = await Promise.all([
        request(app)
          .post("/api/payments")
          .set("Idempotency-Key", paymentKey)
          .send(payment),
        request(app)
          .post("/api/payments")
          .set("Idempotency-Key", paymentKey)
          .send(payment),
      ]);
      assert.deepEqual(
        payments.map((p) => p.status),
        [201, 201],
      );
      assert.equal(payments[0].body.data._id, payments[1].body.data._id);
      assert.equal(
        (await request(app).get(`/api/customers/${customer._id}`)).body.data
          .customer.balance,
        -1500,
      );
    },
  );
});

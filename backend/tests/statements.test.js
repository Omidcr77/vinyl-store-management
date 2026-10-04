import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import database from "../db/mysql.js";
import request, { signInTestAdmin } from "./support/auth.js";
import { TestDatabase } from "./support/database.js";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import { closePdfBrowser } from "../services/documentService.js";
import { renderStatement } from "../../shared/bill.js";
import { dateText } from "../../shared/calendar.js";
let db, app;
before(async () => {
  db = await TestDatabase.create();
  await connectDB(db.getUri("statement_tests"));
  app = createApp();
  await signInTestAdmin(app);
});
after(async () => {
  await closePdfBrowser();
  await database.disconnect();
  await db?.stop();
});
test("statements contain all purchases, count payments once and paginate portrait PDFs", async () => {
  const customer = (
    await request(app)
      .post("/api/customers")
      .send({ name: "احمد <script>bad()</script>", phone: "0701234567" })
      .expect(201)
  ).body.data;
  const empty = (
    await request(app)
      .get(`/api/customers/${customer._id}/statement`)
      .expect(200)
  ).body.data;
  assert.equal(empty.summary.balance, 0);
  assert.equal(empty.sales.length, 0);
  assert.ok(renderStatement(empty).includes("هنوز خریدی ثبت نشده است."));
  const roll = (
    await request(app)
      .post("/api/vinyl")
      .send({
        vinylName: "قالین",
        type: "سرخ",
        color: "سرخ",
        length: 100,
        width: 3,
      })
      .expect(201)
  ).body.data;
  for (let i = 0; i < 18; i++)
    await request(app)
      .post("/api/sales")
      .set("Idempotency-Key", `statement-sale-${i}`)
      .send({
        vinylId: roll._id,
        customerId: customer._id,
        soldLength: 1,
        pricingMethod: "linear",
        unitPrice: 10,
        paidAmount: 2,
      })
      .expect(201);
  await request(app)
    .post("/api/payments")
    .set("Idempotency-Key", "statement-payment")
    .send({ customerId: customer._id, amount: 20, paymentMethod: "cash" })
    .expect(201);
  const result = (
    await request(app)
      .get(`/api/customers/${customer._id}/statement`)
      .expect(200)
  ).body.data;
  assert.equal(result.sales.length, 18);
  assert.equal(result.payments.length, 1);
  assert.deepEqual(result.summary, {
    totalPurchases: 180,
    initialPaid: 36,
    receiptPaid: 20,
    totalPayments: 56,
    balance: 124,
  });
  const html = renderStatement(result);
  assert.ok(html.includes("124.00 USD"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("table-scroll"));
  const pdf = await request(app)
    .get(`/api/customers/${customer._id}/statement/pdf`)
    .buffer(true)
    .parse((res, cb) => {
      const parts = [];
      res.on("data", (d) => parts.push(d));
      res.on("end", () => cb(null, Buffer.concat(parts)));
    })
    .expect(200)
    .expect("Content-Type", /application\/pdf/);
  const text = pdf.body.toString("latin1");
  assert.ok(
    (text.match(/\/Type\s*\/Page\b/g) || []).length > 1,
    "Full history spans multiple pages",
  );
  const box = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
  assert.ok(
    box &&
      Math.abs(Number(box[1]) - 595.28) < 2 &&
      Math.abs(Number(box[2]) - 841.89) < 2,
  );
  await request(app).get("/api/customers/invalid/statement").expect(400);
});

test("calendar preference persists, validates and changes exports without rewriting dates", async () => {
  const settings = (await request(app).get("/api/settings").expect(200)).body
    .data;
  const sales = (await request(app).get("/api/sales").expect(200)).body.data
    .items;
  await request(app)
    .put("/api/settings")
    .send({ ...settings, calendar: "persian" })
    .expect(200);
  const csv = await request(app)
    .get("/api/exports/sales?format=csv")
    .expect(200);
  assert.ok(csv.text.includes(dateText(sales[0].soldDate, "persian")));
  const { calendar, ...legacy } = settings;
  await request(app).put("/api/settings").send(legacy).expect(200);
  assert.equal(
    (await request(app).get("/api/settings")).body.data.calendar,
    "persian",
  );
  await request(app)
    .put("/api/settings")
    .send({ ...settings, calendar: "invalid" })
    .expect(400);
  const after = (await request(app).get("/api/sales").expect(200)).body.data
    .items;
  assert.deepEqual(
    after.map((s) => s.soldDate),
    sales.map((s) => s.soldDate),
  );
  await request(app)
    .put("/api/settings")
    .send({ ...settings, calendar: "gregory" })
    .expect(200);
});

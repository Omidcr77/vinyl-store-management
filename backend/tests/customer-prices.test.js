import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request, { signInTestAdmin } from "./support/auth.js";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import CustomerPrice from "../models/CustomerPrice.js";
import Sale from "../models/Sale.js";
import Customer from "../models/Customer.js";
import Payment from "../models/Payment.js";
import Settings from "../models/Settings.js";
import { createSale } from "../services/saleService.js";
let db, app, first, second, roll;
test("localization preserves existing MongoDB collection names and references", () => {
  assert.equal(Customer.collection.name, "customers");
  assert.equal(Payment.collection.name, "payments");
  assert.equal(Settings.collection.name, "settings");
  assert.equal(Sale.collection.name, "sales");
  assert.equal(CustomerPrice.schema.path("customerId").options.ref, "Customer");
  assert.equal(Sale.schema.path("customerId").options.ref, "Customer");
});
before(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDB(db.getUri("customer_prices"));
  app = createApp();
  await signInTestAdmin(app);
  first = (
    await request(app)
      .post("/api/customers")
      .send({ name: "احمد", phone: "0700000000" })
  ).body.data;
  second = (
    await request(app)
      .post("/api/customers")
      .send({ name: "مریم", phone: "0710000000" })
  ).body.data;
  roll = (
    await request(app).post("/api/vinyl").send({
      vinylName: "بلوط ترکی",
      type: "چوبی",
      color: "قهوه‌ای",
      length: 30,
      width: 4,
      sellingPrice: 250,
    })
  ).body.data;
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
const rates = (customer) => `/api/customers/${customer._id}/prices`;
const quote = (extra) => ({
  customerId: first._id,
  vinylId: roll._id,
  soldLength: 2,
  pricingMethod: "linear",
  unitPrice: 180,
  paidAmount: 100,
  ...extra,
});
test("customer/type/unit rates remain independent and preserve invoice snapshots", async () => {
  await request(app)
    .put(rates(first))
    .send({ type: " چوبی ", pricingMethod: "linear", unitPrice: 180 })
    .expect(200);
  await request(app)
    .put(rates(first))
    .send({ type: "چوبی", pricingMethod: "area", unitPrice: 60 })
    .expect(200);
  await request(app)
    .put(rates(second))
    .send({ type: "چوبی", pricingMethod: "linear", unitPrice: 220 })
    .expect(200);
  assert.equal((await request(app).get(rates(first))).body.data.total, 2);
  assert.equal(
    (await request(app).get(rates(second))).body.data.items[0].unitPrice,
    220,
  );
  const filter = new URLSearchParams({ type: "چوبی", pricingMethod: "area" });
  assert.equal(
    (await request(app).get(`${rates(first)}?${filter}`)).body.data.items[0]
      .unitPrice,
    60,
  );
  assert.equal(
    (await request(app).get(`${rates(first)}?type=Stone`)).body.data.total,
    0,
  );
  const key = randomUUID();
  const sale = (
    await request(app)
      .post("/api/sales")
      .set("Idempotency-Key", key)
      .send(quote({ unitPrice: 175, rememberPrice: true }))
      .expect(201)
  ).body.data;
  assert.equal(sale.totalAmount, 350);
  assert.equal(sale.remainingBalance, 250);
  const linearFilter = new URLSearchParams({
    type: "چوبی",
    pricingMethod: "linear",
  });
  const saved = (await request(app).get(`${rates(first)}?${linearFilter}`)).body
    .data.items[0];
  assert.equal(saved.unitPrice, 175);
  await request(app)
    .put(rates(first))
    .send({ type: "چوبی", pricingMethod: "linear", unitPrice: 190 })
    .expect(200);
  await request(app)
    .post("/api/sales")
    .set("Idempotency-Key", key)
    .send(quote({ unitPrice: 175, rememberPrice: true }))
    .expect(201);
  assert.equal(
    (await request(app).get(`${rates(first)}?${linearFilter}`)).body.data
      .items[0].unitPrice,
    190,
  );
  assert.equal(
    (await request(app).get(`/api/sales/${sale._id}`)).body.data.pricePerMeter,
    175,
  );
  assert.equal(
    (await request(app).get(`/api/vinyl/${roll._id}`)).body.data.sellingPrice,
    250,
  );
  assert.equal(
    (await request(app).get(rates(second))).body.data.items[0].unitPrice,
    220,
  );
  await request(app)
    .delete(`${rates(second)}/${saved._id}`)
    .expect(404);
  await request(app)
    .delete(`${rates(first)}/${saved._id}`)
    .expect(200);
  assert.equal(
    (await request(app).get(`${rates(first)}?${linearFilter}`)).body.data.total,
    0,
  );
  assert.equal(
    (await request(app).get(`/api/sales/${sale._id}`)).body.data.totalAmount,
    350,
  );
});
test("manual prices, area rates, validation and failed sales preserve pricing integrity", async () => {
  await request(app)
    .post("/api/sales")
    .set("Idempotency-Key", randomUUID())
    .send(
      quote({
        customerId: second._id,
        unitPrice: 200,
        paidAmount: 400,
        rememberPrice: false,
      }),
    )
    .expect(201);
  assert.equal(
    (await request(app).get(rates(second))).body.data.items[0].unitPrice,
    220,
  );
  const areaSale = (
    await request(app)
      .post("/api/sales")
      .set("Idempotency-Key", randomUUID())
      .send(
        quote({
          pricingMethod: "area",
          unitPrice: 60,
          paidAmount: 480,
          rememberPrice: true,
        }),
      )
      .expect(201)
  ).body.data;
  assert.equal(areaSale.totalAmount, 480);
  assert.equal(areaSale.pricePerSquareMeter, 60);
  await request(app)
    .put(rates(first))
    .send({ type: "چوبی", pricingMethod: "linear", unitPrice: -1 })
    .expect(400);
  await request(app).get("/api/customers/bad-id/prices").expect(400);
  await request(app)
    .post("/api/sales")
    .set("Idempotency-Key", randomUUID())
    .send(
      quote({ customerId: undefined, rememberPrice: true, paidAmount: 360 }),
    )
    .expect(400);
  await request(app)
    .post("/api/sales")
    .set("Idempotency-Key", randomUUID())
    .send(quote({ soldLength: 1000, rememberPrice: true, unitPrice: 99 }))
    .expect(409);
  assert.equal((await request(app).get(rates(first))).body.data.total, 1);
  const beforeLength = (await request(app).get(`/api/vinyl/${roll._id}`)).body
    .data.length;
  const beforeBalance = (await request(app).get(`/api/customers/${first._id}`))
    .body.data.customer.balance;
  const beforeCount = await Sale.countDocuments();
  const original = CustomerPrice.findOneAndUpdate;
  CustomerPrice.findOneAndUpdate = async () => {
    throw new Error("Simulated price storage failure");
  };
  try {
    await assert.rejects(
      createSale(quote({ rememberPrice: true }), randomUUID()),
      /Simulated price storage failure/,
    );
  } finally {
    CustomerPrice.findOneAndUpdate = original;
  }
  assert.equal(
    (await request(app).get(`/api/vinyl/${roll._id}`)).body.data.length,
    beforeLength,
  );
  assert.equal(
    (await request(app).get(`/api/customers/${first._id}`)).body.data.customer
      .balance,
    beforeBalance,
  );
  assert.equal(await Sale.countDocuments(), beforeCount);
});
test("Dari validation messages and exported headings are localized", async () => {
  const invalid = await request(app).post("/api/vinyl").send({}).expect(400);
  assert.match(invalid.body.error.message, /نام وینیل/);
  assert.doesNotMatch(invalid.body.error.message, /expected|Invalid input/);
  const csv = await request(app)
    .get("/api/exports/sales?format=csv")
    .expect(200);
  assert.match(csv.text, /شمارهٔ بل/);
  assert.match(csv.text, /نرخ فی متر طولی/);
});

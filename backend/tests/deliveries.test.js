import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request, { signInTestAdmin } from "./support/auth.js";
import ExcelJS from "exceljs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import Delivery from "../models/Delivery.js";
import VinylRoll from "../models/VinylRoll.js";
import Counter from "../models/Counter.js";
import { createDelivery } from "../services/deliveryService.js";
import { deliveryInput } from "../utils/validation.js";
let db, app;
before(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDB(db.getUri("deliveries"));
  app = createApp();
  await signInTestAdmin(app);
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
const row = {
  vinylName: "Carpet",
  type: "Wool",
  color: "Red",
  width: 3,
  length: 30,
  quantity: 150,
  costPrice: 12.5,
  sellingPrice: 20,
};
const body = {
  supplier: "Truck supplier",
  reference: "TRUCK-1",
  entryDate: "2026-09-28",
  rows: [
    row,
    {
      vinylName: "Vinyl",
      type: "Wood",
      color: "Brown",
      width: 4,
      lengths: [28, 25.5, 32],
    },
  ],
};
const save = (data, key) =>
  request(app).post("/api/deliveries").set("Idempotency-Key", key).send(data);
test("one delivery expands quantities and mixed lengths into independent rolls; retries cannot duplicate stock", async () => {
  const [a, b] = await Promise.all([
    save(body, "delivery-retry"),
    save(body, "delivery-retry"),
  ]);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(a.body.data._id, b.body.data._id);
  assert.equal(a.body.data.rollCount, 153);
  const rolls = await VinylRoll.find().sort({ rollNumber: 1 }).lean();
  assert.equal(rolls.length, 153);
  assert.equal(rolls[0].rollNumber, 1);
  assert.equal(rolls.at(-1).rollNumber, 153);
  assert.deepEqual(
    rolls.slice(150).map((r) => r.length),
    [28, 25.5, 32],
  );
  assert.equal(rolls[0].supplier, body.supplier);
  assert.equal(rolls[0].deliveryReference, body.reference);
  assert.equal(rolls[0].costPrice, 12.5);
  await request(app)
    .post("/api/sales")
    .set("Idempotency-Key", "delivery-cut")
    .send({
      vinylId: String(rolls[0]._id),
      soldLength: 2,
      pricingMethod: "linear",
      unitPrice: 20,
      paidAmount: 40,
    })
    .expect(201);
  assert.equal((await VinylRoll.findById(rolls[0]._id)).length, 28);
  assert.equal((await VinylRoll.findById(rolls[1]._id)).length, 30);
  await save({ ...body, reference: "different" }, "delivery-retry").expect(409);
  assert.equal(await Delivery.countDocuments(), 1);
});
test("invalid batch and failure after sequence reservation leave no partial stock or delivery", async () => {
  const beforeCount = await VinylRoll.countDocuments(),
    beforeSequence = (await Counter.findById("roll")).value;
  await save(
    { ...body, rows: [row, { ...row, length: -1 }] },
    "delivery-invalid",
  ).expect(400);
  await save(
    { ...body, rows: [{ ...row, quantity: 1001 }] },
    "delivery-too-many",
  ).expect(400);
  await save(
    { ...body, rows: [{ ...row, lengths: [20] }] },
    "delivery-ambiguous",
  ).expect(400);
  const original = VinylRoll.insertMany;
  VinylRoll.insertMany = async () => {
    throw new Error("Simulated storage failure");
  };
  try {
    await assert.rejects(
      createDelivery(deliveryInput.parse(body), "delivery-rollback"),
      /Simulated/,
    );
  } finally {
    VinylRoll.insertMany = original;
  }
  assert.equal(await VinylRoll.countDocuments(), beforeCount);
  assert.equal((await Counter.findById("roll")).value, beforeSequence);
  assert.equal(await Delivery.countDocuments(), 1);
});
test("Excel imports are preview-only, preserve rows, reject formulas and ambiguous lengths", async () => {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Delivery");
  sheet.addRow(["vinylName", "type", "color", "width", "lengths", "quantity"]);
  sheet.addRow(["Oak", "Wood", "Gray", 4, "30, 28, 25"]);
  const send = async () =>
    request(app)
      .post("/api/deliveries/import")
      .attach("file", Buffer.from(await book.xlsx.writeBuffer()), "truck.xlsx");
  const count = await VinylRoll.countDocuments(),
    result = await send();
  assert.equal(result.status, 200);
  assert.equal(result.body.data.rows[0].lengths, "30, 28, 25");
  assert.equal(await VinylRoll.countDocuments(), count);
  sheet.getCell("F2").value = 20;
  assert.equal((await send()).status, 400);
  sheet.getCell("F2").value = { formula: "10+10", result: 20 };
  assert.equal((await send()).status, 400);
  await request(app)
    .post("/api/deliveries/import")
    .attach("file", Buffer.from("bad"), "truck.xlsx")
    .expect(400);
  await request(app)
    .get("/api/deliveries/template")
    .expect(200)
    .expect("Content-Disposition", /delivery-template.xlsx/);
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import database from "../db/mysql.js";
import { TestDatabase } from "./support/database.js";
import request, { signInTestAdmin } from "./support/auth.js";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import Customer from "../models/Customer.js";
import CustomerPrice from "../models/CustomerPrice.js";
import Sale from "../models/Sale.js";
import User from "../models/User.js";
import AuditEvent from "../models/AuditEvent.js";
let db, app;
before(async () => {
  db = await TestDatabase.create();
  await connectDB(db.getUri("customer_delete_tests"));
  app = createApp();
  await signInTestAdmin(app);
});
after(async () => {
  await database.disconnect();
  await db?.stop();
});
const customer = async () =>
  (
    await request(app)
      .post("/api/customers")
      .send({ name: "Delete test", phone: "0701234567" })
      .expect(201)
  ).body.data;
const roll = async () =>
  (
    await request(app)
      .post("/api/vinyl")
      .send({
        vinylName: "Test",
        type: "Carpet",
        color: "Red",
        length: 30,
        width: 4,
      })
      .expect(201)
  ).body.data;
test("customers leave active lists while their accounts and audit remain; staff cannot delete", async () => {
  const c = await customer();
  await request(app)
    .put(`/api/customers/${c._id}/prices`)
    .send({ type: "Carpet", pricingMethod: "linear", unitPrice: 10 })
    .expect(200);
  await User.updateOne({ username: "testadmin" }, { $set: { role: "staff" } });
  await request(app).delete(`/api/customers/${c._id}`).expect(403);
  await User.updateOne({ username: "testadmin" }, { $set: { role: "admin" } });
  await request(app).delete(`/api/customers/${c._id}`).expect(200);
  assert.equal((await Customer.findById(c._id)).archived, true);
  assert.equal(await CustomerPrice.countDocuments({ customerId: c._id }), 1);
  assert.ok(
    await AuditEvent.exists({ action: "customer.delete", target: c._id }),
  );
  assert.ok(
    !(await request(app).get("/api/customers")).body.data.items.some(
      (row) => row._id === c._id,
    ),
  );
  assert.ok(
    (
      await request(app).get("/api/customers?archived=true")
    ).body.data.items.some((row) => row._id === c._id),
  );
  await request(app).delete(`/api/customers/${c._id}`).expect(200);
});
test("deleting customers preserves sales, receipts and balances; new sales cannot use them", async () => {
  const c = await customer(),
    r = await roll();
  const body = {
    customerId: c._id,
    vinylId: r._id,
    soldLength: 1,
    pricingMethod: "linear",
    unitPrice: 10,
    paidAmount: 0,
  };
  await request(app)
    .post("/api/sales")
    .set("Idempotency-Key", "delete-sale")
    .send(body)
    .expect(201);
  await request(app)
    .post("/api/payments")
    .set("Idempotency-Key", "delete-receipt")
    .send({ customerId: c._id, amount: 2, paymentMethod: "cash" })
    .expect(201);
  await request(app).delete(`/api/customers/${c._id}`).expect(200);
  assert.equal((await Customer.findById(c._id)).balanceMinor, 800);
  const account = (
    await request(app).get(`/api/customers/${c._id}`).expect(200)
  ).body.data;
  assert.equal(account.purchases.total, 1);
  assert.equal(account.receipts.total, 1);
  await request(app)
    .post("/api/sales")
    .set("Idempotency-Key", "archived-sale")
    .send(body)
    .expect(404);
});
test("concurrent sale and customer deletion retain a valid account", async () => {
  const c = await customer(),
    r = await roll();
  const [sale, deletion] = await Promise.all([
    request(app).post("/api/sales").set("Idempotency-Key", "delete-race").send({
      customerId: c._id,
      vinylId: r._id,
      soldLength: 1,
      pricingMethod: "linear",
      unitPrice: 10,
      paidAmount: 10,
    }),
    request(app).delete(`/api/customers/${c._id}`),
  ]);
  assert.equal(deletion.status, 200);
  assert.ok([201, 404].includes(sale.status));
  assert.equal((await Customer.findById(c._id)).archived, true);
  assert.equal(
    await Sale.countDocuments({ customerId: c._id }),
    sale.status === 201 ? 1 : 0,
  );
});

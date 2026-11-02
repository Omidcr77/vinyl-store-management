import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request, { signInTestAdmin } from "./support/auth.js";
import anonymous from "supertest";
import database from "../db/mysql.js";
import { TestDatabase } from "./support/database.js";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import AuditEvent from "../models/AuditEvent.js";
let db, app;
before(async () => {
  db = await TestDatabase.create();
  await connectDB(db.getUri());
  app = createApp();
  await signInTestAdmin(app);
});
after(async () => {
  await database.disconnect();
  await db?.stop();
});
test("self profile updates only the display name, records the actor and preserves account authority", async () => {
  const before = await User.findOne({ username: "testadmin" })
    .select("+passwordHash")
    .lean();
  await anonymous(app)
    .put("/api/auth/profile")
    .send({ name: "Fake" })
    .expect(401);
  await request(app)
    .put("/api/auth/profile")
    .send({ name: "New name", role: "staff" })
    .expect(400);
  await request(app)
    .put("/api/auth/profile")
    .send({ name: "New name", username: "other" })
    .expect(400);
  await request(app).put("/api/auth/profile").send({ name: "  " }).expect(400);
  const result = (
    await request(app)
      .put("/api/auth/profile")
      .send({ name: "فرید احمدی" })
      .expect(200)
  ).body.data;
  assert.equal(result.name, "فرید احمدی");
  assert.equal(result.passwordHash, undefined);
  const after = await User.findById(before._id).select("+passwordHash").lean();
  for (const key of [
    "username",
    "role",
    "passwordHash",
    "active",
    "authVersion",
  ])
    assert.equal(after[key], before[key]);
  const session = (await request(app).get("/api/auth/session").expect(200)).body
    .data;
  assert.equal(session.user.name, "فرید احمدی");
  const event = await AuditEvent.findOne({ action: "auth.profile" });
  assert.equal(event.actorUsername, "testadmin");
  assert.equal(event.actorName, "Test Admin");
  assert.equal(String(after.updatedBy), String(before._id));
});

test("dashboard counts all low-stock rolls independently of the five-record preview", async () => {
  for (let i = 0; i < 6; i++)
    await request(app)
      .post("/api/vinyl")
      .send({
        vinylName: `Low stock ${i}`,
        type: "Afghan",
        color: "Red",
        length: 1,
        width: 4,
      })
      .expect(201);
  const dashboard = (
    await request(app).get("/api/dashboard/summary").expect(200)
  ).body.data;
  assert.equal(dashboard.lowStock.length, 5);
  assert.equal(dashboard.lowStockCount, 6);
});

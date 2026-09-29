import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as client } from "socket.io-client";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import {
  bootstrapAdmin,
  protectSockets,
  hashPassword,
} from "../services/authService.js";
import User from "../models/User.js";
import AuditEvent from "../models/AuditEvent.js";
let db, app, server, io, admin, staff, manager;
const password = "Temporary-password-123";
async function login(username, pass = password) {
  const r = await request(app)
    .post("/api/auth/login")
    .set("X-Requested-With", "store-app")
    .send({ username, password: pass })
    .expect(200);
  assert.equal(r.body.data.user.passwordHash, undefined);
  assert.match(r.headers["set-cookie"][0], /HttpOnly/);
  assert.match(r.headers["set-cookie"][0], /SameSite=Strict/);
  const cookie = r.headers["set-cookie"][0].split(";")[0],
    csrf = r.body.data.csrf;
  return {
    user: r.body.data.user,
    cookie,
    csrf,
    call: (method, path) =>
      request(app)
        [method](path)
        .set("Cookie", cookie)
        .set("X-CSRF-Token", csrf),
  };
}
before(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDB(db.getUri("auth"));
  app = createApp();
  server = createServer(app);
  io = new Server(server);
  protectSockets(io, ["http://localhost:5173"]);
  app.set("io", io);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
});
after(async () => {
  await new Promise((r) => io.close(r));
  await mongoose.disconnect();
  await db.stop();
});
test("authentication, roles, audit and session lifecycle", async (t) => {
  await t.test(
    "one-time bootstrap and compulsory password change",
    async () => {
      await bootstrapAdmin({ username: "owner", name: "Owner", password });
      await assert.rejects(
        bootstrapAdmin({ username: "owner2", name: "Other", password }),
      );
      admin = await login("owner");
      await admin.call("get", "/api/customers").expect(403);
      await admin
        .call("post", "/api/auth/password")
        .send({ currentPassword: password, password: "Permanent-password-123" })
        .expect(200);
      await admin.call("get", "/api/auth/session").expect(401);
      admin = await login("owner", "Permanent-password-123");
    },
  );
  await t.test("anonymous routes and CSRF are blocked", async () => {
    for (const path of [
      "/api/customers",
      "/api/vinyl",
      "/api/settings",
      "/api/users",
      "/api/audit",
      "/api/images/photo.png",
      "/api/sales/000000000000000000000001/pdf",
    ])
      await request(app).get(path).expect(401);
    await request(app)
      .post("/api/customers")
      .set("Cookie", admin.cookie)
      .send({ name: "Bad" })
      .expect(403);
    await admin
      .call("post", "/api/customers")
      .set("Origin", "https://evil.example")
      .send({ name: "Bad" })
      .expect(403);
    await request(app)
      .post("/api/auth/login")
      .send({ username: "owner", password })
      .expect(403);
  });
  await t.test(
    "admin creates accounts; manager and staff cannot administer users",
    async () => {
      for (const role of ["staff", "manager"]) {
        const r = await admin
          .call("post", "/api/users")
          .send({ username: role, name: role, role, password })
          .expect(201);
        const session = await login(role);
        await session.call("get", "/api/vinyl").expect(403);
        await session
          .call("post", "/api/auth/password")
          .send({
            currentPassword: password,
            password: `${role}-permanent-password`,
          })
          .expect(200);
        const ready = await login(role, `${role}-permanent-password`);
        assert.equal(ready.user._id, r.body.data._id);
        if (role === "staff") staff = ready;
        else manager = ready;
      }
      for (const session of [staff, manager]) {
        await session
          .call("post", "/api/users")
          .send({ username: "intruder", name: "X", role: "admin", password })
          .expect(403);
        await session.call("get", "/api/audit").expect(403);
        await session.call("put", "/api/settings").send({}).expect(403);
      }
    },
  );
  await t.test(
    "staff cannot change inventory or see costs, but can record sales and receipts with trusted attribution",
    async () => {
      const rollBody = {
        vinylName: "Security Roll",
        type: "Carpet",
        color: "Blue",
        length: 100,
        width: 3,
        costPrice: 10,
        sellingPrice: 20,
      };
      await staff.call("post", "/api/vinyl").send(rollBody).expect(403);
      for (const path of [
        "/api/reports/inventory",
        "/api/exports/vinyl",
        "/api/deliveries/template",
      ])
        await staff.call("get", path).expect(403);
      const roll = (
        await manager.call("post", "/api/vinyl").send(rollBody).expect(201)
      ).body.data;
      assert.equal(roll.createdBy, manager.user._id);
      const visible = (
        await staff.call("get", `/api/vinyl/${roll._id}`).expect(200)
      ).body.data;
      assert.equal(visible.costPrice, undefined);
      const dashboard = (
        await staff.call("get", "/api/dashboard/summary").expect(200)
      ).body.data;
      assert.equal(dashboard.totalSales, undefined);
      const customer = (
        await staff
          .call("post", "/api/customers")
          .send({
            name: "Auth Customer",
            phone: "0701234567",
            createdBy: admin.user._id,
            createdByName: "Forged",
          })
          .expect(201)
      ).body.data;
      assert.equal(customer.createdBy, staff.user._id);
      const body = {
        vinylId: roll._id,
        customerId: customer._id,
        soldLength: 2,
        pricingMethod: "linear",
        unitPrice: 20,
        paidAmount: 10,
      };
      const sale = (
        await staff
          .call("post", "/api/sales")
          .set("Idempotency-Key", "security-sale-123")
          .send(body)
          .expect(201)
      ).body.data;
      assert.equal(sale.createdBy, staff.user._id);
      await staff
        .call("post", "/api/sales")
        .set("Idempotency-Key", "security-sale-123")
        .send(body)
        .expect(201);
      assert.equal(
        await AuditEvent.countDocuments({
          action: "POST /api/sales",
          target: sale._id,
        }),
        1,
      );
      const receipt = (
        await staff
          .call("post", "/api/payments")
          .set("Idempotency-Key", "security-receipt-123")
          .send({ customerId: customer._id, amount: 50, paymentMethod: "cash" })
          .expect(201)
      ).body.data;
      assert.equal(receipt.createdBy, staff.user._id);
      assert.equal(
        (await staff.call("get", `/api/sales/${sale._id}`).expect(200)).body
          .data.vinylId?.costPrice,
        undefined,
      );
      await admin.call("delete", `/api/sales/${sale._id}`).expect(404);
    },
  );
  await t.test(
    "sockets require a session and disconnect after admin deactivation",
    async () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      const anonymous = client(url, { reconnection: false });
      await new Promise((resolve, reject) => {
        anonymous.on("connect_error", (e) => {
          assert.equal(e.message, "UNAUTHORIZED");
          anonymous.close();
          resolve();
        });
        anonymous.on("connect", () => reject(Error("anonymous connected")));
      });
      const socket = client(url, {
        reconnection: false,
        extraHeaders: { Cookie: staff.cookie },
      });
      await new Promise((resolve, reject) => {
        socket.on("connect", resolve);
        socket.on("connect_error", reject);
      });
      const disconnected = new Promise((resolve) =>
        socket.on("disconnect", resolve),
      );
      await admin
        .call("put", `/api/users/${staff.user._id}`)
        .send({
          username: "staff",
          name: "staff",
          role: "staff",
          active: false,
        })
        .expect(200);
      await disconnected;
      socket.close();
      await staff.call("get", "/api/customers").expect(401);
    },
  );
  await t.test(
    "password reset revokes previous sessions; logout invalidates its session",
    async () => {
      await admin
        .call("put", `/api/users/${manager.user._id}`)
        .send({
          username: "manager",
          name: "Manager",
          role: "manager",
          active: true,
          password: "Replacement-password-123",
        })
        .expect(200);
      await manager.call("get", "/api/customers").expect(401);
      manager = await login("manager", "Replacement-password-123");
      assert.equal(manager.user.mustChangePassword, true);
      await manager.call("get", "/api/sales").expect(403);
      await manager.call("post", "/api/auth/logout").expect(200);
      await manager.call("get", "/api/auth/session").expect(401);
    },
  );
  await t.test(
    "concurrent demotions preserve an active administrator",
    async () => {
      const other = await User.create({
        username: "secondadmin",
        name: "Second",
        role: "admin",
        mustChangePassword: false,
        passwordHash: await hashPassword(password),
      });
      const second = await login("secondadmin");
      const results = await Promise.all([
        admin
          .call("put", `/api/users/${admin.user._id}`)
          .send({
            username: "owner",
            name: "Owner",
            role: "manager",
            active: true,
          }),
        second
          .call("put", `/api/users/${other._id}`)
          .send({
            username: "secondadmin",
            name: "Second",
            role: "manager",
            active: true,
          }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        await User.countDocuments({ active: true, role: "admin" }),
        1,
      );
    },
  );
});

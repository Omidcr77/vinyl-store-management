import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import database from "../db/mysql.js";
import { TestDatabase } from "./support/database.js";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import { bootstrapAdmin } from "../services/authService.js";
import { allowedOrigins } from "../config/origins.js";

test("Netlify origin, secure proxied login cookies and CSRF work alongside the local app", async () => {
  const db = await TestDatabase.create();
  const previous = process.env.CLIENT_URLS;
  process.env.CLIENT_URLS = "https://vinyl-deployment-test.netlify.app";
  try {
    await connectDB(db.getUri());
    await bootstrapAdmin({
      username: "testadmin",
      name: "مدیر آزمایشی",
      password: "Public-test-password-123",
    });
    const app = createApp(),
      origin = process.env.CLIENT_URLS;
    await request(app)
      .get("/api/health")
      .set("Origin", origin)
      .expect(200)
      .expect("Cache-Control", "no-store");
    await request(app)
      .get("/api/health")
      .set("Origin", "https://untrusted.netlify.app")
      .expect(403);
    const login = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .set("X-Requested-With", "store-app")
      .set("X-Forwarded-Proto", "https")
      .send({ username: "testadmin", password: "Public-test-password-123" })
      .expect(200);
    assert.match(login.headers["set-cookie"][0], /; Secure/);
    assert.match(login.headers["set-cookie"][0], /SameSite=Strict/);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    await request(app)
      .get("/api/auth/session")
      .set("Cookie", cookie)
      .set("Origin", origin)
      .expect(200);
    await request(app)
      .post("/api/customers")
      .set("Cookie", cookie)
      .set("Origin", origin)
      .send({ name: "بدون اجازه" })
      .expect(403);
    await request(app)
      .post("/api/customers")
      .set("Cookie", cookie)
      .set("Origin", origin)
      .set("X-CSRF-Token", login.body.data.csrf)
      .send({ name: "مشتری آزمایشی", phone: "0700123456" })
      .expect(201);
    const local = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "store-app")
      .send({ username: "testadmin", password: "Public-test-password-123" })
      .expect(200);
    assert.doesNotMatch(local.headers["set-cookie"][0], /; Secure/);
    process.env.CLIENT_URLS = "https://example.netlify.app/path";
    assert.throws(allowedOrigins, /exact HTTP/);
    process.env.CLIENT_URLS = "https://*.netlify.app";
    assert.throws(allowedOrigins, /exact HTTP/);
  } finally {
    if (previous === undefined) delete process.env.CLIENT_URLS;
    else process.env.CLIENT_URLS = previous;
    await database.disconnect();
    await db.stop();
  }
});

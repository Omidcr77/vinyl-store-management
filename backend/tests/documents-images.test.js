import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import database from "../db/mysql.js";
import { TestDatabase } from "./support/database.js";
import request, { signInTestAdmin } from "./support/auth.js";
import sharp from "sharp";
import { connectDB } from "../config/db.js";
import { createApp } from "../app.js";
import { closePdfBrowser } from "../services/documentService.js";
let db, app, uploadDir;
before(async () => {
  uploadDir = await mkdtemp(join(tmpdir(), "vinyl-images-test-"));
  process.env.UPLOAD_DIR = uploadDir;
  db = await TestDatabase.create();
  await connectDB(db.getUri("documents"));
  app = createApp();
  await signInTestAdmin(app);
});
after(async () => {
  await closePdfBrowser();
  await database.disconnect();
  await db?.stop();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});
test("validated uploads persist on customers and rolls; real RTL PDFs and immutable receipts", async () => {
  const png = await sharp({
    create: { width: 1400, height: 800, channels: 3, background: "#268477" },
  })
    .png()
    .toBuffer();
  const upload = await request(app)
    .post("/api/images")
    .attach("image", png, "sample.png")
    .expect(201);
  const img = upload.body.data.url;
  assert.match(img, /^\/api\/images\/[a-f0-9-]+\.webp$/);
  const downloaded = await request(app)
    .get(img)
    .expect(200)
    .expect("Content-Type", /image\/webp/);
  assert.equal((await sharp(downloaded.body).metadata()).width, 1200);
  await request(app)
    .post("/api/images")
    .attach("image", Buffer.from("<svg onload='alert(1)'/>"), {
      filename: "fake.png",
      contentType: "image/png",
    })
    .expect(400);
  await request(app)
    .post("/api/images")
    .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), "huge.png")
    .expect(400);
  const customer = (
    await request(app)
      .post("/api/customers")
      .send({ name: "احمد", phone: "0700000000", img })
      .expect(201)
  ).body.data;
  const rollBody = {
    vinylName: "قالین آبی",
    type: "قالین",
    color: "آبی",
    length: 20,
    width: 4,
    img,
  };
  const roll = (
    await request(app).post("/api/vinyl").send(rollBody).expect(201)
  ).body.data;
  assert.equal(roll.img, img);
  assert.equal(customer.img, img);
  const sale = (
    await request(app)
      .post("/api/sales")
      .set("Idempotency-Key", "documents-sale")
      .send({
        vinylId: roll._id,
        customerId: customer._id,
        soldLength: 2,
        pricingMethod: "linear",
        unitPrice: 20,
        paidAmount: 5,
      })
      .expect(201)
  ).body.data;
  assert.equal(sale.currency, "USD");
  const body = {
    customerId: customer._id,
    amount: 10,
    paymentMethod: "cash",
    reference: "cash-1",
  };
  const payment = (
    await request(app)
      .post("/api/payments")
      .set("Idempotency-Key", "documents-payment")
      .send(body)
      .expect(201)
  ).body.data;
  assert.match(payment.receiptNumber, /^RCP-\d{4}-\d{6}$/);
  assert.equal(payment.balanceBefore, 35);
  assert.equal(payment.balanceAfter, 25);
  const retry = (
    await request(app)
      .post("/api/payments")
      .set("Idempotency-Key", "documents-payment")
      .send(body)
      .expect(201)
  ).body.data;
  assert.equal(retry.receiptNumber, payment.receiptNumber);
  await request(app)
    .put(`/api/customers/${customer._id}`)
    .send({ name: "نام تازه", phone: "0709999999" })
    .expect(200);
  const detail = (
    await request(app).get(`/api/customers/${customer._id}`).expect(200)
  ).body.data;
  assert.equal(
    detail.customer.img,
    img,
    "Unspecified image is preserved on edit",
  );
  const receipt = (
    await request(app).get(`/api/payments/${payment._id}`).expect(200)
  ).body.data;
  assert.equal(receipt.customerName, "احمد");
  assert.equal(receipt.currency, "USD");
  assert.equal(receipt.allocations[0].billNumber, sale.billNumber);
  for (const path of [`sales/${sale._id}`, `payments/${payment._id}`]) {
    const pdf = await request(app)
      .get(`/api/${path}/pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect("Content-Type", /application\/pdf/);
    assert.equal(pdf.body.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.body.length > 10000);
    assert.match(pdf.headers["content-disposition"], /attachment; filename=/);
  }
  await request(app).get("/api/payments/invalid/pdf").expect(400);
  await request(app)
    .put(`/api/customers/${customer._id}`)
    .send({ name: "احمد", phone: "0700000000", img: "" })
    .expect(200);
  await request(app).get(img).expect(200); // Shared roll photo must survive customer removal.
});

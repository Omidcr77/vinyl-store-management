import { EJSON, ObjectId } from "bson";
import { migratePriceHistory } from "./priceHistoryMigration.js";
import Supplier from "../models/Supplier.js";
import SupplierEntry from "../models/SupplierEntry.js";
import CustomerPriceHistory from "../models/CustomerPriceHistory.js";
import sharp from "sharp";
import database from "../db/mysql.js";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { uploadsDirectory } from "../config/storage.js";
import { AppError } from "../utils/errors.js";
import { audit } from "./actor.js";
import LoginSession from "../models/LoginSession.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import VinylRoll from "../models/VinylRoll.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import Payment from "../models/Payment.js";
import Counter from "../models/Counter.js";
import CustomerPrice from "../models/CustomerPrice.js";
import Delivery from "../models/Delivery.js";
import AuditEvent from "../models/AuditEvent.js";
import AuthGuard from "../models/AuthGuard.js";
import DeletedRecord from "../models/DeletedRecord.js";

const zip = promisify(gzip),
  unzip = promisify(gunzip);

export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
const models = [
  Supplier,
  SupplierEntry,
  CustomerPriceHistory,
  Settings,
  VinylRoll,
  Customer,
  Sale,
  Payment,
  Counter,
  CustomerPrice,
  Delivery,
  User,
  AuditEvent,
  AuthGuard,
  DeletedRecord,
];
const photoName = /^[a-f0-9-]{36}\.webp$/;
const digest = (value) => createHash("sha256").update(value).digest("hex");
export const backupsDirectory = () =>
  process.env.BACKUP_DIR
    ? resolve(process.env.BACKUP_DIR)
    : fileURLToPath(new URL("../../.data/backups", import.meta.url));
const bad = (message = "فایل بکاپ معتبر یا کامل نیست.") =>
  new AppError(message, 400);
const summaryOf = (payload) => ({
  createdAt: payload.createdAt,
  storeName: payload.storeName,
  counts: Object.fromEntries(
    Object.entries(payload.collections).map(([name, docs]) => [
      name,
      docs.length,
    ]),
  ),
  photos: payload.files.length,
});

// Native collection reads preserve BSON types and fields excluded from normal APIs
// (in particular users' password hashes). No active sessions are exported.
export async function createBackup() {
  const known = new Set([
    ...models.map((model) => model.collection.name),
    LoginSession.collection.name,
  ]);
  const existing = await database.connection.db
    .listCollections({}, { nameOnly: true })
    .toArray();
  if (existing.some((c) => !known.has(c.name) && !c.name.startsWith("system.")))
    throw bad("بانک اطلاعاتی مجموعهٔ ناشناخته دارد؛ بکاپ ناقص ساخته نمی‌شود.");
  let payload;
  await database.connection.transaction(
    async (session) => {
      const collections = {};
      let size = 0;
      for (const model of models) {
        const docs = [];
        for await (const doc of model.collection.find({}, { session })) {
          const encoded = EJSON.serialize(doc, { relaxed: false });
          size += Buffer.byteLength(JSON.stringify(encoded));
          if (size > MAX_EXPANDED_BYTES)
            throw bad("حجم داده‌ها از حد بکاپ داخل برنامه بیشتر است (256 MB).");
          docs.push(encoded);
        }
        for (const [fields, options] of model.schema.indexes()) {
          if (!options.unique) continue;
          const seen = new Set();
          for (const doc of docs) {
            if (
              options.partialFilterExpression?.source &&
              doc.source !== options.partialFilterExpression.source
            )
              continue;
            if (
              options.partialFilterExpression?.idempotencyKey?.$type ===
                "string" &&
              typeof doc.idempotencyKey !== "string"
            )
              continue;
            if (
              options.sparse &&
              Object.keys(fields).every((key) => doc[key] === undefined)
            )
              continue;
            const key = JSON.stringify(
              Object.keys(fields).map((field) =>
                EJSON.serialize(doc[field] ?? null, { relaxed: false }),
              ),
            );
            if (seen.has(key))
              throw bad(
                `شماره یا مقدار تکراری در مجموعهٔ ${model.collection.name} موجود است.`,
              );
            seen.add(key);
          }
        }
        collections[model.collection.name] = docs;
      }
      const files = [];
      let names = [];
      try {
        names = await readdir(uploadsDirectory());
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      for (const name of names.sort()) {
        const path = join(uploadsDirectory(), name);
        if (!photoName.test(name) || !(await lstat(path)).isFile())
          throw bad("پوشهٔ عکس‌ها فایل ناشناخته دارد.");
        const content = await readFile(path);
        size += Math.ceil(content.length / 3) * 4;
        if (size > MAX_EXPANDED_BYTES)
          throw bad(
            "حجم داده‌ها و عکس‌ها از حد بکاپ داخل برنامه بیشتر است (256 MB).",
          );
        files.push({
          name,
          sha256: digest(content),
          data: content.toString("base64"),
        });
      }
      const settings = collections[Settings.collection.name].find(
        (d) => d._id === "store",
      );
      payload = {
        format: "vinyl-store-backup",
        version: 1,
        createdAt: new Date().toISOString(),
        storeName: settings?.storeName || "",
        collections,
        files,
      };
    },
    { readConcern: { level: "snapshot" } },
  );
  const json = JSON.stringify(payload);
  const envelope = JSON.stringify({ sha256: digest(json), payload });
  if (Buffer.byteLength(envelope) > MAX_EXPANDED_BYTES)
    throw bad("حجم بکاپ از 256 MB بیشتر است.");
  const buffer = await zip(envelope);
  if (buffer.length > MAX_BACKUP_BYTES)
    throw bad("حجم فایل بکاپ از 100 MB بیشتر است.");
  return { buffer, summary: summaryOf(payload) };
}
function safeTree(value, depth = 0) {
  if (depth > 60) throw bad();
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw bad();
    safeTree(value[key], depth + 1);
  }
}
export async function validateBackup(buffer) {
  if (!buffer?.length || buffer.length > MAX_BACKUP_BYTES)
    throw bad("یک فایل بکاپ حداکثر 100 MB انتخاب کنید.");
  let envelope;
  try {
    envelope = JSON.parse(
      (await unzip(buffer, { maxOutputLength: MAX_EXPANDED_BYTES })).toString(
        "utf8",
      ),
    );
  } catch {
    throw bad("فایل خراب است یا حجم بازشدهٔ آن بیشتر از 256 MB است.");
  }
  safeTree(envelope);
  const p = envelope?.payload;
  if (
    !p ||
    p.format !== "vinyl-store-backup" ||
    p.version !== 1 ||
    !p.collections ||
    !Array.isArray(p.files) ||
    !Number.isFinite(Date.parse(p.createdAt)) ||
    envelope.sha256 !== digest(JSON.stringify(p))
  )
    throw bad();
  // Backups from before supplier accounts had none of these collections.
  const addedCollections = [Supplier, SupplierEntry, CustomerPriceHistory].map(
    (model) => model.collection.name,
  );
  const missingCollections = addedCollections.filter(
    (name) => !Object.hasOwn(p.collections, name),
  );
  if (
    missingCollections.length &&
    missingCollections.length !== addedCollections.length
  )
    throw bad("بکاپ حساب تهیه‌کنندگان یا تاریخچهٔ نرخ‌ها ناقص است.");
  for (const name of missingCollections) p.collections[name] = [];
  const expected = models.map((model) => model.collection.name).sort();
  if (
    JSON.stringify(Object.keys(p.collections).sort()) !==
    JSON.stringify(expected)
  )
    throw bad("مجموعه‌های بکاپ با این نسخهٔ برنامه سازگار نیست.");
  const collections = {};
  for (const model of models) {
    const encoded = p.collections[model.collection.name];
    if (!Array.isArray(encoded) || encoded.length > 200000) throw bad();
    let docs;
    try {
      docs = encoded.map((doc) => EJSON.deserialize(doc, { relaxed: true }));
    } catch {
      throw bad();
    }
    const ids = new Set();
    for (const doc of docs) {
      if (
        !doc ||
        typeof doc !== "object" ||
        !doc._id ||
        ids.has(String(doc._id))
      )
        throw bad();
      ids.add(String(doc._id));
      // Reject malformed data before touching either the database or photos.
      const validation = new model(doc).validateSync();
      if (validation)
        throw bad(`معلومات مجموعهٔ ${model.collection.name} معتبر نیست.`);
      if (
        model.schema.path("_id").instance === "ObjectId" &&
        !(doc._id instanceof ObjectId)
      )
        throw bad();
    }
    for (const [fields, options] of model.schema.indexes()) {
      if (!options.unique) continue;
      const seen = new Set();
      for (const doc of docs) {
        if (
          options.partialFilterExpression?.source &&
          doc.source !== options.partialFilterExpression.source
        )
          continue;
        if (
          options.partialFilterExpression?.idempotencyKey?.$type === "string" &&
          typeof doc.idempotencyKey !== "string"
        )
          continue;
        if (
          options.sparse &&
          Object.keys(fields).every((key) => doc[key] === undefined)
        )
          continue;
        const key = JSON.stringify(
          Object.keys(fields).map((field) =>
            EJSON.serialize(doc[field] ?? null, { relaxed: false }),
          ),
        );
        if (seen.has(key))
          throw bad(
            `شماره یا مقدار تکراری در مجموعهٔ ${model.collection.name} موجود است.`,
          );
        seen.add(key);
      }
    }
    collections[model.collection.name] = docs;
  }
  const get = (model) => collections[model.collection.name];
  if (
    get(Settings).length !== 1 ||
    get(Settings)[0]._id !== "store" ||
    !get(AuthGuard).some((d) => d._id === "users")
  )
    throw bad("تنظیمات یا قفل حساب‌های کاربران در بکاپ موجود نیست.");
  if (!get(User).some((u) => u.role === "admin" && u.active))
    throw bad("بکاپ باید حداقل یک مدیر سیستم فعال داشته باشد.");
  const usernames = new Set();
  for (const user of get(User)) {
    if (
      !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.passwordHash) ||
      usernames.has(user.username)
    )
      throw bad("حساب‌های کاربران یا رمزهای ذخیره‌شده معتبر نیست.");
    usernames.add(user.username);
  }
  const ids = (model) => new Set(get(model).map((d) => String(d._id)));
  const customerIds = ids(Customer),
    rollIds = ids(VinylRoll);
  const saleIds = ids(Sale);
  for (const deleted of get(DeletedRecord))
    if (deleted.kind === "Sale") saleIds.add(String(deleted.recordId));
  for (const sale of get(Sale)) {
    if (sale.customerId && !customerIds.has(String(sale.customerId)))
      throw bad("مشتری یک فروش در بکاپ موجود نیست.");
    for (const item of sale.items?.length ? sale.items : [sale])
      if (!rollIds.has(String(item.vinylId)))
        throw bad("رول یک فروش در بکاپ موجود نیست.");
  }
  for (const doc of [...get(Payment), ...get(CustomerPrice)])
    if (!customerIds.has(String(doc.customerId)))
      throw bad("حساب مرتبط در بکاپ موجود نیست.");
  for (const payment of get(Payment))
    for (const a of payment.allocations || [])
      if (!saleIds.has(String(a.saleId)))
        throw bad("فروش مرتبط با رسید در بکاپ موجود نیست.");
  const supplierIds = ids(Supplier);
  for (const doc of [
    ...get(SupplierEntry),
    ...get(VinylRoll),
    ...get(Delivery),
  ])
    if (doc.supplierId && !supplierIds.has(String(doc.supplierId)))
      throw bad("تهیه‌کنندهٔ مرتبط در بکاپ موجود نیست.");
  for (const supplier of get(Supplier)) {
    const balance = get(SupplierEntry)
      .filter((e) => String(e.supplierId) === String(supplier._id))
      .reduce((sum, e) => sum + e.deltaMinor, 0);
    if (balance !== supplier.balanceMinor)
      throw bad("مانده حساب تهیه‌کننده با معاملات سازگار نیست.");
  }
  for (const history of get(CustomerPriceHistory))
    if (!customerIds.has(String(history.customerId)))
      throw bad("مشتری تاریخچهٔ نرخ موجود نیست.");
  const counters = new Map(get(Counter).map((c) => [c._id, c.value]));
  const checkCounter = (name, number) => {
    if (
      !Number.isSafeInteger(number) ||
      number < 0 ||
      (counters.get(name) || 0) < number
    )
      throw bad("شماره‌گذاری بکاپ با سوابق سازگار نیست.");
  };
  for (const roll of get(VinylRoll))
    if (roll.rollNumber) checkCounter("roll", roll.rollNumber);
  for (const sale of [
    ...get(Sale),
    ...get(DeletedRecord)
      .filter((d) => d.kind === "Sale")
      .map((d) => d.record),
  ]) {
    const parts = /^INV-(\d{4})-(\d+)$/.exec(sale.billNumber);
    if (parts) checkCounter(`invoice-${parts[1]}`, Number(parts[2]));
  }
  for (const receipt of get(Payment)) {
    const parts = /^RCP-(\d{4})-(\d+)$/.exec(receipt.receiptNumber);
    if (parts) checkCounter(`receipt-${parts[1]}`, Number(parts[2]));
  }
  for (const delivery of get(Delivery)) {
    const parts = /^DEL-(\d+)$/.exec(delivery.deliveryNumber);
    if (parts) checkCounter("delivery", Number(parts[1]));
  }
  const files = new Map();
  for (const file of p.files) {
    if (
      !file ||
      !photoName.test(file.name) ||
      files.has(file.name) ||
      typeof file.data !== "string" ||
      file.data.length > 8 * 1024 * 1024
    )
      throw bad("عکس‌های بکاپ معتبر نیستند.");
    const content = Buffer.from(file.data, "base64");
    if (
      content.toString("base64") !== file.data ||
      digest(content) !== file.sha256 ||
      content.toString("ascii", 0, 4) !== "RIFF" ||
      content.toString("ascii", 8, 12) !== "WEBP"
    )
      throw bad("عکس بکاپ خراب است.");
    try {
      const metadata = await sharp(content, {
        limitInputPixels: 25000000,
        failOn: "error",
      }).metadata();
      if (metadata.format !== "webp" || (metadata.pages || 1) > 1) throw bad();
    } catch {
      throw bad("عکس بکاپ خراب است.");
    }
    files.set(file.name, content);
  }
  const checkImages = (value) => {
    if (!value || typeof value !== "object") return;
    if (
      typeof value.img === "string" &&
      value.img.startsWith("/api/images/") &&
      !files.has(value.img.slice(12))
    )
      throw bad("یک عکس مورد استفاده در بکاپ موجود نیست.");
    for (const nested of Object.values(value))
      if (nested && typeof nested === "object") checkImages(nested);
  };
  for (const docs of Object.values(p.collections)) checkImages(docs);
  return { collections, files, summary: summaryOf(p), digest: digest(buffer) };
}

// Uploaded filenames are immutable UUIDs. Add missing photos before the database
// commit, never overwrite/delete existing files. A failure/crash can leave only
// unreferenced photos, never broken references in the old or restored database.
export async function restoreBackup(validated, user) {
  const directory = uploadsDirectory();
  await mkdir(directory, { recursive: true });
  for (const [name, content] of validated.files) {
    try {
      const path = join(directory, name);
      if (
        !(await lstat(path)).isFile() ||
        digest(await readFile(path)) !== digest(content)
      )
        throw bad(
          "یک عکس هم‌نام با محتوای متفاوت موجود است. بازیابی انجام نشد.",
        );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  const safety = await createBackup();
  await mkdir(backupsDirectory(), { recursive: true, mode: 0o700 });
  const recovery = `before-restore-${Date.now()}-${randomUUID()}.vinyl-backup.gz`;
  await writeFile(join(backupsDirectory(), recovery), safety.buffer, {
    flag: "wx",
    mode: 0o600,
  });
  for (const [name, content] of validated.files) {
    try {
      await writeFile(join(directory, name), content, {
        flag: "wx",
        mode: 0o600,
      });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
  await database.connection.transaction(
    async (session) => {
      for (const model of models) {
        await model.collection.deleteMany({}, { session });
        const docs = validated.collections[model.collection.name];
        for (let i = 0; i < docs.length; i += 500)
          await model.collection.insertMany(docs.slice(i, i + 500), {
            session,
          });
      }
      await migratePriceHistory(session);
      await LoginSession.deleteMany({}).session(session);
      await audit(
        "backup.restore",
        validated.digest,
        session,
        `Restored backup from ${validated.summary.createdAt}; recovery: ${recovery}`,
        user,
      );
    },
    { writeConcern: { w: "majority" } },
  );
  return { ...validated.summary, recovery };
}

import multer from "multer";
import ExcelJS from "exceljs";
import { AppError } from "../utils/errors.js";
import { deliveryInput, keyInput } from "../utils/validation.js";
import { createDelivery } from "../services/deliveryService.js";
const columns = [
  "vinylName",
  "type",
  "color",
  "length",
  "width",
  "quantity",
  "lengths",
  "costPrice",
  "sellingPrice",
  "details",
];
const aliases = {
  نام: "vinylName",
  "نام وینیل": "vinylName",
  نوع: "type",
  رنگ: "color",
  طول: "length",
  عرض: "width",
  تعداد: "quantity",
  طول‌ها: "lengths",
  "قیمت خرید": "costPrice",
  "نرخ پیشنهادی": "sellingPrice",
  توضیحات: "details",
};
export async function deliverySave(req, res) {
  const result = await createDelivery(
    deliveryInput.parse(req.body),
    keyInput.parse(req.get("Idempotency-Key")),
  );
  req.app.get("io")?.emit("store:changed");
  res.status(201).json({ success: true, data: result });
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
}).single("file");
export function receiveWorkbook(req, res, next) {
  upload(req, res, (error) =>
    next(
      error
        ? new AppError("یک فایل Excel با حجم حداکثر 2 مگابایت انتخاب کنید.")
        : undefined,
    ),
  );
}
export async function deliveryTemplate(req, res) {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Delivery");
  sheet.addRow(columns);
  sheet.addRow(["Vinyl A", "Vinyl", "Brown", 30, 4, 20, "", 10, 15]);
  sheet.addRow([
    "Carpet B",
    "Carpet",
    "Red",
    "",
    3,
    "",
    "30, 28, 25, 32",
    12,
    18,
  ]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((c) => {
    c.width = 20;
  });
  res
    .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .attachment("delivery-template.xlsx")
    .send(Buffer.from(await book.xlsx.writeBuffer()));
}
export async function deliveryImport(req, res) {
  if (!req.file || !/\.xlsx$/i.test(req.file.originalname))
    throw new AppError("فایل .xlsx انتخاب کنید.");
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(req.file.buffer);
  } catch {
    throw new AppError("فایل Excel معتبر نیست.");
  }
  const sheet = book.worksheets[0];
  if (
    !sheet ||
    sheet.rowCount < 2 ||
    sheet.rowCount > 201 ||
    sheet.columnCount > 30
  )
    throw new AppError(
      "فایل باید دارای عنوان ستون‌ها و بین 1 تا 200 ردیف باشد.",
    );
  const headers = sheet
    .getRow(1)
    .values.slice(1)
    .map((value) => {
      const text = String(value ?? "").trim();
      return (
        aliases[text] ||
        columns.find((c) => c.toLowerCase() === text.toLowerCase())
      );
    });
  if (!["type", "color", "width"].every((c) => headers.includes(c)))
    throw new AppError(
      "ستون‌های نوع، رنگ و عرض ضروری‌اند. از فایل نمونه استفاده کنید.",
    );
  const known = headers.filter(Boolean);
  if (new Set(known).size !== known.length)
    throw new AppError("عنوان ستون تکراری است.");
  const rows = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = {},
      source = sheet.getRow(index);
    headers.forEach((key, col) => {
      if (!key) return;
      const value = source.getCell(col + 1).value;
      if (value == null || value === "") return;
      if (typeof value === "object")
        throw new AppError(
          `ردیف ${index}: فرمول و خانهٔ ترکیبی قابل قبول نیست؛ مقدار ساده وارد کنید.`,
        );
      row[key] = String(value).trim();
    });
    if (row.lengths && (row.quantity || row.length))
      throw new AppError(
        `ردیف ${index}: برای لیست طول‌ها، خانه‌های تعداد و طول یکسان را خالی بگذارید.`,
      );
    if (Object.keys(row).length)
      rows.push({ ...row, vinylName: row.vinylName || row.type || "" });
  }
  if (!rows.length) throw new AppError("هیچ ردیف قابل ورود یافت نشد.");
  res.json({ success: true, data: { rows } });
}

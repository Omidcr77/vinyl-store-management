import { AppError } from "./errors.js";
import { id } from "./validation.js";
import { z } from "zod";
export const regex = (value) =>
  new RegExp(
    String(value)
      .slice(0, 200)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i",
  );
export function dateRange(from, to) {
  const range = {};
  for (const [value, key] of [
    [from, "$gte"],
    [to, "$lt"],
  ]) {
    if (!value) continue;
    if (!z.iso.date().safeParse(value).success)
      throw new AppError("تاریخ معتبر را به‌شکل YYYY-MM-DD وارد کنید.");
    const date = new Date(`${value}T00:00:00`);
    if (isNaN(date.getTime())) throw new AppError("تاریخ معتبر نیست.");
    if (key === "$lt") date.setDate(date.getDate() + 1);
    range[key] = date;
  }
  if (range.$gte && range.$lt && range.$gte >= range.$lt)
    throw new AppError("تاریخ آغاز باید پیش از تاریخ پایان باشد.");
  return Object.keys(range).length ? range : undefined;
}
export function filterFor(kind, q) {
  const filter = kind === "vinyl" ? { archived: false } : {};
  const fields =
    kind === "vinyl"
      ? ["vinylName", "type", "color"]
      : kind === "sales"
        ? [
            "billNumber",
            "customerName",
            "vinylName",
            "items.vinylName",
            "items.type",
            "items.color",
          ]
        : ["name", "phone"];
  if (q.search) {
    filter.$or = fields.map((field) => ({ [field]: regex(q.search) }));
    if (kind !== "customers" && /^\d+$/.test(q.search))
      filter.$or.push({ rollNumber: Number(q.search) });
    if (kind === "sales" && /^\d+$/.test(q.search))
      filter.$or.push({ "items.rollNumber": Number(q.search) });
    if (kind === "vinyl" && /^\d{4}-\d{2}-\d{2}$/.test(q.search))
      filter.$or.push({ entryDate: dateRange(q.search, q.search) });
  }
  for (const key of kind === "vinyl"
    ? ["type", "color", "status"]
    : kind === "sales"
      ? ["paymentType"]
      : [])
    if (q[key]) filter[key] = String(q[key]);
  if (q.vinylName && kind === "sales") filter.vinylName = regex(q.vinylName);
  if (q.rollNumber && kind === "sales") {
    if (!/^\d+$/.test(q.rollNumber))
      throw new AppError("شمارهٔ رول معتبر نیست.");
    filter.$and = [
      {
        $or: [
          { rollNumber: Number(q.rollNumber) },
          { "items.rollNumber": Number(q.rollNumber) },
        ],
      },
    ];
  }
  if (q.customerId) filter.customerId = id.parse(q.customerId);
  if (kind === "customers") {
    if (q.name) filter.name = regex(q.name);
    if (q.phone) filter.phone = regex(q.phone);
    if (q.hasBalance === "true") filter.balanceMinor = { $gt: 0 };
    if (q.hasBalance === "credit") filter.balanceMinor = { $lt: 0 };
  }
  const range = dateRange(q.from, q.to);
  if (range)
    filter[
      kind === "vinyl" ? "entryDate" : kind === "payments" ? "date" : "soldDate"
    ] = range;
  if (kind === "vinyl") {
    for (const [param, operator] of [
      ["minLength", "$gte"],
      ["maxLength", "$lte"],
    ])
      if (q[param] !== undefined && q[param] !== "") {
        const value = Number(q[param]);
        if (!Number.isFinite(value) || value < 0)
          throw new AppError("مقدار فیلتر طول باید عدد مثبت باشد.");
        filter.length = { ...filter.length, [operator]: value };
      }
    if (q.inStock === "true") filter.length = { ...filter.length, $gt: 0 };
  }
  return filter;
}
export function pagination(q) {
  const page = Number(q.page || 1),
    limit = Number(q.limit || 15);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new AppError("شماره یا اندازهٔ صفحه معتبر نیست.");
  return { page, limit };
}
export async function list(Model, filter, q, sorts = ["createdAt"]) {
  const { page, limit } = pagination(q);
  const sort = sorts.includes(q.sort) ? q.sort : sorts[0];
  const order = q.order === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    Model.find(filter)
      .sort({ [sort]: order, _id: order })
      .skip((page - 1) * limit)
      .limit(limit),
    Model.countDocuments(filter),
  ]);
  return {
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

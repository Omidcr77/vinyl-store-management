import Supplier from "../models/Supplier.js";
import SupplierEntry from "../models/SupplierEntry.js";
import DeletedRecord from "../models/DeletedRecord.js";
import VinylRoll from "../models/VinylRoll.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import Payment from "../models/Payment.js";
import Settings from "../models/Settings.js";
import {
  rollInput,
  rollEditInput,
  customerInput,
  saleInput,
  paymentInput,
  settingsInput,
  keyInput,
  id,
} from "../utils/validation.js";
import { list, filterFor } from "../utils/query.js";
import { required, AppError } from "../utils/errors.js";
import { saveRoll, archiveRoll } from "../services/inventoryService.js";
import { createSale } from "../services/saleService.js";
import { createPayment } from "../services/paymentService.js";
import {
  dashboard,
  customerDetail,
  customerReport,
  salesSummary,
  inventorySummary,
} from "../services/reportService.js";
import { transaction } from "../services/transaction.js";
import { actorFields } from "../services/actor.js";
const send = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });
const changed = (req) => req.app.get("io")?.emit("store:changed");
export const vinylList = async (req, res) =>
  send(
    res,
    await list(VinylRoll, filterFor("vinyl", req.query), req.query, [
      "rollNumber",
      "vinylName",
      "length",
      "entryDate",
      "sellingPrice",
    ]),
  );
export const vinylGet = async (req, res) =>
  send(
    res,
    required(
      await VinylRoll.findOne({
        _id: id.parse(req.params.id),
        archived: false,
      }),
    ),
  );
export const vinylSave = async (req, res) => {
  const schema = req.params.id ? rollEditInput : rollInput;
  const data = await saveRoll(
    schema.parse(req.body),
    req.params.id && id.parse(req.params.id),
    !req.params.id && (req.body.supplierId || req.get("Idempotency-Key"))
      ? keyInput.parse(req.get("Idempotency-Key"))
      : undefined,
  );
  changed(req);
  send(res, data, req.params.id ? 200 : 201);
};
export const vinylDelete = async (req, res) => {
  await archiveRoll(id.parse(req.params.id));
  changed(req);
  send(res, { message: "رول بایگانی شد." });
};
export const customerList = async (req, res) =>
  send(
    res,
    await list(Customer, filterFor("customers", req.query), req.query, [
      "name",
      "balanceMinor",
      "createdAt",
    ]),
  );
export const customerGet = async (req, res) =>
  send(
    res,
    await customerDetail(
      required(await Customer.findById(id.parse(req.params.id))),
      req.query,
    ),
  );
export const customerSave = async (req, res) => {
  const data = customerInput.parse(req.body);
  const customer = await transaction(async (session) =>
    req.params.id
      ? required(
          await Customer.findByIdAndUpdate(
            id.parse(req.params.id),
            { ...data, ...actorFields() },
            {
              new: true,
              runValidators: true,
              session,
            },
          ),
        )
      : (
          await Customer.create([{ ...data, ...actorFields(true) }], {
            session,
          })
        )[0],
  );
  changed(req);
  send(res, customer, req.params.id ? 200 : 201);
};
export const saleList = async (req, res) =>
  send(
    res,
    await list(Sale, filterFor("sales", req.query), req.query, [
      "soldDate",
      "billNumber",
      "totalAmount",
    ]),
  );
export const saleGet = async (req, res) =>
  send(res, required(await Sale.findById(id.parse(req.params.id))));
export const saleCreate = async (req, res) => {
  const sale = await createSale(
    saleInput.parse(req.body),
    keyInput.parse(req.get("Idempotency-Key")),
  );
  changed(req);
  send(res, sale, 201);
};
export const paymentList = async (req, res) =>
  send(
    res,
    await list(Payment, filterFor("payments", req.query), req.query, ["date"]),
  );
export const paymentCreate = async (req, res) => {
  const payment = await createPayment(
    paymentInput.parse(req.body),
    keyInput.parse(req.get("Idempotency-Key")),
  );
  changed(req);
  send(res, payment, 201);
};
export const dashboardGet = async (req, res) => {
  const data = await dashboard();
  if (req.user.role === "staff")
    return send(res, {
      availableRolls: data.availableRolls,
      remainingMeters: data.remainingMeters,
      remainingArea: data.remainingArea,
      customers: data.customers,
    });
  send(res, data);
};
export const reportGet = async (req, res) => {
  const { kind } = req.params;
  if (kind === "customers") return send(res, await customerReport(req.query));
  if (!["sales", "inventory"].includes(kind))
    throw new AppError("گزارش یافت نشد.", 404);
  const inventory = kind === "inventory",
    filter = filterFor(inventory ? "vinyl" : "sales", req.query);
  const [summary, records] = await Promise.all([
    inventory ? inventorySummary(filter) : salesSummary(filter),
    list(
      inventory ? VinylRoll : Sale,
      filter,
      req.query,
      inventory ? ["rollNumber"] : ["soldDate"],
    ),
  ]);
  send(res, { ...records, summary });
};
export const settingsGet = async (req, res) =>
  send(res, await Settings.findById("store"));
export const settingsSave = async (req, res) => {
  const input = settingsInput.parse(req.body);
  const result = await transaction(async (session) => {
    const settings = await Settings.findById("store").session(session);
    if (
      input.currency !== settings.currency &&
      ((await SupplierEntry.exists({}).session(session)) ||
        (await VinylRoll.exists({ costPrice: { $exists: true } }).session(
          session,
        )) ||
        (await Sale.exists({}).session(session)) ||
        (await Payment.exists({}).session(session)) ||
        (await DeletedRecord.exists({ kind: "Sale" }).session(session)))
    )
      throw new AppError("واحد پول پس از نخستین فروش یا رسید قابل تغییر نیست.");
    if (input.currency !== settings.currency)
      await Supplier.updateMany(
        {},
        { $set: { currency: input.currency } },
        { session },
      );
    Object.assign(settings, input);
    settings.revision += 1;
    await settings.save({ session });
    await VinylRoll.updateMany(
      { archived: false },
      [
        {
          $set: {
            status: {
              $switch: {
                branches: [
                  { case: { $eq: ["$length", 0] }, then: "sold" },
                  {
                    case: { $lt: ["$length", input.lowStockThreshold] },
                    then: "low-stock",
                  },
                ],
                default: "available",
              },
            },
          },
        },
      ],
      { session },
    );
    return settings;
  });
  changed(req);
  send(res, result);
};

import CustomerPriceHistory from "../models/CustomerPriceHistory.js";
import VinylRoll from "../models/VinylRoll.js";
import Settings from "../models/Settings.js";
import { rememberCustomerPrice } from "../services/priceHistoryService.js";
import CustomerPrice from "../models/CustomerPrice.js";
import Customer from "../models/Customer.js";
import { id, customerPriceInput } from "../utils/validation.js";
import { required } from "../utils/errors.js";
import { list } from "../utils/query.js";
import { transaction } from "../services/transaction.js";
import { actorFields } from "../services/actor.js";

export async function priceList(req, res) {
  const customerId = id.parse(req.params.id);
  required(await Customer.exists({ _id: customerId }));
  const filter = { customerId };
  if (req.query.type)
    filter.type = customerPriceInput.shape.type.parse(req.query.type);
  if (req.query.pricingMethod)
    filter.pricingMethod = customerPriceInput.shape.pricingMethod.parse(
      req.query.pricingMethod,
    );
  res.json({
    success: true,
    data: await list(CustomerPrice, filter, req.query, ["type", "updatedAt"]),
  });
}

export async function priceSave(req, res) {
  const customerId = id.parse(req.params.id);
  required(await Customer.exists({ _id: customerId }));
  const input = customerPriceInput.parse(req.body);
  const data = await transaction(async (session) => {
    required(
      await Customer.findByIdAndUpdate(
        customerId,
        { $inc: { __v: 1 } },
        { new: true, session },
      ),
    );
    return rememberCustomerPrice(customerId, input, session);
  });
  req.app.get("io")?.emit("store:changed");
  res.json({ success: true, data });
}

export async function priceDelete(req, res) {
  await transaction(async (session) => {
    const record = required(
      await CustomerPrice.findOneAndDelete({
        _id: id.parse(req.params.priceId),
        customerId: id.parse(req.params.id),
      }).session(session),
    );
    await CustomerPriceHistory.create(
      [
        {
          customerId: record.customerId,
          type: record.type,
          pricingMethod: record.pricingMethod,
          unitPrice: record.unitPrice,
          currency: (await Settings.findById("store").session(session))
            .currency,
          source: "removed",
          ...actorFields(true),
        },
      ],
      { session },
    );
  });
  req.app.get("io")?.emit("store:changed");
  res.json({
    success: true,
    data: { message: "نرخ اختصاصی حذف شد. بل‌های قبلی تغییر نکردند." },
  });
}

export async function priceHistory(req, res) {
  const customerId = id.parse(req.params.id);
  required(await Customer.exists({ _id: customerId }));
  res.json({
    success: true,
    data: await list(CustomerPriceHistory, { customerId }, req.query, [
      "createdAt",
    ]),
  });
}
export async function priceSuggestion(req, res) {
  const customerId = id.parse(req.params.id);
  required(await Customer.exists({ _id: customerId }));
  const roll = required(await VinylRoll.findById(id.parse(req.query.vinylId)));
  const pricingMethod = customerPriceInput.shape.pricingMethod.parse(
    req.query.pricingMethod,
  );
  const filter = { customerId, type: roll.type, pricingMethod };
  const saved = await CustomerPrice.findOne(filter);
  const previous = await CustomerPriceHistory.findOne({
    ...filter,
    color: roll.color,
    width: roll.width,
    source: "sale",
    voided: { $ne: true },
  }).sort({ createdAt: -1, _id: -1 });
  const best =
    saved && (!previous || saved.updatedAt >= previous.createdAt)
      ? saved
      : previous;
  res.json({
    success: true,
    data: best
      ? {
          unitPrice: best.unitPrice,
          source: best === saved ? "saved" : "sale",
          date: best.createdAt,
        }
      : null,
  });
}

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
  const data = await transaction((session) =>
    CustomerPrice.findOneAndUpdate(
      { customerId, type: input.type, pricingMethod: input.pricingMethod },
      {
        $set: { unitPrice: input.unitPrice, ...actorFields() },
        $setOnInsert: {
          createdBy: actorFields(true).createdBy,
          createdByName: actorFields(true).createdByName,
        },
      },
      { upsert: true, new: true, runValidators: true, session },
    ),
  );
  req.app.get("io")?.emit("store:changed");
  res.json({ success: true, data });
}

export async function priceDelete(req, res) {
  await transaction(async (session) =>
    required(
      await CustomerPrice.findOneAndDelete({
        _id: id.parse(req.params.priceId),
        customerId: id.parse(req.params.id),
      }).session(session),
    ),
  );
  req.app.get("io")?.emit("store:changed");
  res.json({
    success: true,
    data: { message: "نرخ اختصاصی حذف شد. بل‌های قبلی تغییر نکردند." },
  });
}

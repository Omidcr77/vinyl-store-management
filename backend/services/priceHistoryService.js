import CustomerPrice from "../models/CustomerPrice.js";
import CustomerPriceHistory from "../models/CustomerPriceHistory.js";
import Settings from "../models/Settings.js";
import { actorFields } from "./actor.js";
export async function rememberCustomerPrice(customerId, input, session) {
  const filter = {
    customerId,
    type: input.type,
    pricingMethod: input.pricingMethod,
  };
  const previous = await CustomerPrice.findOne(filter).session(session);
  const currency = (await Settings.findById("store").session(session)).currency;
  if (
    previous &&
    !(await CustomerPriceHistory.exists({
      ...filter,
      source: { $in: ["saved", "previous"] },
    }).session(session))
  )
    await CustomerPriceHistory.create(
      [
        {
          ...filter,
          unitPrice: previous.unitPrice,
          currency,
          source: "previous",
          ...actorFields(true),
        },
      ],
      { session },
    );
  if (!previous || previous.unitPrice !== input.unitPrice)
    await CustomerPriceHistory.create(
      [
        {
          ...filter,
          unitPrice: input.unitPrice,
          currency,
          source: "saved",
          ...actorFields(true),
        },
      ],
      { session },
    );
  return CustomerPrice.findOneAndUpdate(
    filter,
    {
      $set: { unitPrice: input.unitPrice, ...actorFields() },
      $setOnInsert: {
        createdBy: actorFields(true).createdBy,
        createdByName: actorFields(true).createdByName,
      },
    },
    { upsert: true, new: true, runValidators: true, session },
  );
}

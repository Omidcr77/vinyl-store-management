import { actorFields } from "./actor.js";
import VinylRoll from "../models/VinylRoll.js";
import Settings from "../models/Settings.js";
import Sale from "../models/Sale.js";
import { nextSequence } from "../utils/billNumber.js";
import { transaction } from "./transaction.js";
import { required, AppError } from "../utils/errors.js";
export const stockStatus = (length, threshold) =>
  length === 0 ? "sold" : length < threshold ? "low-stock" : "available";
// Touching settings serializes threshold/currency changes with inventory and sale writes.
export const lockSettings = (session) =>
  Settings.findByIdAndUpdate(
    "store",
    { $inc: { revision: 1 } },
    { new: true, session },
  );
export async function saveRoll(data, id) {
  return transaction(async (session) => {
    const settings = await lockSettings(session);
    if (id) {
      const roll = required(
        await VinylRoll.findOne({ _id: id, archived: false }).session(session),
      );
      if (data.length === 0 && roll.length !== 0)
        throw new AppError(
          "برای تمام‌کردن رول، فروش ثبت کنید. طول واردشده باید بیشتر از صفر باشد.",
        );
      if (
        (roll.length !== data.length || roll.width !== data.width) &&
        (await Sale.exists({
          $or: [{ vinylId: id }, { "items.vinylId": id }],
        }).session(session))
      )
        throw new AppError(
          "پس از فروش، ابعاد رول قابل تغییر نیست. برای موجودی تازه، رول جدید ثبت کنید.",
        );
      Object.assign(roll, data, actorFields(), {
        status: stockStatus(data.length, settings.lowStockThreshold),
      });
      return roll.save({ session });
    }
    const [roll] = await VinylRoll.create(
      [
        {
          ...data,
          ...actorFields(true),
          rollNumber: await nextSequence("roll", session),
          status: stockStatus(data.length, settings.lowStockThreshold),
        },
      ],
      { session },
    );
    return roll;
  });
}
export async function archiveRoll(id) {
  return transaction(async (session) => {
    const roll = required(
      await VinylRoll.findOne({ _id: id, archived: false }).session(session),
    );
    if (
      await Sale.exists({
        $or: [{ vinylId: id }, { "items.vinylId": id }],
      }).session(session)
    )
      throw new AppError("این رول سابقهٔ فروش دارد و باید محفوظ بماند.");
    roll.archived = true;
    Object.assign(roll, actorFields());
    return roll.save({ session });
  });
}

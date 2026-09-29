import { purchaseFields, purchaseAccount } from "./purchaseService.js";
import Supplier from "../models/Supplier.js";
import { actorFields } from "./actor.js";
import VinylRoll from "../models/VinylRoll.js";
import Settings from "../models/Settings.js";
import Sale from "../models/Sale.js";
import { nextSequence } from "../utils/billNumber.js";
import { transaction, idempotent } from "./transaction.js";
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
export async function saveRoll(data, id, key) {
  const work = async (session, requestHash, scopedKey) => {
    const settings = await lockSettings(session);
    if (data.supplierId)
      data = {
        ...data,
        supplier: required(
          await Supplier.findById(data.supplierId).session(session),
        ).name,
      };
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
      const hasSales = await Sale.exists({
        $or: [{ vinylId: id }, { "items.vinylId": id }],
      }).session(session);
      const costChanged = ["costPrice", "importCost", "supplierId"].some(
        (key) =>
          data[key] !== undefined &&
          String(data[key]) !==
            String(roll[key] ?? (key === "importCost" ? 0 : "")),
      );
      if ((roll.supplierId || hasSales) && costChanged)
        throw new AppError(
          "پس از ثبت حساب تهیه‌کننده یا فروش، قیمت خرید و تهیه‌کننده قابل تغییر نیست. برای خرید تازه رول جدید بسازید.",
        );
      if (data.paidAmount)
        throw new AppError("پرداخت بعدی را در حساب تهیه‌کننده ثبت کنید.");
      if (!roll.supplierId && data.supplierId)
        throw new AppError(
          "حساب خرید قبلی را از بخش تهیه‌کنندگان ثبت کنید؛ برای خرید تازه رول جدید بسازید.",
        );
      if (roll.supplierId && data.length !== roll.length)
        throw new AppError("طول خرید ثبت‌شده قابل تغییر نیست.");
      if (!hasSales && !roll.supplierId)
        Object.assign(
          roll,
          purchaseFields(
            { ...roll.toObject(), ...data, originalLength: data.length },
            settings.currency,
          ),
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
          ...purchaseFields(data, settings.currency),
          ...(scopedKey ? { idempotencyKey: scopedKey, requestHash } : {}),
          ...actorFields(true),
          rollNumber: await nextSequence("roll", session),
          status: stockStatus(data.length, settings.lowStockThreshold),
        },
      ],
      { session },
    );
    await purchaseAccount(
      {
        supplierId: data.supplierId,
        amount: roll.purchaseTotal,
        paidAmount: data.paidAmount,
        currency: settings.currency,
        date: roll.entryDate,
        vinylId: roll._id,
        reference: `ROLL-${roll.rollNumber}`,
      },
      session,
    );
    return roll;
  };
  return !id && key
    ? idempotent(VinylRoll, key, data, work)
    : transaction(work);
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

import { lockSettings } from "./inventoryService.js";
import Supplier from "../models/Supplier.js";
import SupplierEntry from "../models/SupplierEntry.js";
import { actorFields } from "./actor.js";
import { idempotent } from "./transaction.js";
import { required, AppError } from "../utils/errors.js";
import { minor } from "../utils/numbers.js";
import Settings from "../models/Settings.js";
export async function postSupplierEntry(data, session) {
  const supplier = required(
    await Supplier.findById(data.supplierId).session(session),
    "تهیه‌کننده یافت نشد.",
  );
  if (supplier.currency !== data.currency)
    throw new AppError("واحد پول حساب تهیه‌کننده مطابقت ندارد.");
  const balance = supplier.balanceMinor + data.deltaMinor;
  if (!Number.isSafeInteger(balance))
    throw new AppError("مانده حساب از حد مجاز بیشتر است.");
  supplier.balanceMinor = balance;
  Object.assign(supplier, actorFields());
  await supplier.save({ session });
  const [entry] = await SupplierEntry.create(
    [{ ...data, balanceAfter: balance / 100, ...actorFields(true) }],
    { session },
  );
  return entry;
}
export async function supplierTransaction(supplierId, data, key) {
  return idempotent(
    SupplierEntry,
    key,
    { supplierId, ...data },
    async (session, requestHash, scopedKey) => {
      const settings = await lockSettings(session);
      const sign = [
        "receipt",
        "loan_received",
        "opening_payable",
        "adjust_payable",
      ].includes(data.kind)
        ? 1
        : -1;
      return postSupplierEntry(
        {
          ...data,
          supplierId,
          currency: settings.currency,
          deltaMinor: sign * minor(data.amount),
          idempotencyKey: scopedKey,
          requestHash,
        },
        session,
      );
    },
  );
}
export async function reverseSupplierEntry(supplierId, entryId, data, key) {
  return idempotent(
    SupplierEntry,
    key,
    { supplierId, entryId, ...data },
    async (session, requestHash, scopedKey) => {
      const entry = required(
        await SupplierEntry.findOne({ _id: entryId, supplierId }).session(
          session,
        ),
      );
      if (
        entry.kind === "purchase" ||
        entry.kind === "reversal" ||
        entry.deliveryId ||
        entry.vinylId
      )
        throw new AppError(
          "ثبت خرید خودکار قابل لغو نیست؛ اصلاح حساب را با توضیح ثبت کنید.",
        );
      if (entry.reversed)
        throw new AppError("این معامله قبلاً لغو شده است.", 409);
      entry.reversed = true;
      await entry.save({ session });
      return postSupplierEntry(
        {
          supplierId,
          kind: "reversal",
          amount: entry.amount,
          deltaMinor: -entry.deltaMinor,
          currency: entry.currency,
          reversalOf: entry._id,
          details: data.details,
          date: new Date(),
          idempotencyKey: scopedKey,
          requestHash,
        },
        session,
      );
    },
  );
}

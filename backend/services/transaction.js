import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { AppError } from "../utils/errors.js";
import { actorContext, audit } from "./actor.js";
export const hash = (data) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
export async function transaction(work) {
  return mongoose.connection.transaction(async (session) => {
    const result = await work(session);
    const actor = actorContext.getStore();
    if (actor?.action) await audit(actor.action, result?._id, session);
    return result;
  });
}
export async function idempotent(Model, key, data, work) {
  const actor = actorContext.getStore()?.user;
  if (actor) key = `${actor._id}:${key}`;
  const scopedKey = key;
  const requestHash = hash(data);
  const check = (record) => {
    if (record.requestHash !== requestHash)
      throw new AppError(
        "این درخواست قبلاً با معلومات متفاوت ثبت شده است. معاملهٔ جدید را آغاز کنید.",
        409,
      );
    return record;
  };
  const existing = await Model.findOne({ idempotencyKey: key });
  if (existing) return check(existing);
  try {
    return await transaction((session) =>
      work(session, requestHash, scopedKey),
    );
  } catch (error) {
    // A concurrent identical request may have consumed the last stock or debt
    // before this transaction retries. Recheck even when the error is not a
    // duplicate-key error so that a completed request always replays correctly.
    const saved = await Model.findOne({ idempotencyKey: key });
    if (saved) return check(saved);
    throw error;
  }
}

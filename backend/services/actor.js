import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";
import AuditEvent from "../models/AuditEvent.js";
export const actorContext = new AsyncLocalStorage();
export const actorSchema = {
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdByName: String,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedByName: String,
};
export function actorFields(create = false) {
  const actor = actorContext.getStore()?.user;
  if (!actor) return {};
  return {
    updatedBy: actor._id,
    updatedByName: actor.name,
    ...(create ? { createdBy: actor._id, createdByName: actor.name } : {}),
  };
}
export async function audit(
  action,
  target,
  session,
  details,
  user = actorContext.getStore()?.user,
) {
  if (!user) return;
  await AuditEvent.create(
    [
      {
        actorId: user._id,
        actorName: user.name,
        action,
        target: String(target || ""),
        details,
      },
    ],
    { session },
  );
}

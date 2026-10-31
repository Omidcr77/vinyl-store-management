import { AsyncLocalStorage } from "node:async_hooks";
import database from "../db/mysql.js";
import AuditEvent from "../models/AuditEvent.js";
export const actorContext = new AsyncLocalStorage();
export const actorSchema = {
  createdBy: { type: database.Schema.Types.ObjectId, ref: "User" },
  createdByName: String,
  createdByUsername: String,
  createdByRole: { type: String, enum: ["admin", "manager", "staff"] },
  updatedBy: { type: database.Schema.Types.ObjectId, ref: "User" },
  updatedByName: String,
  updatedByUsername: String,
  updatedByRole: { type: String, enum: ["admin", "manager", "staff"] },
};
export function actorFields(create = false) {
  const actor = actorContext.getStore()?.user;
  if (!actor) return {};
  return {
    updatedBy: actor._id,
    updatedByName: actor.name,
    updatedByUsername: actor.username,
    updatedByRole: actor.role,
    ...(create
      ? {
          createdBy: actor._id,
          createdByName: actor.name,
          createdByUsername: actor.username,
          createdByRole: actor.role,
        }
      : {}),
  };
}
export async function audit(
  action,
  target,
  session,
  details,
  user = actorContext.getStore()?.user,
  metadata = {},
) {
  if (!user) return;
  await AuditEvent.create(
    [
      {
        actorId: user._id,
        actorName: user.name,
        actorUsername: user.username,
        actorRole: user.role,
        targetLabel: metadata.targetLabel,
        action,
        target: String(target || ""),
        details,
      },
    ],
    { session },
  );
}

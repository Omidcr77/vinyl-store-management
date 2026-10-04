import database from "../db/mysql.js";
const schema = new database.Schema({
  kind: { type: String, required: true },
  recordId: { type: database.Schema.Types.ObjectId, required: true },
  idempotencyKey: String,
  record: { type: database.Schema.Types.Mixed, required: true },
  deletedAt: { type: Date, default: Date.now },
});
schema.index({ kind: 1, recordId: 1 }, { unique: true });
schema.index(
  { kind: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);
export default database.model("DeletedRecord", schema);

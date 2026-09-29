import mongoose from "mongoose";
const schema = new mongoose.Schema({
  kind: { type: String, required: true },
  recordId: { type: mongoose.Schema.Types.ObjectId, required: true },
  idempotencyKey: String,
  record: { type: mongoose.Schema.Types.Mixed, required: true },
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
export default mongoose.model("DeletedRecord", schema);

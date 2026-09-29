import mongoose from "mongoose";
const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  actorName: String,
  action: { type: String, required: true },
  target: String,
  details: String,
  date: { type: Date, default: Date.now, index: true },
});
export default mongoose.model("AuditEvent", schema);

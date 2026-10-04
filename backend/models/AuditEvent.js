import database from "../db/mysql.js";
const schema = new database.Schema({
  actorId: { type: database.Schema.Types.ObjectId, ref: "User", index: true },
  actorName: String,
  action: { type: String, required: true },
  target: String,
  details: String,
  date: { type: Date, default: Date.now, index: true },
});
export default database.model("AuditEvent", schema);

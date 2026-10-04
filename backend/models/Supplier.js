import database from "../db/mysql.js";
import { actorSchema } from "../services/actor.js";
const schema = new database.Schema(
  {
    ...actorSchema,
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    notes: { type: String, default: "" },
    balanceMinor: { type: Number, default: 0, validate: Number.isSafeInteger },
    currency: { type: String, required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);
schema.virtual("balance").get(function () {
  return this.balanceMinor / 100;
});
export default database.model("Supplier", schema);

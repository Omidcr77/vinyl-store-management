import database from "../db/mysql.js";
const schema = new database.Schema(
  {
    _id: String,
    userId: {
      type: database.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    authVersion: Number,
    csrf: String,
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);
export default database.model("LoginSession", schema);

import database from "../db/mysql.js";
// A shared transaction lock protects bootstrap and concurrent last-admin edits.
export default database.model(
  "AuthGuard",
  new database.Schema({ _id: String, revision: { type: Number, default: 0 } }),
);

import database from "../db/mysql.js";
export default database.model(
  "Counter",
  new database.Schema({ _id: String, value: { type: Number, default: 0 } }),
);

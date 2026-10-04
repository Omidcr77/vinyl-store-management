import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});
// Each suite uses a real isolated MySQL database. Production is never touched.
export class TestDatabase {
  static async create() {
    const configured = process.env.TEST_MYSQL_URL;
    if (!configured)
      throw new Error(
        "Set TEST_MYSQL_URL to a test-only MySQL user that can create/drop vinyl_test_* databases.",
      );
    const base = new URL(configured);
    if (
      base.pathname &&
      base.pathname !== "/" &&
      !base.pathname.startsWith("/vinyl_test_")
    )
      throw new Error(
        "TEST_MYSQL_URL must not point to a production database.",
      );
    base.pathname = "";
    const admin = await mysql.createConnection(base.toString());
    const name = "vinyl_test_" + randomUUID().replaceAll("-", "");
    try {
      await admin.query(
        `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
      );
    } finally {
      await admin.end();
    }
    base.pathname = "/" + name;
    return new TestDatabase(base.toString(), name);
  }
  constructor(uri, name) {
    this.uri = uri;
    this.name = name;
  }
  getUri() {
    return this.uri;
  }
  async stop() {
    if (!/^vinyl_test_[a-f0-9]{32}$/.test(this.name))
      throw new Error("Refusing to drop an unowned database.");
    const uri = new URL(this.uri);
    uri.pathname = "";
    const admin = await mysql.createConnection(uri.toString());
    try {
      await admin.query(`DROP DATABASE IF EXISTS \`${this.name}\``);
    } finally {
      await admin.end();
    }
  }
}

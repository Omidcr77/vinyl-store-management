// Document-shaped application models persisted in typed MySQL/InnoDB tables.
// BSON IDs remain stable for existing URLs and version-1 backup compatibility.
import mysql from "mysql2/promise";
import { ObjectId, EJSON } from "bson";
import { AsyncLocalStorage } from "node:async_hooks";
import { aggregate as runAggregate, Query as Filter } from "mingo";

const context = new AsyncLocalStorage();
const models = new Map();
let pool;
const quote = (name) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new Error("Invalid SQL identifier");
  return `\`${name}\``;
};
const clone = (v) => {
  if (v instanceof ObjectId) return new ObjectId(v.toHexString());
  if (v instanceof Date) return new Date(v);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object" && !(v instanceof RegExp))
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
  return v;
};
const plain = (v) => {
  if (v instanceof ObjectId) return String(v);
  if (v instanceof Date || v instanceof RegExp) return v;
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};
const descriptor = (v) =>
  typeof v === "function" || v instanceof Schema || Array.isArray(v)
    ? { type: v }
    : v;
const instance = (type) =>
  type === ObjectId
    ? "ObjectId"
    : type === String
      ? "String"
      : type === Number
        ? "Number"
        : type === Boolean
          ? "Boolean"
          : type === Date
            ? "Date"
            : "Mixed";
class Schema {
  static Types = { ObjectId, Mixed: Object };
  constructor(fields, options = {}) {
    this.options = options;
    this.fields = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, descriptor(v)]),
    );
    if (options._id !== false && !this.fields._id)
      this.fields._id = { type: ObjectId };
    this.virtuals = new Map();
    this._indexes = [];
    for (const [key, field] of Object.entries(this.fields)) {
      if (field?.unique || field?.index || field?.expires !== undefined)
        this.index(
          { [key]: 1 },
          { unique: !!field.unique, sparse: !!field.sparse },
        );
    }
    if (options.timestamps) {
      this.fields.createdAt = { type: Date };
      this.fields.updatedAt = { type: Date };
    }
    if (options._id !== false) this.fields.__v = { type: Number, default: 0 };
  }
  index(fields, options = {}) {
    this._indexes.push([fields, options]);
    return this;
  }
  indexes() {
    return this._indexes;
  }
  path(key) {
    const options = this.fields[key];
    return options && { options, instance: instance(options.type) };
  }
  virtual(key) {
    return { get: (fn) => this.virtuals.set(key, fn) };
  }
}
function cast(value, field) {
  if (value == null) return value;
  const type = field.type;
  if (type === ObjectId)
    return value instanceof ObjectId ? value : new ObjectId(String(value));
  if (type === Date) return value instanceof Date ? value : new Date(value);
  if (type === Number) return Number(value);
  if (type === Boolean) return value === "false" ? false : !!value;
  if (type === String) return field.trim ? String(value).trim() : String(value);
  if (Array.isArray(type))
    return (Array.isArray(value) ? value : [value]).map((v) =>
      type[0] instanceof Schema
        ? prepare(v, type[0])
        : cast(v, descriptor(type[0])),
    );
  return clone(value);
}
function prepare(data, schema, defaults = true) {
  const doc = {};
  for (const [key, field] of Object.entries(schema.fields)) {
    let value = data[key];
    if (defaults && value === undefined) {
      if (Object.hasOwn(field, "default"))
        value =
          typeof field.default === "function"
            ? field.default()
            : clone(field.default);
      else if (Array.isArray(field.type)) value = [];
    }
    if (value !== undefined) doc[key] = cast(value, field);
  }
  if (
    schema.options._id !== false &&
    doc._id === undefined &&
    schema.fields._id.type === ObjectId
  )
    doc._id = new ObjectId();
  return doc;
}
function validation(data, schema) {
  for (const [key, field] of Object.entries(schema.fields)) {
    const v = data[key];
    if (field.required && (v == null || v === ""))
      return new Error(`Required field: ${key}`);
    if (v == null) continue;
    if (
      field.type === Number &&
      (!Number.isFinite(v) ||
        (field.min !== undefined && v < field.min) ||
        (field.max !== undefined && v > field.max))
    )
      return new Error(`Invalid number: ${key}`);
    if (field.type === Date && !Number.isFinite(v.getTime()))
      return new Error(`Invalid date: ${key}`);
    if (field.enum && !field.enum.includes(v))
      return new Error(`Invalid choice: ${key}`);
    if (field.validate && !field.validate(v))
      return new Error(`Invalid value: ${key}`);
    if (Array.isArray(field.type) && field.type[0] instanceof Schema)
      for (const item of v) {
        const error = validation(item, field.type[0]);
        if (error) return error;
      }
  }
}
const executor = (session) => session || context.getStore() || pool;
export const connection = {
  readyState: 0,
  async transaction(work) {
    if (context.getStore()) return work(context.getStore());
    if (!pool) throw new Error("MySQL is not connected");
    for (let attempt = 0; ; attempt++) {
      const session = await pool.getConnection();
      try {
        await session.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        await session.beginTransaction();
        // A database row lock serializes financial writes across API processes.
        // It also provides a consistent, complete snapshot for backups/restores.
        await session.query("SELECT id FROM _store_lock WHERE id=1 FOR UPDATE");
        const result = await context.run(session, () => work(session));
        await session.commit();
        return result;
      } catch (error) {
        await session.rollback().catch(() => {});
        if (
          attempt < 2 &&
          ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error.code)
        )
          continue;
        throw error;
      } finally {
        session.release();
      }
    }
  },
  db: {
    listCollections() {
      return {
        toArray: async () => {
          const [rows] = await pool.query("SHOW TABLES");
          return rows
            .map((row) => ({ name: Object.values(row)[0] }))
            .filter((row) => !row.name.startsWith("_store_"));
        },
      };
    },
    collection(name) {
      const Model = [...models.values()].find((m) => m.table === name);
      if (!Model) throw new Error(`Unknown table: ${name}`);
      return Model.collection;
    },
  },
};
export async function connect(uri) {
  if (!uri || !/^mysql:\/\//.test(uri))
    throw new Error(
      "Set MYSQL_URL to your MySQL database connection URL in backend/.env.",
    );
  if (pool) await disconnect();
  const url = new URL(uri);
  pool = mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    timezone: "Z",
    charset: "utf8mb4",
    connectionLimit: 10,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    multipleStatements: false,
  });
  try {
    await pool.query(
      "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
    );
    await pool.query(
      "CREATE TABLE IF NOT EXISTS _store_lock (id INT PRIMARY KEY) ENGINE=InnoDB",
    );
    await pool.query("INSERT IGNORE INTO _store_lock (id) VALUES (1)");
    connection.readyState = 1;
    connection.name = url.pathname.slice(1);
    return connection;
  } catch (error) {
    await disconnect();
    throw error;
  }
}
export async function disconnect() {
  const current = pool;
  pool = undefined;
  connection.readyState = 0;
  if (current) await current.end();
}
export async function sql(statement, parameters = [], session) {
  return executor(session).query(statement, parameters);
}
class UnsupportedFilter extends Error {}
function where(Model, filter = {}, parameters = []) {
  const terms = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$or" || key === "$and") {
      terms.push(
        "(" +
          value
            .map((v) => where(Model, v, parameters))
            .join(key === "$or" ? " OR " : " AND ") +
          ")",
      );
      continue;
    }
    if (!Model.schema.fields[key]) throw new UnsupportedFilter();
    const col = quote(key);
    const bind = (v) => {
      parameters.push(
        v instanceof ObjectId
          ? String(v)
          : typeof v === "boolean"
            ? Number(v)
            : v,
      );
      return "?";
    };
    const eq = (v, not = false) =>
      v == null
        ? `${col} IS ${not ? "NOT " : ""}NULL`
        : not
          ? `(${col} <> ${bind(v)} OR ${col} IS NULL)`
          : `${col} = ${bind(v)}`;
    if (value instanceof RegExp) {
      terms.push(
        `${col} REGEXP ${bind((value.ignoreCase ? "(?i)" : "") + value.source)}`,
      );
      continue;
    }
    if (
      value &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !(value instanceof ObjectId)
    ) {
      for (const [op, v] of Object.entries(value)) {
        if (op === "$eq" || op === "$ne") terms.push(eq(v, op === "$ne"));
        else if (["$gt", "$gte", "$lt", "$lte"].includes(op))
          terms.push(
            `${col} ${{ $gt: ">", $gte: ">=", $lt: "<", $lte: "<=" }[op]} ${bind(v)}`,
          );
        else if (op === "$in" || op === "$nin")
          terms.push(
            v.length
              ? "(" +
                  v
                    .map((x) => eq(x, op === "$nin"))
                    .join(op === "$in" ? " OR " : " AND ") +
                  ")"
              : op === "$in"
                ? "0=1"
                : "1=1",
          );
        else if (op === "$exists") {
          const exists = `(${col} IS NOT NULL OR JSON_CONTAINS(__meta, ${bind(JSON.stringify(key))}, '$.nulls'))`;
          terms.push(v ? exists : `NOT ${exists}`);
        } else throw new UnsupportedFilter();
      }
    } else terms.push(eq(value));
  }
  return terms.length ? terms.join(" AND ") : "1=1";
}
function decode(Model, row) {
  const meta =
    typeof row.__meta === "string" ? JSON.parse(row.__meta) : row.__meta || {};
  const doc = EJSON.deserialize(meta.extra || {}, { relaxed: true });
  for (const [key, field] of Object.entries(Model.schema.fields)) {
    const v = row[key];
    if (v == null) {
      if (meta.nulls?.includes(key)) doc[key] = null;
      continue;
    }
    if (Array.isArray(field.type) || field.type === Object)
      doc[key] = EJSON.parse(typeof v === "string" ? v : JSON.stringify(v), {
        relaxed: true,
      });
    else doc[key] = cast(v, field);
  }
  return doc;
}
function encode(Model, doc) {
  const values = [],
    nulls = [],
    extra = {};
  for (const [key, field] of Object.entries(Model.schema.fields)) {
    const v = doc[key];
    if (v === null) nulls.push(key);
    values.push(
      v == null
        ? null
        : Array.isArray(field.type) || field.type === Object
          ? EJSON.stringify(v, { relaxed: false })
          : v instanceof ObjectId
            ? String(v)
            : typeof v === "boolean"
              ? Number(v)
              : v,
    );
  }
  for (const [k, v] of Object.entries(doc))
    if (!Model.schema.fields[k] && v !== undefined) extra[k] = v;
  values.push(
    JSON.stringify({
      nulls,
      extra: EJSON.serialize(extra, { relaxed: false }),
    }),
  );
  return values;
}
async function read(Model, filter = {}, session, opts = {}) {
  let condition,
    params = [],
    fallback = false;
  try {
    condition = where(Model, filter, params);
  } catch (e) {
    if (!(e instanceof UnsupportedFilter)) throw e;
    condition = "1=1";
    params = [];
    fallback = true;
  }
  let statement = `SELECT * FROM ${quote(Model.table)} WHERE ${condition}`;
  if (opts.sort && !fallback)
    statement +=
      " ORDER BY " +
      Object.entries(opts.sort)
        .map(([key, order]) => {
          if (!Model.schema.fields[key])
            throw new Error("Unsupported sort field");
          return `${quote(key)} ${order === -1 ? "DESC" : "ASC"}`;
        })
        .join(",");
  if (!fallback && opts.limit)
    statement += ` LIMIT ${Number(opts.limit)} OFFSET ${Number(opts.skip || 0)}`;
  else if (!fallback && opts.skip)
    statement += ` LIMIT 18446744073709551615 OFFSET ${Number(opts.skip)}`;
  if (context.getStore() || session) statement += " FOR UPDATE";
  const [rows] = await executor(session).query(statement, params);
  let docs = rows.map((row) => decode(Model, row));
  if (fallback) {
    const matcher = new Filter(plain(filter));
    docs = docs.filter((doc) => matcher.test(plain(doc)));
    if (opts.sort)
      docs.sort((a, b) => {
        for (const [k, d] of Object.entries(opts.sort)) {
          const av = a[k] instanceof ObjectId ? String(a[k]) : a[k],
            bv = b[k] instanceof ObjectId ? String(b[k]) : b[k];
          if (av < bv) return -d;
          if (av > bv) return d;
        }
        return 0;
      });
    if (opts.skip) docs = docs.slice(opts.skip);
    if (opts.limit) docs = docs.slice(0, opts.limit);
  }
  return docs;
}
async function writeRaw(Model, doc, session, insert = false) {
  const keys = [...Object.keys(Model.schema.fields), "__meta"];
  const values = encode(Model, doc);
  if (insert)
    await executor(session).query(
      `INSERT INTO ${quote(Model.table)} (${keys.map(quote)}) VALUES (${keys.map(() => "?")})`,
      values,
    );
  else
    await executor(session).query(
      `UPDATE ${quote(Model.table)} SET ${keys.map((k) => `${quote(k)}=?`).join(",")} WHERE _id=?`,
      [...values, String(doc._id)],
    );
}
const write = (work, session) =>
  session || context.getStore()
    ? work(executor(session))
    : connection.transaction(work);
function updateDoc(data, update, insert = false) {
  if (Array.isArray(update))
    return runAggregate([plain(data)], plain(update))[0];
  const operators = Object.keys(update).some((k) => k.startsWith("$"));
  if (!operators) return { ...data, ...update };
  const result = {
    ...data,
    ...update.$set,
    ...(insert ? update.$setOnInsert : {}),
  };
  for (const [k, v] of Object.entries(update.$inc || {}))
    result[k] = (Number(data[k]) || 0) + v;
  for (const k of Object.keys(update.$unset || {})) delete result[k];
  return result;
}
class Query {
  constructor(Model, kind, filter = {}, update, options = {}) {
    Object.assign(this, { Model, kind, filter, update, options });
  }
  session(value) {
    this.options.session = value;
    return this;
  }
  sort(value) {
    this.options.sort = value;
    return this;
  }
  skip(value) {
    this.options.skip = value;
    return this;
  }
  limit(value) {
    this.options.limit = value;
    return this;
  }
  lean() {
    this.options.lean = true;
    return this;
  }
  select(value) {
    this.options.select = value;
    return this;
  }
  exec() {
    return this.execute();
  }
  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
  catch(reject) {
    return this.execute().catch(reject);
  }
  async *cursor() {
    const result = await this.execute();
    for (const doc of result) yield doc;
  }
  [Symbol.asyncIterator]() {
    return this.cursor();
  }
  toArray() {
    return this.execute();
  }
  format(doc) {
    if (!doc) return null;
    if (!this.options.raw)
      for (const [key, field] of Object.entries(this.Model.schema.fields))
        if (
          field.select === false &&
          !String(this.options.select || "")
            .split(/\s+/)
            .includes("+" + key)
        )
          delete doc[key];
    return this.options.lean || this.options.raw
      ? doc
      : new this.Model(doc, { persisted: true, session: this.options.session });
  }
  async execute() {
    const { Model, kind, filter, options } = this;
    if (kind === "aggregate") {
      return write(async (session) => {
        const sources = {},
          needed = new Set([Model.table]);
        const collect = (value) => {
          if (!value || typeof value !== "object") return;
          if (value.$lookup?.from) needed.add(value.$lookup.from);
          for (const item of Object.values(value)) collect(item);
        };
        collect(this.update);
        for (const model of models.values())
          if (needed.has(model.table))
            sources[model.table] = (await read(model, {}, session)).map(plain);
        let pipeline = plain(this.update);
        if (options.sort) pipeline = [...pipeline, { $sort: options.sort }];
        return runAggregate(sources[Model.table], pipeline, {
          collectionResolver: (name) => sources[name] || [],
        });
      }, options.session);
    }
    if (kind === "count") {
      const params = [];
      try {
        const condition = where(Model, filter, params);
        const [[row]] = await executor(options.session).query(
          `SELECT COUNT(*) AS n FROM ${quote(Model.table)} WHERE ${condition}`,
          params,
        );
        return Number(row.n);
      } catch (e) {
        if (!(e instanceof UnsupportedFilter)) throw e;
        return (await read(Model, filter, options.session)).length;
      }
    }
    if (
      [
        "updateOne",
        "updateMany",
        "findOneAndUpdate",
        "deleteOne",
        "deleteMany",
        "findOneAndDelete",
      ].includes(kind)
    ) {
      return write(async (session) => {
        const rows = await read(
          Model,
          filter,
          session,
          kind.includes("Many") ? {} : { limit: 1, sort: options.sort },
        );
        if (kind.includes("delete") || kind === "findOneAndDelete") {
          for (const doc of rows)
            await session.query(
              `DELETE FROM ${quote(Model.table)} WHERE _id=?`,
              [String(doc._id)],
            );
          return kind === "findOneAndDelete"
            ? this.format(rows[0])
            : { deletedCount: rows.length };
        }
        let result;
        for (const doc of rows) {
          const changed = updateDoc(doc, this.update);
          const updated = {
            ...changed,
            ...prepare(changed, Model.schema, false),
          };
          if (Model.schema.options.timestamps && options.timestamps !== false)
            updated.updatedAt = new Date();
          const error = validation(updated, Model.schema);
          if (error) {
            error.name = "ValidationError";
            throw error;
          }
          await writeRaw(Model, updated, session);
          result = options.new ? updated : doc;
        }
        if (!rows.length && options.upsert) {
          const base = Object.fromEntries(
            Object.entries(filter).filter(
              ([k, v]) =>
                !k.startsWith("$") &&
                (v == null ||
                  typeof v !== "object" ||
                  v instanceof ObjectId ||
                  v instanceof Date),
            ),
          );
          const created = new Model(updateDoc(base, this.update, true));
          const docs = await Model.create([created], {
            session,
            timestamps: options.timestamps,
          });
          result = options.new ? docs[0].toObject({ virtuals: false }) : null;
          return kind === "findOneAndUpdate"
            ? this.format(result)
            : { matchedCount: 0, modifiedCount: 0, upsertedId: docs[0]._id };
        }
        return kind === "findOneAndUpdate"
          ? this.format(result)
          : { matchedCount: rows.length, modifiedCount: rows.length };
      }, options.session);
    }
    const rows = await read(Model, filter, options.session, {
      ...options,
      limit: ["one", "exists"].includes(kind) ? 1 : options.limit,
    });
    if (kind === "exists") return rows[0] ? { _id: rows[0]._id } : null;
    return kind === "one"
      ? this.format(rows[0])
      : rows.map((doc) => this.format(doc));
  }
}
export function model(name, schema) {
  if (models.has(name)) return models.get(name);
  const table =
    name === "Settings"
      ? "settings"
      : name.replace(/([a-z])y$/, "$1ies").toLowerCase() +
        (name.endsWith("y") ? "" : "s");
  class Model {
    constructor(data = {}, state = {}) {
      Object.assign(this, prepare(data, schema));
      Object.defineProperty(this, "_state", { value: state, writable: true });
    }
    static schema = schema;
    static table = table;
    static modelName = name;
    static async init() {
      const indexed = new Set(
        schema.indexes().flatMap(([fields]) => Object.keys(fields)),
      );
      const sqlType = ([key, field]) =>
        key === "_id"
          ? "VARCHAR(128)"
          : field.type === ObjectId
            ? "VARCHAR(24)"
            : field.type === String
              ? indexed.has(key)
                ? "VARCHAR(255)"
                : "TEXT"
              : field.type === Date
                ? "DATETIME(3)"
                : field.type === Boolean
                  ? "BOOLEAN"
                  : field.type === Number
                    ? [
                        "balanceMinor",
                        "deltaMinor",
                        "rollNumber",
                        "value",
                        "revision",
                        "__v",
                        "authVersion",
                      ].includes(key)
                      ? "BIGINT"
                      : "DOUBLE"
                    : "JSON";
      const definitions = Object.entries(schema.fields).map(
        ([key, field]) =>
          `${quote(key)} ${sqlType([key, field])} ${key === "_id" || field.required ? "NOT NULL" : "NULL"}`,
      );
      definitions.push("__meta JSON NOT NULL", "PRIMARY KEY (_id)");
      schema.indexes().forEach(([fields, options], i) => {
        let keys = Object.keys(fields);
        if (keys.some((k) => !schema.fields[k])) return;
        if (options.partialFilterExpression?.source) {
          keys = keys.map((k, j) => {
            const gen = `_store_unique_${i}_${j}`;
            definitions.push(
              `${quote(gen)} ${sqlType([k, schema.fields[k]])} GENERATED ALWAYS AS (CASE WHEN source='sale' THEN ${quote(k)} ELSE NULL END) STORED`,
            );
            return gen;
          });
        }
        definitions.push(
          `${options.unique ? "UNIQUE " : ""}KEY ${quote(`idx_${i}`)} (${keys.map(quote).join(",")})`,
        );
      });
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${quote(table)} (${definitions.join(",")}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
      );
      return Model;
    }
    static find(filter = {}) {
      return new Query(Model, "find", filter);
    }
    static findOne(filter = {}) {
      return new Query(Model, "one", filter);
    }
    static findById(id) {
      return Model.findOne({ _id: id });
    }
    static exists(filter = {}) {
      return new Query(Model, "exists", filter);
    }
    static countDocuments(filter = {}) {
      return new Query(Model, "count", filter);
    }
    static aggregate(pipeline) {
      return new Query(Model, "aggregate", {}, pipeline);
    }
    static findOneAndUpdate(filter, update, opts = {}) {
      return new Query(Model, "findOneAndUpdate", filter, update, opts);
    }
    static findByIdAndUpdate(id, update, opts = {}) {
      return Model.findOneAndUpdate({ _id: id }, update, opts);
    }
    static findOneAndDelete(filter, opts = {}) {
      return new Query(Model, "findOneAndDelete", filter, undefined, opts);
    }
    static findByIdAndDelete(id, opts = {}) {
      return Model.findOneAndDelete({ _id: id }, opts);
    }
    static updateOne(filter, update, opts = {}) {
      return new Query(Model, "updateOne", filter, update, opts);
    }
    static updateMany(filter, update, opts = {}) {
      return new Query(Model, "updateMany", filter, update, opts);
    }
    static deleteOne(filter = {}, opts = {}) {
      return new Query(Model, "deleteOne", filter, undefined, opts);
    }
    static deleteMany(filter = {}, opts = {}) {
      return new Query(Model, "deleteMany", filter, undefined, opts);
    }
    static async create(data, opts = {}) {
      const array = Array.isArray(data);
      const docs = await write(async (session) => {
        const result = [];
        for (const input of array ? data : [data]) {
          const doc = input instanceof Model ? input : new Model(input);
          if (schema.options.timestamps && opts.timestamps !== false) {
            doc.createdAt ||= new Date();
            doc.updatedAt ||= new Date();
          }
          const error = doc.validateSync();
          if (error) throw error;
          await Model.collection.insertOne(doc.toObject({ virtuals: false }), {
            session,
          });
          doc._state = { persisted: true, session: opts.session };
          result.push(doc);
        }
        return result;
      }, opts.session);
      return array ? docs : docs[0];
    }
    static insertMany(data, opts = {}) {
      return Model.create(data, opts);
    }
    static async bulkWrite(operations, opts = {}) {
      return write(
        async (session) => {
          for (const op of operations)
            if (op.updateOne)
              await Model.updateOne(op.updateOne.filter, op.updateOne.update, {
                ...op.updateOne,
                session,
              });
            else throw new Error("Unsupported bulk operation");
        },
        { ...opts }.session,
      );
    }
    validateSync() {
      try {
        const error = validation(this, schema);
        if (error) error.name = "ValidationError";
        return error;
      } catch (error) {
        error.name = "ValidationError";
        return error;
      }
    }
    toObject(options = {}) {
      const doc = Object.fromEntries(
        Object.entries(this).map(([k, v]) => [k, clone(v)]),
      );
      if (options.virtuals ?? schema.options.toObject?.virtuals) {
        for (const [k, fn] of schema.virtuals) doc[k] = fn.call(this);
        doc.id = String(this._id);
      }
      return doc;
    }
    toJSON() {
      return this.toObject({ virtuals: !!schema.options.toJSON?.virtuals });
    }
    async save(opts = {}) {
      if (!this._state.persisted) return Model.create(this, opts);
      return write(async (session) => {
        const existing = (
          await read(Model, { _id: this._id }, session, { limit: 1 })
        )[0];
        if (!existing) throw new Error("Record no longer exists");
        const doc = { ...existing, ...this.toObject({ virtuals: false }) };
        for (const [k, v] of Object.entries(doc))
          if (v === undefined) delete doc[k];
        const prepared = { ...doc, ...prepare(doc, schema, false) };
        const error = validation(prepared, schema);
        if (error) {
          error.name = "ValidationError";
          throw error;
        }
        if (schema.options.timestamps) prepared.updatedAt = new Date();
        await writeRaw(Model, prepared, session);
        Object.assign(this, prepared);
        return this;
      }, opts.session || this._state.session);
    }
  }
  for (const [key, fn] of schema.virtuals)
    Object.defineProperty(Model.prototype, key, {
      get() {
        return fn.call(this);
      },
    });
  Model.collection = {
    name: table,
    find(filter = {}, opts = {}) {
      return new Query(Model, "find", filter, undefined, {
        ...opts,
        raw: true,
      });
    },
    async insertOne(doc, opts = {}) {
      return write(async (session) => {
        await writeRaw(Model, doc, session, true);
        return { insertedId: doc._id };
      }, opts.session);
    },
    async insertMany(docs, opts = {}) {
      return write(async (session) => {
        for (const doc of docs) await this.insertOne(doc, { session });
        return { insertedCount: docs.length };
      }, opts.session);
    },
    deleteMany(filter = {}, opts = {}) {
      return Model.deleteMany(filter, opts);
    },
  };
  models.set(name, Model);
  return Model;
}
export const Types = { ObjectId };
export { Schema, ObjectId, EJSON };
export default { Schema, Types, model, connect, disconnect, connection, sql };

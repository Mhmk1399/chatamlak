// Small database-independent command vocabulary for existing administration and
// media services. Commands execute as MongoDB operations, never as SQL. The
// historical toSQL method name only lets existing injected wrappers pass them
// through without changing HTTP contracts or importing a live database.
export class DocumentQuery {
  constructor(collection) { this.collection = collection; this.conditions = []; this.fields = []; this.sort = {}; this.operation = "select"; }
  where(column, operator, value) { return this.condition("and", column, operator, value); }
  andWhere(...args) { return this.where(...args); }
  orWhere(column, operator, value) { return this.condition("or", column, operator, value); }
  condition(boolean, column, operator, value) {
    let filter;
    if (typeof column === "function") { const group = new DocumentQuery(this.collection); column.call(group, group); filter = group.filter(); }
    else if (typeof column === "object" && column != null) filter = column;
    else {
      if (value === undefined) { value = operator; operator = "="; }
      if (operator === "like" || operator === "not like") {
        const source = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
        const expression = new RegExp(`^${source}$`, "i");
        filter = { [column]: operator === "like" ? expression : { $not: expression } };
      } else {
        const op = { "=": "$eq", "!=": "$ne", "<>": "$ne", ">": "$gt", ">=": "$gte", "<": "$lt", "<=": "$lte" }[operator];
        if (!op) throw new Error(`Unsupported document comparison: ${operator}`);
        filter = { [column]: op === "$eq" ? value : { [op]: value } };
      }
    }
    this.conditions.push({ boolean, filter }); return this;
  }
  filter() { let result = {}; for (const { boolean, filter } of this.conditions) result = !Object.keys(result).length ? filter : { [boolean === "or" ? "$or" : "$and"]: [result, filter] }; return result; }
  whereIn(key, values) { return this.where({ [key]: { $in: values } }); }
  orWhereIn(key, values) { return this.orWhere({ [key]: { $in: values } }); }
  whereNotIn(key, values) { return this.where({ [key]: { $nin: values } }); }
  whereNull(key) { return this.where(key, null); }
  orWhereNull(key) { return this.orWhere(key, null); }
  whereNotNull(key) { return this.where(key, "!=", null); }
  whereNot(key, value) { return this.where(key, "!=", value); }
  select(...fields) { this.fields.push(...fields.flat()); return this; }
  first(...fields) { if (fields.length) this.select(...fields); this.take = 1; return this; }
  limit(value) { this.take = Number(value); return this; }
  offset(value) { this.skip = Number(value); return this; }
  orderBy(key, direction = "asc") { this.sort[key] = String(direction).toLowerCase() === "desc" ? -1 : 1; return this; }
  count(value = "* as count") { this.counter = typeof value === "object" ? Object.keys(value)[0] : String(value).split(/\s+as\s+/i)[1] || "count"; return this; }
  distinct(...fields) { this.distinctFields = fields.flat(); return this.select(...fields); }
  insert(value) { this.operation = "insert"; this.values = Array.isArray(value) ? value : [value]; return this; }
  update(value) { this.operation = "update"; this.values = value; return this; }
  del() { this.operation = "delete"; return this; }
  delete() { return this.del(); }
  onConflict(keys) { this.conflict = Array.isArray(keys) ? keys : [keys]; return this; }
  ignore() { this.ignoreConflict = true; return this; }
  merge(patch) { this.mergePatch = patch ?? true; return this; }
  toSQL() { return { sql: this, bindings: [] }; }
}
// Historical fixtures and the explicit SQL import tooling can still construct
// their old commands. The application entry point rejects SQL DB_CLIENT modes.
// No SQL driver is imported for the MongoDB application path.
const legacyQuery = ["sqlite3", "sqlite", "postgres", "postgresql", "pg"].includes(String(process.env.DB_CLIENT || "").toLowerCase())
  ? (await import("./knex.js")).dbKnex : null;
export const dbKnex = legacyQuery || ((name) => new DocumentQuery(name));
dbKnex.now = () => new Date().toISOString();
dbKnex.addDays = (field, days) => legacyQuery ? legacyQuery.raw("datetime(??, '+' || ? || ' days')", [field, days]) : ({ $dateToString: { date: { $dateAdd: { startDate: { $toDate: `$${field}` }, unit: "day", amount: Number(days) } }, format: "%Y-%m-%dT%H:%M:%S.%LZ", timezone: "UTC" } });
dbKnex.literal = (value, name) => legacyQuery ? legacyQuery.raw("? as ??", [value, name]) : ({ $literal: value, name });
if (!legacyQuery) dbKnex.union = (queries) => ({ union: queries, first() { this.take = 1; return this; }, toSQL() { return { sql: this, bindings: [] }; } });

export function createDocumentExecutor(store) {
  const value = (item) => typeof item === "function" ? item() : item;
  async function execute(query) {
    if (query?.union) { const rows = []; for (const part of query.union) { rows.push(...await execute(part)); if (query.take && rows.length) break; } return query.take ? rows.slice(0, query.take) : rows; }
    if (!(query instanceof DocumentQuery)) throw new Error("This database accepts document commands only. Legacy SQL is supported only by the migration tool.");
    const { collection, operation } = query, filter = query.filter();
    if (operation === "delete") return store.remove(collection, filter);
    if (operation === "update") {
      const values = Object.fromEntries(Object.entries(query.values).map(([key, val]) => [key, value(val)]));
      const expression = Object.values(values).some((val) => val && typeof val === "object" && Object.keys(val).some((key) => key.startsWith("$")));
      return store.update(collection, filter, expression ? [{ $set: Object.fromEntries(Object.entries(values).map(([key, val]) => [key, val && typeof val === "object" ? val : { $literal: val }])) }] : values);
    }
    if (operation === "insert") {
      let count = 0;
      for (const input of query.values) {
        const row = Object.fromEntries(Object.entries(input).map(([key, val]) => [key, value(val)]));
        if (query.conflict) {
          const keys = Object.fromEntries(query.conflict.map((key) => [key, row[key]]));
          if (query.ignoreConflict) count += await store.ignore(collection, keys, row);
          else { await store.upsert(collection, keys, query.mergePatch === true ? row : query.mergePatch || row, row); count += 1; }
        } else { await store.insert(collection, row); count += 1; }
      }
      return count;
    }
    if (query.counter) return [{ [query.counter]: await store.count(collection, filter) }];
    const options = { ...(Object.keys(query.sort).length ? { sort: query.sort } : {}), ...(query.take ? { limit: query.take } : {}), ...(query.skip ? { skip: query.skip } : {}) };
    const rows = await store.many(collection, filter, options);
    let result = rows;
    if (query.fields.length && !query.fields.includes("*")) result = rows.map((row) => Object.fromEntries(query.fields.map((field) => {
      if (typeof field === "number") return [String(field), field];
      if (typeof field === "object" && "$literal" in field) return [field.name, field.$literal];
      const [source, alias] = field.split(/\s+as\s+/i); return [alias || source, row[source]];
    })));
    if (query.distinctFields) result = [...new Map(result.map((row) => [JSON.stringify(row), row])).values()];
    return result;
  }
  return {
    run: execute,
    getAll: execute,
    async getRow(query) { return (await execute(query))[0] || null; },
  };
}

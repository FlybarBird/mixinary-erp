import { getLocalDb, newId } from "@/lib/local/db";

type Row = Record<string, unknown>;

const JSON_FIELDS: Record<string, string[]> = {
  ai_jobs: ["input", "result"],
  price_fetch_results: ["raw"],
  quote_extracted_lines: ["raw"],
};

const BOOL_FIELDS: Record<string, string[]> = {
  price_sources: ["enabled", "supports_search"],
  price_fetch_results: ["accepted"],
  quote_extracted_lines: ["selected"],
};

function decodeRow(table: string, row: Row | undefined): Row | null {
  if (!row) return null;
  const out = { ...row };
  for (const field of JSON_FIELDS[table] ?? []) {
    if (typeof out[field] === "string" && out[field]) {
      try {
        out[field] = JSON.parse(String(out[field]));
      } catch {
        // keep string
      }
    }
  }
  for (const field of BOOL_FIELDS[table] ?? []) {
    if (out[field] !== undefined && out[field] !== null) {
      out[field] = Boolean(out[field]);
    }
  }
  return out;
}

function encodeValue(table: string, key: string, value: unknown) {
  if (value === undefined) return null;
  if ((JSON_FIELDS[table] ?? []).includes(key)) {
    return value == null ? null : JSON.stringify(value);
  }
  if ((BOOL_FIELDS[table] ?? []).includes(key)) {
    if (value == null) return null;
    return value ? 1 : 0;
  }
  return value;
}

class QueryBuilder {
  private table: string;
  private action: "select" | "insert" | "update" | "upsert" | "delete" =
    "select";
  private columns = "*";
  private filters: Array<{ sql: string; value: unknown }> = [];
  private orderClause = "";
  private limitCount: number | null = null;
  private singleMode: "none" | "single" | "maybe" = "none";
  private payload: Row | Row[] | null = null;
  private upsertConflict: string | null = null;
  private embed: string | null = null;
  private returning = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*") {
    // Supabase chain: insert/update().select().single() means "return rows"
    if (
      this.action === "insert" ||
      this.action === "update" ||
      this.action === "upsert"
    ) {
      this.returning = true;
      this.columns = columns.includes("(") ? "*" : columns;
      return this;
    }

    this.action = "select";
    // Support simple embeds like "*, clients(name)"
    if (columns.includes("(")) {
      this.embed = columns;
      this.columns = "*";
    } else {
      this.columns = columns;
    }
    return this;
  }

  insert(values: Row | Row[]) {
    this.action = "insert";
    this.payload = values;
    return this;
  }

  update(values: Row) {
    this.action = "update";
    this.payload = values;
    return this;
  }

  upsert(values: Row | Row[], opts?: { onConflict?: string }) {
    this.action = "upsert";
    this.payload = values;
    this.upsertConflict = opts?.onConflict ?? null;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ sql: `${column} = ?`, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    if (!values.length) {
      this.filters.push({ sql: "1 = 0", value: null });
      return this;
    }
    const placeholders = values.map(() => "?").join(", ");
    this.filters.push({
      sql: `${column} in (${placeholders})`,
      value: values,
    });
    return this;
  }

  ilike(column: string, pattern: string) {
    if (pattern.includes("%")) {
      this.filters.push({
        sql: `lower(${column}) like lower(?)`,
        value: pattern,
      });
    } else {
      this.filters.push({
        sql: `lower(${column}) = lower(?)`,
        value: pattern,
      });
    }
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    const dir = opts?.ascending === false ? "desc" : "asc";
    this.orderClause = ` order by ${column} ${dir}`;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.singleMode = "single";
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null | { message: string } }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private whereSql() {
    if (!this.filters.length) return { sql: "", params: [] as unknown[] };
    const params: unknown[] = [];
    const parts = this.filters.map((f) => {
      if (Array.isArray(f.value)) {
        params.push(...f.value);
      } else if (f.value !== null || f.sql !== "1 = 0") {
        if (f.sql !== "1 = 0") params.push(f.value);
      }
      return f.sql;
    });
    return { sql: ` where ${parts.join(" and ")}`, params };
  }

  private attachEmbeds(rows: Row[]) {
    if (!this.embed || !rows.length) return rows;
    const db = getLocalDb();
    return rows.map((row) => {
      const out = { ...row };
      // clients(name)
      if (this.embed!.includes("clients(") && row.client_id) {
        const client = db
          .prepare("select name from clients where id = ?")
          .get(row.client_id) as Row | undefined;
        out.clients = client ? { name: client.name } : null;
      }
      // projects(...)
      if (this.embed!.includes("projects(") && row.project_id) {
        const project = db
          .prepare(
            "select id, project_number, name, default_override_pct from projects where id = ?",
          )
          .get(row.project_id) as Row | undefined;
        out.projects = project ?? null;
      }
      // vendors(code, name)
      if (this.embed!.includes("vendors(") && row.vendor_id) {
        const vendor = db
          .prepare("select code, name from vendors where id = ?")
          .get(row.vendor_id) as Row | undefined;
        out.vendors = vendor ?? null;
      }
      // line_items(...) on price_fetch_results
      if (
        this.embed!.includes("line_items(") &&
        row.line_item_id &&
        this.table === "price_fetch_results"
      ) {
        const line = db
          .prepare("select description, msrp from line_items where id = ?")
          .get(row.line_item_id) as Row | undefined;
        out.line_items = line ?? null;
      }
      // matched line alias: line_items:matched_line_item_id(...)
      if (
        this.embed!.includes("matched_line_item_id") &&
        row.matched_line_item_id
      ) {
        const line = db
          .prepare("select description, quote from line_items where id = ?")
          .get(row.matched_line_item_id) as Row | undefined;
        out.line_items = line ?? null;
      }
      return out;
    });
  }

  private async execute() {
    try {
      const db = getLocalDb();
      if (this.action === "select") {
        const { sql: where, params } = this.whereSql();
        let sql = `select ${this.columns === "*" ? "*" : this.columns} from ${this.table}${where}${this.orderClause}`;
        if (this.limitCount != null) sql += ` limit ${this.limitCount}`;
        const rows = (db.prepare(sql).all(...params) as Row[]).map(
          (r) => decodeRow(this.table, r)!,
        );
        const withEmbeds = this.attachEmbeds(rows);
        if (this.singleMode === "single") {
          if (!withEmbeds[0]) {
            return { data: null, error: { message: "No rows" } };
          }
          return { data: withEmbeds[0], error: null };
        }
        if (this.singleMode === "maybe") {
          return { data: withEmbeds[0] ?? null, error: null };
        }
        return { data: withEmbeds, error: null };
      }

      if (this.action === "insert") {
        const rows = Array.isArray(this.payload)
          ? this.payload
          : [this.payload!];
        const inserted: Row[] = [];
        for (const row of rows) {
          const data = { ...row };
          if (!data.id) data.id = newId();
          const keys = Object.keys(data);
          const values = keys.map((k) =>
            encodeValue(this.table, k, data[k]),
          );
          const sql = `insert into ${this.table} (${keys.join(",")}) values (${keys.map(() => "?").join(",")})`;
          db.prepare(sql).run(...values);
          inserted.push(decodeRow(this.table, data)!);
        }
        if (this.singleMode !== "none") {
          return { data: inserted[0], error: null };
        }
        return { data: inserted, error: null };
      }

      if (this.action === "update") {
        const data = this.payload as Row;
        const keys = Object.keys(data).filter((k) => data[k] !== undefined);
        if (!keys.length) return { data: null, error: null };
        const sets = keys.map((k) => `${k} = ?`).join(", ");
        const values = keys.map((k) => encodeValue(this.table, k, data[k]));
        const { sql: where, params } = this.whereSql();
        db.prepare(`update ${this.table} set ${sets}${where}`).run(
          ...values,
          ...params,
        );
        return { data: null, error: null };
      }

      if (this.action === "upsert") {
        const rows = Array.isArray(this.payload)
          ? this.payload
          : [this.payload!];
        const conflict = this.upsertConflict;
        for (const row of rows) {
          const data = { ...row };
          if (!data.id) data.id = newId();
          const keys = Object.keys(data);
          const values = keys.map((k) =>
            encodeValue(this.table, k, data[k]),
          );
          if (conflict) {
            const updates = keys
              .filter((k) => k !== "id" && k !== conflict)
              .map((k) => `${k} = excluded.${k}`)
              .join(", ");
            db.prepare(
              `insert into ${this.table} (${keys.join(",")}) values (${keys
                .map(() => "?")
                .join(",")})
               on conflict(${conflict}) do update set ${updates}`,
            ).run(...values);
          } else {
            db.prepare(
              `insert or replace into ${this.table} (${keys.join(
                ",",
              )}) values (${keys.map(() => "?").join(",")})`,
            ).run(...values);
          }
        }
        return { data: null, error: null };
      }

      if (this.action === "delete") {
        const { sql: where, params } = this.whereSql();
        db.prepare(`delete from ${this.table}${where}`).run(...params);
        return { data: null, error: null };
      }

      return { data: null, error: { message: "Unsupported action" } };
    } catch (err) {
      return {
        data: null,
        error: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}

export function createLocalClient(userId?: string | null) {
  return {
    auth: {
      async getUser() {
        if (!userId) return { data: { user: null }, error: null };
        const db = getLocalDb();
        const profile = db
          .prepare("select id, email, full_name, role from user_profiles where id = ?")
          .get(userId) as Row | undefined;
        if (!profile) return { data: { user: null }, error: null };
        return {
          data: {
            user: {
              id: String(profile.id),
              email: String(profile.email),
              user_metadata: { full_name: profile.full_name, role: profile.role },
            },
          },
          error: null,
        };
      },
      async signInWithPassword() {
        return {
          data: { user: null, session: null },
          error: {
            message:
              "Use /api/auth/login in local mode",
          },
        };
      },
      async signOut() {
        return { error: null };
      },
    },
    from(table: string) {
      return new QueryBuilder(table);
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(objectPath: string, data: Buffer | Uint8Array) {
            try {
              const fs = await import("node:fs");
              const path = await import("node:path");
              const root = path.join(process.cwd(), ".data", bucket);
              fs.mkdirSync(path.dirname(path.join(root, objectPath)), {
                recursive: true,
              });
              fs.writeFileSync(path.join(root, objectPath), data);
              return { data: { path: objectPath }, error: null };
            } catch (err) {
              return {
                data: null,
                error: {
                  message: err instanceof Error ? err.message : String(err),
                },
              };
            }
          },
        };
      },
    },
  };
}


import pg from "pg";

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

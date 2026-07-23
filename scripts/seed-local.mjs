import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Bootstraps an empty local SQLite database (schema only + optional first admin).
 * Does not insert demo projects, parts, or other test data.
 *
 * Set LOCAL_ADMIN_EMAIL / LOCAL_ADMIN_PASSWORD to create the first admin.
 * If unset and no users exist, no admin is created.
 */
const root = process.cwd();
const dataDir = path.join(root, ".data");
const dbPath = path.join(dataDir, "mixinary-local.sqlite");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "quote-pdfs"), { recursive: true });

const schema = fs.readFileSync(
  path.join(root, "src/lib/local/schema.sql"),
  "utf8",
);
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(schema);

const userCount = db.prepare("select count(*) as c from user_profiles").get().c;
const email = process.env.LOCAL_ADMIN_EMAIL?.trim();
const password = process.env.LOCAL_ADMIN_PASSWORD;

if (userCount === 0 && email && password) {
  db.prepare(
    `insert into user_profiles (id, email, full_name, role, password_hash)
     values (?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    email,
    "Local Admin",
    "admin",
    bcrypt.hashSync(password, 10),
  );
  console.log("Created local admin:", email);
} else if (userCount === 0) {
  console.log(
    "No users yet. Set LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD to create an admin.",
  );
}

console.log("DB:", dbPath);
console.log(
  "Users:",
  db.prepare("select email, role, full_name from user_profiles").all(),
);

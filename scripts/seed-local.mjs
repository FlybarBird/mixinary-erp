import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

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
if (userCount === 0) {
  db.prepare(
    `insert into user_profiles (id, email, full_name, role, password_hash)
     values (?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    "admin@mixinary.local",
    "Mixinary Admin",
    "admin",
    bcrypt.hashSync("mixinary123", 10),
  );
}

console.log("DB:", dbPath);
console.log(
  "Users:",
  db.prepare("select email, role, full_name from user_profiles").all(),
);
console.log("Login: admin@mixinary.local / mixinary123");

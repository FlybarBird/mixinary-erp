import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "mixinary-local.sqlite");

let db: Database.Database | null = null;

function readSchema() {
  return fs.readFileSync(
    path.join(process.cwd(), "src/lib/local/schema.sql"),
    "utf8",
  );
}

function seed(database: Database.Database) {
  const userCount = database
    .prepare("select count(*) as c from user_profiles")
    .get() as { c: number };
  if (userCount.c === 0) {
    const id = randomUUID();
    const hash = bcrypt.hashSync("mixinary123", 10);
    database
      .prepare(
        `insert into user_profiles (id, email, full_name, role, password_hash)
         values (?, ?, ?, ?, ?)`,
      )
      .run(id, "admin@mixinary.local", "Mixinary Admin", "admin", hash);
  }

  const vendorCount = database
    .prepare("select count(*) as c from vendors")
    .get() as { c: number };
  if (vendorCount.c === 0) {
    const vendors = [
      ["SP", "Sound Pro"],
      ["Tecnec", "Tecnec"],
      ["EC", "Elite Core"],
      ["BH", "B&H Photo"],
      ["FS", "FS.com"],
      ["Apple", "Apple"],
      ["AVL", "AVL"],
    ];
    const stmt = database.prepare(
      "insert into vendors (id, code, name) values (?, ?, ?)",
    );
    for (const [code, name] of vendors) {
      stmt.run(randomUUID(), code, name);
    }
  }

  const sourceCount = database
    .prepare("select count(*) as c from price_sources")
    .get() as { c: number };
  if (sourceCount.c === 0) {
    const sources = [
      [
        "B&H Photo",
        "bhphotovideo.com",
        "https://www.bhphotovideo.com/c/search?Ntt={query}",
        1,
        "Public catalog",
      ],
      [
        "FS.com",
        "fs.com",
        "https://www.fs.com/search_result?keyword={query}",
        1,
        "Fiber / networking",
      ],
      [
        "Shure",
        "shure.com",
        "https://www.shure.com/en-US/search?q={query}",
        1,
        "Manufacturer",
      ],
      [
        "Blackmagic Design",
        "blackmagicdesign.com",
        "https://www.blackmagicdesign.com/search?q={query}",
        1,
        "Manufacturer",
      ],
      [
        "Sound Pro",
        "soundpro.com",
        null,
        0,
        "Dealer portal — paste URL or PDF",
      ],
      ["Tecnec", "tecnec.com", null, 0, "Dealer portal — paste URL or PDF"],
    ] as const;
    const stmt = database.prepare(
      `insert into price_sources
        (id, name, base_domain, search_url_template, enabled, supports_search, notes)
       values (?, ?, ?, ?, 1, ?, ?)`,
    );
    for (const [name, domain, template, supports, notes] of sources) {
      stmt.run(randomUUID(), name, domain, template, supports, notes);
    }
  }

  const carrierCount = database
    .prepare("select count(*) as c from carriers")
    .get() as { c: number };
  if (carrierCount.c === 0) {
    const carriers = [
      ["UPS", "ups"],
      ["FedEx", "fedex"],
      ["USPS", "usps"],
      ["DHL Express", "dhl"],
    ];
    const stmt = database.prepare(
      "insert into carriers (id, name, slug) values (?, ?, ?)",
    );
    for (const [name, slug] of carriers) {
      stmt.run(randomUUID(), name, slug);
    }
  }
}

export function getLocalDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "quote-pdfs"), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(readSchema());
  seed(db);
  return db;
}

export function isLocalMode() {
  return (
    process.env.MIXINARY_LOCAL_MODE === "true" ||
    process.env.NEXT_PUBLIC_MIXINARY_LOCAL_MODE === "true"
  );
}

export function newId() {
  return randomUUID();
}

export function verifyLocalPassword(email: string, password: string) {
  const database = getLocalDb();
  const user = database
    .prepare("select * from user_profiles where lower(email) = lower(?)")
    .get(email) as
    | {
        id: string;
        email: string;
        full_name: string | null;
        role: string;
        password_hash: string;
      }
    | undefined;
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role as "admin" | "estimator" | "tech",
  };
}

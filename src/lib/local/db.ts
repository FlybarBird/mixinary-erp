import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { normalizeUserRole } from "@/lib/types";

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
    const email = process.env.LOCAL_ADMIN_EMAIL?.trim();
    const password = process.env.LOCAL_ADMIN_PASSWORD;
    if (email && password) {
      const id = randomUUID();
      const hash = bcrypt.hashSync(password, 10);
      database
        .prepare(
          `insert into user_profiles (id, email, full_name, role, password_hash)
           values (?, ?, ?, ?, ?)`,
        )
        .run(id, email, "Local Admin", "administrator", hash);
    }
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

  const categoryCount = database
    .prepare("select count(*) as c from part_categories")
    .get() as { c: number };
  if (categoryCount.c === 0) {
    const categories = [
      "Audio",
      "Video",
      "Networking",
      "Racks/Materials",
      "Cables",
      "Power",
    ];
    const stmt = database.prepare(
      "insert into part_categories (id, name, sort_order) values (?, ?, ?)",
    );
    categories.forEach((name, index) => {
      stmt.run(randomUUID(), name, index);
    });
  }

  const companyCount = database
    .prepare("select count(*) as c from part_companies")
    .get() as { c: number };
  if (companyCount.c === 0) {
    const companies: Array<[string, string | null, string | null]> = [
      ["Shure", "https://www.shure.com", "Shure"],
      ["Blackmagic Design", "https://www.blackmagicdesign.com", "Blackmagic"],
      ["Middle Atlantic", "https://www.middleatlantic.com", "Middle Atlantic"],
      ["Netgear", "https://www.netgear.com", "NETGEAR"],
      ["Audinate", "https://www.audinate.com", "Audinate"],
      ["Apple", "https://www.apple.com", "Apple"],
      ["FS", "https://www.fs.com", "FS"],
      ["Elite Core", "https://www.elitecoreaudio.com", null],
      ["Radial", "https://www.radialeng.com", "Radial"],
      ["Juice Goose", "https://www.juicegoose.com", null],
    ];
    const stmt = database.prepare(
      `insert into part_companies (id, name, website, icecat_vendor_name)
       values (?, ?, ?, ?)`,
    );
    for (const [name, website, icecat] of companies) {
      stmt.run(randomUUID(), name, website, icecat);
    }
  }
}

function migrate(database: Database.Database) {
  const cols = database
    .prepare("pragma table_info(line_items)")
    .all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "catalog_part_id")) {
    database.exec("alter table line_items add column catalog_part_id text");
  }

  const tables = database
    .prepare("select name from sqlite_master where type = 'table'")
    .all() as Array<{ name: string }>;
  if (!tables.some((t) => t.name === "catalog_part_proposals")) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS catalog_part_proposals (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sku TEXT,
        upc TEXT,
        description TEXT,
        msrp REAL,
        image_url TEXT,
        product_url TEXT,
        brand TEXT,
        company_name TEXT,
        source_name TEXT,
        confidence REAL,
        category_id TEXT REFERENCES part_categories(id),
        company_id TEXT REFERENCES part_companies(id),
        accepted INTEGER,
        raw TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS catalog_part_proposals_job_idx
        ON catalog_part_proposals(job_id);
    `);
  }

  const proposalCols = database
    .prepare("pragma table_info(catalog_part_proposals)")
    .all() as Array<{ name: string }>;
  if (proposalCols.length) {
    if (!proposalCols.some((c) => c.name === "brand")) {
      database.exec("alter table catalog_part_proposals add column brand text");
    }
    if (!proposalCols.some((c) => c.name === "company_name")) {
      database.exec(
        "alter table catalog_part_proposals add column company_name text",
      );
    }
    if (!proposalCols.some((c) => c.name === "source_name")) {
      database.exec(
        "alter table catalog_part_proposals add column source_name text",
      );
    }
  }

  if (!tables.some((t) => t.name === "app_settings")) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  const vendorCols = database
    .prepare("pragma table_info(vendors)")
    .all() as Array<{ name: string }>;
  if (vendorCols.length && !vendorCols.some((c) => c.name === "account_number")) {
    database.exec("alter table vendors add column account_number text");
  }
  if (vendorCols.length && !vendorCols.some((c) => c.name === "contact_name")) {
    database.exec("alter table vendors add column contact_name text");
  }
  if (vendorCols.length && !vendorCols.some((c) => c.name === "contact_email")) {
    database.exec("alter table vendors add column contact_email text");
  }

  const clientCols = database
    .prepare("pragma table_info(clients)")
    .all() as Array<{ name: string }>;
  if (clientCols.length) {
    const ensureClientCol = (name: string, ddl: string) => {
      if (!clientCols.some((c) => c.name === name)) {
        database.exec(ddl);
      }
    };
    ensureClientCol("code", "alter table clients add column code text");
    ensureClientCol("website", "alter table clients add column website text");
    ensureClientCol(
      "address_line1",
      "alter table clients add column address_line1 text",
    );
    ensureClientCol(
      "address_line2",
      "alter table clients add column address_line2 text",
    );
    ensureClientCol("city", "alter table clients add column city text");
    ensureClientCol("state", "alter table clients add column state text");
    ensureClientCol(
      "postal_code",
      "alter table clients add column postal_code text",
    );
    ensureClientCol(
      "active",
      "alter table clients add column active integer not null default 1",
    );
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS clients_code_unique
      ON clients(code)
      WHERE code IS NOT NULL AND code <> ''
    `);
  }

  // Role migration
  database.exec(`
    update user_profiles set role = 'administrator' where role = 'admin';
    update user_profiles set role = 'project_manager' where role = 'estimator';
    update user_profiles set role = 'field' where role = 'tech';
  `);

  const projectCols = database
    .prepare("pragma table_info(projects)")
    .all() as Array<{ name: string }>;
  if (projectCols.length) {
    if (!projectCols.some((c) => c.name === "project_manager_id")) {
      database.exec(
        "alter table projects add column project_manager_id text references user_profiles(id)",
      );
    }
    if (!projectCols.some((c) => c.name === "material_budget")) {
      database.exec("alter table projects add column material_budget real");
    }
    if (!projectCols.some((c) => c.name === "labor_budget")) {
      database.exec("alter table projects add column labor_budget real");
    }
    const projectFinancialCols = [
      ["expense_budget", "real"],
      ["subcontractor_budget", "real"],
      ["overhead_budget", "real"],
      ["original_revenue", "real"],
      ["revenue_additions", "real not null default 0"],
      ["revenue_credits", "real not null default 0"],
      ["start_date", "text"],
      ["target_completion_date", "text"],
      ["percent_complete", "real not null default 0"],
      ["financials_updated_at", "text"],
      ["labor_burden_enabled", "integer not null default 0"],
      ["default_burden_pct", "real not null default 0"],
    ] as const;
    const haveProject = new Set(projectCols.map((c) => c.name));
    for (const [col, ddl] of projectFinancialCols) {
      if (!haveProject.has(col)) {
        database.exec(`alter table projects add column ${col} ${ddl}`);
        haveProject.add(col);
      }
    }
  }

  const lineCols = database
    .prepare("pragma table_info(line_items)")
    .all() as Array<{ name: string }>;
  if (lineCols.length) {
    const addLine = (name: string, sql: string) => {
      if (!lineCols.some((c) => c.name === name)) database.exec(sql);
    };
    addLine("category", "alter table line_items add column category text");
    addLine("uom", "alter table line_items add column uom text default 'ea'");
    addLine(
      "estimated_unit_cost",
      "alter table line_items add column estimated_unit_cost real",
    );
    addLine(
      "required_by_date",
      "alter table line_items add column required_by_date text",
    );
    addLine(
      "procurement_status",
      "alter table line_items add column procurement_status text default 'not_ordered'",
    );
    addLine(
      "qty_ordered",
      "alter table line_items add column qty_ordered real not null default 0",
    );
    addLine(
      "qty_received",
      "alter table line_items add column qty_received real not null default 0",
    );
  }

  const workspaceTables: Array<[string, string]> = [
    [
      "purchase_orders",
      `CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        vendor_id TEXT NOT NULL REFERENCES vendors(id),
        po_number TEXT NOT NULL,
        order_date TEXT,
        ordered_by TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        expected_delivery_date TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        tax REAL NOT NULL DEFAULT 0,
        shipping REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        sale_total REAL NOT NULL DEFAULT 0,
        profit REAL NOT NULL DEFAULT 0,
        margin_pct REAL,
        vendor_contact TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (project_id, po_number)
      )`,
    ],
    [
      "purchase_order_items",
      `CREATE TABLE IF NOT EXISTS purchase_order_items (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        line_item_id TEXT REFERENCES line_items(id),
        sku TEXT,
        vendor_sku TEXT,
        description TEXT NOT NULL,
        qty_ordered REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL DEFAULT 0,
        shipping REAL NOT NULL DEFAULT 0,
        sale_total REAL NOT NULL DEFAULT 0,
        allocated_shipping REAL NOT NULL DEFAULT 0,
        allocated_tax REAL NOT NULL DEFAULT 0,
        cost_total REAL NOT NULL DEFAULT 0,
        profit REAL NOT NULL DEFAULT 0,
        margin_pct REAL,
        expected_ship_date TEXT,
        expected_delivery_date TEXT,
        qty_shipped REAL NOT NULL DEFAULT 0,
        qty_received REAL NOT NULL DEFAULT 0,
        item_status TEXT NOT NULL DEFAULT 'not_ordered',
        carrier_id TEXT REFERENCES carriers(id),
        tracking_number TEXT,
        tracking_url TEXT,
        latest_tracking_update TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "tracking_events",
      `CREATE TABLE IF NOT EXISTS tracking_events (
        id TEXT PRIMARY KEY,
        po_item_id TEXT NOT NULL REFERENCES purchase_order_items(id) ON DELETE CASCADE,
        event_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL,
        message TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "labor_entries",
      `CREATE TABLE IF NOT EXISTS labor_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        worker_name TEXT NOT NULL,
        user_id TEXT,
        work_category TEXT,
        task_description TEXT,
        work_date TEXT NOT NULL,
        estimated_hours REAL NOT NULL DEFAULT 0,
        actual_hours REAL NOT NULL DEFAULT 0,
        regular_hours REAL NOT NULL DEFAULT 0,
        overtime_hours REAL NOT NULL DEFAULT 0,
        hourly_rate REAL NOT NULL DEFAULT 0,
        total_cost REAL NOT NULL DEFAULT 0,
        approval_status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "project_expenses",
      `CREATE TABLE IF NOT EXISTS project_expenses (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        expense_date TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'miscellaneous',
        payee TEXT,
        description TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        tax REAL NOT NULL DEFAULT 0,
        cost_code TEXT,
        submitted_by TEXT,
        approval_status TEXT NOT NULL DEFAULT 'pending',
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        is_additional_charge INTEGER NOT NULL DEFAULT 0,
        receipt_path TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "attachments",
      `CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        uploaded_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "audit_events",
      `CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        actor_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "app_notifications",
      `CREATE TABLE IF NOT EXISTS app_notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT,
        href TEXT,
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  ];

  const tableNames = database
    .prepare("select name from sqlite_master where type = 'table'")
    .all() as Array<{ name: string }>;
  const have = new Set(tableNames.map((t) => t.name));
  for (const [name, ddl] of workspaceTables) {
    if (!have.has(name)) database.exec(ddl);
  }

  const poItemCols = database
    .prepare("pragma table_info(purchase_order_items)")
    .all() as Array<{ name: string }>;
  if (
    poItemCols.length &&
    !poItemCols.some((c) => c.name === "shipping")
  ) {
    database.exec(
      "alter table purchase_order_items add column shipping real not null default 0",
    );
  }

  const poProfitItemCols = [
    ["sale_total", "real not null default 0"],
    ["allocated_shipping", "real not null default 0"],
    ["allocated_tax", "real not null default 0"],
    ["cost_total", "real not null default 0"],
    ["profit", "real not null default 0"],
    ["margin_pct", "real"],
  ] as const;
  const poItemColsFresh = database
    .prepare("pragma table_info(purchase_order_items)")
    .all() as Array<{ name: string }>;
  if (poItemColsFresh.length) {
    const have = new Set(poItemColsFresh.map((c) => c.name));
    for (const [col, ddl] of poProfitItemCols) {
      if (!have.has(col)) {
        database.exec(`alter table purchase_order_items add column ${col} ${ddl}`);
      }
    }
  }

  const poProfitCols = [
    ["sale_total", "real not null default 0"],
    ["profit", "real not null default 0"],
    ["margin_pct", "real"],
  ] as const;
  const poCols = database
    .prepare("pragma table_info(purchase_orders)")
    .all() as Array<{ name: string }>;
  if (poCols.length) {
    const have = new Set(poCols.map((c) => c.name));
    for (const [col, ddl] of poProfitCols) {
      if (!have.has(col)) {
        database.exec(`alter table purchase_orders add column ${col} ${ddl}`);
      }
    }
  }

  const profileCols = database
    .prepare("pragma table_info(user_profiles)")
    .all() as Array<{ name: string }>;
  if (profileCols.length && !profileCols.some((c) => c.name === "active")) {
    database.exec(
      "alter table user_profiles add column active integer not null default 1",
    );
  }

  const userSystemTables: Array<[string, string]> = [
    [
      "user_audit_events",
      `CREATE TABLE IF NOT EXISTS user_audit_events (
        id TEXT PRIMARY KEY,
        actor_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
        target_user_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "user_invites",
      `CREATE TABLE IF NOT EXISTS user_invites (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        full_name TEXT,
        role TEXT NOT NULL DEFAULT 'project_manager',
        token TEXT NOT NULL UNIQUE,
        invited_by TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
        accepted_at TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "project_members",
      `CREATE TABLE IF NOT EXISTS project_members (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
        access_role TEXT NOT NULL DEFAULT 'viewer',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (project_id, user_id)
      )`,
    ],
  ];
  const allTables = database
    .prepare("select name from sqlite_master where type = 'table'")
    .all() as Array<{ name: string }>;
  const haveAll = new Set(allTables.map((t) => t.name));
  for (const [name, ddl] of userSystemTables) {
    if (!haveAll.has(name)) database.exec(ddl);
  }

  const expenseCols = database
    .prepare("pragma table_info(project_expenses)")
    .all() as Array<{ name: string }>;
  if (expenseCols.length && !expenseCols.some((c) => c.name === "po_id")) {
    database.exec(
      "alter table project_expenses add column po_id text references purchase_orders(id)",
    );
  }

  if (!haveAll.has("project_cost_ledger")) {
    database.exec(`CREATE TABLE IF NOT EXISTS project_cost_ledger (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      vendor_or_person TEXT,
      description TEXT,
      budget_amount REAL NOT NULL DEFAULT 0,
      committed_amount REAL NOT NULL DEFAULT 0,
      actual_amount REAL NOT NULL DEFAULT 0,
      forecast_amount REAL NOT NULL DEFAULT 0,
      transaction_date TEXT,
      approval_status TEXT,
      payment_status TEXT,
      billable INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (source_type, source_id, category)
    )`);
    database.exec(
      "CREATE INDEX IF NOT EXISTS project_cost_ledger_project_idx ON project_cost_ledger(project_id)",
    );
    database.exec(
      "CREATE INDEX IF NOT EXISTS project_cost_ledger_category_idx ON project_cost_ledger(project_id, category)",
    );
  }

  const laborColsPhase6 = database
    .prepare("pragma table_info(labor_entries)")
    .all() as Array<{ name: string }>;
  if (laborColsPhase6.length) {
    if (!laborColsPhase6.some((c) => c.name === "burden_pct")) {
      database.exec(
        "alter table labor_entries add column burden_pct real not null default 0",
      );
    }
    if (!laborColsPhase6.some((c) => c.name === "billing_rate")) {
      database.exec(
        "alter table labor_entries add column billing_rate real not null default 0",
      );
    }
    if (!laborColsPhase6.some((c) => c.name === "sort_order")) {
      database.exec(
        "alter table labor_entries add column sort_order integer not null default 0",
      );
    }
    if (!laborColsPhase6.some((c) => c.name === "rate_type")) {
      database.exec(
        "alter table labor_entries add column rate_type text not null default 'hourly'",
      );
    }
    if (!laborColsPhase6.some((c) => c.name === "qty")) {
      database.exec(
        "alter table labor_entries add column qty real not null default 1",
      );
    }
    if (!laborColsPhase6.some((c) => c.name === "msrp")) {
      database.exec(
        "alter table labor_entries add column msrp real not null default 0",
      );
      database.exec(
        "update labor_entries set msrp = hourly_rate where coalesce(msrp, 0) = 0 and coalesce(hourly_rate, 0) > 0",
      );
    }
    if (!laborColsPhase6.some((c) => c.name === "quote")) {
      database.exec("alter table labor_entries add column quote real");
    }
    if (!laborColsPhase6.some((c) => c.name === "override_pct")) {
      database.exec("alter table labor_entries add column override_pct real");
    }
  }

  const phase36Tables: Array<[string, string]> = [
    [
      "project_change_orders",
      `CREATE TABLE IF NOT EXISTS project_change_orders (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        co_number TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        revenue_delta REAL NOT NULL DEFAULT 0,
        budget_material_delta REAL NOT NULL DEFAULT 0,
        budget_labor_delta REAL NOT NULL DEFAULT 0,
        budget_expense_delta REAL NOT NULL DEFAULT 0,
        budget_subcontractor_delta REAL NOT NULL DEFAULT 0,
        budget_overhead_delta REAL NOT NULL DEFAULT 0,
        requested_by TEXT,
        approved_by TEXT,
        approved_at TEXT,
        effective_date TEXT,
        customer_reference TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (project_id, co_number)
      )`,
    ],
    [
      "project_invoices",
      `CREATE TABLE IF NOT EXISTS project_invoices (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        invoice_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        invoice_date TEXT NOT NULL,
        due_date TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        tax REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        amount_paid REAL NOT NULL DEFAULT 0,
        notes TEXT,
        sent_at TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (project_id, invoice_number)
      )`,
    ],
    [
      "project_invoice_lines",
      `CREATE TABLE IF NOT EXISTS project_invoice_lines (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES project_invoices(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        change_order_id TEXT REFERENCES project_change_orders(id) ON DELETE SET NULL,
        category TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`,
    ],
    [
      "project_payments",
      `CREATE TABLE IF NOT EXISTS project_payments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        payment_date TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        method TEXT,
        reference TEXT,
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "project_payment_applications",
      `CREATE TABLE IF NOT EXISTS project_payment_applications (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL REFERENCES project_payments(id) ON DELETE CASCADE,
        invoice_id TEXT NOT NULL REFERENCES project_invoices(id) ON DELETE CASCADE,
        amount REAL NOT NULL DEFAULT 0,
        UNIQUE (payment_id, invoice_id)
      )`,
    ],
    [
      "project_financial_snapshots",
      `CREATE TABLE IF NOT EXISTS project_financial_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        captured_at TEXT NOT NULL DEFAULT (datetime('now')),
        trigger TEXT NOT NULL DEFAULT 'manual',
        current_revenue REAL,
        original_cost_budget REAL,
        revised_cost_budget REAL,
        committed REAL NOT NULL DEFAULT 0,
        actual REAL NOT NULL DEFAULT 0,
        forecast_final REAL NOT NULL DEFAULT 0,
        forecast_profit REAL,
        forecast_margin REAL,
        billed REAL NOT NULL DEFAULT 0,
        collected REAL NOT NULL DEFAULT 0,
        ar_outstanding REAL NOT NULL DEFAULT 0,
        material_sale REAL NOT NULL DEFAULT 0,
        material_only_profit REAL NOT NULL DEFAULT 0,
        percent_complete REAL NOT NULL DEFAULT 0
      )`,
    ],
    [
      "vendor_bills",
      `CREATE TABLE IF NOT EXISTS vendor_bills (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
        vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
        vendor_invoice_number TEXT,
        bill_date TEXT,
        due_date TEXT,
        amount REAL NOT NULL DEFAULT 0,
        amount_paid REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'accrued',
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "project_subcontracts",
      `CREATE TABLE IF NOT EXISTS project_subcontracts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
        sub_name TEXT,
        description TEXT NOT NULL,
        contract_amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        billed_to_date REAL NOT NULL DEFAULT 0,
        paid_to_date REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "project_subcontract_bills",
      `CREATE TABLE IF NOT EXISTS project_subcontract_bills (
        id TEXT PRIMARY KEY,
        subcontract_id TEXT NOT NULL REFERENCES project_subcontracts(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        bill_date TEXT NOT NULL,
        description TEXT,
        amount REAL NOT NULL DEFAULT 0,
        amount_paid REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'billed',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  ];
  const haveAllRefresh = new Set(
    (
      database
        .prepare("select name from sqlite_master where type = 'table'")
        .all() as Array<{ name: string }>
    ).map((t) => t.name),
  );
  for (const [name, ddl] of phase36Tables) {
    if (!haveAllRefresh.has(name)) database.exec(ddl);
  }

  // Backfill project creators as managers when membership is missing
  try {
    const orphans = database
      .prepare(
        `select p.id, p.created_by from projects p
         where p.created_by is not null
           and not exists (
             select 1 from project_members m where m.project_id = p.id
           )`,
      )
      .all() as Array<{ id: string; created_by: string }>;
    const insert = database.prepare(
      `insert or ignore into project_members (id, project_id, user_id, access_role)
       values (?, ?, ?, 'manager')`,
    );
    for (const row of orphans) {
      insert.run(newId(), row.id, row.created_by);
    }
  } catch {
    // Tables may not exist yet on brand-new DBs before schema apply
  }

  // Wave C/D integrity columns
  try {
    const auditCols = database
      .prepare("pragma table_info(audit_events)")
      .all() as Array<{ name: string }>;
    if (auditCols.length && !auditCols.some((c) => c.name === "reason")) {
      database.exec("alter table audit_events add column reason text");
    }
  } catch {
    /* ignore */
  }
  try {
    const expCols = database
      .prepare("pragma table_info(project_expenses)")
      .all() as Array<{ name: string }>;
    if (expCols.length && !expCols.some((c) => c.name === "is_billable")) {
      database.exec(
        "alter table project_expenses add column is_billable integer not null default 0",
      );
    }
    if (expCols.length && !expCols.some((c) => c.name === "change_order_id")) {
      database.exec(
        "alter table project_expenses add column change_order_id text references project_change_orders(id)",
      );
    }
  } catch {
    /* ignore */
  }
  try {
    const ledgerCols = database
      .prepare("pragma table_info(project_cost_ledger)")
      .all() as Array<{ name: string }>;
    if (
      ledgerCols.length &&
      !ledgerCols.some((c) => c.name === "change_order_id")
    ) {
      database.exec(
        "alter table project_cost_ledger add column change_order_id text references project_change_orders(id)",
      );
    }
  } catch {
    /* ignore */
  }

  // Client Documents add-on (mirrors 022_client_documents.sql)
  const clientDocTables: Array<[string, string]> = [
    [
      "company_settings",
      `CREATE TABLE IF NOT EXISTS company_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        client_documents_enabled INTEGER NOT NULL DEFAULT 0,
        legal_name TEXT,
        address TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        tax_id TEXT,
        logo_path TEXT,
        brand_color_primary TEXT NOT NULL DEFAULT '#0070f2',
        brand_color_accent TEXT NOT NULL DEFAULT '#223548',
        default_terms TEXT,
        default_payment_instructions TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "client_documents",
      `CREATE TABLE IF NOT EXISTS client_documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
        doc_type TEXT NOT NULL DEFAULT 'proposal_quote',
        name TEXT NOT NULL,
        doc_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        version INTEGER NOT NULL DEFAULT 1,
        parent_document_id TEXT REFERENCES client_documents(id) ON DELETE SET NULL,
        expires_at TEXT,
        sent_at TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        discount_total REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        amount_paid REAL NOT NULL DEFAULT 0,
        assigned_to TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
        settings TEXT,
        created_by TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (project_id, doc_number)
      )`,
    ],
    [
      "client_document_blocks",
      `CREATE TABLE IF NOT EXISTS client_document_blocks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES client_documents(id) ON DELETE CASCADE,
        block_type TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0,
        content TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "client_document_tokens",
      `CREATE TABLE IF NOT EXISTS client_document_tokens (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES client_documents(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT,
        revoked_at TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "client_document_events",
      `CREATE TABLE IF NOT EXISTS client_document_events (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES client_documents(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        actor_user_id TEXT,
        ip TEXT,
        user_agent TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    [
      "client_document_signatures",
      `CREATE TABLE IF NOT EXISTS client_document_signatures (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES client_documents(id) ON DELETE CASCADE,
        signer_name TEXT NOT NULL,
        signer_email TEXT,
        signature_text TEXT NOT NULL,
        signed_at TEXT NOT NULL DEFAULT (datetime('now')),
        ip TEXT,
        user_agent TEXT
      )`,
    ],
  ];
  const haveClientDocs = new Set(
    (
      database
        .prepare("select name from sqlite_master where type = 'table'")
        .all() as Array<{ name: string }>
    ).map((t) => t.name),
  );
  for (const [name, ddl] of clientDocTables) {
    if (!haveClientDocs.has(name)) database.exec(ddl);
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS client_documents_project_idx ON client_documents(project_id);
    CREATE INDEX IF NOT EXISTS client_document_blocks_document_idx ON client_document_blocks(document_id);
    CREATE INDEX IF NOT EXISTS client_document_tokens_document_idx ON client_document_tokens(document_id);
    CREATE INDEX IF NOT EXISTS client_document_events_document_idx ON client_document_events(document_id);
    CREATE INDEX IF NOT EXISTS client_document_signatures_document_idx ON client_document_signatures(document_id);
  `);

  const suiteProfileCols = database
    .prepare("pragma table_info(user_profiles)")
    .all() as Array<{ name: string }>;
  if (
    suiteProfileCols.length &&
    !suiteProfileCols.some((c) => c.name === "idp_subject")
  ) {
    database.exec("alter table user_profiles add column idp_subject text");
  }
  if (
    suiteProfileCols.length &&
    !suiteProfileCols.some((c) => c.name === "pm_access")
  ) {
    database.exec(
      "alter table user_profiles add column pm_access integer not null default 0",
    );
  }

  const suiteTables = new Set(
    (
      database
        .prepare("select name from sqlite_master where type = 'table'")
        .all() as Array<{ name: string }>
    ).map((t) => t.name),
  );
  if (!suiteTables.has("integration_outbox")) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS integration_outbox (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        processed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS integration_outbox_status_idx
        ON integration_outbox(status, created_at);
    `);
  }
  if (!suiteTables.has("erp_pm_project_links")) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS erp_pm_project_links (
        id TEXT PRIMARY KEY,
        erp_project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
        huly_project_id TEXT,
        integration_status TEXT NOT NULL DEFAULT 'pending',
        last_sync_at TEXT,
        last_sync_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  const poItemInheritCols = database
    .prepare("pragma table_info(purchase_order_items)")
    .all() as Array<{ name: string }>;
  if (
    poItemInheritCols.length &&
    !poItemInheritCols.some((c) => c.name === "inherits_po_status")
  ) {
    database.exec(
      "alter table purchase_order_items add column inherits_po_status integer not null default 1",
    );
  }

  const linkTables = new Set(
    (
      database
        .prepare("select name from sqlite_master where type='table'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name),
  );
  if (!linkTables.has("purchase_order_project_links")) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS purchase_order_project_links (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        is_owner INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (po_id, project_id)
      );
      CREATE INDEX IF NOT EXISTS purchase_order_project_links_project_idx
        ON purchase_order_project_links(project_id);
      CREATE INDEX IF NOT EXISTS purchase_order_project_links_po_idx
        ON purchase_order_project_links(po_id);
    `);
  }

  const ownerBackfill = database
    .prepare(
      `select po.id, po.project_id
       from purchase_orders po
       left join purchase_order_project_links l
         on l.po_id = po.id and l.project_id = po.project_id
       where l.id is null`,
    )
    .all() as Array<{ id: string; project_id: string }>;
  if (ownerBackfill.length > 0) {
    const insertLink = database.prepare(
      `insert or ignore into purchase_order_project_links
         (id, po_id, project_id, is_owner)
       values (?, ?, ?, 1)`,
    );
    for (const row of ownerBackfill) {
      insertLink.run(randomUUID(), row.id, row.project_id);
    }
  }
}

export function getLocalDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "quote-pdfs"), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "part-images"), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "project-files"), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(readSchema());
  migrate(db);
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
        active?: number;
      }
    | undefined;
  if (!user) return null;
  if (user.active === 0) return null;
  if (!user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: normalizeUserRole(user.role),
  };
}

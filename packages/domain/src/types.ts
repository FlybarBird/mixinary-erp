export type UserRole =
  | "administrator"
  | "project_manager"
  | "purchasing"
  | "warehouse"
  | "accounting"
  | "field"
  | "read_only";

export const USER_ROLES: UserRole[] = [
  "administrator",
  "project_manager",
  "purchasing",
  "warehouse",
  "accounting",
  "field",
  "read_only",
];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  administrator: "Administrator",
  project_manager: "Project Manager",
  purchasing: "Purchasing",
  warehouse: "Warehouse / Receiving",
  accounting: "Accounting",
  field: "Field / Production",
  read_only: "Read-Only",
};

export function normalizeUserRole(role: string | null | undefined): UserRole {
  switch (role) {
    case "admin":
    case "administrator":
      return "administrator";
    case "estimator":
    case "project_manager":
      return "project_manager";
    case "purchasing":
      return "purchasing";
    case "warehouse":
      return "warehouse";
    case "accounting":
      return "accounting";
    case "tech":
    case "field":
      return "field";
    case "read_only":
      return "read_only";
    default:
      return "read_only";
  }
}

export type ProjectStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "complete"
  | "archived";

export type ProjectAccessRole = "viewer" | "editor" | "manager";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  active: boolean;
}

export interface LinePricing {
  qty: number;
  msrp: number;
  unitQuote: number;
  totalMsrp: number;
  totalQuote: number;
  overridePct: number;
  unitSale: number;
  totalSale: number;
  clientSavings: number;
  outOfPocket: number;
}

export interface ProjectListItem {
  id: string;
  project_number: string;
  name: string;
  status: ProjectStatus;
  default_override_pct: number | null;
  client_id: string | null;
  client_name: string | null;
}

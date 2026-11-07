import type { QueryResultRow } from "pg";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "operator";
  isActive: boolean;
};

export function mapUserRow(row: QueryResultRow): UserRow {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: row.role === "admin" ? "admin" : "operator",
    isActive: row.is_active === true,
  };
}

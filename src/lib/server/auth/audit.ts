import type { PoolClient } from "pg";

export type AuditAction =
  | "APPROVE"
  | "REJECT"
  | "DRAFT_REJECT"
  | "DRAFT_GENERATE"
  | "LEAD_RETURNED"
  | "REVOKE"
  | "REOPEN"
  | "EDIT"
  | "ARCHIVE"
  | "IMPORT"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "USER_ADD"
  | "USER_ACTIVATE"
  | "USER_DEACTIVATE"
  | "ROLE_CHANGE";

export async function writeAudit(
  client: PoolClient,
  action: AuditAction,
  entity: "lead" | "draft" | "user" | "import",
  entityId: string,
  actorId: string | null,
  actorType: "USER" | "SYSTEM",
  details: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (actor_type, actor_id, entity, entity_id, action, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actorType, actorId, entity, entityId, action, JSON.stringify(details)],
  );
}

export async function writeAuthAudit(
  client: PoolClient,
  action: "LOGIN" | "LOGIN_FAILED" | "LOGOUT",
  entityId: string,
  actorId: string | null,
  actorType: "USER" | "SYSTEM",
): Promise<void> {
  await writeAudit(client, action, "user", entityId, actorId, actorType);
}

import "server-only";

import { getServerConfig } from "../config.js";
import { getNeonSql } from "./neon.js";

export async function ensureWorkspaceRecord({
  workspaceId,
  ownerUserId = null,
  name = getServerConfig().defaultWorkspaceName,
  slug = null,
  visibility = "private",
}) {
  const sql = getNeonSql();
  const id = String(workspaceId || "default");

  await sql.query(
    `INSERT INTO bls_workspaces (id, owner_user_id, name, slug, visibility)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id)
     DO UPDATE SET
       owner_user_id = COALESCE(bls_workspaces.owner_user_id, EXCLUDED.owner_user_id),
       name = COALESCE(NULLIF(bls_workspaces.name, ''), EXCLUDED.name),
       slug = COALESCE(bls_workspaces.slug, EXCLUDED.slug),
       visibility = COALESCE(bls_workspaces.visibility, EXCLUDED.visibility),
       updated_at = NOW()`,
    [id, ownerUserId, name, slug || id, visibility],
  );

  if (ownerUserId) {
    await sql.query(
      `INSERT INTO bls_workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [id, ownerUserId],
    );
  }

  return sql;
}

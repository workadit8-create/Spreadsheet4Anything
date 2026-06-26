import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipRole } from "@/lib/org/roles";

export const AUDIT_ACTIONS = {
  salesOrderPost: "sales_order.post",
  salesOrderVoid: "sales_order.void",
  purchaseOrderPost: "purchase_order.post",
  purchaseOrderVoid: "purchase_order.void",
  piutangPaymentPost: "piutang_payment.post",
  piutangPaymentVoid: "piutang_payment.void",
  hutangPaymentPost: "hutang_payment.post",
  hutangPaymentVoid: "hutang_payment.void",
  cashTransferPost: "cash_transfer.post",
  cashTransferVoid: "cash_transfer.void",
  journalManual: "journal.manual",
  postingProcess: "posting.process",
  memberAdd: "member.add",
  memberRoleUpdate: "member.role_update",
  memberRemove: "member.remove",
  orgProfileUpdate: "org.profile_update",
  orgLogoUpdate: "org.logo_update",
  orgLogoDelete: "org.logo_delete",
  orgPpnUpdate: "org.ppn_update"
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export type AuditLogRow = {
  id: string;
  organizationId: string;
  userId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: AuditAction;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type WriteAuditLogParams = {
  organizationId: string;
  userId: string;
  actorEmail?: string | null;
  actorRole?: MembershipRole | string | null;
  action: AuditAction;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  request?: Request | null;
};

export function extractRequestContext(request?: Request | null): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!request) return { ipAddress: null, userAgent: null };
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent");
  return { ipAddress, userAgent };
}

export function auditFromContext(
  auth: {
    org: { id: string };
    user: { id: string; email?: string | null };
    role: MembershipRole;
  },
  action: AuditAction,
  fields: Omit<
    WriteAuditLogParams,
    "organizationId" | "userId" | "actorEmail" | "actorRole" | "action"
  > = {}
): WriteAuditLogParams {
  return {
    organizationId: auth.org.id,
    userId: auth.user.id,
    actorEmail: auth.user.email ?? null,
    actorRole: auth.role,
    action,
    ...fields
  };
}

/** Catat audit — tidak melempar error agar operasi utama tidak gagal. */
export async function writeAuditLog(
  supabase: SupabaseClient,
  params: WriteAuditLogParams
): Promise<void> {
  try {
    const { ipAddress, userAgent } = extractRequestContext(params.request);
    const { error } = await supabase.from("audit_log").insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      actor_email: params.actorEmail ?? null,
      actor_role: params.actorRole ?? null,
      action: params.action,
      resource_type: params.resourceType ?? null,
      resource_id: params.resourceId ?? null,
      metadata: params.metadata ?? {},
      ip_address: ipAddress,
      user_agent: userAgent
    });
    if (error) {
      console.error("[audit_log] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[audit_log] insert error:", err);
  }
}

export function mapAuditLogRow(row: {
  id: string;
  organization_id: string;
  user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}): AuditLogRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    action: row.action as AuditAction,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata || {},
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at
  };
}

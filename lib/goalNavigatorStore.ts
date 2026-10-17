import { cookies } from "next/headers";
import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";
import { normalizeLegacyAnswers } from "./goalNavigatorLegacy";

/**
 * UTF-8バイト列がLatin-1として解釈されて生じた文字化け（mojibake）を復元する。
 * 既に正しい文字列や、復元に失敗する文字列はそのまま返す。
 */
export function fixMojibake(input: string | undefined | null): string {
  if (typeof input !== "string" || !input) return input ?? "";
  // Latin-1拡張領域の文字が含まれていなければ、正常な文字列とみなす
  if (!/[\u0080-\u00ff]/.test(input)) return input;
  try {
    const repaired = Buffer.from(input, "latin1").toString("utf8");
    if (repaired && !repaired.includes("\ufffd")) return repaired;
  } catch {
    /* noop */
  }
  return input;
}

export type NavigatorKind = "quantitative" | "qualitative";
export type RecordStatus = "draft" | "submitted" | "approved" | "rejected";

export type ProgressReply = {
  id: string;
  at: string;
  authorId?: string;
  authorName: string;
  isApprover?: boolean;
  body: string;
};

export type ProgressUpdate = {
  id: string;
  at: string;
  authorId?: string;
  authorName: string;
  body: string;
  percent?: number;
  replies?: ProgressReply[];
};

// 目標項目に対する承認者コメント（複数人・複数件）
export type ItemComment = {
  id: string;
  at: string;
  authorId?: string;
  authorName: string;
  isApprover?: boolean;
  target: "company" | "team" | "personal";
  body: string;
};

export type NavigatorSession = {
  id?: string;
  name: string;
  email: string;
  permissionId?: string;
  permissionName?: string;
  employeeId?: string;
};

/** 一時差戻（編集許可）状態: 管理者が承認済みシートに対して発行 */
export type TempEditState = {
  byId: string;
  byName: string;
  at: string;
  reason?: string;
  /** 一時差戻時点のanswersスナップショット（赤字判定の基準） */
  originals?: Record<string, string>;
};

/** 一時差戻中に編集された項目の記録（赤字表示・編集者表示に使用） */
export type FieldEdit = {
  value: string;
  byId: string;
  byName: string;
  at: string;
};

export type NavigatorRecord = {
  id: string;
  ownerId: string;
  kind: NavigatorKind;
  employeeId: string;
  employeeName: string;
  department: string;
  title: string;
  status: RecordStatus;
  answers: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  reviewComment?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  progressUpdates?: ProgressUpdate[];
  itemComments?: ItemComment[];
  lastEditedBy?: string;
  lastEditedAt?: string;
  tempEdit?: TempEditState;
  fieldEdits?: Record<string, FieldEdit>;
};

type AuditActor = {
  actorId?: string;
  actorName?: string;
};

/**
 * 目標ナビの記録を Supabase Storage バケットに JSON として永続化する。
 * スタッフ/間取りと同じく DDL 不要のバケット方式。
 * env 未設定時はメモリfallback（開発用）。
 */
const BUCKET = "goal-navigator";
const RECORD_PREFIX = "records";
const AUDIT_PREFIX = "audit";

// ---- In-memory fallback ----
const globalStore = globalThis as typeof globalThis & {
  __keyatreeNavigatorRecords?: NavigatorRecord[];
};
function getStore() {
  if (!globalStore.__keyatreeNavigatorRecords) {
    globalStore.__keyatreeNavigatorRecords = [];
  }
  return globalStore.__keyatreeNavigatorRecords;
}

// ---- Storage helpers ----
type Admin = ReturnType<typeof getSupabaseAdmin>;
let bucketReady = false;
async function ensureBucket(supabase: Admin) {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error && !/exist/i.test(error.message)) {
      throw new Error(`bucket作成に失敗: ${error.message}`);
    }
  }
  bucketReady = true;
}

function recordPath(id: string) {
  return `${RECORD_PREFIX}/${encodeURIComponent(id)}.json`;
}

async function putJson(supabase: Admin, path: string, value: unknown) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, JSON.stringify(value), {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (error) throw new Error(error.message);
}

async function getJson<T>(supabase: Admin, path: string): Promise<T | null> {
  // Bypass Supabase Storage CDN cache (which lags ~5-10s even with cacheControl:"0")
  // by fetching the authenticated object endpoint directly with a cache-buster.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRoleKey) {
    try {
      const endpoint = `${url}/storage/v1/object/${BUCKET}/${path}?_cb=${Date.now()}`;
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        cache: "no-store",
      });
      if (res.ok) {
        return (await res.json()) as T;
      }
      if (res.status === 404) return null;
    } catch {
      // fall through to SDK download below
    }
  }
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function listRecords(supabase: Admin): Promise<NavigatorRecord[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(RECORD_PREFIX, { limit: 1000 });
  if (error || !data) return [];
  const files = data.filter((i) => i.name.endsWith(".json"));
  const results = (await Promise.all(
    files.map((i) => getJson<NavigatorRecord>(supabase, `${RECORD_PREFIX}/${i.name}`))
  )) as (NavigatorRecord | null)[];
  return results.filter((r): r is NavigatorRecord => r !== null);
}

// ---- Session ----
export async function getServerSession(): Promise<NavigatorSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("kt_session")?.value;
  if (!raw) return null;
  try {
    // Cookieは encodeURIComponent(JSON) で保存される。旧形式（未エンコード）も許容。
    let text = raw;
    try {
      text = decodeURIComponent(raw);
    } catch {
      text = raw;
    }
    const parsed = JSON.parse(text) as NavigatorSession;
    // 旧cookie（未エンコードのUTF-8）に起因する名前の文字化けを復元
    if (parsed && typeof parsed.name === "string") {
      parsed.name = fixMojibake(parsed.name);
    }
    if (parsed && typeof parsed.permissionName === "string") {
      parsed.permissionName = fixMojibake(parsed.permissionName);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function canApprove(session: NavigatorSession | null) {
  return session?.permissionId === "admin" || session?.permissionId === "hr_manager";
}

// ---- Audit（ベストエフォート：失敗しても本処理を止めない）----
async function writeAuditLog(
  supabase: Admin,
  input: {
    entityId: string;
    operation: "create" | "update" | "approve" | "reject" | "progress";
    beforeData?: NavigatorRecord | null;
    afterData?: NavigatorRecord | null;
    actor?: AuditActor;
  }
) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await putJson(supabase, `${AUDIT_PREFIX}/${input.entityId}/${ts}.json`, {
      entityType: "goal_navigator_record",
      entityId: input.entityId,
      operation: input.operation,
      actorId: input.actor?.actorId ?? null,
      actorName: input.actor?.actorName ?? null,
      beforeData: input.beforeData ?? null,
      afterData: input.afterData ?? null,
      at: new Date().toISOString(),
    });
  } catch {
    // 監査ログの失敗は無視
  }
}

// ---- Records ----
export async function listNavigatorRecords(params: {
  kind?: NavigatorKind;
  ownerId?: string;
  employeeId?: string;
  includeAll?: boolean;
}) {
  let records: NavigatorRecord[];
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    records = await listRecords(supabase);
  } else {
    records = getStore();
  }

  const filtered = records
    .filter((record) => {
      if (params.kind && record.kind !== params.kind) return false;
      if (!params.includeAll && params.ownerId && record.ownerId !== params.ownerId) return false;
      return true;
    })
    .map((record) => ({
      ...record,
      answers: normalizeLegacyAnswers(record.answers || {}, record.kind),
    }));
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertNavigatorRecord(input: {
  id?: string;
  ownerId: string;
  kind: NavigatorKind;
  employeeId: string;
  employeeName: string;
  department: string;
  title: string;
  status: RecordStatus;
  answers: Record<string, string>;
  actor?: AuditActor;
}) {
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);

    const existing = input.id ? await getJson<NavigatorRecord>(supabase, recordPath(input.id)) : null;

    const record: NavigatorRecord = existing
      ? {
          ...existing,
          ownerId: input.ownerId,
          kind: input.kind,
          employeeId: input.employeeId,
          employeeName: input.employeeName,
          department: input.department,
          title: input.title,
          status: input.status,
          answers: { ...existing.answers, ...input.answers },
          updatedAt: now,
          submittedAt: input.status === "submitted" ? now : existing.submittedAt,
        }
      : {
          id: input.id || crypto.randomUUID(),
          ownerId: input.ownerId,
          kind: input.kind,
          employeeId: input.employeeId,
          employeeName: input.employeeName,
          department: input.department,
          title: input.title,
          status: input.status,
          answers: input.answers,
          createdAt: now,
          updatedAt: now,
          submittedAt: input.status === "submitted" ? now : undefined,
        };

    await putJson(supabase, recordPath(record.id), record);
    await writeAuditLog(supabase, {
      entityId: record.id,
      operation: existing ? "update" : "create",
      beforeData: existing,
      afterData: record,
      actor: input.actor,
    });
    return record;
  }

  const records = getStore();
  const existingIndex = input.id ? records.findIndex((record) => record.id === input.id) : -1;

  if (existingIndex >= 0) {
    const current = records[existingIndex];
    const next: NavigatorRecord = {
      ...current,
      ownerId: input.ownerId,
      kind: input.kind,
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      department: input.department,
      title: input.title,
      status: input.status,
      answers: { ...current.answers, ...input.answers },
      updatedAt: now,
      submittedAt: input.status === "submitted" ? now : current.submittedAt,
    };
    records[existingIndex] = next;
    return next;
  }

  const created: NavigatorRecord = {
    id: input.id || crypto.randomUUID(),
    ownerId: input.ownerId,
    kind: input.kind,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    department: input.department,
    title: input.title,
    status: input.status,
    answers: input.answers,
    createdAt: now,
    updatedAt: now,
    submittedAt: input.status === "submitted" ? now : undefined,
  };
  records.unshift(created);
  return created;
}

export async function approveNavigatorRecord(recordId: string, approverName: string, actorId?: string, comment?: string) {
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const before = await getJson<NavigatorRecord>(supabase, recordPath(recordId));
    if (!before) return null;

    const record: NavigatorRecord = {
      ...before,
      status: "approved",
      approvedAt: now,
      updatedAt: now,
      approvedBy: approverName,
      reviewComment: comment || before.reviewComment,
      reviewedAt: now,
      reviewedBy: approverName,
    };
    await putJson(supabase, recordPath(record.id), record);
    await writeAuditLog(supabase, {
      entityId: record.id,
      operation: "approve",
      beforeData: before,
      afterData: record,
      actor: { actorId, actorName: approverName },
    });
    return record;
  }

  const records = getStore();
  const record = records.find((item) => item.id === recordId);
  if (!record) return null;
  record.status = "approved";
  record.approvedAt = now;
  record.updatedAt = now;
  record.approvedBy = approverName;
  record.reviewComment = comment || record.reviewComment;
  record.reviewedAt = now;
  record.reviewedBy = approverName;
  return record;
}

// ---- Single record fetch ----
export async function getNavigatorRecordById(recordId: string): Promise<NavigatorRecord | null> {
  let record: NavigatorRecord | null;
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    record = await getJson<NavigatorRecord>(supabase, recordPath(recordId));
  } else {
    record = getStore().find((item) => item.id === recordId) ?? null;
  }
  if (!record) return null;
  return {
    ...record,
    answers: normalizeLegacyAnswers(record.answers || {}, record.kind),
  };
}

// ---- Reject（やり直し依頼）----
export async function rejectNavigatorRecord(recordId: string, reviewerName: string, comment: string, actorId?: string) {
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const before = await getJson<NavigatorRecord>(supabase, recordPath(recordId));
    if (!before) return null;

    const record: NavigatorRecord = {
      ...before,
      status: "rejected",
      updatedAt: now,
      reviewComment: comment,
      reviewedAt: now,
      reviewedBy: reviewerName,
    };
    await putJson(supabase, recordPath(record.id), record);
    await writeAuditLog(supabase, {
      entityId: record.id,
      operation: "reject",
      beforeData: before,
      afterData: record,
      actor: { actorId, actorName: reviewerName },
    });
    return record;
  }

  const records = getStore();
  const record = records.find((item) => item.id === recordId);
  if (!record) return null;
  record.status = "rejected";
  record.updatedAt = now;
  record.reviewComment = comment;
  record.reviewedAt = now;
  record.reviewedBy = reviewerName;
  return record;
}

// ---- Progress（進捗報告）----
export async function addProgressUpdate(
  recordId: string,
  update: { authorId?: string; authorName: string; body: string; percent?: number }
) {
  const now = new Date().toISOString();
  const entry: ProgressUpdate = {
    id: crypto.randomUUID(),
    at: now,
    authorId: update.authorId,
    authorName: update.authorName,
    body: update.body,
    percent: update.percent,
  };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const before = await getJson<NavigatorRecord>(supabase, recordPath(recordId));
    if (!before) return null;

    const record: NavigatorRecord = {
      ...before,
      progressUpdates: [...(before.progressUpdates ?? []), entry],
      updatedAt: now,
    };
    await putJson(supabase, recordPath(record.id), record);
    await writeAuditLog(supabase, {
      entityId: record.id,
      operation: "progress",
      beforeData: before,
      afterData: record,
      actor: { actorId: update.authorId, actorName: update.authorName },
    });
    return record;
  }

  const records = getStore();
  const record = records.find((item) => item.id === recordId);
  if (!record) return null;
  record.progressUpdates = [...(record.progressUpdates ?? []), entry];
  record.updatedAt = now;
  return record;
}

// ---- Progress reply（進捗へのコメント返信）----
export async function addProgressReply(
  recordId: string,
  updateId: string,
  reply: { authorId?: string; authorName: string; isApprover?: boolean; body: string }
) {
  const now = new Date().toISOString();
  const entry: ProgressReply = {
    id: crypto.randomUUID(),
    at: now,
    authorId: reply.authorId,
    authorName: reply.authorName,
    isApprover: reply.isApprover,
    body: reply.body,
  };

  const applyReply = (record: NavigatorRecord): NavigatorRecord => ({
    ...record,
    progressUpdates: (record.progressUpdates ?? []).map((u) =>
      u.id === updateId ? { ...u, replies: [...(u.replies ?? []), entry] } : u
    ),
    updatedAt: now,
  });

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const before = await getJson<NavigatorRecord>(supabase, recordPath(recordId));
    if (!before) return null;
    if (!(before.progressUpdates ?? []).some((u) => u.id === updateId)) return null;

    const record = applyReply(before);
    await putJson(supabase, recordPath(record.id), record);
    await writeAuditLog(supabase, {
      entityId: record.id,
      operation: "progress",
      beforeData: before,
      afterData: record,
      actor: { actorId: reply.authorId, actorName: reply.authorName },
    });
    return record;
  }

  const records = getStore();
  const record = records.find((item) => item.id === recordId);
  if (!record) return null;
  if (!(record.progressUpdates ?? []).some((u) => u.id === updateId)) return null;
  record.progressUpdates = (record.progressUpdates ?? []).map((u) =>
    u.id === updateId ? { ...u, replies: [...(u.replies ?? []), entry] } : u
  );
  record.updatedAt = now;
  return record;
}

// ---- 進捗数値・結果数値など数値メトリクスの後日更新（承認ステータスは変更しない）----
export async function updateNavigatorMetrics(recordId: string, patch: Record<string, string>) {
  const now = new Date().toISOString();

  const applyPatch = (record: NavigatorRecord): NavigatorRecord => ({
    ...record,
    answers: { ...record.answers, ...patch },
    updatedAt: now,
  });

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const before = await getJson<NavigatorRecord>(supabase, recordPath(recordId));
    if (!before) return null;
    const record = applyPatch(before);
    await putJson(supabase, recordPath(record.id), record);
    await writeAuditLog(supabase, {
      entityId: record.id,
      operation: "update",
      beforeData: before,
      afterData: record,
    });
    return record;
  }

  const records = getStore();
  const record = records.find((item) => item.id === recordId);
  if (!record) return null;
  record.answers = { ...record.answers, ...patch };
  record.updatedAt = now;
  return record;
}

// ---- 承認者による入力内容の編集（提出内容を上書き。承認ステータスは変更しない）----
/**
 * 一時差戻（編集許可）の発行/解除。
 * 発行時は現状のanswersをスナップショットし、赤字判定の基準とする。
 */
export async function setTempEditState(
  recordId: string,
  enable: boolean,
  actor: AuditActor,
  reason?: string
): Promise<NavigatorRecord | null> {
  const now = new Date().toISOString();

  const applyPatch = (record: NavigatorRecord): NavigatorRecord => {
    if (!enable) {
      const { tempEdit: _drop, ...rest } = record;
      return { ...rest, updatedAt: now };
    }
    return {
      ...record,
      tempEdit: {
        byId: actor.actorId || "",
        byName: actor.actorName || "管理者",
        at: now,
        reason: reason || undefined,
        originals: { ...record.answers },
      },
      updatedAt: now,
    };
  };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const before = await getJson<NavigatorRecord>(supabase, recordPath(recordId));
    if (!before) return null;
    const record = applyPatch(before);
    await putJson(supabase, recordPath(record.id), record);
    await writeAuditLog(supabase, {
      entityId: record.id,
      operation: "update",
      beforeData: before,
      afterData: record,
      actor,
    });
    return record;
  }

  const records = getStore();
  const record = records.find((item) => item.id === recordId);
  if (!record) return null;
  const next = applyPatch(record);
  Object.assign(record, next);
  return record;
}

export async function updateNavigatorAnswers(
  recordId: string,
  answers: Record<string, string>,
  actor?: AuditActor
) {
  const now = new Date().toISOString();

  const applyPatch = (record: NavigatorRecord): NavigatorRecord => {
    const nextAnswers = { ...record.answers };
    let fieldEdits = record.fieldEdits ? { ...record.fieldEdits } : undefined;
    const tempEdit = record.tempEdit;

    for (const [k, v] of Object.entries(answers)) {
      const val = String(v ?? "");
      nextAnswers[k] = val;
      // 一時差戻中のみ、元の値から変化した項目を赤字記録として残す
      if (tempEdit) {
        const original = tempEdit.originals?.[k];
        if (original === undefined) continue;
        if (original !== val) {
          fieldEdits = fieldEdits ?? {};
          fieldEdits[k] = {
            value: val,
            byId: actor?.actorId || "",
            byName: actor?.actorName || "",
            at: now,
          };
        } else if (fieldEdits) {
          delete fieldEdits[k];
        }
      }
    }

    return {
      ...record,
      answers: nextAnswers,
      fieldEdits,
      updatedAt: now,
      lastEditedBy: actor?.actorName,
      lastEditedAt: now,
    };
  };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const before = await getJson<NavigatorRecord>(supabase, recordPath(recordId));
    if (!before) return null;
    const record = applyPatch(before);
    await putJson(supabase, recordPath(record.id), record);
    await writeAuditLog(supabase, {
      entityId: record.id,
      operation: "update",
      beforeData: before,
      afterData: record,
      actor,
    });
    return record;
  }

  const records = getStore();
  const record = records.find((item) => item.id === recordId);
  if (!record) return null;
  const next = applyPatch(record);
  Object.assign(record, next);
  return record;
}

// ---- 目標項目への承認者コメント（複数人・複数件）----
export async function addItemComment(
  recordId: string,
  input: { authorId?: string; authorName: string; isApprover?: boolean; target: ItemComment["target"]; body: string }
) {
  const now = new Date().toISOString();
  const entry: ItemComment = {
    id: crypto.randomUUID(),
    at: now,
    authorId: input.authorId,
    authorName: input.authorName,
    isApprover: input.isApprover,
    target: input.target,
    body: input.body,
  };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const before = await getJson<NavigatorRecord>(supabase, recordPath(recordId));
    if (!before) return null;
    const record: NavigatorRecord = {
      ...before,
      itemComments: [...(before.itemComments ?? []), entry],
      updatedAt: now,
    };
    await putJson(supabase, recordPath(record.id), record);
    await writeAuditLog(supabase, {
      entityId: record.id,
      operation: "update",
      beforeData: before,
      afterData: record,
      actor: { actorId: input.authorId, actorName: input.authorName },
    });
    return record;
  }

  const records = getStore();
  const record = records.find((item) => item.id === recordId);
  if (!record) return null;
  record.itemComments = [...(record.itemComments ?? []), entry];
  record.updatedAt = now;
  return record;
}

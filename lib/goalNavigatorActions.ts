"use server";

import { revalidatePath } from "next/cache";
import {
  addItemComment,
  addProgressReply,
  addProgressUpdate,
  approveNavigatorRecord,
  getNavigatorRecordById,
  getServerSession,
  listNavigatorRecords,
  rejectNavigatorRecord,
  setTempEditState,
  updateNavigatorMetrics,
  updateNavigatorAnswers,
  type ItemComment,
  type NavigatorKind,
  type NavigatorRecord,
  upsertNavigatorRecord,
} from "@/lib/goalNavigatorStore";
import { mergeSheetTemplate } from "@/lib/sheetTemplate";
import { getSavedSheetTemplate } from "@/lib/sheetTemplateStore";
import {
  filterRecordsForApprover,
  hasApproverAccess,
  isAssignedApproverOf,
  isGoalAdmin,
  isOwnerOf,
  periodFromTitle,
  dedupeRecordsByPeriod,
} from "@/lib/goalAccess";
import { getStaff } from "@/lib/staffServerStore";

export async function saveNavigatorRecord(input: {
  id?: string;
  kind: NavigatorKind;
  title: string;
  department: string;
  answers: Record<string, string>;
  status: "draft" | "submitted";
}) {
  const session = await getServerSession();
  if (!session) {
    return { ok: false as const, message: "ログイン情報を確認できませんでした" };
  }

  const employeeId = session.employeeId || input.answers.employeeId || "external";
  const ownerId = session.employeeId || session.id || input.answers.employeeId || input.answers.email || session.email;
  const employeeName = input.answers.name || session.name;

  // 同じ設定者・種別・年月の既存レコードがあれば更新する（重複防止）
  let existingId = input.id;
  if (!existingId) {
    const period = periodFromTitle(input.title);
    if (period) {
      const all = await listNavigatorRecords({ kind: input.kind, ownerId, employeeId });
      const samePeriod = all.find((r) => periodFromTitle(r.title) === period);
      if (samePeriod) {
        existingId = samePeriod.id;
      }
    }
  }

  const record = await upsertNavigatorRecord({
    id: existingId,
    ownerId,
    kind: input.kind,
    employeeId,
    employeeName,
    department: input.department,
    title: input.title,
    status: input.status,
    answers: input.answers,
    actor: {
      actorId: session.id || session.employeeId,
      actorName: session.name,
    },
  });

  revalidatePath("/goal-navigator");
  revalidatePath("/qualitative-goal-navigator");
  revalidatePath("/goal-navigator/history");
  revalidatePath("/qualitative-goal-navigator/history");
  revalidatePath("/approvals/goal-navigators");

  return { ok: true as const, record };
}

export async function approveNavigatorRecordAction(recordId: string, comment?: string) {
  const session = await getServerSession();
  if (!session) {
    return { ok: false as const, message: "ログイン情報を確認できませんでした" };
  }
  const target = await getNavigatorRecordById(recordId);
  if (!target) return { ok: false as const, message: "対象レコードが見つかりません" };
  if (!isGoalAdmin(session) && !(await isAssignedApproverOf(session, target))) {
    return { ok: false as const, message: "承認権限がありません" };
  }

  const record = await approveNavigatorRecord(
    recordId,
    session?.name || "承認者",
    session?.id || session?.employeeId,
    comment
  );
  if (!record) {
    return { ok: false as const, message: "対象レコードが見つかりません" };
  }

  revalidatePath("/approvals/goal-navigators");
  revalidatePath(`/approvals/goal-navigators/${recordId}`);
  revalidatePath("/goal-navigator/history");
  revalidatePath("/qualitative-goal-navigator/history");

  return { ok: true as const, record };
}

export async function rejectNavigatorRecordAction(recordId: string, comment: string) {
  const session = await getServerSession();
  if (!session) {
    return { ok: false as const, message: "ログイン情報を確認できませんでした" };
  }
  const target = await getNavigatorRecordById(recordId);
  if (!target) return { ok: false as const, message: "対象レコードが見つかりません" };
  if (!isGoalAdmin(session) && !(await isAssignedApproverOf(session, target))) {
    return { ok: false as const, message: "承認権限がありません" };
  }
  if (!comment.trim()) {
    return { ok: false as const, message: "やり直し依頼の理由を入力してください" };
  }

  const record = await rejectNavigatorRecord(
    recordId,
    session?.name || "承認者",
    comment.trim(),
    session?.id || session?.employeeId
  );
  if (!record) {
    return { ok: false as const, message: "対象レコードが見つかりません" };
  }

  revalidatePath("/approvals/goal-navigators");
  revalidatePath(`/approvals/goal-navigators/${recordId}`);
  revalidatePath("/goal-navigator/history");
  revalidatePath("/qualitative-goal-navigator/history");

  return { ok: true as const, record };
}

/** 管理者・担当承認者・本人とも閲覧可能。isAdmin はシステム管理者/人事管理者 */
export async function getNavigatorRecordDetail(recordId: string): Promise<
  | {
      ok: true;
      record: NavigatorRecord;
      canApprove: boolean;
      isOwner: boolean;
      isAdmin: boolean;
    }
  | { ok: false; message: string }
> {
  const session = await getServerSession();
  if (!session) return { ok: false, message: "ログイン情報を確認できませんでした" };

  const record = await getNavigatorRecordById(recordId);
  if (!record) return { ok: false, message: "対象レコードが見つかりません" };

  const isOwner = isOwnerOf(session, record);
  const admin = isGoalAdmin(session);
  const approver = admin || (await isAssignedApproverOf(session, record));

  if (!approver && !isOwner) {
    return { ok: false, message: "この目標設定を閲覧する権限がありません" };
  }

  return { ok: true, record, canApprove: approver, isOwner, isAdmin: admin };
}

/** 一時差戻（編集許可）の発行/解除: 管理者のみ */
export async function setTempEditAction(
  recordId: string,
  enable: boolean,
  reason?: string
): Promise<{ ok: boolean; message?: string }> {
  const session = await getServerSession();
  if (!session) {
    return { ok: false as const, message: "ログイン情報を確認できませんでした" };
  }
  if (!isGoalAdmin(session)) {
    return { ok: false as const, message: "一時差戻は管理者のみ操作できます" };
  }

  const target = await getNavigatorRecordById(recordId);
  if (!target) return { ok: false as const, message: "対象レコードが見つかりません" };
  if (enable && target.status !== "approved") {
    return { ok: false as const, message: "承認済みのシートのみ一時差戻できます" };
  }

  const record = await setTempEditState(
    recordId,
    enable,
    { actorId: session.id || session.employeeId, actorName: session.name },
    reason
  );
  if (!record) return { ok: false as const, message: "更新に失敗しました" };

  revalidatePath("/approvals/goal-navigators");
  revalidatePath(`/approvals/goal-navigators/${recordId}`);
  revalidatePath("/approvals/goal-navigators/approved");
  revalidatePath("/my-goals");
  revalidatePath(`/my-goals/${recordId}`);

  return { ok: true as const };
}

/** 進捗報告の追加：本人または承認者のみ */
export async function addProgressUpdateAction(recordId: string, body: string, percent?: number) {
  const session = await getServerSession();
  if (!session) return { ok: false as const, message: "ログイン情報を確認できませんでした" };
  if (!body.trim()) return { ok: false as const, message: "進捗の内容を入力してください" };

  const target = await getNavigatorRecordById(recordId);
  if (!target) return { ok: false as const, message: "対象レコードが見つかりません" };

  const isOwner = isOwnerOf(session, target);
  if (!isOwner && !isGoalAdmin(session) && !(await isAssignedApproverOf(session, target))) {
    return { ok: false as const, message: "進捗を入力する権限がありません" };
  }

  const record = await addProgressUpdate(recordId, {
    authorId: session.id || session.employeeId,
    authorName: session.name,
    body: body.trim(),
    percent: typeof percent === "number" && !Number.isNaN(percent) ? Math.max(0, Math.min(100, percent)) : undefined,
  });
  if (!record) return { ok: false as const, message: "進捗の保存に失敗しました" };

  revalidatePath(`/approvals/goal-navigators/${recordId}`);
  revalidatePath("/goal-navigator/history");
  revalidatePath("/qualitative-goal-navigator/history");

  return { ok: true as const, record };
}

/** 進捗へのコメント返信：本人または承認者のみ */
export async function addProgressReplyAction(recordId: string, updateId: string, body: string) {
  const session = await getServerSession();
  if (!session) return { ok: false as const, message: "ログイン情報を確認できませんでした" };
  if (!body.trim()) return { ok: false as const, message: "コメントを入力してください" };

  const target = await getNavigatorRecordById(recordId);
  if (!target) return { ok: false as const, message: "対象レコードが見つかりません" };

  const isOwner = isOwnerOf(session, target);
  const approver = isGoalAdmin(session) || (await isAssignedApproverOf(session, target));
  if (!isOwner && !approver) {
    return { ok: false as const, message: "コメントを入力する権限がありません" };
  }

  const record = await addProgressReply(recordId, updateId, {
    authorId: session.id || session.employeeId,
    authorName: session.name,
    isApprover: approver,
    body: body.trim(),
  });
  if (!record) return { ok: false as const, message: "コメントの保存に失敗しました" };

  revalidatePath(`/approvals/goal-navigators/${recordId}`);

  return { ok: true as const, record };
}

/** 進捗数値・結果数値の後日更新：本人または承認者のみ。承認ステータスは変えない */
export async function updateGoalMetricsAction(recordId: string, patch: Record<string, string>) {
  const session = await getServerSession();
  if (!session) return { ok: false as const, message: "ログイン情報を確認できませんでした" };

  const target = await getNavigatorRecordById(recordId);
  if (!target) return { ok: false as const, message: "対象レコードが見つかりません" };

  const isOwner = isOwnerOf(session, target);
  if (!isOwner && !isGoalAdmin(session) && !(await isAssignedApproverOf(session, target))) {
    return { ok: false as const, message: "この目標を更新する権限がありません" };
  }

  // 許可するキーのみ（進捗数値・結果数値）に限定
  const allowed = new Set([
    "company_progress",
    "company_result",
    "team_progress",
    "team_result",
    "personal_progress",
    "personal_result",
  ]);
  const safePatch: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (allowed.has(k)) safePatch[k] = String(v ?? "");
  }
  if (Object.keys(safePatch).length === 0) {
    return { ok: false as const, message: "更新対象の数値がありません" };
  }

  const record = await updateNavigatorMetrics(recordId, safePatch);
  if (!record) return { ok: false as const, message: "更新に失敗しました" };

  revalidatePath("/goal-navigator");
  revalidatePath("/goal-navigator/history");
  revalidatePath(`/approvals/goal-navigators/${recordId}`);

  return { ok: true as const, record };
}

/** 承認済みシートの編集可否: 一時差戻中のみ全項目可。未発行ならテンプレート設定の進捗入力・結果入力項目のみ可 */
async function checkApprovedEditPermission(
  target: NavigatorRecord,
  answers: Record<string, string>
): Promise<string | null> {
  if (target.status !== "approved" || target.tempEdit) return null;
  const template = mergeSheetTemplate(await getSavedSheetTemplate());
  const fieldCfgs = template[target.kind] ?? {};
  const changed = Object.keys(answers).filter(
    (k) => String(answers[k] ?? "") !== (target.answers[k] ?? "")
  );
  const disallowed = changed.filter((k) => {
    const cfg = fieldCfgs[k];
    if (!cfg) return true;
    return cfg.timing !== "progress" && cfg.timing !== "result";
  });
  if (disallowed.length > 0) {
    return "承認済みのため、進捗入力・結果入力の項目以外は編集できません。編集するには管理者による一時差戻が必要です。";
  }
  return null;
}

/** 承認者による入力内容の編集・保存：管理者または担当承認者のみ。承認ステータスは変えない */
export async function updateNavigatorAnswersAction(
  recordId: string,
  answers: Record<string, string>
) {
  const session = await getServerSession();
  if (!session) {
    return { ok: false as const, message: "ログイン情報を確認できませんでした" };
  }

  const target = await getNavigatorRecordById(recordId);
  if (!target) return { ok: false as const, message: "対象レコードが見つかりません" };

  if (!isGoalAdmin(session) && !(await isAssignedApproverOf(session, target))) {
    return { ok: false as const, message: "編集する権限がありません（承認者のみ）" };
  }

  const locked = await checkApprovedEditPermission(target, answers);
  if (locked) return { ok: false as const, message: locked };

  const safeAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers)) {
    safeAnswers[k] = String(v ?? "");
  }

  const record = await updateNavigatorAnswers(recordId, safeAnswers, {
    actorId: session?.id || session?.employeeId,
    actorName: session?.name || "承認者",
  });
  if (!record) return { ok: false as const, message: "保存に失敗しました" };

  revalidatePath("/approvals/goal-navigators");
  revalidatePath(`/approvals/goal-navigators/${recordId}`);
  revalidatePath("/goal-navigator/history");
  revalidatePath("/qualitative-goal-navigator/history");

  return { ok: true as const, record };
}

/** 目標設定シートの直接編集：本人（所有者）もしくは承認者 */
export async function updateOwnNavigatorAnswersAction(
  recordId: string,
  answers: Record<string, string>
) {
  const session = await getServerSession();
  if (!session) {
    return { ok: false as const, message: "ログイン情報を確認できませんでした" };
  }

  const target = await getNavigatorRecordById(recordId);
  if (!target) return { ok: false as const, message: "対象レコードが見つかりません" };

  const isOwner = isOwnerOf(session, target);
  const approver = isGoalAdmin(session) || (await isAssignedApproverOf(session, target));
  if (!isOwner && !approver) {
    return { ok: false as const, message: "この目標設定を編集する権限がありません" };
  }

  const locked = await checkApprovedEditPermission(target, answers);
  if (locked) return { ok: false as const, message: locked };

  const safeAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers)) {
    safeAnswers[k] = String(v ?? "");
  }

  const record = await updateNavigatorAnswers(recordId, safeAnswers, {
    actorId: session?.id || session?.employeeId,
    actorName: session?.name || (approver ? "承認者" : "本人"),
  });
  if (!record) return { ok: false as const, message: "保存に失敗しました" };

  revalidatePath("/my-goals");
  revalidatePath(`/my-goals/${recordId}`);
  revalidatePath("/approvals/goal-navigators");
  revalidatePath(`/approvals/goal-navigators/${recordId}`);
  revalidatePath("/goal-navigator/history");
  revalidatePath("/qualitative-goal-navigator/history");

  return { ok: true as const, record };
}

/** 目標項目への承認者コメント：管理者または担当承認者のみ。複数人・複数件可 */
export async function addItemCommentAction(
  recordId: string,
  target: ItemComment["target"],
  body: string
) {
  const session = await getServerSession();
  if (!session) {
    return { ok: false as const, message: "ログイン情報を確認できませんでした" };
  }

  const record0 = await getNavigatorRecordById(recordId);
  if (!record0) return { ok: false as const, message: "対象レコードが見つかりません" };

  if (!isGoalAdmin(session) && !(await isAssignedApproverOf(session, record0))) {
    return { ok: false as const, message: "コメントする権限がありません（承認者のみ）" };
  }
  if (!body.trim()) return { ok: false as const, message: "コメントを入力してください" };

  const record = await addItemComment(recordId, {
    authorId: session?.id || session?.employeeId,
    authorName: session?.name || "承認者",
    isApprover: true,
    target,
    body: body.trim(),
  });
  if (!record) return { ok: false as const, message: "対象レコードが見つかりません" };

  revalidatePath("/goal-navigator");
  revalidatePath("/goal-navigator/history");
  revalidatePath(`/approvals/goal-navigators/${recordId}`);

  return { ok: true as const, record };
}

export async function getMyNavigatorRecords(kind?: NavigatorKind): Promise<NavigatorRecord[]> {
  const session = await getServerSession();
  const ownerId = session?.employeeId || session?.id || session?.email;
  if (!ownerId) return [];
  const records = await listNavigatorRecords({ kind, ownerId, employeeId: session.employeeId });
  return dedupeRecordsByPeriod(records);
}

export async function getApprovalNavigatorRecords(kind?: NavigatorKind): Promise<NavigatorRecord[]> {
  const session = await getServerSession();
  if (!session) return [];
  const records = await listNavigatorRecords({ kind, includeAll: true });
  const scoped = await filterRecordsForApprover(session, records);
  const deduped = dedupeRecordsByPeriod(scoped);
  return deduped.filter((record) => record.status === "submitted" || record.status === "rejected");
}

/** 承認一覧などのアクセス可否: 管理者（全件）または担当承認者（担当分） */
export async function getApprovalAccess(): Promise<boolean> {
  const session = await getServerSession();
  return await hasApproverAccess(session);
}

export async function getApprovedNavigatorRecords(kind?: NavigatorKind): Promise<NavigatorRecord[]> {
  const session = await getServerSession();
  if (!session) return [];
  const records = await listNavigatorRecords({ kind, includeAll: true });
  const scoped = await filterRecordsForApprover(session, records);
  const deduped = dedupeRecordsByPeriod(scoped);
  return deduped.filter((record) => record.status === "approved");
}

/** ログイン中スタッフのプロフィール（名前・部署・グレード）を返す。定性シートの能力項目フィルタ等で使用。 */
export async function getMyProfile(): Promise<{
  name: string;
  department: string;
  grade: string;
  employeeId: string;
} | null> {
  const session = await getServerSession();
  if (!session) return null;
  let grade = "";
  let department = "";
  const employeeId = session.employeeId || "";
  if (employeeId) {
    try {
      const staff = await getStaff(employeeId);
      if (staff) {
        grade = staff.grade || "";
        department = staff.team || staff.department || "";
      }
    } catch {
      // フォールバック（取得失敗時は空のまま）
    }
  }
  return { name: session.name || "", department, grade, employeeId };
}
"use server";

import { revalidatePath } from "next/cache";
import {
  canApprove,
  getServerSession,
  listNavigatorRecords,
  type NavigatorKind,
  type RecordStatus,
} from "@/lib/goalNavigatorStore";
import {
  listGoalAssignments,
  upsertGoalAssignment,
  deleteGoalAssignment,
  getRosterSettings,
  saveRosterSettings,
  type GoalAssignment,
  type RosterSettings,
} from "@/lib/goalAssignmentStore";
import { listStaff } from "@/lib/staffServerStore";

export type SheetRecordInfo = {
  recordId: string;
  employeeId: string;
  status: RecordStatus;
};

function periodTitlePrefix(period: string): string {
  const [y, m] = period.split("-");
  return `${y}年${m}月`;
}

export async function getGoalAssignmentAccess(): Promise<boolean> {
  const session = await getServerSession();
  return canApprove(session);
}

export async function getGoalAssignmentsAction(
  period: string,
  kind: NavigatorKind
): Promise<{
  ok: boolean;
  message?: string;
  assignments: GoalAssignment[];
  roster: RosterSettings;
  records: SheetRecordInfo[];
}> {
  const session = await getServerSession();
  if (!canApprove(session)) {
    return {
      ok: false,
      message: "承認者割り当てを閲覧する権限がありません",
      assignments: [],
      roster: { order: [], excludedIds: [] },
      records: [],
    };
  }
  const [assignments, roster, allRecords] = await Promise.all([
    listGoalAssignments({ period }),
    getRosterSettings(),
    listNavigatorRecords({ kind, includeAll: true }),
  ]);

  // 対象期間のシートをタイトル前方一致で抽出し、設定者ごとに最新1件を採用
  const prefix = periodTitlePrefix(period);
  const byEmployee = new Map<string, SheetRecordInfo & { updatedAt: string }>();
  for (const r of allRecords) {
    if (!(r.title || "").startsWith(prefix)) continue;
    const prev = byEmployee.get(r.employeeId);
    if (!prev || r.updatedAt > prev.updatedAt) {
      byEmployee.set(r.employeeId, {
        recordId: r.id,
        employeeId: r.employeeId,
        status: r.status,
        updatedAt: r.updatedAt,
      });
    }
  }
  const records = Array.from(byEmployee.values()).map(
    ({ recordId, employeeId, status }) => ({ recordId, employeeId, status })
  );

  return { ok: true, assignments, roster, records };
}

/** 設定者の表示順を保存（全期間・全シート共通） */
export async function saveRosterOrderAction(input: {
  orderedIds: string[];
}): Promise<{ ok: boolean; message?: string }> {
  const session = await getServerSession();
  if (!canApprove(session)) {
    return { ok: false, message: "並び順を変更する権限がありません" };
  }
  const roster = await getRosterSettings();
  await saveRosterSettings({
    order: input.orderedIds.filter((id) => typeof id === "string" && id),
    excludedIds: roster.excludedIds,
  });
  revalidatePath("/approvals/goal-assignments");
  return { ok: true };
}

/** 対象/対象外の切替（全期間・全シート共通） */
export async function setRosterTargetAction(input: {
  employeeId: string;
  isTarget: boolean;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await getServerSession();
  if (!canApprove(session)) {
    return { ok: false, message: "対象設定を変更する権限がありません" };
  }
  const roster = await getRosterSettings();
  const excluded = new Set(roster.excludedIds);
  if (input.isTarget) excluded.delete(input.employeeId);
  else excluded.add(input.employeeId);
  await saveRosterSettings({
    order: roster.order,
    excludedIds: Array.from(excluded),
  });
  revalidatePath("/approvals/goal-assignments");
  return { ok: true };
}

export async function saveGoalAssignmentAction(input: {
  period: string;
  employeeId: string;
  primaryApproverId: string;
  secondaryApproverId?: string;
}): Promise<{ ok: boolean; message?: string; assignment?: GoalAssignment }> {
  const session = await getServerSession();
  if (!canApprove(session)) {
    return { ok: false, message: "承認者割り当てを変更する権限がありません" };
  }
  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    return { ok: false, message: "対象期間の形式が不正です" };
  }

  const staff = await listStaff();
  const employee = staff.find((s) => s.id === input.employeeId);
  if (!employee) return { ok: false, message: "設定者が見つかりません" };

  if (!input.primaryApproverId) {
    return { ok: false, message: "一次承認者を選択してください" };
  }
  if (input.primaryApproverId === input.employeeId) {
    return { ok: false, message: "一次承認者に設定者本人は指定できません" };
  }
  const primary = staff.find((s) => s.id === input.primaryApproverId);
  if (!primary) return { ok: false, message: "一次承認者が見つかりません" };

  let secondaryName: string | undefined;
  if (input.secondaryApproverId) {
    if (input.secondaryApproverId === input.employeeId) {
      return { ok: false, message: "二次承認者に設定者本人は指定できません" };
    }
    if (input.secondaryApproverId === input.primaryApproverId) {
      return { ok: false, message: "二次承認者に一次承認者と同じ人は指定できません" };
    }
    const secondary = staff.find((s) => s.id === input.secondaryApproverId);
    if (!secondary) return { ok: false, message: "二次承認者が見つかりません" };
    secondaryName = secondary.name;
  }

  const assignment = await upsertGoalAssignment({
    period: input.period,
    employeeId: employee.id,
    employeeName: employee.name,
    primaryApproverId: primary.id,
    primaryApproverName: primary.name,
    secondaryApproverId: input.secondaryApproverId,
    secondaryApproverName: secondaryName,
  });

  revalidatePath("/approvals/goal-assignments");
  return { ok: true, assignment };
}

export async function removeGoalAssignmentAction(input: {
  period: string;
  employeeId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await getServerSession();
  if (!canApprove(session)) {
    return { ok: false, message: "承認者割り当てを変更する権限がありません" };
  }
  await deleteGoalAssignment(input.period, input.employeeId);
  revalidatePath("/approvals/goal-assignments");
  return { ok: true };
}

// ---- 承認者向け通知 ----

export type ApprovalNotification = {
  recordId: string;
  kind: NavigatorKind;
  employeeId: string;
  employeeName: string;
  title: string;
  submittedAt: string;
};

/**
 * ログイン中ユーザーが一次承認者に割り当てられている設定者の
 * 「提出済み」シートを通知として返す（マイページ表示用）。
 */
export async function getApproverNotificationsAction(): Promise<{
  ok: boolean;
  notifications: ApprovalNotification[];
}> {
  const session = await getServerSession();
  if (!session?.employeeId) {
    return { ok: true, notifications: [] };
  }

  const [assignments, quantitative, qualitative] = await Promise.all([
    listGoalAssignments(),
    listNavigatorRecords({ kind: "quantitative", includeAll: true }),
    listNavigatorRecords({ kind: "qualitative", includeAll: true }),
  ]);

  // 担当承認者（一次・二次）が自分の割り当てだけ抽出
  const mine = new Map<string, GoalAssignment>();
  for (const a of assignments) {
    if (
      a.primaryApproverId === session.employeeId ||
      (a.secondaryApproverId ?? "") === session.employeeId
    ) {
      mine.set(`${a.period}__${a.employeeId}`, a);
    }
  }
  if (mine.size === 0) return { ok: true, notifications: [] };

  const periodOf = (title: string): string | null => {
    const m = /^(\d{4})年(\d{2})月/.exec(title || "");
    return m ? `${m[1]}-${m[2]}` : null;
  };

  // 提出済みレコードを設定者・期間・種別ごとに最新1件へ集約
  type Entry = ApprovalNotification & { updatedAt: string };
  const latest = new Map<string, Entry>();
  for (const r of [...quantitative, ...qualitative]) {
    if (r.status !== "submitted") continue;
    const period = periodOf(r.title);
    if (!period) continue;
    if (!mine.has(`${period}__${r.employeeId}`)) continue;
    const key = `${period}__${r.kind}__${r.employeeId}`;
    const prev = latest.get(key);
    if (prev && prev.updatedAt >= r.updatedAt) continue;
    latest.set(key, {
      recordId: r.id,
      kind: r.kind,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      title: r.title,
      submittedAt: r.updatedAt,
      updatedAt: r.updatedAt,
    });
  }

  const notifications = Array.from(latest.values())
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map(({ recordId, kind, employeeId, employeeName, title, submittedAt }) => ({
      recordId,
      kind,
      employeeId,
      employeeName,
      title,
      submittedAt,
    }));

  return { ok: true, notifications };
}

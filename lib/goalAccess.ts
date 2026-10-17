import {
  getGoalAssignment,
  listGoalAssignments,
} from "@/lib/goalAssignmentStore";
import type { NavigatorRecord, NavigatorSession } from "@/lib/goalNavigatorStore";

/**
 * 目標設定シートのアクセス制御。
 * - 管理者（admin / hr_manager）: 全員の提出物を閲覧・編集・承認できる
 * - 担当承認者（一次・二次）: 担当した設定者の提出物のみ閲覧・編集・承認できる
 * - 本人: 自分の提出物を閲覧・編集できる
 * - その他: アクセス不可
 */

export function isGoalAdmin(session: NavigatorSession | null | undefined): boolean {
  return session?.permissionId === "admin" || session?.permissionId === "hr_manager";
}

export function periodFromTitle(title: string | undefined | null): string | null {
  const m = /^(\d{4})年(\d{2})月/.exec(title || "");
  return m ? `${m[1]}-${m[2]}` : null;
}

export function isOwnerOf(
  session: NavigatorSession | null | undefined,
  record: NavigatorRecord
): boolean {
  const ownerId = session?.employeeId || session?.id || session?.email;
  return Boolean(ownerId && record.ownerId === ownerId);
}

/** そのレコードの担当承認者（一次・二次）かどうか */
export async function isAssignedApproverOf(
  session: NavigatorSession | null | undefined,
  record: NavigatorRecord
): Promise<boolean> {
  if (!session?.employeeId) return false;
  const period = periodFromTitle(record.title);
  if (!period) return false;
  const a = await getGoalAssignment(period, record.employeeId);
  if (!a) return false;
  return (
    a.primaryApproverId === session.employeeId ||
    (a.secondaryApproverId ?? "") === session.employeeId
  );
}

/** 閲覧・編集・承認の権限判定 */
export async function resolveRecordAccess(
  session: NavigatorSession | null | undefined,
  record: NavigatorRecord
): Promise<{ canView: boolean; canEdit: boolean; canApprove: boolean; isOwner: boolean }> {
  const isOwner = isOwnerOf(session, record);
  const admin = isGoalAdmin(session);
  const assigned = await isAssignedApproverOf(session, record);
  const canApprove = admin || assigned;
  const canView = isOwner || canApprove;
  return { canView, canEdit: canView, canApprove, isOwner };
}

/** 一覧用: 管理者は全件、担当承認者は担当分のみ返す */
export async function filterRecordsForApprover(
  session: NavigatorSession | null | undefined,
  records: NavigatorRecord[]
): Promise<NavigatorRecord[]> {
  if (isGoalAdmin(session)) return records;
  if (!session?.employeeId) return [];
  const assignments = await listGoalAssignments();
  const mine = new Set<string>();
  for (const a of assignments) {
    if (
      a.primaryApproverId === session.employeeId ||
      (a.secondaryApproverId ?? "") === session.employeeId
    ) {
      mine.add(`${a.period}__${a.employeeId}`);
    }
  }
  if (mine.size === 0) return [];
  return records.filter((r) => {
    const period = periodFromTitle(r.title);
    return period ? mine.has(`${period}__${r.employeeId}`) : false;
  });
}

/** 承認者が担当する設定者の employeeId 一覧を取得 */
export async function getAssignedEmployeeIds(
  session: NavigatorSession | null | undefined
): Promise<Set<string>> {
  if (!session?.employeeId) return new Set();
  if (isGoalAdmin(session)) return new Set(); // 管理者は全員対象なので空セット
  const assignments = await listGoalAssignments();
  const ids = new Set<string>();
  for (const a of assignments) {
    if (
      a.primaryApproverId === session.employeeId ||
      (a.secondaryApproverId ?? "") === session.employeeId
    ) {
      ids.add(a.employeeId);
    }
  }
  return ids;
}

/** 承認一覧ページへのアクセス可否: 管理者 or 担当割り当てを持つ人 */
export async function hasApproverAccess(
  session: NavigatorSession | null | undefined
): Promise<boolean> {
  if (isGoalAdmin(session)) return true;
  if (!session?.employeeId) return false;
  const assignments = await listGoalAssignments();
  return assignments.some(
    (a) =>
      a.primaryApproverId === session.employeeId ||
      (a.secondaryApproverId ?? "") === session.employeeId
  );
}

"use server";

import { revalidatePath } from "next/cache";
import {
  findEvaluationPeriod,
  getEvaluationPeriod,
  getEvaluationRecord,
  listEvaluationPeriods,
  listEvaluationRecords,
  saveEvaluationPeriod,
  saveEvaluationRecord,
  monthsForQuarter,
  type EvaluationPeriod,
  type EvaluationRecord,
} from "@/lib/evaluationStore";
import { getServerSession, listNavigatorRecords } from "@/lib/goalNavigatorStore";
import { periodFromTitle } from "@/lib/goalAccess";
import { getStaff, listStaff, saveStaff } from "@/lib/staffServerStore";
import {
  QUALITATIVE_ITEM_LABELS,
  TEAM_LABELS,
  defaultGokyuForStage,
  quantWeightFor,
  salaryForGokyu,
  stageForGrade,
  teamCodeForDepartment,
} from "@/lib/evaluationConfig";

// ---- 権限ゲート（admin / hr_manager のみ） ----

export async function isEvaluationAdmin(): Promise<boolean> {
  const session = await getServerSession();
  return session?.permissionId === "admin" || session?.permissionId === "hr_manager";
}

export async function assertEvaluationAdmin(): Promise<
  | { ok: true; session: { name: string; employeeId: string } }
  | { ok: false; message: string }
> {
  const session = await getServerSession();
  if (!session?.name) {
    return { ok: false, message: "ログイン情報を確認できませんでした" };
  }
  if (session.permissionId !== "admin" && session.permissionId !== "hr_manager") {
    return { ok: false, message: "評価管理へのアクセス権限がありません" };
  }
  return {
    ok: true,
    session: { name: session.name, employeeId: session.employeeId || session.id || "" },
  };
}

// ---- 期間 ----

export async function createEvaluationPeriodAction(
  year: number,
  quarter: 1 | 2 | 3 | 4
): Promise<
  { ok: true; period: EvaluationPeriod } | { ok: false; message: string }
> {
  const auth = await assertEvaluationAdmin();
  if (!auth.ok) return auth;

  const period = await saveEvaluationPeriod({ year, quarter });
  revalidatePath("/evaluations");
  return { ok: true, period };
}

export async function listEvaluationPeriodsAction(): Promise<EvaluationPeriod[]> {
  if (!(await isEvaluationAdmin())) return [];
  return listEvaluationPeriods();
}

// ---- 評価レコード ----

function parseNumber(value: string | undefined | null): number {
  if (!value) return 0;
  const m = String(value).replace(/[¥,]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

export async function getEvaluationRecordsAction(
  periodId?: string
): Promise<EvaluationRecord[]> {
  if (!(await isEvaluationAdmin())) return [];
  const records = await listEvaluationRecords(periodId);
  // currentRank が未設定の旧レコードにスタッフマスターの現状ランクを補完する
  const missing = records.some((r) => !r.currentRank);
  if (missing) {
    const staff = await listStaff();
    const rankById = new Map(staff.map((s) => [s.id, s.evaluationRank || "B"]));
    for (const r of records) {
      if (!r.currentRank) r.currentRank = rankById.get(r.employeeId) || "B";
    }
  }
  return records;
}

/**
 * 期間の評価レコードを全スタッフ分自動生成する。
 * 定量は期間内の各月の承認済み定量目標シートから、月ごとに全社/個人(チーム)の
 * 目標値・結果値を自動取込する（未提出月・解析不能は未入力 = 手動入力対象）。
 */
export async function generateEvaluationRecordsAction(
  periodId: string
): Promise<
  { ok: true; created: number; skipped: number } | { ok: false; message: string }
> {
  const auth = await assertEvaluationAdmin();
  if (!auth.ok) return auth;

  const period = await getEvaluationPeriod(periodId);
  if (!period) return { ok: false, message: "対象期間が見つかりません" };

  const staff = await listStaff();
  const existing = await listEvaluationRecords(periodId);
  const existingByEmployee = new Set(existing.map((r) => r.employeeId));

  // 期間内の承認済み定量目標シートを「従業員×月」ごとの最新1件に整理
  const goalRecords = await listNavigatorRecords({ kind: "quantitative", includeAll: true });
  const inPeriod = goalRecords.filter((r) => {
    if (r.status !== "approved") return false;
    const ym = periodFromTitle(r.title);
    return ym ? monthsInclude(periodId, ym) : false;
  });
  const latestByEmployeeMonth = new Map<string, typeof inPeriod[number]>();
  for (const r of inPeriod) {
    const key = `${r.employeeId || r.ownerId}::${periodFromTitle(r.title)}`;
    const prev = latestByEmployeeMonth.get(key);
    if (!prev || r.updatedAt > prev.updatedAt) latestByEmployeeMonth.set(key, r);
  }

  const now = new Date().toISOString();
  const newRecords: EvaluationRecord[] = [];
  let skipped = 0;

  for (const emp of staff) {
    if (existingByEmployee.has(emp.id)) {
      skipped++;
      continue;
    }
    // 退職者は対象外
    if ((emp.employmentType || "").includes("退職")) {
      skipped++;
      continue;
    }

    const stageGrade = (emp.grade || "-").trim();
    const stage = stageForGrade(stageGrade);
    const teamCode = teamCodeForDepartment(emp.team || emp.department);
    const weight = quantWeightFor(teamCode, stageGrade);
    const currentGokyu = defaultGokyuForStage(stage);
    const currentSalary = salaryForGokyu(stage, currentGokyu);

    // 月ごとに定量目標シートから取込
    const companyMonthly: Record<string, { target: number; result: number }> = {};
    const otherMonthly: Record<string, { target: number; result: number }> = {};
    const sourceRecordIds: string[] = [];
    for (const ym of period.months) {
      const goal = latestByEmployeeMonth.get(`${emp.id}::${ym}`);
      if (!goal) continue;
      sourceRecordIds.push(goal.id);
      const answers = goal.answers || {};
      const companyTarget = parseNumber(answers.company_value);
      const companyResult = parseNumber(answers.company_result);
      if (companyTarget > 0 || companyResult > 0) {
        companyMonthly[ym] = { target: companyTarget, result: companyResult };
      }
      const otherTarget =
        weight.otherType === "team"
          ? parseNumber(answers.team_value) || parseNumber(answers.team_deadline)
          : parseNumber(answers.personal_value);
      const otherResult =
        weight.otherType === "team"
          ? parseNumber(answers.team_result) || parseNumber(answers.monthly_result1)
          : parseNumber(answers.personal_result) || parseNumber(answers.monthly_result1);
      if (otherTarget > 0 || otherResult > 0) {
        otherMonthly[ym] = { target: otherTarget, result: otherResult };
      }
    }

    newRecords.push({
      id: crypto.randomUUID(),
      periodId,
      employeeId: emp.id,
      employeeName: emp.name,
      teamCode,
      teamLabel: TEAM_LABELS[teamCode],
      stageGrade,
      currentRank: emp.evaluationRank || "B",
      currentGokyu,
      currentSalary,
      quantitative: {
        companyMonthly,
        otherMonthly,
        sourceRecordIds,
      },
      qualitative: [0, 1, 2].map((i) => ({
        label: QUALITATIVE_ITEM_LABELS[i],
        monthlyScores: {},
      })),
      adjustment: 0,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  }

  await Promise.all(newRecords.map((r) => saveEvaluationRecord(r)));
  revalidatePath("/evaluations");
  return { ok: true, created: newRecords.length, skipped };
}

function monthsInclude(periodId: string, ym: string): boolean {
  // periodId = "2026-q3" → months = monthsForQuarter(2026, 3)
  const m = /^(\d{4})-q([1-4])$/.exec(periodId);
  if (!m) return false;
  const months = monthsForQuarter(Number(m[1]), Number(m[2]) as 1 | 2 | 3 | 4);
  return months.includes(ym);
}

export async function saveEvaluationRecordAction(
  record: EvaluationRecord
): Promise<{ ok: true; record: EvaluationRecord } | { ok: false; message: string }> {
  const auth = await assertEvaluationAdmin();
  if (!auth.ok) return auth;

  const existing = await getEvaluationRecord(record.id);
  if (!existing) return { ok: false, message: "対象の評価レコードが見つかりません" };
  if (existing.status === "confirmed") {
    return { ok: false, message: "確定済みの評価は編集できません" };
  }
  // 期間・従業員などキー項目は既存値を維持（不正な書き換え防止）
  const next = await saveEvaluationRecord({
    ...record,
    periodId: existing.periodId,
    employeeId: existing.employeeId,
    employeeName: existing.employeeName,
    status: "draft",
    createdAt: existing.createdAt,
  });
  revalidatePath("/evaluations");
  return { ok: true, record: next };
}

export async function finalizeEvaluationRecordAction(
  recordId: string
): Promise<{ ok: true; record: EvaluationRecord } | { ok: false; message: string }> {
  const auth = await assertEvaluationAdmin();
  if (!auth.ok) return auth;

  const existing = await getEvaluationRecord(recordId);
  if (!existing) return { ok: false, message: "対象の評価レコードが見つかりません" };
  if (existing.status === "confirmed") {
    return { ok: false, message: "すでに確定済みです" };
  }

  const { computeEvaluation } = await import("@/lib/evaluationEngine");
  const period = await getEvaluationPeriod(existing.periodId);
  const months = period?.months || monthsForQuarter(2026, 1);
  const computed = computeEvaluation(existing, months);

  // 確定時、スタッフマスターの評価ランクを新しいランクに更新する
  try {
    const emp = await getStaff(existing.employeeId);
    if (emp && emp.evaluationRank !== computed.rank.rank) {
      await saveStaff({ ...emp, evaluationRank: computed.rank.rank });
      revalidatePath("/employees");
      revalidatePath(`/employees/${emp.id}`);
    }
  } catch {
    // スタッフマスター更新の失敗は評価確定自体は止めない
  }

  const next = await saveEvaluationRecord({
    ...existing,
    status: "confirmed",
    currentRank: existing.currentRank,
    finalSalary: computed.finalSalary,
    confirmedAt: new Date().toISOString(),
    confirmedBy: auth.session.name,
  });
  revalidatePath("/evaluations");
  return { ok: true, record: next };
}

export async function reopenEvaluationRecordAction(
  recordId: string
): Promise<{ ok: true; record: EvaluationRecord } | { ok: false; message: string }> {
  const auth = await assertEvaluationAdmin();
  if (!auth.ok) return auth;

  const existing = await getEvaluationRecord(recordId);
  if (!existing) return { ok: false, message: "対象の評価レコードが見つかりません" };

  const next = await saveEvaluationRecord({
    ...existing,
    status: "draft",
    finalSalary: undefined,
    confirmedAt: undefined,
    confirmedBy: undefined,
  });
  revalidatePath("/evaluations");
  return { ok: true, record: next };
}

/** 現在フォーカス中の期間とその評価レコードを一括取得（ページ初期表示用） */
export async function getEvaluationPageDataAction(): Promise<{
  periods: EvaluationPeriod[];
  records: EvaluationRecord[];
  currentPeriodId: string | null;
  isAdmin: boolean;
}> {
  const isAdmin = await isEvaluationAdmin();
  if (!isAdmin) return { periods: [], records: [], currentPeriodId: null, isAdmin };

  const periods = await listEvaluationPeriods();
  if (periods.length === 0) {
    return { periods, records: [], currentPeriodId: null, isAdmin };
  }
  const current = await findEvaluationPeriod(
    periods[0].year,
    periods[0].quarter
  );
  const records = await listEvaluationRecords(current?.id || periods[0].id);
  return {
    periods,
    records,
    currentPeriodId: current?.id || periods[0].id,
    isAdmin,
  };
}

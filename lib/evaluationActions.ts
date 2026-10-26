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
  // スタッフマスター由来の情報（名前・グレード・チーム・現状ランク）を常に最新化する
  const staff = await listStaff();
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const dirty: EvaluationRecord[] = [];
  for (const r of records) {
    const emp = staffById.get(r.employeeId);
    if (!emp) continue;
    const teamCode = teamCodeForDepartment(emp.team || emp.department);
    const next: EvaluationRecord = {
      ...r,
      employeeName: emp.name,
      teamCode,
      teamLabel: TEAM_LABELS[teamCode],
      stageGrade: (emp.grade || "-").trim(),
      currentRank: r.currentRank || emp.evaluationRank || "B",
    };
    if (
      next.employeeName !== r.employeeName ||
      next.teamCode !== r.teamCode ||
      next.teamLabel !== r.teamLabel ||
      next.stageGrade !== r.stageGrade ||
      next.currentRank !== r.currentRank
    ) {
      Object.assign(r, next);
      dirty.push(r);
    }
  }
  if (dirty.length > 0) {
    await Promise.all(dirty.map((r) => saveEvaluationRecord(r)));
  }
  return records;
}

/**
 * 期間の評価レコードを全スタッフ分自動生成・更新する。
 * - 定量: 期間内の各月の承認済み定量目標シートから月ごとに全社/個人(チーム)の目標値・結果値を取込
 * - 定性: 期間内の各月の承認済み定性目標シートから能力項目①〜⑤の評価（一次評価優先、なければ自己評価）を取込
 * - 既存レコードは、未入力の月のみ補完し、手動入力済みの値は上書きしない。
 *   スタッフマスター由来の情報（名前・グレード・チーム・現ランク）は最新化する。
 */
export async function generateEvaluationRecordsAction(
  periodId: string
): Promise<
  { ok: true; created: number; updated: number } | { ok: false; message: string }
> {
  const auth = await assertEvaluationAdmin();
  if (!auth.ok) return auth;

  const period = await getEvaluationPeriod(periodId);
  if (!period) return { ok: false, message: "対象期間が見つかりません" };

  const staff = await listStaff();
  const existing = await listEvaluationRecords(periodId);
  const existingByEmployee = new Map(existing.map((r) => [r.employeeId, r]));

  // 期間内の承認済み目標シートを「種別×従業員×月」ごとの最新1件に整理
  const allGoalRecords = await listNavigatorRecords({ includeAll: true });
  const latestByKindEmployeeMonth = new Map<string, typeof allGoalRecords[number]>();
  for (const r of allGoalRecords) {
    if (r.status !== "approved") continue;
    const ym = periodFromTitle(r.title);
    if (!ym || !monthsInclude(periodId, ym)) continue;
    const key = `${r.kind}::${r.employeeId || r.ownerId}::${ym}`;
    const prev = latestByKindEmployeeMonth.get(key);
    if (!prev || r.updatedAt > prev.updatedAt) latestByKindEmployeeMonth.set(key, r);
  }

  /** 従業員×月の承認済みシート（quantitative / qualitative） */
  function sheetFor(kind: string, employeeId: string, ym: string) {
    return latestByKindEmployeeMonth.get(`${kind}::${employeeId}::${ym}`);
  }

  /** 定量の月別エントリをシートから取り出す */
  function quantEntriesFromSheet(
    answers: Record<string, string>,
    weight: { otherType: string }
  ) {
    const companyTarget = parseNumber(answers.company_value);
    const companyResult = parseNumber(answers.company_result);
    const otherTarget =
      weight.otherType === "team"
        ? parseNumber(answers.team_value) || parseNumber(answers.team_deadline)
        : parseNumber(answers.personal_value);
    const otherResult =
      weight.otherType === "team"
        ? parseNumber(answers.team_result) || parseNumber(answers.monthly_result1)
        : parseNumber(answers.personal_result) || parseNumber(answers.monthly_result1);
    return { companyTarget, companyResult, otherTarget, otherResult };
  }

  /** 定性の能力項目①〜⑤の点数をシートから取り出す（一次評価優先、なければ自己評価） */
  function qualScoresFromSheet(answers: Record<string, string>): number[] {
    return [1, 2, 3, 4, 5].map((n) => {
      const first = parseNumber(answers[`q_first_${n}`]);
      if (first > 0) return 10;
      const self = parseNumber(answers[`q_self_${n}`]);
      if (self > 0) return 10;
      return 0;
    });
  }

  const now = new Date().toISOString();
  const newRecords: EvaluationRecord[] = [];
  const updatedRecords: EvaluationRecord[] = [];
  let updatedCount = 0;

  for (const emp of staff) {
    // 退職者は対象外
    if ((emp.employmentType || "").includes("退職")) continue;

    const stageGrade = (emp.grade || "-").trim();
    const stage = stageForGrade(stageGrade);
    const teamCode = teamCodeForDepartment(emp.team || emp.department);
    const teamLabel = TEAM_LABELS[teamCode];
    const weight = quantWeightFor(teamCode, stageGrade);

    const existingRecord = existingByEmployee.get(emp.id);

    // ---- スタッフマスター由来のフィールド ----
    const staffFields = {
      employeeName: emp.name,
      teamCode,
      teamLabel,
      stageGrade,
      currentRank: existingRecord?.currentRank || emp.evaluationRank || "B",
    };

    // ---- 月別データをシートから収集 ----
    const companyMonthly: Record<string, { target: number; result: number }> = {};
    const otherMonthly: Record<string, { target: number; result: number }> = {};
    const qualMonthly: Record<number, Record<string, number>> = {};
    const sourceRecordIds: string[] = [];
    for (const ym of period.months) {
      const quantSheet = sheetFor("quantitative", emp.id, ym);
      if (quantSheet) {
        sourceRecordIds.push(quantSheet.id);
        const { companyTarget, companyResult, otherTarget, otherResult } =
          quantEntriesFromSheet(quantSheet.answers || {}, weight);
        if (companyTarget > 0 || companyResult > 0) {
          companyMonthly[ym] = { target: companyTarget, result: companyResult };
        }
        if (otherTarget > 0 || otherResult > 0) {
          otherMonthly[ym] = { target: otherTarget, result: otherResult };
        }
      }
      const qualSheet = sheetFor("qualitative", emp.id, ym);
      if (qualSheet) {
        sourceRecordIds.push(qualSheet.id);
        const scores = qualScoresFromSheet(qualSheet.answers || {});
        scores.forEach((score, i) => {
          if (score > 0) {
            if (!qualMonthly[i]) qualMonthly[i] = {};
            qualMonthly[i][ym] = score;
          }
        });
      }
    }

    if (!existingRecord) {
      // ---- 新規作成 ----
      const currentGokyu = defaultGokyuForStage(stage);
      const currentSalary = salaryForGokyu(stage, currentGokyu);
      newRecords.push({
        id: crypto.randomUUID(),
        periodId,
        employeeId: emp.id,
        ...staffFields,
        currentGokyu,
        currentSalary,
        quantitative: {
          companyMonthly,
          otherMonthly,
          sourceRecordIds,
        },
        qualitative: [0, 1, 2, 3, 4].map((i) => ({
          label: QUALITATIVE_ITEM_LABELS[i],
          monthlyScores: qualMonthly[i] || {},
        })),
        adjustment: 0,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    // ---- 既存レコードの更新（未入力のみ補完・手動値は保持） ----
    let changed = false;
    const next: EvaluationRecord = { ...existingRecord };

    if (
      next.employeeName !== staffFields.employeeName ||
      next.teamCode !== staffFields.teamCode ||
      next.teamLabel !== staffFields.teamLabel ||
      next.stageGrade !== staffFields.stageGrade
    ) {
      Object.assign(next, staffFields, {
        currentRank: next.currentRank || staffFields.currentRank,
      });
      changed = true;
    }

    const q = next.quantitative;
    for (const ym of period.months) {
      if (!q.companyMonthly[ym] && companyMonthly[ym]) {
        q.companyMonthly[ym] = companyMonthly[ym];
        changed = true;
      }
      if (!q.otherMonthly[ym] && otherMonthly[ym]) {
        q.otherMonthly[ym] = otherMonthly[ym];
        changed = true;
      }
    }
    const newSourceIds = sourceRecordIds.filter((id) => !q.sourceRecordIds.includes(id));
    if (newSourceIds.length > 0) {
      q.sourceRecordIds = [...q.sourceRecordIds, ...newSourceIds];
      changed = true;
    }

    // 定性: 5項目に正規化し、未入力の月のみ補完
    const qualitative = [0, 1, 2, 3, 4].map((i) => {
      const item = next.qualitative[i] || {
        label: QUALITATIVE_ITEM_LABELS[i],
        monthlyScores: {},
      };
      const monthlyScores = { ...item.monthlyScores };
      for (const ym of period.months) {
        if (monthlyScores[ym] === undefined && qualMonthly[i]?.[ym] !== undefined) {
          monthlyScores[ym] = qualMonthly[i][ym];
          changed = true;
        }
      }
      return { ...item, monthlyScores };
    });
    if (qualitative.length !== next.qualitative.length) changed = true;
    next.qualitative = qualitative;

    if (changed && next.status !== "confirmed") {
      updatedRecords.push(next);
      updatedCount++;
    }
  }

  await Promise.all(newRecords.map((r) => saveEvaluationRecord(r)));
  await Promise.all(updatedRecords.map((r) => saveEvaluationRecord(r)));
  revalidatePath("/evaluations");
  return { ok: true, created: newRecords.length, updated: updatedCount };
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

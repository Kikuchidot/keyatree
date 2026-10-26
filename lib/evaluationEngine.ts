/**
 * 人事評価の算出エンジン（純粋関数・クライアント/サーバー両方で使用可）
 *
 * 算出フロー:
 *  1. 定量（月別）: 各月の全社・個人/チームの目標値/結果値 → 月別達成率（各100%で頭打ち）
 *     四半期達成率 = Σ結果値 / Σ目標値（月別入力がある場合。無い場合は旧形式の合算値でフォールバック）
 *  2. 定量ポイント = 四半期全社達成率 × 全社ウエイト + 四半期個人/チーム達成率 × 相手ウエイト
 *  3. 定性: Σ(項目の月別点数) / (項目数 × 月数 × 10) → 達成率 → ×定性配点(120) → 定性ポイント
 *  4. 総合点 = 定量ポイント + 定性ポイント → 獲得ランク（S〜E）→ 号俸ポイント（+3〜-3）
 *  5. 新号俸 = 現号俸 + 号俸ポイント（ステージ範囲に収める）→ 給料テーブル → ②評価結果基本給
 *  6. ③確定基本給 = ② + 手動調整額
 */

import {
  QUALITATIVE_MAX_POINTS,
  QUALITATIVE_MONTHLY_MAX,
  clampGokyu,
  quantWeightFor,
  rankForScore,
  salaryForGokyu,
  stageForGrade,
  type QuantWeight,
  type RankEntry,
  type Stage,
} from "./evaluationConfig";
import type {
  EvaluationRecord,
  MonthlyTargetResult,
  QualItem,
} from "./evaluationStore";

export type EvaluationComputed = {
  stage: Stage;
  weight: QuantWeight;
  /** 月別の全社達成率（%・100%頭打ち。未入力月は null） */
  monthlyCompanyRates: (number | null)[];
  /** 月別の個人/チーム達成率（%・100%頭打ち。未入力月は null） */
  monthlyOtherRates: (number | null)[];
  /** 四半期の全社合計（目標・結果） */
  companySum: { target: number; result: number };
  /** 四半期の個人/チーム合計（目標・結果） */
  otherSum: { target: number; result: number };
  companyRate: number | null;
  otherRate: number | null;
  companyPoints: number;
  otherPoints: number;
  quantPoints: number;
  qualItemScores: number[];
  qualItemMax: number;
  qualScore: number;
  qualMax: number;
  qualRate: number | null;
  qualPoints: number;
  totalScore: number;
  rank: RankEntry;
  newGokyu: number;
  resultSalary: number; // ②評価結果基本給
  finalSalary: number; // ③確定基本給
  diffFromCurrent: number; // ③-① 増減
  adjustment: number; // 評価結果調整額（③-②）
};

function monthlyRate(entry: MonthlyTargetResult | undefined): number | null {
  if (!entry || !entry.target || entry.target <= 0) return null;
  return Math.min((entry.result / entry.target) * 100, 100);
}

function hasEntry(entry: MonthlyTargetResult | undefined): boolean {
  return !!entry && (entry.target > 0 || entry.result > 0);
}

function sumEntries(entries: (MonthlyTargetResult | undefined)[]): { target: number; result: number } {
  const sum = { target: 0, result: 0 };
  for (const e of entries) {
    sum.target += e?.target || 0;
    sum.result += e?.result || 0;
  }
  return sum;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function qualItemScore(item: QualItem, months: string[]): number {
  return months.reduce((sum, m) => sum + (Number(item.monthlyScores?.[m]) || 0), 0);
}

export function computeEvaluation(
  record: Pick<
    EvaluationRecord,
    | "stageGrade"
    | "teamCode"
    | "currentGokyu"
    | "currentSalary"
    | "quantitative"
    | "qualitative"
    | "adjustment"
  >,
  months: string[]
): EvaluationComputed {
  const stage = stageForGrade(record.stageGrade);
  const weight = quantWeightFor(record.teamCode, record.stageGrade);
  const q = record.quantitative;

  // ---- 定量（月別） ----
  const companyEntries = months.map((m) => q.companyMonthly?.[m]);
  const otherEntries = months.map((m) => q.otherMonthly?.[m]);
  const monthlyCompanyRates = companyEntries.map(monthlyRate);
  const monthlyOtherRates = otherEntries.map(monthlyRate);

  const useCompanyMonthly = companyEntries.some(hasEntry);
  const useOtherMonthly = otherEntries.some(hasEntry);

  const companySum = useCompanyMonthly
    ? sumEntries(companyEntries)
    : { target: q.companyTarget || 0, result: q.companyResult || 0 };
  const otherSum = useOtherMonthly
    ? sumEntries(otherEntries)
    : { target: q.otherTarget || 0, result: q.otherResult || 0 };

  const companyRate =
    companySum.target > 0 ? Math.min((companySum.result / companySum.target) * 100, 100) : null;
  const otherRate =
    otherSum.target > 0 ? Math.min((otherSum.result / otherSum.target) * 100, 100) : null;

  const companyPoints = companyRate !== null ? companyRate * weight.company : 0;
  const otherPoints =
    otherRate !== null && weight.other > 0 ? otherRate * weight.other : 0;
  const quantPoints = companyPoints + otherPoints;

  // ---- 定性 ----
  const items = record.qualitative || [];
  const qualItemMax = months.length * QUALITATIVE_MONTHLY_MAX;
  const qualItemScores = items.map((item) => qualItemScore(item, months));
  const qualScore = qualItemScores.reduce((a, b) => a + b, 0);
  const qualMax = items.length * qualItemMax;
  const qualRate = qualMax > 0 ? (qualScore / qualMax) * 100 : null;
  const qualPoints = qualRate !== null ? (qualRate / 100) * QUALITATIVE_MAX_POINTS : 0;

  // ---- 総合 → 号俸 → 基本給 ----
  const totalScore = quantPoints + qualPoints;
  const rank = rankForScore(totalScore);

  const currentGokyu = clampGokyu(stage, record.currentGokyu);
  const newGokyu = clampGokyu(stage, currentGokyu + rank.gokyuPoints);
  const resultSalary = salaryForGokyu(stage, newGokyu);
  const adjustment = Number(record.adjustment) || 0;
  const finalSalary = resultSalary + adjustment;

  return {
    stage,
    weight,
    monthlyCompanyRates: monthlyCompanyRates.map((r) => (r !== null ? round1(r) : null)),
    monthlyOtherRates: monthlyOtherRates.map((r) => (r !== null ? round1(r) : null)),
    companySum,
    otherSum,
    companyRate: companyRate !== null ? round1(companyRate) : null,
    otherRate: otherRate !== null ? round1(otherRate) : null,
    companyPoints: round2(companyPoints),
    otherPoints: round2(otherPoints),
    quantPoints: round2(quantPoints),
    qualItemScores,
    qualItemMax,
    qualScore,
    qualMax,
    qualRate: qualRate !== null ? round1(qualRate) : null,
    qualPoints: round2(qualPoints),
    totalScore: round1(totalScore),
    rank,
    newGokyu,
    resultSalary,
    finalSalary,
    diffFromCurrent: finalSalary - record.currentSalary,
    adjustment,
  };
}

export function formatYen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

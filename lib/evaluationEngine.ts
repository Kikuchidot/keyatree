/**
 * 人事評価の算出エンジン（純粋関数・クライアント/サーバー両方で使用可）
 *
 * 算出フロー:
 *  1. 定量: 全社達成率 × 全社ウエイト + 個人/チーム達成率 × 相手ウエイト → 定量ポイント（各達成率は100%で頭打ち）
 *  2. 定性: Σ(項目の月別点数) / (項目数 × 月数 × 10) → 達成率 → ×定性配点(120) → 定性ポイント
 *  3. 総合点 = 定量ポイント + 定性ポイント → 獲得ランク（S〜E）→ 号俸ポイント（+3〜-3）
 *  4. 新号俸 = 現号俸 + 号俸ポイント（ステージ範囲に収める）→ 給料テーブル → ②評価結果基本給
 *  5. ③確定基本給 = ② + 手動調整額
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
import type { EvaluationRecord, QualItem } from "./evaluationStore";

export type EvaluationComputed = {
  stage: Stage;
  weight: QuantWeight;
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

function rate(target: number, result: number): number | null {
  if (!target || target <= 0) return null;
  return Math.min((result / target) * 100, 100);
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

  const companyRate = rate(q.companyTarget, q.companyResult);
  const otherRate = q.otherTarget > 0 ? rate(q.otherTarget, q.otherResult) : null;

  const companyPoints = companyRate !== null ? companyRate * weight.company : 0;
  const otherPoints = otherRate !== null && weight.other > 0 ? otherRate * weight.other : 0;
  const quantPoints = companyPoints + otherPoints;

  const items = record.qualitative || [];
  const qualItemMax = months.length * QUALITATIVE_MONTHLY_MAX;
  const qualItemScores = items.map((item) => qualItemScore(item, months));
  const qualScore = qualItemScores.reduce((a, b) => a + b, 0);
  const qualMax = items.length * qualItemMax;
  const qualRate = qualMax > 0 ? (qualScore / qualMax) * 100 : null;
  const qualPoints = qualRate !== null ? (qualRate / 100) * QUALITATIVE_MAX_POINTS : 0;

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

/**
 * 人事評価の設定値（PDF資料から抽出した初期値）
 * - チーム別・グレード別の定量ウエイト（全社 / チームor個人）
 * - 獲得ランク表（総合点 → 号俸ポイント）
 * - 給料テーブル（ステージ × 号俸 → 基本給）
 * 将来的にはマスター管理画面から編集可能にすることを想定したデータ駆動構造。
 */

export type Stage = "staff" | "leader" | "manager";

export type QuantWeight = {
  company: number;
  other: number;
  otherType: "team" | "personal" | "none";
};

export type TeamCode = "CMT" | "LT" | "CST" | "AT" | "MT" | "LAT" | "OTHER";

export const TEAM_LABELS: Record<TeamCode, string> = {
  CMT: "クライアントマネジメント",
  LT: "リーシング",
  CST: "カスタマーサポート",
  AT: "アカウント",
  MT: "マーケティング",
  LAT: "リーシングアシスタント",
  OTHER: "その他",
};

/** 部署（所属チーム）ラベル → チームコード */
export function teamCodeForDepartment(department: string | undefined | null): TeamCode {
  const d = (department || "").trim();
  if (!d) return "OTHER";
  if (d.includes("クライアントマネジメント")) return "CMT";
  if (d.includes("リーシングアシスタント")) return "LAT";
  if (d.includes("リーシング")) return "LT";
  if (d.includes("カスタマーサポート")) return "CST";
  if (d.includes("アカウント")) return "AT";
  if (d.includes("マーケティング")) return "MT";
  return "OTHER";
}

/** グレードラベル（S1, L2, M1 など） → ステージ */
export function stageForGrade(grade: string | undefined | null): Stage {
  const g = (grade || "").trim().toUpperCase();
  if (g.startsWith("M")) return "manager";
  if (g.startsWith("L")) return "leader";
  return "staff";
}

export const STAGE_LABELS: Record<Stage, string> = {
  staff: "スタッフ",
  leader: "リーダー",
  manager: "マネージャー",
};

/**
 * チーム別 定量ウエイト
 * グレード直接指定（例: "M1"）> ステージ指定 > チームdefault の順で解決する。
 * otherType: CMT は「個人」、LT/CST は「チーム」、AT/MT は個人/チームなし（全社のみ）。
 */
export const TEAM_QUANT_WEIGHTS: Record<
  TeamCode,
  {
    byGrade?: Record<string, QuantWeight>;
    byStage?: Partial<Record<Stage, QuantWeight>>;
    default: QuantWeight;
  }
> = {
  CMT: {
    byGrade: {
      M3: { company: 0.7, other: 0.2, otherType: "personal" },
      M2: { company: 0.7, other: 0.2, otherType: "personal" },
      M1: { company: 0.5, other: 0.3, otherType: "personal" },
    },
    byStage: {
      leader: { company: 0.1, other: 0.2, otherType: "personal" },
      staff: { company: 0.1, other: 0.2, otherType: "personal" },
    },
    default: { company: 0.1, other: 0.2, otherType: "personal" },
  },
  LT: {
    byGrade: {
      L2: { company: 0.3, other: 0.6, otherType: "team" },
      L1: { company: 0.2, other: 0.5, otherType: "team" },
    },
    byStage: {
      manager: { company: 0.3, other: 0.6, otherType: "team" },
      leader: { company: 0.3, other: 0.6, otherType: "team" },
      staff: { company: 0.1, other: 0.2, otherType: "team" },
    },
    default: { company: 0.1, other: 0.2, otherType: "team" },
  },
  LAT: {
    byStage: {
      leader: { company: 0.3, other: 0.6, otherType: "team" },
      staff: { company: 0.1, other: 0.2, otherType: "team" },
    },
    default: { company: 0.1, other: 0.2, otherType: "team" },
  },
  CST: {
    byGrade: {
      L2: { company: 0.4, other: 0.6, otherType: "team" },
      L1: { company: 0.3, other: 0.7, otherType: "team" },
      M1: { company: 0.5, other: 0.3, otherType: "team" },
    },
    byStage: {
      manager: { company: 0.5, other: 0.3, otherType: "team" },
      leader: { company: 0.4, other: 0.6, otherType: "team" },
      staff: { company: 0.3, other: 0.7, otherType: "team" },
    },
    default: { company: 0.3, other: 0.7, otherType: "team" },
  },
  AT: {
    default: { company: 1.0, other: 0, otherType: "none" },
  },
  MT: {
    byStage: {
      manager: { company: 0.2, other: 0, otherType: "none" },
      leader: { company: 0.2, other: 0, otherType: "none" },
      staff: { company: 0.1, other: 0, otherType: "none" },
    },
    default: { company: 0.1, other: 0, otherType: "none" },
  },
  OTHER: {
    default: { company: 0.1, other: 0.2, otherType: "personal" },
  },
};

/** チーム×グレードから定量ウエイトを解決する */
export function quantWeightFor(teamCode: string, grade: string): QuantWeight {
  const config = TEAM_QUANT_WEIGHTS[teamCode as TeamCode] || TEAM_QUANT_WEIGHTS.OTHER;
  const g = (grade || "").trim().toUpperCase();
  if (config.byGrade && config.byGrade[g]) return config.byGrade[g];
  const stage = stageForGrade(g);
  if (config.byStage && config.byStage[stage]) return config.byStage[stage]!;
  return config.default;
}

/** 獲得ランク表（総合点 → 号俸ポイント） */
export type RankEntry = {
  rank: "S" | "A" | "B" | "C" | "D" | "E";
  min: number;
  max: number;
  gokyuPoints: number;
};

export const RANK_TABLE: RankEntry[] = [
  { rank: "S", min: 160, max: 200, gokyuPoints: 3 },
  { rank: "A", min: 140, max: 159, gokyuPoints: 2 },
  { rank: "B", min: 120, max: 139, gokyuPoints: 1 },
  { rank: "C", min: 100, max: 119, gokyuPoints: -1 },
  { rank: "D", min: 80, max: 99, gokyuPoints: -2 },
  { rank: "E", min: 0, max: 79, gokyuPoints: -3 },
];

export function rankForScore(total: number): RankEntry {
  return RANK_TABLE.find((r) => total >= r.min && total <= r.max) || RANK_TABLE[RANK_TABLE.length - 1];
}

/** 定性配点（定性ポイントの満点） */
export const QUALITATIVE_MAX_POINTS = 120;

/** 定性項目の月あたり満点 */
export const QUALITATIVE_MONTHLY_MAX = 10;

/** 定性項目のデフォルトラベル（最大5項目） */
export const QUALITATIVE_ITEM_LABELS = [
  "定性項目①",
  "定性項目②",
  "定性項目③",
  "定性項目④",
  "定性項目⑤",
];

// ---- 給料テーブル ----

export const GOKYU_RANGE: Record<Stage, { min: number; max: number }> = {
  staff: { min: 0, max: 50 },
  leader: { min: 51, max: 70 },
  manager: { min: 71, max: 110 },
};

/** ステージ別の号俸あたり単価（マネージャーは号俸100超で10,000円） */
export function gokyuPitch(stage: Stage, gokyu: number): number {
  if (stage === "staff") return 2000;
  if (stage === "leader") return 2500;
  return gokyu > 100 ? 10000 : 5000;
}

/** 号俸をステージの範囲に収める */
export function clampGokyu(stage: Stage, gokyu: number): number {
  const range = GOKYU_RANGE[stage];
  return Math.min(Math.max(Math.round(gokyu), range.min), range.max);
}

/** ステージ × 号俸 → 基本給（給料テーブル相当） */
export function salaryForGokyu(stage: Stage, gokyu: number): number {
  const g = clampGokyu(stage, gokyu);
  if (stage === "staff") return 200000 + g * 2000;
  if (stage === "leader") return 300000 + (g - 50) * 2500;
  if (g <= 100) return 350000 + (g - 70) * 5000;
  return 500000 + (g - 100) * 10000;
}

/** ステージの中央値相当的な既定号俸（評価レコード生成時の初期値。要手動確認） */
export function defaultGokyuForStage(stage: Stage): number {
  if (stage === "staff") return 25;
  if (stage === "leader") return 60;
  return 90;
}

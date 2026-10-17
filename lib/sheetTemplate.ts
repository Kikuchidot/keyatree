import type { NavigatorKind } from "@/lib/goalNavigatorStore";

/**
 * シートテンプレート設定。
 * 定量・定性シートの全入力フィールドについて
 * 「入力該当者（設定者/承認者）」と「入力タイミング」を管理者が設定でき、
 * シート表示時にフェーズ外の項目はロックされる。
 *
 * - role:  owner = 設定者が入力 / approver = 承認者が入力
 * - timing: owner は submit(提出時入力) / progress(進捗入力) / result(結果入力)
 *           approver は approval(承認時に入力) / result(結果入力)
 */

export type SheetFieldRole = "owner" | "approver";
export type SheetFieldTiming = "submit" | "progress" | "result" | "approval";

export type SheetFieldConfig = {
  role: SheetFieldRole;
  timing: SheetFieldTiming;
};

export type SheetFieldDef = {
  key: string;
  label: string;
  section: string;
  config: SheetFieldConfig;
};

export type SheetTemplate = Record<NavigatorKind, Record<string, SheetFieldConfig>>;

export const ROLE_LABELS: Record<SheetFieldRole, string> = {
  owner: "設定者",
  approver: "承認者",
};

export const TIMING_LABELS: Record<SheetFieldTiming, string> = {
  submit: "提出時入力",
  progress: "進捗入力",
  result: "結果入力",
  approval: "承認時に入力",
};

export function timingsForRole(role: SheetFieldRole): SheetFieldTiming[] {
  return role === "owner" ? ["submit", "progress", "result"] : ["approval", "result"];
}

const CIRCLED = ["①", "②", "③", "④", "⑤"];

const OWNER_SUBMIT: SheetFieldConfig = { role: "owner", timing: "submit" };
const OWNER_PROGRESS: SheetFieldConfig = { role: "owner", timing: "progress" };
const OWNER_RESULT: SheetFieldConfig = { role: "owner", timing: "result" };
const APPROVER_APPROVAL: SheetFieldConfig = { role: "approver", timing: "approval" };

function quantFields(): SheetFieldDef[] {
  const defs: SheetFieldDef[] = [
    { key: "entry_date", label: "記入日", section: "基本情報", config: { ...OWNER_SUBMIT } },
  ];

  const cols = [
    { p: "company", label: "全社", n: "①" },
    { p: "team", label: "チーム", n: "②" },
    { p: "personal", label: "個人", n: "③" },
  ];
  for (const col of cols) {
    const s = `定量目標（${col.label}）`;
    defs.push(
      { key: `${col.p}_deadline`, label: `目標達成期日${col.n}`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `${col.p}_value`, label: `目標数値${col.n}`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `${col.p}_item`, label: `目標項目${col.n}`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `${col.p}_progress`, label: `進捗数値${col.n}`, section: s, config: { ...OWNER_PROGRESS } },
      { key: `${col.p}_result`, label: `結果数値${col.n}`, section: s, config: { ...OWNER_RESULT } },
      { key: `${col.p}_eval1`, label: `月間定量一次評価者メッセージ${col.n}`, section: s, config: { ...APPROVER_APPROVAL } },
      { key: `${col.p}_eval2`, label: `月間定量二次評価者メッセージ${col.n}`, section: s, config: { ...APPROVER_APPROVAL } }
    );
  }

  defs.push(
    { key: "purpose_visible1", label: "目に見えるもの1", section: "目的", config: { ...OWNER_SUBMIT } },
    { key: "purpose_visible2", label: "目に見えるもの2", section: "目的", config: { ...OWNER_SUBMIT } },
    { key: "purpose_mind1", label: "心の変化1", section: "目的", config: { ...OWNER_SUBMIT } },
    { key: "purpose_mind2", label: "心の変化2", section: "目的", config: { ...OWNER_SUBMIT } }
  );

  for (let i = 1; i <= 3; i++) {
    defs.push(
      { key: `kr${i}_item`, label: `主要な結果 項目${i}`, section: `主要な結果${CIRCLED[i - 1]}`, config: { ...OWNER_SUBMIT } },
      { key: `kr${i}_value`, label: `主要な結果 数字${i}`, section: `主要な結果${CIRCLED[i - 1]}`, config: { ...OWNER_SUBMIT } },
      { key: `action${i}`, label: `行動${i}`, section: `行動${CIRCLED[i - 1]}`, config: { ...OWNER_SUBMIT } },
      { key: `supporter${i}_1`, label: `依頼者${CIRCLED[i - 1]}1`, section: `支援者${CIRCLED[i - 1]}`, config: { ...OWNER_SUBMIT } },
      { key: `supporter${i}_1_date`, label: `依頼日${CIRCLED[i - 1]}1`, section: `支援者${CIRCLED[i - 1]}`, config: { ...OWNER_SUBMIT } },
      { key: `supporter${i}_2`, label: `依頼者${CIRCLED[i - 1]}2`, section: `支援者${CIRCLED[i - 1]}`, config: { ...OWNER_SUBMIT } },
      { key: `supporter${i}_2_date`, label: `依頼日${CIRCLED[i - 1]}2`, section: `支援者${CIRCLED[i - 1]}`, config: { ...OWNER_SUBMIT } },
      { key: `support_detail${i}`, label: `支援内容${i}`, section: `支援内容${CIRCLED[i - 1]}`, config: { ...OWNER_SUBMIT } },
      { key: `mid_result${i}`, label: `中間実績${CIRCLED[i - 1]}`, section: `中間実績${CIRCLED[i - 1]}`, config: { ...OWNER_RESULT } },
      { key: `monthly_result${i}`, label: `月間実績${CIRCLED[i - 1]}`, section: `月間実績${CIRCLED[i - 1]}`, config: { ...OWNER_RESULT } }
    );
    for (let r = 1; r <= 5; r++) {
      defs.push({
        key: `cause${i}_${r}`,
        label: `月間原因${CIRCLED[i - 1]}-${r}`,
        section: `原因${CIRCLED[i - 1]}`,
        config: { ...OWNER_RESULT },
      });
    }
    for (let r = 1; r <= 3; r++) {
      defs.push({
        key: `improve${i}_${r}`,
        label: `月間改善策${CIRCLED[i - 1]}-${r}`,
        section: `改善策${CIRCLED[i - 1]}`,
        config: { ...OWNER_RESULT },
      });
    }
  }

  return defs;
}

function qualFields(): SheetFieldDef[] {
  const defs: SheetFieldDef[] = [
    { key: "entry_date", label: "記入日", section: "基本情報", config: { ...OWNER_SUBMIT } },
  ];

  for (let n = 1; n <= 5; n++) {
    defs.push(
      { key: `q_self_${n}`, label: `自己評価${CIRCLED[n - 1]}`, section: "能力項目評価", config: { ...OWNER_SUBMIT } },
      { key: `q_first_${n}`, label: `一次評価${CIRCLED[n - 1]}`, section: "能力項目評価", config: { ...APPROVER_APPROVAL } },
      { key: `q_second_${n}`, label: `二次評価${CIRCLED[n - 1]}`, section: "能力項目評価", config: { ...APPROVER_APPROVAL } },
      { key: `q_msg_self_${n}`, label: `自己評価者メッセージ${CIRCLED[n - 1]}`, section: "評価者メッセージ", config: { ...OWNER_SUBMIT } },
      { key: `q_msg_first_${n}`, label: `一次評価者メッセージ${CIRCLED[n - 1]}`, section: "評価者メッセージ", config: { ...APPROVER_APPROVAL } },
      { key: `q_msg_second_${n}`, label: `二次評価者メッセージ${CIRCLED[n - 1]}`, section: "評価者メッセージ", config: { ...APPROVER_APPROVAL } }
    );
  }

  for (let n = 1; n <= 5; n++) {
    const s = `能力項目${CIRCLED[n - 1]}`;
    defs.push(
      { key: `q_comp_${n}`, label: `能力項目${CIRCLED[n - 1]}`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `q_kr_item_${n}`, label: `主要な結果 項目${n}`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `q_kr_num_${n}`, label: `主要な結果 数字${n}`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `q_kr_action_${n}`, label: `行動${n}`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `q_supporter_${n}_1`, label: `依頼者${CIRCLED[n - 1]}1`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `q_supporter_date_${n}_1`, label: `依頼日${CIRCLED[n - 1]}1`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `q_supporter_${n}_2`, label: `依頼者${CIRCLED[n - 1]}2`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `q_supporter_date_${n}_2`, label: `依頼日${CIRCLED[n - 1]}2`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `q_support_content_${n}`, label: `支援内容${n}`, section: s, config: { ...OWNER_SUBMIT } },
      { key: `q_mid_result_${n}`, label: `中間実績(${n})`, section: s, config: { ...OWNER_RESULT } },
      { key: `q_month_result_${n}`, label: `月間実績(${n})`, section: s, config: { ...OWNER_RESULT } }
    );
    for (let c = 1; c <= 5; c++) {
      defs.push({ key: `q_month_cause_${n}_${c}`, label: `月間原因(${n})-${c}`, section: s, config: { ...OWNER_RESULT } });
    }
    for (let c = 1; c <= 3; c++) {
      defs.push({ key: `q_month_action_${n}_${c}`, label: `月間改善策(${n})-${c}`, section: s, config: { ...OWNER_RESULT } });
    }
  }

  return defs;
}

export const SHEET_FIELD_DEFS: Record<NavigatorKind, SheetFieldDef[]> = {
  quantitative: quantFields(),
  qualitative: qualFields(),
};

export function defaultSheetTemplate(): SheetTemplate {
  const build = (defs: SheetFieldDef[]) => {
    const map: Record<string, SheetFieldConfig> = {};
    for (const d of defs) map[d.key] = { ...d.config };
    return map;
  };
  return {
    quantitative: build(SHEET_FIELD_DEFS.quantitative),
    qualitative: build(SHEET_FIELD_DEFS.qualitative),
  };
}

/** 保存済み設定をデフォルトにマージ（未設定フィールドはデフォルト値） */
export function mergeSheetTemplate(saved: Partial<SheetTemplate> | null | undefined): SheetTemplate {
  const base = defaultSheetTemplate();
  if (!saved) return base;
  for (const kind of ["quantitative", "qualitative"] as NavigatorKind[]) {
    const overrides = saved[kind];
    if (!overrides) continue;
    for (const [key, cfg] of Object.entries(overrides)) {
      if (base[kind][key] && cfg && (cfg.role === "owner" || cfg.role === "approver")) {
        base[kind][key] = {
          role: cfg.role,
          timing: cfg.timing as SheetFieldTiming,
        };
      }
    }
  }
  return base;
}

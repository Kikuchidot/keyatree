/**
 * 旧ステップ形式の目標設定レコードを、新しいシート形式で表示・編集できるよう
 * answer キーを正規化する。
 *
 * 正規化は読み出し時にのみ行い、元の answers はストレージに残る。
 * 新しいシートで編集して保存すると新キーが追加されるが、旧キーは失われない。
 */

export type NavigatorKind = "quantitative" | "qualitative";

function isOldQuantitative(answers: Record<string, string>): boolean {
  // 旧形式: goal があり、新形式の company_item がない
  return Boolean(answers.goal?.trim()) && !answers.company_item;
}

function isOldQualitative(answers: Record<string, string>): boolean {
  // 旧形式: category/competency があり、新形式の q_comp_1 がない
  return (
    (Boolean(answers.category?.trim()) || Boolean(answers.competency?.trim())) &&
    !answers.q_comp_1
  );
}

export function normalizeLegacyAnswers(
  answers: Record<string, string>,
  kind: NavigatorKind
): Record<string, string> {
  if (kind === "quantitative" && isOldQuantitative(answers)) {
    return normalizeOldQuantitative(answers);
  }
  if (kind === "qualitative" && isOldQualitative(answers)) {
    return normalizeOldQualitative(answers);
  }
  return answers;
}

function normalizeOldQuantitative(
  answers: Record<string, string>
): Record<string, string> {
  const mapped: Record<string, string> = { ...answers };

  // 基本情報
  if (!mapped.entry_date && answers.deadline) {
    mapped.entry_date = "";
  }

  // 全社定量目標（旧形式には全社／チーム／個人の区別がないため、全社列に集約）
  if (answers.goal) mapped.company_item = answers.goal;
  if (answers.deadline) mapped.company_deadline = answers.deadline;

  // 目的
  if (answers.purpose) mapped.purpose_visible1 = answers.purpose;
  if (answers.why1) mapped.purpose_mind1 = answers.why1;
  if (answers.why2) mapped.purpose_mind2 = answers.why2;

  // 主要な結果
  if (answers.kr1) mapped.kr1_item = answers.kr1;
  if (answers.kr2) mapped.kr2_item = answers.kr2;
  if (answers.kr3) mapped.kr3_item = answers.kr3;

  // 行動（旧: KR1向け3行動 → 新: 主要な結果①向け3行動）
  if (answers.action11) mapped.action1 = answers.action11;
  if (answers.action12) mapped.action2 = answers.action12;
  if (answers.action13) mapped.action3 = answers.action13;

  // 支援内容
  if (answers.support) mapped.support_detail1 = answers.support;

  return mapped;
}

function normalizeOldQualitative(
  answers: Record<string, string>
): Record<string, string> {
  const mapped: Record<string, string> = { ...answers };

  // 基本情報
  if (!mapped.entry_date) mapped.entry_date = "";

  // 会社から求められている能力項目①
  const compParts = [answers.category, answers.competency].filter(Boolean);
  if (compParts.length && !mapped.q_comp_1) {
    mapped.q_comp_1 = compParts.join(" / ");
  }

  // 主要な結果①
  if (answers.goal) mapped.q_kr_item_1 = answers.goal;
  if (answers.deadline) mapped.q_kr_num_1 = answers.deadline;
  if (answers.action1) mapped.q_kr_action_1 = answers.action1;
  if (answers.action2) mapped.q_kr_action_2 = answers.action2;
  if (answers.action3) mapped.q_kr_action_3 = answers.action3;

  // 自己評価メッセージ①
  if (answers.confirm) mapped.q_msg_self_1 = answers.confirm;

  return mapped;
}

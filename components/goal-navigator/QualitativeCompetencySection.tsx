"use client";

import { useState } from "react";
import { competencyItemsForGrade, competencyLabel, bandForGrade } from "@/lib/qualitativeCompetencies";
import ViewableBox from "@/components/goal-navigator/ViewableBox";
import { RedlineNote, redlineCls, type FieldEdits } from "@/components/goal-navigator/redline";

/**
 * 会社から求められている能力項目①〜⑤（ログイン中スタッフのグレードで選択肢を絞り込み）と、
 * 各項目の「主要な結果」（項目＝テキスト／数字＝数値のみ）を入力するセクション。
 * 項目・数字はスペースが狭いため、押すと中央に大きな編集モーダルが開く。
 * 保存キー: q_comp_N / q_kr_item_N / q_kr_num_N（N=1..5）。
 */

const ITEMS = [1, 2, 3, 4, 5];
const CIRCLED: Record<number, string> = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };

export default function QualitativeCompetencySection({
  answers,
  onChange,
  disabled = false,
  grade = "",
  fieldEdits,
  isFieldLocked,
  fieldNote,
}: {
  answers: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  grade?: string;
  fieldEdits?: FieldEdits;
  isFieldLocked?: (key: string) => boolean;
  fieldNote?: (key: string) => string | undefined;
}) {
  const options = competencyItemsForGrade(grade);
  const band = bandForGrade(grade);
  const locked = (k: string) => Boolean(isFieldLocked?.(k));
  const lockNote = (k: string) =>
    locked(k) && fieldNote?.(k) ? (
      <span className="mt-1 inline-block rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-500">
        {fieldNote?.(k)}
      </span>
    ) : null;

  const [editing, setEditing] = useState<{ key: string; label: string; numeric: boolean } | null>(null);
  const [draft, setDraft] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const open = (key: string, label: string, numeric: boolean) => {
    setDraft(answers[key] ?? "");
    setEditing({ key, label, numeric });
    setSavedFlash(false);
  };
  const close = () => {
    setEditing(null);
    setSavedFlash(false);
  };
  const save = () => {
    if (!editing) return;
    onChange(editing.key, draft);
    setSavedFlash(true);
    if (!keepOpen) window.setTimeout(() => close(), 150);
    else window.setTimeout(() => setSavedFlash(false), 1500);
  };

  const onDraftChange = (v: string) => {
    if (editing?.numeric) setDraft(v.replace(/[^0-9.\-]/g, ""));
    else setDraft(v);
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="rounded-t-2xl border-b border-gray-100 bg-gray-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-black text-gray-900">会社から求められている能力項目</p>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            {band ? `グレード ${band} の項目を表示中` : "グレード未設定のため全項目を表示"}
          </span>
        </div>
        <p className="mt-0.5 text-xs font-bold text-gray-500">
          あなたのグレードに応じた能力項目から①〜⑤を選び、各項目の主要な結果（項目・数字）を入力してください。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2 xl:grid-cols-5">
        {ITEMS.map((n) => {
          const compKey = `q_comp_${n}`;
          const itemKey = `q_kr_item_${n}`;
          const numKey = `q_kr_num_${n}`;
          const actionKey = `q_kr_action_${n}`;
          const supporter1Key = `q_supporter_${n}_1`;
          const supporter2Key = `q_supporter_${n}_2`;
          const supportContentKey = `q_support_content_${n}`;
          const supDate1Key = `q_supporter_date_${n}_1`;
          const supDate2Key = `q_supporter_date_${n}_2`;
          const midResultKey = `q_mid_result_${n}`;
          const monthResultKey = `q_month_result_${n}`;
          return (
            <div key={n} className="flex flex-col rounded-2xl border border-gray-200 p-4">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-gray-600">
                  会社から求められている能力項目{CIRCLED[n]}
                </span>
                <select
                  value={answers[compKey] ?? ""}
                  onChange={(e) => onChange(compKey, e.target.value)}
                  disabled={disabled || locked(compKey)}
                  className={redlineCls(
                    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50 disabled:text-gray-400",
                    fieldEdits,
                    compKey
                  )}
                >
                  <option value="">(指定なし)</option>
                  {options.map((item) => {
                    const label = competencyLabel(item);
                    return (
                      <option key={item.no} value={label}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <RedlineNote edits={fieldEdits} fieldKey={compKey} />
                {lockNote(compKey)}
              </label>

              <div className="my-2 text-center text-sm font-bold text-gray-400">↓↓</div>

              <div className="mb-3 border-y border-dashed border-gray-300 py-1 text-center text-xs font-black text-gray-700">
                主要な結果{CIRCLED[n]}
              </div>

              <div className="space-y-3">
                <div>
                  <span className="mb-1 block text-xs font-bold text-gray-600">項目 {n}</span>
                  <ViewableBox
                    value={answers[itemKey] ?? ""}
                    placeholder="クリックして入力"
                    onClick={() => open(itemKey, `項目 ${n}`, false)}
                    disabled={disabled}
                    locked={locked(itemKey)}
                    note={fieldNote?.(itemKey)}
                    height="h-20"
                    clamp="line-clamp-2"
                    fieldEdits={fieldEdits}
                    fieldKey={itemKey}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-xs font-bold text-gray-600">数字 {n}</span>
                  <ViewableBox
                    value={answers[numKey] ?? ""}
                    placeholder="数字のみ入力・クリック"
                    onClick={() => open(numKey, `数字 ${n}`, true)}
                    disabled={disabled}
                    locked={locked(numKey)}
                    note={fieldNote?.(numKey)}
                    height="h-20"
                    clamp="line-clamp-2"
                    fieldEdits={fieldEdits}
                    fieldKey={numKey}
                  />
                </div>
              </div>

              <div className="my-2 text-center text-sm font-bold text-gray-400">↓↓</div>

              <div className="mb-3 border-y border-dashed border-gray-300 py-1 text-center text-xs font-black text-gray-700">
                主要な結果{CIRCLED[n]}を達成するための行動
              </div>
              <div>
                <span className="mb-1 block text-xs font-bold text-gray-600">行動 {n}</span>
                <ViewableBox
                  value={answers[actionKey] ?? ""}
                  placeholder="クリックして入力"
                  onClick={() => open(actionKey, `行動 ${n}`, false)}
                  disabled={disabled}
                  locked={locked(actionKey)}
                  note={fieldNote?.(actionKey)}
                  height="h-24"
                  clamp="line-clamp-3"
                  fieldEdits={fieldEdits}
                  fieldKey={actionKey}
                />
              </div>

              <div className="my-2 text-center text-sm font-bold text-gray-400">↓↓</div>

              <div className="mb-3 border-y border-dashed border-gray-300 py-1 text-center text-xs font-black text-gray-700">
                主要な結果{CIRCLED[n]}を達成するための支援者
              </div>
              <div className="space-y-3">
                {[
                  { sKey: supporter1Key, dKey: supDate1Key, idx: 1 },
                  { sKey: supporter2Key, dKey: supDate2Key, idx: 2 },
                ].map(({ sKey, dKey, idx }) => (
                  <div key={idx} className="space-y-2">
                    <div>
                      <span className="mb-1 block text-xs font-bold text-gray-600">
                        依頼者{CIRCLED[n]} {idx}
                      </span>
                      <ViewableBox
                        value={answers[sKey] ?? ""}
                        placeholder="クリックして入力"
                        onClick={() => open(sKey, `依頼者${CIRCLED[n]} ${idx}`, false)}
                        disabled={disabled}
                        locked={locked(sKey)}
                        note={fieldNote?.(sKey)}
                        height="h-12"
                        clamp="line-clamp-1"
                        fieldEdits={fieldEdits}
                        fieldKey={sKey}
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-bold text-gray-600">
                        依頼日{CIRCLED[n]} {idx}
                      </span>
                      <input
                        type="date"
                        value={answers[dKey] ?? ""}
                        onChange={(e) => onChange(dKey, e.target.value)}
                        disabled={disabled || locked(dKey)}
                        className={redlineCls(
                          "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50",
                          fieldEdits,
                          dKey
                        )}
                      />
                      <RedlineNote edits={fieldEdits} fieldKey={dKey} />
                      {lockNote(dKey)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="my-2 text-center text-sm font-bold text-gray-400">↓↓</div>

              <div className="mb-3 border-y border-dashed border-gray-300 py-1 text-center text-xs font-black text-gray-700">
                支援内容
              </div>
              <div>
                <span className="mb-1 block text-xs font-bold text-gray-600">支援内容 {n}</span>
                <ViewableBox
                  value={answers[supportContentKey] ?? ""}
                  placeholder="クリックして入力"
                  onClick={() => open(supportContentKey, `支援内容 ${n}`, false)}
                  disabled={disabled}
                  locked={locked(supportContentKey)}
                  note={fieldNote?.(supportContentKey)}
                  height="h-24"
                  clamp="line-clamp-3"
                  fieldEdits={fieldEdits}
                  fieldKey={supportContentKey}
                />
              </div>

              <div className="mt-2 text-center text-sm font-bold text-gray-400">↓↓</div>

              <div className="mb-3 border-y border-dashed border-gray-300 py-1 text-center text-xs font-black text-gray-700">
                中間実績【数字】
              </div>
              <div>
                <span className="mb-1 block text-xs font-bold text-gray-600">中間実績({n})</span>
                <ViewableBox
                  value={answers[midResultKey] ?? ""}
                  placeholder="数字のみ入力・単位入力不要"
                  onClick={() => open(midResultKey, `中間実績(${n})`, true)}
                  disabled={disabled}
                  locked={locked(midResultKey)}
                  note={fieldNote?.(midResultKey)}
                  height="h-20"
                  clamp="line-clamp-2"
                  fieldEdits={fieldEdits}
                  fieldKey={midResultKey}
                />
              </div>

              <div className="my-3 border-t-2 border-dashed border-gray-400" />

              <div className="mb-3 border-y border-dashed border-gray-300 py-1 text-center text-xs font-black text-gray-700">
                月間実績【数字】
              </div>
              <div>
                <span className="mb-1 block text-xs font-bold text-gray-600">月間実績({n})</span>
                <ViewableBox
                  value={answers[monthResultKey] ?? ""}
                  placeholder="数字のみ入力・単位入力不要"
                  onClick={() => open(monthResultKey, `月間実績(${n})`, true)}
                  disabled={disabled}
                  locked={locked(monthResultKey)}
                  note={fieldNote?.(monthResultKey)}
                  height="h-20"
                  clamp="line-clamp-2"
                  fieldEdits={fieldEdits}
                  fieldKey={monthResultKey}
                />
              </div>

              <div className="mt-3 mb-3 border-y border-dashed border-gray-300 py-1 text-center text-xs font-black text-gray-700">
                原因
              </div>
              <p className="mb-2 text-center text-[10px] font-bold leading-4 text-gray-500">
                「なぜ？」を繰り返し、実績の原因を明確にしましょう！
              </p>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((c) => {
                  const causeKey = `q_month_cause_${n}_${c}`;
                  return (
                    <div key={c}>
                      <span className="mb-1 block text-xs font-bold text-gray-600">月間原因({n})-{c}</span>
                      <ViewableBox
                        value={answers[causeKey] ?? ""}
                        placeholder="なぜ→"
                        onClick={() => open(causeKey, `月間原因(${n})-${c}`, false)}
                        disabled={disabled}
                        locked={locked(causeKey)}
                        note={fieldNote?.(causeKey)}
                        height="h-12"
                        clamp="line-clamp-1"
                        fieldEdits={fieldEdits}
                        fieldKey={causeKey}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 mb-1 border-y border-dashed border-gray-300 py-1 text-center text-xs font-black text-gray-700">
                改善策
              </div>
              <p className="mb-2 text-center text-[10px] font-bold leading-4 text-gray-500">
                原因から学習しより良くなるための行動を設定しましょう！
              </p>
              <div className="space-y-2">
                {[1, 2, 3].map((c) => {
                  const actKey = `q_month_action_${n}_${c}`;
                  return (
                    <div key={c}>
                      <span className="mb-1 block text-xs font-bold text-gray-600">月間改善策({n})-{c}</span>
                      <ViewableBox
                        value={answers[actKey] ?? ""}
                        placeholder={`${c})`}
                        onClick={() => open(actKey, `月間改善策(${n})-${c}`, false)}
                        disabled={disabled}
                        locked={locked(actKey)}
                        note={fieldNote?.(actKey)}
                        height="h-12"
                        clamp="line-clamp-1"
                        fieldEdits={fieldEdits}
                        fieldKey={actKey}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <p className="text-base font-black text-gray-900">{editing.label}</p>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                aria-label="閉じる"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                disabled={disabled}
                inputMode={editing.numeric ? "decimal" : "text"}
                placeholder={editing.numeric ? "数字のみ入力してください。" : "ここに入力してください。"}
                className="h-[45vh] w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <input
                  type="checkbox"
                  checked={keepOpen}
                  onChange={(e) => setKeepOpen(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                開いたままにする
              </label>
              <div className="flex items-center gap-3">
                {savedFlash && <span className="text-xs font-bold text-emerald-600">保存しました</span>}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
                >
                  閉じる
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={disabled}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

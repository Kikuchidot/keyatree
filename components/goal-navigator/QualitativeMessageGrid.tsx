"use client";

import { useState } from "react";
import ViewableBox from "@/components/goal-navigator/ViewableBox";
import type { FieldEdits } from "@/components/goal-navigator/redline";

/**
 * 評価者メッセージ欄。
 * 能力項目①〜⑤について、自己評価者／一次評価者／二次評価者のメッセージを記入する。
 * 入力ボックスは省スペースの小枠。クリックすると中央に大きな編集モーダルが開き、
 * 保存ボタンで確定する。「開いたままにする」で連続編集も可能。
 * 値は answers に保存する（キー: q_msg_self_N / q_msg_first_N / q_msg_second_N, N=1..5）。
 */

const ITEMS = [1, 2, 3, 4, 5];
const CIRCLED: Record<number, string> = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };

const COLUMNS: { prefix: string; label: string }[] = [
  { prefix: "q_msg_self", label: "自己評価者メッセージ" },
  { prefix: "q_msg_first", label: "一次評価者メッセージ" },
  { prefix: "q_msg_second", label: "二次評価者メッセージ" },
];

export default function QualitativeMessageGrid({
  answers,
  onChange,
  disabled = false,
  fieldEdits,
  isFieldLocked,
  fieldNote,
}: {
  answers: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  fieldEdits?: FieldEdits;
  isFieldLocked?: (key: string) => boolean;
  fieldNote?: (key: string) => string | undefined;
}) {
  const [editing, setEditing] = useState<{ key: string; label: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const open = (key: string, label: string) => {
    setDraft(answers[key] ?? "");
    setEditing({ key, label });
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
    if (!keepOpen) {
      window.setTimeout(() => close(), 150);
    } else {
      window.setTimeout(() => setSavedFlash(false), 1500);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="rounded-t-2xl border-b border-gray-100 bg-gray-50 px-5 py-4">
        <p className="text-base font-black text-gray-900">評価者メッセージ</p>
        <p className="mt-0.5 text-xs font-bold text-gray-500">
          各能力項目について、自己評価者・一次評価者・二次評価者がメッセージを記入できます。入力欄を押すと大きく表示されます。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2 xl:grid-cols-5">
        {ITEMS.map((n) => (
          <div key={n} className="rounded-2xl border border-gray-200 p-4">
            <p className="mb-3 text-sm font-black text-gray-900">能力項目{CIRCLED[n]}</p>
            <div className="space-y-3">
              {COLUMNS.map((col) => {
                const key = `${col.prefix}_${n}`;
                const value = answers[key] ?? "";
                const label = `${col.label}${CIRCLED[n]}`;
                return (
                  <div key={key}>
                    <span className="mb-1 block truncate text-xs font-bold text-gray-600" title={label}>
                      {label}
                    </span>
                    <ViewableBox
                      value={value}
                      placeholder="クリックして入力"
                      onClick={() => open(key, label)}
                      disabled={disabled}
                      locked={Boolean(isFieldLocked?.(key))}
                      note={fieldNote?.(key)}
                      height="h-20"
                      clamp="line-clamp-2"
                      fieldEdits={fieldEdits}
                      fieldKey={key}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
                onChange={(e) => setDraft(e.target.value)}
                disabled={disabled}
                placeholder="ここにメッセージを入力してください。"
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

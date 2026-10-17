"use client";

import { RedlineNote, redlineCls, type FieldEdits } from "@/components/goal-navigator/redline";

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 3H3v6M15 21h6v-6M3 3l7 7M21 21l-7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * シート用テキストボックス。
 * - 編集可: クリックで中央に大きな編集モーダルが開くボタン（省スペース、line-clampで省略表示）。
 * - 閲覧モード(disabled): 高さ自動・全文表示の読み取り専用ボックス（whitespace-pre-wrap）。
 *   承認後・提出後でも記入内容が全て読めるようにするため、line-clampもクリック制限もかけない。
 * - locked（テンプレートロック）: 編集モードでも入力不可。全文を読み取り表示する。
 */
export default function ViewableBox({
  value,
  placeholder,
  onClick,
  disabled = false,
  locked = false,
  note,
  height = "h-20",
  clamp = "line-clamp-2",
  fieldEdits,
  fieldKey,
}: {
  value: string;
  placeholder: string;
  onClick: () => void;
  disabled?: boolean;
  locked?: boolean;
  note?: string;
  height?: string;
  clamp?: string;
  fieldEdits?: FieldEdits;
  fieldKey: string;
}) {
  const noteEl = locked && note ? (
    <span className="mt-1 inline-block rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-500">
      {note}
    </span>
  ) : null;

  if (disabled || locked) {
    return (
      <div>
        <div
          className={redlineCls(
            "w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-left text-xs leading-5 text-gray-800",
            fieldEdits,
            fieldKey
          )}
        >
          {value || <span className="text-gray-400">（未入力）</span>}
        </div>
        <RedlineNote edits={fieldEdits} fieldKey={fieldKey} />
        {noteEl}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className={redlineCls(
          `relative flex ${height} w-full items-start rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-left text-xs leading-5 text-gray-800 transition hover:border-indigo-300 hover:bg-white`,
          fieldEdits,
          fieldKey
        )}
      >
        <span className={`${clamp} whitespace-pre-wrap pr-6`}>
          {value || <span className="text-gray-400">{placeholder}</span>}
        </span>
        <span className="absolute bottom-2 right-2 text-gray-400">
          <ExpandIcon />
        </span>
      </button>
      <RedlineNote edits={fieldEdits} fieldKey={fieldKey} />
    </div>
  );
}

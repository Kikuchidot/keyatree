"use client";

import { RedlineNote, redlineCls, type FieldEdits } from "@/components/goal-navigator/redline";

/**
 * 定量目標設定シート（入力フォームと同一レイアウト）。
 * 提出フォーム・承認画面の両方で再利用する共有コンポーネント。
 * disabled=true で読み取り専用表示になる。
 * fieldEdits を渡すと一時差戻中に編集された項目を赤枠・赤字で表示する。
 * isFieldLocked を渡すとシートテンプレート設定に基づき項目単位でロックする。
 */
export default function QuantitativeSheet({
  answers,
  onChange,
  disabled = false,
  profile,
  fieldEdits,
  isFieldLocked,
  fieldNote,
}: {
  answers: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  profile: { name?: string; stage?: string; grade?: string };
  fieldEdits?: FieldEdits;
  isFieldLocked?: (key: string) => boolean;
  fieldNote?: (key: string) => string | undefined;
}) {
  const locked = (k: string) => Boolean(isFieldLocked?.(k));
  const note = (k: string) => (locked(k) ? fieldNote?.(k) : undefined);
  const noteEl = (k: string) => {
    const text = note(k);
    if (!text) return null;
    return (
      <span className="mt-1 inline-block rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-500">
        {text}
      </span>
    );
  };
  const areaCls =
    "mt-1 w-full text-sm text-gray-900 border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50 disabled:text-gray-500";
  const inputCls =
    "mt-1 w-full text-sm text-gray-900 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50 disabled:text-gray-500";

  const fArea = (k: string, label: string, placeholder?: string, rows = 4) => (
    <label className="block">
      <span className="text-xs font-bold text-gray-600">{label}</span>
      <textarea
        rows={rows}
        value={answers[k] ?? ""}
        onChange={(e) => onChange(k, e.target.value)}
        placeholder={placeholder}
        disabled={disabled || locked(k)}
        className={redlineCls(areaCls, fieldEdits, k)}
      />
      <RedlineNote edits={fieldEdits} fieldKey={k} />
      {noteEl(k)}
    </label>
  );
  const fText = (k: string, label: string, placeholder?: string) => (
    <label className="block">
      <span className="text-xs font-bold text-gray-600">{label}</span>
      <input
        type="text"
        value={answers[k] ?? ""}
        onChange={(e) => onChange(k, e.target.value)}
        placeholder={placeholder}
        disabled={disabled || locked(k)}
        className={redlineCls(inputCls, fieldEdits, k)}
      />
      <RedlineNote edits={fieldEdits} fieldKey={k} />
      {noteEl(k)}
    </label>
  );
  const fDate = (k: string, label: string) => (
    <label className="block">
      <span className="text-xs font-bold text-gray-600">{label}</span>
      <input
        type="date"
        value={answers[k] ?? ""}
        onChange={(e) => onChange(k, e.target.value)}
        disabled={disabled || locked(k)}
        className={redlineCls(inputCls, fieldEdits, k)}
      />
      <RedlineNote edits={fieldEdits} fieldKey={k} />
      {noteEl(k)}
    </label>
  );
  const fNum = (k: string, label: string, placeholder = "数字のみ入力・単位入力不要") => (
    <label className="block">
      <span className="text-xs font-bold text-gray-600">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={answers[k] ?? ""}
        onChange={(e) => onChange(k, e.target.value)}
        placeholder={placeholder}
        disabled={disabled || locked(k)}
        className={redlineCls(inputCls, fieldEdits, k)}
      />
      <RedlineNote edits={fieldEdits} fieldKey={k} />
      {noteEl(k)}
    </label>
  );
  const sectionTitle = (label: string, hint?: string) => (
    <div className="text-center">
      <div className="border-t border-dashed border-gray-300" />
      <p className="py-2 text-sm font-bold text-gray-700">{label}</p>
      {hint ? <p className="-mt-1 pb-1 text-[11px] text-gray-400">{hint}</p> : null}
      <div className="border-t border-dashed border-gray-300" />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* ヘッダー：名前・ステージ・グレードはログイン情報から自動取得。記入日のみ入力 */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <p className="text-sm font-bold text-gray-800">誰でも簡単にできる目標設定＆振り返り</p>
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-gray-400">名前</p>
            <p className="mt-1 text-sm font-bold text-gray-800">{profile.name || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">ステージ</p>
            <p className="mt-1 text-sm font-bold text-gray-800">{profile.stage || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">グレード</p>
            <p className="mt-1 text-sm font-bold text-gray-800">{profile.grade || "-"}</p>
          </div>
          {fDate("entry_date", "記入日")}
        </div>
      </div>

      {/* 定量目標（全社／チーム／個人） */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            { p: "company", label: "全社定量目標", n: "①" },
            { p: "team", label: "チーム定量目標", n: "②" },
            { p: "personal", label: "個人定量目標", n: "③" },
          ].map((col) => (
            <div key={col.p} className="space-y-3">
              {sectionTitle(col.label)}
              {fDate(`${col.p}_deadline`, `目標達成期日${col.n}`)}
              {fNum(`${col.p}_value`, `目標数値${col.n}`)}
              {fNum(`${col.p}_progress`, `進捗数値${col.n}`)}
              {fNum(`${col.p}_result`, `結果数値${col.n}`)}
              {fArea(`${col.p}_item`, `目標項目${col.n}`, "この目標数値が示す内容・目標設定の経緯・達成することの意義", 5)}
              {fArea(`${col.p}_eval1`, `月間定量一次評価者メッセージ${col.n}`, undefined, 3)}
              {fArea(`${col.p}_eval2`, `月間定量二次評価者メッセージ${col.n}`, undefined, 3)}
            </div>
          ))}
        </div>
      </div>

      {/* 目的 */}
      <div className="space-y-4">
        {sectionTitle("目的")}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {fArea("purpose_visible1", "目に見えるもの1", "あなたが目標を達成して周りに与えたい、目に見えるものは何ですか？")}
          {fArea("purpose_visible2", "目に見えるもの2", "あなたが目標を達成して得たい、目に見えるものは何ですか？")}
          {fArea("purpose_mind1", "心の変化1", "あなたが目標を達成して周りに与えたい、心の変化はなんですか？")}
          {fArea("purpose_mind2", "心の変化2", "あなたが目標を達成して得たい、心の変化はなんですか？")}
        </div>
      </div>

      {/* 主要な結果 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {["①", "②", "③"].map((n, i) => (
          <div key={`kr${i}`} className="space-y-3">
            {sectionTitle(`主要な結果${n}`)}
            {fArea(`kr${i + 1}_item`, `項目${i + 1}`, undefined, 4)}
            {fNum(`kr${i + 1}_value`, `数字${i + 1}`)}
          </div>
        ))}
      </div>

      {/* 行動 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {["①", "②", "③"].map((n, i) => (
          <div key={`act${i}`} className="space-y-3">
            {sectionTitle(`主要な結果${n}を達成するための行動`)}
            {fArea(`action${i + 1}`, `行動${i + 1}`, undefined, 5)}
          </div>
        ))}
      </div>

      {/* 支援者・依頼日 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {["①", "②", "③"].map((n, i) => (
          <div key={`sup${i}`} className="space-y-3">
            {sectionTitle(`主要な結果${n}を達成するための支援者`)}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              {fText(`supporter${i + 1}_1`, `依頼者${n}1`)}
              {fDate(`supporter${i + 1}_1_date`, `依頼日${n}1`)}
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              {fText(`supporter${i + 1}_2`, `依頼者${n}2`)}
              {fDate(`supporter${i + 1}_2_date`, `依頼日${n}2`)}
            </div>
          </div>
        ))}
      </div>

      {/* 支援内容 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {["①", "②", "③"].map((n, i) => (
          <div key={`supd${i}`} className="space-y-3">
            {sectionTitle("支援内容")}
            {fArea(`support_detail${i + 1}`, `支援内容${i + 1}`, undefined, 4)}
          </div>
        ))}
      </div>

      {/* 中間実績【数字】 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {["①", "②", "③"].map((n, i) => (
          <div key={`mid${i}`} className="space-y-3">
            {sectionTitle("中間実績【数字】")}
            {fNum(`mid_result${i + 1}`, `中間実績${n}`, "数字のみ入力・単位入力不要")}
          </div>
        ))}
      </div>

      {/* 月間実績【数字】 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {["①", "②", "③"].map((n, i) => (
          <div key={`mon${i}`} className="space-y-3">
            {sectionTitle("月間実績【数字】")}
            {fNum(`monthly_result${i + 1}`, `月間実績${n}`, "数字のみ入力・単位入力不要")}
          </div>
        ))}
      </div>

      {/* 原因（なぜ？を繰り返す：各列5件） */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {["①", "②", "③"].map((n, i) => (
          <div key={`cause${i}`} className="space-y-3">
            {sectionTitle("原因", "「なぜ？」を繰り返し、実績の原因を明確にしましょう！")}
            {[1, 2, 3, 4, 5].map((r) => (
              <div key={`c${i}-${r}`}>{fText(`cause${i + 1}_${r}`, `月間原因${n}-${r}`, "なぜ→")}</div>
            ))}
          </div>
        ))}
      </div>

      {/* 改善策（各列3件） */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {["①", "②", "③"].map((n, i) => (
          <div key={`imp${i}`} className="space-y-3">
            {sectionTitle("改善策", "原因から学習しより良くなるための行動を設定しましょう！")}
            {[1, 2, 3].map((r) => (
              <div key={`i${i}-${r}`}>{fText(`improve${i + 1}_${r}`, `月間改善策${n}-${r}`, `${r})`)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

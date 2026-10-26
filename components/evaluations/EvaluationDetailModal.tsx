"use client";

import { useEffect, useState } from "react";
import type { EvaluationRecord } from "@/lib/evaluationStore";
import { computeEvaluation } from "@/lib/evaluationEngine";
import { saveEvaluationRecordAction } from "@/lib/evaluationActions";
import { QUALITATIVE_ITEM_LABELS } from "@/lib/evaluationConfig";

export default function EvaluationDetailModal({
  record,
  months,
  rankOptions,
  onClose,
  onSaved,
  onFinalize,
  onReopen,
  pending,
}: {
  record: EvaluationRecord;
  months: string[];
  rankOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: (record: EvaluationRecord) => void;
  onFinalize: (record: EvaluationRecord) => void;
  onReopen: (record: EvaluationRecord) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState<EvaluationRecord>(record);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmed = draft.status === "confirmed";

  useEffect(() => {
    setDraft(record);
  }, [record]);

  const computed = computeEvaluation(draft, months);
  const readOnly = confirmed;

  function updateMonthly(
    kind: "companyMonthly" | "otherMonthly",
    month: string,
    field: "target" | "result",
    value: string
  ) {
    const num = Number(value) || 0;
    setDraft((d) => {
      const entries = { ...(d.quantitative[kind] || {}) };
      const prev = entries[month] || { target: 0, result: 0 };
      entries[month] = { ...prev, [field]: num };
      return {
        ...d,
        quantitative: { ...d.quantitative, [kind]: entries },
      };
    });
  }

  function updateScore(itemIndex: number, month: string, value: string) {
    const num = value === "" ? 0 : Math.max(0, Math.min(10, Number(value) || 0));
    setDraft((d) => {
      const qualitative = d.qualitative.map((item, i) =>
        i === itemIndex ? { ...item, monthlyScores: { ...item.monthlyScores, [month]: num } } : item
      );
      return { ...d, qualitative };
    });
  }

  function addItem() {
    if (readOnly || draft.qualitative.length >= 5) return;
    setDraft((d) => ({
      ...d,
      qualitative: [
        ...d.qualitative,
        {
          label: QUALITATIVE_ITEM_LABELS[d.qualitative.length] || `定性項目${d.qualitative.length + 1}`,
          monthlyScores: {},
        },
      ],
    }));
  }

  function removeItem(index: number) {
    if (readOnly || draft.qualitative.length <= 1) return;
    setDraft((d) => ({
      ...d,
      qualitative: d.qualitative.filter((_, i) => i !== index),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await saveEvaluationRecordAction(draft);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      onSaved(res.record);
      setMessage("保存しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-black text-gray-800">
              {draft.employeeName} <span className="text-sm font-bold text-gray-400">さんの評価</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {draft.teamLabel} / グレード {draft.stageGrade} / 現ランク{" "}
              <span className="font-black text-slate-700">{draft.currentRank || "B"}</span> → 算出後{" "}
              <span className={`font-black text-violet-700`}>{computed.rank.rank}</span> / 号俸{" "}
              {draft.currentGokyu} → <span className="font-bold text-slate-700">{computed.newGokyu}</span>
              {readOnly ? (
                <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                  確定済み
                </span>
              ) : null}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {message ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3">
              {message}
            </div>
          ) : null}

          {/* 現状（ランク・号俸・基本給） */}
          <section className="space-y-3">
            <h3 className="text-sm font-black text-gray-800 border-l-4 border-slate-400 pl-2">
              現状のランク・号俸・基本給（スタッフごとに修正可）
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="text-xs text-gray-500">
                現状ランク（マスター管理で編集可）
                <select
                  disabled={readOnly}
                  value={draft.currentRank || rankOptions[0]?.value || "B"}
                  onChange={(e) => setDraft((d) => ({ ...d, currentRank: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50"
                >
                  {rankOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {rankOptions.every((o) => o.value !== (draft.currentRank || "")) &&
                  draft.currentRank ? (
                    <option value={draft.currentRank}>{draft.currentRank}（現在値）</option>
                  ) : null}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                現状号俸
                <input
                  type="number"
                  disabled={readOnly}
                  value={draft.currentGokyu || ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, currentGokyu: Number(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                />
              </label>
              <label className="text-xs text-gray-500">
                ①現状基本給
                <input
                  type="number"
                  disabled={readOnly}
                  value={draft.currentSalary || ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, currentSalary: Number(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                />
              </label>
              <div className="text-xs text-gray-500">
                ステージ
                <p className="mt-2 text-sm font-bold text-gray-800">
                  {computed.stage === "staff"
                    ? "スタッフ"
                    : computed.stage === "leader"
                      ? "リーダー"
                      : "マネージャー"}
                </p>
              </div>
            </div>
          </section>

          {/* 定量（月別） */}
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-black text-gray-800 border-l-4 border-sky-500 pl-2">
                定量評価（月別入力・達成率は各月100%で頭打ち）
              </h3>
              {draft.quantitative.sourceRecordIds.length > 0 ? (
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-sky-100 text-sky-700 border border-sky-200">
                  定量目標シートから月別自動取込済み（{draft.quantitative.sourceRecordIds.length}件）
                </span>
              ) : null}
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sky-50 text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-bold" rowSpan={2}>月</th>
                    <th className="px-3 py-1.5 font-bold border-l border-gray-200" colSpan={3}>
                      全社目標（ウエイト {Math.round(computed.weight.company * 100)}%）
                    </th>
                    <th className="px-3 py-1.5 font-bold border-l border-gray-200" colSpan={3}>
                      {computed.weight.otherType === "team"
                        ? "チーム目標"
                        : computed.weight.otherType === "personal"
                          ? "個人目標"
                          : "個人・チーム目標（対象なし）"}
                      （ウエイト {Math.round(computed.weight.other * 100)}%）
                    </th>
                  </tr>
                  <tr className="bg-sky-50 text-[10px] text-gray-400 border-b border-gray-200">
                    <th className="px-2 py-1.5 font-bold border-l border-gray-200">目標値</th>
                    <th className="px-2 py-1.5 font-bold">結果値</th>
                    <th className="px-2 py-1.5 font-bold">達成率</th>
                    <th className="px-2 py-1.5 font-bold border-l border-gray-200">目標値</th>
                    <th className="px-2 py-1.5 font-bold">結果値</th>
                    <th className="px-2 py-1.5 font-bold">達成率</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, i) => {
                    const company = draft.quantitative.companyMonthly?.[m];
                    const other = draft.quantitative.otherMonthly?.[m];
                    const cRate = computed.monthlyCompanyRates[i];
                    const oRate = computed.monthlyOtherRates[i];
                    return (
                      <tr key={m} className="border-b border-gray-100">
                        <td className="px-3 py-2 font-bold text-gray-700">
                          {m.slice(0, 4)}年{m.slice(5)}月
                        </td>
                        <td className="px-2 py-1.5 border-l border-gray-200">
                          <input
                            type="number"
                            disabled={readOnly}
                            value={company?.target || ""}
                            onChange={(e) => updateMonthly("companyMonthly", m, "target", e.target.value)}
                            className="w-20 border border-gray-300 rounded-md px-2 py-1 text-right text-sm disabled:bg-gray-50"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            disabled={readOnly}
                            value={company?.result || ""}
                            onChange={(e) => updateMonthly("companyMonthly", m, "result", e.target.value)}
                            className="w-20 border border-gray-300 rounded-md px-2 py-1 text-right text-sm disabled:bg-gray-50"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono font-bold text-gray-800">
                          {cRate !== null ? `${cRate}%` : "—"}
                        </td>
                        <td className="px-2 py-1.5 border-l border-gray-200">
                          <input
                            type="number"
                            disabled={readOnly || computed.weight.otherType === "none"}
                            value={other?.target || ""}
                            onChange={(e) => updateMonthly("otherMonthly", m, "target", e.target.value)}
                            className="w-20 border border-gray-300 rounded-md px-2 py-1 text-right text-sm disabled:bg-gray-50"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            disabled={readOnly || computed.weight.otherType === "none"}
                            value={other?.result || ""}
                            onChange={(e) => updateMonthly("otherMonthly", m, "result", e.target.value)}
                            className="w-20 border border-gray-300 rounded-md px-2 py-1 text-right text-sm disabled:bg-gray-50"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono font-bold text-gray-800">
                          {oRate !== null ? `${oRate}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-bold border-t-2 border-gray-200">
                    <td className="px-3 py-2 text-gray-800">四半期合計</td>
                    <td className="px-2 py-2 text-right font-mono border-l border-gray-200">
                      {computed.companySum.target.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {computed.companySum.result.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-center font-mono">
                      {computed.companyRate !== null ? `${computed.companyRate}%` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono border-l border-gray-200">
                      {computed.otherSum.target.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {computed.otherSum.result.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-center font-mono">
                      {computed.otherRate !== null ? `${computed.otherRate}%` : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-600">
              全社 {computed.companyPoints}pt + {computed.weight.otherType === "team" ? "チーム" : "個人"}{" "}
              {computed.otherPoints}pt = 定量ポイント <span className="font-bold">{computed.quantPoints}</span>
            </p>
          </section>

          {/* 定性 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-800 border-l-4 border-violet-500 pl-2">
                定性評価（月別 0〜10点 / 項目あたり満点 {months.length * 10}）
              </h3>
              {!readOnly ? (
                <div className="flex gap-2">
                  <button
                    onClick={addItem}
                    disabled={draft.qualitative.length >= 5}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-40"
                  >
                    項目を追加
                  </button>
                </div>
              ) : null}
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-violet-50 text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-bold">項目</th>
                    {months.map((m) => (
                      <th key={m} className="px-3 py-2 font-bold">
                        {m.slice(5)}月
                      </th>
                    ))}
                    <th className="px-3 py-2 font-bold">合計</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draft.qualitative.map((item, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-700 font-medium">{item.label}</td>
                      {months.map((m) => (
                        <td key={m} className="px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            max={10}
                            disabled={readOnly}
                            value={item.monthlyScores[m] ?? ""}
                            onChange={(e) => updateScore(i, m, e.target.value)}
                            className="w-14 border border-gray-300 rounded-md px-2 py-1 text-center text-sm disabled:bg-gray-50"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-mono font-bold text-gray-800">
                        {computed.qualItemScores[i] ?? 0} / {computed.qualItemMax}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!readOnly && draft.qualitative.length > 1 ? (
                          <button
                            onClick={() => removeItem(i)}
                            className="text-xs text-rose-500 hover:text-rose-700 font-bold"
                          >
                            削除
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-600">
              定性達成率 <span className="font-bold">{computed.qualRate ?? "-"}</span>%（
              {computed.qualScore} / {computed.qualMax} 点）→ 定性ポイント{" "}
              <span className="font-bold">{computed.qualPoints}</span> / 120
            </p>
          </section>

          {/* 算出結果 */}
          <section className="space-y-3">
            <h3 className="text-sm font-black text-gray-800 border-l-4 border-amber-500 pl-2">
              算出結果と基本給
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border border-gray-200 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold text-gray-400">総合点</p>
                <p className="text-xl font-black text-gray-800">{computed.totalScore}</p>
              </div>
              <div className="border border-gray-200 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold text-gray-400">獲得ランク</p>
                <p className="text-xl font-black text-violet-700">{computed.rank.rank}</p>
                <p className="text-[10px] text-gray-400">
                  号俸 {computed.rank.gokyuPoints > 0 ? "+" : ""}
                  {computed.rank.gokyuPoints}
                </p>
              </div>
              <div className="border border-gray-200 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold text-gray-400">②評価結果基本給</p>
                <p className="text-lg font-black text-gray-800">
                  {computed.resultSalary.toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-400">
                  号俸 {draft.currentGokyu} → {computed.newGokyu}
                </p>
              </div>
              <div className="border border-amber-300 bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold text-amber-600">③確定基本給</p>
                <p className="text-lg font-black text-amber-700">
                  {computed.finalSalary.toLocaleString()}
                </p>
                <p className="text-[10px] text-amber-600">
                  ③−① {computed.diffFromCurrent > 0 ? "+" : ""}
                  {computed.diffFromCurrent.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex items-end gap-3 flex-wrap">
              <label className="text-xs text-gray-500">
                手動調整額（③ − ②）
                <input
                  type="number"
                  disabled={readOnly}
                  value={draft.adjustment || ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, adjustment: Number(e.target.value) || 0 }))
                  }
                  className="mt-1 block w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                />
              </label>
              <p className="text-xs text-gray-400 flex-1">
                ①現状基本給 {draft.currentSalary.toLocaleString()} → ②{" "}
                {computed.resultSalary.toLocaleString()} → ③ {computed.finalSalary.toLocaleString()}
              </p>
            </div>
          </section>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="text-sm font-bold px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
          >
            閉じる
          </button>
          {confirmed ? (
            <button
              onClick={() => onReopen(draft)}
              disabled={pending}
              className="text-sm font-bold px-4 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
            >
              再編集（確定取消）
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving || pending}
                className="text-sm font-bold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
              <button
                onClick={() => onFinalize(draft)}
                disabled={saving || pending}
                className="text-sm font-bold px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                確定する
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

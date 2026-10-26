"use client";

import { useMemo, useState, useTransition } from "react";
import type { EvaluationPeriod, EvaluationRecord } from "@/lib/evaluationStore";
import { computeEvaluation } from "@/lib/evaluationEngine";
import {
  createEvaluationPeriodAction,
  finalizeEvaluationRecordAction,
  generateEvaluationRecordsAction,
  getEvaluationRecordsAction,
  reopenEvaluationRecordAction,
  saveEvaluationRecordAction,
} from "@/lib/evaluationActions";
import EvaluationDetailModal from "./EvaluationDetailModal";

const RANK_STYLES: Record<string, string> = {
  S: "bg-violet-100 text-violet-700 border-violet-200",
  A: "bg-emerald-100 text-emerald-700 border-emerald-200",
  B: "bg-sky-100 text-sky-700 border-sky-200",
  C: "bg-amber-100 text-amber-700 border-amber-200",
  D: "bg-orange-100 text-orange-700 border-orange-200",
  E: "bg-rose-100 text-rose-700 border-rose-200",
};

export default function EvaluationManager({
  initialPeriods,
  initialRecords,
  initialPeriodId,
  userName,
}: {
  initialPeriods: EvaluationPeriod[];
  initialRecords: EvaluationRecord[];
  initialPeriodId: string | null;
  userName: string;
}) {
  const [periods, setPeriods] = useState(initialPeriods);
  const [records, setRecords] = useState(initialRecords);
  const [currentPeriodId, setCurrentPeriodId] = useState(initialPeriodId);
  const [selected, setSelected] = useState<EvaluationRecord | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [newYear, setNewYear] = useState<string>(String(new Date().getFullYear()));
  const [newQuarter, setNewQuarter] = useState<string>("1");
  const [pending, startTransition] = useTransition();

  const currentPeriod = periods.find((p) => p.id === currentPeriodId) ?? null;
  const months = currentPeriod?.months ?? [];

  const rows = useMemo(() => {
    return records
      .filter((r) =>
        search
          ? r.employeeName.includes(search) || r.teamLabel.includes(search)
          : true
      )
      .map((r) => ({ record: r, computed: computeEvaluation(r, months) }));
  }, [records, months, search]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, { record, computed }) => {
        acc.current += record.currentSalary;
        acc.result += computed.resultSalary;
        acc.final += computed.finalSalary;
        return acc;
      },
      { current: 0, result: 0, final: 0 }
    );
  }, [rows]);

  function refreshRecords(periodId: string) {
    startTransition(async () => {
      const next = await getEvaluationRecordsAction(periodId);
      setRecords(next);
    });
  }

  function switchPeriod(periodId: string) {
    setCurrentPeriodId(periodId);
    refreshRecords(periodId);
  }

  function handleCreatePeriod() {
    const year = Number(newYear);
    const quarter = Number(newQuarter) as 1 | 2 | 3 | 4;
    if (!year || year < 2020 || year > 2100) {
      setMessage("年を正しく入力してください");
      return;
    }
    startTransition(async () => {
      const res = await createEvaluationPeriodAction(year, quarter);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      const exists = periods.some((p) => p.id === res.period.id);
      setPeriods((prev) =>
        exists ? prev : [res.period, ...prev].sort((a, b) => b.year - a.year || b.quarter - a.quarter)
      );
      setCurrentPeriodId(res.period.id);
      refreshRecords(res.period.id);
      setMessage(`${res.period.label} を作成しました`);
    });
  }

  function handleGenerate() {
    if (!currentPeriodId) return;
    if (!confirm("評価レコードを生成します。既に存在するスタッフはスキップされます。よろしいですか？")) return;
    startTransition(async () => {
      const res = await generateEvaluationRecordsAction(currentPeriodId);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      refreshRecords(currentPeriodId);
      setMessage(`評価レコードを ${res.created} 件生成しました（スキップ ${res.skipped} 件）`);
    });
  }

  function handleSaved(record: EvaluationRecord) {
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
    setSelected(record);
  }

  function handleFinalize(record: EvaluationRecord) {
    if (
      !confirm(
        `【確定確認】${record.employeeName} さんの③確定基本給を確定します。\n確定後はロックされます（管理者は再編集可能）。よろしいですか？`
      )
    )
      return;
    startTransition(async () => {
      const res = await finalizeEvaluationRecordAction(record.id);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      handleSaved(res.record);
      setRecords((prev) => prev.map((r) => (r.id === res.record.id ? res.record : r)));
      setMessage(`${res.record.employeeName} さんの評価を確定しました`);
    });
  }

  function handleReopen(record: EvaluationRecord) {
    if (!confirm(`${record.employeeName} さんの確定を取り消して再編集しますか？`)) return;
    startTransition(async () => {
      const res = await reopenEvaluationRecordAction(record.id);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      handleSaved(res.record);
      setMessage(`${res.record.employeeName} さんの評価を再編集状態に戻しました`);
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-800 tracking-tight">人事評価管理</h1>
            <p className="text-sm text-gray-500 mt-2">
              定量・定性目標の結果から評価を自動算出し、確認・修正のうえ確定します。
              （ログイン: {userName}）
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              value={currentPeriodId ?? ""}
              onChange={(e) => switchPeriod(e.target.value)}
            >
              {periods.length === 0 ? <option value="">期間が未作成</option> : null}
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleGenerate}
              disabled={!currentPeriodId || pending}
              className="bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              評価レコード生成
            </button>
          </div>
        </div>

        {/* 新規期間作成 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              対象年
            </label>
            <input
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              inputMode="numeric"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              四半期
            </label>
            <select
              value={newQuarter}
              onChange={(e) => setNewQuarter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="1">第1四半期（1〜3月）</option>
              <option value="2">第2四半期（4〜6月）</option>
              <option value="3">第3四半期（7〜9月）</option>
              <option value="4">第4四半期（10〜12月）</option>
            </select>
          </div>
          <button
            onClick={handleCreatePeriod}
            disabled={pending}
            className="bg-slate-700 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            期間を作成
          </button>
          <div className="flex-1" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="名前・チームで検索"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56"
          />
        </div>

        {message ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3">
            {message}
          </div>
        ) : null}

        {!currentPeriodId ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center text-sm text-gray-500">
            まず「期間を作成」から評価対象の四半期を作成してください。
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center text-sm text-gray-500">
            この期間の評価レコードはまだありません。「評価レコード生成」でスタッフ全員分を作成できます。
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-3 font-bold">名前</th>
                    <th className="px-4 py-3 font-bold">チーム</th>
                    <th className="px-4 py-3 font-bold">グレード</th>
                    <th className="px-4 py-3 font-bold text-center">月別達成率（全社）</th>
                    <th className="px-4 py-3 font-bold text-right">①現状基本給</th>
                    <th className="px-4 py-3 font-bold text-right">②評価結果</th>
                    <th className="px-4 py-3 font-bold text-right">③確定基本給</th>
                    <th className="px-4 py-3 font-bold text-right">③−①増減</th>
                    <th className="px-4 py-3 font-bold text-center">ランク</th>
                    <th className="px-4 py-3 font-bold text-center">ステータス</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ record, computed }) => (
                    <tr key={record.id} className="border-b border-gray-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-gray-800">{record.employeeName}</td>
                      <td className="px-4 py-3 text-gray-600">{record.teamLabel}</td>
                      <td className="px-4 py-3 text-gray-600">{record.stageGrade}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {months.map((m, i) => {
                            const r = computed.monthlyCompanyRates[i];
                            return (
                              <span
                                key={m}
                                title={`${m.slice(5)}月: ${r !== null ? `${r}%` : "未入力"}`}
                                className={`inline-block text-[10px] font-mono font-bold px-1.5 py-1 rounded-md border ${
                                  r === null
                                    ? "bg-gray-50 text-gray-300 border-gray-200"
                                    : r >= 100
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : r >= 70
                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                        : "bg-rose-50 text-rose-700 border-rose-200"
                                }`}
                              >
                                {m.slice(5)}: {r !== null ? `${Math.round(r)}%` : "—"}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {record.currentSalary.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {computed.resultSalary.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                        {computed.finalSalary.toLocaleString()}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          computed.diffFromCurrent > 0
                            ? "text-emerald-600"
                            : computed.diffFromCurrent < 0
                              ? "text-rose-600"
                              : "text-gray-500"
                        }`}
                      >
                        {computed.diffFromCurrent > 0 ? "+" : ""}
                        {computed.diffFromCurrent.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block text-xs font-black px-2 py-1 rounded-full border ${
                            RANK_STYLES[computed.rank.rank]
                          }`}
                        >
                          {computed.rank.rank} ({computed.totalScore})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {record.status === "confirmed" ? (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                            確定済
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                            下書き
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelected(record)}
                          className="text-xs font-bold text-slate-600 hover:text-slate-900 underline"
                        >
                          詳細
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-4 py-3 text-gray-800" colSpan={4}>
                      合計（{rows.length}名）
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {totals.current.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {totals.result.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {totals.final.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {(totals.final - totals.current > 0 ? "+" : "") +
                        (totals.final - totals.current).toLocaleString()}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400">
          ①現状基本給 → ②評価結果（号俸から自動算出）→ ③確定基本給（②＋手動調整額）。
          定量は月別の目標値・結果値から各月の達成率（100%頭打ち）と四半期合計を算出し、
          定性は月別点数（0〜10点）から達成率を算出します。総合点から獲得ランク（S〜E）と号俸ポイント（+3〜-3）を決定します。
        </p>
      </main>

      {selected ? (
        <EvaluationDetailModal
          record={selected}
          months={months}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          onFinalize={handleFinalize}
          onReopen={handleReopen}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

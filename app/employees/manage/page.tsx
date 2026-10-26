"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { employees, Employee } from "@/lib/mockData";

import { fetchMasters, masterSelectOptions, type Masters } from "@/lib/mastersStore";

const FALLBACK_RANKS = ["S", "A", "B", "C", "D", "E"];

const inputCls = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white text-gray-800";

type EditForm = {
  team: string; position: string; grade: string;
  jobType: string; employmentType: string; evaluationRank: string;
};

export default function StaffManagePage() {
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("すべて");
  const [allEmployees, setAllEmployees] = useState<Employee[]>(employees);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [masters, setMasters] = useState<Masters>({});
  const [mastersLoading, setMastersLoading] = useState(true);

  const loadStaff = () => {
    fetch("/api/staff")
      .then((r) => (r.ok ? r.json() : { staff: [] }))
      .then((data) => {
        const stored: Employee[] = data.staff ?? [];
        if (stored.length > 0) {
          const map = new Map<string, Employee>();
          employees.forEach((e) => map.set(e.id, e));
          // ストア側を優先（編集内容を反映）
          stored.forEach((s) => map.set(s.id, { ...map.get(s.id), ...s } as Employee));
          setAllEmployees(Array.from(map.values()));
        } else {
          setAllEmployees(employees);
        }
      })
      .catch(() => {});
  };

  const loadMasters = () => {
    setMastersLoading(true);
    fetchMasters()
      .then((data) => setMasters(data))
      .catch(() => setError("マスター選択肢の取得に失敗しました"))
      .finally(() => setMastersLoading(false));
  };

  useEffect(() => {
    loadStaff();
    loadMasters();
  }, []);

  const teamOptions = useMemo(
    () => ["すべて", ...Array.from(new Set(allEmployees.map((e) => e.team).filter(Boolean)))],
    [allEmployees],
  );

  const filtered = allEmployees.filter((e) => {
    const q = search.trim();
    const matchSearch =
      !q ||
      e.name.includes(q) ||
      e.nameKana.includes(q) ||
      (e.team ?? "").includes(q) ||
      (e.position ?? "").includes(q);
    const matchTeam = teamFilter === "すべて" || e.team === teamFilter;
    return matchSearch && matchTeam;
  });

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setError("");
    setForm({
      team: emp.team ?? "",
      position: emp.position && emp.position !== "-" ? emp.position : "",
      grade: emp.grade && emp.grade !== "-" ? emp.grade : "",
      jobType: emp.jobType ?? "",
      employmentType: emp.employmentType ?? "",
      evaluationRank: emp.evaluationRank ?? "B",
    });
  };

  const saveEdit = async () => {
    if (!editing || !form) return;
    setSaving(true);
    setError("");
    try {
      const merged: Employee = { ...editing, ...form, department: form.team };
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee: merged }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "保存に失敗しました");
      }
      setAllEmployees((prev) => prev.map((e) => (e.id === editing.id ? merged : e)));
      setEditing(null);
      setForm(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-800">スタッフ管理</h1>
          <div className="flex items-center gap-2">
            <Link href="/employees" className="text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium px-3 py-2 rounded-lg transition">スタッフ一覧</Link>
            <Link href="/employees/new" className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg transition">+ 新規登録</Link>
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-500 mt-1">スタッフの新規登録と、所属チーム・役職・グレードなどの登録修正ができます。</p>
        </div>

        {/* 検索・フィルター */}
        <div className="bg-white rounded-2xl border shadow-sm p-4 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="名前・チーム・役職で検索..."
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <p className="text-xs text-gray-500 font-bold">{filtered.length} 名表示中</p>

        {/* リスト表示 */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.6fr_1.4fr_0.9fr_0.7fr_0.7fr_auto] gap-3 px-5 py-3 bg-gray-50 border-b text-xs font-bold text-gray-500">
            <span>氏名</span>
            <span>所属チーム</span>
            <span>役職</span>
            <span>グレード</span>
            <span>評価</span>
            <span className="text-right">操作</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {filtered.map((e) => (
              <li key={e.id} className="grid grid-cols-2 md:grid-cols-[1.6fr_1.4fr_0.9fr_0.7fr_0.7fr_auto] gap-2 md:gap-3 px-5 py-3 items-center text-sm hover:bg-gray-50/70 transition">
                <div className="min-w-0">
                  <Link href={`/employees/${e.id}`} className="font-bold text-gray-800 hover:text-emerald-600 truncate block">{e.name}</Link>
                  <span className="text-[11px] text-gray-400 truncate block">{e.nameKana}</span>
                </div>
                <span className="text-gray-600 truncate">{e.team || <span className="text-gray-300">未設定</span>}</span>
                <span className="text-gray-600 truncate">{e.position || <span className="text-gray-300">-</span>}</span>
                <span className="text-gray-700 font-medium">{e.grade || "-"}</span>
                <span className="text-gray-700 font-medium">{e.evaluationRank || "-"}</span>
                <div className="text-right col-span-2 md:col-span-1">
                  <button
                    onClick={() => openEdit(e)}
                    className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 font-bold px-3 py-1.5 rounded-lg transition"
                  >
                    編集
                  </button>
                </div>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-gray-400">該当するスタッフがいません。</li>
            )}
          </ul>
        </div>
      </main>

      {/* 編集モーダル */}
      {editing && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(ev) => ev.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold text-base">{editing.name} さんの登録修正</h2>
                <p className="text-white/80 text-xs">{editing.nameKana}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-white/80 hover:text-white text-lg leading-none">×</button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">所属先</label>
                <select value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} className={inputCls} disabled={mastersLoading}>
                  {masterSelectOptions(masters, "department").map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">役職</label>
                  <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className={inputCls} disabled={mastersLoading}>
                    {masterSelectOptions(masters, "position").map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">等級/グレード</label>
                  <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className={inputCls} disabled={mastersLoading}>
                    {masterSelectOptions(masters, "grade").map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">職種</label>
                  <select value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value })} className={inputCls} disabled={mastersLoading}>
                    {masterSelectOptions(masters, "jobType").map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">雇用形態</label>
                  <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className={inputCls} disabled={mastersLoading}>
                    {masterSelectOptions(masters, "employmentType").map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">評価ランク</label>
                <select
                  value={form.evaluationRank}
                  onChange={(e) => setForm({ ...form, evaluationRank: e.target.value })}
                  className={inputCls}
                  disabled={mastersLoading}
                >
                  {(masterSelectOptions(masters, "evaluationRank").length > 0
                    ? masterSelectOptions(masters, "evaluationRank")
                    : FALLBACK_RANKS.map((r) => ({ value: r, label: r }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {error && <p className="text-xs text-rose-500">{error}</p>}
            </div>
            <div className="px-5 pb-5 flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">キャンセル</button>
              <button onClick={saveEdit} disabled={saving} className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition disabled:opacity-60">
                {saving ? "保存中..." : "保存する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

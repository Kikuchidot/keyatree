"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { employees, calcTenure, Employee } from "@/lib/mockData";
import Avatar from "@/components/Avatar";

const rankColors: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-300" },
  A: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-300" },
  B: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-300" },
  C: { bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-300" },
};

const rankOptions = ["すべて", "S", "A", "B", "C"];

export default function EmployeeListPage() {
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("すべて");
  const [rank, setRank] = useState("すべて");
  const [allEmployees, setAllEmployees] = useState<Employee[]>(employees);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");

  const teamOptions = useMemo(
    () => ["すべて", ...Array.from(new Set(allEmployees.map((e) => e.team).filter(Boolean)))],
    [allEmployees],
  );

  useEffect(() => {
    // Supabase に保存された新規スタッフを取得してマージ
    fetch("/api/staff")
      .then((r) => (r.ok ? r.json() : { staff: [] }))
      .then((data) => {
        const stored: Employee[] = data.staff ?? [];
        if (stored.length > 0) {
          const existing = new Set(employees.map((e) => e.id));
          setAllEmployees([...employees, ...stored.filter((s) => !existing.has(s.id))]);
        }
      })
      .catch(() => {});
  }, []);

  async function resizeToDataUrl(file: File, max = 320): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const img = document.createElement("img");
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function handleUpload(emp: Employee, file: File) {
    if (!file.type.startsWith("image/")) {
      setUploadError("画像ファイルを選択してください");
      return;
    }
    setUploadError("");
    setUploadingId(emp.id);
    try {
      const photo = await resizeToDataUrl(file);
      const updated: Employee = { ...emp, photo };
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee: updated }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      setAllEmployees((prev) => prev.map((e) => (e.id === emp.id ? updated : e)));
    } catch (e) {
      setUploadError((e as Error).message || "アップロードに失敗しました");
    } finally {
      setUploadingId(null);
    }
  }

  async function handleDeletePhoto(emp: Employee) {
    if (!window.confirm(`${emp.name} さんの写真を削除しますか？`)) return;
    setUploadError("");
    setDeletingId(emp.id);
    try {
      const updated: Employee = { ...emp, photo: "" };
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee: updated }),
      });
      if (!res.ok) throw new Error("削除に失敗しました");
      setAllEmployees((prev) => prev.map((e) => (e.id === emp.id ? updated : e)));
    } catch (e) {
      setUploadError((e as Error).message || "写真の削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = allEmployees.filter((e) => {
    const matchSearch =
      e.name.includes(search) ||
      e.nameKana.includes(search) ||
      (e.team ?? "").includes(search) ||
      e.position.includes(search);
    const matchTeam = team === "すべて" || e.team === team;
    const matchRank = rank === "すべて" || e.evaluationRank === rank;
    return matchSearch && matchTeam && matchRank;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-800">スタッフ一覧</h1>
          <div className="flex items-center gap-2">
            <Link href="/settings/masters" className="text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium px-3 py-2 rounded-lg transition">マスター管理</Link>
            <Link href="/employees/new" className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg transition">+ 新規登録</Link>
          </div>
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
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            {teamOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            {rankOptions.map((r) => <option key={r} value={r}>評価ランク：{r}</option>)}
          </select>
        </div>

        {/* 件数 */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            <span className="font-bold text-gray-800">{filtered.length}</span> 名表示中
            {allEmployees.length !== filtered.length && `（全${allEmployees.length}名中）`}
          </p>
        </div>

        {uploadError && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-2">
            {uploadError}
          </div>
        )}

        {/* カードグリッド */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">検索結果なし</p>
            <p className="text-sm">条件に一致するスタッフが見つかりませんでした</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((emp) => {
              const rc = rankColors[emp.evaluationRank] ?? rankColors["C"];
              return (
                <div
                  key={emp.id}
                  className="bg-white rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden group"
                >
                  {/* カードヘッダー（ランク色帯） */}
                  <div className={`h-1.5 w-full ${rc.bg.replace("bg-", "bg-").replace("50", "400")}`}
                    style={{ background: emp.evaluationRank === "S" ? "#f59e0b" : emp.evaluationRank === "A" ? "#10b981" : emp.evaluationRank === "B" ? "#3b82f6" : "#9ca3af" }}
                  />

                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      {/* アバター（写真アップロード対応） */}
                      <div className="flex-shrink-0 relative">
                        {emp.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={emp.photo} alt={emp.name} className="w-24 h-24 rounded-full object-cover shadow flex-shrink-0" />
                        ) : (
                          <Avatar name={emp.name} size="lg" className="shadow" />
                        )}
                        <label
                          title="写真を変更"
                          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center cursor-pointer shadow ring-2 ring-white transition"
                        >
                          {uploadingId === emp.id ? (
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                              <circle cx="12" cy="13" r="4" />
                            </svg>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingId === emp.id}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUpload(emp, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {emp.photo && (
                          <button
                            type="button"
                            title="写真を削除"
                            disabled={deletingId === emp.id}
                            onClick={() => handleDeletePhoto(emp)}
                            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer shadow ring-2 ring-white transition disabled:opacity-60"
                          >
                            {deletingId === emp.id ? (
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <span className="text-xs font-bold leading-none">&times;</span>
                            )}
                          </button>
                        )}
                      </div>

                      {/* 基本情報 */}
                      <Link href={`/employees/${emp.id}`} className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 leading-none mb-0.5">{emp.nameKana}</p>
                        <h3 className="text-base font-bold text-gray-800 group-hover:text-emerald-600 transition-colors">
                          {emp.name}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{emp.team || emp.department}</p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{emp.position}</span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{emp.grade}</span>
                        </div>
                      </Link>
                    </div>

                    {/* フッター */}
                    <Link href={`/employees/${emp.id}`} className="mt-4 pt-3 border-t flex items-center justify-between">
                      <span className="text-xs text-gray-400">勤続 {calcTenure(emp.joinedAt)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{emp.employmentType}</span>
                        <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${rc.bg} ${rc.text} ${rc.border}`}>
                          {emp.evaluationRank}
                        </span>
                      </div>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

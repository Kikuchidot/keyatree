"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { permissions, Permission } from "@/lib/permissions";
import { makeNewEmployee } from "@/lib/staffStore";
import { fetchMasters, masterSelectOptions, type Masters } from "@/lib/mastersStore";
import BackButton from "@/components/BackButton";

const enneagramTypes = [
  { type: 1, label: "改革者" }, { type: 2, label: "援助者" }, { type: 3, label: "達成者" },
  { type: 4, label: "個人主義者" }, { type: 5, label: "研究者" }, { type: 6, label: "忠実者" },
  { type: 7, label: "熱中者" }, { type: 8, label: "挑戦者" }, { type: 9, label: "平和主義者" },
];

const permColorMap: Record<string, { badge: string; ring: string; border: string; bg: string }> = {
  rose:    { badge: "bg-rose-100 text-rose-700 border-rose-200",    ring: "ring-rose-400",    border: "border-rose-400",    bg: "bg-rose-50" },
  amber:   { badge: "bg-amber-100 text-amber-700 border-amber-200", ring: "ring-amber-400",   border: "border-amber-400",   bg: "bg-amber-50" },
  blue:    { badge: "bg-blue-100 text-blue-700 border-blue-200",    ring: "ring-blue-400",    border: "border-blue-400",    bg: "bg-blue-50" },
  emerald: { badge: "bg-emerald-100 text-emerald-700 border-emerald-200", ring: "ring-emerald-400", border: "border-emerald-400", bg: "bg-emerald-50" },
  gray:    { badge: "bg-gray-100 text-gray-600 border-gray-200",    ring: "ring-gray-400",    border: "border-gray-400",    bg: "bg-gray-50" },
};

type FormData = {
  name: string; nameKana: string; team: string; position: string;
  grade: string; jobType: string; employmentType: string; joinedAt: string;
  enneagramType: string; bio: string;
  email: string; password: string; confirmPassword: string;
  permissionId: string;
};

const initial: FormData = {
  name: "", nameKana: "", team: "", position: "",
  grade: "", jobType: "", employmentType: "",
  joinedAt: new Date().toISOString().slice(0, 10), enneagramType: "3", bio: "",
  email: "", password: "", confirmPassword: "", permissionId: "staff",
};

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <label className="text-xs font-semibold text-gray-600">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputCls = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white";

export default function NewEmployeePage() {
  const [form, setForm] = useState<FormData>(initial);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [masters, setMasters] = useState<Masters>({});
  const [mastersLoading, setMastersLoading] = useState(true);

  useEffect(() => {
    setMastersLoading(true);
    fetchMasters()
      .then((data) => setMasters(data))
      .catch(() => setSaveError("マスター選択肢の取得に失敗しました"))
      .finally(() => setMastersLoading(false));
  }, []);

  const set = (key: keyof FormData, val: string) => {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const selectedPerm = permissions.find((p) => p.id === form.permissionId)!;
  const pc = permColorMap[selectedPerm.color];

  const validate = () => {
    const err: Partial<Record<keyof FormData, string>> = {};
    if (!form.name.trim()) err.name = "氏名を入力してください";
    if (!form.nameKana.trim()) err.nameKana = "フリガナを入力してください";
    if (!form.joinedAt) err.joinedAt = "入社日を入力してください";
    if (!form.email.trim()) err.email = "メールアドレスを入力してください";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) err.email = "正しいメールアドレスの形式で入力してください";
    if (!form.password) err.password = "パスワードを入力してください";
    else if (form.password.length < 8) err.password = "8文字以上で設定してください";
    if (!form.confirmPassword) err.confirmPassword = "確認用パスワードを入力してください";
    else if (form.password !== form.confirmPassword) err.confirmPassword = "パスワードが一致しません";
    return err;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError("");
    const err = validate();
    if (Object.keys(err).length > 0) { setErrors(err); return; }

    // スタッフ情報を生成
    const label = enneagramTypes.find((t) => String(t.type) === form.enneagramType)?.label ?? "";
    const emp = makeNewEmployee({
      name: form.name,
      nameKana: form.nameKana,
      department: form.team,
      team: form.team,
      position: form.position,
      grade: form.grade,
      jobType: form.jobType,
      employmentType: form.employmentType,
      joinedAt: form.joinedAt,
      enneagramType: Number(form.enneagramType),
      enneagramLabel: label,
      bio: form.bio,
    });

    const account = {
      id: `acc_${emp.id}`,
      employeeId: emp.id,
      name: form.name,
      email: form.email.trim(),
      password: form.password,
      permissionId: selectedPerm.id,
      permissionName: selectedPerm.name,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setSaving(true);
    try {
      // Supabase に永続化（どの端末からでも参照可能）
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee: emp, account }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "保存に失敗しました");
      }
      setCreatedId(emp.id);
      setSubmitted(true);
    } catch (e2) {
      setSaveError((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border p-10 text-center max-w-sm w-full mx-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-emerald-500 text-3xl">✓</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">登録が完了しました</h2>
          <p className="text-sm text-gray-500 mb-1"><span className="font-bold text-gray-700">{form.name}</span> さんのアカウントを作成しました。</p>
          <p className="text-xs text-gray-400 mb-6">ログイン情報は登録メールアドレス宛に送信されます。</p>
          <div className="flex flex-col gap-2">
            {createdId && (
              <Link href={`/employees/${createdId}`} className="w-full text-sm bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl transition text-center">
                マイページを開く
              </Link>
            )}
            <Link href="/employees" className="w-full text-sm border border-emerald-200 text-emerald-600 hover:bg-emerald-50 font-bold py-2.5 rounded-xl transition text-center">
              スタッフ一覧へ戻る
            </Link>
            <button onClick={() => { setForm(initial); setSubmitted(false); setCreatedId(null); }} className="w-full text-sm border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium py-2.5 rounded-xl transition">
              続けて登録する
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-800">スタッフ 新規登録</h1>
          <p className="text-sm text-gray-500 mt-1">基本情報・ログイン情報・権限をまとめて設定します。</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ① 基本情報 */}
          <section className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-700 pb-2 border-b">基本情報</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="氏名" required>
                <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="例：鈴木 一郎" className={inputCls} />
                {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
              </Field>
              <Field label="フリガナ" required>
                <input type="text" value={form.nameKana} onChange={(e) => set("nameKana", e.target.value)} placeholder="例：スズキ イチロウ" className={inputCls} />
                {errors.nameKana && <p className="text-xs text-rose-500 mt-1">{errors.nameKana}</p>}
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="入社日" required>
                <input type="date" value={form.joinedAt} onChange={(e) => set("joinedAt", e.target.value)} className={inputCls} />
                {errors.joinedAt && <p className="text-xs text-rose-500 mt-1">{errors.joinedAt}</p>}
              </Field>
              <Field label="雇用形態">
                <select value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)} className={inputCls} disabled={mastersLoading}>
                  {masterSelectOptions(masters, "employmentType").map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* ② 所属・役職 */}
          <section className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-700 pb-2 border-b">所属・役職</h2>
            <Field label="所属先">
              <select value={form.team} onChange={(e) => set("team", e.target.value)} className={inputCls} disabled={mastersLoading}>
                {masterSelectOptions(masters, "department").map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="役職">
                <select value={form.position} onChange={(e) => set("position", e.target.value)} className={inputCls} disabled={mastersLoading}>
                  {masterSelectOptions(masters, "position").map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </Field>
              <Field label="等級/グレード">
                <select value={form.grade} onChange={(e) => set("grade", e.target.value)} className={inputCls} disabled={mastersLoading}>
                  {masterSelectOptions(masters, "grade").map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="職種">
                <select value={form.jobType} onChange={(e) => set("jobType", e.target.value)} className={inputCls} disabled={mastersLoading}>
                  {masterSelectOptions(masters, "jobType").map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* ③ ログイン情報 */}
          <section className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-700 pb-2 border-b">ログイン情報</h2>
            <Field label="メールアドレス" required hint="ログインIDになります">
              <input
                type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                placeholder="例：suzuki@keyaki-s.com" className={inputCls}
              />
              {errors.email && <p className="text-xs text-rose-500 mt-1">{errors.email}</p>}
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="パスワード" required hint="8文字以上">
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"} value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    placeholder="••••••••" className={`${inputCls} pr-10`}
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium">
                    {showPass ? "隠す" : "表示"}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-rose-500 mt-1">{errors.password}</p>}
              </Field>
              <Field label="パスワード（確認）" required>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"} value={form.confirmPassword}
                    onChange={(e) => set("confirmPassword", e.target.value)}
                    placeholder="••••••••" className={`${inputCls} pr-10`}
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium">
                    {showConfirm ? "隠す" : "表示"}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-xs text-rose-500 mt-1">{errors.confirmPassword}</p>}
              </Field>
            </div>
          </section>

          {/* ④ 権限設定 */}
          <section className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b">
              <h2 className="text-sm font-bold text-gray-700">権限設定</h2>
              <Link href="/settings/permissions" className="text-xs text-emerald-600 hover:underline">
                権限一覧を見る
              </Link>
            </div>

            {/* 権限カード選択 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {permissions.map((p) => {
                const c = permColorMap[p.color];
                const isSelected = form.permissionId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set("permissionId", p.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      isSelected ? `${c.border} ${c.bg} ring-2 ${c.ring}` : "border-gray-100 hover:border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${c.badge}`}>{p.name}</span>
                      {isSelected && <span className="text-xs font-bold text-emerald-600">選択中</span>}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed mt-1">{p.description}</p>
                  </button>
                );
              })}
            </div>

            {/* 選択中権限の詳細 */}
            <div className={`rounded-xl p-4 border ${pc.bg} ${pc.border.replace("border-", "border-")}`}>
              <p className="text-xs font-bold text-gray-600 mb-2">「{selectedPerm.name}」でできること</p>
              <ul className="space-y-1">
                {selectedPerm.notes.map((n, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                    <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ⑤ パーソナリティ（任意） */}
          <section className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-700 pb-2 border-b">パーソナリティ <span className="text-xs font-normal text-gray-400">（任意）</span></h2>
            <Field label="エニアグラムタイプ">
              <select value={form.enneagramType} onChange={(e) => set("enneagramType", e.target.value)} className={inputCls}>
                {enneagramTypes.map((et) => (
                  <option key={et.type} value={String(et.type)}>Type {et.type}・{et.label}</option>
                ))}
              </select>
            </Field>
            <Field label="自己紹介・一言コメント">
              <textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} rows={3}
                placeholder="例：お客様に寄り添った提案を心がけています。"
                className={`${inputCls} resize-none`} />
            </Field>
          </section>

          {/* 送信ボタン */}
          {saveError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <p className="text-xs text-rose-600 font-medium">{saveError}</p>
            </div>
          )}
          <div className="flex gap-3 pb-8">
            <Link href="/employees"
              className="flex-1 text-sm border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium py-3 rounded-xl transition text-center">
              キャンセル
            </Link>
            <button type="submit" disabled={saving}
              className="flex-1 text-sm bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed">
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  保存中...
                </span>
              ) : "登録する"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

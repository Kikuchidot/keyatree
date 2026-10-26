"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";

import { fetchMasters, type Masters, type MasterItem } from "@/lib/mastersStore";

const tabConfig = [
  { key: "department", label: "所属先", desc: "スタッフが所属する組織・チームの一覧" },
  { key: "position", label: "役職/ステージ", desc: "スタッフの役職・ステージ区分" },
  { key: "grade", label: "グレード", desc: "給与・評価に紐づくグレード区分" },
  { key: "evaluationRank", label: "評価ランク", desc: "人事評価のランク区分（S・A・B・C・D・E など）" },
  { key: "jobType", label: "職種", desc: "スタッフの職種区分" },
  { key: "employmentType", label: "雇用形態", desc: "契約の種別区分" },
  { key: "activityStatus", label: "アクティビティ", desc: "ヘッダーのアイコンから選択できる在席状況（対応可能・取り込み中 など）" },
  { key: "blank", label: "ブランク", desc: "自由に使えるカテゴリー" },
];

// ---- 1行コンポーネント ----
function MasterRow({
  item,
  onEdit,
  onDelete,
}: {
  item: MasterItem;
  onEdit: (item: MasterItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl transition group">
      <span className="text-xs text-gray-300 font-mono w-5 text-right">{item.order}</span>
      <span className="flex-1 text-sm font-medium text-gray-700">{item.label}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={() => onEdit(item)}
          className="text-xs text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-lg font-medium transition"
        >
          編集
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="text-xs text-rose-500 border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3 py-1 rounded-lg font-medium transition"
        >
          削除
        </button>
      </div>
    </div>
  );
}

// ---- 追加・編集モーダル ----
function EditModal({
  tabLabel,
  item,
  onClose,
  onSave,
}: {
  tabLabel: string;
  item: MasterItem | null;
  onClose: () => void;
  onSave: (label: string) => void;
}) {
  const [label, setLabel] = useState(item?.label ?? "");
  const isEdit = !!item;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-800 mb-4">
          {isEdit ? `${tabLabel}を編集` : `${tabLabel}を追加`}
        </h3>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">名称</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          placeholder={`例：${tabLabel}名を入力`}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 mb-5"
          onKeyDown={(e) => { if (e.key === "Enter" && label.trim()) onSave(label.trim()); }}
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-sm border border-gray-200 rounded-xl py-2.5 text-gray-500 hover:bg-gray-50 transition">
            キャンセル
          </button>
          <button
            onClick={() => label.trim() && onSave(label.trim())}
            disabled={!label.trim()}
            className="flex-1 text-sm bg-emerald-500 text-white rounded-xl py-2.5 font-bold hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {isEdit ? "保存する" : "追加する"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- メインページ ----
export default function MastersPage() {
  const [masters, setMasters] = useState<Masters>({});
  const [activeTab, setActiveTab] = useState("department");
  const [editTarget, setEditTarget] = useState<MasterItem | null | "new">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // 初期ロード：サーバーから取得（全端末共通）
  useEffect(() => {
    fetchMasters()
      .then((data) => setMasters(data))
      .catch(() => showToast("読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  // サーバーへ保存（楽観的更新＋失敗時ロールバック）
  const persist = useCallback(async (next: Masters, prev: Masters, successMsg: string) => {
    setMasters(next);
    setSaving(true);
    try {
      const res = await fetch("/api/masters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masters: next }),
      });
      if (!res.ok) throw new Error();
      showToast(successMsg);
    } catch {
      setMasters(prev);
      showToast("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }, []);

  const currentTab = tabConfig.find((t) => t.key === activeTab)!;
  const items = [...(masters[activeTab] ?? [])].sort((a, b) => a.order - b.order);

  const handleSave = (label: string) => {
    const prev = masters;
    if (editTarget === "new") {
      const newItem: MasterItem = {
        id: `${activeTab}_${Date.now()}`,
        label,
        order: items.length + 1,
      };
      const next = { ...masters, [activeTab]: [...(masters[activeTab] ?? []), newItem] };
      persist(next, prev, `「${label}」を追加しました`);
    } else if (editTarget) {
      const next = {
        ...masters,
        [activeTab]: masters[activeTab].map((it) => (it.id === editTarget.id ? { ...it, label } : it)),
      };
      persist(next, prev, `「${label}」に更新しました`);
    }
    setEditTarget(null);
  };

  const handleDelete = (id: string) => {
    const target = items.find((it) => it.id === id);
    if (!confirm(`「${target?.label}」を削除しますか？`)) return;
    const prev = masters;
    const next = {
      ...masters,
      [activeTab]: masters[activeTab].filter((it) => it.id !== id).map((it, i) => ({ ...it, order: i + 1 })),
    };
    persist(next, prev, `「${target?.label}」を削除しました`);
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* ヘッダー */}
        
        <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-800">マスター管理</h1>
            <p className="text-sm text-gray-500 mt-1">スタッフ登録フォームの選択肢を管理します。</p>
          </div>

          <div className="flex flex-col md:flex-row gap-5">
            {/* サイドタブ */}
            <aside className="md:w-44 flex-shrink-0">
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                {tabConfig.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full text-left px-4 py-3.5 text-sm font-medium border-b last:border-0 transition-colors flex items-center justify-between ${
                      activeTab === tab.key
                        ? "bg-emerald-50 text-emerald-700 font-bold"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                      {masters[tab.key]?.length ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            {/* コンテンツ */}
            <div className="flex-1">
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                {/* パネルヘッダー */}
                <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
                  <div>
                    <h2 className="text-sm font-bold text-gray-800">{currentTab.label}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{currentTab.desc}</p>
                  </div>
                  <button
                    onClick={() => setEditTarget("new")}
                    disabled={saving || loading}
                    className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + 追加
                  </button>
                </div>

                {/* アイテムリスト */}
                <div className="divide-y">
                  {loading ? (
                    <div className="py-12 text-center text-gray-400 text-sm">読み込み中...</div>
                  ) : items.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-sm">
                      まだ登録されていません
                    </div>
                  ) : (
                    <div className="p-2">
                      {items.map((item) => (
                        <MasterRow
                          key={item.id}
                          item={item}
                          onEdit={(it) => setEditTarget(it)}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* フッター */}
                {items.length > 0 && (
                  <div className="px-5 py-3 border-t bg-gray-50 text-xs text-gray-400">
                    {items.length}件登録済み
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* モーダル */}
      {editTarget !== null && (
        <EditModal
          tabLabel={currentTab.label}
          item={editTarget === "new" ? null : editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSave}
        />
      )}

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-5 py-3 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}

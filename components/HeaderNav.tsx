"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchMasters, getMasterItems, type MasterItem } from "@/lib/mastersStore";

type Session = {
  id?: string;
  name: string;
  email: string;
  permissionName: string;
  employeeId: string;
};

function parseCookieSession(): Session | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/kt_session=([^;]+)/);
  if (!match) return null;
  try { return JSON.parse(decodeURIComponent(match[1])); }
  catch { return null; }
}

/** アクティビティ項目の色（既定の並び順に対応。追加した項目はグレー） */
function activityColor(item: MasterItem): string {
  if (item.order === 1) return "bg-emerald-500"; // 対応可能
  if (item.order === 2) return "bg-rose-500"; // 取り込み中
  if (item.order === 3) return "bg-rose-700"; // 応答不可
  if (item.order === 4 || item.order === 5) return "bg-amber-400"; // 一時退席 / 離席中
  return "bg-gray-400"; // オフライン表示 / カスタム
}

export default function HeaderNav({ currentLabel, extraRight }: { currentLabel?: string; extraRight?: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [activityItems, setActivityItems] = useState<MasterItem[]>([]);
  const [myStatusId, setMyStatusId] = useState<string>("");

  useEffect(() => {
    setSession(parseCookieSession());
    if (typeof window !== "undefined") {
      setCanGoBack(window.history.length > 1);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchMasters()
      .then((m) => setActivityItems(getMasterItems(m, "activityStatus")))
      .catch(() => setActivityItems([]));
    fetch(`/api/presence?_t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = d?.presence?.[session.id || session.employeeId || session.email];
        setMyStatusId(p?.statusId ?? "");
      })
      .catch(() => {});
  }, [session]);

  const myStatus = activityItems.find((i) => i.id === myStatusId) ?? activityItems[0] ?? null;

  const selectActivity = async (statusId: string) => {
    setMyStatusId(statusId);
    try {
      await fetch("/api/presence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId }),
      });
    } catch {
      /* 保存失敗時は表示のみ更新 */
    }
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/employees");
    }
  };

  const handleLogout = () => {
    document.cookie = "kt_session=; path=/; max-age=0";
    router.push("/login");
  };

  return (
    <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
        {/* 戻る */}
        {canGoBack && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-emerald-600 border border-gray-200 hover:border-emerald-300 rounded-full pl-2 pr-3 py-1.5 transition flex-shrink-0"
            aria-label="一つ前に戻る"
          >
            <span className="text-sm leading-none">‹</span>
            戻る
          </button>
        )}
        {/* ロゴ */}
        <Link href="/employees" className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">K</span>
        </Link>
        <Link href="/employees" className="font-bold text-gray-800 text-sm hover:text-emerald-600 transition">K.AI</Link>

        {currentLabel && (
          <>
            <span className="text-gray-300 mx-1">›</span>
            <span className="text-gray-700 text-sm font-medium">{currentLabel}</span>
          </>
        )}

        {/* 右側 */}
        <div className="ml-auto flex items-center gap-3">
          {session?.employeeId && (
            <Link
              href={`/employees/${session.employeeId}`}
              className="text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-full px-3 py-1.5 transition"
            >
              マイページ
            </Link>
          )}
          <Link
            href="/features"
            className="text-xs font-bold text-gray-600 hover:text-emerald-600 border border-gray-200 hover:border-emerald-300 rounded-full px-3 py-1.5 transition"
          >
            機能一覧
          </Link>
          {extraRight}
          {session ? (
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 hover:bg-gray-50 rounded-xl px-3 py-1.5 transition"
            >
              <div className="relative flex-shrink-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{session.name.slice(0, 1)}</span>
                </div>
                {myStatus && (
                  <span
                    data-testid="activity-dot"
                    title={myStatus.label}
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${activityColor(myStatus)}`}
                  />
                )}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold text-gray-700 leading-none">{session.name}</p>
                <p className="text-xs text-gray-400 leading-none mt-0.5">
                  {myStatus ? myStatus.label : session.permissionName}
                </p>
              </div>
              <span className="text-gray-400 text-xs">▾</span>
            </button>
          ) : null}
        </div>

        {/* ドロップダウン（外側に配置） */}
        {menuOpen && session && (
          <div className="relative">
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-4 top-0 mt-1 w-52 bg-white rounded-2xl border shadow-xl z-20 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b">
                  <p className="text-xs font-bold text-gray-700">{session.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{session.email}</p>
                </div>
                {/* アクティビティ（在席状況）の選択 */}
                {activityItems.length > 0 && (
                  <div className="py-1 border-b">
                    <p className="px-4 pt-1 pb-1 text-[10px] font-bold text-gray-400">アクティビティ</p>
                    {activityItems.map((item) => (
                      <button
                        key={item.id}
                        data-activity-id={item.id}
                        onClick={() => selectActivity(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition ${
                          item.id === myStatusId ? "bg-emerald-50 text-emerald-700 font-bold" : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${activityColor(item)}`} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.id === myStatusId && <span className="text-emerald-600 text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="py-1">
                  {session.employeeId && (
                    <Link
                      href={`/employees/${session.employeeId}`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                    >
                      マイプロフィール
                    </Link>
                  )}
                  <Link
                    href="/settings/accounts"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    アカウント管理
                  </Link>
                  <Link
                    href="/settings/masters"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    マスター管理
                  </Link>
                  <Link
                    href="/settings/permissions"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    権限管理
                  </Link>
                  <Link
                    href="/goal-navigator"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    目標設定ナビ
                  </Link>
                  <Link
                    href="/qualitative-goal-navigator"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    定性目標ナビ
                  </Link>
                  <Link
                    href="/goal-navigator/history"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    目標設定履歴
                  </Link>
                  <Link
                    href="/approvals/goal-navigators"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    承認一覧
                  </Link>
                  <Link
                    href="/mvg"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    MVG投票
                  </Link>
                  <div className="border-t my-1" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-500 hover:bg-rose-50 transition"
                  >
                    ログアウト
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
    </header>
  );
}

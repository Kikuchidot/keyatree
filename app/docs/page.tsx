import Link from "next/link";
import BackButton from "@/components/BackButton";

const docs = [
  {
    id: "goal-permissions-guide",
    href: "/docs/goal-permissions-guide",
    label: "GUIDE",
    color: "from-teal-500 to-emerald-500",
    title: "目標設定 権限・承認・一時差戻 運用手順書",
    desc: "管理者権限の設定方法、承認者割り当て、提出から承認までのフロー、承認済みシートへの一時差戻（編集許可）の操作手順とアクセス権限早見表。",
    tags: ["運用手順", "権限", "承認", "一時差戻"],
    date: "2026.10",
    status: "公開中",
  },
  {
    id: "tech-overview",
    href: "/docs/tech-overview",
    label: "TECH",
    color: "from-emerald-500 to-teal-500",
    title: "技術構成・インフラ環境および予算概算",
    desc: "開発言語・フレームワーク・インフラ構成・セキュリティ方針・費用概算・開発ロードマップ。",
    tags: ["Next.js", "Vercel", "Supabase", "費用概算"],
    date: "2025.05",
    status: "公開中",
  },
  {
    id: "infra-qa",
    href: "/docs/infra-qa.html",
    label: "Q&A",
    color: "from-blue-500 to-indigo-500",
    title: "インフラ・運用・セキュリティに関するご質問事項への回答書",
    desc: "Supabase、運用保守、ランニングコスト、SLA、バックアップ、IP制限、操作ログなどへの提出用回答資料。",
    tags: ["提出用", "セキュリティ", "運用保守", "SLA"],
    date: "2025.05",
    status: "公開中",
  },
  {
    id: "floorplan-requirements",
    href: "/docs/floorplan-requirements.html",
    label: "REQ",
    color: "from-blue-500 to-teal-500",
    title: "賃貸物件 間取り作成機能 要件定義書",
    desc: "賃貸募集図面向けの間取り作成機能について、画面構成・編集機能・保存形式・技術構成・段階的な開発方針を整理した要件定義資料。",
    tags: ["要件定義", "物件管理", "間取り作成"],
    date: "2025.06",
    status: "公開中",
  },
  {
    id: "goal-navigator-requirements",
    href: "/docs/goal-navigator-requirements.html",
    label: "REQ",
    color: "from-emerald-500 to-teal-500",
    title: "目標設定ナビゲーター機能 要件定義書",
    desc: "定量目標設定ナビゲーターの進行フロー、画面要件、データ要件、AI利用範囲、出力要件を整理した要件定義資料。",
    tags: ["要件定義", "定量目標", "評価運用"],
    date: "2025.06",
    status: "公開中",
  },
  {
    id: "goal-navigator-demo",
    href: "/demo/goal-navigator",
    label: "DEMO",
    color: "from-emerald-500 to-teal-500",
    title: "目標設定ナビゲーター デモ画面",
    desc: "1問ずつ進みながら目標設定を行い、最終レポート生成まで体験できるインタラクティブデモ。",
    tags: ["デモ", "ウィザードUI", "定量目標"],
    date: "2025.06",
    status: "公開中",
  },
  {
    id: "qualitative-goal-navigator-requirements",
    href: "/docs/qualitative-goal-navigator-requirements.html",
    label: "REQ",
    color: "from-blue-500 to-indigo-500",
    title: "定性目標設定ナビゲーター機能 要件定義書",
    desc: "PDF準拠のステージ・グレード・カテゴリ・コンピテンシーを基盤とした定性目標設定ナビゲーターの要件定義資料。",
    tags: ["要件定義", "定性目標", "PDF準拠"],
    date: "2025.06",
    status: "公開中",
  },
  {
    id: "qualitative-goal-navigator-demo",
    href: "/demo/qualitative-goal-navigator",
    label: "DEMO",
    color: "from-blue-500 to-indigo-500",
    title: "定性目標設定ナビゲーター デモ画面",
    desc: "PDF準拠の固定選択項目を用いて、定性目標設定から行動3つ、最終レポート生成まで体験できるデモ画面。",
    tags: ["デモ", "定性目標", "PDF準拠"],
    date: "2025.06",
    status: "公開中",
  },
  {
    id: "floorplan-demo",
    href: "/properties",
    label: "DEMO",
    color: "from-sky-500 to-teal-500",
    title: "間取り作成機能",
    desc: "物件一覧 → 物件詳細 → 間取り作成の流れで、下書き保存・テンプレート保存・SVG/PNG/PDF/JSON出力まで利用できる画面。",
    tags: ["実装", "物件管理", "間取り作成"],
    date: "2025.06",
    status: "公開中",
  },
  {
    id: "supabase-setup",
    href: "/docs/supabase-setup",
    label: "DB",
    color: "from-emerald-500 to-blue-500",
    title: "Supabase導入手順 / 監査ログ設定",
    desc: "目標設定ナビゲーターの保存・履歴・承認・監査ログをSupabaseへ接続するための導入手順と設定案内。",
    tags: ["Supabase", "監査ログ", "DB接続"],
    date: "2025.06",
    status: "公開中",
  },
  {
    id: "dev-log-01",
    href: null,
    label: "LOG",
    color: "from-amber-400 to-orange-500",
    title: "開発ログ #01 — フェーズ1 実装記録",
    desc: "社員詳細・一覧・登録・認証・マスター管理の実装内容と意思決定の記録。",
    tags: ["実装記録", "フェーズ1"],
    date: "準備中",
    status: "準備中",
  },
  {
    id: "db-design",
    href: null,
    label: "DB",
    color: "from-blue-500 to-indigo-500",
    title: "DB設計書 — Supabase スキーマ定義",
    desc: "テーブル定義・リレーション・インデックス・RLSポリシーの設計書。フェーズ2作成予定。",
    tags: ["PostgreSQL", "Supabase", "フェーズ2"],
    date: "準備中",
    status: "準備中",
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">開発ドキュメント</h1>
          <p className="text-sm text-gray-500 mt-1">技術資料・開発ログ・設計書の一覧です。ドキュメントを読んだら読了確認をお願いします。</p>
        </div>

        <div className="space-y-3">
          {docs.map((doc) => {
            const card = (
              <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${doc.href ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer" : "opacity-50"}`}>
                <div className={`h-1 bg-gradient-to-r ${doc.color}`} />
                <div className="flex items-center gap-5 p-5">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${doc.color} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white text-xs font-black font-mono tracking-tight">{doc.label}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-gray-800">{doc.title}</h3>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{doc.desc}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {doc.tags.map(t => (
                        <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${doc.status === "公開中" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                      {doc.status}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{doc.date}</p>
                  </div>
                </div>
              </div>
            );

            return doc.href ? (
              <Link key={doc.id} href={doc.href}>{card}</Link>
            ) : (
              <div key={doc.id}>{card}</div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

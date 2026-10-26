import Link from "next/link";
import { canApprove, getServerSession } from "@/lib/goalNavigatorStore";
import { isMvgAdmin } from "@/lib/mvgActions";
import { isGoalAdmin } from "@/lib/goalAccess";

type Feature = {
  id: string;
  href: string | null;
  label: string;
  icon: string;
  color: string;
  bgLight: string;
  title: string;
  desc: string;
  tags: string[];
  status: "公開中" | "開発中" | "準備中";
  category: "業務支援" | "コミュニケーション" | "管理・運用" | "デモ・資料";
};

const features: Feature[] = [
  {
    id: "goal-navigator-demo",
    href: "/demo/goal-navigator",
    label: "GOAL",
    icon: "目標",
    color: "text-emerald-600",
    bgLight: "bg-emerald-50",
    title: "目標設定ナビゲーター",
    desc: "1問ずつ進みながら定量目標を設定し、最終レポート生成まで体験できるウィザードUIデモ。",
    tags: ["デモ", "定量目標", "ウィザードUI"],
    status: "公開中",
    category: "デモ・資料",
  },
  {
    id: "qualitative-goal-navigator-demo",
    href: "/demo/qualitative-goal-navigator",
    label: "QUAL",
    icon: "定性",
    color: "text-blue-600",
    bgLight: "bg-blue-50",
    title: "定性目標設定ナビゲーター",
    desc: "PDF準拠の固定選択項目で定性目標と行動3つを設定し、最終レポート生成まで行うデモ画面。",
    tags: ["デモ", "定性目標", "PDF準拠"],
    status: "公開中",
    category: "デモ・資料",
  },
  {
    id: "goal-approvals",
    href: "/approvals/goal-navigators",
    label: "APPR",
    icon: "承認",
    color: "text-lime-700",
    bgLight: "bg-lime-50",
    title: "目標設定 承認・進捗管理",
    desc: "管理者・人事管理者向け。スタッフの目標設定申請を確認し、承認 / やり直し依頼を決裁。進捗報告も確認できます。",
    tags: ["承認", "決裁", "進捗管理"],
    status: "公開中",
    category: "管理・運用",
  },
  {
    id: "employees",
    href: "/employees/manage",
    label: "EMP",
    icon: "要員",
    color: "text-emerald-700",
    bgLight: "bg-emerald-50",
    title: "スタッフ管理",
    desc: "スタッフの新規登録と、所属チーム・役職・グレードの登録修正。リスト表示。",
    tags: ["スタッフ", "認証", "権限"],
    status: "公開中",
    category: "管理・運用",
  },
  {
    id: "tasks",
    href: "/tasks/channels",
    label: "TEAMS",
    icon: "Talk",
    color: "text-amber-700",
    bgLight: "bg-amber-50",
    title: "チームス",
    desc: "チャンネル・トークルームでのやりとり。トーク内から依頼（タスク）を起票できます。別ウィンドウで開きます。",
    tags: ["チャンネル", "トーク", "依頼起票", "別ウィンドウ"],
    status: "公開中",
    category: "コミュニケーション",
  },
  {
    id: "task-list",
    href: "/tasks",
    label: "TASKS",
    icon: "依頼",
    color: "text-teal-700",
    bgLight: "bg-teal-50",
    title: "依頼（タスク）管理",
    desc: "チームスで起票された依頼（タスク）の一覧・進捗・アーカイブを管理します。",
    tags: ["タスク一覧", "進捗管理", "アーカイブ"],
    status: "公開中",
    category: "コミュニケーション",
  },
  {
    id: "mvg",
    href: "/mvg",
    label: "MVG",
    icon: "MVG",
    color: "text-rose-600",
    bgLight: "bg-rose-50",
    title: "Most Valuable Giver",
    desc: "スタッフ同士で「ありがとう」を投票し合い、年間で最も感謝を届けた人を表彰します。",
    tags: ["表彰", "投票", "サンクス"],
    status: "公開中",
    category: "コミュニケーション",
  },
  {
    id: "floorplan-property",
    href: "/properties",
    label: "PROP",
    icon: "物件",
    color: "text-teal-700",
    bgLight: "bg-teal-50",
    title: "物件管理 → 間取り作成",
    desc: "物件一覧 → 物件詳細 → 間取り作成の実運用フロー。下書き保存・テンプレート保存に対応。",
    tags: ["物件管理", "間取り作成"],
    status: "公開中",
    category: "業務支援",
  },
  {
    id: "floorplan-demo",
    href: "/demo/floorplan",
    label: "PLAN",
    icon: "間取",
    color: "text-sky-700",
    bgLight: "bg-sky-50",
    title: "間取り作成（フロアプラン）",
    desc: "部屋・壁・建具・記号を配置し、重なり順の調整やSVG/PNG/PDF/JSON出力までできる間取り作成エディタのデモ画面。",
    tags: ["デモ", "間取り作成", "SVG出力"],
    status: "開発中",
    category: "デモ・資料",
  },
  {
    id: "docs",
    href: "/docs",
    label: "DOCS",
    icon: "DOCS",
    color: "text-gray-700",
    bgLight: "bg-gray-100",
    title: "開発ドキュメント",
    desc: "技術構成・要件定義・開発ログ・DB設計などの資料一覧。",
    tags: ["要件定義", "技術資料"],
    status: "公開中",
    category: "デモ・資料",
  },
];

const statusStyle: Record<Feature["status"], string> = {
  公開中: "bg-emerald-100 text-emerald-700 border-emerald-200",
  開発中: "bg-sky-100 text-sky-700 border-sky-200",
  準備中: "bg-gray-100 text-gray-400 border-gray-200",
};

const categoryOrder: Feature["category"][] = [
  "コミュニケーション",
  "業務支援",
  "管理・運用",
  "デモ・資料",
];

export default async function FeaturesPage() {
  const session = await getServerSession();
  const showMvgAdmin = await isMvgAdmin(session?.name);
  const showGoalAssignments = canApprove(session);
  const showAccountsAdmin = isGoalAdmin(session);
  const showMastersAdmin = canApprove(session);
  const showEvaluationAdmin =
    session?.permissionId === "admin" || session?.permissionId === "hr_manager";

  const grouped = categoryOrder.map((category) => ({
    category,
    items: features.filter((f) => f.category === category),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">
            機能一覧
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            必要な機能のカードを選択して、各画面へ移動できます。
          </p>
        </div>

        {grouped.map(({ category, items }) => (
          <section key={category} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                {category}
              </h2>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((feature) => {
                const card = (
                  <div
                    className={`group h-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 ${
                      feature.href
                        ? "hover:shadow-lg hover:-translate-y-1 hover:border-emerald-300 cursor-pointer"
                        : "opacity-60"
                    }`}
                  >
                    <div className="p-5 h-full flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-12 h-12 rounded-xl ${feature.bgLight} flex items-center justify-center flex-shrink-0 border border-white shadow-sm`}
                          >
                            <span className={`text-sm font-black ${feature.color}`}>
                              {feature.icon}
                            </span>
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-gray-800 leading-tight">
                              {feature.title}
                            </h3>
                            <span className="text-[10px] font-mono font-bold text-gray-400">
                              {feature.label}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusStyle[feature.status]}`}
                        >
                          {feature.status}
                        </span>
                      </div>

                      <p className="mt-4 text-xs text-gray-500 leading-relaxed flex-1">
                        {feature.desc}
                      </p>

                      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                        <div className="flex gap-1.5 flex-wrap">
                          {feature.tags.slice(0, 2).map((t) => (
                            <span
                              key={t}
                              className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-medium"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        {feature.href ? (
                          <span className="text-xs font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            開く →
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );

                return feature.href ? (
                  <Link
                    key={feature.id}
                    href={feature.href}
                    className="block"
                    {...(feature.id === "tasks" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {card}
                  </Link>
                ) : (
                  <div key={feature.id}>{card}</div>
                );
              })}

              {category === "管理・運用" && showAccountsAdmin ? (
                <Link href="/settings/accounts" className="block">
                  <div className="group h-full bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-slate-300 cursor-pointer">
                    <div className="p-5 h-full flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0 border border-white shadow-sm">
                            <span className="text-sm font-black text-slate-700">
                              権限
                            </span>
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-gray-800 leading-tight">
                              アカウント管理
                            </h3>
                            <span className="text-[10px] font-mono font-bold text-gray-400">
                              ADMIN
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                          管理者
                        </span>
                      </div>

                      <p className="mt-4 text-xs text-gray-500 leading-relaxed flex-1">
                        アカウントごとの権限（システム管理者・人事管理者など）を設定します。
                        管理者権限のあるアカウントは全スタッフの目標シートを閲覧・承認できます。
                      </p>

                      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex gap-1.5 flex-wrap">
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-1 rounded-md font-medium">
                            権限設定
                          </span>
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded-md font-medium">
                            一時差戻の元権限
                          </span>
                        </div>
                        <span className="text-xs font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          開く →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ) : null}

              {category === "管理・運用" && showAccountsAdmin ? (
                <Link href="/settings/sheet-templates" className="block">
                  <div className="group h-full bg-gradient-to-br from-violet-50 to-white rounded-2xl border border-violet-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-violet-300 cursor-pointer">
                    <div className="p-5 h-full flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0 border border-white shadow-sm">
                            <span className="text-sm font-black text-violet-700">
                              雛形
                            </span>
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-gray-800 leading-tight">
                              シートテンプレート設定
                            </h3>
                            <span className="text-[10px] font-mono font-bold text-gray-400">
                              TEMPLATE
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-violet-100 text-violet-700 border-violet-200">
                          管理者
                        </span>
                      </div>

                      <p className="mt-4 text-xs text-gray-500 leading-relaxed flex-1">
                        定量・定性シートの各項目について、入力該当者（設定者/承認者）と
                        入力タイミング（提出時・進捗・結果・承認時）を設定します。
                        設定したタイミング以外の項目はシート上でロックされます。
                      </p>

                      <div className="mt-4 pt-4 border-t border-violet-100 flex items-center justify-between">
                        <div className="flex gap-1.5 flex-wrap">
                          <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-1 rounded-md font-medium">
                            入力タイミング設定
                          </span>
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-1 rounded-md font-medium">
                            項目ロック制御
                          </span>
                        </div>
                        <span className="text-xs font-bold text-violet-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          開く →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ) : null}

              {category === "管理・運用" && showMastersAdmin ? (
                <Link href="/settings/masters" className="block">
                  <div className="group h-full bg-gradient-to-br from-amber-50 to-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-amber-300 cursor-pointer">
                    <div className="p-5 h-full flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 border border-white shadow-sm">
                            <span className="text-sm font-black text-amber-700">
                              設定
                            </span>
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-gray-800 leading-tight">
                              マスター管理
                            </h3>
                            <span className="text-[10px] font-mono font-bold text-gray-400">
                              MSTR
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
                          管理者・人事管理者向け
                        </span>
                      </div>

                      <p className="mt-4 text-xs text-gray-500 leading-relaxed flex-1">
                        スタッフ登録で使用する所属先・役職・等級/グレード・職種・雇用形態の選択肢を管理します。
                      </p>

                      <div className="mt-4 pt-4 border-t border-amber-100 flex items-center justify-between">
                        <div className="flex gap-1.5 flex-wrap">
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded-md font-medium">
                            マスター
                          </span>
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-medium">
                            選択肢
                          </span>
                        </div>
                        <span className="text-xs font-bold text-amber-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          開く →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ) : null}

              {category === "管理・運用" && showGoalAssignments ? (
                <Link href="/approvals/goal-assignments" className="block">
                  <div className="group h-full bg-gradient-to-br from-lime-50 to-white rounded-2xl border border-lime-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-lime-300 cursor-pointer">
                    <div className="p-5 h-full flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-lime-100 flex items-center justify-center flex-shrink-0 border border-white shadow-sm">
                            <span className="text-sm font-black text-lime-700">
                              割当
                            </span>
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-gray-800 leading-tight">
                              承認者割り当て
                            </h3>
                            <span className="text-[10px] font-mono font-bold text-gray-400">
                              ASSIGN
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-lime-100 text-lime-700 border-lime-200">
                          管理者
                        </span>
                      </div>

                      <p className="mt-4 text-xs text-gray-500 leading-relaxed flex-1">
                        対象期間と提出ファイル（定量・定性目標）を指定し、記入者ごとに一次承認者・二次承認者を設定します。
                      </p>

                      <div className="mt-4 pt-4 border-t border-lime-100 flex items-center justify-between">
                        <div className="flex gap-1.5 flex-wrap">
                          <span className="text-[10px] bg-lime-100 text-lime-700 px-2 py-1 rounded-md font-medium">
                            一次・二次承認
                          </span>
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-medium">
                            権限者のみ
                          </span>
                        </div>
                        <span className="text-xs font-bold text-lime-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          開く →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ) : null}

              {category === "コミュニケーション" && showMvgAdmin ? (
                <Link href="/mvg/admin" className="block">
                  <div className="group h-full bg-gradient-to-br from-rose-50 to-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-rose-300 cursor-pointer">
                    <div className="p-5 h-full flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0 border border-white shadow-sm">
                            <span className="text-sm font-black text-rose-600">
                              集計
                            </span>
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-gray-800 leading-tight">
                              MVG 集計管理
                            </h3>
                            <span className="text-[10px] font-mono font-bold text-gray-400">
                              ADMIN
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-rose-100 text-rose-700 border-rose-200">
                          管理者
                        </span>
                      </div>

                      <p className="mt-4 text-xs text-gray-500 leading-relaxed flex-1">
                        MVGの対象期間・参加者を作成・編集し、投票ランキングを確認できます。
                      </p>

                      <div className="mt-4 pt-4 border-t border-rose-100 flex items-center justify-between">
                        <div className="flex gap-1.5 flex-wrap">
                          <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-1 rounded-md font-medium">
                            集計
                          </span>
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-medium">
                            権限者のみ
                          </span>
                        </div>
                        <span className="text-xs font-bold text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          開く →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ) : null}

              {category === "管理・運用" && showEvaluationAdmin ? (
                <Link href="/evaluations" className="block">
                  <div className="group h-full bg-gradient-to-br from-cyan-50 to-white rounded-2xl border border-cyan-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-cyan-300 cursor-pointer">
                    <div className="p-5 h-full flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0 border border-white shadow-sm">
                            <span className="text-sm font-black text-cyan-700">
                              評価
                            </span>
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-gray-800 leading-tight">
                              人事評価管理
                            </h3>
                            <span className="text-[10px] font-mono font-bold text-gray-400">
                              EVAL
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-cyan-100 text-cyan-700 border-cyan-200">
                          管理者・人事管理者向け
                        </span>
                      </div>

                      <p className="mt-4 text-xs text-gray-500 leading-relaxed flex-1">
                        定量・定性目標の結果から人事評価を自動算出し、確認・手動修正のうえ確定します。
                        獲得ランク（S〜E）に応じた号俸ポイントから基本給を算出し、月給改定を確定できます。
                      </p>

                      <div className="mt-4 pt-4 border-t border-cyan-100 flex items-center justify-between">
                        <div className="flex gap-1.5 flex-wrap">
                          <span className="text-[10px] bg-cyan-100 text-cyan-700 px-2 py-1 rounded-md font-medium">
                            自動算出
                          </span>
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-medium">
                            権限者のみ
                          </span>
                        </div>
                        <span className="text-xs font-bold text-cyan-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          開く →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ) : null}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

import Link from "next/link";
import { getServerSession } from "@/lib/goalNavigatorStore";
import { isGoalAdmin } from "@/lib/goalAccess";
import { getSheetTemplateAction } from "@/lib/sheetTemplateActions";
import SheetTemplateEditor from "./SheetTemplateEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SheetTemplatesPage() {
  const session = await getServerSession();

  if (!session || !isGoalAdmin(session)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <p className="text-base font-bold text-gray-700">アクセス権限がありません</p>
            <p className="mt-2 text-sm text-gray-500">
              シートテンプレート設定は管理者（admin / 人事管理者）のみ利用できます。
            </p>
            <Link
              href="/features"
              className="mt-4 inline-flex rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              機能一覧へ戻る
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const template = await getSheetTemplateAction();

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h1 className="text-lg font-bold text-gray-800">シートテンプレート設定</h1>
          <p className="mt-1 text-sm text-gray-500">
            定量・定性シートの各入力項目について、「入力該当者（設定者/承認者）」と「入力タイミング」を設定できます。
          </p>
          <ul className="mt-2 space-y-1 text-xs text-gray-500">
            <li>・設定者: 提出時入力 / 進捗入力 / 結果入力 のいずれか</li>
            <li>・承認者: 承認時に入力 / 結果入力 のいずれか</li>
            <li>・設定したタイミング以外では、その項目はロックされます（一時差戻中は全項目編集可）</li>
          </ul>
        </div>

        <SheetTemplateEditor template={template} />
      </main>
    </div>
  );
}

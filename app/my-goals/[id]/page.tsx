import Link from "next/link";
import RecordStatusBadge from "@/components/goal-navigator/RecordStatusBadge";
import OwnerSheetEditor from "@/components/goal-navigator/OwnerSheetEditor";
import { getNavigatorRecordDetail } from "@/lib/goalNavigatorActions";
import { getSheetTemplateAction } from "@/lib/sheetTemplateActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MyGoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getNavigatorRecordDetail(id);

  if (!result.ok || !result.isOwner) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-500">{result.ok ? "この目標設定を編集する権限がありません" : result.message}</p>
            <Link
              href="/my-goals"
              className="mt-4 inline-flex rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              履歴一覧へ戻る
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { record } = result;
  const a = record.answers || {};
  const template = await getSheetTemplateAction();

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link href="/my-goals" className="text-xs font-bold text-gray-500 hover:text-emerald-600 transition">
                ← 過去の目標履歴
              </Link>
            </div>
            <h1 className="text-lg font-bold text-gray-800">{record.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">{record.kind === "quantitative" ? "定量目標" : "定性目標"} · {record.department}</span>
              <RecordStatusBadge status={record.status} />
            </div>
          </div>
        </div>

        {record.tempEdit ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
            <span className="inline-block rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-white">
              一時差戻中（編集許可）
            </span>
            <p className="mt-2 text-xs text-amber-800">
              管理者（{record.tempEdit.byName}）により編集が許可されています。
              {record.tempEdit.reason ? ` 理由: ${record.tempEdit.reason}` : ""}
              編集した箇所は赤字で記録されます。
            </p>
          </div>
        ) : null}

        <OwnerSheetEditor
          recordId={record.id}
          kind={record.kind}
          status={record.status}
          initialAnswers={record.answers}
          profile={{
            name: record.employeeName,
            stage: a.stage,
            department: record.department,
            grade: a.grade,
          }}
          tempEditActive={Boolean(record.tempEdit)}
          fieldEdits={record.fieldEdits}
          template={template}
        />
      </main>
    </div>
  );
}

import Link from "next/link";
import RecordStatusBadge from "@/components/goal-navigator/RecordStatusBadge";
import ReviewDecisionPanel from "@/components/goal-navigator/ReviewDecisionPanel";
import ProgressPanel from "@/components/goal-navigator/ProgressPanel";
import ItemCommentPanel from "@/components/goal-navigator/ItemCommentPanel";
import ApproverSheetEditor from "@/components/goal-navigator/ApproverSheetEditor";
import TempEditPanel from "@/components/goal-navigator/TempEditPanel";
import { getNavigatorRecordDetail } from "@/lib/goalNavigatorActions";
import { getSheetTemplateAction } from "@/lib/sheetTemplateActions";
import { getStaff } from "@/lib/staffServerStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}





export default async function GoalNavigatorApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getNavigatorRecordDetail(id);

  if (!result.ok) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-500">{result.message}</p>
            <Link
              href="/approvals/goal-navigators"
              className="mt-4 inline-flex rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              承認一覧へ戻る
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { record, canApprove, isOwner, isAdmin } = result;
  const template = await getSheetTemplateAction();

  // 提出者のステージ・グレードを補完（シートの表示用。answersに保存されていない値を補う）
  // 定量シート：ステージ＝staff.grade、グレード＝staff.position
  // 定性シート：グレード＝answers.grade || staff.grade（能力項目の絞り込みにも使用）
  let staffStage = "";
  let staffPosition = "";
  let staffGrade = "";
  if (record.employeeId) {
    try {
      const staff = await getStaff(record.employeeId);
      if (staff) {
        staffStage = staff.grade || "";
        staffPosition = staff.position || "";
        staffGrade = staff.grade || "";
      }
    } catch {
      // 取得失敗時は空のまま
    }
  }
  const sheetProfile =
    record.kind === "quantitative"
      ? {
          name: record.answers.name || record.employeeName,
          stage: staffStage,
          grade: staffPosition,
          department: record.department,
        }
      : {
          name: record.answers.name || record.employeeName,
          department: record.answers.department || record.department,
          grade: record.answers.grade || staffGrade,
        };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <div>
          <Link
            href="/approvals/goal-navigators"
            className="inline-flex items-center gap-1 text-sm font-bold text-gray-500 transition hover:text-gray-700"
          >
            ← 承認一覧へ戻る
          </Link>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-gray-800">{record.title}</h1>
            <RecordStatusBadge status={record.status} />
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                record.kind === "quantitative"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-indigo-50 text-indigo-700"
              }`}
            >
              {record.kind === "quantitative" ? "目標設定" : "定性目標"}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            {record.employeeName} / {record.department}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-400">
            <span>提出日 {formatDate(record.submittedAt || record.updatedAt)}</span>
            {record.approvedAt ? <span>承認日 {formatDate(record.approvedAt)}</span> : null}
            {record.approvedBy ? <span>承認者 {record.approvedBy}</span> : null}
          </div>
        </div>

        {record.reviewComment ? (
          <div
            className={`rounded-2xl border p-5 shadow-sm ${
              record.status === "rejected"
                ? "border-rose-200 bg-rose-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <p
              className={`text-sm font-bold ${
                record.status === "rejected" ? "text-rose-700" : "text-emerald-700"
              }`}
            >
              {record.status === "rejected" ? "やり直し依頼コメント" : "承認コメント"}
              {record.reviewedBy ? `（${record.reviewedBy}）` : ""}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
              {record.reviewComment}
            </p>
            {record.reviewedAt ? (
              <p className="mt-2 text-xs text-gray-400">{formatDate(record.reviewedAt)}</p>
            ) : null}
          </div>
        ) : null}

        {/* 管理者のみ: 承認済みシートへの一時差戻（編集許可）操作 */}
        {isAdmin && record.status === "approved" ? (
          <TempEditPanel recordId={record.id} tempEdit={record.tempEdit ?? null} />
        ) : record.tempEdit ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
            <span className="inline-block rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-white">
              一時差戻中（編集許可）
            </span>
            <p className="mt-2 text-xs text-amber-800">
              管理者により編集が許可されています。編集した箇所は赤字で記録されます。
            </p>
          </div>
        ) : null}

        <ApproverSheetEditor
          recordId={record.id}
          kind={record.kind}
          status={record.status}
          initialAnswers={record.answers}
          isOwner={isOwner}
          isApprover={canApprove}
          profile={sheetProfile}
          tempEditActive={Boolean(record.tempEdit)}
          fieldEdits={record.fieldEdits}
          template={template}
        />

        {canApprove ? <ReviewDecisionPanel recordId={record.id} status={record.status} /> : null}

        <ItemCommentPanel
          recordId={record.id}
          comments={record.itemComments ?? []}
          canApprove={canApprove}
          goals={[
            {
              target: "company",
              label: "① 全社定量目標",
              item: record.answers.company_item,
              deadline: record.answers.company_deadline,
              value: record.answers.company_value,
              progress: record.answers.company_progress,
              result: record.answers.company_result,
            },
            {
              target: "team",
              label: "② チーム定量目標",
              item: record.answers.team_item,
              deadline: record.answers.team_deadline,
              value: record.answers.team_value,
              progress: record.answers.team_progress,
              result: record.answers.team_result,
            },
            {
              target: "personal",
              label: "③ 個人定量目標",
              item: record.answers.personal_item,
              deadline: record.answers.personal_deadline,
              value: record.answers.personal_value,
              progress: record.answers.personal_progress,
              result: record.answers.personal_result,
            },
          ]}
        />

        <ProgressPanel
          recordId={record.id}
          updates={record.progressUpdates ?? []}
          canWrite={isOwner || canApprove}
          canReply={isOwner || canApprove}
        />
      </main>
    </div>
  );
}

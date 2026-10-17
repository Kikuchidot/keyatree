"use client";

import { useState, useTransition } from "react";
import QuantitativeSheet from "@/components/goal-navigator/QuantitativeSheet";
import QualitativeSheet from "@/components/goal-navigator/QualitativeSheet";
import {
  updateNavigatorAnswersAction,
  updateOwnNavigatorAnswersAction,
} from "@/lib/goalNavigatorActions";
import {
  ROLE_LABELS,
  TIMING_LABELS,
  type SheetTemplate,
} from "@/lib/sheetTemplate";
import type { FieldEdit, NavigatorKind, RecordStatus } from "@/lib/goalNavigatorStore";

type EditorPhase = "progress" | "result" | "approval";

const PHASE_LABELS: Record<EditorPhase, string> = {
  progress: "進捗入力",
  result: "結果入力",
  approval: "承認時入力",
};

/**
 * 承認詳細ページで、提出内容を提出時と同一のシート形式で表示する。
 * テンプレート設定がある場合:
 * - 提出者は「進捗入力」「結果入力」で設定者担当の該当タイミング項目を編集
 * - 承認者は「承認時入力」「結果入力」で承認者担当の項目を編集
 * tempEditActive の間は全項目が編集可能で、編集箇所は fieldEdits に基づき赤字表示される。
 */
export default function ApproverSheetEditor({
  recordId,
  kind,
  status,
  initialAnswers,
  isOwner,
  isApprover,
  profile,
  tempEditActive = false,
  fieldEdits,
  template,
}: {
  recordId: string;
  kind: NavigatorKind;
  status: RecordStatus;
  initialAnswers: Record<string, string>;
  isOwner: boolean;
  isApprover: boolean;
  profile: { name?: string; stage?: string; department?: string; grade?: string };
  tempEditActive?: boolean;
  fieldEdits?: Record<string, FieldEdit>;
  template?: SheetTemplate;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers || {});
  const [editing, setEditing] = useState(false);
  const [phase, setPhase] = useState<EditorPhase>(isApprover ? "approval" : "progress");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const editable = isOwner || isApprover;
  const disabled = !editing;
  const useTemplate = Boolean(template) && !tempEditActive;

  // 承認済み（一時差戻なし）は進捗入力・結果入力のみ（承認時入力項目は確定済み）
  const approvedLocked = status === "approved" && !tempEditActive;

  const availablePhases: EditorPhase[] = isApprover
    ? approvedLocked
      ? ["result"]
      : ["approval", "result"]
    : approvedLocked
      ? ["progress", "result"]
      : ["progress", "result"];

  const isFieldLocked = (key: string): boolean => {
    if (!useTemplate || !template) return false;
    const cfg = template[kind]?.[key];
    if (!cfg) return false;
    const expectedRole = isApprover ? "approver" : "owner";
    return !(cfg.role === expectedRole && cfg.timing === phase);
  };

  const fieldNote = (key: string): string | undefined => {
    if (!useTemplate || !template) return undefined;
    const cfg = template[kind]?.[key];
    if (!cfg) return undefined;
    if (isApprover && cfg.role === "owner") {
      return `${ROLE_LABELS.owner}入力（${TIMING_LABELS[cfg.timing]}）`;
    }
    if (!isApprover && cfg.role === "approver") {
      return `${ROLE_LABELS.approver}入力（${TIMING_LABELS[cfg.timing]}）`;
    }
    return undefined;
  };

  const onChange = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const save = () => {
    setError("");
    setNotice("");
    startTransition(async () => {
      const res = isApprover
        ? await updateNavigatorAnswersAction(recordId, answers)
        : await updateOwnNavigatorAnswersAction(recordId, answers);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditing(false);
      setNotice("入力内容を保存しました");
      window.setTimeout(() => setNotice(""), 2500);
    });
  };

  const cancel = () => {
    setAnswers(initialAnswers || {});
    setEditing(false);
    setError("");
  };

  const startEdit = (nextPhase: EditorPhase) => {
    setPhase(nextPhase);
    setEditing(true);
  };

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-gray-800">入力内容</h2>
        {editable ? (
          editing ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={isPending}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "保存中..." : "保存"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availablePhases.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => startEdit(p)}
                  className={`rounded-xl px-5 py-2 text-sm font-bold text-white transition ${
                    p === "approval"
                      ? "bg-amber-500 hover:bg-amber-600"
                      : p === "progress"
                        ? "bg-emerald-500 hover:bg-emerald-600"
                        : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {PHASE_LABELS[p]}
                </button>
              ))}
            </div>
          )
        ) : null}
      </div>

      {editing && useTemplate && availablePhases.length > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
          <span className="text-xs font-bold text-indigo-700">入力タイミング:</span>
          {availablePhases.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPhase(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold border transition ${
                phase === p
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-indigo-700 border-indigo-200 hover:border-indigo-400"
              }`}
            >
              {PHASE_LABELS[p]}
            </button>
          ))}
          <span className="text-[10px] font-bold text-indigo-400">
            {isApprover ? "承認者担当の項目" : "設定者担当の項目"}が編集できます
          </span>
        </div>
      ) : null}

      {editing ? (
        <p className="mt-2 text-xs font-bold text-amber-600">
          {tempEditActive
            ? "一時差戻中：全項目を編集できます。保存すると編集箇所は赤字で記録されます。"
            : useTemplate
              ? "テンプレート設定により、選んだ入力タイミングの項目のみ編集できます。"
              : status === "approved"
                ? "編集中：進捗数値・結果数値のみ保存できます。全項目を編集するには管理者による一時差戻が必要です。"
                : "編集中：シートの内容を修正できます。保存すると上書きされます（ステータスは変わりません）。"}
        </p>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="mt-4">
        {kind === "quantitative" ? (
          <QuantitativeSheet
            answers={answers}
            onChange={onChange}
            disabled={disabled}
            profile={{ name: profile.name, stage: profile.stage, grade: profile.grade }}
            fieldEdits={fieldEdits}
            isFieldLocked={isFieldLocked}
            fieldNote={fieldNote}
          />
        ) : (
          <QualitativeSheet
            answers={answers}
            onChange={onChange}
            disabled={disabled}
            profile={{ name: profile.name, department: profile.department, grade: profile.grade }}
            fieldEdits={fieldEdits}
            isFieldLocked={isFieldLocked}
            fieldNote={fieldNote}
          />
        )}
      </div>
    </div>
  );
}

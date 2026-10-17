"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import QuantitativeSheet from "@/components/goal-navigator/QuantitativeSheet";
import QualitativeSheet from "@/components/goal-navigator/QualitativeSheet";
import { updateOwnNavigatorAnswersAction } from "@/lib/goalNavigatorActions";
import {
  ROLE_LABELS,
  TIMING_LABELS,
  type SheetTemplate,
} from "@/lib/sheetTemplate";
import type { FieldEdit, NavigatorKind, RecordStatus } from "@/lib/goalNavigatorStore";

type OwnerPhase = "submit" | "progress" | "result";

const PHASE_LABELS: Record<OwnerPhase, string> = {
  submit: "提出時入力",
  progress: "進捗入力",
  result: "結果入力",
};

export default function OwnerSheetEditor({
  recordId,
  kind,
  status = "draft",
  initialAnswers,
  profile,
  tempEditActive = false,
  fieldEdits,
  template,
}: {
  recordId: string;
  kind: NavigatorKind;
  status?: RecordStatus;
  initialAnswers: Record<string, string>;
  profile: { name?: string; stage?: string; department?: string; grade?: string };
  tempEditActive?: boolean;
  fieldEdits?: Record<string, FieldEdit>;
  template?: SheetTemplate;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers || {});
  const [editing, setEditing] = useState(true);
  const [phase, setPhase] = useState<OwnerPhase>(status === "draft" ? "submit" : "progress");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // テンプレートが無い（または一時差戻中）場合は従来どおり全項目編集可
  const useTemplate = Boolean(template) && !tempEditActive;

  const isFieldLocked = (key: string): boolean => {
    if (!useTemplate || !template) return false;
    const cfg = template[kind]?.[key];
    if (!cfg) return false;
    return !(cfg.role === "owner" && cfg.timing === phase);
  };

  const fieldNote = (key: string): string | undefined => {
    if (!useTemplate || !template) return undefined;
    const cfg = template[kind]?.[key];
    if (!cfg) return undefined;
    if (cfg.role === "approver") {
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
      const res = await updateOwnNavigatorAnswersAction(recordId, answers);
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

  const startEdit = (nextPhase: OwnerPhase) => {
    setPhase(nextPhase);
    setEditing(true);
  };

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/my-goals"
            className="text-xs font-bold text-gray-500 hover:text-emerald-600 transition"
          >
            ← 履歴一覧に戻る
          </Link>
          <h2 className="text-base font-bold text-gray-800">目標設定シート</h2>
        </div>
        {editing ? (
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
        ) : useTemplate ? (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PHASE_LABELS) as OwnerPhase[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => startEdit(p)}
                className={`rounded-xl px-5 py-2 text-sm font-bold text-white transition ${
                  p === "submit" ? "bg-emerald-600 hover:bg-emerald-700" : p === "progress" ? "bg-amber-500 hover:bg-amber-600" : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {PHASE_LABELS[p]}を入力
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-amber-600"
          >
            編集する
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {tempEditActive
          ? "一時差戻中: 全項目を編集できます。編集した箇所は赤字で記録されます。"
          : useTemplate
            ? "入力タイミングを選んで編集できます。テンプレート設定により、選んだタイミング以外の項目はロックされます。"
            : "提出済みの目標シートを編集できます。保存すると最新の内容が反映されます。"}
      </p>

      {editing && useTemplate ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
          <span className="text-xs font-bold text-indigo-700">入力タイミング:</span>
          {(Object.keys(PHASE_LABELS) as OwnerPhase[]).map((p) => (
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
        </div>
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
            disabled={!editing}
            profile={{ name: profile.name, stage: profile.stage, grade: profile.grade }}
            fieldEdits={fieldEdits}
            isFieldLocked={isFieldLocked}
            fieldNote={fieldNote}
          />
        ) : (
          <QualitativeSheet
            answers={answers}
            onChange={onChange}
            disabled={!editing}
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

"use client";

import { useState, useTransition } from "react";
import { setTempEditAction } from "@/lib/goalNavigatorActions";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/**
 * 承認済みシートへの「一時差戻（編集許可）」操作パネル。管理者のみ表示する。
 * 発行すると設定者・承認者が全項目を編集でき、編集箇所は赤枠・赤字で残る。
 */
export default function TempEditPanel({
  recordId,
  tempEdit,
}: {
  recordId: string;
  tempEdit?: { byName: string; at: string; reason?: string } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [showReason, setShowReason] = useState(false);

  if (tempEdit) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-block rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-white">
            一時差戻中（編集許可）
          </span>
          <p className="flex-1 min-w-[200px] text-xs text-amber-800">
            {tempEdit.byName} が {formatDateTime(tempEdit.at)} に編集を許可しました。
            {tempEdit.reason ? ` 理由: ${tempEdit.reason}` : ""}
            編集した箇所は赤字で記録されます。
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await setTempEditAction(recordId, false);
                if (!res.ok) setError(res.message || "解除に失敗しました");
              })
            }
            className="rounded-full border border-amber-400 bg-white px-4 py-1.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
          >
            編集を終了してロック
          </button>
        </div>
        {error ? <p className="mt-2 text-xs font-bold text-rose-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
      {showReason ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-bold text-gray-600">
              一時差戻の理由（設定者への連絡事項など）
            </span>
            <input
              type="text"
              id="temp-edit-reason"
              name="temp-edit-reason"
              placeholder="例: 数字の訂正のため一時的に編集を許可します"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const el = e.currentTarget;
                  startTransition(async () => {
                    const res = await setTempEditAction(recordId, true, el.value || undefined);
                    if (!res.ok) setError(res.message || "発行に失敗しました");
                  });
                }
              }}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const input = document.getElementById(
                    "temp-edit-reason"
                  ) as HTMLInputElement | null;
                  const res = await setTempEditAction(
                    recordId,
                    true,
                    input?.value || undefined
                  );
                  if (!res.ok) setError(res.message || "発行に失敗しました");
                })
              }
              className="rounded-full bg-amber-500 px-5 py-2 text-xs font-black text-white transition hover:bg-amber-600 disabled:opacity-50"
            >
              一時差戻を発行する
            </button>
            <button
              type="button"
              onClick={() => setShowReason(false)}
              className="text-xs font-bold text-gray-500 hover:text-gray-700"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[200px] text-xs text-gray-500">
            設定者からの依頼などで、承認済みシートを一時的に編集可能にできます。
            編集された箇所は赤字で記録されます。
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowReason(true)}
            className="rounded-full border border-amber-400 bg-amber-50 px-4 py-1.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
          >
            一時差戻（編集許可）
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-xs font-bold text-rose-600">{error}</p> : null}
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  getApproverNotificationsAction,
  type ApprovalNotification,
} from "@/lib/goalAssignmentActions";

const KIND_LABEL: Record<string, string> = {
  quantitative: "定量目標",
  qualitative: "定性目標",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

export default function ApprovalNoticePanel({ employeeId }: { employeeId: string }) {
  const [items, setItems] = useState<ApprovalNotification[] | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await getApproverNotificationsAction();
      if (!res.ok) {
        setItems([]);
        return;
      }
      setItems(res.notifications);
    });
  }, [employeeId]);

  // 通知が無いときはパネル自体を出さない
  if (!items || items.length === 0) return null;

  return (
    <section className="bg-amber-50 border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-amber-100 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <h2 className="text-sm font-black text-amber-800">
          承認依頼が届いています（{items.length}件）
        </h2>
      </div>
      <ul className="divide-y divide-amber-100">
        {items.map((n) => (
          <li key={n.recordId} className="px-5 py-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-bold text-gray-800">
                {n.employeeName}さんから{KIND_LABEL[n.kind] ?? "目標"}
                のシートの入力が完了しました！確認対応してください
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {n.title} ・ 提出日時 {formatDateTime(n.submittedAt)}
              </p>
            </div>
            <Link
              href={`/approvals/goal-navigators/${n.recordId}`}
              className="text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-full px-4 py-2 transition whitespace-nowrap"
            >
              シートを確認する
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

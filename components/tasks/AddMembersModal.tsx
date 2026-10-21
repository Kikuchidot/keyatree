"use client";

import { useEffect, useState } from "react";
import MemberPicker from "@/components/tasks/MemberPicker";

export default function AddMembersModal({
  title,
  existingIds,
  candidates,
  onClose,
  onSubmit,
}: {
  title: string;
  existingIds: string[];
  candidates?: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (picked: { id: string; name: string }[]) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // candidates が渡されない場合は、/api/staff から取得する（MemberPicker 内で自動取得）
  const [source, setSource] = useState<{ id: string; name: string }[]>(candidates ?? []);

  useEffect(() => {
    if (candidates) {
      setSource(candidates);
      return;
    }
    let alive = true;
    fetch("/api/staff")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const staff = (d?.staff ?? []) as { id: string; name: string }[];
        if (Array.isArray(staff) && staff.length > 0) {
          setSource(staff.map((s) => ({ id: s.id, name: s.name })));
        }
      })
      .catch(() => {
        /* keep empty */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    const picked = selected.map((id) => {
      const c = source.find((x) => x.id === id);
      return { id, name: c?.name ?? id };
    });
    await onSubmit(picked);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-base">{title}</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          <MemberPicker
            selectedIds={selected}
            onChange={setSelected}
            excludeIds={existingIds}
            candidates={candidates}
          />
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">キャンセル</button>
          <button onClick={submit} disabled={saving || selected.length === 0} className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition disabled:opacity-60">
            {saving ? "追加中..." : "追加する"}
          </button>
        </div>
      </div>
    </div>
  );
}

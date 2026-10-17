"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ROLE_LABELS,
  SHEET_FIELD_DEFS,
  TIMING_LABELS,
  timingsForRole,
  type SheetFieldConfig,
  type SheetFieldRole,
  type SheetFieldTiming,
  type SheetTemplate,
} from "@/lib/sheetTemplate";
import {
  resetSheetTemplateAction,
  saveSheetTemplateAction,
} from "@/lib/sheetTemplateActions";
import type { NavigatorKind } from "@/lib/goalNavigatorStore";

const KIND_LABELS: Record<NavigatorKind, string> = {
  quantitative: "定量目標シート",
  qualitative: "定性目標シート",
};

export default function SheetTemplateEditor({ template }: { template: SheetTemplate }) {
  const [kind, setKind] = useState<NavigatorKind>("quantitative");
  const [configs, setConfigs] = useState<SheetTemplate>(template);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sections = useMemo(() => {
    const map: Record<string, typeof SHEET_FIELD_DEFS[NavigatorKind]> = {};
    for (const def of SHEET_FIELD_DEFS[kind]) {
      if (!map[def.section]) map[def.section] = [];
      map[def.section].push(def);
    }
    return Object.entries(map);
  }, [kind]);

  const setConfig = (key: string, patch: Partial<SheetFieldConfig>) => {
    setConfigs((prev) => {
      const current = prev[kind][key] ?? { role: "owner", timing: "submit" };
      let next: SheetFieldConfig = { ...current, ...patch };
      // 入力該当者を変えた際、タイミングが選択肢になければ最初の選択肢に戻す
      if (!timingsForRole(next.role).includes(next.timing)) {
        next = { ...next, timing: timingsForRole(next.role)[0] };
      }
      return { ...prev, [kind]: { ...prev[kind], [key]: next } };
    });
    setMessage(null);
  };

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await saveSheetTemplateAction(kind, configs[kind]);
      setMessage(res.ok ? "保存しました。全シートに反映されます。" : "エラー: " + res.message);
    });
  };

  const reset = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await resetSheetTemplateAction(kind);
      if (res.ok) {
        window.location.reload();
      } else {
        setMessage("エラー: " + res.message);
      }
    });
  };

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const changedCount = useMemo(() => {
    return SHEET_FIELD_DEFS[kind].filter(
      (def) =>
        configs[kind][def.key] &&
        (configs[kind][def.key].role !== def.config.role ||
          configs[kind][def.key].timing !== def.config.timing)
    ).length;
  }, [configs, kind]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(KIND_LABELS) as NavigatorKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full px-4 py-2 text-sm font-bold border transition ${
                kind === k
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {message ? (
          <div
            className={`mt-4 rounded-xl border p-3 text-sm font-medium ${
              message.startsWith("エラー")
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {message}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            {SHEET_FIELD_DEFS[kind].length} 項目
            {changedCount > 0 ? ` ・ デフォルトから変更: ${changedCount} 件（未保存）` : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={isPending}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
            >
              デフォルトに戻す
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "保存中..." : "保存する"}
            </button>
          </div>
        </div>
      </div>

      {sections.map(([section, defs]) => {
        const open = openSections[section] ?? false;
        return (
          <div key={section} className="rounded-2xl border bg-white shadow-sm">
            <button
              type="button"
              onClick={() => toggleSection(section)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="text-sm font-black text-gray-900">{section}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{defs.length} 項目</span>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-600">
                  {open ? "閉じる" : "開く"}
                </span>
              </span>
            </button>

            {open ? (
              <div className="divide-y divide-gray-100 border-t border-gray-100">
                {defs.map((def) => {
                  const cfg = configs[kind][def.key] ?? def.config;
                  return (
                    <div
                      key={def.key}
                      className="grid grid-cols-1 items-center gap-3 px-5 py-3 sm:grid-cols-[1fr_auto_auto]"
                    >
                      <div>
                        <p className="text-sm font-bold text-gray-800">{def.label}</p>
                        <p className="font-mono text-[10px] text-gray-300">{def.key}</p>
                      </div>
                      <select
                        value={cfg.role}
                        onChange={(e) => setConfig(def.key, { role: e.target.value as SheetFieldRole })}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      >
                        {(Object.keys(ROLE_LABELS) as SheetFieldRole[]).map((r) => (
                          <option key={r} value={r}>
                            入力該当者: {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <select
                        value={cfg.timing}
                        onChange={(e) => setConfig(def.key, { timing: e.target.value as SheetFieldTiming })}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      >
                        {timingsForRole(cfg.role).map((t) => (
                          <option key={t} value={t}>
                            入力タイミング: {TIMING_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="flex justify-center">
        <Link href="/features" className="text-xs font-bold text-gray-500 hover:text-indigo-600 transition">
          ← 機能一覧へ戻る
        </Link>
      </div>
    </div>
  );
}

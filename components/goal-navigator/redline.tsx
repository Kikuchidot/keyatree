import type { FieldEdit } from "@/lib/goalNavigatorStore";

export type FieldEdits = Record<string, FieldEdit>;

export function isEdited(edits: FieldEdits | undefined, key: string): boolean {
  return Boolean(edits && edits[key]);
}

/** 一時差戻中に編集された項目のクラス（赤枠・赤字）。Tailwind v4 の重要修飾子(!)で確実に上書き */
export function redlineCls(
  base: string,
  edits: FieldEdits | undefined,
  key: string
): string {
  return isEdited(edits, key)
    ? `${base} border-rose-400! text-rose-600! bg-rose-50/40!`
    : base;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/** 編集された項目の下に編集者名を表示 */
export function RedlineNote({
  edits,
  fieldKey,
}: {
  edits: FieldEdits | undefined;
  fieldKey: string;
}) {
  const edit = edits?.[fieldKey];
  if (!edit) return null;
  return (
    <p className="mt-0.5 text-[10px] font-bold text-rose-500">
      編集者: {edit.byName || "不明"}
      {edit.at ? `（${formatDate(edit.at)}）` : ""}
    </p>
  );
}

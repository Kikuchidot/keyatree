// マスター選択肢のクライアント側ヘルパー
export type MasterItem = { id: string; label: string; order: number };
export type Masters = Record<string, MasterItem[]>;

/** /api/masters から最新のマスター定義を取得（キャッシュを回避） */
export async function fetchMasters(): Promise<Masters> {
  const res = await fetch(`/api/masters?_t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("マスター取得に失敗しました");
  const data = (await res.json()) as { masters?: Masters };
  return data.masters ?? {};
}

/** 指定カテゴリーの選択肢を並び順で取得 */
export function getMasterItems(masters: Masters, key: string): MasterItem[] {
  return [...(masters[key] ?? [])].sort((a, b) => a.order - b.order);
}

/** 未選択状態を表すブランク選択肢 */
export const BLANK_OPTION: MasterItem = { id: "", label: "－", order: 0 };

export type MasterSelectOption = { value: string; label: string };

/** ドロップダウン用にブランクを先頭に追加した選択肢を返す（value は表示ラベル、未選択は空文字） */
export function masterSelectOptions(masters: Masters, key: string): MasterSelectOption[] {
  return [
    { value: "", label: "－" },
    ...getMasterItems(masters, key).map((item) => ({ value: item.label, label: item.label })),
  ];
}

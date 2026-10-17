"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/goalNavigatorStore";
import { isGoalAdmin } from "@/lib/goalAccess";
import {
  defaultSheetTemplate,
  mergeSheetTemplate,
  type SheetFieldConfig,
  type SheetTemplate,
} from "@/lib/sheetTemplate";
import { getSavedSheetTemplate, saveSavedSheetTemplate } from "@/lib/sheetTemplateStore";
import type { NavigatorKind } from "@/lib/goalNavigatorStore";

/** 全シート共通のテンプレート（デフォルト+保存済みオーバーライド）を返す */
export async function getSheetTemplateAction(): Promise<SheetTemplate> {
  const saved = await getSavedSheetTemplate();
  return mergeSheetTemplate(saved);
}

/** テンプレート設定の保存（管理者のみ）。kind の設定を丸ごと置き換える */
export async function saveSheetTemplateAction(
  kind: NavigatorKind,
  config: Record<string, SheetFieldConfig>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getServerSession();
  if (!session) return { ok: false, message: "ログイン情報を確認できませんでした" };
  if (!isGoalAdmin(session)) {
    return { ok: false, message: "管理者のみテンプレート設定を変更できます" };
  }

  const defaults = defaultSheetTemplate();
  const current = mergeSheetTemplate(await getSavedSheetTemplate());
  const next: SheetTemplate = {
    ...current,
    [kind]: {},
  };

  // 未送信フィールドはデフォルト値、送信分は値を検証して採用
  for (const [key, def] of Object.entries(defaults[kind])) {
    const incoming = config[key];
    if (
      incoming &&
      (incoming.role === "owner" || incoming.role === "approver") &&
      typeof incoming.timing === "string"
    ) {
      next[kind][key] = { role: incoming.role, timing: incoming.timing };
    } else {
      next[kind][key] = { ...def };
    }
  }

  await saveSavedSheetTemplate(next);

  revalidatePath("/settings/sheet-templates");
  revalidatePath("/my-goals");
  revalidatePath("/approvals/goal-navigators");
  return { ok: true };
}

/** テンプレート設定をデフォルトに戻す（管理者のみ） */
export async function resetSheetTemplateAction(
  kind: NavigatorKind
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getServerSession();
  if (!session) return { ok: false, message: "ログイン情報を確認できませんでした" };
  if (!isGoalAdmin(session)) {
    return { ok: false, message: "管理者のみテンプレート設定を変更できます" };
  }

  const defaults = defaultSheetTemplate();
  const current = mergeSheetTemplate(await getSavedSheetTemplate());
  await saveSavedSheetTemplate({ ...current, [kind]: defaults[kind] });

  revalidatePath("/settings/sheet-templates");
  revalidatePath("/my-goals");
  revalidatePath("/approvals/goal-navigators");
  return { ok: true };
}

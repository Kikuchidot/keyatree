import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";
import type { SheetTemplate } from "@/lib/sheetTemplate";

/**
 * シートテンプレート設定（定量・定性シートの入力該当者・入力タイミング）を
 * Supabase Storage に単一 JSON で永続化する。既存ストアと同じバケット方式。
 * env 未設定時はメモリfallback。全端末・全アカウント共有。
 */

const BUCKET = "goal-navigator";
const TEMPLATE_PATH = "templates/sheet-template.json";

const g = globalThis as unknown as { __keyatreeSheetTemplateStore?: SheetTemplate };

let bucketReady = false;
async function ensureBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error && !/exist/i.test(error.message)) {
      throw new Error(`bucket作成に失敗: ${error.message}`);
    }
  }
  bucketReady = true;
}

export async function getSavedSheetTemplate(): Promise<Partial<SheetTemplate> | null> {
  if (!isSupabaseEnabled()) {
    return g.__keyatreeSheetTemplateStore ?? null;
  }
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  const { data, error } = await supabase.storage.from(BUCKET).download(TEMPLATE_PATH);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as Partial<SheetTemplate>;
  } catch {
    return null;
  }
}

export async function saveSavedSheetTemplate(template: SheetTemplate): Promise<void> {
  if (!isSupabaseEnabled()) {
    g.__keyatreeSheetTemplateStore = template;
    return;
  }
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(TEMPLATE_PATH, JSON.stringify(template), {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });
  if (error) throw new Error(error.message);
}

import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

/**
 * マスター管理（所属チーム/役職/ステージ/雇用形態/ブランク）の選択肢を
 * Supabase Storage に単一 JSON として永続化する。staff と同じバケット方式。
 * env 未設定時はメモリfallback（開発用）。全端末・全アカウント共有。
 */

export type MasterItem = { id: string; label: string; order: number };
export type Masters = Record<string, MasterItem[]>;

const BUCKET = "staff";
const MASTERS_PATH = "masters/all.json";

// ---- 初期マスターデータ（未登録時に seed） ----
export const defaultMasters: Masters = {
  department: [
    { id: "d1", label: "クライアントマネジメントチーム", order: 1 },
    { id: "d2", label: "リーシングチーム", order: 2 },
    { id: "d3", label: "カスタマーサポートチーム", order: 3 },
    { id: "d4", label: "カスタマーオペレーションチーム", order: 4 },
    { id: "d5", label: "マーケティングチーム", order: 5 },
    { id: "d6", label: "アカウントチーム", order: 6 },
    { id: "d7", label: "リーシングアシスタントチーム", order: 7 },
  ],
  position: [
    { id: "p1", label: "代表取締役", order: 1 },
    { id: "p2", label: "部長", order: 2 },
    { id: "p3", label: "課長", order: 3 },
    { id: "p4", label: "主任", order: 4 },
    { id: "p5", label: "担当者", order: 5 },
  ],
  grade: [
    { id: "g1", label: "E1", order: 1 },
    { id: "g2", label: "E2", order: 2 },
    { id: "g3", label: "J1", order: 3 },
    { id: "g4", label: "J2", order: 4 },
    { id: "g5", label: "J3", order: 5 },
    { id: "g6", label: "S1", order: 6 },
    { id: "g7", label: "S2", order: 7 },
    { id: "g8", label: "S3", order: 8 },
    { id: "g9", label: "L1", order: 9 },
    { id: "g10", label: "L2", order: 10 },
    { id: "g11", label: "M1", order: 11 },
    { id: "g12", label: "M2", order: 12 },
    { id: "g13", label: "M3", order: 13 },
  ],
  jobType: [
    { id: "j1", label: "営業", order: 1 },
    { id: "j2", label: "管理", order: 2 },
    { id: "j3", label: "物件管理", order: 3 },
    { id: "j4", label: "経営", order: 4 },
    { id: "j5", label: "経理", order: 5 },
    { id: "j6", label: "マーケティング", order: 6 },
  ],
  employmentType: [
    { id: "e1", label: "正社員", order: 1 },
    { id: "e2", label: "契約社員", order: 2 },
    { id: "e3", label: "パートタイム", order: 3 },
    { id: "e4", label: "アルバイト", order: 4 },
    { id: "e5", label: "退職", order: 5 },
  ],
  evaluationRank: [
    { id: "r1", label: "S", order: 1 },
    { id: "r2", label: "A", order: 2 },
    { id: "r3", label: "B", order: 3 },
    { id: "r4", label: "C", order: 4 },
    { id: "r5", label: "D", order: 5 },
    { id: "r6", label: "E", order: 6 },
  ],
  blank: [],
};

// ---- In-memory fallback ----
const g = globalThis as unknown as { __keyatreeMastersStore?: Masters };

// ---- Storage helpers ----
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

export async function getMasters(): Promise<Masters> {
  if (!isSupabaseEnabled()) {
    return g.__keyatreeMastersStore ?? defaultMasters;
  }
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  const { data, error } = await supabase.storage.from(BUCKET).download(MASTERS_PATH);
  if (error || !data) {
    // 未登録なら初期値を保存して返す
    await saveMasters(defaultMasters);
    return defaultMasters;
  }
  try {
    const saved = JSON.parse(await data.text()) as Masters;
    // 後から追加したマスターキー（evaluationRank など）は既定値で補完する
    const merged: Masters = { ...defaultMasters, ...saved };
    for (const key of Object.keys(defaultMasters)) {
      if (!Array.isArray(merged[key])) {
        merged[key] = defaultMasters[key];
        continue;
      }
      // 既存キーでも、既定値に後から追加した項目（例: 雇用形態の「退職」）を補完する
      const labels = new Set(merged[key].map((item) => item.label));
      for (const def of defaultMasters[key]) {
        if (!labels.has(def.label)) {
          merged[key] = [...merged[key], { ...def, id: `${def.id}_auto` }];
        }
      }
    }
    return merged;
  } catch {
    return defaultMasters;
  }
}

export async function saveMasters(masters: Masters): Promise<void> {
  if (!isSupabaseEnabled()) {
    g.__keyatreeMastersStore = masters;
    return;
  }
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  const blob = new Blob([JSON.stringify(masters)], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(MASTERS_PATH, blob, {
    contentType: "application/json",
    cacheControl: "no-cache",
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

/**
 * 指定した employeeId / 名前の定量目標レコードを取得し、
 * タイトル・更新日・提出日・entry_date を一覧出力するデバッグ用スクリプト。
 *
 * 使い方:
 * 1. Vercel Dashboard または `vercel env` から本番の
 *    NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を取得
 * 2. 下記を .env.local に設定（既存値を上書きしないよう別ファイル推奨）
 * 3. node scripts/debug-records.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// 確認対象の設定者名（部分一致）
const TARGET_NAME = process.argv[2] || "古屋";

async function main() {
  const { data: files, error } = await supabase.storage
    .from("goal-navigator")
    .list("records", { limit: 1000 });

  if (error) {
    console.error("list error:", error);
    process.exit(1);
  }

  const jsonFiles = (files || []).filter((f) => f.name.endsWith(".json"));
  const records = [];

  for (const f of jsonFiles) {
    const { data, error: dlErr } = await supabase.storage
      .from("goal-navigator")
      .download(`records/${f.name}`);
    if (dlErr || !data) continue;
    try {
      const record = JSON.parse(await data.text());
      records.push(record);
    } catch {
      // ignore
    }
  }

  // 定量目標 + 名前が一致するレコードを抽出
  const matched = records
    .filter((r) => r.kind === "quantitative")
    .filter((r) =>
      (r.employeeName || "").includes(TARGET_NAME) ||
      (r.answers?.name || "").includes(TARGET_NAME)
    )
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  console.log(`対象: ${TARGET_NAME} / 該当件数: ${matched.length}\n`);

  for (const r of matched) {
    console.log("---");
    console.log("recordId:", r.id);
    console.log("title:", r.title);
    console.log("employeeId:", r.employeeId);
    console.log("employeeName:", r.employeeName);
    console.log("status:", r.status);
    console.log("createdAt:", r.createdAt);
    console.log("updatedAt:", r.updatedAt);
    console.log("submittedAt:", r.submittedAt || "未提出");
    console.log("approvedAt:", r.approvedAt || "未承認");
    console.log("entry_date:", r.answers?.entry_date || "未設定");
    console.log("company_item:", (r.answers?.company_item || "").slice(0, 60));
    console.log("");
  }
}

main();

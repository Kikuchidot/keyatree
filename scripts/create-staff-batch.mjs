import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomBytes } from "crypto";

// .env.local を読み込む
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Supabase env not found"); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = "staff";

// 登録対象（メール, 氏名, 所属チーム）
const ENTRIES = [
  ["y.shimada@365keyaki.onmicrosoft.com", "島田 佳子", "カスタマーオペレーションチーム"],
  ["s.tachikawa@365keyaki.onmicrosoft.com", "立川 里美", "カスタマーオペレーションチーム"],
  ["y.yano@365keyaki.onmicrosoft.com", "矢野 佑里", "カスタマーサポートチーム"],
  ["s.nakamura@365keyaki.onmicrosoft.com", "中村 紫絵", "リーシングチーム"],
  ["y.yui@365keyaki.onmicrosoft.com", "由井 結実", "カスタマーオペレーションチーム"],
  ["f.kagawa@365keyaki.onmicrosoft.com", "加川 文香", "カスタマーオペレーションチーム"],
  ["y.sekine@365keyaki.onmicrosoft.com", "関根 幸恵", "カスタマーオペレーションチーム"],
  ["s.toshikawa@365keyaki.onmicrosoft.com", "利川 さやか", "カスタマーサポートチーム"],
  ["y.kaneko@365keyaki.onmicrosoft.com", "金子 洋子", "カスタマーオペレーションチーム"],
  ["h.matsumoto@365keyaki.onmicrosoft.com", "松本 陽菜", "カスタマーオペレーションチーム"],
  ["n.kanbayashi@365keyaki.onmicrosoft.com", "神林 和香", "カスタマーオペレーションチーム"],
  ["k.suzuki@365keyaki.onmicrosoft.com", "鈴木 かおり", "カスタマーオペレーションチーム"],
  ["y.yoda@365keyaki.onmicrosoft.com", "依田 夕香", "カスタマーオペレーションチーム"],
  ["m.hasebe@365keyaki.onmicrosoft.com", "長谷部 真菜美", "カスタマーオペレーションチーム"],
  ["y.watanabe@365keyaki.onmicrosoft.com", "渡邊 康子", "カスタマーオペレーションチーム"],
  ["h.hara@365keyaki.onmicrosoft.com", "原 ひとみ", "アカウントチーム"],
  ["c.sugiyama@365keyaki.onmicrosoft.com", "杉山 千草", "カスタマーサポートチーム"],
  ["e.kanokohata@365keyaki.onmicrosoft.com", "鹿子畑 江莉", "カスタマーオペレーションチーム"],
  ["y.kashiwagi@365keyaki.onmicrosoft.com", "柏木 有紀子", ""],
  ["m.nonaka@365keyaki.onmicrosoft.com", "野中 真生", "カスタマーオペレーションチーム"],
  ["n.kaneda@365keyaki.onmicrosoft.com", "金田 那津代", "カスタマーオペレーションチーム"],
  ["m.ito@365keyaki.onmicrosoft.com", "伊藤 美保", "カスタマーオペレーションチーム"],
  ["s.miyamoto@365keyaki.onmicrosoft.com", "宮本 零", "アカウントチーム"],
  ["m.iwamoto@365keyaki.onmicrosoft.com", "岩本 美代", "カスタマーオペレーションチーム"],
  ["m.sekiguchi@365keyaki.onmicrosoft.com", "関口 美妃", "カスタマーサポートチーム"],
  ["n.sakuma@365keyaki.onmicrosoft.com", "佐久間 なぎさ", "カスタマーオペレーションチーム"],
  ["i.sakamoto@365keyaki.onmicrosoft.com", "坂本 泉", "カスタマーオペレーションチーム"],
  ["a.kubota@365keyaki.onmicrosoft.com", "窪田 あずさ", "アカウントチーム"],
  ["s.hasegawa@365keyaki.onmicrosoft.com", "長谷川 沙也香", "カスタマーオペレーションチーム"],
  ["a.ikuta@365keyaki.onmicrosoft.com", "生田 彩", "カスタマーサポートチーム"],
  ["t.sato@365keyaki.onmicrosoft.com", "佐藤 寿恵", "カスタマーオペレーションチーム"],
  ["h.koga@365keyaki.onmicrosoft.com", "古賀 葉月", "リーシングアシスタントチーム"],
];

async function getJson(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()); } catch { return null; }
}
async function putJson(path, value) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, JSON.stringify(value), {
    contentType: "application/json", upsert: true,
  });
  if (error) throw new Error(error.message);
}
async function listNames(prefix) {
  const { data } = await supabase.storage.from(BUCKET).list(prefix, { limit: 2000 });
  return (data ?? []).filter((x) => x.name.endsWith(".json"));
}

// 乱数パスワード（英大文字/小文字/数字を含む12桁）
function genPassword() {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnpqrstuvwxyz", D = "23456789";
  const all = U + L + D;
  const pick = (s) => s[randomBytes(1)[0] % s.length];
  let pw = pick(U) + pick(L) + pick(D);
  for (let i = 0; i < 9; i++) pw += pick(all);
  // シャッフル
  return pw.split("").sort(() => (randomBytes(1)[0] % 2 ? 1 : -1)).join("");
}

function normalizeName(n) { return n.replace(/\u3000/g, " ").replace(/\s{2,}/g, " ").trim(); }

function makeEmployee(id, name, team, joinedAt) {
  return {
    id, name: normalizeName(name), nameKana: "", photo: "",
    department: "", team: team || "", position: "担当者", grade: "J1",
    jobType: "管理", employmentType: "正社員", joinedAt,
    evaluationRank: "B", enneagramType: 3, enneagramLabel: "達成者", bio: "",
    skills: [
      { subject: "リーダーシップ", value: 50, fullMark: 100 },
      { subject: "チームワーク", value: 50, fullMark: 100 },
      { subject: "課題分析", value: 50, fullMark: 100 },
      { subject: "提案力", value: 50, fullMark: 100 },
      { subject: "サポート", value: 50, fullMark: 100 },
      { subject: "交渉力", value: 50, fullMark: 100 },
    ],
    goals: [], thanks: [],
    monthlyGoal: {
      month: `${new Date().getFullYear()}年${new Date().getMonth() + 1}月`,
      declaration: "", cheers: 0, comments: [], currentProgress: [],
      lastMonth: { month: "", declaration: "", achieved: false, reflection: "", improvement: "", goalResults: [] },
    },
  };
}

// 既存アカウントのメール一覧
const accFiles = await listNames("accounts");
const existingEmails = new Set();
for (const f of accFiles) {
  const a = await getJson(`accounts/${f.name}`);
  if (a?.email) existingEmails.add(a.email.toLowerCase());
}

const base = Date.now();
const joinedAt = new Date().toISOString().slice(0, 10);
const created = [];
const skipped = [];
let i = 0;
for (const [email, name, team] of ENTRIES) {
  i++;
  if (existingEmails.has(email.toLowerCase())) { skipped.push([name, email, "既存"]); continue; }
  const id = `s_${base + i}`;
  const emp = makeEmployee(id, name, team, joinedAt);
  const password = genPassword();
  const account = {
    id: `acc_${id}`, employeeId: id, name: normalizeName(name), email,
    password, permissionId: "staff", permissionName: "一般社員",
    isActive: true, lastLoginAt: null, createdAt: new Date().toISOString(),
  };
  await putJson(`members/${id}.json`, emp);
  await putJson(`accounts/acc_${id}.json`, account);
  created.push([name, email, password, team]);
  console.log(`✓ ${name} (${email})`);
}

console.log("\n===== 発行済みログイン情報 =====");
console.log("氏名\tメール\tパスワード\t所属チーム");
for (const [name, email, pw, team] of created) console.log(`${name}\t${email}\t${pw}\t${team || "-"}`);
if (skipped.length) {
  console.log("\n----- スキップ（既存アカウント） -----");
  for (const [name, email] of skipped) console.log(`- ${name} (${email})`);
}
console.log(`\n完了: 新規 ${created.length}名 / スキップ ${skipped.length}名`);

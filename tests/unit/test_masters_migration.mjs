/** マスター管理データのマイグレーションロジック単体試験 */
import assert from "node:assert/strict";
import { migrateMastersFile, defaultMasters } from "@/lib/mastersServerStore";

const labels = (masters, key) => (masters[key] ?? []).map((i) => i.label);
const item = (id, label, order) => ({ id, label, order });

// ---- ① 本番で発生していた状態: 旧形式 + ゴースト項目（削除した既定値が自動復活） ----
const legacy = {
  seedVersion: 1,
  masters: {
    grade: [
      item("g6", "S1", 1), item("g7", "S2", 2), item("g9", "L1", 3), item("g10", "L2", 4),
      item("g11", "M1", 5), item("g12", "M2", 6), item("g13", "M3", 7),
      item("grade_1792470023681", "－", 8),
      item("g1_auto", "E1", 9), item("g2_auto", "E2", 10), item("g3_auto", "J1", 11),
      item("g4_auto", "J2", 12), item("g5_auto", "J3", 13), item("g8_auto", "S3", 14),
    ],
    employmentType: [
      item("e1", "正社員", 1), item("e2", "準社員", 2), item("e3", "パートタイム", 3),
      item("e4", "アルバイト", 4), item("employmentType_1792470034528", "－", 5),
      item("e2_auto", "契約社員", 6),
      // 退職は未保存（旧処理が毎回自動復活させていた）
    ],
    // evaluationRank は未保存（後から追加されたキー）
  },
};
let r = migrateMastersFile(legacy);
assert.deepEqual(labels(r.masters, "grade"), ["S1", "S2", "L1", "L2", "M1", "M2", "M3", "－"], "ゴースト除去+ユーザー項目保持");
assert.deepEqual(labels(r.masters, "employmentType"), ["正社員", "準社員", "パートタイム", "アルバイト", "－", "退職"], "後追加項目(退職)は一度だけ補完");
assert.deepEqual(labels(r.masters, "evaluationRank"), labels(defaultMasters, "evaluationRank"), "未保存キーは既定値で補完");
assert.ok(r.changed, "changed フラグ");

// ---- ② 新形式（seedVersion=2）: ユーザーが削除した既定項目は二度と復活しない ----
const v2 = {
  seedVersion: 2,
  masters: {
    ...defaultMasters,
    grade: [item("g6", "S1", 1), item("g7", "S2", 2)], // E1〜M3 は削除済み
    employmentType: [item("e1", "正社員", 1)], // 退職も削除済み
    jobType: [], // 全削除
  },
};
r = migrateMastersFile(v2);
assert.deepEqual(labels(r.masters, "grade"), ["S1", "S2"], "削除済み既定項目は復活しない");
assert.deepEqual(labels(r.masters, "employmentType"), ["正社員"], "退職も再補完されない");
assert.deepEqual(labels(r.masters, "jobType"), [], "空配列キーは補完されない");
assert.ok(!r.changed, "変更なしなら changed=false");

// ---- ③ ユーザー追加項目（_auto 以外のID）は絶対に消えない ----
r = migrateMastersFile(legacy);
assert.ok(r.masters.grade.some((i) => i.id === "grade_1792470023681"), "ユーザー追加項目は保持");

console.log("ALL PASS");

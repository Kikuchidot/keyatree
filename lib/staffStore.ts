// 新規登録されたスタッフ・アカウントを localStorage に永続化するストア
// （将来 Supabase に差し替え。現状はモック運用のためブラウザ保存）
import { Employee } from "./mockData";
import { Account } from "./mockAccounts";
import { normalizeName } from "./utils";

const STAFF_KEY = "keyatree_staff_v1";
const ACC_KEY = "keyatree_accounts_v1";

function readStaff(): Employee[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STAFF_KEY);
    return raw ? (JSON.parse(raw) as Employee[]) : [];
  } catch {
    return [];
  }
}

function writeStaff(list: Employee[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STAFF_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function getStoredStaff(): Employee[] {
  return readStaff();
}

export function getStoredStaffById(id: string): Employee | undefined {
  return readStaff().find((e) => e.id === id);
}

export function addStoredStaff(emp: Employee) {
  const list = readStaff();
  list.push(emp);
  writeStaff(list);
}

export function updateStoredStaff(id: string, patch: Partial<Employee>) {
  const list = readStaff();
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch };
  writeStaff(list);
}

function readAccounts(): Account[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACC_KEY);
    return raw ? (JSON.parse(raw) as Account[]) : [];
  } catch {
    return [];
  }
}

function writeAccounts(list: Account[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACC_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function getStoredAccounts(): Account[] {
  return readAccounts();
}

export function addStoredAccount(acc: Account) {
  const list = readAccounts();
  list.push(acc);
  writeAccounts(list);
}

export function findStoredAccountByEmail(email: string): Account | undefined {
  return readAccounts().find((a) => a.email === email);
}

// フォーム入力から Employee オブジェクトを生成する
export function makeNewEmployee(input: {
  name: string;
  nameKana: string;
  department: string;
  team?: string;
  position: string;
  grade: string;
  jobType: string;
  employmentType: string;
  joinedAt: string;
  enneagramType: number;
  enneagramLabel: string;
  bio: string;
}): Employee {
  const now = new Date();
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  return {
    id: `s_${now.getTime()}`,
    name: normalizeName(input.name),
    nameKana: normalizeName(input.nameKana),
    photo: "",
    department: input.department,
    team: input.team ?? "",
    position: input.position,
    grade: input.grade,
    jobType: input.jobType,
    employmentType: input.employmentType,
    joinedAt: input.joinedAt,
    evaluationRank: "B",
    enneagramType: input.enneagramType,
    enneagramLabel: input.enneagramLabel,
    bio: input.bio,
    skills: [
      { subject: "リーダーシップ", value: 50, fullMark: 100 },
      { subject: "チームワーク", value: 50, fullMark: 100 },
      { subject: "課題分析", value: 50, fullMark: 100 },
      { subject: "提案力", value: 50, fullMark: 100 },
      { subject: "サポート", value: 50, fullMark: 100 },
      { subject: "交渉力", value: 50, fullMark: 100 },
    ],
    goals: [],
    thanks: [],
    monthlyGoal: {
      month: monthLabel,
      declaration: "",
      cheers: 0,
      comments: [],
      currentProgress: [],
      lastMonth: {
        month: "",
        declaration: "",
        achieved: false,
        reflection: "",
        improvement: "",
        goalResults: [],
      },
    },
  };
}

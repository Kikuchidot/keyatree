export type Skill = {
  subject: string;
  value: number;
  fullMark: number;
};

export type Goal = {
  title: string;
  progress: number;
};

export type ThanksCard = {
  from: string;
  message: string;
  date: string;
  tag: string;
};

export type Reply = {
  id: string;
  from: string;
  avatar: string;
  message: string;
  date: string;
};

export type CheerComment = {
  id: string;
  from: string;
  role: string;
  message: string;
  date: string;
  avatar: string;
  likes: number;
  replies: Reply[];
};

export type GoalProgress = {
  title: string;
  target: string;
  current: string;
  progress: number;
};

export type LastMonthResult = {
  month: string;
  declaration: string;
  achieved: boolean;
  reflection: string;
  improvement: string;
  goalResults: GoalProgress[];
};

export type MonthlyGoal = {
  month: string;
  declaration: string;
  cheers: number;
  comments: CheerComment[];
  currentProgress: GoalProgress[];
  lastMonth: LastMonthResult;
};

export type Employee = {
  id: string;
  name: string;
  nameKana: string;
  photo: string;
  department: string;
  team: string;
  position: string;
  grade: string;
  jobType: string;
  employmentType: string;
  joinedAt: string;
  evaluationRank: string;
  enneagramType: number;
  enneagramLabel: string;
  bio: string;
  skills: Skill[];
  goals: Goal[];
  thanks: ThanksCard[];
  monthlyGoal: MonthlyGoal;
};

import { normalizeName } from "./utils";

// API/ストレージから取得した不完全なスタッフデータを完全な Employee 形に補完する。
// これにより、どんな登録経路でもスタッフ詳細ページが必ず開ける。
const DEFAULT_SKILLS: Skill[] = [
  { subject: "リーダーシップ", value: 50, fullMark: 100 },
  { subject: "チームワーク", value: 50, fullMark: 100 },
  { subject: "課題分析", value: 50, fullMark: 100 },
  { subject: "提案力", value: 50, fullMark: 100 },
  { subject: "サポート", value: 50, fullMark: 100 },
  { subject: "交渉力", value: 50, fullMark: 100 },
];

export function normalizeEmployee(raw: Partial<Employee> & { id: string }): Employee {
  const now = new Date();
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const mg = raw.monthlyGoal ?? ({} as Partial<MonthlyGoal>);
  const lm = mg.lastMonth ?? ({} as Partial<LastMonthResult>);
  return {
    id: raw.id,
    name: normalizeName(raw.name ?? "名称未設定"),
    nameKana: normalizeName(raw.nameKana ?? ""),
    photo: raw.photo ?? "",
    department: raw.department ?? "",
    team: raw.team ?? "",
    position: raw.position ?? "",
    grade: raw.grade ?? "-",
    jobType: raw.jobType ?? "",
    employmentType: raw.employmentType ?? "",
    joinedAt: raw.joinedAt ?? now.toISOString().slice(0, 10),
    evaluationRank: raw.evaluationRank ?? "B",
    enneagramType: raw.enneagramType ?? 0,
    enneagramLabel: raw.enneagramLabel ?? "",
    bio: raw.bio ?? "",
    skills: Array.isArray(raw.skills) && raw.skills.length > 0 ? raw.skills : DEFAULT_SKILLS,
    goals: Array.isArray(raw.goals) ? raw.goals : [],
    thanks: Array.isArray(raw.thanks) ? raw.thanks : [],
    monthlyGoal: {
      month: mg.month ?? monthLabel,
      declaration: mg.declaration ?? "",
      cheers: typeof mg.cheers === "number" ? mg.cheers : 0,
      comments: Array.isArray(mg.comments) ? mg.comments : [],
      currentProgress: Array.isArray(mg.currentProgress) ? mg.currentProgress : [],
      lastMonth: {
        month: lm.month ?? "",
        declaration: lm.declaration ?? "",
        achieved: lm.achieved ?? false,
        reflection: lm.reflection ?? "",
        improvement: lm.improvement ?? "",
        goalResults: Array.isArray(lm.goalResults) ? lm.goalResults : [],
      },
    },
  };
}

// 同じ人が複数投稿している場合、最新をHOT扱いにする
export function markHotComments(comments: CheerComment[]): (CheerComment & { isHot: boolean })[] {
  const latestByPerson: Record<string, string> = {};
  const sorted = [...comments].sort((a, b) => b.date.localeCompare(a.date));
  for (const c of sorted) {
    if (!latestByPerson[c.from]) latestByPerson[c.from] = c.id;
  }
  const multiPosters = Object.entries(
    comments.reduce((acc, c) => { acc[c.from] = (acc[c.from] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).filter(([, v]) => v > 1).map(([k]) => k);

  return sorted.map((c) => ({
    ...c,
    isHot: multiPosters.includes(c.from) && latestByPerson[c.from] === c.id,
  }));
}

const AVATAR_MALE = (seed: string, bg: string) =>
  `https://api.dicebear.com/9.x/avataaars/png?seed=${seed}&skinColor=yellow&hairColor=black&top=shortHairShortWaved&facialHairType=beardLight&facialHairColor=black&backgroundColor=${bg}&radius=50&size=80`;
const AVATAR_FEMALE = (seed: string, bg: string) =>
  `https://api.dicebear.com/9.x/avataaars/png?seed=${seed}&skinColor=yellow&hairColor=black&top=longHairStraight&backgroundColor=${bg}&radius=50&size=80`;

export const employees: Employee[] = [
];

export function getEmployee(id: string): Employee | undefined {
  return employees.find((e) => e.id === id);
}

export function calcTenure(joinedAt: string): string {
  const joined = new Date(joinedAt);
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - joined.getFullYear()) * 12 +
    (now.getMonth() - joined.getMonth());
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months}ヶ月`;
  return `${years}年${months > 0 ? months + "ヶ月" : ""}`;
}

/**
 * チャットのメンション（@名前）解析ヘルパー。
 * サーバー・クライアント双方から利用できる純関数のみ。
 *
 * 名前に空白を含む（例: "大月 翔平"）ため、単純な空白区切りではなく
 * メンバーの表示名そのものと前方一致で判定する（最長一致優先）。
 */

/** 「全員」メンションの仮想メンバーID */
export const ALL_MENTION_ID = "__all__";

/** 「全員」メンションの表示名（候補リスト表示用） */
export const ALL_MENTION_NAME = "全員";

/** 全員メンションとして認識するキーワード（@の直後） */
const ALL_KEYWORDS = ["全員", "all"];

export type MentionMember = { id: string; name: string };

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; id: string; name: string };

// "@" がメンションの起点になり得るか（先頭 or 直前が空白）。メール等の誤検知を防ぐ。
function isTrigger(text: string, atIndex: number): boolean {
  if (atIndex <= 0) return true;
  return /\s/.test(text[atIndex - 1]);
}

/** 本文を通常テキストとメンションのセグメントに分割する。 */
export function segmentMentions(text: string, members: MentionMember[]): MentionSegment[] {
  if (!text || !text.includes("@")) {
    return text ? [{ type: "text", text }] : [];
  }
  // 表示名の長い順に並べ、最長一致を優先（前方一致の取りこぼし防止）
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  const segments: MentionSegment[] = [];
  let buf = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "@" && isTrigger(text, i)) {
      const rest = text.slice(i + 1);
      // 「@全員」「@all」をチェック
      const allMatch = ALL_KEYWORDS.find(
        (kw) => rest.length >= kw.length && rest.slice(0, kw.length).toLowerCase() === kw.toLowerCase()
      );
      if (allMatch) {
        if (buf) {
          segments.push({ type: "text", text: buf });
          buf = "";
        }
        segments.push({ type: "mention", id: ALL_MENTION_ID, name: ALL_MENTION_NAME });
        i += 1 + allMatch.length;
        continue;
      }
      // 個人メンション
      const matched = sorted.find((m) => m.name.length > 0 && rest.startsWith(m.name));
      if (matched) {
        if (buf) {
          segments.push({ type: "text", text: buf });
          buf = "";
        }
        segments.push({ type: "mention", id: matched.id, name: matched.name });
        i += 1 + matched.name.length;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  if (buf) segments.push({ type: "text", text: buf });
  return segments;
}

/** 本文中でメンションされたメンバーIDの一覧（重複なし）。 */
export function extractMentionIds(text: string, members: MentionMember[]): string[] {
  const ids = new Set<string>();
  for (const seg of segmentMentions(text, members)) {
    if (seg.type === "mention") ids.add(seg.id);
  }
  return Array.from(ids);
}

/** 本文中でメンションされたメンバー（{id,name}）の一覧（重複なし）。 */
export function extractMentions(text: string, members: MentionMember[]): MentionMember[] {
  const seen = new Set<string>();
  const result: MentionMember[] = [];
  for (const seg of segmentMentions(text, members)) {
    if (seg.type === "mention" && !seen.has(seg.id)) {
      seen.add(seg.id);
      result.push({ id: seg.id, name: seg.name });
    }
  }
  return result;
}

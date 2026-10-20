"use client";

import { segmentMentions } from "@/lib/mentions";
import type { ReactNode } from "react";

type Member = { id: string; name: string };

// メンション（@名前）をハイライト表示するインライン要素を生成
function renderMentionRuns(text: string, members: Member[], meId: string, keyPrefix: string): ReactNode[] {
  const segs = segmentMentions(text, members);
  return segs.map((s, i) => {
    if (s.type === "mention") {
      const isMe = s.id === meId;
      return (
        <span
          key={`${keyPrefix}-m${i}`}
          className={`font-bold rounded px-1 ${isMe ? "bg-emerald-500/30 text-emerald-200" : "text-emerald-300"}`}
        >
          @{s.name}
        </span>
      );
    }
    return <span key={`${keyPrefix}-t${i}`}>{s.text}</span>;
  });
}

// インライン装飾（***太字斜体*** / **太字** / *斜体* / ==マーカー== / `コード`）とメンションを解析
function renderInline(text: string, members: Member[], meId: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buf = "";
  let i = 0;
  let k = 0;
  const flush = () => {
    if (buf) {
      nodes.push(...renderMentionRuns(buf, members, meId, `${keyPrefix}-r${k++}`));
      buf = "";
    }
  };
  while (i < text.length) {
    // インラインコード: `code`
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        nodes.push(
          <code key={`${keyPrefix}-c${k++}`} className="bg-zinc-700/60 text-pink-300 rounded px-1 py-0.5 text-[0.85em] font-mono">
            {text.slice(i + 1, end)}
          </code>
        );
        i = end + 1;
        continue;
      }
    }
    // 太字+斜体: ***text***
    if (text.startsWith("***", i)) {
      const end = text.indexOf("***", i + 3);
      if (end !== -1) {
        flush();
        nodes.push(
          <strong key={`${keyPrefix}-bi${k++}`} className="font-bold italic">
            {renderMentionRuns(text.slice(i + 3, end), members, meId, `${keyPrefix}-bii${k}`)}
          </strong>
        );
        i = end + 3;
        continue;
      }
    }
    // 太字: **text**
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        nodes.push(
          <strong key={`${keyPrefix}-b${k++}`} className="font-bold">
            {renderMentionRuns(text.slice(i + 2, end), members, meId, `${keyPrefix}-bb${k}`)}
          </strong>
        );
        i = end + 2;
        continue;
      }
    }
    // 斜体: *text*（**ではない単独の*）
    if (text[i] === "*" && !text.startsWith("**", i)) {
      const end = text.indexOf("*", i + 1);
      if (end !== -1 && !text.startsWith("**", end)) {
        flush();
        nodes.push(
          <em key={`${keyPrefix}-i${k++}`} className="italic">
            {renderMentionRuns(text.slice(i + 1, end), members, meId, `${keyPrefix}-ii${k}`)}
          </em>
        );
        i = end + 1;
        continue;
      }
    }
    // マーカー: ==text==
    if (text.startsWith("==", i)) {
      const end = text.indexOf("==", i + 2);
      if (end !== -1) {
        flush();
        nodes.push(
          <mark key={`${keyPrefix}-h${k++}`} className="bg-yellow-300/80 text-zinc-900 rounded px-0.5">
            {renderMentionRuns(text.slice(i + 2, end), members, meId, `${keyPrefix}-hh${k}`)}
          </mark>
        );
        i = end + 2;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return nodes;
}

const HR = /^(-{3,}|\*{3,}|_{3,})$/;
const OL = /^\d+\.\s+/;
const UL = /^[-*]\s+/;
const H1 = /^#\s+/;
const H2 = /^##\s+/;
const H3 = /^###\s+/;

function isBlockStart(t: string) {
  return HR.test(t) || OL.test(t) || UL.test(t) || H1.test(t) || H2.test(t) || H3.test(t);
}

/**
 * トークメッセージ本文を Markdown-lite として整形表示する。
 * 対応: 見出し(文字サイズ) #, ##, ###／***太字斜体***／**太字**／*斜体*／==マーカー==／`コード`／番号リスト 1.／箇条書き - ／水平線 ---／メンション
 * 記法に一致しない箇所はプレーンテキスト（改行維持）として表示する。
 */
export function renderRichMessage(text: string, members: Member[], meId: string): ReactNode {
  const lines = (text ?? "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    if (HR.test(t)) {
      blocks.push(<hr key={`k${key++}`} className="my-2 border-t border-zinc-600 w-full" />);
      i++;
      continue;
    }

    // ### must be checked before ## and #
    if (H3.test(t)) {
      blocks.push(
        <p key={`k${key++}`} className="text-sm font-bold text-white my-0.5">
          {renderInline(t.replace(H3, ""), members, meId, `h3-${key}`)}
        </p>
      );
      i++;
      continue;
    }
    if (H2.test(t)) {
      blocks.push(
        <p key={`k${key++}`} className="text-base font-bold text-white my-0.5">
          {renderInline(t.replace(H2, ""), members, meId, `h2-${key}`)}
        </p>
      );
      i++;
      continue;
    }
    if (H1.test(t)) {
      blocks.push(
        <p key={`k${key++}`} className="text-lg font-bold text-white my-0.5">
          {renderInline(t.replace(H1, ""), members, meId, `h1-${key}`)}
        </p>
      );
      i++;
      continue;
    }

    if (OL.test(t)) {
      const items: string[] = [];
      while (i < lines.length && OL.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(OL, ""));
        i++;
      }
      blocks.push(
        <ol key={`k${key++}`} className="list-decimal ml-5 my-1 space-y-0.5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, members, meId, `ol${key}-${j}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (UL.test(t)) {
      const items: string[] = [];
      while (i < lines.length && UL.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(UL, ""));
        i++;
      }
      blocks.push(
        <ul key={`k${key++}`} className="ml-4 my-1 space-y-0.5" style={{ listStyleType: "'・'" }}>
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, members, meId, `ul${key}-${j}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // 段落：ブロック要素にぶつかるまで連続行をまとめる
    const para: string[] = [];
    while (i < lines.length && !isBlockStart(lines[i].trim())) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`k${key++}`} className="whitespace-pre-wrap break-words">
        {para.map((l, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {renderInline(l, members, meId, `p${key}-${j}`)}
          </span>
        ))}
      </p>
    );
  }

  return <div className="space-y-1">{blocks}</div>;
}

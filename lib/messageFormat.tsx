"use client";

import { segmentMentions, ALL_MENTION_ID } from "@/lib/mentions";
import { sanitizeSpanStyle } from "@/lib/richText";
import type { CSSProperties, ReactNode } from "react";

type Member = { id: string; name: string };

// sanitize済みstyle文字列をReactのstyleオブジェクトに変換
function spanStyleObject(style: string): CSSProperties {
  const obj: CSSProperties = {};
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const prop = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (prop === "color") obj.color = val;
    else if (prop === "background-color") obj.backgroundColor = val;
    else if (prop === "font-size") obj.fontSize = val;
  }
  return obj;
}

// メンション（@名前）をハイライト表示するインライン要素を生成
function renderMentionRuns(text: string, members: Member[], meId: string, keyPrefix: string): ReactNode[] {
  const segs = segmentMentions(text, members);
  return segs.map((s, i) => {
    if (s.type === "mention") {
      const isAll = s.id === ALL_MENTION_ID;
      const isMe = s.id === meId || isAll;
      return (
        <span
          key={`${keyPrefix}-m${i}`}
          className={`font-bold rounded px-1 ${
            isAll
              ? "bg-sky-200 text-sky-900"
              : isMe
                ? "bg-emerald-200 text-emerald-900"
                : "text-emerald-700"
          }`}
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
    // <span style="...">...</span>（sanitize済みのスタイルのみ適用）
    if (text.startsWith('<span style="', i)) {
      const m = text.slice(i).match(/^<span style="([^"]*)">/);
      if (m) {
        const end = text.indexOf("</span>", i + m[0].length);
        if (end !== -1) {
          flush();
          const inner = text.slice(i + m[0].length, end);
          const safe = sanitizeSpanStyle(m[1]);
          if (safe) {
            nodes.push(
              <span key={`${keyPrefix}-sp${k++}`} style={spanStyleObject(safe)}>
                {renderInline(inner, members, meId, `${keyPrefix}-spi${k}`)}
              </span>
            );
          } else {
            nodes.push(...renderInline(inner, members, meId, `${keyPrefix}-spp${k++}`));
          }
          i = end + "</span>".length;
          continue;
        }
      }
    }
    // <u>下線</u>
    if (text.startsWith("<u>", i)) {
      const end = text.indexOf("</u>", i + 3);
      if (end !== -1) {
        flush();
        nodes.push(
          <u key={`${keyPrefix}-u${k++}`}>
            {renderInline(text.slice(i + 3, end), members, meId, `${keyPrefix}-ui${k}`)}
          </u>
        );
        i = end + 4;
        continue;
      }
    }
    // <s>取り消し線</s>
    if (text.startsWith("<s>", i)) {
      const end = text.indexOf("</s>", i + 3);
      if (end !== -1) {
        flush();
        nodes.push(
          <s key={`${keyPrefix}-s${k++}`}>
            {renderInline(text.slice(i + 3, end), members, meId, `${keyPrefix}-si${k}`)}
          </s>
        );
        i = end + 4;
        continue;
      }
    }
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
        <p key={`k${key++}`} className="text-sm font-bold text-gray-900 my-0.5">
          {renderInline(t.replace(H3, ""), members, meId, `h3-${key}`)}
        </p>
      );
      i++;
      continue;
    }
    if (H2.test(t)) {
      blocks.push(
        <p key={`k${key++}`} className="text-base font-bold text-gray-900 my-0.5">
          {renderInline(t.replace(H2, ""), members, meId, `h2-${key}`)}
        </p>
      );
      i++;
      continue;
    }
    if (H1.test(t)) {
      blocks.push(
        <p key={`k${key++}`} className="text-lg font-bold text-gray-900 my-0.5">
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

// ---- 入力中オーバーレイ用：記法文字を保持したまま装飾だけ適用する ----

const DIM = "text-gray-400";

// インライン記法のマーカー文字（** や == など）を薄く残し、中身に装飾を適用。
// 文字数・位置を変えないため、textarea のキャレット位置と完全に一致する。
function renderComposerInline(text: string, members: Member[], meId: string, keyPrefix: string): ReactNode[] {
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
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        nodes.push(
          <span key={`${keyPrefix}-c${k++}`}>
            <span className={DIM}>`</span>
            <code className="bg-gray-200 text-pink-600 rounded px-0.5 text-[0.85em] font-mono">{text.slice(i + 1, end)}</code>
            <span className={DIM}>`</span>
          </span>
        );
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith("***", i)) {
      const end = text.indexOf("***", i + 3);
      if (end !== -1) {
        flush();
        nodes.push(
          <span key={`${keyPrefix}-bi${k++}`}>
            <span className={DIM}>***</span>
            <strong className="font-bold italic">{renderMentionRuns(text.slice(i + 3, end), members, meId, `${keyPrefix}-bii${k}`)}</strong>
            <span className={DIM}>***</span>
          </span>
        );
        i = end + 3;
        continue;
      }
    }
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        nodes.push(
          <span key={`${keyPrefix}-b${k++}`}>
            <span className={DIM}>**</span>
            <strong className="font-bold">{renderMentionRuns(text.slice(i + 2, end), members, meId, `${keyPrefix}-bb${k}`)}</strong>
            <span className={DIM}>**</span>
          </span>
        );
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*" && !text.startsWith("**", i)) {
      const end = text.indexOf("*", i + 1);
      if (end !== -1 && !text.startsWith("**", end)) {
        flush();
        nodes.push(
          <span key={`${keyPrefix}-i${k++}`}>
            <span className={DIM}>*</span>
            <em className="italic">{renderMentionRuns(text.slice(i + 1, end), members, meId, `${keyPrefix}-ii${k}`)}</em>
            <span className={DIM}>*</span>
          </span>
        );
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith("==", i)) {
      const end = text.indexOf("==", i + 2);
      if (end !== -1) {
        flush();
        nodes.push(
          <span key={`${keyPrefix}-h${k++}`}>
            <span className={DIM}>==</span>
            <mark className="bg-yellow-300/80 text-zinc-900 rounded px-0.5">{renderMentionRuns(text.slice(i + 2, end), members, meId, `${keyPrefix}-hh${k}`)}</mark>
            <span className={DIM}>==</span>
          </span>
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

/**
 * 入力エリアのオーバーレイ表示用。
 * 元テキストの文字・改行・折り返しを一切変えず、装飾だけを重ねる。
 * 見出しは太字＋濃色、記号（# / - / ---）は薄色で表示する。
 */
export function renderComposerMessage(text: string, members: Member[], meId: string): ReactNode {
  const lines = (text ?? "").split("\n");
  return (
    <>
      {lines.map((line, li) => {
        const t = line.trim();
        let content: ReactNode;
        const hm = t.match(/^(#{1,3})\s+(.*)$/);
        if (hm) {
          const lead = line.indexOf(hm[1]);
          content = (
            <>
              {line.slice(0, lead)}
              <span className={DIM}>{hm[1]} </span>
              <strong className="font-bold text-gray-900">{renderComposerInline(hm[2], members, meId, `h${li}`)}</strong>
            </>
          );
        } else if (HR.test(t)) {
          content = <span className={DIM}>{line}</span>;
        } else {
          const lm = line.match(/^(\s*)([-*]|\d+\.)(\s+)(.*)$/);
          if (lm) {
            content = (
              <>
                {lm[1]}
                <span className={DIM}>{lm[2]}{lm[3]}</span>
                {renderComposerInline(lm[4], members, meId, `l${li}`)}
              </>
            );
          } else {
            content = renderComposerInline(line, members, meId, `p${li}`);
          }
        }
        return (
          <span key={li}>
            {li > 0 && "\n"}
            {content}
          </span>
        );
      })}
    </>
  );
}

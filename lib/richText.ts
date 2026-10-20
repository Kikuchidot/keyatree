"use client";

/**
 * リッチテキスト入力（contentEditable）用の変換ユーティリティ。
 * 内部データは従来の Markdown-lite 文字列のまま保持し、
 * エディタ上では装飾済みHTMLとして表示・編集する。
 *
 * 拡張記法:
 *   **太字** / *斜体* / ==マーカー== / `コード`
 *   <u>下線</u> / <s>取り消し線</s>
 *   <span style="color: ...">文字色</span>
 *   <span style="background-color: ...">ハイライト</span>
 *   <span style="font-size: ...">文字サイズ</span>
 * span の style は sanitizeSpanStyle でホワイトリスト検証する（XSS対策）。
 */

const HR = /^(-{3,}|\*{3,}|_{3,})$/;
const OL = /^\d+\.\s+/;
const UL = /^[-*]\s+/;
const H1 = /^#\s+/;
const H2 = /^##\s+/;
const H3 = /^###\s+/;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(\s*,\s*[\d.]+\s*)?\))$/;
const SIZE_RE = /^(xx-small|x-small|small|medium|large|x-large|xx-large|larger|smaller|[\d.]+(px|em|rem|pt|%))$/;

/** style 文字列をホワイトリスト（color / background-color / font-size のみ）に制限 */
export function sanitizeSpanStyle(style: string): string {
  const out: string[] = [];
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if ((prop === "color" || prop === "background-color") && COLOR_RE.test(val)) {
      out.push(`${prop}: ${val}`);
    } else if (prop === "font-size" && SIZE_RE.test(val)) {
      out.push(`font-size: ${val}`);
    }
  }
  return out.join("; ");
}

const SPAN_OPEN_RE = /^<span style="([^"]*)">/;

/**
 * インライン記法をHTMLに変換。
 * Markdown記法に加えて <u> / <s> / <span style="..."> のホワイトリスト済みHTMLタグも解釈する。
 * テキスト部分はすべてHTMLエスケープされる。
 */
export function inlineToHtml(raw: string): string {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    // <span style="...">...</span>
    if (raw.startsWith('<span style="', i)) {
      const m = raw.slice(i).match(SPAN_OPEN_RE);
      if (m) {
        const end = raw.indexOf("</span>", i + m[0].length);
        if (end !== -1) {
          const inner = raw.slice(i + m[0].length, end);
          const safe = sanitizeSpanStyle(m[1]);
          out += safe
            ? `<span style="${escapeHtml(safe)}">${inlineToHtml(inner)}</span>`
            : inlineToHtml(inner);
          i = end + "</span>".length;
          continue;
        }
      }
    }
    // <u>...</u>
    if (raw.startsWith("<u>", i)) {
      const end = raw.indexOf("</u>", i + 3);
      if (end !== -1) {
        out += `<u>${inlineToHtml(raw.slice(i + 3, end))}</u>`;
        i = end + 4;
        continue;
      }
    }
    // <s>...</s>
    if (raw.startsWith("<s>", i)) {
      const end = raw.indexOf("</s>", i + 3);
      if (end !== -1) {
        out += `<s>${inlineToHtml(raw.slice(i + 3, end))}</s>`;
        i = end + 4;
        continue;
      }
    }
    if (raw[i] === "`") {
      const e = raw.indexOf("`", i + 1);
      if (e !== -1) {
        out += `<code>${escapeHtml(raw.slice(i + 1, e))}</code>`;
        i = e + 1;
        continue;
      }
    }
    if (raw.startsWith("***", i)) {
      const e = raw.indexOf("***", i + 3);
      if (e !== -1) {
        out += `<strong><em>${inlineToHtml(raw.slice(i + 3, e))}</em></strong>`;
        i = e + 3;
        continue;
      }
    }
    if (raw.startsWith("**", i)) {
      const e = raw.indexOf("**", i + 2);
      if (e !== -1) {
        out += `<strong>${inlineToHtml(raw.slice(i + 2, e))}</strong>`;
        i = e + 2;
        continue;
      }
    }
    if (raw[i] === "*" && !raw.startsWith("**", i)) {
      const e = raw.indexOf("*", i + 1);
      if (e !== -1 && !raw.startsWith("**", e)) {
        out += `<em>${inlineToHtml(raw.slice(i + 1, e))}</em>`;
        i = e + 1;
        continue;
      }
    }
    if (raw.startsWith("==", i)) {
      const e = raw.indexOf("==", i + 2);
      if (e !== -1) {
        out += `<mark>${inlineToHtml(raw.slice(i + 2, e))}</mark>`;
        i = e + 2;
        continue;
      }
    }
    out += escapeHtml(raw[i]);
    i++;
  }
  return out;
}

function isBlockStart(t: string): boolean {
  return HR.test(t) || OL.test(t) || UL.test(t) || H1.test(t) || H2.test(t) || H3.test(t);
}

/** Markdown-lite 文字列をエディタ初期表示用のHTMLに変換 */
export function markdownToHtml(md: string): string {
  const lines = (md ?? "").split("\n");
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (HR.test(t)) {
      blocks.push("<hr>");
      i++;
      continue;
    }
    if (H3.test(t)) {
      blocks.push(`<h3>${inlineToHtml(t.replace(H3, ""))}</h3>`);
      i++;
      continue;
    }
    if (H2.test(t)) {
      blocks.push(`<h2>${inlineToHtml(t.replace(H2, ""))}</h2>`);
      i++;
      continue;
    }
    if (H1.test(t)) {
      blocks.push(`<h1>${inlineToHtml(t.replace(H1, ""))}</h1>`);
      i++;
      continue;
    }
    if (OL.test(t)) {
      const items: string[] = [];
      while (i < lines.length && OL.test(lines[i].trim())) {
        items.push(`<li>${inlineToHtml(lines[i].trim().replace(OL, ""))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    if (UL.test(t)) {
      const items: string[] = [];
      while (i < lines.length && UL.test(lines[i].trim())) {
        items.push(`<li>${inlineToHtml(lines[i].trim().replace(UL, ""))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !isBlockStart(lines[i].trim())) {
      para.push(lines[i]);
      i++;
    }
    for (const l of para) {
      blocks.push(l.trim() === "" ? "<div><br></div>" : `<div>${inlineToHtml(l)}</div>`);
    }
  }
  return blocks.join("");
}

// ---- DOM → Markdown 変換（エディタ入力のシリアライズ） ----

// エディタ既定色（「自動」適用時の色）はシリアライズしない
const DEFAULT_COLOR_RE = /rgb\(\s*31\s*,\s*41\s*,\s*55\s*\)/;

/**
 * 装飾が改行をまたぐ場合（Chromeが複数行にまたがる装飾を1要素で生成する）、
 * 行ごとに装飾を閉じて再度開く形式に正規化する。
 * 表示側は行単位で解析するため、改行をまたぐ記法は崩れる。
 * 例: "**a\nb**" → "**a**\n**b**"
 */
function wrapPerLine(pre: string, post: string, inner: string): string {
  if (inner === "") return "";
  if (!inner.includes("\n")) return `${pre}${inner}${post}`;
  return inner
    .split("\n")
    .map((l) => (l === "" ? "" : `${pre}${l}${post}`))
    .join("\n");
}

function inlineMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  const inner = Array.from(node.childNodes).map(inlineMd).join("");
  if (tag === "b" || tag === "strong") return wrapPerLine("**", "**", inner);
  if (tag === "i" || tag === "em") return wrapPerLine("*", "*", inner);
  if (tag === "u") return wrapPerLine("<u>", "</u>", inner);
  if (tag === "s" || tag === "strike" || tag === "del") return wrapPerLine("<s>", "</s>", inner);
  if (tag === "mark") return wrapPerLine("==", "==", inner);
  if (tag === "code") return wrapPerLine("`", "`", inner);
  if (tag === "div" || tag === "p") return inner === "" ? "" : `${inner}\n`;
  if (tag === "span" || tag === "font") {
    let s = inner;
    const styles: string[] = [];
    const color = node.style.color || (tag === "font" ? (node as HTMLFontElement).color : "");
    const bg = node.style.backgroundColor;
    const fs = node.style.fontSize;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
      styles.push(`background-color: ${bg}`);
    }
    if (color && !DEFAULT_COLOR_RE.test(color)) {
      styles.push(`color: ${color}`);
    }
    if (fs && fs !== "medium") {
      styles.push(`font-size: ${fs}`);
    }
    if (styles.length > 0) {
      s = wrapPerLine(`<span style="${styles.join("; ")}">`, "</span>", s);
    }
    const td = node.style.textDecoration || "";
    if (td.includes("line-through")) s = wrapPerLine("<s>", "</s>", s);
    if (td.includes("underline")) s = wrapPerLine("<u>", "</u>", s);
    if (node.style.fontStyle === "italic") s = wrapPerLine("*", "*", s);
    const fw = node.style.fontWeight;
    if (fw === "bold" || Number(fw) >= 600) s = wrapPerLine("**", "**", s);
    return s;
  }
  return inner;
}

function inlineChildrenMd(el: HTMLElement): string {
  return Array.from(el.childNodes).map(inlineMd).join("");
}

/** contentEditable のDOMを Markdown-lite 文字列にシリアライズ */
export function domToMarkdown(root: HTMLElement): string {
  const lines: string[] = [];
  const pushInline = (s: string) => {
    for (const l of s.split("\n")) lines.push(l);
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? "";
      if (t !== "") pushInline(t);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      pushInline(`${"#".repeat(Number(tag[1]))} ${inlineChildrenMd(node)}`);
      return;
    }
    if (tag === "ul") {
      node.querySelectorAll(":scope > li").forEach((li) => pushInline(`- ${inlineChildrenMd(li as HTMLElement)}`));
      return;
    }
    if (tag === "ol") {
      let n = 1;
      node.querySelectorAll(":scope > li").forEach((li) => pushInline(`${n++}. ${inlineChildrenMd(li as HTMLElement)}`));
      return;
    }
    if (tag === "hr") {
      lines.push("---");
      return;
    }
    if (tag === "div" || tag === "p" || tag === "li" || tag === "blockquote") {
      pushInline(inlineChildrenMd(node).replace(/\n+$/, ""));
      return;
    }
    // それ以外のインライン要素がトップレベルに来た場合
    pushInline(inlineMd(node).replace(/\n+$/, ""));
  };
  Array.from(root.childNodes).forEach(walk);
  // 末尾の空行を除去
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join("\n");
}

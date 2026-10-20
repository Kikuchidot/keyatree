"use client";

/**
 * リッチテキスト入力（contentEditable）用の変換ユーティリティ。
 * 内部データは従来の Markdown-lite 文字列のまま保持し、
 * エディタ上では装飾済みHTMLとして表示・編集する。
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

/** インライン記法（**太字** / *斜体* / ==マーカー== / `コード`）をHTMLに変換 */
export function inlineToHtml(raw: string): string {
  const text = escapeHtml(raw);
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const e = text.indexOf("`", i + 1);
      if (e !== -1) {
        out += `<code>${text.slice(i + 1, e)}</code>`;
        i = e + 1;
        continue;
      }
    }
    if (text.startsWith("***", i)) {
      const e = text.indexOf("***", i + 3);
      if (e !== -1) {
        out += `<strong><em>${text.slice(i + 3, e)}</em></strong>`;
        i = e + 3;
        continue;
      }
    }
    if (text.startsWith("**", i)) {
      const e = text.indexOf("**", i + 2);
      if (e !== -1) {
        out += `<strong>${text.slice(i + 2, e)}</strong>`;
        i = e + 2;
        continue;
      }
    }
    if (text[i] === "*" && !text.startsWith("**", i)) {
      const e = text.indexOf("*", i + 1);
      if (e !== -1 && !text.startsWith("**", e)) {
        out += `<em>${text.slice(i + 1, e)}</em>`;
        i = e + 1;
        continue;
      }
    }
    if (text.startsWith("==", i)) {
      const e = text.indexOf("==", i + 2);
      if (e !== -1) {
        out += `<mark>${text.slice(i + 2, e)}</mark>`;
        i = e + 2;
        continue;
      }
    }
    out += text[i];
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

function inlineMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  const inner = Array.from(node.childNodes).map(inlineMd).join("");
  if (tag === "b" || tag === "strong") return `**${inner}**`;
  if (tag === "i" || tag === "em") return `*${inner}*`;
  if (tag === "mark") return `==${inner}==`;
  if (tag === "code") return `\`${inner}\``;
  if (tag === "span" || tag === "font") {
    const fw = node.style.fontWeight;
    const fs = node.style.fontStyle;
    const bg = node.style.backgroundColor;
    let s = inner;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") s = `==${s}==`;
    if (fs === "italic") s = `*${s}*`;
    if (fw === "bold" || Number(fw) >= 600) s = `**${s}**`;
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
      pushInline(inlineChildrenMd(node));
      return;
    }
    // それ以外のインライン要素がトップレベルに来た場合
    pushInline(inlineMd(node));
  };
  Array.from(root.childNodes).forEach(walk);
  // 末尾の空行を除去
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join("\n");
}

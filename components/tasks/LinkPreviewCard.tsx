"use client";

import { useEffect, useState } from "react";

export type UrlPreview = {
  url: string;
  hostname: string;
  title: string;
  description: string | null;
  image: string | null;
  favicon: string;
};

// 同じURLの再取得を避けるモジュールレベルキャッシュ
const cache = new Map<string, UrlPreview | null>();

/**
 * メッセージ内URLのOGPプレビューカード。
 * タイトル・説明・OGP画像を表示し、クリックで新しいウィンドウで開く。
 */
export default function LinkPreviewCard({ url }: { url: string }) {
  const [preview, setPreview] = useState<UrlPreview | null | undefined>(cache.has(url) ? cache.get(url) : undefined);

  useEffect(() => {
    if (cache.has(url)) {
      setPreview(cache.get(url));
      return;
    }
    let alive = true;
    fetch(`/api/url-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        cache.set(url, d);
        setPreview(d);
      })
      .catch(() => {
        if (!alive) return;
        cache.set(url, null);
        setPreview(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  if (preview === undefined) {
    // 取得中は控えめなスケルトン
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block max-w-md rounded-lg border border-gray-200 bg-white/60 animate-pulse p-3"
      >
        <span className="block text-xs text-gray-400">{new URL(url, "https://example.com").hostname || url}</span>
        <span className="mt-1 block h-3 w-2/3 rounded bg-gray-200" />
      </a>
    );
  }

  if (preview === null) return null; // 取得失敗（プレーンなリンクは本文側で表示済み）

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 block max-w-md rounded-lg border border-gray-200 bg-white hover:border-sky-400 transition overflow-hidden group"
    >
      {preview.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt={preview.title}
          className="w-full max-h-48 object-cover bg-gray-100"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="p-2.5">
        <div className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.favicon} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" />
          <span className="text-[11px] text-gray-500 truncate">{preview.hostname}</span>
        </div>
        <p className="mt-1 text-sm font-bold text-gray-800 group-hover:text-sky-600 transition line-clamp-2">
          {preview.title}
        </p>
        {preview.description && (
          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{preview.description}</p>
        )}
      </div>
    </a>
  );
}

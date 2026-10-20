import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/admin/debug-records", "/api/admin/update-record-title", "/api/admin/debug-channels"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 公開パスはスルー
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // セッションCookie確認
  const session = req.cookies.get("kt_session");
  if (!session?.value) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Cookieが「存在するが壊れている」場合の対策。
  // 旧バージョンの未エンコード/文字化けCookieが残っていると presence 判定だけでは
  // 通過してしまい、各ページのセッション解析が失敗して
  // 「通常ウィンドウではログインできない（プライベートウィンドウのみ可）」状態になる。
  // → 妥当なJSONとして解析できなければ壊れたCookieとみなし、削除してログインへ。
  let valid = false;
  try {
    let text = session.value;
    try {
      text = decodeURIComponent(session.value);
    } catch {
      text = session.value;
    }
    const parsed = JSON.parse(text) as { id?: unknown; email?: unknown };
    valid =
      !!parsed &&
      typeof parsed === "object" &&
      (typeof parsed.id === "string" || typeof parsed.email === "string");
  } catch {
    valid = false;
  }

  if (!valid) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete("kt_session");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|avatars).*)"],
};

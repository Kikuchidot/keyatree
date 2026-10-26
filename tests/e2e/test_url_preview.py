"""URLリンク化・OGPプレビュー機能のE2E試験（試験環境: localhost:3210）

試験内容:
1. API: /api/url-preview がOGP情報（title/hostname）を返す。未ログインは401、変なURLは400
2. UI: URLを含むメッセージを投稿 → URLがリンク化され、プレビューカードが表示される
3. リンク・カードは新しいウィンドウで開く（target=_blank）
"""

import json
import urllib.parse

import httpx
import pytest
from playwright.sync_api import expect, Browser

USER_A = {
    "email": "k.sugita@365keyaki.onmicrosoft.com",
    "password": "R?3Qxg9tX%b@EmJ5",
}
USER_B = {
    "email": "suzuki@keyaki-s.com",
    "password": "*Ub9F+cWbQGCcHpn",
}

CH_NAME = "TEST-URLプレビューチャンネル"
TALK_NAME = "TEST-URLプレビュールーム"
# OGPを確実に持つ外部サイト（安定してog:titleがある）
TARGET_URL = "https://github.com/"


def login_api(base_url: str, email: str, password: str) -> dict:
    r = httpx.post(f"{base_url}/api/auth/login", json={"email": email, "password": password}, timeout=60)
    assert r.status_code == 200 and r.json().get("ok"), f"ログイン失敗: {r.text}"
    return r.json()["account"]


def cookie_value(account: dict) -> str:
    payload = {k: account[k] for k in ("id", "name", "email", "permissionId", "permissionName", "employeeId")}
    return urllib.parse.quote(json.dumps(payload, ensure_ascii=False))


@pytest.fixture(scope="module")
def env(base_url):
    acc_a = login_api(base_url, USER_A["email"], USER_A["password"])
    acc_b = login_api(base_url, USER_B["email"], USER_B["password"])
    client_a = httpx.Client(base_url=base_url, cookies={"kt_session": cookie_value(acc_a)}, timeout=60)

    r = client_a.get("/api/task-channels")
    for c in (r.json().get("channels") or []) + (r.json().get("archivedChannels") or []):
        if c.get("name") == CH_NAME:
            client_a.delete(f"/api/task-channels/{c['id']}")
    r = client_a.post(
        "/api/task-channels",
        json={"name": CH_NAME, "members": [{"id": acc_b["employeeId"], "name": acc_b["name"]}]},
    )
    assert r.status_code == 200, r.text
    channel = r.json()["channel"]
    r = client_a.post(
        f"/api/task-channels/{channel['id']}/talks",
        json={"name": TALK_NAME, "members": [{"id": acc_b["employeeId"], "name": acc_b["name"]}]},
    )
    assert r.status_code == 200, r.text
    talk = r.json()["talk"]

    yield {"base_url": base_url, "acc_b": acc_b, "client_a": client_a, "channel": channel, "talk": talk}

    try:
        client_a.delete(f"/api/task-channels/{channel['id']}")
    except Exception:
        pass
    client_a.close()


def test_01_api_url_preview(env):
    """API: OGP取得・権限・バリデーション"""
    client = env["client_a"]

    # OGPが取れる（外部アクセスが必要。取れない環境ではこの検証だけスキップ相当で失敗扱い）
    r = client.get("/api/url-preview", params={"url": TARGET_URL})
    assert r.status_code == 200, f"OGP取得失敗: {r.status_code} {r.text}"
    d = r.json()
    assert d["hostname"] == "github.com", d
    assert d["title"], "タイトルが空"
    assert d["favicon"], "faviconが空"

    # 未ログインは拒否（401 か middleware のリダイレクト）
    r = httpx.get(f"{env['base_url']}/api/url-preview", params={"url": TARGET_URL}, timeout=30, follow_redirects=False)
    assert r.status_code in (301, 302, 307, 308, 401), f"未ログインでアクセスできてしまう: {r.status_code}"

    # 不正URL・プライベートホストは400
    r = client.get("/api/url-preview", params={"url": "ftp://example.com"})
    assert r.status_code == 400
    r = client.get("/api/url-preview", params={"url": "http://localhost:3210/"})
    assert r.status_code == 400


def test_02_ui_link_preview_card(env, browser: Browser):
    """UI: URLがリンク化されプレビューカードが出る。target=_blankで開く"""
    # URLを含むメッセージを投稿
    r = env["client_a"].post(
        f"/api/task-channels/{env['channel']['id']}/talks/{env['talk']['id']}/messages",
        json={"text": f"公式サイトはこちら {TARGET_URL} チェックしてね"},
    )
    assert r.status_code == 200, r.text
    msg = r.json()["message"]

    ctx = browser.new_context(viewport={"width": 1600, "height": 900})
    ctx.add_cookies([{"name": "kt_session", "value": cookie_value(env["acc_b"]), "url": env["base_url"]}])
    page = ctx.new_page()
    try:
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
        ch_btn = page.locator(f"aside button:has-text('{CH_NAME}')").first
        expect(ch_btn).to_be_visible(timeout=60000)
        ch_btn.click()
        talk_span = page.locator(f"aside span:has-text('{TALK_NAME}')").first
        expect(talk_span).to_be_visible(timeout=30000)
        talk_span.click()

        row = page.locator("div[data-message-id]", has_text="公式サイトはこちら").first
        expect(row).to_be_visible(timeout=30000)

        # --- ① URLがリンク化されている（target=_blank） ---
        link = row.locator(f"a[href='{TARGET_URL}']").first
        expect(link).to_be_visible(timeout=10000)
        assert link.get_attribute("target") == "_blank"
        assert "noopener" in (link.get_attribute("rel") or "")

        # --- ② プレビューカードが表示される ---
        card = row.locator("a.group").first
        expect(card).to_be_visible(timeout=30000)
        expect(card.locator("text=github.com").first).to_be_visible(timeout=10000)
        # カードにもタイトルが表示される
        assert card.locator("p").first.inner_text().strip() != ""
        assert card.get_attribute("target") == "_blank"
        page.screenshot(path=".verdent/testing/screenshots/url_preview.png", full_page=False)
    finally:
        ctx.close()
        try:
            env["client_a"].delete(
                f"/api/task-channels/{env['channel']['id']}/talks/{env['talk']['id']}/messages/{msg['id']}"
            )
        except Exception:
            pass


def test_03_live_preview_while_typing(env, browser: Browser):
    """入力中にURLを貼ると、投稿前の入力エリアにOGPプレビューが即表示される"""
    ctx = browser.new_context(viewport={"width": 1600, "height": 900})
    ctx.add_cookies([{"name": "kt_session", "value": cookie_value(env["acc_b"]), "url": env["base_url"]}])
    page = ctx.new_page()
    try:
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
        ch_btn = page.locator(f"aside button:has-text('{CH_NAME}')").first
        expect(ch_btn).to_be_visible(timeout=60000)
        ch_btn.click()
        talk_span = page.locator(f"aside span:has-text('{TALK_NAME}')").first
        expect(talk_span).to_be_visible(timeout=30000)
        talk_span.click()

        # --- 投稿フォームを開く（折りたたみの場合） ---
        start_btn = page.locator("button:has-text('新しい投稿をはじめる')")
        if start_btn.count() > 0:
            start_btn.first.click()

        # --- ① URLを入力（まだ投稿しない） ---
        editor = page.locator("[contenteditable=true]").first
        editor.click()
        editor.type(TARGET_URL)

        # --- ② 入力エリア内にプレビューカードが即表示される ---
        composer_area = page.locator("div.border-t").last
        card = composer_area.locator("a.group").first
        expect(card).to_be_visible(timeout=30000)
        expect(card.locator("text=github.com").first).to_be_visible(timeout=10000)
        page.screenshot(path=".verdent/testing/screenshots/url_preview_live.png", full_page=False)

        # --- ③ URLを消すとプレビューも消える ---
        editor.fill("")
        expect(composer_area.locator("a.group")).to_have_count(0)
    finally:
        ctx.close()

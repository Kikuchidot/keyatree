"""チャット横断検索のE2E試験（試験環境: localhost:3210）

試験内容:
1. API: 本文・ファイル名・テキストファイルの中身を検索できる
2. UI: サイドバーの🔍ボタン → 検索 → 結果クリックで対象トークの該当メッセージへジャンプ
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

CH_NAME = "TEST-横断検索チャンネル"
TALK_NAME = "TEST-横断検索ルーム"
UNIQUE_TEXT = "横断検索テスト検索用キーワード"
UNIQUE_FILE_BODY = "サンプル集計データ 横断検索ファイル中身12345"


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
    client_b = httpx.Client(base_url=base_url, cookies={"kt_session": cookie_value(acc_b)}, timeout=60)

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

    # 本文検索用メッセージ
    r = client_a.post(
        f"/api/task-channels/{channel['id']}/talks/{talk['id']}/messages",
        json={"text": f"これは{UNIQUE_TEXT}を含むメッセージです"},
    )
    assert r.status_code == 200, r.text
    text_msg = r.json()["message"]

    # ファイル中身検索用のテキスト添付
    import base64
    data_url = "data:text/plain;base64," + base64.b64encode(UNIQUE_FILE_BODY.encode()).decode()
    r = client_a.post(
        f"/api/task-channels/{channel['id']}/talks/{talk['id']}/messages",
        json={"text": "集計ファイルを共有します", "attachments": [{"name": "横断検索サンプル.txt", "dataUrl": data_url, "type": "text/plain", "size": len(UNIQUE_FILE_BODY)}]},
    )
    assert r.status_code == 200, r.text
    file_msg = r.json()["message"]

    yield {"base_url": base_url, "acc_a": acc_a, "acc_b": acc_b, "client_a": client_a, "client_b": client_b,
           "channel": channel, "talk": talk, "text_msg": text_msg, "file_msg": file_msg}

    try:
        client_a.delete(f"/api/task-channels/{channel['id']}")
    except Exception:
        pass
    client_a.close()
    client_b.close()


def test_01_api_search_text_and_file_content(env):
    """API: 本文・ファイル名・ファイル中身の検索"""
    client = env["client_b"]

    # 未ログインは拒否
    r = httpx.get(f"{env['base_url']}/api/task-channels/search", params={"q": UNIQUE_TEXT}, timeout=30, follow_redirects=False)
    assert r.status_code in (301, 302, 307, 308, 401)

    # 本文検索
    r = client.get("/api/task-channels/search", params={"q": UNIQUE_TEXT})
    assert r.status_code == 200, r.text
    results = r.json()["results"]
    assert any(x["messageId"] == env["text_msg"]["id"] for x in results), f"本文が引っかからない: {results}"

    # ファイル名検索
    r = client.get("/api/task-channels/search", params={"q": "横断検索サンプル"})
    results = r.json()["results"]
    assert any(x["messageId"] == env["file_msg"]["id"] and x["matchType"] == "file" for x in results), f"ファイル名が引っかからない: {results}"

    # ファイル中身検索
    r = client.get("/api/task-channels/search", params={"q": "横断検索ファイル中身12345"})
    results = r.json()["results"]
    assert any(x["messageId"] == env["file_msg"]["id"] for x in results), f"ファイル中身が引っかからない: {results}"

    # 空クエリは空結果
    r = client.get("/api/task-channels/search", params={"q": " "})
    assert r.json()["results"] == []


def test_02_ui_search_and_jump(env, browser: Browser):
    """UI: 検索モーダル → 結果クリックで対象メッセージへジャンプ"""
    ctx = browser.new_context(viewport={"width": 1600, "height": 900})
    ctx.add_cookies([{"name": "kt_session", "value": cookie_value(env["acc_b"]), "url": env["base_url"]}])
    page = ctx.new_page()
    try:
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")

        # 別のチャンネルを開いた状態から検索でジャンプする
        # --- ① 🔍ボタンで検索モーダルを開く ---
        page.locator("aside button[title='メッセージ・ファイルを横断検索']").click()
        expect(page.locator("text=メッセージ・ファイル検索").first).to_be_visible(timeout=10000)

        # --- ② 本文を検索 ---
        box = page.locator("input[placeholder*='メッセージ本文・ファイル名']")
        box.fill(UNIQUE_TEXT)
        box.press("Enter")
        result = page.locator("button:has-text('横断検索ルーム')", has_text=UNIQUE_TEXT).first
        expect(result).to_be_visible(timeout=30000)

        # --- ③ 結果をクリック → 対象トークが開きメッセージがハイライトされる ---
        result.click()
        expect(page.locator("div[data-message-id]", has_text=UNIQUE_TEXT).first).to_be_visible(timeout=30000)
        page.screenshot(path=".verdent/testing/screenshots/chat_search_jump.png", full_page=False)

        # --- ④ ファイル名検索 ---
        page.locator("aside button[title='メッセージ・ファイルを横断検索']").click()
        box = page.locator("input[placeholder*='メッセージ本文・ファイル名']")
        box.fill("横断検索サンプル")
        box.press("Enter")
        result = page.locator("button:has-text('横断検索サンプル.txt')").first
        expect(result).to_be_visible(timeout=30000)
    finally:
        ctx.close()

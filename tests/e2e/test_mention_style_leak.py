"""メンション装飾スタイル漏れ（装飾エラー）修正のE2E試験

背景:
contenteditable のスタイル継承により、@メンション装飾（.kt-mention-live）の
色・背景が後続入力テキストへ inline style として漏れ、保存データが
`<span style="color: #0369a1">...` のように汚染され、表示側でも
ネストspanのパース不良で生テキスト表示されていた。

試験内容:
1. 表示側: ネストspanを含む既存の壊れたメッセージが生テキストにならず装飾表示される
2. 入力側: 漏れた inline style が入力イベント時に除去され、保存データが汚染されない
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

CH_NAME = "TEST-装飾漏れ検証チャンネル"
TALK_NAME = "TEST-装飾漏れルーム"

# 本番で実際に発生した壊れたメッセージと同じ形式
BROKEN_TEXT = (
    "@全員 \n\n"
    '<span style="color: #0369a1">'
    '<span style="background-color: rgba(14, 165, 233, 0.12)">'
    "**通知試験**</span></span>"
)


def login_api(base_url: str) -> dict:
    r = httpx.post(
        f"{base_url}/api/auth/login",
        json={"email": USER_A["email"], "password": USER_A["password"]},
        timeout=60,
    )
    assert r.status_code == 200 and r.json().get("ok"), f"ログイン失敗: {r.text}"
    return r.json()["account"]


def cookie_value(account: dict) -> str:
    payload = {
        "id": account["id"],
        "name": account["name"],
        "email": account["email"],
        "permissionId": account["permissionId"],
        "permissionName": account["permissionName"],
        "employeeId": account["employeeId"],
    }
    return urllib.parse.quote(json.dumps(payload, ensure_ascii=False))


@pytest.fixture(scope="module")
def env(base_url):
    acc = login_api(base_url)
    client = httpx.Client(
        base_url=base_url, cookies={"kt_session": cookie_value(acc)}, timeout=60
    )

    r = client.get("/api/task-channels")
    for c in (r.json().get("channels") or []) + (r.json().get("archivedChannels") or []):
        if c.get("name") == CH_NAME:
            client.delete(f"/api/task-channels/{c['id']}")

    r = client.post("/api/task-channels", json={"name": CH_NAME, "members": []})
    assert r.status_code == 200, f"チャンネル作成失敗: {r.text}"
    channel = r.json()["channel"]

    r = client.post(
        f"/api/task-channels/{channel['id']}/talks",
        json={"name": TALK_NAME, "members": []},
    )
    assert r.status_code == 200, f"トーク作成失敗: {r.text}"
    talk = r.json()["talk"]

    # 壊れた形式のメッセージを投稿（表示側検証用）
    r = client.post(
        f"/api/task-channels/{channel['id']}/talks/{talk['id']}/messages",
        json={
            "text": BROKEN_TEXT,
            "mentions": [{"id": "__all__", "name": "全員"}],
        },
    )
    assert r.status_code == 200, f"メッセージ投稿失敗: {r.text}"

    yield {"base_url": base_url, "acc": acc, "client": client, "channel": channel, "talk": talk}

    try:
        client.delete(f"/api/task-channels/{channel['id']}")
    except Exception:
        pass
    client.close()


def open_talk(browser: Browser, env):
    """チャット一覧ページで対象チャンネル・トークを選択した状態のページを返す"""
    ctx = browser.new_context(viewport={"width": 1600, "height": 900})
    ctx.add_cookies(
        [{"name": "kt_session", "value": cookie_value(env["acc"]), "url": env["base_url"]}]
    )
    page = ctx.new_page()
    page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
    ch_btn = page.locator(f"aside button:has-text('{CH_NAME}')").first
    expect(ch_btn).to_be_visible(timeout=60000)
    ch_btn.click()
    talk_span = page.locator(f"aside span:has-text('{TALK_NAME}')").first
    expect(talk_span).to_be_visible(timeout=30000)
    talk_span.click()
    return ctx, page


def test_01_nested_span_renders_without_raw_text(env, browser):
    """表示側: ネストspanを含む壊れたメッセージが生テキスト表示されない"""
    ctx, page = open_talk(browser, env)
    try:
        # 生テキストとして <span style= が見えていないこと
        expect(page.locator("text=<span style=")).to_have_count(0, timeout=60000)
        # 太字部分が装飾要素として描画されていること
        bold = page.locator("main strong:has-text('通知試験')").first
        expect(bold).to_be_visible(timeout=30000)
        page.screenshot(
            path=".verdent/testing/screenshots/leak_01_render.png", full_page=False
        )
    finally:
        ctx.close()


def test_02_input_strips_leaked_styles(env, browser):
    """入力側: メンション装飾由来の漏れスタイルが除去され保存データを汚染しない"""
    ctx, page = open_talk(browser, env)
    try:
        # 投稿フォームを開く（折りたたみ状態の場合）
        start_btn = page.locator("button:has-text('新しい投稿をはじめる')")
        if start_btn.count() > 0:
            start_btn.first.click()
        editor = page.locator("main div[contenteditable]").first
        expect(editor).to_be_visible(timeout=30000)
        editor.click()

        # @全員 を候補から挿入
        page.keyboard.insert_text("@")
        suggestion = page.locator("button:has-text('@全員')").first
        expect(suggestion).to_be_visible(timeout=10000)
        suggestion.click()

        # Chromeのスタイル継承で発生する漏れを再現（inline style + font-weight の複製）
        page.evaluate(
            """() => {
              const el = document.querySelector('main div[contenteditable]');
              const leak = document.createElement('span');
              leak.setAttribute(
                'style',
                'color: rgb(3, 105, 161); background-color: rgba(14, 165, 233, 0.12); font-weight: 700;'
              );
              leak.textContent = '漏れテスト';
              el.appendChild(leak);
              el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            }"""
        )
        page.wait_for_timeout(300)

        # 漏れスタイルが除去されていること（span 自体は残ってよい）
        leaked = page.evaluate(
            """() => {
              const el = document.querySelector('main div[contenteditable]');
              return Array.from(el.querySelectorAll('span'))
                .filter((s) => !s.classList.contains('kt-mention-live'))
                .filter((s) =>
                  /rgb\\(\\s*3\\s*,\\s*105\\s*,\\s*161/.test(s.style.color) ||
                  /14\\s*,\\s*165\\s*,\\s*233/.test(s.style.backgroundColor)
                ).length;
            }"""
        )
        assert leaked == 0, "漏れスタイルが除去されていない"

        # 送信して保存データを確認
        page.keyboard.press("Meta+Enter")
        page.wait_for_timeout(1500)

        r = env["client"].get(
            f"/api/task-channels/{env['channel']['id']}/talks/{env['talk']['id']}/messages"
        )
        messages = r.json().get("messages", [])
        last = messages[-1]["text"]
        assert "0369a1" not in last and "3, 105, 161" not in last, f"色漏れが保存された: {last}"
        assert "14, 165, 233" not in last, f"背景漏れが保存された: {last}"
        assert "漏れテスト" in last, f"本文が保存されていない: {last}"
        assert "<span" not in last, f"不要なspanが保存された: {last}"
        page.screenshot(
            path=".verdent/testing/screenshots/leak_02_sent.png", full_page=False
        )
    finally:
        ctx.close()

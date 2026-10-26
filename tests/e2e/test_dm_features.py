"""DM（ダイレクトチャット）のチャンネル機能パリティE2E試験（試験環境: localhost:3210）

試験内容:
1. API: DMで parentId（スレッド返信）と quote（引用）を受け付ける
2. UI: 「スレッドで返信」から返信を送信 → スレッド内に表示
3. UI: 「引用」ボタンで引用下書き → 送信 → 引用ブロック表示
4. UI: 装飾ツールバー・ファイル検索ボタンが存在
"""

import json
import urllib.parse

import httpx
import pytest
from playwright.sync_api import expect, Browser

USER_A = {  # 管理者
    "email": "k.sugita@365keyaki.onmicrosoft.com",
    "password": "R?3Qxg9tX%b@EmJ5",
}
USER_B = {  # 一般社員
    "email": "suzuki@keyaki-s.com",
    "password": "*Ub9F+cWbQGCcHpn",
}


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

    # A→B のDMを確保
    r = client_a.get("/api/dm-channels")
    existing = next(
        (d for d in r.json().get("dmChannels", []) if d.get("peer", {}).get("id") == acc_b["employeeId"]),
        None,
    )
    if existing:
        dm_id = existing["id"]
    else:
        r = client_a.post(
            "/api/dm-channels",
            json={"recipientId": acc_b["employeeId"], "recipientName": acc_b["name"]},
        )
        assert r.status_code == 200, f"DM作成失敗: {r.text}"
        dm_id = r.json()["channel"]["id"]

    yield {"base_url": base_url, "acc_a": acc_a, "acc_b": acc_b,
           "client_a": client_a, "client_b": client_b, "dm_id": dm_id}

    client_a.close()
    client_b.close()


def test_01_api_reply_and_quote(env):
    """API: DMでスレッド返信（parentId）と引用（quote）を投稿できる"""
    # 親メッセージ
    r = env["client_a"].post(
        f"/api/dm-channels/{env['dm_id']}/messages",
        json={"text": "DM機能試験の親メッセージ"},
    )
    assert r.status_code == 200, r.text
    parent = r.json()["message"]

    # スレッド返信
    r = env["client_b"].post(
        f"/api/dm-channels/{env['dm_id']}/messages",
        json={"text": "DMスレッド返信テスト", "parentId": parent["id"]},
    )
    assert r.status_code == 200, r.text
    reply = r.json()["message"]
    assert reply.get("parentId") == parent["id"], f"parentIdが保存されていない: {reply}"

    # 引用投稿
    r = env["client_b"].post(
        f"/api/dm-channels/{env['dm_id']}/messages",
        json={
            "text": "DM引用テスト",
            "quote": {"messageId": parent["id"], "talkId": parent["talkId"], "channelId": parent["channelId"]},
        },
    )
    assert r.status_code == 200, r.text
    quoted = r.json()["message"]
    assert quoted.get("quote", {}).get("messageId") == parent["id"], f"quoteが解決されていない: {quoted}"
    assert quoted["quote"]["authorName"], "引用元の投稿者名が空"

    # 後片付け（自分の投稿のみ削除可能なので投稿者ごとのクライアントで削除）
    for mid in (reply["id"], quoted["id"]):
        env["client_b"].delete(f"/api/dm-channels/{env['dm_id']}/messages?messageId={mid}")
    env["client_a"].delete(f"/api/dm-channels/{env['dm_id']}/messages?messageId={parent['id']}")


def test_02_ui_reply_and_quote_and_toolbar(env, browser: Browser):
    """UI: 返信フォーム・引用・装飾ツールバー・ファイル検索の動作"""
    # 親メッセージを用意
    r = env["client_a"].post(
        f"/api/dm-channels/{env['dm_id']}/messages",
        json={"text": "DM返信UI試験の親"},
    )
    assert r.status_code == 200, r.text
    parent = r.json()["message"]

    ctx = browser.new_context(viewport={"width": 1600, "height": 900})
    ctx.add_cookies([{"name": "kt_session", "value": cookie_value(env["acc_b"]), "url": env["base_url"]}])
    page = ctx.new_page()
    reply_msg_id = None
    quote_msg_id = None
    try:
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
        page.locator("aside button:has-text('ダイレクト')").first.click()
        peer_row = page.locator(f"aside button:has-text('{env['acc_a']['name']}')").first
        expect(peer_row).to_be_visible(timeout=60000)
        peer_row.click()
        expect(page.locator("text=DM返信UI試験の親").first).to_be_visible(timeout=30000)

        # --- ① 装飾ツールバーとファイル検索ボタンが存在 ---
        expect(page.locator("button:has-text('検索')").first).to_be_visible()
        expect(page.locator("button[title='太字（⌘B）']").first).to_be_visible()

        # --- ② スレッドで返信 ---
        card = page.locator("div.rounded-xl", has_text="DM返信UI試験の親").last
        card.locator("button:has-text('スレッドで返信')").click()
        reply_form = page.locator("[data-reply-form]").first
        expect(reply_form).to_be_visible(timeout=10000)
        reply_form.locator("[contenteditable=true]").first.click()
        reply_form.locator("[contenteditable=true]").first.type("スレッド返信の本文")
        reply_form.locator("button:has-text('返信')").click()
        expect(card.locator("text=スレッド返信の本文")).to_be_visible(timeout=30000)
        expect(card.locator("button:has-text('スレッドで返信（1）')")).to_be_visible(timeout=10000)

        # --- ③ 引用して送信 ---
        row = card.locator("div[data-message-id]", has_text="DM返信UI試験の親").first
        row.hover()
        row.locator("button:has-text('引用')").click()
        expect(page.locator("text=❝ 引用").first).to_be_visible(timeout=10000)
        editor = page.locator("div.border-t [contenteditable=true]").last
        editor.click()
        editor.type("引用つき送信")
        page.locator("button:has-text('送信')").last.click()
        quote_msg = page.locator("div[data-message-id]", has_text="引用つき送信").last
        expect(quote_msg).to_be_visible(timeout=30000)
        expect(quote_msg.locator("text=❝ 引用")).to_be_visible()
        page.screenshot(path=".verdent/testing/screenshots/dm_reply_quote.png", full_page=False)

        # 送信したメッセージIDを後片付け用に取得
        d = env["client_a"].get(f"/api/dm-channels/{env['dm_id']}/messages").json()
        for m in d.get("messages", []):
            if m.get("text") == "スレッド返信の本文":
                reply_msg_id = m["id"]
            if "引用つき送信" in (m.get("text") or ""):
                quote_msg_id = m["id"]
    finally:
        ctx.close()
        # 自分の投稿のみ削除可能なので投稿者ごとのクライアントで削除
        for mid in (reply_msg_id, quote_msg_id):
            if mid:
                try:
                    env["client_b"].delete(f"/api/dm-channels/{env['dm_id']}/messages?messageId={mid}")
                except Exception:
                    pass
        try:
            env["client_a"].delete(f"/api/dm-channels/{env['dm_id']}/messages?messageId={parent['id']}")
        except Exception:
            pass


def test_03_cannot_delete_others_message(env):
    """API: 他者の投稿は削除できない（403）、自分の投稿は削除できる"""
    # A が投稿 → B が削除を試みる → 403
    r = env["client_a"].post(
        f"/api/dm-channels/{env['dm_id']}/messages",
        json={"text": "削除権限テスト（Aの投稿）"},
    )
    assert r.status_code == 200, r.text
    msg = r.json()["message"]

    r = env["client_b"].delete(f"/api/dm-channels/{env['dm_id']}/messages?messageId={msg['id']}")
    assert r.status_code == 403, f"他者の投稿が削除できてしまう: {r.status_code} {r.text}"

    # 本人は削除できる
    r = env["client_a"].delete(f"/api/dm-channels/{env['dm_id']}/messages?messageId={msg['id']}")
    assert r.status_code == 200, f"自分の投稿が削除できない: {r.status_code} {r.text}"

    d = env["client_a"].get(f"/api/dm-channels/{env['dm_id']}/messages").json()
    assert all(m["id"] != msg["id"] for m in d.get("messages", [])), "削除が反映されていない"


CH_NAME = "TEST-削除権限チャンネル"


def test_04_channel_cannot_delete_others_message(env, browser: Browser):
    """チャンネル: 他者の投稿はAPIでもUIでも削除できない"""
    r = env["client_a"].get("/api/task-channels")
    for c in (r.json().get("channels") or []) + (r.json().get("archivedChannels") or []):
        if c.get("name") == CH_NAME:
            env["client_a"].delete(f"/api/task-channels/{c['id']}")

    r = env["client_a"].post(
        "/api/task-channels",
        json={"name": CH_NAME, "members": [{"id": env["acc_b"]["employeeId"], "name": env["acc_b"]["name"]}]},
    )
    assert r.status_code == 200, r.text
    channel = r.json()["channel"]
    r = env["client_a"].post(
        f"/api/task-channels/{channel['id']}/talks",
        json={"name": "TEST-削除権限ルーム", "members": [{"id": env["acc_b"]["employeeId"], "name": env["acc_b"]["name"]}]},
    )
    assert r.status_code == 200, r.text
    talk = r.json()["talk"]
    r = env["client_a"].post(
        f"/api/task-channels/{channel['id']}/talks/{talk['id']}/messages",
        json={"text": "削除権限テストのチャンネル投稿"},
    )
    assert r.status_code == 200, r.text
    msg = r.json()["message"]

    ctx = browser.new_context(viewport={"width": 1600, "height": 900})
    ctx.add_cookies([{"name": "kt_session", "value": cookie_value(env["acc_b"]), "url": env["base_url"]}])
    page = ctx.new_page()
    try:
        # --- API: B が削除を試みる → 403 ---
        r = env["client_b"].delete(
            f"/api/task-channels/{channel['id']}/talks/{talk['id']}/messages/{msg['id']}"
        )
        assert r.status_code == 403, f"他者の投稿が削除できてしまう: {r.status_code} {r.text}"

        # --- UI: B の画面で他者の投稿に削除ボタンが出ない ---
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
        ch_btn = page.locator(f"aside button:has-text('{CH_NAME}')").first
        expect(ch_btn).to_be_visible(timeout=60000)
        ch_btn.click()
        talk_span = page.locator("aside span:has-text('TEST-削除権限ルーム')").first
        expect(talk_span).to_be_visible(timeout=30000)
        talk_span.click()
        row = page.locator("div[data-message-id]", has_text="削除権限テストのチャンネル投稿").first
        expect(row).to_be_visible(timeout=30000)
        row.hover()
        assert row.locator("button:has-text('削除')").count() == 0, "他者の投稿に削除ボタンが表示されている"
        # 未読に戻す等の他の操作は引き続き使える
        expect(row.locator("button:has-text('未読に戻す')")).to_be_attached(timeout=10000)
        page.screenshot(path=".verdent/testing/screenshots/no_delete_others.png", full_page=False)
    finally:
        ctx.close()
        try:
            env["client_a"].delete(f"/api/task-channels/{channel['id']}/talks/{talk['id']}/messages/{msg['id']}")
            env["client_a"].delete(f"/api/task-channels/{channel['id']}")
        except Exception:
            pass

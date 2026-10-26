"""未読バッジ機能のE2E試験（試験環境: localhost:3210 の dev server / Supabase接続）

試験内容:
1. API: 未読集計 (/api/task-channels/unread)
2. UI: チャット一覧のチャンネル/トーク未読バッジ
3. UI: マイページのチャット未読パネル
4. UI: トークを開いたら自動既読化
5. UI: DM未読バッジ
6. UI: 入力中メンションの色装飾（候補選択 & 手入力）

 NOTE: 試験専用のチャンネル・トークを作成し、終了時に削除する。
"""

import json
import urllib.parse

import httpx
import pytest
from playwright.sync_api import expect, Browser, Page

# ---- 試験アカウント ----
USER_A = {  # 投稿者（管理者）
    "email": "k.sugita@365keyaki.onmicrosoft.com",
    "password": "R?3Qxg9tX%b@EmJ5",
}
USER_B = {  # 受信者（一般社員）
    "email": "suzuki@keyaki-s.com",
    "password": "*Ub9F+cWbQGCcHpn",
}

CH_NAME = "TEST-未読検証チャンネル"
TALK_NAME = "TEST-未読検証ルーム"


def login_api(base_url: str, email: str, password: str) -> dict:
    r = httpx.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
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


def browser_cookies(base_url: str, account: dict) -> list:
    return [{"name": "kt_session", "value": cookie_value(account), "url": base_url}]


@pytest.fixture(scope="module")
def env(base_url):
    """試験データの準備（A=杉田 がチャンネル・トークを作成してメッセージ投稿）"""
    acc_a = login_api(base_url, USER_A["email"], USER_A["password"])
    acc_b = login_api(base_url, USER_B["email"], USER_B["password"])
    client_a = httpx.Client(
        base_url=base_url, cookies={"kt_session": cookie_value(acc_a)}, timeout=60
    )
    client_b = httpx.Client(
        base_url=base_url, cookies={"kt_session": cookie_value(acc_b)}, timeout=60
    )

    # 受信者Bのスタッフ情報が無い環境（メモリモード）に備えて登録
    staff_b_created = False
    if not client_a.get(f"/api/staff/{acc_b['employeeId']}").json().get("staff"):
        r = client_a.post(
            "/api/staff",
            json={
                "employee": {
                    "id": acc_b["employeeId"],
                    "name": acc_b["name"],
                    "team": "LT",
                    "joinedAt": "2024-04-01",
                }
            },
        )
        assert r.status_code == 200, f"スタッフ作成失敗: {r.text}"
        staff_b_created = True

    # 既存の試験チャンネルが残っていれば削除してから作り直す
    r = client_a.get("/api/task-channels")
    for c in (r.json().get("channels") or []) + (r.json().get("archivedChannels") or []):
        if c.get("name") == CH_NAME:
            client_a.delete(f"/api/task-channels/{c['id']}")

    r = client_a.post(
        "/api/task-channels",
        json={"name": CH_NAME, "members": [{"id": acc_b["employeeId"], "name": acc_b["name"]}]},
    )
    assert r.status_code == 200, f"チャンネル作成失敗: {r.text}"
    channel = r.json()["channel"]

    r = client_a.post(
        f"/api/task-channels/{channel['id']}/talks",
        json={"name": TALK_NAME, "members": [{"id": acc_b["employeeId"], "name": acc_b["name"]}]},
    )
    assert r.status_code == 200, f"トーク作成失敗: {r.text}"
    talk = r.json()["talk"]

    r = client_a.post(
        f"/api/task-channels/{channel['id']}/talks/{talk['id']}/messages",
        json={"text": "未読テストメッセージです（自動試験）"},
    )
    assert r.status_code == 200, f"メッセージ投稿失敗: {r.text}"

    yield {
        "base_url": base_url,
        "acc_a": acc_a,
        "acc_b": acc_b,
        "client_a": client_a,
        "client_b": client_b,
        "channel": channel,
        "talk": talk,
        "staff_b_created": staff_b_created,
    }

    # ---- 後片付け: 試験チャンネルごと削除（トーク・メッセージもcascade） ----
    try:
        client_a.delete(f"/api/task-channels/{channel['id']}")
    except Exception:
        pass
    if staff_b_created:
        try:
            client_a.delete(f"/api/staff/{acc_b['employeeId']}")
        except Exception:
            pass
    client_a.close()
    client_b.close()


def new_ctx(browser: Browser, base_url: str, account: dict):
    ctx = browser.new_context(viewport={"width": 1600, "height": 900})
    ctx.add_cookies(browser_cookies(base_url, account))
    return ctx


def badge_in_row(row):
    """行（ Locator ）内の未読バッジ"""
    return row.locator("span.bg-rose-500")


def test_01_api_unread_count(env):
    """API: B の未読集計に投稿したトークが含まれる"""
    r = env["client_b"].get("/api/task-channels/unread")
    assert r.status_code == 200, r.text
    d = r.json()
    tid = env["talk"]["id"]
    cid = env["channel"]["id"]
    assert d["byTalk"].get(tid, 0) >= 1, f"トーク未読が集計されていない: {d}"
    assert d["byChannel"].get(cid, 0) >= 1, f"チャンネル未読が集計されていない: {d}"
    assert d["total"] >= 1
    item = next((c for c in d.get("channelItems", []) if c["id"] == cid), None)
    assert item and item["unread"] >= 1 and item["name"] == CH_NAME, f"channelItems 不正: {d}"


def test_02_ui_channel_and_talk_badges(env, browser):
    """UI: チャット一覧でチャンネル・トーク行に未読バッジが出る"""
    ctx = new_ctx(browser, env["base_url"], env["acc_b"])
    page = ctx.new_page()
    try:
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
        ch_btn = page.locator(f"aside button:has-text('{CH_NAME}')").first
        expect(ch_btn).to_be_visible(timeout=60000)
        row = ch_btn.locator("xpath=..")
        badge = badge_in_row(row)
        expect(badge).to_be_visible(timeout=20000)
        # チャンネルを選択するとトーク一覧が読み込まれて展開表示される
        ch_btn.click()
        talk_span = page.locator(f"aside span:has-text('{TALK_NAME}')").first
        expect(talk_span).to_be_visible(timeout=30000)
        talk_row = talk_span.locator("xpath=..")
        expect(badge_in_row(talk_row)).to_be_visible(timeout=20000)
        page.screenshot(path=".verdent/testing/screenshots/02_channel_badge.png", full_page=False)
    finally:
        ctx.close()


def test_03_mypage_unread_panel(env, browser):
    """UI: マイページにチャット未読パネルが出る"""
    ctx = new_ctx(browser, env["base_url"], env["acc_b"])
    page = ctx.new_page()
    try:
        page.goto(f"{env['base_url']}/employees/{env['acc_b']['employeeId']}", wait_until="domcontentloaded")
        panel = page.locator("text=チャット未読").first
        expect(panel).to_be_visible(timeout=60000)
        expect(page.locator(f"text={CH_NAME}").first).to_be_visible()
        expect(page.locator("text=チャットを開く").first).to_be_visible()
        page.screenshot(path=".verdent/testing/screenshots/03_mypage_panel.png", full_page=False)
    finally:
        ctx.close()


def test_04_open_talk_clears_badge(env, browser):
    """UI: トークを開いたらバッジが消え、API上も既読になる"""
    ctx = new_ctx(browser, env["base_url"], env["acc_b"])
    page = ctx.new_page()
    try:
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
        ch_btn = page.locator(f"aside button:has-text('{CH_NAME}')").first
        expect(ch_btn).to_be_visible(timeout=60000)
        ch_btn.click()
        talk_span = page.locator(f"aside span:has-text('{TALK_NAME}')").first
        expect(talk_span).to_be_visible(timeout=30000)
        talk_row = talk_span.locator("xpath=..")
        expect(badge_in_row(talk_row)).to_be_visible(timeout=20000)
        # トークを開く
        talk_span.click()
        # バッジが消える
        expect(badge_in_row(talk_row)).to_have_count(0, timeout=20000)
        # 投稿したメッセージが見える
        expect(page.locator("text=未読テストメッセージです（自動試験）").first).to_be_visible(timeout=20000)
        page.screenshot(path=".verdent/testing/screenshots/04_talk_opened.png", full_page=False)
        # APIでも既読になっている
        r = env["client_b"].get("/api/task-channels/unread")
        d = r.json()
        assert d["byTalk"].get(env["talk"]["id"], 0) == 0, f"既読化されていない: {d}"
    finally:
        ctx.close()


def test_05_mypage_panel_clears(env, browser):
    """UI: 既読後はマイページのパネルに対象チャンネルが載らなくなる"""
    ctx = new_ctx(browser, env["base_url"], env["acc_b"])
    page = ctx.new_page()
    try:
        page.goto(f"{env['base_url']}/employees/{env['acc_b']['employeeId']}", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        # 試験チャンネルは未読パネルに載っていない（他の未読でパネル自体は出る場合がある）
        assert page.locator(f"text={CH_NAME}").count() == 0, "既読済みチャンネルがパネルに残っている"
    finally:
        ctx.close()


def test_06_dm_unread_badge(env, browser):
    """UI: DMの未読バッジと既読化"""
    # A が B へ DM を送る
    r = env["client_a"].get("/api/dm-channels")
    pre_existing = next(
        (d for d in r.json().get("dmChannels", []) if d.get("peer", {}).get("id") == env["acc_b"]["employeeId"]),
        None,
    )
    if pre_existing:
        dm_id = pre_existing["id"]
        dm_talk_id = pre_existing.get("talkId")
        created = False
    else:
        r = env["client_a"].post(
            "/api/dm-channels",
            json={"recipientId": env["acc_b"]["employeeId"], "recipientName": env["acc_b"]["name"]},
        )
        assert r.status_code == 200, r.text
        dm_id = r.json()["channel"]["id"]
        dm_talk_id = r.json().get("talkId")
        created = True

    r = env["client_a"].post(
        f"/api/dm-channels/{dm_id}/messages",
        json={"text": "DM未読テスト（自動試験）"},
    )
    assert r.status_code == 200, r.text
    sent_msg = r.json().get("message") or {}

    ctx = new_ctx(browser, env["base_url"], env["acc_b"])
    page = ctx.new_page()
    try:
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
        page.wait_for_selector("aside button:has-text('チャネル')", timeout=60000)
        # DMタブへ
        page.locator("aside button:has-text('ダイレクト')").first.click()
        peer_row = page.locator(f"aside button:has-text('{env['acc_a']['name']}')").first
        expect(peer_row).to_be_visible(timeout=30000)
        expect(badge_in_row(peer_row)).to_be_visible(timeout=20000)
        # DMを開いて既読化
        peer_row.click()
        expect(page.locator("text=DM未読テスト（自動試験）").first).to_be_visible(timeout=30000)
        page.wait_for_timeout(500)
        expect(badge_in_row(peer_row)).to_have_count(0, timeout=20000)
        page.screenshot(path=".verdent/testing/screenshots/06_dm_opened.png", full_page=False)
    finally:
        ctx.close()
        # 後片付け: テストメッセージ削除（DM自体は残す / 試験で新規作成した場合のみ削除）
        try:
            if sent_msg.get("id"):
                env["client_a"].delete(f"/api/dm-channels/{dm_id}/messages?messageId={sent_msg['id']}")
            if created:
                env["client_a"].delete(f"/api/task-channels/{dm_id}")
        except Exception:
            pass


def test_07_mention_decoration(env, browser):
    """UI: 入力中のメンションが色装飾される（候補選択 & 手入力）"""
    ctx = new_ctx(browser, env["base_url"], env["acc_a"])
    page = ctx.new_page()
    try:
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
        ch_btn = page.locator(f"aside button:has-text('{CH_NAME}')").first
        expect(ch_btn).to_be_visible(timeout=60000)
        ch_btn.click()
        talk_span = page.locator(f"aside span:has-text('{TALK_NAME}')").first
        expect(talk_span).to_be_visible(timeout=30000)
        talk_span.click()
        # 投稿フォームを開く（折りたたみ状態の場合）
        start_btn = page.locator("button:has-text('新しい投稿をはじめる')")
        if start_btn.count() > 0:
            start_btn.first.click()
        editor = page.locator("main div[contenteditable]").first
        expect(editor).to_be_visible(timeout=30000)
        editor.click()

        # --- ① 候補選択で @全員 を挿入 ---
        page.keyboard.insert_text("@")
        sug = page.locator("button:has-text('@全員')").first
        expect(sug).to_be_visible(timeout=10000)
        sug.click()
        mention = page.locator("main div[contenteditable] span.kt-mention-live").first
        expect(mention).to_be_visible(timeout=10000)
        assert "kt-mention-all" in (mention.get_attribute("class") or "")
        assert (mention.text_content() or "").strip() == "@全員"

        # composerをクリア
        page.keyboard.press("Meta+a")
        page.keyboard.press("Backspace")

        # --- ② 手入力でメンバー名（空白を含む名前）を完成させる ---
        page.keyboard.insert_text(f"@{env['acc_b']['name']} ")
        mention2 = page.locator("main div[contenteditable] span.kt-mention-live").first
        expect(mention2).to_be_visible(timeout=10000)
        assert (mention2.text_content() or "").strip() == f"@{env['acc_b']['name']}"
        page.screenshot(path=".verdent/testing/screenshots/07_mention_decoration.png", full_page=False)

        # --- ③ シリアライズ結果（本文テキスト）は装飾なしのプレーンテキストのまま ---
        editor_text = editor.text_content() or ""
        assert f"@{env['acc_b']['name']}" in editor_text.replace("\xa0", " ")

        # クリアして終了（送信はしない）
        page.keyboard.press("Meta+a")
        page.keyboard.press("Backspace")
    finally:
        ctx.close()

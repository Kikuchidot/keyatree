"""「未読に戻す」機能のE2E試験（試験環境: localhost:3210）

試験内容:
1. Bがトークを開いて既読化 → 未読バッジが消える
2. Bがメッセージの「未読に戻す」を押す → サイドバーのトーク/チャンネルバッジが即座に復活
3. 開いたままのトークが自動既読化で即座に戻らないこと
4. マイページのチャット未読パネルに対象トークが表示される
"""

import json
import urllib.parse

import httpx
import pytest
from playwright.sync_api import expect, Browser

USER_A = {  # 投稿者（管理者）
    "email": "k.sugita@365keyaki.onmicrosoft.com",
    "password": "R?3Qxg9tX%b@EmJ5",
}
USER_B = {  # 未読に戻す操作者（一般社員）
    "email": "suzuki@keyaki-s.com",
    "password": "*Ub9F+cWbQGCcHpn",
}

CH_NAME = "TEST-未読戻しチャンネル"
TALK_NAME = "TEST-未読戻しルーム"


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

    # Bのスタッフ登録（メモリモード環境向け）
    staff_b_created = False
    if not client_a.get(f"/api/staff/{acc_b['employeeId']}").json().get("staff"):
        r = client_a.post(
            "/api/staff",
            json={"employee": {"id": acc_b["employeeId"], "name": acc_b["name"], "team": "LT", "joinedAt": "2024-04-01"}},
        )
        assert r.status_code == 200, f"スタッフ作成失敗: {r.text}"
        staff_b_created = True

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

    for text in ("未読戻しテスト1通目", "未読戻しテスト2通目"):
        r = client_a.post(
            f"/api/task-channels/{channel['id']}/talks/{talk['id']}/messages",
            json={"text": text},
        )
        assert r.status_code == 200, f"メッセージ投稿失敗: {r.text}"

    # 自分の投稿も「未読に戻す」の通知対象になることを検証する
    r = client_b.post(
        f"/api/task-channels/{channel['id']}/talks/{talk['id']}/messages",
        json={"text": "自分の投稿を未読に戻すテスト"},
    )
    assert r.status_code == 200, f"自分のメッセージ投稿失敗: {r.text}"

    yield {"base_url": base_url, "acc_a": acc_a, "acc_b": acc_b, "client_a": client_a, "client_b": client_b,
           "channel": channel, "talk": talk, "staff_b_created": staff_b_created}

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


def test_01_mark_unread_restores_badges_and_mypage(env, browser: Browser):
    """既読後に「未読に戻す」→ バッジ復活・自動既読化されない・マイページに通知表示"""
    ctx = browser.new_context(viewport={"width": 1600, "height": 900})
    ctx.add_cookies([{"name": "kt_session", "value": cookie_value(env["acc_b"]), "url": env["base_url"]}])
    page = ctx.new_page()
    try:
        # --- ① トークを開いて既読化 ---
        page.goto(f"{env['base_url']}/tasks/channels", wait_until="domcontentloaded")
        ch_btn = page.locator(f"aside button:has-text('{CH_NAME}')").first
        expect(ch_btn).to_be_visible(timeout=60000)
        ch_btn.click()
        talk_span = page.locator(f"aside span:has-text('{TALK_NAME}')").first
        expect(talk_span).to_be_visible(timeout=30000)
        talk_span.click()
        # メッセージが表示され既読化されるまで待つ
        expect(page.locator("text=未読戻しテスト1通目").first).to_be_visible(timeout=30000)
        talk_row = talk_span.locator("xpath=..")
        expect(talk_row.locator("span.bg-rose-500")).to_have_count(0, timeout=15000)

        # --- ② 自分の投稿にある「未読に戻す」を押す ---
        row = page.locator("div[data-message-id]", has_text="自分の投稿を未読に戻すテスト").first
        row.hover()
        btn = row.locator("button:has-text('未読に戻す')")
        expect(btn).to_be_attached(timeout=10000)
        btn.click(force=True)

        # --- ③ トーク/チャンネルの未読バッジが即座に復活 ---
        expect(talk_row.locator("span.bg-rose-500")).to_be_visible(timeout=15000)
        ch_row = ch_btn.locator("xpath=..")
        expect(ch_row.locator("span.bg-rose-500")).to_be_visible(timeout=15000)

        # --- ④ 開いたままのトークが自動既読化で即座に戻らない ---
        page.wait_for_timeout(3000)
        expect(talk_row.locator("span.bg-rose-500")).to_be_visible()

        # --- ⑤ APIでも自分の投稿1件分が未読として集計される ---
        d = env["client_b"].get("/api/task-channels/unread").json()
        assert d["byTalk"].get(env["talk"]["id"], 0) == 1, f"自分の投稿の未読が集計されない: {d}"
        assert any(item["talkId"] == env["talk"]["id"] for item in d["channelItems"]), "未読通知リストに含まれない"
        page.screenshot(path=".verdent/testing/screenshots/unread_restore_badge.png", full_page=False)

        # --- ⑥ マイページの未読パネルに表示される ---
        page.goto(f"{env['base_url']}/employees/{env['acc_b']['employeeId']}", wait_until="domcontentloaded")
        panel = page.locator("text=チャット未読").first
        expect(panel).to_be_visible(timeout=60000)
        expect(page.locator(f"text={TALK_NAME}").first).to_be_visible(timeout=30000)
        page.screenshot(path=".verdent/testing/screenshots/unread_restore_mypage.png", full_page=False)
    finally:
        ctx.close()

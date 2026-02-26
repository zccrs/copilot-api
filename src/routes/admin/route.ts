/* eslint-disable max-lines */
import { Hono } from "hono"

import {
  clearAdminSession,
  isAdminAuthenticated,
  isAdminConfigured,
  requireAdminAuth,
  setAdminSession,
  validateAdminCredentials,
} from "~/lib/admin-auth"
import {
  createManagedApiKey,
  deleteManagedApiKey,
  getManagedApiKeyById,
  getManagedApiKeyAuditPage,
  getManagedApiKeyUsageByRange,
  getManagedApiKeyUsageSummary,
  listManagedApiKeys,
  ManagedApiKeyError,
  updateManagedApiKeySettings,
} from "~/lib/api-key-store"

export const adminRoutes = new Hono()

const toFormText = (value: unknown): string =>
  typeof value === "string" ? value : ""

const loginPage = `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Copilot API Admin Login</title>
  <script>
    (function () {
      const stored = localStorage.getItem("copilot-admin-theme") || "light";
      document.documentElement.setAttribute(
        "data-theme",
        stored === "dark" ? "dark" : "light",
      );
    })();
  </script>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    .container { max-width: 480px; margin: 80px auto; padding: 24px; background: var(--color-bg-soft); border: 1px solid var(--color-bg-light-2); border-radius: 12px; }
    h1 { margin: 0 0 16px; font-size: 20px; }
    label { display: block; margin: 12px 0 6px; font-size: 14px; color: #cbd5e1; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-bg-light-3); background: var(--color-bg-darkest); color: var(--color-fg-medium); color-scheme: dark; }
    .datetime-input { background: #0b1220; border: 1px solid #475569; color: #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 14px; font-weight: 400; min-width: 228px; text-align: left; white-space: nowrap; padding-right: 40px; box-sizing: border-box; appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e2e8f0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='4' width='18' height='18' rx='2' ry='2'/><line x1='16' y1='2' x2='16' y2='6'/><line x1='8' y1='2' x2='8' y2='6'/><line x1='3' y1='10' x2='21' y2='10'/></svg>"); background-repeat: no-repeat; background-position: right 12px center; background-size: 18px 18px; }
    .datetime-input:focus { border-color: #2563eb; outline: none; }
    input[type="datetime-local"]::-webkit-calendar-picker-indicator { opacity: 0; cursor: pointer; }
    button { margin-top: 16px; width: 100%; padding: 10px 12px; border: none; border-radius: 8px; background: var(--color-blue); color: var(--color-bg-darkest); font-weight: 600; cursor: pointer; }
    .error { margin-top: 12px; color: #f87171; min-height: 20px; font-size: 14px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .theme-toggle { border: 1px solid var(--color-bg-light-3); background: var(--color-bg-soft); color: var(--color-fg-lightest); padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .theme-toggle:hover { border-color: var(--color-blue); color: var(--color-blue); }

    :root {
      --color-red: #cc241d;
      --color-green: #98971a;
      --color-yellow: #d79921;
      --color-blue: #458588;
      --color-purple: #b16286;
      --color-aqua: #689d6a;
      --color-orange: #d65d0e;
      --color-gray: #a89984;
      --color-bg-darkest: #1d2021;
      --color-bg: #282828;
      --color-bg-light-1: #3c3836;
      --color-bg-light-2: #504945;
      --color-bg-light-3: #665c54;
      --color-bg-soft: #32302f;
      --color-fg-dark: #bdae93;
      --color-fg-medium: #d5c4a1;
      --color-fg-light: #ebdbb2;
      --color-fg-lightest: #fbf1c7;
    }

    [data-theme="light"] {
      --color-red: #b91c1c;
      --color-green: #15803d;
      --color-yellow: #b45309;
      --color-blue: #2563eb;
      --color-purple: #7c3aed;
      --color-aqua: #0f766e;
      --color-orange: #c2410c;
      --color-gray: #64748b;
      --color-bg-darkest: #f7f9fc;
      --color-bg: #f1f5f9;
      --color-bg-light-1: #e2e8f0;
      --color-bg-light-2: #d7dee8;
      --color-bg-light-3: #cbd5e1;
      --color-bg-soft: #f1f5f9;
      --color-fg-dark: #1f2937;
      --color-fg-medium: #334155;
      --color-fg-light: #475569;
      --color-fg-lightest: #0f172a;
    }

    body { background: var(--color-bg-darkest); color: var(--color-fg-light); }
  </style>
</head>
<body>
  <div class="container">
    <div class="page-header">
      <h1>Copilot API 管理后台</h1>
      <button id="theme-toggle" class="theme-toggle" type="button">
        <span id="theme-icon">🌞</span>
        <span id="theme-label">Light</span>
      </button>
    </div>
    <form id="login-form">
      <label for="username">用户名</label>
      <input id="username" name="username" autocomplete="username" />
      <label for="password">密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" />
      <button type="submit">登录</button>
      <div class="error" id="error"></div>
    </form>
  </div>
  <script>
    const form = document.getElementById("login-form");
    const themeToggle = document.getElementById("theme-toggle");
    const themeIcon = document.getElementById("theme-icon");
    const themeLabel = document.getElementById("theme-label");
    const THEME_STORAGE_KEY = "copilot-admin-theme";

    function applyTheme(theme) {
      const resolved = theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", resolved);
      themeIcon.textContent = resolved === "dark" ? "🌙" : "🌞";
      themeLabel.textContent = resolved === "dark" ? "Dark" : "Light";
    }
    const error = document.getElementById("error");

    themeToggle.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") ?? "light";
      const nextTheme = current === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });

    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) ?? "light");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      const formData = new FormData(form);
      const payload = {
        username: String(formData.get("username") || ""),
        password: String(formData.get("password") || "")
      };

      const response = await fetch("/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "登录失败" }));
        error.textContent = data.error || "登录失败";
        return;
      }

      location.href = "/admin";
    });
  </script>
</body>
</html>`

const adminPage = `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Copilot API Admin</title>
  <script>
    (function () {
      const stored = localStorage.getItem("copilot-admin-theme") || "light";
      document.documentElement.setAttribute(
        "data-theme",
        stored === "dark" ? "dark" : "light",
      );
    })();
  </script>
  <style>
    :root {
      --color-red: #cc241d;
      --color-green: #98971a;
      --color-yellow: #d79921;
      --color-blue: #458588;
      --color-purple: #b16286;
      --color-aqua: #689d6a;
      --color-orange: #d65d0e;
      --color-gray: #a89984;
      --color-bg-darkest: #1d2021;
      --color-bg: #282828;
      --color-bg-light-1: #3c3836;
      --color-bg-light-2: #504945;
      --color-bg-light-3: #665c54;
      --color-bg-soft: #32302f;
      --color-fg-dark: #bdae93;
      --color-fg-medium: #d5c4a1;
      --color-fg-light: #ebdbb2;
      --color-fg-lightest: #fbf1c7;
    }

    [data-theme="light"] {
      --color-red: #b91c1c;
      --color-green: #15803d;
      --color-yellow: #b45309;
      --color-blue: #2563eb;
      --color-purple: #7c3aed;
      --color-aqua: #0f766e;
      --color-orange: #c2410c;
      --color-gray: #64748b;
      --color-bg-darkest: #f7f9fc;
      --color-bg: #f1f5f9;
      --color-bg-light-1: #e2e8f0;
      --color-bg-light-2: #d7dee8;
      --color-bg-light-3: #cbd5e1;
      --color-bg-soft: #f1f5f9;
      --color-fg-dark: #1f2937;
      --color-fg-medium: #334155;
      --color-fg-light: #475569;
      --color-fg-lightest: #0f172a;
    }

    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: var(--color-bg-darkest); color: var(--color-fg-light); }
    .container { max-width: 1080px; margin: 24px auto; padding: 0 16px; }
    .page-header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: space-between; margin-bottom: 12px; }
    .title { margin: 0; font-size: 22px; }
    .card { background: var(--color-bg-soft); border: 1px solid var(--color-bg-light-2); border-radius: 12px; padding: 16px; margin-top: 16px; }
    .usage-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .usage-item { background: var(--color-bg-darkest); border: 1px solid var(--color-bg-light-2); border-radius: 10px; padding: 12px; }
    .usage-item h4 { margin: 0 0 6px; font-size: 13px; color: var(--color-gray); font-weight: 600; }
    .usage-item .value { font-size: 18px; font-weight: 700; color: var(--color-fg-lightest); }
    .usage-subtle { font-size: 12px; color: var(--color-gray); margin-top: 4px; }
    .usage-progress { height: 6px; background: var(--color-bg-light-2); border-radius: 999px; overflow: hidden; margin-top: 8px; }
    .usage-progress span { display: block; height: 100%; background: var(--color-blue); border-radius: 999px; }
    .new-form { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; }
    input { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-bg-light-3); background: var(--color-bg-darkest); color: var(--color-fg-medium); color-scheme: dark; }
    .datetime-input { background: var(--color-bg-darkest); border: 1px solid var(--color-bg-light-3); color: var(--color-fg-medium); border-radius: 8px; padding: 10px 14px; font-size: 14px; font-weight: 400; min-width: 228px; text-align: left; white-space: nowrap; padding-right: 40px; box-sizing: border-box; appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23d5c4a1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='4' width='18' height='18' rx='2' ry='2'/><line x1='16' y1='2' x2='16' y2='6'/><line x1='8' y1='2' x2='8' y2='6'/><line x1='3' y1='10' x2='21' y2='10'/></svg>"); background-repeat: no-repeat; background-position: right 12px center; background-size: 18px 18px; }
    .datetime-input:focus { border-color: var(--color-blue); outline: none; }
    input[type="datetime-local"]::-webkit-calendar-picker-indicator { opacity: 0; cursor: pointer; }
    button { padding: 10px 12px; border: none; border-radius: 8px; background: var(--color-blue); color: var(--color-bg-darkest); font-weight: 600; cursor: pointer; }
    button.danger { background: var(--color-red); }
    button.secondary { background: var(--color-bg-light-2); color: var(--color-fg-lightest); }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; border-bottom: 1px solid var(--color-bg-light-2); padding: 12px 8px; vertical-align: middle; }
    .muted { color: var(--color-gray); font-size: 13px; }
    .new-token { margin-top: 10px; word-break: break-all; color: #22c55e; min-height: 20px; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    dialog.settings-dialog { border: 1px solid var(--color-bg-light-2); border-radius: 12px; background: var(--color-bg); color: var(--color-fg-light); padding: 16px; width: min(560px, calc(100vw - 24px)); }
    dialog.settings-dialog::backdrop { background: rgba(2, 6, 23, 0.7); }
    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
    .settings-field label { display: block; margin-bottom: 6px; font-size: 13px; color: var(--color-gray); }
    .settings-field input { width: 100%; box-sizing: border-box; }
    .settings-field .datetime-input { width: 100%; }
    .settings-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
    .settings-msg { min-height: 20px; margin-top: 8px; color: var(--color-gray); }
    .theme-toggle { border: 1px solid var(--color-bg-light-3); background: var(--color-bg-soft); color: var(--color-fg-lightest); padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .theme-toggle:hover { border-color: var(--color-blue); color: var(--color-blue); }
  </style>
</head>
<body>
  <div class="container">
    <div class="page-header">
      <h1 class="title">API Key 管理</h1>
      <div>
        <button id="theme-toggle" class="theme-toggle" type="button">
          <span id="theme-icon">🌞</span>
          <span id="theme-label">Light</span>
        </button>
        <button id="refresh" class="secondary">刷新</button>
        <button id="logout" class="danger">退出登录</button>
      </div>
    </div>

    <div class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 16px;">Copilot 用量</h3>
        <span id="usage-updated" class="muted"></span>
      </div>
      <div id="usage-summary" class="usage-grid" style="margin-top: 12px;"></div>
      <div id="usage-meta" class="muted" style="margin-top: 8px;"></div>
    </div>

    <div class="card">
      <div class="new-form">
        <input id="key-name" placeholder="输入 key 名称（如 claude-client）" />
        <button id="create">新建 API Key</button>
        <button id="clear" class="secondary">清空</button>
      </div>
      <div class="muted">新建后只会显示一次完整 key，请立即保存。</div>
      <div class="new-token" id="new-token"></div>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Key 预览</th>
            <th>创建时间</th>
            <th>累计用量</th>
            <th>总上限（次）</th>
            <th>单日上限（次）</th>
            <th>过期时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>

  <dialog id="settings-dialog" class="settings-dialog">
    <h3 id="settings-title" style="margin:0 0 6px;">设置 API Key</h3>
    <div class="settings-grid">
      <div class="settings-field">
        <label for="settings-total-limit">总上限（请求次数，可空）</label>
        <input id="settings-total-limit" type="number" min="0" />
      </div>
      <div class="settings-field">
        <label for="settings-daily-limit">单日上限（请求次数，可空）</label>
        <input id="settings-daily-limit" type="number" min="0" />
      </div>
    </div>
    <div class="settings-field" style="margin-top: 12px;">
      <label for="settings-expires-at">过期时间（可空）</label>
      <input id="settings-expires-at" type="datetime-local" class="datetime-input" />
    </div>
    <div id="settings-msg" class="settings-msg"></div>
    <div class="settings-actions">
      <button id="settings-cancel" class="secondary" type="button">取消</button>
      <button id="settings-save" type="button">保存</button>
    </div>
  </dialog>

  <script>
    const rows = document.getElementById("rows");
    const newToken = document.getElementById("new-token");
    const keyNameInput = document.getElementById("key-name");
    const themeToggle = document.getElementById("theme-toggle");
    const themeIcon = document.getElementById("theme-icon");
    const themeLabel = document.getElementById("theme-label");
    const THEME_STORAGE_KEY = "copilot-admin-theme";
    const settingsDialog = document.getElementById("settings-dialog");
    const settingsTitle = document.getElementById("settings-title");
    const settingsTotalLimitInput = document.getElementById("settings-total-limit");
    const settingsDailyLimitInput = document.getElementById("settings-daily-limit");
    const settingsExpiresAtInput = document.getElementById("settings-expires-at");
    const settingsMsg = document.getElementById("settings-msg");
    const settingsCancelButton = document.getElementById("settings-cancel");
    const settingsSaveButton = document.getElementById("settings-save");
    let currentSettingsKeyId = "";
    let keyItems = [];
    const usageSummary = document.getElementById("usage-summary");
    const usageMeta = document.getElementById("usage-meta");
    const usageUpdated = document.getElementById("usage-updated");

    const pad = (n) => String(n).padStart(2, "0");
    const toDatetimeLocal = (iso) => {
      if (!iso) return "";
      const date = new Date(iso);
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
    };
    const toNullableNumber = (value) => {
      const trimmed = String(value || "").trim();
      if (!trimmed) return null;
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isNaN(parsed) ? null : parsed;
    };

    function closeSettingsDialog() {
      if (settingsDialog.open) {
        settingsDialog.close();
      }
    }

    function openSettingsDialog(item) {
      currentSettingsKeyId = item.id;
      settingsTitle.textContent = "设置 API Key：" + item.id;
      settingsTotalLimitInput.value = item.totalLimit == null ? "" : item.totalLimit;
      settingsDailyLimitInput.value = item.dailyLimit == null ? "" : item.dailyLimit;
      settingsExpiresAtInput.value = toDatetimeLocal(item.expiresAt);
      settingsMsg.textContent = "";
      settingsDialog.showModal();
    }

    function enableDatetimePickerClick() {
      document.querySelectorAll('input[type="datetime-local"]').forEach((input) => {
        input.addEventListener("click", () => {
          if (typeof input.showPicker === "function") {
            input.showPicker();
          }
        });
      });
    }

    function applyTheme(theme) {
      const resolved = theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", resolved);
      themeIcon.textContent = resolved === "dark" ? "🌙" : "🌞";
      themeLabel.textContent = resolved === "dark" ? "Dark" : "Light";
    }

    function formatPercent(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return String(Math.round(value * 10) / 10) + "%";
    }

    function formatNumber(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US");
    }

    function clampPercent(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return 0;
      return Math.max(0, Math.min(100, value));
    }

    function renderUsage(data) {
      if (!usageSummary || !usageMeta || !usageUpdated) {
        return;
      }
      const quota = data && data.quota_snapshots ? data.quota_snapshots : {};
      const items = [];
      const premium = quota.premium_interactions || {};
      const completions = quota.completions || {};
      const chat = quota.chat || {};

      items.push({
        label: "Premium 剩余",
        value: premium.unlimited ? "Unlimited" : formatNumber(premium.remaining),
        sub: premium.unlimited ? "无限制" : "剩余 " + formatPercent(premium.percent_remaining),
        percent: premium.unlimited ? 100 : clampPercent(premium.percent_remaining),
      });
      items.push({
        label: "Completions 剩余",
        value: completions.unlimited ? "Unlimited" : formatNumber(completions.remaining),
        sub: completions.unlimited ? "无限制" : "剩余 " + formatPercent(completions.percent_remaining),
        percent: completions.unlimited ? 100 : clampPercent(completions.percent_remaining),
      });
      items.push({
        label: "Chat 剩余",
        value: chat.unlimited ? "Unlimited" : formatNumber(chat.remaining),
        sub: chat.unlimited ? "无限制" : "剩余 " + formatPercent(chat.percent_remaining),
        percent: chat.unlimited ? 100 : clampPercent(chat.percent_remaining),
      });
      const planValue = data && data.copilot_plan ? data.copilot_plan : "-";
      const planSku = data && data.access_type_sku ? data.access_type_sku : "-";
      items.push({
        label: "套餐",
        value: planValue,
        sub: planSku,
      });
      const resetDate = data && data.quota_reset_date
        ? data.quota_reset_date
        : "-";
      const resetUtc = data && data.quota_reset_date_utc
        ? data.quota_reset_date_utc
        : "-";
      items.push({
        label: "重置日期",
        value: resetDate,
        sub: resetUtc,
      });

      let usageHtml = "";
      items.forEach((item) => {
        usageHtml += '<div class="usage-item"><h4>' + item.label +
          '</h4><div class="value">' + item.value +
          "</div>";
        if (item.percent !== undefined) {
          usageHtml += '<div class="usage-progress"><span style="width:' + item.percent + '%"></span></div>';
        }
        usageHtml += '<div class="usage-subtle">' + item.sub + "</div></div>";
      });
      usageSummary.innerHTML = usageHtml;
      usageMeta.textContent = data && data.login ? "账号：" + data.login : "";
      usageUpdated.textContent = data && data.assigned_date
        ? "绑定时间：" + data.assigned_date
        : "";
    }

    async function loadUsageSummary() {
      if (!usageSummary || !usageMeta || !usageUpdated) {
        return;
      }
      usageSummary.innerHTML = '<div class="muted">加载中...</div>';
      usageMeta.textContent = "";
      usageUpdated.textContent = "";
      const response = await fetch("/usage", { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        usageSummary.innerHTML =
          '<div class="muted">' + (data.error || "读取失败") + "</div>";
        return;
      }

      if (!data || !data.quota_snapshots) {
        usageSummary.innerHTML =
          '<div class="muted">暂无用量数据</div>';
        return;
      }

      renderUsage(data);
    }

    async function copyText(value) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return;
      }

      const input = document.createElement("textarea");
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }

    async function loadKeys() {
      const response = await fetch("/admin/api-keys");
      if (response.status === 401) {
        location.href = "/admin/login";
        return;
      }

      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      keyItems = items;
      rows.innerHTML = "";

      for (const item of items) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + item.id + "</td>" +
          "<td>" + item.prefix + "</td>" +
          "<td>" + item.createdAt + "</td>" +
          "<td>" + (item.totalUsage == null ? 0 : item.totalUsage) + "</td>" +
          "<td>" + (item.totalLimit == null ? "-" : item.totalLimit) + "</td>" +
          "<td>" + (item.dailyLimit == null ? "-" : item.dailyLimit) + "</td>" +
          "<td>" + (item.expiresAt == null ? "-" : item.expiresAt) + "</td>" +
          '<td><div class="actions">' +
          '<button data-id="' + item.id + '" data-action="settings" class="secondary">设置</button>' +
          '<button data-id="' + item.id + '" data-action="usage" class="secondary">用量</button>' +
          '<button data-id="' + item.id + '" data-action="audit" class="secondary">审计</button>' +
          '<button data-id="' + item.id + '" data-action="copy" class="secondary">复制</button>' +
          '<button data-id="' + item.id + '" data-action="delete" class="danger">删除</button>' +
          '</div>' +
          '</td>';

        tr.querySelectorAll("button").forEach((button) => {
          button.addEventListener("click", async () => {
            const action = button.getAttribute("data-action");
            const id = button.getAttribute("data-id");
            if (!id) {
              return;
            }

            if (action === "delete") {
              await fetch("/admin/api-keys/" + encodeURIComponent(id), { method: "DELETE" });
              await loadKeys();
              return;
            }

            if (action === "settings") {
              const target = keyItems.find((item) => item.id === id);
              if (!target) {
                newToken.textContent = "读取设置失败";
                return;
              }
              openSettingsDialog(target);
              return;
            }

            if (action === "usage") {
              location.href = "/admin/api-keys/" + encodeURIComponent(id) + "/usage-view";
              return;
            }

            if (action === "audit") {
              location.href = "/admin/api-keys/" + encodeURIComponent(id) + "/audit-view";
              return;
            }

            const response = await fetch("/admin/api-keys/" + encodeURIComponent(id));
            const data = await response.json();
            if (!response.ok || !data.key) {
              newToken.textContent = data.error || "复制失败";
              return;
            }

            await copyText(data.key);
            newToken.textContent = "已复制: " + id;
          });
        });

        rows.appendChild(tr);
      }
    }

    document.getElementById("create").addEventListener("click", async () => {
      const keyName = String(keyNameInput.value || "").trim();
      if (!keyName) {
        newToken.textContent = "请先填写 key 名称";
        return;
      }

      const response = await fetch("/admin/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: keyName })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "创建失败" }));
        newToken.textContent = data.error || "创建失败";
        return;
      }

      const data = await response.json();
      newToken.textContent = "新建成功: " + data.key;
      await copyText(data.key);
      keyNameInput.value = "";
      await loadKeys();
    });

    document.getElementById("clear").addEventListener("click", () => {
      keyNameInput.value = "";
      newToken.textContent = "";
    });

    document.getElementById("refresh").addEventListener("click", () => {
      loadUsageSummary();
      loadKeys();
    });
    settingsCancelButton.addEventListener("click", closeSettingsDialog);
    settingsSaveButton.addEventListener("click", async () => {
      if (!currentSettingsKeyId) {
        return;
      }

      const payload = {
        totalLimit: toNullableNumber(settingsTotalLimitInput.value),
        dailyLimit: toNullableNumber(settingsDailyLimitInput.value),
        expiresAt: settingsExpiresAtInput.value ? new Date(settingsExpiresAtInput.value).toISOString() : null,
      };

      const response = await fetch("/admin/api-keys/" + encodeURIComponent(currentSettingsKeyId) + "/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({ error: "保存失败" }));
      if (!response.ok) {
        settingsMsg.textContent = data.error || "保存失败";
        return;
      }

      closeSettingsDialog();
      await loadKeys();
      newToken.textContent = "设置已保存: " + currentSettingsKeyId;
    });
    document.getElementById("logout").addEventListener("click", async () => {
      await fetch("/admin/logout", { method: "POST" });
      location.href = "/admin/login";
    });

    themeToggle.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") || "light";
      const nextTheme = current === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });

    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || "light");

    enableDatetimePickerClick();
    loadUsageSummary();
    loadKeys();
  </script>
</body>
</html>`

// eslint-disable-next-line max-lines-per-function
const settingsPage = (keyId: string): string => `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Key 设置</title>
  <script>
    (function () {
      const stored = localStorage.getItem("copilot-admin-theme") ?? "light";
      document.documentElement.setAttribute(
        "data-theme",
        stored === "dark" ? "dark" : "light",
      );
    })();
  </script>
  <style>
    :root {
      --color-red: #cc241d;
      --color-green: #98971a;
      --color-yellow: #d79921;
      --color-blue: #458588;
      --color-purple: #b16286;
      --color-aqua: #689d6a;
      --color-orange: #d65d0e;
      --color-gray: #a89984;
      --color-bg-darkest: #1d2021;
      --color-bg: #282828;
      --color-bg-light-1: #3c3836;
      --color-bg-light-2: #504945;
      --color-bg-light-3: #665c54;
      --color-bg-soft: #32302f;
      --color-fg-dark: #bdae93;
      --color-fg-medium: #d5c4a1;
      --color-fg-light: #ebdbb2;
      --color-fg-lightest: #fbf1c7;
    }

    [data-theme="light"] {
      --color-red: #b91c1c;
      --color-green: #15803d;
      --color-yellow: #b45309;
      --color-blue: #2563eb;
      --color-purple: #7c3aed;
      --color-aqua: #0f766e;
      --color-orange: #c2410c;
      --color-gray: #64748b;
      --color-bg-darkest: #f7f9fc;
      --color-bg: #f1f5f9;
      --color-bg-light-1: #e2e8f0;
      --color-bg-light-2: #d7dee8;
      --color-bg-light-3: #cbd5e1;
      --color-bg-soft: #f1f5f9;
      --color-fg-dark: #1f2937;
      --color-fg-medium: #334155;
      --color-fg-light: #475569;
      --color-fg-lightest: #0f172a;
    }

    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: var(--color-bg-darkest); color: var(--color-fg-light); }
    .container { max-width: 760px; margin: 30px auto; padding: 0 16px; }
    .card { background: var(--color-bg-soft); border: 1px solid var(--color-bg-light-2); border-radius: 12px; padding: 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    label { display:block; margin-bottom: 6px; font-size: 13px; color: var(--color-gray); }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-bg-light-3); background: var(--color-bg-darkest); color: var(--color-fg-medium); color-scheme: dark; }
    input[type="datetime-local"] { padding-right: 40px; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23d5c4a1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='4' width='18' height='18' rx='2' ry='2'/><line x1='16' y1='2' x2='16' y2='6'/><line x1='8' y1='2' x2='8' y2='6'/><line x1='3' y1='10' x2='21' y2='10'/></svg>"); background-repeat: no-repeat; background-position: right 12px center; background-size: 18px 18px; }
    input[type="datetime-local"]::-webkit-calendar-picker-indicator { opacity: 0; cursor: pointer; }
    .row { display:flex; gap:10px; margin-top: 12px; }
    button { padding: 10px 12px; border: none; border-radius: 8px; background: var(--color-blue); color: var(--color-bg-darkest); font-weight: 600; cursor: pointer; }
    button.secondary { background: var(--color-bg-light-2); color: var(--color-fg-lightest); }
    .msg { margin-top: 12px; min-height: 20px; color: var(--color-gray); }
    .page-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .theme-toggle { border: 1px solid var(--color-bg-light-3); background: var(--color-bg-soft); color: var(--color-fg-lightest); padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .theme-toggle:hover { border-color: var(--color-blue); color: var(--color-blue); }
  </style>
</head>
<body>
  <div class="container">
    <div class="page-header">
      <h1>设置 API Key：${keyId}</h1>
      <button id="theme-toggle" class="theme-toggle" type="button">
        <span id="theme-icon">🌞</span>
        <span id="theme-label">Light</span>
      </button>
    </div>
    <div class="card">
      <div class="grid">
        <div>
          <label>总上限（请求次数，可空）</label>
          <input id="total-limit" type="number" min="0" />
        </div>
        <div>
          <label>单日上限（请求次数，可空）</label>
          <input id="daily-limit" type="number" min="0" />
        </div>
      </div>
      <div style="margin-top:12px;">
        <label>过期时间（可空）</label>
        <input id="expires-at" type="datetime-local" class="datetime-input" />
      </div>
      <div class="row">
        <button id="save">保存</button>
        <button id="back" class="secondary">返回</button>
      </div>
      <div id="msg" class="msg"></div>
    </div>
  </div>
  <script>
    const keyId = ${JSON.stringify(keyId)};
    const msg = document.getElementById("msg");
    const totalLimitInput = document.getElementById("total-limit");
    const dailyLimitInput = document.getElementById("daily-limit");
    const expiresAtInput = document.getElementById("expires-at");
    const themeToggle = document.getElementById("theme-toggle");
    const themeIcon = document.getElementById("theme-icon");
    const themeLabel = document.getElementById("theme-label");
    const THEME_STORAGE_KEY = "copilot-admin-theme";

    const toNullableNumber = (value) => {
      const trimmed = String(value || "").trim();
      if (!trimmed) return null;
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const toDatetimeLocal = (iso) => {
      if (!iso) return "";
      const date = new Date(iso);
      const pad = (n) => String(n).padStart(2, "0");
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
    };

    function enableDatetimePickerClick() {
      document.querySelectorAll('input[type="datetime-local"]').forEach((input) => {
        input.addEventListener("click", () => {
          if (typeof input.showPicker === "function") {
            input.showPicker();
          }
        });
      });
    }

    function applyTheme(theme) {
      const resolved = theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", resolved);
      themeIcon.textContent = resolved === "dark" ? "🌙" : "🌞";
      themeLabel.textContent = resolved === "dark" ? "Dark" : "Light";
    }

    async function loadCurrent() {
      const response = await fetch("/admin/api-keys");
      const data = await response.json();
      const item = (Array.isArray(data.items) ? data.items : []).find((x) => x.id === keyId);
      if (!item) {
        msg.textContent = "Key 不存在";
        return;
      }
      totalLimitInput.value = item.totalLimit ?? "";
      dailyLimitInput.value = item.dailyLimit ?? "";
      expiresAtInput.value = toDatetimeLocal(item.expiresAt);
    }

    document.getElementById("save").addEventListener("click", async () => {
      const payload = {
        totalLimit: toNullableNumber(totalLimitInput.value),
        dailyLimit: toNullableNumber(dailyLimitInput.value),
        expiresAt: expiresAtInput.value ? new Date(expiresAtInput.value).toISOString() : null,
      };

      const response = await fetch("/admin/api-keys/" + encodeURIComponent(keyId) + "/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({ error: "保存失败" }));
      msg.textContent = response.ok ? "保存成功" : (data.error || "保存失败");
    });

    document.getElementById("back").addEventListener("click", () => {
      location.href = "/admin";
    });

    themeToggle.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") ?? "light";
      const nextTheme = current === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });

    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) ?? "light");

    enableDatetimePickerClick();
    loadCurrent();
  </script>
</body>
</html>`

// eslint-disable-next-line max-lines-per-function
const usagePage = (keyId: string): string => `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Key 用量</title>
  <script>
    (function () {
      const stored = localStorage.getItem("copilot-admin-theme") ?? "light";
      document.documentElement.setAttribute(
        "data-theme",
        stored === "dark" ? "dark" : "light",
      );
    })();
  </script>
  <style>
    :root {
      --color-red: #cc241d;
      --color-green: #98971a;
      --color-yellow: #d79921;
      --color-blue: #458588;
      --color-purple: #b16286;
      --color-aqua: #689d6a;
      --color-orange: #d65d0e;
      --color-gray: #a89984;
      --color-bg-darkest: #1d2021;
      --color-bg: #282828;
      --color-bg-light-1: #3c3836;
      --color-bg-light-2: #504945;
      --color-bg-light-3: #665c54;
      --color-bg-soft: #32302f;
      --color-fg-dark: #bdae93;
      --color-fg-medium: #d5c4a1;
      --color-fg-light: #ebdbb2;
      --color-fg-lightest: #fbf1c7;
    }

    [data-theme="light"] {
      --color-red: #b91c1c;
      --color-green: #15803d;
      --color-yellow: #b45309;
      --color-blue: #2563eb;
      --color-purple: #7c3aed;
      --color-aqua: #0f766e;
      --color-orange: #c2410c;
      --color-gray: #64748b;
      --color-bg-darkest: #f7f9fc;
      --color-bg: #f1f5f9;
      --color-bg-light-1: #e2e8f0;
      --color-bg-light-2: #d7dee8;
      --color-bg-light-3: #cbd5e1;
      --color-bg-soft: #f1f5f9;
      --color-fg-dark: #1f2937;
      --color-fg-medium: #334155;
      --color-fg-light: #475569;
      --color-fg-lightest: #0f172a;
    }

    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: var(--color-bg-darkest); color: var(--color-fg-light); }
    .container { max-width: 1400px; margin: 20px auto; padding: 0 16px; }
    .card { background: var(--color-bg-soft); border: 1px solid var(--color-bg-light-2); border-radius: 12px; padding: 16px; margin-top: 16px; }
    .row { display:flex; gap:10px; flex-wrap: wrap; }
    input, select { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-bg-light-3); background: var(--color-bg-darkest); color: var(--color-fg-medium); }
    input[type="datetime-local"] { color-scheme: dark; }
    input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(1) brightness(1.4); opacity: 0.9; cursor: pointer; }
    button { padding: 10px 12px; border: none; border-radius: 8px; background: var(--color-blue); color: var(--color-bg-darkest); font-weight: 600; cursor: pointer; }
    button.secondary { background: var(--color-bg-light-2); color: var(--color-fg-lightest); }
    button.icon { display: inline-flex; align-items: center; gap: 6px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .summary { margin-top: 10px; color: var(--color-gray); }
    .chart-wrap { margin-top: 12px; border: 1px solid var(--color-bg-light-2); border-radius: 8px; padding: 8px; background: var(--color-bg-darkest); }
    .chart-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; }
    .chart-title { font-size: 13px; color: var(--color-gray); margin: 0 0 8px; }
    .zoom-info { font-size: 12px; color: var(--color-gray); margin: 0 0 8px; }
    .chart-empty { color: var(--color-gray); font-size: 13px; padding: 12px; }
    .chart-toolbar { display: flex; gap: 8px; margin-bottom: 8px; }
    #usage-chart { width: 100%; height: 420px; display: block; }
    .drp-wrap { position: relative; display: inline-block; }
    .drp-btn { background: var(--color-bg-darkest); border: 1px solid var(--color-bg-light-3); color: var(--color-fg-medium); border-radius: 8px; padding: 10px 14px; cursor: pointer; font-size: 14px; font-weight: 400; min-width: 228px; text-align: left; white-space: nowrap; }
    .drp-btn.drp-placeholder { color: var(--color-gray); }
    .drp-btn.drp-active { border-color: var(--color-blue); outline: none; }
    .drp-panel { position: absolute; top: calc(100% + 6px); left: 0; z-index: 1000; background: var(--color-bg); border: 1px solid var(--color-bg-light-2); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 8px 32px rgba(0,0,0,.7); }
    .drp-shortcuts { display: flex; flex-wrap: wrap; gap: 8px; }
    .drp-shortcut { background: var(--color-bg-darkest); border: 1px solid var(--color-bg-light-2); color: var(--color-fg-medium); border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
    .drp-shortcut:hover { border-color: var(--color-blue); color: var(--color-blue); }
    .drp-calendars { display: flex; gap: 20px; }
    .drp-cal { flex: 0 0 auto; }
    .drp-cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; min-width: 196px; }
    .drp-nav-btn { background: none; border: none; color: var(--color-gray); cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 7px; border-radius: 4px; }
    .drp-nav-btn:hover { background: var(--color-bg-light-2); color: var(--color-fg-lightest); }
    .drp-month-label { font-weight: 600; color: var(--color-fg-lightest); font-size: 14px; }
    .drp-weekdays, .drp-days { display: grid; grid-template-columns: repeat(7, 28px); }
    .drp-weekdays { text-align: center; font-size: 11px; color: var(--color-gray); margin-bottom: 3px; }
    .drp-day { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 13px; cursor: pointer; border-radius: 4px; color: var(--color-fg-medium); border: none; background: none; padding: 0; }
    .drp-day:not(.drp-day-empty):not(.drp-day-other):hover { background: var(--color-bg-light-2); }
    .drp-day-start, .drp-day-end { background: var(--color-blue) !important; color: var(--color-bg-darkest) !important; font-weight: 700; border-radius: 4px !important; }
    .drp-day-in-range { background: rgba(69,133,136,0.18); color: var(--color-blue); border-radius: 0; }
    .drp-day-today:not(.drp-day-start):not(.drp-day-end) { outline: 1px solid var(--color-bg-light-3); outline-offset: -2px; }
    .drp-day-empty, .drp-day-other { opacity: 0; pointer-events: none; }
    .drp-status { font-size: 12px; color: var(--color-gray); text-align: center; }
    .drp-footer { display: flex; justify-content: flex-end; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { text-align: left; border-bottom: 1px solid var(--color-bg-light-2); padding: 10px 8px; }
    .theme-toggle { border: 1px solid var(--color-bg-light-3); background: var(--color-bg-soft); color: var(--color-fg-lightest); padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .theme-toggle:hover { border-color: var(--color-blue); color: var(--color-blue); }
  </style>
</head>
<body>
  <div class="container">
    <div class="page-header">
      <h1>用量统计：${keyId}</h1>
      <button id="theme-toggle" class="theme-toggle" type="button">
        <span id="theme-icon">🌞</span>
        <span id="theme-label">Light</span>
      </button>
    </div>
    <div class="card">
      <div class="row">
        <select id="granularity">
          <option value="hour">按小时</option>
          <option value="day" selected>按天</option>
          <option value="week">按周</option>
          <option value="month">按月</option>
        </select>
        <div id="drp-wrap" class="drp-wrap">
          <button id="drp-btn" type="button" class="drp-btn drp-placeholder">📅 选择日期范围</button>
          <div id="drp-panel" class="drp-panel" style="display:none;">
            <div class="drp-shortcuts">
              <button type="button" class="drp-shortcut" data-range="last_week">最近一周</button>
              <button type="button" class="drp-shortcut" data-range="last_month">最近一个月</button>
              <button type="button" class="drp-shortcut" data-range="last_3_months">最近三个月</button>
            </div>
            <div class="drp-calendars">
              <div id="drp-cal-left" class="drp-cal"></div>
              <div id="drp-cal-right" class="drp-cal"></div>
            </div>
            <div id="drp-status" class="drp-status">点击选择起始日期</div>
            <div class="drp-footer">
              <button type="button" id="drp-cancel" class="secondary">取消</button>
            </div>
          </div>
        </div>
        <button id="back" class="secondary">返回</button>
      </div>
      <div id="summary" class="summary"></div>
      <div class="chart-wrap">
        <div class="chart-toolbar">
          <button id="zoom-in" class="secondary">放大</button>
          <button id="zoom-out" class="secondary">缩小</button>
          <button id="zoom-reset" class="secondary">重置缩放</button>
        </div>
        <p class="chart-title" id="chart-title">区间请求趋势</p>
        <p class="zoom-info" id="zoom-info">可视区间：-</p>
        <div id="chart-scroll" class="chart-scroll">
          <svg id="usage-chart" viewBox="0 0 1400 420" preserveAspectRatio="none"></svg>
        </div>
        <div id="chart-empty" class="chart-empty" style="display:none;">当前时间区间无数据</div>
      </div>
      <table>
        <thead><tr><th>时间</th><th>方法</th><th>路径</th><th>状态</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>
  <script>
    const keyId = ${JSON.stringify(keyId)};
    const rows = document.getElementById("rows");
    const summary = document.getElementById("summary");
    const chartTitle = document.getElementById("chart-title");
    const zoomInfo = document.getElementById("zoom-info");
    const chartScroll = document.getElementById("chart-scroll");
    const usageChart = document.getElementById("usage-chart");
    const chartEmpty = document.getElementById("chart-empty");
    const drpWrap = document.getElementById("drp-wrap");
    const drpBtn = document.getElementById("drp-btn");
    const drpPanel = document.getElementById("drp-panel");
    const drpStatus = document.getElementById("drp-status");
    const drpCalLeft = document.getElementById("drp-cal-left");
    const drpCalRight = document.getElementById("drp-cal-right");
    const themeToggle = document.getElementById("theme-toggle");
    const themeIcon = document.getElementById("theme-icon");
    const themeLabel = document.getElementById("theme-label");
    const THEME_STORAGE_KEY = "copilot-admin-theme";
    const granularityInput = document.getElementById("granularity");
    const zoomInButton = document.getElementById("zoom-in");
    const zoomOutButton = document.getElementById("zoom-out");
    const zoomResetButton = document.getElementById("zoom-reset");

    const chartState = {
      records: [],
      fromIso: "",
      toIso: "",
      zoomLevel: 1,
      focusTs: 0,
      granularity: "day",
      customFromIso: "",
      customToIso: "",
    };

    const drpState = {
      open: false,
      viewYear: new Date().getFullYear(),
      viewMonth: new Date().getMonth() > 0 ? new Date().getMonth() - 1 : 11,
      startDate: null,
      endDate: null,
      hoverDate: null,
      picking: "start",
    };
    if (new Date().getMonth() === 0) drpState.viewYear -= 1;

    const DRP_WEEKDAYS = ["一","二","三","四","五","六","日"];
    const DRP_MONTHS = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"];

    function applyTheme(theme) {
      const resolved = theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", resolved);
      themeIcon.textContent = resolved === "dark" ? "🌙" : "🌞";
      themeLabel.textContent = resolved === "dark" ? "Dark" : "Light";
    }

    function drpFormatDate(d) {
      return d ? d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + pad(d.getDate()) : "";
    }

    function drpSameDay(a, b) {
      return !!a && !!b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
    }

    function drpDateOnly(d) {
      const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
    }

    function drpIsBetween(d, a, b) {
      if (!a || !b) return false;
      const dt = drpDateOnly(d).getTime();
      const lo = Math.min(drpDateOnly(a).getTime(), drpDateOnly(b).getTime());
      const hi = Math.max(drpDateOnly(a).getTime(), drpDateOnly(b).getTime());
      return dt > lo && dt < hi;
    }

    function drpEffectiveEnd() {
      return drpState.picking === "end" && drpState.hoverDate && drpState.startDate
        ? drpState.hoverDate
        : drpState.endDate;
    }

    function drpBuildMonth(year, month, side) {
      const today = new Date();
      const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const effEnd = drpEffectiveEnd();

      const header = '<div class="drp-cal-header">' +
        (side === "left"
          ? '<button type="button" class="drp-nav-btn" id="drp-prev">‹</button>'
          : '<span style="width:30px"></span>') +
        '<span class="drp-month-label">' + year + '年 ' + DRP_MONTHS[month] + '</span>' +
        (side === "right"
          ? '<button type="button" class="drp-nav-btn" id="drp-next">›</button>'
          : '<span style="width:30px"></span>') +
        '</div>';

      const weekRow = '<div class="drp-weekdays">' +
        DRP_WEEKDAYS.map((l) => '<span>' + l + '</span>').join("") + '</div>';

      let days = '<div class="drp-days">';
      for (let i = 0; i < firstWeekday; i++) {
        days += '<button type="button" class="drp-day drp-day-empty" tabindex="-1"></button>';
      }
      for (let d = 1; d <= lastDay; d++) {
        const date = new Date(year, month, d);
        let cls = "drp-day";
        const isStart = drpSameDay(date, drpState.startDate);
        const isEnd = drpSameDay(date, effEnd) && !!drpState.startDate;
        const inRange = drpIsBetween(date, drpState.startDate, effEnd);
        if (isStart) cls += " drp-day-start";
        if (isEnd) cls += " drp-day-end";
        if (inRange) cls += " drp-day-in-range";
        if (drpSameDay(date, today)) cls += " drp-day-today";
        days += '<button type="button" class="' + cls + '" data-y="' + year + '" data-m="' + month + '" data-d="' + d + '">' + d + '</button>';
      }
      days += '</div>';
      return header + weekRow + days;
    }

    function drpRender() {
      let ry = drpState.viewYear, rm = drpState.viewMonth + 1;
      if (rm > 11) { rm = 0; ry++; }
      drpCalLeft.innerHTML = drpBuildMonth(drpState.viewYear, drpState.viewMonth, "left");
      drpCalRight.innerHTML = drpBuildMonth(ry, rm, "right");

      drpStatus.textContent = drpState.startDate && drpState.picking === "end"
        ? "起始：" + drpFormatDate(drpState.startDate) + "，请点击结束日期"
        : drpState.startDate && drpState.endDate
          ? drpFormatDate(drpState.startDate) + " ~ " + drpFormatDate(drpState.endDate)
          : "点击选择起始日期";

      const prevBtn = document.getElementById("drp-prev");
      const nextBtn = document.getElementById("drp-next");
      if (prevBtn) {
        prevBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          drpState.viewMonth--;
          if (drpState.viewMonth < 0) { drpState.viewMonth = 11; drpState.viewYear--; }
          drpRender();
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          drpState.viewMonth++;
          if (drpState.viewMonth > 11) { drpState.viewMonth = 0; drpState.viewYear++; }
          drpRender();
        });
      }

      drpPanel.querySelectorAll(".drp-day[data-d]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const date = new Date(+btn.dataset.y, +btn.dataset.m, +btn.dataset.d);
          if (drpState.picking === "start") {
            drpState.startDate = date;
            drpState.endDate = null;
            drpState.picking = "end";
            drpRender();
          } else {
            let s = drpState.startDate, en = date;
            if (en < s) { const t = s; s = en; en = t; }
            drpState.startDate = s;
            drpState.endDate = en;
            drpState.picking = "start";
            drpRender();
            drpApplyAndClose();
          }
        });
      });
    }

    function drpOpenPanel() {
      drpState.open = true;
      drpState.picking = "start";
      drpState.hoverDate = null;
      if (chartState.customFromIso) {
        const f = new Date(chartState.customFromIso);
        drpState.startDate = f;
        drpState.viewYear = f.getMonth() > 0 ? f.getFullYear() : f.getFullYear() - 1;
        drpState.viewMonth = f.getMonth() > 0 ? f.getMonth() - 1 : 11;
      } else {
        drpState.startDate = null;
        drpState.endDate = null;
        const now = new Date();
        drpState.viewYear = now.getMonth() > 0 ? now.getFullYear() : now.getFullYear() - 1;
        drpState.viewMonth = now.getMonth() > 0 ? now.getMonth() - 1 : 11;
      }
      drpState.endDate = chartState.customToIso ? new Date(chartState.customToIso) : null;
      drpPanel.style.display = "";
      drpBtn.classList.add("drp-active");
      drpRender();
    }

    function drpClosePanel() {
      drpState.open = false;
      drpPanel.style.display = "none";
      drpBtn.classList.remove("drp-active");
    }

    async function drpApplyAndClose() {
      if (!drpState.startDate || !drpState.endDate) return;
      const from = new Date(drpState.startDate); from.setHours(0, 0, 0, 0);
      const to = new Date(drpState.endDate); to.setHours(23, 59, 59, 999);
      setCustomRange(from, to);
      drpUpdateLabel();
      drpClosePanel();
      await queryUsage();
    }

    function drpUpdateLabel() {
      if (!chartState.customFromIso || !chartState.customToIso) {
        drpBtn.textContent = "📅 选择日期范围";
        drpBtn.classList.add("drp-placeholder");
        return;
      }
      drpBtn.textContent = "📅 " + drpFormatDate(new Date(chartState.customFromIso)) +
        " ~ " + drpFormatDate(new Date(chartState.customToIso));
      drpBtn.classList.remove("drp-placeholder");
    }

    const pad = (n) => String(n).padStart(2, "0");
    const toDayKey = (date) =>
      date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());

    const toHourKey = (date) => toDayKey(date) + " " + pad(date.getHours()) + ":00";
    const toMonthKey = (date) => date.getFullYear() + "-" + pad(date.getMonth() + 1);

    const getWeekStart = (date) => {
      const d = new Date(date);
      const day = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const toWeekKey = (date) => toDayKey(getWeekStart(date));

    const granularityLabel = {
      hour: "按小时",
      day: "按天",
      week: "按周",
      month: "按月",
    };

    const diffHours = (from, to) => Math.max(1, Math.ceil((to - from) / (1000 * 60 * 60)));
    const diffDays = (from, to) => Math.max(1, Math.ceil((to - from) / (1000 * 60 * 60 * 24)));
    const diffWeeks = (from, to) => Math.max(1, Math.ceil(diffDays(from, to) / 7));
    const diffMonths = (from, to) => Math.max(1, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1);

    function chooseGranularity(fromIso, toIso, maxPoints) {
      const from = new Date(fromIso);
      const to = new Date(toIso);

      if (diffHours(from, to) <= maxPoints) return "hour";
      if (diffDays(from, to) <= maxPoints) return "day";
      if (diffWeeks(from, to) <= maxPoints) return "week";
      return "month";
    }

    function bucketKeyByGranularity(date, granularity) {
      if (granularity === "hour") return toHourKey(date);
      if (granularity === "day") return toDayKey(date);
      if (granularity === "week") return toWeekKey(date);
      return toMonthKey(date);
    }

    function buildBuckets(fromIso, toIso, granularity) {
      const from = new Date(fromIso);
      const to = new Date(toIso);
      const buckets = [];

      if (granularity === "hour") {
        const cursor = new Date(from);
        cursor.setMinutes(0, 0, 0);
        while (cursor <= to) {
          buckets.push(toHourKey(cursor));
          cursor.setHours(cursor.getHours() + 1);
        }
        return buckets;
      }

      if (granularity === "day") {
        const cursor = new Date(from);
        cursor.setHours(0, 0, 0, 0);
        while (cursor <= to) {
          buckets.push(toDayKey(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }
        return buckets;
      }

      if (granularity === "week") {
        const cursor = getWeekStart(from);
        while (cursor <= to) {
          buckets.push(toWeekKey(cursor));
          cursor.setDate(cursor.getDate() + 7);
        }
        return buckets;
      }

      const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      const end = new Date(to.getFullYear(), to.getMonth(), 1);
      while (cursor <= end) {
        buckets.push(toMonthKey(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return buckets;
    }

    function getZoomedRange(fromIso, toIso, zoomLevel) {
      const from = new Date(fromIso);
      const to = new Date(toIso);
      const total = to.getTime() - from.getTime();
      if (total <= 0) {
        return { fromIso, toIso };
      }

      if (zoomLevel <= 1) {
        return { fromIso, toIso };
      }

      const visible = total / zoomLevel;
      const defaultCenter = from.getTime() + total / 2;
      const center = chartState.focusTs > 0
        ? Math.min(to.getTime(), Math.max(from.getTime(), chartState.focusTs))
        : defaultCenter;
      let viewFrom = center - visible / 2;
      let viewTo = center + visible / 2;

      if (viewFrom < from.getTime()) {
        viewTo += from.getTime() - viewFrom;
        viewFrom = from.getTime();
      }

      if (viewTo > to.getTime()) {
        viewFrom -= viewTo - to.getTime();
        viewTo = to.getTime();
      }

      return {
        fromIso: new Date(Math.max(from.getTime(), viewFrom)).toISOString(),
        toIso: new Date(Math.min(to.getTime(), viewTo)).toISOString(),
      };
    }

    function maxDisplayPoints() {
      const width = chartScroll.clientWidth || usageChart.clientWidth || 1200;
      return Math.max(24, Math.floor(width / 16));
    }

    function resolveGranularityByZoom(fromIso, toIso, zoomLevel) {
      const zoomed = getZoomedRange(fromIso, toIso, zoomLevel);
      const pointsBudget = Math.max(
        1,
        Math.floor(maxDisplayPoints() * Math.max(zoomLevel, 1 / 64) * Math.max(zoomLevel, 1 / 64)),
      );

      return chooseGranularity(zoomed.fromIso, zoomed.toIso, pointsBudget);
    }

    function syncGranularityToZoom() {
      if (!chartState.fromIso || !chartState.toIso) {
        return;
      }

      chartState.granularity = resolveGranularityByZoom(
        chartState.fromIso,
        chartState.toIso,
        chartState.zoomLevel,
      );
      granularityInput.value = chartState.granularity;
    }

    function findZoomLevelForGranularity(targetGranularity) {
      if (!chartState.fromIso || !chartState.toIso) {
        return 1;
      }

      const minZoom = 1 / 64;
      const maxZoom = 64;
      const candidates = [];
      let zoom = minZoom;
      while (zoom <= maxZoom) {
        candidates.push(zoom);
        zoom *= 2;
      }

      let matched = candidates.filter(
        (candidate) =>
          resolveGranularityByZoom(
            chartState.fromIso,
            chartState.toIso,
            candidate,
          ) === targetGranularity,
      );

      if (matched.length === 0) {
        matched = candidates;
      }

      return matched.reduce((best, current) => {
        const bestDistance = Math.abs(Math.log2(best));
        const currentDistance = Math.abs(Math.log2(current));
        return currentDistance < bestDistance ? current : best;
      }, matched[0]);
    }

    function refreshChartFromState() {
      if (!chartState.fromIso || !chartState.toIso) {
        return;
      }

      renderLineChart(chartState.records, chartState.fromIso, chartState.toIso, chartState.zoomLevel);
    }

    function renderLineChart(records, fromIso, toIso, zoomLevel) {
      const zoomed = getZoomedRange(fromIso, toIso, zoomLevel);
      const granularity = chartState.granularity;
      chartTitle.textContent =
        "区间请求趋势（" + granularityLabel[granularity] + "，缩放 x" +
        zoomLevel.toFixed(2) + "）";
      zoomInfo.textContent = "可视区间：" + zoomed.fromIso + " ~ " + zoomed.toIso;

      const buckets = buildBuckets(zoomed.fromIso, zoomed.toIso, granularity);
      const counter = new Map();
      for (const key of buckets) counter.set(key, 0);

      for (const item of records || []) {
        const ts = new Date(item.timestamp).toISOString();
        if (ts < zoomed.fromIso || ts > zoomed.toIso) {
          continue;
        }
        const key = bucketKeyByGranularity(new Date(item.timestamp), granularity);
        if (counter.has(key)) {
          counter.set(key, (counter.get(key) || 0) + 1);
        }
      }

      const values = buckets.map((key) => counter.get(key) || 0);
      const max = Math.max(1, ...values);

      if (values.every((v) => v === 0)) {
        usageChart.innerHTML = "";
        chartEmpty.style.display = "block";
        return;
      }

      chartEmpty.style.display = "none";

      const containerWidth = chartScroll.clientWidth || usageChart.clientWidth || 1200;
      const unitWidthByGranularity = {
        hour: 56,
        day: 28,
        week: 24,
        month: 72,
      };
      const unitWidth = unitWidthByGranularity[granularity] || 28;
      const width = Math.max(containerWidth, buckets.length * unitWidth);
      const height = 420;
      const left = 44;
      const right = 16;
      const top = 14;
      const bottom = 34;
      const plotW = width - left - right;
      const plotH = height - top - bottom;

      usageChart.setAttribute("viewBox", "0 0 " + width + " " + height);
      usageChart.style.width = width + "px";

      const x = (i) => left + (buckets.length <= 1 ? 0 : (i * plotW) / (buckets.length - 1));
      const y = (v) => top + plotH - (v / max) * plotH;

      let polyline = "";
      for (let i = 0; i < values.length; i++) {
        polyline += (i === 0 ? "" : " ") + x(i) + "," + y(values[i]);
      }

      const yTicks = [0, Math.ceil(max / 2), max];
      const tickLines = yTicks.map((v) => {
        const yy = y(v);
        return '<line x1="' + left + '" y1="' + yy + '" x2="' + (width - right) + '" y2="' + yy + '" stroke="#334155" stroke-width="1" />' +
          '<text x="' + (left - 8) + '" y="' + (yy + 4) + '" text-anchor="end" fill="#94a3b8" font-size="11">' + v + '</text>';
      }).join("");

      const labelStep = Math.max(1, Math.ceil(buckets.length / 6));
      const xLabels = buckets.map((key, i) => {
        if (i % labelStep !== 0 && i !== buckets.length - 1) return "";
        let label = key;
        if (granularity === "day") label = key.slice(5);
        if (granularity === "hour") label = key.slice(5, 13);
        if (granularity === "week") label = "W@" + key.slice(5);
        if (granularity === "month") label = key;
        return '<text x="' + x(i) + '" y="' + (height - 10) + '" text-anchor="middle" fill="#94a3b8" font-size="11">' + label + '</text>';
      }).join("");

      const points = values.map((v, i) =>
        '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="2.5" fill="#22d3ee" />'
      ).join("");

      usageChart.innerHTML =
        '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="#0b1220" />' +
        tickLines +
        '<polyline points="' + polyline + '" fill="none" stroke="#22d3ee" stroke-width="2" />' +
        points +
        xLabels;
    }

    function computeQuickRange(kind) {
      const now = new Date();
      const from = new Date(now);
      const to = new Date(now);
      if (kind === "last_week") {
        from.setDate(now.getDate() - 7);
      } else if (kind === "last_3_months") {
        from.setMonth(now.getMonth() - 3);
      } else {
        from.setMonth(now.getMonth() - 1);
      }
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }

    function setCustomRange(from, to) {
      chartState.customFromIso = from.toISOString();
      chartState.customToIso = to.toISOString();
      drpState.startDate = new Date(from);
      drpState.endDate = new Date(to);
      drpState.picking = "start";
    }

    function applyQuickRange(kind, options = {}) {
      const { closePanel = true, skipQuery = false } = options;
      const range = computeQuickRange(kind);
      setCustomRange(range.from, range.to);
      drpUpdateLabel();
      if (drpState.open) drpRender();
      if (closePanel) drpClosePanel();
      if (!skipQuery) queryUsage();
    }

    function getSelectedRange() {
      if (!chartState.customFromIso || !chartState.customToIso) {
        const range = computeQuickRange("last_month");
        setCustomRange(range.from, range.to);
        drpUpdateLabel();
      }

      return {
        fromIso: chartState.customFromIso,
        toIso: chartState.customToIso,
      };
    }

    async function queryUsage() {
      const range = getSelectedRange();
      const fromIso = range.fromIso;
      const toIso = range.toIso;

      const response = await fetch(
        "/admin/api-keys/" + encodeURIComponent(keyId) + "/usage?from=" +
        encodeURIComponent(fromIso) + "&to=" +
        encodeURIComponent(toIso)
      );

      const data = await response.json().catch(() => ({ error: "查询失败" }));
      if (!response.ok) {
        summary.textContent = data.error || "查询失败";
        return;
      }

      summary.textContent = "区间请求数：" + data.count + "，累计：" + data.totalUsage + "，今日：" + data.dailyUsage;
      rows.innerHTML = "";
      for (const item of data.records || []) {
        const tr = document.createElement("tr");
        tr.innerHTML = "<td>" + item.timestamp + "</td><td>" + item.method + "</td><td>" + item.path + "</td><td>" + item.status + "</td>";
        rows.appendChild(tr);
      }

      chartState.records = data.records || [];
      chartState.fromIso = data.from;
      chartState.toIso = data.to;
      chartState.zoomLevel = 1;
      const times = chartState.records
        .map((item) => new Date(item.timestamp).getTime())
        .filter((ts) => Number.isFinite(ts));
      chartState.focusTs = times.length > 0
        ? Math.max(...times)
        : (new Date(data.from).getTime() + new Date(data.to).getTime()) / 2;
      syncGranularityToZoom();
      refreshChartFromState();
    }

    drpBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      drpState.open ? drpClosePanel() : drpOpenPanel();
    });
    drpPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    document.getElementById("drp-cancel").addEventListener("click", (event) => {
      event.stopPropagation();
      drpClosePanel();
    });
    drpPanel.querySelectorAll(".drp-shortcut").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const range = btn.dataset.range || "last_month";
        applyQuickRange(range);
      });
    });
    document.addEventListener("click", (e) => {
      if (drpState.open && !drpWrap.contains(e.target)) drpClosePanel();
    });

    granularityInput.addEventListener("change", () => {
      chartState.granularity = granularityInput.value;
      chartState.zoomLevel = findZoomLevelForGranularity(chartState.granularity);
      syncGranularityToZoom();
      refreshChartFromState();
    });
    zoomInButton.addEventListener("click", () => {
      chartState.zoomLevel = Math.min(64, chartState.zoomLevel * 2);
      syncGranularityToZoom();
      refreshChartFromState();
    });
    zoomOutButton.addEventListener("click", () => {
      chartState.zoomLevel = Math.max(1 / 64, chartState.zoomLevel / 2);
      syncGranularityToZoom();
      refreshChartFromState();
    });
    zoomResetButton.addEventListener("click", () => {
      chartState.zoomLevel = 1;
      syncGranularityToZoom();
      refreshChartFromState();
    });
    window.addEventListener("resize", () => {
      syncGranularityToZoom();
      refreshChartFromState();
    });

    document.getElementById("back").addEventListener("click", () => {
      location.href = "/admin";
    });

    themeToggle.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") ?? "light";
      const nextTheme = current === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });

    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) ?? "light");

    drpUpdateLabel();
    applyQuickRange("last_month", { skipQuery: true, closePanel: true });
    queryUsage();
  </script>
</body>
</html>`

// eslint-disable-next-line max-lines-per-function
const auditPage = (keyId: string): string => `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Key 审计</title>
  <script>
    (function () {
      const stored = localStorage.getItem("copilot-admin-theme") ?? "light";
      document.documentElement.setAttribute(
        "data-theme",
        stored === "dark" ? "dark" : "light",
      );
    })();
  </script>
  <style>
    :root {
      --color-red: #cc241d;
      --color-green: #98971a;
      --color-yellow: #d79921;
      --color-blue: #458588;
      --color-purple: #b16286;
      --color-aqua: #689d6a;
      --color-orange: #d65d0e;
      --color-gray: #a89984;
      --color-bg-darkest: #1d2021;
      --color-bg: #282828;
      --color-bg-light-1: #3c3836;
      --color-bg-light-2: #504945;
      --color-bg-light-3: #665c54;
      --color-bg-soft: #32302f;
      --color-fg-dark: #bdae93;
      --color-fg-medium: #d5c4a1;
      --color-fg-light: #ebdbb2;
      --color-fg-lightest: #fbf1c7;
    }

    [data-theme="light"] {
      --color-red: #b91c1c;
      --color-green: #15803d;
      --color-yellow: #b45309;
      --color-blue: #2563eb;
      --color-purple: #7c3aed;
      --color-aqua: #0f766e;
      --color-orange: #c2410c;
      --color-gray: #64748b;
      --color-bg-darkest: #f7f9fc;
      --color-bg: #f1f5f9;
      --color-bg-light-1: #e2e8f0;
      --color-bg-light-2: #d7dee8;
      --color-bg-light-3: #cbd5e1;
      --color-bg-soft: #f1f5f9;
      --color-fg-dark: #1f2937;
      --color-fg-medium: #334155;
      --color-fg-light: #475569;
      --color-fg-lightest: #0f172a;
    }

    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: var(--color-bg-darkest); color: var(--color-fg-light); }
    .container { max-width: 1400px; margin: 20px auto; padding: 0 16px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .card { background: var(--color-bg-soft); border: 1px solid var(--color-bg-light-2); border-radius: 12px; padding: 16px; margin-top: 16px; }
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    label { display:block; font-size: 12px; color: var(--color-gray); margin-bottom: 6px; }
    input, select { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-bg-light-3); background: var(--color-bg-darkest); color: var(--color-fg-medium); }
    button { padding: 10px 12px; border: none; border-radius: 8px; background: var(--color-blue); color: var(--color-bg-darkest); font-weight: 600; cursor: pointer; }
    button.secondary { background: var(--color-bg-light-2); color: var(--color-fg-lightest); }
    .actions { display:flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; border-bottom: 1px solid var(--color-bg-light-2); padding: 10px 8px; vertical-align: top; }
    .muted { color: var(--color-gray); font-size: 12px; }
    details { background: var(--color-bg-darkest); border: 1px solid var(--color-bg-light-2); border-radius: 8px; padding: 8px 10px; }
    details summary { cursor: pointer; font-weight: 600; }
    pre { white-space: pre-wrap; word-break: break-word; background: var(--color-bg); padding: 10px; border-radius: 6px; border: 1px solid var(--color-bg-light-2); max-height: 280px; overflow: auto; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
    .pagination { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
    .drp-wrap { position: relative; display: inline-block; width: 100%; }
    .drp-btn { width: 100%; background: var(--color-bg-darkest); border: 1px solid var(--color-bg-light-3); color: var(--color-fg-medium); border-radius: 8px; padding: 10px 14px; cursor: pointer; font-size: 14px; font-weight: 400; text-align: left; white-space: nowrap; }
    .drp-btn.drp-placeholder { color: var(--color-gray); }
    .drp-btn.drp-active { border-color: var(--color-blue); outline: none; }
    .drp-panel { position: absolute; top: calc(100% + 6px); left: 0; z-index: 1000; background: var(--color-bg); border: 1px solid var(--color-bg-light-2); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 8px 32px rgba(0,0,0,.7); }
    .drp-shortcuts { display: flex; flex-wrap: wrap; gap: 8px; }
    .drp-shortcut { background: var(--color-bg-darkest); border: 1px solid var(--color-bg-light-2); color: var(--color-fg-medium); border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
    .drp-shortcut:hover { border-color: var(--color-blue); color: var(--color-blue); }
    .drp-calendars { display: flex; gap: 20px; }
    .drp-cal { flex: 0 0 auto; }
    .drp-cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; min-width: 196px; }
    .drp-nav-btn { background: none; border: none; color: var(--color-gray); cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 7px; border-radius: 4px; }
    .drp-nav-btn:hover { background: var(--color-bg-light-2); color: var(--color-fg-lightest); }
    .drp-month-label { font-weight: 600; color: var(--color-fg-lightest); font-size: 14px; }
    .drp-weekdays, .drp-days { display: grid; grid-template-columns: repeat(7, 28px); }
    .drp-weekdays { text-align: center; font-size: 11px; color: var(--color-gray); margin-bottom: 3px; }
    .drp-day { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 13px; cursor: pointer; border-radius: 4px; color: var(--color-fg-medium); border: none; background: none; padding: 0; }
    .drp-day:not(.drp-day-empty):not(.drp-day-other):hover { background: var(--color-bg-light-2); }
    .drp-day-start, .drp-day-end { background: var(--color-blue) !important; color: var(--color-bg-darkest) !important; font-weight: 700; border-radius: 4px !important; }
    .drp-day-in-range { background: rgba(69,133,136,0.18); color: var(--color-blue); border-radius: 0; }
    .drp-day-today:not(.drp-day-start):not(.drp-day-end) { outline: 1px solid var(--color-bg-light-3); outline-offset: -2px; }
    .drp-day-empty, .drp-day-other { opacity: 0; pointer-events: none; }
    .drp-status { font-size: 12px; color: var(--color-gray); text-align: center; }
    .drp-footer { display: flex; justify-content: flex-end; }
    .theme-toggle { border: 1px solid var(--color-bg-light-3); background: var(--color-bg-soft); color: var(--color-fg-lightest); padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .theme-toggle:hover { border-color: var(--color-blue); color: var(--color-blue); }
  </style>
</head>
<body>
  <div class="container">
    <div class="page-header">
      <h1>访问审计：${keyId}</h1>
      <div class="actions">
        <button id="theme-toggle" class="theme-toggle" type="button">
          <span id="theme-icon">🌞</span>
          <span id="theme-label">Light</span>
        </button>
        <button id="back" class="secondary">返回</button>
      </div>
    </div>

    <div class="card">
      <div class="filters">
        <div>
          <label for="drp-btn">时间范围</label>
          <div id="drp-wrap" class="drp-wrap">
            <button id="drp-btn" type="button" class="drp-btn drp-placeholder">📅 选择日期范围</button>
            <div id="drp-panel" class="drp-panel" style="display:none;">
              <div class="drp-shortcuts">
                <button type="button" class="drp-shortcut" data-range="last_week">最近一周</button>
                <button type="button" class="drp-shortcut" data-range="last_month">最近一个月</button>
                <button type="button" class="drp-shortcut" data-range="last_3_months">最近三个月</button>
              </div>
              <div class="drp-calendars">
                <div id="drp-cal-left" class="drp-cal"></div>
                <div id="drp-cal-right" class="drp-cal"></div>
              </div>
              <div id="drp-status" class="drp-status">点击选择起始日期</div>
              <div class="drp-footer">
                <button type="button" id="drp-cancel" class="secondary">取消</button>
              </div>
            </div>
          </div>
        </div>
        <div>
          <label for="filter-query">关键字搜索</label>
          <input id="filter-query" placeholder="模型/消息/路径等" />
        </div>
        <div>
          <label for="page-size">每页数量</label>
          <select id="page-size">
            <option value="10">10</option>
            <option value="20" selected>20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <div class="actions" style="align-items: flex-end;">
          <button id="apply">应用筛选</button>
          <button id="reset" class="secondary">重置</button>
        </div>
      </div>
      <div id="result-summary" class="muted" style="margin-top: 10px;"></div>
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>方法</th>
            <th>路径</th>
            <th>状态</th>
            <th>输入 Tokens</th>
            <th>输出 Tokens</th>
            <th>耗时</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
      <div class="pagination">
        <button id="prev" class="secondary">上一页</button>
        <button id="next" class="secondary">下一页</button>
        <span id="page-info" class="muted"></span>
      </div>
    </div>
  </div>

  <script>
    const keyId = ${JSON.stringify(keyId)};
    const rows = document.getElementById("rows");
    const drpWrap = document.getElementById("drp-wrap");
    const drpBtn = document.getElementById("drp-btn");
    const drpPanel = document.getElementById("drp-panel");
    const drpStatus = document.getElementById("drp-status");
    const drpCalLeft = document.getElementById("drp-cal-left");
    const drpCalRight = document.getElementById("drp-cal-right");
    const filterQuery = document.getElementById("filter-query");
    const pageSizeInput = document.getElementById("page-size");
    const resultSummary = document.getElementById("result-summary");
    const pageInfo = document.getElementById("page-info");
    const themeToggle = document.getElementById("theme-toggle");
    const themeIcon = document.getElementById("theme-icon");
    const themeLabel = document.getElementById("theme-label");
    const THEME_STORAGE_KEY = "copilot-admin-theme";

    const state = {
      page: 1,
      pageSize: Number(pageSizeInput.value) || 20,
      total: 0,
      pages: 1,
      rangeFromIso: "",
      rangeToIso: "",
    };

    const drpState = {
      open: false,
      viewYear: new Date().getFullYear(),
      viewMonth: new Date().getMonth() > 0 ? new Date().getMonth() - 1 : 11,
      startDate: null,
      endDate: null,
      hoverDate: null,
      picking: "start",
    };
    if (new Date().getMonth() === 0) drpState.viewYear -= 1;

    const DRP_WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
    const DRP_MONTHS = [
      "一月",
      "二月",
      "三月",
      "四月",
      "五月",
      "六月",
      "七月",
      "八月",
      "九月",
      "十月",
      "十一月",
      "十二月",
    ];

    const pad = (n) => String(n).padStart(2, "0");

    function applyTheme(theme) {
      const resolved = theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", resolved);
      themeIcon.textContent = resolved === "dark" ? "🌙" : "🌞";
      themeLabel.textContent = resolved === "dark" ? "Dark" : "Light";
    }

    function drpFormatDate(d) {
      return d
        ? d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + pad(d.getDate())
        : "";
    }

    function drpSameDay(a, b) {
      return !!a && !!b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
    }

    function drpDateOnly(d) {
      const r = new Date(d);
      r.setHours(0, 0, 0, 0);
      return r;
    }

    function drpIsBetween(d, a, b) {
      if (!a || !b) return false;
      const dt = drpDateOnly(d).getTime();
      const lo = Math.min(drpDateOnly(a).getTime(), drpDateOnly(b).getTime());
      const hi = Math.max(drpDateOnly(a).getTime(), drpDateOnly(b).getTime());
      return dt > lo && dt < hi;
    }

    function drpEffectiveEnd() {
      return drpState.picking === "end" && drpState.hoverDate && drpState.startDate
        ? drpState.hoverDate
        : drpState.endDate;
    }

    function drpBuildMonth(year, month, side) {
      const today = new Date();
      const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const effEnd = drpEffectiveEnd();

      const header = '<div class="drp-cal-header">' +
        (side === "left"
          ? '<button type="button" class="drp-nav-btn" id="drp-prev">‹</button>'
          : '<span style="width:30px"></span>') +
        '<span class="drp-month-label">' + year + '年 ' + DRP_MONTHS[month] + '</span>' +
        (side === "right"
          ? '<button type="button" class="drp-nav-btn" id="drp-next">›</button>'
          : '<span style="width:30px"></span>') +
        '</div>';

      const weekRow = '<div class="drp-weekdays">' +
        DRP_WEEKDAYS.map((l) => '<span>' + l + '</span>').join("") + '</div>';

      let days = '<div class="drp-days">';
      for (let i = 0; i < firstWeekday; i++) {
        days += '<button type="button" class="drp-day drp-day-empty" tabindex="-1"></button>';
      }
      for (let d = 1; d <= lastDay; d++) {
        const date = new Date(year, month, d);
        let cls = "drp-day";
        const isStart = drpSameDay(date, drpState.startDate);
        const isEnd = drpSameDay(date, effEnd) && !!drpState.startDate;
        const inRange = drpIsBetween(date, drpState.startDate, effEnd);
        if (isStart) cls += " drp-day-start";
        if (isEnd) cls += " drp-day-end";
        if (inRange) cls += " drp-day-in-range";
        if (drpSameDay(date, today)) cls += " drp-day-today";
        days += '<button type="button" class="' + cls + '" data-y="' + year + '" data-m="' + month + '" data-d="' + d + '">' + d + '</button>';
      }
      days += '</div>';
      return header + weekRow + days;
    }

    function drpRender() {
      let ry = drpState.viewYear;
      let rm = drpState.viewMonth + 1;
      if (rm > 11) {
        rm = 0;
        ry++;
      }
      drpCalLeft.innerHTML = drpBuildMonth(drpState.viewYear, drpState.viewMonth, "left");
      drpCalRight.innerHTML = drpBuildMonth(ry, rm, "right");

      drpStatus.textContent = drpState.startDate && drpState.picking === "end"
        ? "起始：" + drpFormatDate(drpState.startDate) + "，请点击结束日期"
        : drpState.startDate && drpState.endDate
          ? drpFormatDate(drpState.startDate) + " ~ " + drpFormatDate(drpState.endDate)
          : "点击选择起始日期";

      const prevBtn = document.getElementById("drp-prev");
      const nextBtn = document.getElementById("drp-next");
      if (prevBtn) {
        prevBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          drpState.viewMonth--;
          if (drpState.viewMonth < 0) {
            drpState.viewMonth = 11;
            drpState.viewYear--;
          }
          drpRender();
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          drpState.viewMonth++;
          if (drpState.viewMonth > 11) {
            drpState.viewMonth = 0;
            drpState.viewYear++;
          }
          drpRender();
        });
      }

      drpPanel.querySelectorAll(".drp-day[data-d]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const date = new Date(+btn.dataset.y, +btn.dataset.m, +btn.dataset.d);
          if (drpState.picking === "start") {
            drpState.startDate = date;
            drpState.endDate = null;
            drpState.picking = "end";
            drpRender();
          } else {
            let s = drpState.startDate;
            let en = date;
            if (en < s) {
              const t = s;
              s = en;
              en = t;
            }
            drpState.startDate = s;
            drpState.endDate = en;
            drpState.picking = "start";
            drpRender();
            drpApplyAndClose();
          }
        });
      });
    }

    function drpSetRange(startDate, endDate) {
      drpState.startDate = startDate;
      drpState.endDate = endDate;
      drpState.picking = "start";
      if (startDate && endDate) {
        const from = new Date(startDate);
        from.setHours(0, 0, 0, 0);
        const to = new Date(endDate);
        to.setHours(23, 59, 59, 999);
        state.rangeFromIso = from.toISOString();
        state.rangeToIso = to.toISOString();
      } else {
        state.rangeFromIso = "";
        state.rangeToIso = "";
      }
      drpUpdateLabel();
    }

    function drpUpdateLabel() {
      if (drpState.startDate && drpState.endDate) {
        drpBtn.textContent =
          "📅 " + drpFormatDate(drpState.startDate) + " ~ " + drpFormatDate(drpState.endDate);
        drpBtn.classList.remove("drp-placeholder");
      } else {
        drpBtn.textContent = "📅 选择日期范围";
        drpBtn.classList.add("drp-placeholder");
      }
    }

    function drpOpenPanel() {
      drpState.open = true;
      drpPanel.style.display = "flex";
      drpBtn.classList.add("drp-active");
      drpRender();
    }

    function drpClosePanel() {
      drpState.open = false;
      drpPanel.style.display = "none";
      drpBtn.classList.remove("drp-active");
    }

    function drpApplyAndClose() {
      drpSetRange(drpState.startDate, drpState.endDate);
      drpClosePanel();
    }

    function applyQuickRange(type) {
      const now = new Date();
      const end = new Date(now);
      let start = new Date(now);
      if (type === "last_week") {
        start.setDate(start.getDate() - 6);
      } else if (type === "last_month") {
        start.setDate(start.getDate() - 29);
      } else {
        start.setDate(start.getDate() - 89);
      }
      drpSetRange(start, end);
      drpClosePanel();
    }

    function formatTime(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
    }

    function formatJson(value) {
      if (value === null || value === undefined) return "";
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    function renderRows(items) {
      rows.innerHTML = "";
      if (!items.length) {
        rows.innerHTML = '<tr><td colspan="6" class="muted">暂无数据</td></tr>';
        return;
      }

      for (const item of items) {
        const tr = document.createElement("tr");
        const timeCell = document.createElement("td");
        timeCell.textContent = formatTime(item.timestamp);
        const methodCell = document.createElement("td");
        methodCell.textContent = item.method;
        const pathCell = document.createElement("td");
        pathCell.textContent = item.path;
        const statusCell = document.createElement("td");
        statusCell.textContent = String(item.status);
        const inputTokenCell = document.createElement("td");
        const outputTokenCell = document.createElement("td");
        const resolvedInputTokens =
          item.inputTokens === null || item.inputTokens === undefined
            ? item.tokenUsage
            : item.inputTokens;
        const resolvedOutputTokens =
          item.outputTokens === null || item.outputTokens === undefined
            ? null
            : item.outputTokens;
        inputTokenCell.textContent =
          resolvedInputTokens === null || resolvedInputTokens === undefined
            ? "-"
            : String(resolvedInputTokens);
        outputTokenCell.textContent =
          resolvedOutputTokens === null || resolvedOutputTokens === undefined
            ? "-"
            : String(resolvedOutputTokens);
        const durationCell = document.createElement("td");
        durationCell.textContent = item.durationMs + "ms";

        const detailCell = document.createElement("td");
        const detail = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "查看详情";
        detail.appendChild(summary);
        const detailGrid = document.createElement("div");
        detailGrid.className = "detail-grid";

        const requestWrap = document.createElement("div");
        const requestTitle = document.createElement("div");
        requestTitle.textContent = "请求";
        requestTitle.className = "muted";
        const requestPre = document.createElement("pre");
        requestPre.textContent = formatJson(item.request);
        requestWrap.appendChild(requestTitle);
        requestWrap.appendChild(requestPre);

        const responseWrap = document.createElement("div");
        const responseTitle = document.createElement("div");
        responseTitle.textContent = item.error ? "错误" : "响应";
        responseTitle.className = "muted";
        const responsePre = document.createElement("pre");
        responsePre.textContent = item.error
          ? item.error
          : formatJson(item.response);
        responseWrap.appendChild(responseTitle);
        responseWrap.appendChild(responsePre);

        detailGrid.appendChild(requestWrap);
        detailGrid.appendChild(responseWrap);
        detail.appendChild(detailGrid);
        detailCell.appendChild(detail);

        tr.appendChild(timeCell);
        tr.appendChild(methodCell);
        tr.appendChild(pathCell);
        tr.appendChild(statusCell);
        tr.appendChild(inputTokenCell);
        tr.appendChild(outputTokenCell);
        tr.appendChild(durationCell);
        tr.appendChild(detailCell);
        rows.appendChild(tr);
      }
    }

    async function loadPage() {
      const params = new URLSearchParams();
      const from = state.rangeFromIso;
      const to = state.rangeToIso;
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const query = String(filterQuery.value || "").trim();
      if (query) params.set("query", query);
      params.set("page", String(state.page));
      params.set("pageSize", String(state.pageSize));

      const response = await fetch(
        "/admin/api-keys/" + encodeURIComponent(keyId) + "/audit?" + params.toString(),
      );
      if (!response.ok) {
        rows.innerHTML = '<tr><td colspan="6" class="muted">读取失败</td></tr>';
        return;
      }

      const data = await response.json();
      state.total = data.total || 0;
      state.pages = data.pages || 1;
      state.page = data.page || 1;
      resultSummary.textContent =
        "共 " + state.total + " 条记录" +
        (query ? "，关键字：" + query : "");
      pageInfo.textContent = "第 " + state.page + " / " + state.pages + " 页";
      renderRows(Array.isArray(data.items) ? data.items : []);
    }

    document.getElementById("apply").addEventListener("click", () => {
      state.page = 1;
      state.pageSize = Number(pageSizeInput.value) || 20;
      loadPage();
    });

    document.getElementById("reset").addEventListener("click", () => {
      drpState.startDate = null;
      drpState.endDate = null;
      drpState.hoverDate = null;
      drpState.picking = "start";
      state.rangeFromIso = "";
      state.rangeToIso = "";
      drpUpdateLabel();
      filterQuery.value = "";
      pageSizeInput.value = "20";
      state.page = 1;
      state.pageSize = 20;
      loadPage();
    });

    document.getElementById("prev").addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        loadPage();
      }
    });

    document.getElementById("next").addEventListener("click", () => {
      if (state.page < state.pages) {
        state.page += 1;
        loadPage();
      }
    });

    drpBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (drpState.open) {
        drpClosePanel();
        return;
      }
      drpOpenPanel();
    });

    drpPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    drpPanel.querySelectorAll(".drp-shortcut").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const range = btn.getAttribute("data-range");
        if (range) {
          applyQuickRange(range);
        }
      });
    });

    document.getElementById("drp-cancel").addEventListener("click", (event) => {
      event.stopPropagation();
      drpClosePanel();
    });

    document.addEventListener("click", () => {
      if (drpState.open) {
        drpClosePanel();
      }
    });

    document.getElementById("back").addEventListener("click", () => {
      location.href = "/admin";
    });

    themeToggle.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") ?? "light";
      const nextTheme = current === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });

    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) ?? "light");
    drpUpdateLabel();
    applyQuickRange("last_month");
    loadPage();
  </script>
</body>
</html>`

adminRoutes.get("/login", (c) => {
  if (!isAdminConfigured()) {
    return c.redirect("/admin")
  }
  if (isAdminAuthenticated(c)) {
    return c.redirect("/admin")
  }

  return c.html(loginPage)
})

adminRoutes.post("/login", async (c) => {
  if (!isAdminConfigured()) {
    return c.json({ ok: true })
  }

  const contentType = c.req.header("content-type") ?? ""
  let credentials: {
    username: string
    password: string
  }

  if (contentType.includes("application/json")) {
    const payload = await c.req.json<{ username?: string; password?: string }>()
    credentials = {
      username: payload.username?.trim() ?? "",
      password: payload.password ?? "",
    }
  } else {
    const formData = await c.req.formData()
    credentials = {
      username: toFormText(formData.get("username")).trim(),
      password: toFormText(formData.get("password")),
    }
  }

  if (!validateAdminCredentials(credentials.username, credentials.password)) {
    return c.json({ error: "Invalid username or password" }, 401)
  }

  setAdminSession(c, credentials.username)
  return c.json({ ok: true })
})

adminRoutes.post("/logout", (c) => {
  clearAdminSession(c)
  return c.json({ ok: true })
})

adminRoutes.get("/", (c) => {
  if (!isAdminAuthenticated(c)) {
    return c.redirect("/admin/login")
  }

  return c.html(adminPage)
})

adminRoutes.get("/api-keys/:id/settings", async (c) => {
  const id = c.req.param("id")
  const item = await getManagedApiKeyById(id)
  if (!item) {
    return c.text("API key not found", 404)
  }

  return c.html(settingsPage(item.id))
})

adminRoutes.get("/api-keys/:id/usage-view", async (c) => {
  const id = c.req.param("id")
  const item = await getManagedApiKeyById(id)
  if (!item) {
    return c.text("API key not found", 404)
  }

  return c.html(usagePage(item.id))
})

adminRoutes.get("/api-keys/:id/audit-view", async (c) => {
  const id = c.req.param("id")
  const item = await getManagedApiKeyById(id)
  if (!item) {
    return c.text("API key not found", 404)
  }

  return c.html(auditPage(item.id))
})

adminRoutes.use("/api-keys/*", requireAdminAuth())
adminRoutes.use("/api-keys", requireAdminAuth())

adminRoutes.get("/api-keys", async (c) => {
  const items = await listManagedApiKeys()
  const itemsWithUsage = await Promise.all(
    items.map(async (item) => {
      const usage = await getManagedApiKeyUsageSummary(item.id)
      return { ...item, totalUsage: usage.total }
    }),
  )
  return c.json({ items: itemsWithUsage })
})

adminRoutes.get("/api-keys/:id", async (c) => {
  const id = c.req.param("id")
  const item = await getManagedApiKeyById(id)

  if (!item) {
    return c.json({ error: "API key not found" }, 404)
  }

  return c.json({ id: item.id, key: item.key })
})

adminRoutes.post("/api-keys", async (c) => {
  const payload = await c.req.json<{
    id?: string
    totalLimit?: number | null
    dailyLimit?: number | null
    expiresAt?: string | null
  }>()
  const id = payload.id?.trim() ?? ""

  try {
    const item = await createManagedApiKey(id, {
      totalLimit: payload.totalLimit,
      dailyLimit: payload.dailyLimit,
      expiresAt: payload.expiresAt,
    })
    return c.json(item)
  } catch (error) {
    if (error instanceof ManagedApiKeyError) {
      if (error.code === "duplicate-id") {
        return c.json({ error: error.message }, 409)
      }

      return c.json({ error: error.message }, 400)
    }

    return c.json({ error: "Failed to create API key" }, 500)
  }
})

adminRoutes.get("/api-keys/:id/usage", async (c) => {
  const id = c.req.param("id")
  const item = await getManagedApiKeyById(id)
  if (!item) {
    return c.json({ error: "API key not found" }, 404)
  }

  const fromRaw = c.req.query("from")
  const toRaw = c.req.query("to")
  if (!fromRaw || !toRaw) {
    return c.json({ error: "from and to are required" }, 400)
  }

  const from = new Date(fromRaw)
  const to = new Date(toRaw)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return c.json({ error: "invalid time range" }, 400)
  }

  const records = await getManagedApiKeyUsageByRange(item.id, from, to)
  const summary = await getManagedApiKeyUsageSummary(item.id)

  return c.json({
    keyId: item.id,
    from: from.toISOString(),
    to: to.toISOString(),
    count: records.length,
    totalUsage: summary.total,
    dailyUsage: summary.daily,
    records,
  })
})

adminRoutes.get("/api-keys/:id/audit", async (c) => {
  const id = c.req.param("id")
  const item = await getManagedApiKeyById(id)
  if (!item) {
    return c.json({ error: "API key not found" }, 404)
  }

  const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10))
  const pageSize = Math.min(
    200,
    Math.max(1, Number.parseInt(c.req.query("pageSize") ?? "20", 10)),
  )
  const fromRaw = c.req.query("from")
  const toRaw = c.req.query("to")
  const query = c.req.query("query")

  const from = fromRaw ? new Date(fromRaw) : undefined
  const to = toRaw ? new Date(toRaw) : undefined
  if (from && Number.isNaN(from.getTime())) {
    return c.json({ error: "invalid from" }, 400)
  }
  if (to && Number.isNaN(to.getTime())) {
    return c.json({ error: "invalid to" }, 400)
  }
  if (from && to && from > to) {
    return c.json({ error: "invalid time range" }, 400)
  }

  const result = await getManagedApiKeyAuditPage(item.id, {
    from,
    to,
    query,
    page,
    pageSize,
  })

  return c.json(result)
})

adminRoutes.patch("/api-keys/:id/settings", async (c) => {
  const id = c.req.param("id")
  const payload = await c.req.json<{
    totalLimit?: number | null
    dailyLimit?: number | null
    expiresAt?: string | null
  }>()

  try {
    const updated = await updateManagedApiKeySettings(id, {
      totalLimit: payload.totalLimit,
      dailyLimit: payload.dailyLimit,
      expiresAt: payload.expiresAt,
    })

    if (!updated) {
      return c.json({ error: "API key not found" }, 404)
    }

    return c.json({
      id: updated.id,
      totalLimit: updated.totalLimit,
      dailyLimit: updated.dailyLimit,
      expiresAt: updated.expiresAt,
    })
  } catch (error) {
    if (error instanceof ManagedApiKeyError) {
      return c.json({ error: error.message }, 400)
    }

    return c.json({ error: "Failed to update settings" }, 500)
  }
})

adminRoutes.delete("/api-keys/:id", async (c) => {
  const id = c.req.param("id")
  const deleted = await deleteManagedApiKey(id)

  if (!deleted) {
    return c.json({ error: "API key not found" }, 404)
  }

  return c.json({ ok: true })
})

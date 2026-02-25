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
  listManagedApiKeys,
  ManagedApiKeyError,
} from "~/lib/api-key-store"

export const adminRoutes = new Hono()

const toFormText = (value: unknown): string =>
  typeof value === "string" ? value : ""

const loginPage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Copilot API Admin Login</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    .container { max-width: 420px; margin: 80px auto; padding: 24px; background: #111827; border: 1px solid #334155; border-radius: 12px; }
    h1 { margin: 0 0 16px; font-size: 20px; }
    label { display: block; margin: 12px 0 6px; font-size: 14px; color: #cbd5e1; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #475569; background: #0b1220; color: #e2e8f0; }
    button { margin-top: 16px; width: 100%; padding: 10px 12px; border: none; border-radius: 8px; background: #2563eb; color: white; font-weight: 600; cursor: pointer; }
    .error { margin-top: 12px; color: #f87171; min-height: 20px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Copilot API 管理后台</h1>
    <form id="login-form">
      <label for="username">用户名</label>
      <input id="username" name="username" required autocomplete="username" />
      <label for="password">密码</label>
      <input id="password" name="password" type="password" required autocomplete="current-password" />
      <button type="submit">登录</button>
      <div class="error" id="error"></div>
    </form>
  </div>
  <script>
    const form = document.getElementById("login-form");
    const error = document.getElementById("error");

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
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Copilot API Admin</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    .container { max-width: 900px; margin: 40px auto; padding: 24px; }
    .toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
    .toolbar input { flex: 1; min-width: 240px; padding: 10px 12px; border-radius: 8px; border: 1px solid #475569; background: #0b1220; color: #e2e8f0; }
    button { padding: 10px 12px; border: none; border-radius: 8px; background: #2563eb; color: white; font-weight: 600; cursor: pointer; }
    button.danger { background: #dc2626; }
    button.secondary { background: #334155; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; border-bottom: 1px solid #334155; padding: 10px 8px; }
    .muted { color: #94a3b8; font-size: 13px; }
    .new-token { margin-top: 10px; word-break: break-all; color: #22c55e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="toolbar">
      <input id="key-name" placeholder="输入 key 名称（如 claude-client）" />
      <button id="create">新建 API Key</button>
      <button id="refresh">刷新</button>
      <button id="logout" class="danger">退出登录</button>
    </div>

    <div class="card">
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
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>

  <script>
    const rows = document.getElementById("rows");
    const newToken = document.getElementById("new-token");
    const keyNameInput = document.getElementById("key-name");

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
      rows.innerHTML = "";

      for (const item of items) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + item.id + "</td>" +
          "<td>" + item.prefix + "</td>" +
          "<td>" + item.createdAt + "</td>" +
          '<td>' +
          '<button data-id="' + item.id + '" data-action="copy" class="secondary">复制</button> ' +
          '<button data-id="' + item.id + '" data-action="delete" class="danger">删除</button>' +
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

    document.getElementById("refresh").addEventListener("click", loadKeys);
    document.getElementById("logout").addEventListener("click", async () => {
      await fetch("/admin/logout", { method: "POST" });
      location.href = "/admin/login";
    });

    loadKeys();
  </script>
</body>
</html>`

adminRoutes.get("/login", (c) => {
  if (isAdminAuthenticated(c)) {
    return c.redirect("/admin")
  }

  return c.html(loginPage)
})

adminRoutes.post("/login", async (c) => {
  if (!isAdminConfigured()) {
    return c.json({ error: "Admin credentials are not configured" }, 503)
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

adminRoutes.use("/api-keys/*", requireAdminAuth())
adminRoutes.use("/api-keys", requireAdminAuth())

adminRoutes.get("/api-keys", async (c) => {
  const items = await listManagedApiKeys()
  return c.json({ items })
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
  const payload = await c.req.json<{ id?: string }>()
  const id = payload.id?.trim() ?? ""

  try {
    const item = await createManagedApiKey(id)
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

adminRoutes.delete("/api-keys/:id", async (c) => {
  const id = c.req.param("id")
  const deleted = await deleteManagedApiKey(id)

  if (!deleted) {
    return c.json({ error: "API key not found" }, 404)
  }

  return c.json({ ok: true })
})

# Edge Functions

Edge Functions 用于服务端 Deno TypeScript 逻辑，如 API 端点、Webhook 处理、第三方集成等需要后端支持的场景。

## 函数开发流程

1. **编写代码**：在 `/functions/{functionName}/index.ts` 中编写 Deno TypeScript 代码
2. **部署函数**：执行 `meoo-cli cloud deploy-function -n {functionName}` 命令部署函数
3. **重新部署**：每次代码修改后必须重新运行 deploy 命令

## 函数结构

```typescript
Deno.serve(async (req) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await req.json();
    // 业务逻辑
    return new Response(JSON.stringify({ data: body }), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
```

## 环境变量

**系统变量**（始终可用）：
- `SUPABASE_URL` — Supabase API URL（私有网络 URL）
- `SUPABASE_ANON_KEY` — 公共匿名密钥
- `SUPABASE_SERVICE_ROLE_KEY` — 服务角色密钥（保密）
- `SUPABASE_DB_URL` — PostgreSQL 连接 URL

**自定义变量**：项目可能配置了额外的密钥。使用 `meoo-cli cloud list-functions` 查看完整的环境变量列表；如需新增或更新变量，使用 `meoo-cli cloud set-secret --name VARIABLE_NAME` 打开配置卡片填写 Secret 值；批量配置可用 `--name A --name B` 或 `--names A,B`。如需删除变量，使用 `meoo-cli cloud delete-secret --name VARIABLE_NAME` 或 `meoo-cli cloud secret delete --names A,B` 打开确认卡片，用户点击确认后执行删除。不要把 Secret 明文写进命令行、代码或对话。

**重要**：只使用实际存在的环境变量，引用不存在的变量会导致运行时错误。

## Supabase 客户端

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 管理员客户端（绕过 RLS）
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// 用户客户端（遵守 RLS，使用前端 Auth header）
const authHeader = req.headers.get('Authorization')!;
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { global: { headers: { Authorization: authHeader } } },
);
```

## 前端调用

通过友好的 Toast 交互提醒用户数据操作结果，尤其是失败场景。


用 `fetch` 配合 `getSupabaseUrl()` 调用。如果函数需要用户身份，**必须**手动附加 `Authorization` header；流式响应直接读取 `response.body` 的 ReadableStream。

```typescript
import { supabase, getSupabaseUrl } from 'src/supabase/client.ts';

// 获取认证 headers
const session = (await supabase.auth.getSession()).data.session;
const authHeaders = session ? { Authorization: `Bearer ${session.access_token}` } : {};

const response = await fetch(`${getSupabaseUrl()}/functions/v1/hello-world`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders },
  body: JSON.stringify({ name: 'world' }),
});

const result = await response.json();
if (!response.ok) {
  console.error('Function error:', result);
}
```




## 部署管理

1. **部署**：`meoo-cli cloud deploy-function -n {functionName}`
2. **删除**：`meoo-cli cloud delete-function -n {functionName}`

> `/functions/{functionName}/` 下的代码修改是本地的，直到再次运行 deploy 命令才会更新在线函数。

# 适用场景

- 需要服务器端逻辑（如第三方 API 调用、密钥保护）
- **浏览器真实 CORS 阻止前端 fetch/XHR 调用第三方或不可控外部 API，需要改为受限服务端代理**
- API 端点 / Webhook 处理
- 定时任务 / 后台数据处理
- 需要使用 Service Role Key 绕过 RLS 的操作

### 何时使用 Edge Function 做 CORS 代理

以下场景应使用 Edge Function 做受限服务端代理：
- 预览中确认 CORS 错误来自前端 fetch/XHR 调用第三方或不可控外部 API
- 用户要求 "把这个 API 调用移到后端，避免浏览器 CORS 拦截"
- 用户要求 "用 Edge Function 代理这个外部 API，同时把 API key 留在后端"

**不要** 为以下场景生成代理：
- 静态资源 CDN（图片、字体、CSS）— 低价值，应直接用 `<img>` 或 CSS
- 脚本类 CDN（`cdn.jsdelivr.net`、`unpkg.com`）— 应用 `<script>` 标签加载
- SSE/EventSource 流式请求 — 代理会破坏流式语义
- 目标后端可由用户自行配置 CORS/OPTIONS — 优先指导修目标服务

### CORS 代理安全要求

- 不得实现开放代理，必须限制目标域名、路径范围、HTTP 方法和可转发请求头
- 不要透传所有浏览器 headers/cookies，尤其不要默认转发 Cookie、Authorization、Origin；只转发 allowlist 内必要 headers
- API key、secret、签名或服务端 token 不得留在前端，应放在 Edge Function/环境变量侧；缺少必需环境变量时要 fail fast 返回明确配置错误
- 函数必须处理 OPTIONS 预检，并在成功和错误响应里返回 Access-Control-Allow-* 响应头

## 开发注意事项

1.代码符合 TypeScript 严格模式
- **Error 类型**：`catch (error)` 中 error 是 `unknown` 类型，需要类型检查或断言：
  ```typescript
  catch (error) {
    // 方法1：类型检查
    const message = error instanceof Error ? error.message : 'Unknown error';
    // 方法2：类型断言
    const message = (error as Error).message;
  }
  ```

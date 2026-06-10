# 问题排查

## CLI 命令问题

### 命令执行规则
1. **独立执行**：每个 CLI 命令必须单独调用，等待结果后再继续
2. **确认等待**：启用云服务时会弹出确认卡片，必须等待用户确认完成

## 数据库问题

### 数据看不到
通常是 RLS 策略与实际功能不匹配：
- 如果应用没有登录功能，使用匿名友好策略：`USING (true)`
- 如果应用有登录功能，确保策略正确使用 `auth.uid()`

### RLS 违规错误
插入数据时出现"违反行级安全"：
- 确保 `user_id` 字段在 INSERT 时正确设置为 `auth.uid()`
- 确保 `user_id` 字段不是 nullable（如果 RLS 策略依赖它）

### 写操作"成功"但数据没写入
RLS 拦截 INSERT/UPDATE/DELETE 时，`error` 为 `null`、仅返回空数组，前端容易误判为成功。写操作必须 `.insert(...).select()`，data 长度为 0 视为失败并检查 RLS 策略（详见 `database.md` 的"写操作必须校验影响行数"）。

### 无限递归错误
RLS 策略直接引用同一表：
```sql
-- ❌ 会导致无限递归
CREATE POLICY "example" ON profiles
FOR SELECT USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ✅ 使用安全定义函数
CREATE POLICY "example" ON profiles
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
```

## 认证问题

### 认证状态监听死锁
```typescript
-- ❌ 错误：会导致死锁
supabase.auth.onAuthStateChange(async (event, session) => {
  const profile = await supabase.from('profiles').select()... // 死锁
});

-- ✅ 正确：延迟 Supabase 调用
supabase.auth.onAuthStateChange((event, session) => {
  setSession(session);
  if (session?.user) {
    setTimeout(() => fetchUserProfile(session.user.id), 0);
  }
});
```

## 存储问题

### 文件上传 400 错误
必须使用 ArrayBuffer，不能使用 Blob/File/FormData：
```typescript
import { decode } from 'base64-arraybuffer';

// ✅ 正确
await supabase.storage.from('bucket').upload('path', decode(base64));

// ❌ 错误
await supabase.storage.from('bucket').upload('path', file); // 400 错误
```

## Edge Functions 问题

### CORS 错误
确保函数包含 CORS 处理：
```typescript
if (req.method === 'OPTIONS') {
  return new Response('ok', {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}
```

## 查询问题

### 查询限制
Supabase 默认限制 1000 行，使用分页：
```typescript
const { data } = await supabase
  .from('posts')
  .select()
  .range(0, 49); // 前50条
```

### 单行查询错误
```typescript
// ✅ 安全
const { data } = await supabase.from('table').select().eq('id', id).maybeSingle();

// ❌ 可能出错
const { data } = await supabase.from('table').select().eq('id', id).single();
```
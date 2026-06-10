# 用户认证路由

本文件负责注册登录类型路由、阻塞询问和共享用户数据基线。命中具体类型后，立即读取对应子文档作为 Auth API / 页面 / 云函数 / 测试用户的唯一实现 SOP；`profiles` 基础表、业务表外键和角色权限表以本文为准。




## Web/H5 路由

开始数据库设计之前，必须先完成本节的分级分类路由和最终实现 SOP 确认。不得先读取 `basic_auth.md` 或根据“用户名登录（默认方式）”生成任何数据库、RLS、Auth API、页面或云函数代码。

### 分级分类路由

按 L1 到 L5 自上而下判定；命中即停止，不继续向下归类。长需求中先抽取认证相关子句做本节判定；其他业务功能不降低注册登录澄清优先级。一个需求同时包含基础登录和更高优先级能力时，以更高优先级能力为准。

#### L1：邮箱找回 / 邮箱确认 / 邮箱验证码

命中条件：

- `邮箱 / 邮件 / email` + `忘记密码 / 找回密码 / 邮箱找回 / 重置密码`。
- `邮箱验证码 / 邮件验证码 / 邮箱验证 / 邮箱确认 / 注册邮箱校验`。
- `邮箱登录二次校验 / 邮箱 + 密码 + 验证码`。

路由结果：设置 `authImplementationSop=auth_email_password`，读取 `skills/meoo-cloud-auth/references/auth-email-password.md`；本路线完全取代基础虚拟邮箱方案，不得再读取 `basic_auth.md` 作为基础实现。

Short cases:

- `忘记密码（邮箱找回）` => `auth_email_password`
- `邮箱注册、密码登录、忘记密码（邮箱找回）` => `auth_email_password`
- `邮箱验证码 + 密码用于注册校验` => `auth_email_password`
- `海外用户 + 邮箱注册 + 找回密码` => `auth_email_password`

#### L2：短信找回 / 短信验证码 / 修改手机号

命中条件：

- `短信 / SMS / 手机 / 手机号 / phone` + `忘记密码 / 找回密码 / 重置密码 / 修改手机号`。
- `短信验证码 / 手机验证码 / 阿里云短信 / 注册短信校验`。
- `短信登录二次校验 / 手机号 + 密码 + 验证码`。

路由结果：设置 `authImplementationSop=auth_sms_password`，读取 `skills/meoo-cloud-auth/references/auth-sms-password.md`；本路线完全取代基础虚拟邮箱方案，不得再读取 `basic_auth.md` 作为基础实现。

Short cases:

- `短信验证码登录 + 密码` => `auth_sms_password`
- `手机号注册、密码登录、忘记密码` => `auth_sms_password`
- `修改手机号，需要短信验证` => `auth_sms_password`
- `阿里云短信验证码` => `auth_sms_password`

#### L3：找回 / 重置需求存在但通道未说明

命中条件：出现 `忘记密码 / 找回密码 / 重置密码`，但没有说明邮箱还是短信。

路由结果：STOP，先澄清通道；不得默认选择邮箱、短信或基础密码认证。

Short cases:

- `注册登录 + 忘记密码` => 询问邮箱找回还是短信找回
- `密码登录 + 重置密码` => 询问邮箱重置还是短信重置

#### L4：基础密码认证

命中条件：仅在用户明确只需要普通登录标识 + 密码，且没有验证码、注册校验、找回密码、重置密码或修改手机号时命中。这里的邮箱样式或手机号样式只作为用户名标识，不代表真实邮箱/短信能力。

路由结果：设置 `authImplementationSop=basic_auth`，读取 `skills/meoo-cloud/references/basic_auth.md`。

Short cases:

- `用户名 + 密码登录` => `basic_auth`
- `邮箱样式标识 + 密码登录（不含邮箱确认、验证码、找回密码）` => `basic_auth`
- `手机号样式标识 + 密码登录（不含短信验证码、找回密码、修改手机号）` => `basic_auth`

#### L5：存在注册登录需求但认证方式不明确

命中条件：用户需求的任意位置出现 `登录 / 登陆 / 注册 / 登录注册 / 账号体系 / 当前用户 / 个人中心 / 后台管理 / 用户管理 / 用户系统`，但没有明确邮箱、短信、验证码、找回、重置、修改手机号或普通账号密码方式。

路由结果：STOP，直接发起选择；不得自行选择默认项。L5 命中后，本轮只能输出一句简短承接 + 一个认证方式选择问题；问题发出后立即停止，不得同时输出方案、计划、代码或执行动作。

```text
你希望使用哪种注册登录方式？
1. 普通登录标识 + 密码（邮箱/手机号只作为标识，不带验证码/找回）
2. 邮箱验证码 + 密码
3. 短信验证码 + 密码
```

回答映射：

- 选择 1 => `authImplementationSop=basic_auth`
- 选择 2 => `authImplementationSop=auth_email_password`
- 选择 3 => `authImplementationSop=auth_sms_password`

Short cases:

- `需要注册 / 登录和个人中心` => 询问三选一
- `后台管理用户和订单` => 询问三选一
- `用户系统` => 询问三选一
- `长需求任意位置出现注册/登录但未说明认证方式` => 询问三选一

### 执行闸门

- 开始数据库设计、云服务启用或认证代码生成前，必须已有 `authImplementationSop`: `basic_auth` | `auth_email_password` | `auth_sms_password`。
- 命中 L3 或 L5 但用户尚未回答时，STOP；不得写任何认证相关数据库、RLS、Auth API、页面、云函数或测试用户。
- plan/todo 只能先记录“按 L1 到 L5 确认最终实现 SOP”；未完成前，不得把“设计用户表 / 实现登录页 / 实现短信验证码 / 实现重置密码 / 修改手机号”列为可执行开发任务。

### 推断边界

- 不得根据应用类型、行业、后台管理、用户管理、用户系统、海外用户、常见实现方式或“看起来需要安全”推断注册登录类型。
- 只要命中 L1 或 L2，就不得命中 `basic_auth.md`。
- 找回密码必须依赖邮箱或短信验证码/确认链路；命中 L3 时先澄清，未澄清前不得实现。
- 用户要求纯邮箱验证码免密登录或纯短信验证码免密登录时，说明当前只支持验证码 + 密码链路，并询问是否改成邮箱验证码 + 密码或短信验证码 + 密码。

### 共享用户数据模型

完成 L1 到 L5 路由并得到 `authImplementationSop` 后，Web/H5 默认使用本节的数据模型；子文档不要重建整套 `profiles` / 角色表。

#### profiles

`profiles` 承接当前用户、个人中心、头像昵称、业务表用户外键和后台用户管理。基础模板保持用户名账密的原始结构：

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own_profile ON public.profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_insert_own_profile ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY users_update_own_profile ON public.profiles
FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

#### 自动创建 profile

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'username',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

`handle_new_user` 必须使用 `SECURITY DEFINER SET search_path = public`，避免 RLS 阻断 profile 创建。

#### 业务表与用户关联

业务表引用用户时优先引用 `profiles.id`，并让 RLS 与 `auth.uid()` 对齐：

```sql
CREATE TABLE public.user_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.user_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own_posts ON public.user_posts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY users_insert_own_posts ON public.user_posts
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY users_update_own_posts ON public.user_posts
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

#### 角色和权限

后台、管理员、会员或角色权限需求必须使用独立角色表，不要在 `profiles` 上直接塞 `role` 字段：

```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own_roles ON public.user_roles
FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
```

管理员 RLS 使用 `has_role(auth.uid(), 'admin')` 判断；不要在 `profiles` policy 内查询 `profiles` 自己，避免 RLS 无限递归。


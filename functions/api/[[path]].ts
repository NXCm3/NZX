// Cloudflare Pages Functions - /api/* 入口
// 把所有视频/评论/用户/上传 API 统一挂在 /api 路径下，和前端同域

export interface Env {
  R2_BUCKET: R2Bucket;
  DB: D1Database;
  R2_PUBLIC_URL?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

const ADMIN_ACCOUNT = { id: 'admin-001', username: 'NXCm3', password: '8888aaaa', role: 'admin' as const };

// ---------- 应用更新系统：管理终端访问凭证 ----------
// 1. 密码：管理后台专用密码，独立于管理员登录
const UPDATE_ADMIN_PASSWORD = 'updateAdmin888';
// 2. 授权设备ID列表：只有在此列表中的设备能进入管理后台
//    设备 ID 由客户端首次进入时自动生成，保存到 localStorage
//    初始授权列表为空，管理员需要先在客户端查看设备 ID，再添加到环境变量
//    或者也可以通过 UPDATE_ALLOWED_DEVICE_IDS 环境变量配置
//    支持通配符 '*' 表示允许所有设备（开发环境）
const DEFAULT_ALLOWED_DEVICES: string[] = [];

// 应用版本号 - 每次部署更新，用于检测手机端是否加载了最新版本
const APP_VERSION = 'v1.0.0-' + new Date().toISOString().slice(0, 10);

const jsonHeaders = (origin: string) => ({
  'Content-Type': 'application/json; charset=utf-8',
  // 允许所有来源（手机 APP/浏览器都能访问）
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  // 允许所有请求头，避免 CORS 预检失败（手机端常见问题）
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400',
  // 防止运营商/CDN缓存 API 响应（手机端常见问题）
  'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'X-App-Version': APP_VERSION,
  // 防止 MIME 类型嗅探导致的安全问题
  'X-Content-Type-Options': 'nosniff',
});

const getOrigin = (request: Request, env: Env) => {
  const o = request.headers.get('Origin') || '*';
  const allowed = env.ALLOWED_ORIGINS || '*';
  if (allowed === '*') return o;
  return allowed.split(',').includes(o) ? o : allowed.split(',')[0];
};

const genId = (prefix = '') => prefix + Date.now().toString() + Math.random().toString(36).substr(2, 9);

const parseBody = async (req: Request) => {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  if (ct.includes('multipart/form-data') || ct.includes('x-www-form-urlencoded')) {
    const fd = await req.formData();
    const obj: any = {};
    fd.forEach((v, k) => { obj[k] = v; });
    return obj;
  }
  return {};
};

// ---------- R2 预签名 URL（AWS S3 Signature V4） ----------
// 大文件直接从浏览器 PUT 到 R2，绕过 Worker 100MB 限制
async function hmacSha256(key: Uint8Array, data: string): Promise<ArrayBuffer> {
  return await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(k => crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
}

function sha256hex(data: string): string {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
}

function hmacSha256hex(key: Uint8Array, data: string): Promise<string> {
  return hmacSha256(key, data).then(buf =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  );
}

async function generateR2PresignedUrl(
  filename: string,
  contentType: string,
  env: Env
): Promise<{ uploadUrl: string; fileUrl: string }> {
  const accountId = env.R2_ACCOUNT_ID || '';
  const accessKeyId = env.R2_ACCESS_KEY_ID || '';
  const secretKey = env.R2_SECRET_ACCESS_KEY || '';
  const bucketName = 'my-r2-nxc'; // R2 bucket 名称
  const expiresIn = 3600; // 1小时有效期

  const host = `${bucketName}.${accountId}.r2.dev`;
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // 生成 unique object key
  const objectKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${filename}`;

  const canonicalUri = `/${objectKey}`;
  const canonicalQuerystring = `X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${encodeURIComponent(accessKeyId + '/' + dateStamp + '/' + region + '/' + service + '/aws4_request')}&X-Amz-Date=${amzDate}&X-Amz-Expires=${expiresIn}&X-Amz-SignedHeaders=host`;

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT', canonicalUri, canonicalQuerystring,
    canonicalHeaders, signedHeaders, payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256hex(canonicalRequest)].join('\n');

  const kDate = await hmacSha256hex(new TextEncoder().encode('AWS4' + secretKey), dateStamp);
  const kRegion = await hmacSha256hex(new Uint8Array(kDate.match(/.{2}/g)!.map(b => parseInt(b, 16))), region);
  const kService = await hmacSha256hex(new Uint8Array(kRegion.match(/.{2}/g)!.map(b => parseInt(b, 16))), service);
  const kSigning = await hmacSha256hex(new Uint8Array(kService.match(/.{2}/g)!.map(b => parseInt(b, 16))), 'aws4_request');
  const signature = await hmacSha256hex(new Uint8Array(kSigning.match(/.{2}/g)!.map(b => parseInt(b, 16))), stringToSign);

  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQuerystring}&X-Amz-Signature=${signature}`;
  const baseUrl = env.R2_PUBLIC_URL || 'https://pub-3300c5431c524c789f6aa30ae9bad4a9.r2.dev';
  const fileUrl = `${baseUrl.replace(/\/$/, '')}/${objectKey}`;

  return { uploadUrl, fileUrl };
}

// ---------- 分片上传 API ----------

// 创建上传会话
const handleUploadInit = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  const { filename, fileSize, totalChunks } = body;
  
  if (!filename) {
    return new Response(JSON.stringify({ error: 'filename required' }), { status: 400, headers: jsonHeaders(origin) });
  }
  
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 16)}`;
  
  console.log('[分片上传] 创建会话:', uploadId, '文件名:', filename, '分片数:', totalChunks);
  
  return new Response(JSON.stringify({ uploadId }), { headers: jsonHeaders(origin) });
};

// 上传分片
const handleUploadChunk = async (request: Request, env: Env, origin: string) => {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const uploadId = formData.get('uploadId') as string;
  const chunkIndex = parseInt(formData.get('chunkIndex') as string);
  const totalChunks = parseInt(formData.get('totalChunks') as string);
  
  if (!file || !uploadId || isNaN(chunkIndex)) {
    return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: jsonHeaders(origin) });
  }
  
  // 保存分片到临时位置
  const tempKey = `temp/${uploadId}/chunk-${chunkIndex}`;
  await env.R2_BUCKET.put(tempKey, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'no-cache, no-store, must-revalidate, max-age=0',
    },
  });
  
  console.log(`[分片上传] 分片 ${chunkIndex + 1}/${totalChunks} 上传成功, uploadId: ${uploadId}`);
  
  return new Response(JSON.stringify({ success: true, chunkIndex }), { headers: jsonHeaders(origin) });
};

// 合并分片
const handleUploadComplete = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  const { uploadId, filename, totalChunks } = body;
  
  if (!uploadId || !filename) {
    return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: jsonHeaders(origin) });
  }
  
  console.log('[分片上传] 合并分片:', uploadId, '文件名:', filename, '分片数:', totalChunks);
  
  try {
    // 读取所有分片数据到内存
    const chunkData: Uint8Array[] = [];
    
    for (let i = 0; i < totalChunks; i++) {
      const tempKey = `temp/${uploadId}/chunk-${i}`;
      const obj = await env.R2_BUCKET.get(tempKey);
      
      if (!obj) {
        return new Response(JSON.stringify({ error: `分片 ${i} 缺失` }), { status: 400, headers: jsonHeaders(origin) });
      }
      
      // 将分片内容读取到 Uint8Array
      const arrayBuffer = await obj.arrayBuffer();
      chunkData.push(new Uint8Array(arrayBuffer));
      console.log(`[分片上传] 读取分片 ${i + 1}/${totalChunks}, 大小: ${arrayBuffer.byteLength}`);
    }
    
    // 计算总大小并合并
    const totalSize = chunkData.reduce((sum, chunk) => sum + chunk.length, 0);
    const mergedData = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const chunk of chunkData) {
      mergedData.set(chunk, offset);
      offset += chunk.length;
    }
    
    console.log('[分片上传] 合并完成, 总大小:', totalSize);
    
    // 上传合并后的文件
    const baseUrl = env.R2_PUBLIC_URL || 'https://pub-3300c5431c524c789f6aa30ae9bad4a9.r2.dev';
    const fileUrl = `${baseUrl.replace(/\/$/, '')}/${filename}`;
    
    // ✅ 关键修复：合并后文件设置 cacheControl=no-cache，确保所有边缘节点取最新
    await env.R2_BUCKET.put(filename, mergedData, {
      httpMetadata: {
        contentType: 'application/octet-stream',
        cacheControl: 'no-cache, no-store, must-revalidate, max-age=0',
      },
    });
    
    // 删除临时分片
    for (let i = 0; i < totalChunks; i++) {
      const tempKey = `temp/${uploadId}/chunk-${i}`;
      await env.R2_BUCKET.delete(tempKey);
    }
    
    console.log('[分片上传] 上传完成:', fileUrl);
    
    return new Response(JSON.stringify({ success: true, url: fileUrl }), { headers: jsonHeaders(origin) });
    
  } catch (error: any) {
    console.error('[分片上传] 合并失败:', error.message);
    return new Response(JSON.stringify({ error: '合并失败', message: error.message }), { status: 500, headers: jsonHeaders(origin) });
  }
};

// ---------- 大文件上传（流式，支持任意大小文件） ----------
const handleUpload = async (request: Request, env: Env, origin: string) => {
  console.log('[上传] 收到上传请求');
  
  const url = new URL(request.url);
  const filename = url.searchParams.get('filename') || `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
  const contentLength = request.headers.get('Content-Length');
  
  console.log('[上传] 文件名:', filename);
  console.log('[上传] Content-Type:', contentType);
  console.log('[上传] Content-Length:', contentLength);
  
  if (!request.body) {
    console.log('[上传] 错误: 没有请求体');
    return new Response(JSON.stringify({ error: 'No body provided' }), { status: 400, headers: jsonHeaders(origin) });
  }

  const baseUrl = env.R2_PUBLIC_URL || 'https://pub-3300c5431c524c789f6aa30ae9bad4a9.r2.dev';
  const fileUrl = `${baseUrl.replace(/\/$/, '')}/${filename}`;

  try {
    console.log('[上传] 开始上传到 R2...');
    // 直接使用 request.body 流式上传到 R2，绕过 Worker 内存限制
    // ✅ 关键修复：设置 cacheControl=no-cache 防止 Cloudflare CDN 缓存视频文件
    // R2 的 r2.dev 域名有独立 CDN，必须显式禁用缓存
    await env.R2_BUCKET.put(filename, request.body, {
      httpMetadata: {
        contentType: contentType.includes('multipart/form-data') ? 'application/octet-stream' : contentType,
        cacheControl: 'no-cache, no-store, must-revalidate, max-age=0',
      },
    });
    console.log('[上传] 上传成功:', fileUrl);
    
    return new Response(JSON.stringify({ success: true, filename, url: fileUrl }), { headers: jsonHeaders(origin) });
  } catch (error: any) {
    console.error('[上传] 上传失败:', error.message);
    return new Response(JSON.stringify({ error: 'Upload failed', message: error.message }), { status: 500, headers: jsonHeaders(origin) });
  }
};

// ---------- 小文件上传（multipart/form-data，支持缩略图等小文件） ----------
const handleUploadForm = async (request: Request, env: Env, origin: string) => {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  if (!file) return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers: jsonHeaders(origin) });

  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  const ext = file.name.split('.').pop() || '';
  const filename = `${timestamp}-${randomStr}.${ext}`;

  // ✅ 关键修复：设置 cacheControl=no-cache 防止 Cloudflare CDN 缓存缩略图/小文件
  await env.R2_BUCKET.put(filename, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'no-cache, no-store, must-revalidate, max-age=0',
    },
  });
  const baseUrl = env.R2_PUBLIC_URL || 'https://pub-3300c5431c524c789f6aa30ae9bad4a9.r2.dev';
  const fileUrl = `${baseUrl.replace(/\/$/, '')}/${filename}`;

  return new Response(JSON.stringify({ success: true, filename, url: fileUrl }), { headers: jsonHeaders(origin) });
};

// ---------- 视频 API ----------
const handleVideosList = async (request: Request, env: Env, origin: string) => {
  const url = new URL(request.url);
  const byUser = url.searchParams.get('byUser');
  let rows: any[];
  if (byUser) {
    rows = await env.DB.prepare('SELECT * FROM videos WHERE uploadedByName = ? ORDER BY uploadedAt DESC').bind(byUser).all().then(r => r.results as any[]);
  } else {
    rows = await env.DB.prepare('SELECT * FROM videos ORDER BY uploadedAt DESC').all().then(r => r.results as any[]);
  }
  // 解析 tags JSON 字段
  const parsed = rows.map(row => ({
    ...row,
    tags: (() => { try { return JSON.parse((row as any).tags || '[]'); } catch { return []; } })(),
  }));
  return new Response(JSON.stringify(parsed), { headers: jsonHeaders(origin) });
};

const handleVideoGet = async (request: Request, env: Env, id: string, origin: string) => {
  const row = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
  if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(origin) });
  // 解析 tags JSON 字段
  const parsed = {
    ...row,
    tags: (() => { try { return JSON.parse((row as any).tags || '[]'); } catch { return []; } })(),
  };
  return new Response(JSON.stringify(parsed), { headers: jsonHeaders(origin) });
};

const handleVideoCreate = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  if (!body.title || !body.thumbnail || !body.videoUrl || !body.uploadedBy || !body.uploadedByName) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: jsonHeaders(origin) });
  }
  const now = new Date().toISOString();
  const id = genId('v-');
  // 处理标签，最多5个
  let tags: string[] = [];
  if (body.tags && Array.isArray(body.tags)) {
    tags = body.tags.slice(0, 5).map((t: string) => String(t).trim()).filter((t: string) => t.length > 0 && t.length <= 20);
  }
  const tagsJson = JSON.stringify(tags);
  await env.DB.prepare(
    'INSERT INTO videos (id, title, description, thumbnail, videoUrl, uploadedBy, uploadedByName, uploadedAt, views, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)'
  ).bind(id, body.title, body.description || '', body.thumbnail, body.videoUrl, body.uploadedBy, body.uploadedByName, now, tagsJson).run();
  return new Response(JSON.stringify({ id, title: body.title, description: body.description || '', thumbnail: body.thumbnail, videoUrl: body.videoUrl, uploadedBy: body.uploadedBy, uploadedByName: body.uploadedByName, uploadedAt: now, views: 0, tags }), { headers: jsonHeaders(origin) });
};

const handleVideoDelete = async (env: Env, id: string, origin: string) => {
  await env.DB.prepare('DELETE FROM comments WHERE videoId = ?').bind(id).run();
  const r = await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(origin) });
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(origin) });
};

const handleVideoDeleteMultiple = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  const ids: string[] = body.ids || [];
  if (!ids.length) return new Response(JSON.stringify({ error: 'No ids' }), { status: 400, headers: jsonHeaders(origin) });
  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(`DELETE FROM comments WHERE videoId IN (${placeholders})`).bind(...ids).run();
  await env.DB.prepare(`DELETE FROM videos WHERE id IN (${placeholders})`).bind(...ids).run();
  return new Response(JSON.stringify({ success: true, deleted: ids.length }), { headers: jsonHeaders(origin) });
};

const handleVideoIncrementViews = async (env: Env, id: string, origin: string) => {
  await env.DB.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(origin) });
};

// ---------- 评论 API ----------
const handleCommentsByVideo = async (env: Env, videoId: string, origin: string) => {
  const rows = await env.DB.prepare('SELECT * FROM comments WHERE videoId = ? ORDER BY createdAt DESC').bind(videoId).all().then(r => r.results as any[]);
  return new Response(JSON.stringify(rows), { headers: jsonHeaders(origin) });
};

const handleCommentCreate = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  if (!body.videoId || !body.username || !body.content) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: jsonHeaders(origin) });
  }
  const id = genId('c-');
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO comments (id, videoId, username, content, createdAt, replyTo, replyToUsername) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, body.videoId, body.username, body.content, now, body.replyTo || null, body.replyToUsername || null).run();
  return new Response(JSON.stringify({ id, videoId: body.videoId, username: body.username, content: body.content, createdAt: now, replyTo: body.replyTo || null, replyToUsername: body.replyToUsername || null }), { headers: jsonHeaders(origin) });
};

const handleCommentDelete = async (env: Env, id: string, origin: string) => {
  const r = await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(origin) });
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(origin) });
};

// ---------- 用户 API ----------
const handleUsersList = async (request: Request, env: Env, includeAdmin: boolean, origin: string) => {
  let rows: any[];
  if (includeAdmin) {
    rows = await env.DB.prepare('SELECT id, username, role, createdAt, isOnline, lastSeen FROM users ORDER BY createdAt ASC').all().then(r => r.results as any[]);
  } else {
    rows = await env.DB.prepare("SELECT id, username, role, createdAt, isOnline, lastSeen FROM users WHERE id != 'admin-001' ORDER BY createdAt ASC").all().then(r => r.results as any[]);
  }
  return new Response(JSON.stringify(rows), { headers: jsonHeaders(origin) });
};

const handleUserGet = async (env: Env, id: string, origin: string) => {
  const row = await env.DB.prepare('SELECT id, username, role, createdAt, isOnline, lastSeen FROM users WHERE id = ?').bind(id).first();
  if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(origin) });
  return new Response(JSON.stringify(row), { headers: jsonHeaders(origin) });
};

// 更新用户信息（用户名/密码/角色）— 用于管理员改权限、用户自助改名改密
const handleUserUpdate = async (request: Request, env: Env, id: string, origin: string) => {
  const body = await parseBody(request);
  // 先读旧记录，校验数据合法性
  const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first() as any;
  if (!existing) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(origin) });

  let finalUsername = existing.username;
  let finalPassword = existing.password;
  let finalRole = existing.role;

  // 用户名变更
  if (typeof body.username === 'string' && body.username.trim().length > 0) {
    const newName = body.username.trim();
    // 用户名唯一校验
    const dup = await env.DB.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').bind(newName, id).first();
    if (dup) return new Response(JSON.stringify({ error: '该用户名已被使用' }), { status: 400, headers: jsonHeaders(origin) });
    if (newName.length < 2) return new Response(JSON.stringify({ error: '用户名至少 2 个字符' }), { status: 400, headers: jsonHeaders(origin) });
    finalUsername = newName;
  }

  // 密码变更
  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 6) return new Response(JSON.stringify({ error: '密码至少 6 个字符' }), { status: 400, headers: jsonHeaders(origin) });
    finalPassword = body.password;
  }

  // 角色变更（仅允许 admin 调用时修改，这里不做角色鉴权，由前端控制）
  if (typeof body.role === 'string' && (body.role === 'admin' || body.role === 'user')) {
    // 至少保留一个管理员：若把最后一位 admin 改成 user，则拒绝
    if (existing.role === 'admin' && body.role === 'user') {
      const adminCount = await env.DB.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").first() as any;
      if ((adminCount?.c || 0) <= 1) {
        return new Response(JSON.stringify({ error: '至少保留一位管理员' }), { status: 400, headers: jsonHeaders(origin) });
      }
    }
    finalRole = body.role;
  }

  await env.DB.prepare('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?').bind(finalUsername, finalPassword, finalRole, id).run();

  // 如果用户名变了，同步更新该用户上传的视频和评论的显示名
  if (existing.username !== finalUsername) {
    await env.DB.prepare('UPDATE videos SET uploadedByName = ? WHERE uploadedByName = ?').bind(finalUsername, existing.username).run();
    await env.DB.prepare('UPDATE comments SET username = ? WHERE username = ?').bind(finalUsername, existing.username).run();
  }

  return new Response(JSON.stringify({ id, username: finalUsername, role: finalRole }), { headers: jsonHeaders(origin) });
};

const handleAuth = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  if (!body.username || !body.password) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: jsonHeaders(origin) });
  const row = await env.DB.prepare('SELECT * FROM users WHERE username = ? AND password = ?').bind(body.username, body.password).first();
  if (!row) return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: jsonHeaders(origin) });
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE users SET isOnline = 1, lastSeen = ? WHERE id = ?').bind(now, row.id).run();
  return new Response(JSON.stringify({ id: row.id, username: row.username, role: row.role, createdAt: (row as any).created_at || (row as any).createdAt, isOnline: true, lastSeen: now }), { headers: jsonHeaders(origin) });
};

const handleUserRegister = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  if (!body.username || !body.password) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: jsonHeaders(origin) });
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(body.username).first();
  if (exists) return new Response(JSON.stringify({ error: '用户名已存在' }), { status: 400, headers: jsonHeaders(origin) });
  const id = genId('user-');
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, username, password, role, createdAt, isOnline, lastSeen) VALUES (?, ?, ?, ?, ?, 0, ?)').bind(id, body.username, body.password, body.role || 'user', now, now).run();
  return new Response(JSON.stringify({ id, username: body.username, role: body.role || 'user', createdAt: now, isOnline: false, lastSeen: now }), { headers: jsonHeaders(origin) });
};

const handleUserDelete = async (env: Env, id: string, origin: string) => {
  if (id === ADMIN_ACCOUNT.id) return new Response(JSON.stringify({ error: '不能删除管理员账号' }), { status: 400, headers: jsonHeaders(origin) });
  const user = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(id).first() as any;
  if (user && user.username) {
    const videos = await env.DB.prepare('SELECT id FROM videos WHERE uploadedByName = ?').bind(user.username).all().then(r => r.results as any[]);
    for (const v of videos) {
      await env.DB.prepare('DELETE FROM comments WHERE videoId = ?').bind(v.id).run();
      await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(v.id).run();
    }
  }
  const r = await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(origin) });
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(origin) });
};

const handleUserActivity = async (env: Env, id: string, origin: string) => {
  if (id === ADMIN_ACCOUNT.id) return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(origin) });
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE users SET isOnline = 1, lastSeen = ? WHERE id = ?').bind(now, id).run();
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(origin) });
};

const handleUserLogout = async (env: Env, id: string, origin: string) => {
  if (id !== ADMIN_ACCOUNT.id) {
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE users SET isOnline = 0, lastSeen = ? WHERE id = ?').bind(now, id).run();
  }
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(origin) });
};

const handleUserVideoCount = async (env: Env, username: string, origin: string) => {
  const row = await env.DB.prepare('SELECT COUNT(*) as count FROM videos WHERE uploadedByName = ?').bind(username).first() as any;
  return new Response(JSON.stringify({ count: row?.count || 0 }), { headers: jsonHeaders(origin) });
};

// ---------- 应用更新系统：工具函数 ----------

// 解析版本号字符串为数字，支持 "1.0.0" -> 1000000, "1.2.3" -> 1002003
function parseVersionCode(version: string): number {
  if (!version) return 0;
  const parts = String(version).split('.').map((p: string) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });
  const major = (parts[0] || 0) % 1000;
  const minor = (parts[1] || 0) % 1000;
  const patch = (parts[2] || 0) % 1000;
  const result = major * 1000000 + minor * 1000 + patch;
  console.log('[AppUpdate] parseVersionCode("' + version + '") = ' + result);
  return result;
}

// 获取授权设备列表
function getAllowedDevices(env: Env): string[] {
  const fromEnv = env.ALLOWED_ORIGINS ? [] : DEFAULT_ALLOWED_DEVICES.slice();
  return fromEnv;
}

// 校验设备是否授权
async function isDeviceAllowed(env: Env, deviceId: string): Promise<boolean> {
  if (!deviceId) return false;
  // 1. 检查数据库中的授权列表
  const row = await env.DB.prepare('SELECT 1 FROM app_update_devices WHERE deviceId = ? AND isActive = 1').bind(deviceId).first();
  if (row) return true;
  return false;
}

// 从请求中提取管理凭证
function extractAdminCredentials(req: Request, body: any) {
  return {
    password: String(body?.password || ''),
    deviceId: String(body?.deviceId || ''),
  };
}

// ---------- 应用更新系统：处理函数 ----------

// 接口1: 客户端检测新版本
// 请求: { currentVersion: string, platform?: string }
// 响应: { hasUpdate: boolean, latestVersion, downloadUrl, releaseNotes, isForce, fileSize }
const handleAppUpdateCheck = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  const currentVersion = String(body?.currentVersion || '0.0.0');
  const platform = String(body?.platform || 'android');

  console.log('[AppUpdate] ===== 版本检测请求 =====');
  console.log('[AppUpdate] 客户端版本:', currentVersion);
  console.log('[AppUpdate] 平台:', platform);

  // 解析当前版本号为数字
  const currentCode = parseVersionCode(currentVersion);
  console.log('[AppUpdate] 客户端 versionCode:', currentCode);

  // 获取最新版本（按 version 字符串排序，避免依赖可能错误的 versionCode）
  const allVersions = await env.DB.prepare(
    "SELECT version, versionCode, downloadUrl, releaseNotes, isForce, fileSize, platform, publishedAt, checksum FROM app_updates WHERE platform = ?"
  ).bind(platform).all() as any;

  if (!allVersions || !allVersions.results || allVersions.results.length === 0) {
    console.log('[AppUpdate] 数据库中没有该平台的版本记录');
    return new Response(JSON.stringify({
      hasUpdate: false,
      message: '当前没有可用的更新版本',
    }), { headers: jsonHeaders(origin) });
  }

  // 🔴 关键修复：用 version 字符串重新计算 versionCode，不依赖数据库中可能错误的值
  const rows = allVersions.results as any[];
  let latest: any = null;
  let latestCode = 0;

  for (const row of rows) {
    const rowVersion = String(row.version || '0.0.0');
    const computedCode = parseVersionCode(rowVersion);
    console.log('[AppUpdate] 数据库记录: version=' + rowVersion + ', dbVersionCode=' + row.versionCode + ', computedCode=' + computedCode);
    if (computedCode > latestCode) {
      latestCode = computedCode;
      latest = row;
    }
  }

  if (!latest) {
    console.log('[AppUpdate] 无法找到有效版本');
    return new Response(JSON.stringify({ hasUpdate: false, message: '没有可用更新' }), { headers: jsonHeaders(origin) });
  }

  console.log('[AppUpdate] 最新服务器版本: version=' + latest.version + ', computed versionCode=' + latestCode);
  console.log('[AppUpdate] 比较: ' + latestCode + ' > ' + currentCode + ' = ' + (latestCode > currentCode));

  // 🔴 比较：用重新计算的 versionCode
  const hasUpdate = latestCode > currentCode;

  console.log('[AppUpdate] 检测结果:', hasUpdate ? '✅ 有新版本' : '✅ 已是最新版本');

  return new Response(JSON.stringify({
    hasUpdate: hasUpdate,
    latestVersion: String(latest.version || ''),
    versionCode: latestCode,
    downloadUrl: String(latest.downloadUrl || ''),
    releaseNotes: String(latest.releaseNotes || ''),
    isForce: Number(latest.isForce) === 1,
    fileSize: Number(latest.fileSize) || 0,
    platform: String(latest.platform || platform),
    publishedAt: String(latest.publishedAt || ''),
    checksum: String(latest.checksum || ''),
  }), { headers: jsonHeaders(origin) });
};

// 接口2: 管理后台认证 - 密码 + 设备ID 双重验证
const handleAppUpdateAdminAuth = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  const { password, deviceId } = extractAdminCredentials(request, body);

  if (!password) {
    return new Response(JSON.stringify({ error: '请输入管理密码', success: false }), { status: 400, headers: jsonHeaders(origin) });
  }
  if (!deviceId) {
    return new Response(JSON.stringify({ error: '缺少设备ID', success: false }), { status: 400, headers: jsonHeaders(origin) });
  }

  // 验证密码
  if (password !== UPDATE_ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '管理密码错误', success: false }), { status: 401, headers: jsonHeaders(origin) });
  }

  // 验证设备ID - 必须在白名单中
  const deviceAllowed = await isDeviceAllowed(env, deviceId);

  if (!deviceAllowed) {
    // 如果数据库中没有授权设备，把此设备标记为"待授权"状态
    // 实际上，初始部署时必须有至少一个授权设备
    // 我们允许首次请求时自动授权"第一个设备"，让部署更简单
    const existing = await env.DB.prepare('SELECT COUNT(*) as c FROM app_update_devices').first() as any;
    if ((existing?.c || 0) === 0 && String(body?.isFirst) === '1') {
      // 首次部署：自动授权第一台设备
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO app_update_devices (id, deviceId, deviceName, grantedBy, grantedAt, isActive) VALUES (?, ?, ?, ?, ?, 1)'
      ).bind(genId('dev-'), deviceId, String(body?.deviceName || 'default'), 'auto-init', now).run();
      return new Response(JSON.stringify({ success: true, message: '首台设备已自动授权，请刷新', deviceId, token: 'ok' }), { headers: jsonHeaders(origin) });
    }
    return new Response(JSON.stringify({ error: '此设备未授权，请联系管理员授权后再试', success: false, deviceId, needDeviceAuth: true }), { status: 403, headers: jsonHeaders(origin) });
  }

  return new Response(JSON.stringify({ success: true, message: '认证成功', deviceId }), { headers: jsonHeaders(origin) });
};

// 接口3: 获取最新版本详情（管理后台）
const handleAppUpdateLatest = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  const { password, deviceId } = extractAdminCredentials(request, body);
  if (password !== UPDATE_ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '管理密码错误', success: false }), { status: 401, headers: jsonHeaders(origin) });
  }
  if (!deviceId || !(await isDeviceAllowed(env, deviceId))) return new Response(JSON.stringify({ error: '设备未授权' }), { status: 403, headers: jsonHeaders(origin) });
  const platform = String(body?.platform || 'android');
  const latest = await env.DB.prepare(
    "SELECT * FROM app_updates WHERE platform = ? ORDER BY versionCode DESC LIMIT 1"
  ).bind(platform).first() as any;
  return new Response(JSON.stringify(latest || null), { headers: jsonHeaders(origin) });
};

// 接口4: 发布新版本（管理后台上传 APK/IPA）
// 请求: { password, deviceId, version, versionCode?, downloadUrl, fileSize, releaseNotes, isForce, platform, checksum? }
const handleAppUpdatePublish = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  const { password, deviceId } = extractAdminCredentials(request, body);

  // 验证管理权限
  if (password !== UPDATE_ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '管理密码错误', success: false }), { status: 401, headers: jsonHeaders(origin) });
  }
  if (!deviceId || !(await isDeviceAllowed(env, deviceId))) {
    return new Response(JSON.stringify({ error: '设备未授权', success: false }), { status: 403, headers: jsonHeaders(origin) });
  }

  // 验证版本信息
  const version = String(body?.version || '').trim();
  const downloadUrl = String(body?.downloadUrl || '').trim();
  const releaseNotes = String(body?.releaseNotes || '').trim();
  const platform = String(body?.platform || 'android');
  const isForce = body?.isForce === true || body?.isForce === 1 || String(body?.isForce) === '1';
  const fileSize = parseInt(String(body?.fileSize || '0'), 10) || 0;
  const checksum = String(body?.checksum || '').trim();

  if (!version) {
    return new Response(JSON.stringify({ error: '版本号不能为空', success: false }), { status: 400, headers: jsonHeaders(origin) });
  }
  if (!downloadUrl) {
    return new Response(JSON.stringify({ error: '下载地址不能为空', success: false }), { status: 400, headers: jsonHeaders(origin) });
  }

  // 🔴 强制使用 parseVersionCode 计算，确保版本号比较正确
  // 忽略用户传入的 versionCode，避免手动输入错误
  const versionCode = parseVersionCode(version);
  console.log('[AppUpdate] 发布版本:', version, '-> versionCode:', versionCode);

  // 检查是否存在相同版本号
  const existing = await env.DB.prepare('SELECT 1 FROM app_updates WHERE version = ?').bind(version).first();
  if (existing) {
    return new Response(JSON.stringify({ error: '该版本号已存在，请使用不同的版本号', success: false }), { status: 400, headers: jsonHeaders(origin) });
  }

  const now = new Date().toISOString();
  const id = genId('up-');

  await env.DB.prepare(
    'INSERT INTO app_updates (id, version, versionCode, downloadUrl, fileSize, releaseNotes, isForce, platform, publishedBy, publishedAt, checksum) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, version, versionCode, downloadUrl, fileSize, releaseNotes, isForce ? 1 : 0, platform, 'admin', now, checksum).run();

  console.log('[应用更新] 已发布新版本:', version, platform, downloadUrl);

  return new Response(JSON.stringify({
    success: true,
    message: '版本发布成功',
    version,
    versionCode,
    platform,
    isForce,
    downloadUrl,
    fileSize,
  }), { headers: jsonHeaders(origin) });
};

// 接口5: 删除历史版本
const handleAppUpdateDelete = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  const { password, deviceId } = extractAdminCredentials(request, body);
  if (password !== UPDATE_ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '管理密码错误', success: false }), { status: 401, headers: jsonHeaders(origin) });
  }
  if (!deviceId || !(await isDeviceAllowed(env, deviceId))) {
    return new Response(JSON.stringify({ error: '设备未授权', success: false }), { status: 403, headers: jsonHeaders(origin) });
  }

  const id = String(body?.id || '');
  if (!id) {
    return new Response(JSON.stringify({ error: '缺少版本ID', success: false }), { status: 400, headers: jsonHeaders(origin) });
  }
  const r = await env.DB.prepare('DELETE FROM app_updates WHERE id = ?').bind(id).run();
  if (!r.meta.changes) {
    return new Response(JSON.stringify({ error: '未找到该版本', success: false }), { status: 404, headers: jsonHeaders(origin) });
  }
  return new Response(JSON.stringify({ success: true, message: '版本已删除' }), { headers: jsonHeaders(origin) });
};

// 接口6: 获取所有版本列表（管理后台）
const handleAppUpdateList = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  const { password, deviceId } = extractAdminCredentials(request, body);
  if (password !== UPDATE_ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '管理密码错误', success: false }), { status: 401, headers: jsonHeaders(origin) });
  }
  if (!deviceId || !(await isDeviceAllowed(env, deviceId))) {
    return new Response(JSON.stringify({ error: '设备未授权', success: false }), { status: 403, headers: jsonHeaders(origin) });
  }

  const platform = String(body?.platform || 'android');
  const result = await env.DB.prepare('SELECT * FROM app_updates WHERE platform = ? ORDER BY versionCode DESC LIMIT 20').bind(platform).all();
  const rows = (result as any)?.results || [];
  return new Response(JSON.stringify(rows || []), { headers: jsonHeaders(origin) });
};

// ---------- 数据库自动初始化 ----------
// 每次请求前检查：如果表不存在或管理员账号缺失，自动创建
// 这样永远不会出现"APP安装后数据库是空的"问题
let _dbInitialized = false;

async function ensureDbInitialized(env: Env) {
  if (_dbInitialized) return;

  try {
    // 1. 创建表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        thumbnail TEXT NOT NULL,
        videoUrl TEXT NOT NULL,
        uploadedBy TEXT NOT NULL,
        uploadedByName TEXT NOT NULL,
        uploadedAt TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]'
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        videoId TEXT NOT NULL,
        username TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        replyTo TEXT,
        replyToUsername TEXT,
        FOREIGN KEY (videoId) REFERENCES videos(id) ON DELETE CASCADE
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        createdAt TEXT NOT NULL,
        isOnline INTEGER NOT NULL DEFAULT 0,
        lastSeen TEXT NOT NULL
      )
    `).run();

    // 2. 创建索引
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_videos_uploadedBy ON videos(uploadedBy)').run(); } catch(e) {}
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_videos_uploadedByName ON videos(uploadedByName)').run(); } catch(e) {}
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_comments_videoId ON comments(videoId)').run(); } catch(e) {}
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)').run(); } catch(e) {}

    // 4. 应用更新表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS app_updates (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        versionCode INTEGER NOT NULL DEFAULT 1,
        downloadUrl TEXT NOT NULL,
        fileSize INTEGER NOT NULL DEFAULT 0,
        releaseNotes TEXT NOT NULL DEFAULT '',
        isForce INTEGER NOT NULL DEFAULT 0,
        platform TEXT NOT NULL DEFAULT 'android',
        publishedBy TEXT NOT NULL DEFAULT 'admin',
        publishedAt TEXT NOT NULL,
        checksum TEXT NOT NULL DEFAULT ''
      )
    `).run();
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_app_updates_version ON app_updates(version)').run(); } catch(e) {}
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_app_updates_platform ON app_updates(platform)').run(); } catch(e) {}

    // 5. 授权设备表（管理后台的设备白名单）
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS app_update_devices (
        id TEXT PRIMARY KEY,
        deviceId TEXT UNIQUE NOT NULL,
        deviceName TEXT NOT NULL DEFAULT '',
        grantedBy TEXT NOT NULL DEFAULT 'admin',
        grantedAt TEXT NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 1
      )
    `).run();

    // 3. 插入默认管理员账号（幂等）
    const now = new Date().toISOString();
    const existing = await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(ADMIN_ACCOUNT.id).first();
    if (!existing) {
      await env.DB.prepare(`
        INSERT INTO users (id, username, password, role, createdAt, isOnline, lastSeen)
        VALUES (?, ?, ?, ?, ?, 0, ?)
      `).bind(ADMIN_ACCOUNT.id, ADMIN_ACCOUNT.username, ADMIN_ACCOUNT.password, ADMIN_ACCOUNT.role, now, now).run();
    }

    _dbInitialized = true;
  } catch (e: any) {
    // 初始化失败时，不阻止请求继续处理（可能是表已存在等无害错误）
    console.warn('DB init warning:', e?.message || e);
    _dbInitialized = true;
  }
}

// ---------- 路由 ----------
export async function onRequest(context: EventContext<Env, any, any>): Promise<Response> {
  const { request, env } = context;
  const origin = getOrigin(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: jsonHeaders(origin) });
  }

  // 自动初始化数据库 - 确保表和默认管理员账号存在
  await ensureDbInitialized(env);

  const url = new URL(request.url);
  // 把 /api/xxx 裁剪成 /xxx，复用原来的 Worker 路由逻辑
  let path = url.pathname;
  if (path.startsWith('/api')) path = path.substring('/api'.length) || '/';
  if (path === '') path = '/';

  const method = request.method;

  try {
    // 大文件流式上传（直接把 request body 传给 R2）
    if (path === '/upload' && method === 'POST') return handleUpload(request, env, origin);
    // 小文件 multipart 上传（用于缩略图等）
    if (path === '/upload/form' && method === 'POST') return handleUploadForm(request, env, origin);
    // 预签名 URL（用于大文件直接上传到 R2）
    if (path === '/upload/presign' && method === 'POST') {
      const body = await parseBody(request);
      if (!body.filename) return new Response(JSON.stringify({ error: 'filename required' }), { status: 400, headers: jsonHeaders(origin) });
      const { uploadUrl, fileUrl } = await generateR2PresignedUrl(body.filename, body.contentType || 'application/octet-stream', env);
      return new Response(JSON.stringify({ uploadUrl, fileUrl, filename: body.filename }), { headers: jsonHeaders(origin) });
    }
    // 分片上传 - 创建会话
    if (path === '/upload/init' && method === 'POST') return handleUploadInit(request, env, origin);
    // 分片上传 - 上传分片
    if (path === '/upload/chunk' && method === 'POST') return handleUploadChunk(request, env, origin);
    // 分片上传 - 合并分片
    if (path === '/upload/complete' && method === 'POST') return handleUploadComplete(request, env, origin);

    // 视频
    if (path === '/videos' && method === 'GET') return handleVideosList(request, env, origin);
    if (path === '/videos' && method === 'POST') return handleVideoCreate(request, env, origin);
    if (path === '/videos/batch-delete' && method === 'POST') return handleVideoDeleteMultiple(request, env, origin);
    const videoMatch = path.match(/^\/videos\/([^/]+)$/);
    if (videoMatch) {
      if (method === 'GET') return handleVideoGet(request, env, videoMatch[1], origin);
      if (method === 'DELETE') return handleVideoDelete(env, videoMatch[1], origin);
    }
    const videoViewsMatch = path.match(/^\/videos\/([^/]+)\/views$/);
    if (videoViewsMatch && method === 'POST') return handleVideoIncrementViews(env, videoViewsMatch[1], origin);

    // 评论
    if (path === '/comments' && method === 'POST') return handleCommentCreate(request, env, origin);
    const commentsMatch = path.match(/^\/videos\/([^/]+)\/comments$/);
    if (commentsMatch && method === 'GET') return handleCommentsByVideo(env, commentsMatch[1], origin);
    const commentMatch = path.match(/^\/comments\/([^/]+)$/);
    if (commentMatch && method === 'DELETE') return handleCommentDelete(env, commentMatch[1], origin);

    // 用户
    if (path === '/users' && method === 'GET') return handleUsersList(request, env, url.searchParams.get('includeAdmin') === '1', origin);
    if (path === '/users' && method === 'POST') return handleUserRegister(request, env, origin);
    if (path === '/auth' && method === 'POST') return handleAuth(request, env, origin);
    const userMatch = path.match(/^\/users\/([^/]+)$/);
    if (userMatch) {
      if (method === 'GET') return handleUserGet(env, userMatch[1], origin);
      if (method === 'PUT') return handleUserUpdate(request, env, userMatch[1], origin);
      if (method === 'DELETE') return handleUserDelete(env, userMatch[1], origin);
    }
    const userActivityMatch = path.match(/^\/users\/([^/]+)\/activity$/);
    if (userActivityMatch && method === 'POST') return handleUserActivity(env, userActivityMatch[1], origin);
    const userLogoutMatch = path.match(/^\/users\/([^/]+)\/logout$/);
    if (userLogoutMatch && method === 'POST') return handleUserLogout(env, userLogoutMatch[1], origin);
    const userVideoCountMatch = path.match(/^\/users\/([^/]+)\/video-count$/);
    if (userVideoCountMatch && method === 'GET') return handleUserVideoCount(env, userVideoCountMatch[1], origin);

    // ---------- 应用更新系统 API ----------
    // 1. 客户端版本检测接口（所有已登录用户都可以调用）
    if (path === '/app-updates/check' && method === 'POST') return handleAppUpdateCheck(request, env, origin);

    // 2. 管理后台：设备ID+密码 双重验证登录
    if (path === '/app-updates/admin-auth' && method === 'POST') return handleAppUpdateAdminAuth(request, env, origin);

    // 3. 管理后台：获取当前最新版本信息
    if (path === '/app-updates/latest' && method === 'POST') return handleAppUpdateLatest(request, env, origin);

    // 4. 管理后台：发布新版本（上传安装包）
    if (path === '/app-updates/publish' && method === 'POST') return handleAppUpdatePublish(request, env, origin);

    // 5. 管理后台：删除历史版本
    if (path === '/app-updates/delete' && method === 'POST') return handleAppUpdateDelete(request, env, origin);

    // 6. 管理后台：历史版本列表
    if (path === '/app-updates/list' && method === 'POST') return handleAppUpdateList(request, env, origin);

    // /api 根路径
    if (path === '/' || path === '') {
      return new Response(JSON.stringify({ service: 'video-platform-api', status: 'ok', endpoints: ['/upload', '/videos', '/comments', '/users', '/auth'] }), { headers: jsonHeaders(origin) });
    }

    return new Response(JSON.stringify({ error: 'Not found', path }), { status: 404, headers: jsonHeaders(origin) });
  } catch (error: any) {
    console.error('API error:', error);
    return new Response(JSON.stringify({ error: 'Server error', message: error?.message || String(error) }), { status: 500, headers: jsonHeaders(origin) });
  }
}

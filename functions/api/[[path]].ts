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

const jsonHeaders = (origin: string) => ({
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
    await env.R2_BUCKET.put(filename, request.body, {
      httpMetadata: { contentType: contentType.includes('multipart/form-data') ? 'application/octet-stream' : contentType },
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

  await env.R2_BUCKET.put(filename, file.stream(), { httpMetadata: { contentType: file.type } });
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
  return new Response(JSON.stringify(rows), { headers: jsonHeaders(origin) });
};

const handleVideoGet = async (request: Request, env: Env, id: string, origin: string) => {
  const row = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
  if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(origin) });
  return new Response(JSON.stringify(row), { headers: jsonHeaders(origin) });
};

const handleVideoCreate = async (request: Request, env: Env, origin: string) => {
  const body = await parseBody(request);
  if (!body.title || !body.thumbnail || !body.videoUrl || !body.uploadedBy || !body.uploadedByName) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: jsonHeaders(origin) });
  }
  const now = new Date().toISOString();
  const id = genId('v-');
  await env.DB.prepare(
    'INSERT INTO videos (id, title, description, thumbnail, videoUrl, uploadedBy, uploadedByName, uploadedAt, views) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)'
  ).bind(id, body.title, body.description || '', body.thumbnail, body.videoUrl, body.uploadedBy, body.uploadedByName, now).run();
  return new Response(JSON.stringify({ id, title: body.title, description: body.description || '', thumbnail: body.thumbnail, videoUrl: body.videoUrl, uploadedBy: body.uploadedBy, uploadedByName: body.uploadedByName, uploadedAt: now, views: 0 }), { headers: jsonHeaders(origin) });
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

// ---------- 路由 ----------
export async function onRequest(context: EventContext<Env, any, any>): Promise<Response> {
  const { request, env } = context;
  const origin = getOrigin(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: jsonHeaders(origin) });
  }

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

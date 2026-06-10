export interface Env {
  R2_BUCKET: R2Bucket;
  DB: D1Database;
  R2_PUBLIC_URL?: string;
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

// ---------- 工具函数 ----------
const parseBody = async (req: Request) => {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  if (ct.includes('multipart/form-data') || ct.includes('x-www-form-urlencoded')) {
    const fd = await req.formData();
    const obj: any = {};
    fd.forEach((v, k) => { obj[k] = v instanceof File ? v : v; });
    return obj;
  }
  return {};
};

// ---------- R2 文件上传 ----------
const handleUpload = async (request: Request, env: Env) => {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  if (!file) return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers: jsonHeaders(getOrigin(request, env)) });

  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  const ext = file.name.split('.').pop() || '';
  const filename = `${timestamp}-${randomStr}.${ext}`;

  await env.R2_BUCKET.put(filename, file.stream(), { httpMetadata: { contentType: file.type } });
  const baseUrl = env.R2_PUBLIC_URL || 'https://pub-3300c5431c524c789f6aa30ae9bad4a9.r2.dev';
  const fileUrl = `${baseUrl.replace(/\/$/, '')}/${filename}`;

  return new Response(JSON.stringify({ success: true, filename, url: fileUrl }), { headers: jsonHeaders(getOrigin(request, env)) });
};

// ---------- 视频 API ----------
const handleVideosList = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const byUser = url.searchParams.get('byUser');
  let rows: any[];
  if (byUser) {
    rows = await env.DB.prepare('SELECT * FROM videos WHERE uploadedByName = ? ORDER BY uploadedAt DESC').bind(byUser).all().then(r => r.results as any[]);
  } else {
    rows = await env.DB.prepare('SELECT * FROM videos ORDER BY uploadedAt DESC').all().then(r => r.results as any[]);
  }
  return new Response(JSON.stringify(rows), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleVideoGet = async (request: Request, env: Env, id: string) => {
  const row = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
  if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(getOrigin(request, env)) });
  return new Response(JSON.stringify(row), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleVideoCreate = async (request: Request, env: Env) => {
  const body = await parseBody(request);
  if (!body.title || !body.thumbnail || !body.videoUrl || !body.uploadedBy || !body.uploadedByName) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: jsonHeaders(getOrigin(request, env)) });
  }
  const now = new Date().toISOString();
  const id = genId('v-');
  await env.DB.prepare(
    'INSERT INTO videos (id, title, description, thumbnail, videoUrl, uploadedBy, uploadedByName, uploadedAt, views) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)'
  ).bind(id, body.title, body.description || '', body.thumbnail, body.videoUrl, body.uploadedBy, body.uploadedByName, now).run();
  return new Response(JSON.stringify({ id, title: body.title, description: body.description || '', thumbnail: body.thumbnail, videoUrl: body.videoUrl, uploadedBy: body.uploadedBy, uploadedByName: body.uploadedByName, uploadedAt: now, views: 0 }), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleVideoDelete = async (request: Request, env: Env, id: string) => {
  await env.DB.prepare('DELETE FROM comments WHERE videoId = ?').bind(id).run();
  const r = await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(getOrigin(request, env)) });
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleVideoDeleteMultiple = async (request: Request, env: Env) => {
  const body = await parseBody(request);
  const ids: string[] = body.ids || [];
  if (!ids.length) return new Response(JSON.stringify({ error: 'No ids' }), { status: 400, headers: jsonHeaders(getOrigin(request, env)) });
  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(`DELETE FROM comments WHERE videoId IN (${placeholders})`).bind(...ids).run();
  await env.DB.prepare(`DELETE FROM videos WHERE id IN (${placeholders})`).bind(...ids).run();
  return new Response(JSON.stringify({ success: true, deleted: ids.length }), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleVideoIncrementViews = async (request: Request, env: Env, id: string) => {
  await env.DB.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(getOrigin(request, env)) });
};

// ---------- 评论 API ----------
const handleCommentsByVideo = async (request: Request, env: Env, videoId: string) => {
  const rows = await env.DB.prepare('SELECT * FROM comments WHERE videoId = ? ORDER BY createdAt DESC').bind(videoId).all().then(r => r.results as any[]);
  return new Response(JSON.stringify(rows), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleCommentCreate = async (request: Request, env: Env) => {
  const body = await parseBody(request);
  if (!body.videoId || !body.username || !body.content) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: jsonHeaders(getOrigin(request, env)) });
  }
  const id = genId('c-');
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO comments (id, videoId, username, content, createdAt, replyTo, replyToUsername) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, body.videoId, body.username, body.content, now, body.replyTo || null, body.replyToUsername || null).run();
  return new Response(JSON.stringify({ id, videoId: body.videoId, username: body.username, content: body.content, createdAt: now, replyTo: body.replyTo || null, replyToUsername: body.replyToUsername || null }), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleCommentDelete = async (request: Request, env: Env, id: string) => {
  const r = await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(getOrigin(request, env)) });
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(getOrigin(request, env)) });
};

// ---------- 用户 API ----------
const handleUsersList = async (request: Request, env: Env, includeAdmin = false) => {
  let rows: any[];
  if (includeAdmin) {
    rows = await env.DB.prepare('SELECT id, username, role, createdAt, isOnline, lastSeen FROM users ORDER BY createdAt ASC').all().then(r => r.results as any[]);
  } else {
    rows = await env.DB.prepare("SELECT id, username, role, createdAt, isOnline, lastSeen FROM users WHERE id != 'admin-001' ORDER BY createdAt ASC").all().then(r => r.results as any[]);
  }
  return new Response(JSON.stringify(rows), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleUserGet = async (request: Request, env: Env, id: string) => {
  const row = await env.DB.prepare('SELECT id, username, role, createdAt, isOnline, lastSeen FROM users WHERE id = ?').bind(id).first();
  if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(getOrigin(request, env)) });
  return new Response(JSON.stringify(row), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleAuth = async (request: Request, env: Env) => {
  const body = await parseBody(request);
  if (!body.username || !body.password) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: jsonHeaders(getOrigin(request, env)) });
  const row = await env.DB.prepare('SELECT * FROM users WHERE username = ? AND password = ?').bind(body.username, body.password).first();
  if (!row) return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: jsonHeaders(getOrigin(request, env)) });
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE users SET isOnline = 1, lastSeen = ? WHERE id = ?').bind(now, row.id).run();
  return new Response(JSON.stringify({ id: row.id, username: row.username, role: row.role, createdAt: row.created_at || row.createdAt, isOnline: true, lastSeen: now }), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleUserRegister = async (request: Request, env: Env) => {
  const body = await parseBody(request);
  if (!body.username || !body.password) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: jsonHeaders(getOrigin(request, env)) });
  // 检查是否重名（包括管理员）
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(body.username).first();
  if (exists) return new Response(JSON.stringify({ error: '用户名已存在' }), { status: 400, headers: jsonHeaders(getOrigin(request, env)) });
  const id = genId('user-');
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, username, password, role, createdAt, isOnline, lastSeen) VALUES (?, ?, ?, ?, ?, 0, ?)').bind(id, body.username, body.password, body.role || 'user', now, now).run();
  return new Response(JSON.stringify({ id, username: body.username, role: body.role || 'user', createdAt: now, isOnline: false, lastSeen: now }), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleUserDelete = async (request: Request, env: Env, id: string) => {
  if (id === ADMIN_ACCOUNT.id) return new Response(JSON.stringify({ error: '不能删除管理员账号' }), { status: 400, headers: jsonHeaders(getOrigin(request, env)) });
  // 删除该用户上传的视频和评论
  const user = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(id).first() as any;
  if (user && user.username) {
    const videos = await env.DB.prepare('SELECT id FROM videos WHERE uploadedByName = ?').bind(user.username).all().then(r => r.results as any[]);
    for (const v of videos) {
      await env.DB.prepare('DELETE FROM comments WHERE videoId = ?').bind(v.id).run();
      await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(v.id).run();
    }
  }
  const r = await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders(getOrigin(request, env)) });
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleUserActivity = async (request: Request, env: Env, id: string) => {
  if (id === ADMIN_ACCOUNT.id) return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(getOrigin(request, env)) });
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE users SET isOnline = 1, lastSeen = ? WHERE id = ?').bind(now, id).run();
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleUserLogout = async (request: Request, env: Env, id: string) => {
  if (id !== ADMIN_ACCOUNT.id) {
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE users SET isOnline = 0, lastSeen = ? WHERE id = ?').bind(now, id).run();
  }
  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders(getOrigin(request, env)) });
};

const handleUserVideoCount = async (request: Request, env: Env, username: string) => {
  const row = await env.DB.prepare('SELECT COUNT(*) as count FROM videos WHERE uploadedByName = ?').bind(username).first() as any;
  return new Response(JSON.stringify({ count: row?.count || 0 }), { headers: jsonHeaders(getOrigin(request, env)) });
};

// ---------- 路由 ----------
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = getOrigin(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: jsonHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // 文件上传
      if (path === '/upload' && method === 'POST') return handleUpload(request, env);

      // 视频
      if (path === '/videos' && method === 'GET') return handleVideosList(request, env);
      if (path === '/videos' && method === 'POST') return handleVideoCreate(request, env);
      if (path === '/videos/batch-delete' && method === 'POST') return handleVideoDeleteMultiple(request, env);
      const videoMatch = path.match(/^\/videos\/([^/]+)$/);
      if (videoMatch) {
        if (method === 'GET') return handleVideoGet(request, env, videoMatch[1]);
        if (method === 'DELETE') return handleVideoDelete(request, env, videoMatch[1]);
      }
      const videoViewsMatch = path.match(/^\/videos\/([^/]+)\/views$/);
      if (videoViewsMatch && method === 'POST') return handleVideoIncrementViews(request, env, videoViewsMatch[1]);

      // 评论
      if (path === '/comments' && method === 'POST') return handleCommentCreate(request, env);
      const commentsMatch = path.match(/^\/videos\/([^/]+)\/comments$/);
      if (commentsMatch && method === 'GET') return handleCommentsByVideo(request, env, commentsMatch[1]);
      const commentMatch = path.match(/^\/comments\/([^/]+)$/);
      if (commentMatch && method === 'DELETE') return handleCommentDelete(request, env, commentMatch[1]);

      // 用户
      if (path === '/users' && method === 'GET') return handleUsersList(request, env, url.searchParams.get('includeAdmin') === '1');
      if (path === '/users' && method === 'POST') return handleUserRegister(request, env);
      if (path === '/auth' && method === 'POST') return handleAuth(request, env);
      const userMatch = path.match(/^\/users\/([^/]+)$/);
      if (userMatch) {
        if (method === 'GET') return handleUserGet(request, env, userMatch[1]);
        if (method === 'DELETE') return handleUserDelete(request, env, userMatch[1]);
      }
      const userActivityMatch = path.match(/^\/users\/([^/]+)\/activity$/);
      if (userActivityMatch && method === 'POST') return handleUserActivity(request, env, userActivityMatch[1]);
      const userLogoutMatch = path.match(/^\/users\/([^/]+)\/logout$/);
      if (userLogoutMatch && method === 'POST') return handleUserLogout(request, env, userLogoutMatch[1]);
      const userVideoCountMatch = path.match(/^\/users\/([^/]+)\/video-count$/);
      if (userVideoCountMatch && method === 'GET') return handleUserVideoCount(request, env, userVideoCountMatch[1]);

      // 根路径 - 健康检查
      if (path === '/' || path === '') {
        return new Response(JSON.stringify({ service: 'video-platform-api', status: 'ok', endpoints: ['/upload', '/videos', '/comments', '/users', '/auth'] }), { headers: jsonHeaders(origin) });
      }

      return new Response(JSON.stringify({ error: 'Not found', path }), { status: 404, headers: jsonHeaders(origin) });
    } catch (error: any) {
      console.error('API error:', error);
      return new Response(JSON.stringify({ error: 'Server error', message: error?.message || String(error) }), { status: 500, headers: jsonHeaders(origin) });
    }
  },
};

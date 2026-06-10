export interface Env {
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_URL?: string;
}

export interface UploadRequest {
  filename: string;
  contentType: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 处理 CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // 只允许 POST 请求
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return new Response(JSON.stringify({ error: 'No file provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 生成唯一文件名
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 10);
      const ext = file.name.split('.').pop() || '';
      const filename = `${timestamp}-${randomStr}.${ext}`;

      // 上传到 R2
      await env.R2_BUCKET.put(filename, file.stream(), {
        httpMetadata: {
          contentType: file.type,
        },
      });

      // 返回文件 URL
      const baseUrl = env.R2_PUBLIC_URL || 'https://pub-3300c5431c524c789f6aa30ae9bad4a9.r2.dev';
      const fileUrl = `${baseUrl.replace(/\/$/, '')}/${filename}`;

      return new Response(
        JSON.stringify({
          success: true,
          filename: filename,
          url: fileUrl,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    } catch (error) {
      console.error('Upload error:', error);
      return new Response(
        JSON.stringify({
          error: 'Upload failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};

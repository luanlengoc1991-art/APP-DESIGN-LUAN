// Cloudflare Worker: fixed AI actions, private provider key, signed job capabilities.
const MODELS = {
  layers: 'fal-ai/qwen-image-layered',
  removeBackground: 'fal-ai/ben/v2/image',
  upscale: 'fal-ai/esrgan',
  generate: 'fal-ai/qwen-image',
  edit: 'fal-ai/qwen-image-edit-2511',
};
const MAX_INPUT = 8 * 1024 * 1024;
const encoder = new TextEncoder();
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const json = (value, status = 200) => Response.json(value, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
}});
async function boundedBytes(body, limit) {
  if (!body) return new Uint8Array();
  const reader = body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new ApiError(413, 'Ảnh hoặc dữ liệu vượt giới hạn dung lượng.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function readJSON(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'Yêu cầu phải là JSON.');
  try { return JSON.parse(new TextDecoder().decode(await boundedBytes(request.body, MAX_INPUT))); }
  catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, 'Dữ liệu JSON không hợp lệ.'); }
}
function requireReady(env) {
  if (!env.FAL_KEY || !env.AI_ACCESS_TOKEN || env.AI_ACCESS_TOKEN.length < 16) {
    throw new ApiError(503, 'AI chưa được kích hoạt. Chủ website cần cấu hình dịch vụ AI trong Cloudflare.');
  }
}
async function authorized(request, env) {
  const actual = request.headers.get('authorization') || '';
  const expected = `Bearer ${env.AI_ACCESS_TOKEN}`;
  const hash = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s)));
  const [a, b] = await Promise.all([hash(actual), hash(expected)]);
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference) throw new ApiError(401, 'Mã truy cập AI chưa đúng.');
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'Không cho phép truy cập AI từ website khác.');
}
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(payload, secret) {
  const data = btoa(JSON.stringify(payload));
  return data + '.' + hex(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(data))));
}
async function verify(token, secret, kind) {
  if (typeof token !== 'string' || token.length > 12000) throw new ApiError(400, 'Mã tác vụ không hợp lệ.');
  const [data, signature, extra] = token.split('.');
  if (extra || !/^[a-f0-9]{64}$/.test(signature || '')) throw new ApiError(400, 'Mã tác vụ không hợp lệ.');
  const sig = Uint8Array.from(signature.match(/../g), h => parseInt(h, 16));
  if (!await crypto.subtle.verify('HMAC', await signingKey(secret), sig, encoder.encode(data))) throw new ApiError(403, 'Mã tác vụ không hợp lệ.');
  let payload;
  try { payload = JSON.parse(atob(data)); } catch { throw new ApiError(400, 'Mã tác vụ không hợp lệ.'); }
  if (payload.kind !== kind || !Number.isFinite(payload.exp) || payload.exp < Date.now()) throw new ApiError(410, 'Tác vụ đã hết hạn.');
  return payload;
}
function queueURL(value, requestId) {
  let url; try { url = new URL(value); } catch { throw new ApiError(502, 'Dịch vụ AI trả về đường dẫn không hợp lệ.'); }
  if (url.origin !== 'https://queue.fal.run' || url.username || url.password || !url.pathname.startsWith('/fal-ai/') || !url.pathname.includes(`/requests/${requestId}`)) throw new ApiError(502, 'Đường dẫn tác vụ AI không hợp lệ.');
  return url.href;
}
function mediaURL(value) {
  let url; try { url = new URL(value); } catch { throw new ApiError(502, 'Đường dẫn ảnh AI không hợp lệ.'); }
  const trusted = url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media') ||
    (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith('/falserverless/'));
  if (!trusted || url.protocol !== 'https:' || url.port || url.username || url.password) throw new ApiError(502, 'Không chấp nhận máy chủ ảnh AI này.');
  return url.href;
}
export function modelInput(body) {
  if (!body || !Object.hasOwn(MODELS, body.action)) throw new ApiError(400, 'Tác vụ AI không được hỗ trợ.');
  const image = body.image;
  if (body.action !== 'generate') {
    if (typeof image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length > MAX_INPUT - 4096) throw new ApiError(400, 'Ảnh đầu vào phải là PNG/JPEG/WebP, tối đa khoảng 5 MB.');
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length > 3000) throw new ApiError(400, 'Mô tả tối đa 3.000 ký tự.');
  switch (body.action) {
    case 'layers': {
      if (!Number.isInteger(body.numLayers) || body.numLayers < 2 || body.numLayers > 8) throw new ApiError(400, 'Chọn từ 2 đến 8 layer.');
      return { image_url: image, num_layers: body.numLayers, output_format: 'png', enable_safety_checker: true, ...(prompt ? { prompt } : {}) };
    }
    case 'removeBackground': return { image_url: image };
    case 'upscale': return { image_url: image, scale: 2, face: false, tile: 400, output_format: 'png' };
    case 'edit':
      if (!prompt) throw new ApiError(400, 'Nhập yêu cầu chỉnh sửa ảnh.');
      return { image_urls: [image], prompt, num_images: 1, output_format: 'png', enable_safety_checker: true };
    case 'generate': {
      if (!prompt) throw new ApiError(400, 'Nhập nội dung muốn tạo.');
      const sizes = ['square_hd', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'];
      if (!sizes.includes(body.size)) throw new ApiError(400, 'Tỷ lệ ảnh không hợp lệ.');
      return { prompt, image_size: body.size, num_images: 1, output_format: 'png', enable_safety_checker: true };
    }
  }
}
async function provider(url, env, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, headers: { Authorization: `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
  catch { throw new ApiError(502, 'Không kết nối được dịch vụ AI. Kiểm tra lại tác vụ, không gửi lại nếu đã có mã tác vụ.'); }
  if (!response.ok) {
    const messages = { 401: 'Khoá dịch vụ AI không hợp lệ.', 403: 'Dịch vụ AI từ chối quyền truy cập.', 402: 'Tài khoản dịch vụ AI cần bổ sung số dư.', 422: 'Ảnh hoặc yêu cầu chưa phù hợp với mô hình.', 429: 'Dịch vụ AI đang giới hạn lượt xử lý, hãy đợi rồi thử lại.' };
    throw new ApiError(response.status === 429 ? 429 : 502, messages[response.status] || 'Dịch vụ AI chưa trả được kết quả.');
  }
  if (response.status === 204) return {};
  try { return JSON.parse(new TextDecoder().decode(await boundedBytes(response.body, 1024 * 1024))); }
  catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(502, 'Phản hồi dịch vụ AI không hợp lệ.'); }
}
async function api(request, env) {
  const url = new URL(request.url); const route = url.pathname;
  if (route === '/api/ai/config' && request.method === 'GET') return json({ ready: !!env.FAL_KEY && !!env.AI_ACCESS_TOKEN && env.AI_ACCESS_TOKEN.length >= 16, actions: Object.keys(MODELS) });
  requireReady(env); await authorized(request, env);
  if (route === '/api/ai/auth' && request.method === 'POST') return json({ ok: true });
  if (route === '/api/ai/jobs' && request.method === 'POST') {
    const body = await readJSON(request); const input = modelInput(body);
    const data = await provider(`https://queue.fal.run/${MODELS[body.action]}`, env, { method: 'POST', body: JSON.stringify(input) });
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(data.request_id || '')) throw new ApiError(502, 'Dịch vụ không trả mã tác vụ.');
    const payload = { kind: 'job', action: body.action, id: data.request_id,
      status: queueURL(data.status_url, data.request_id), result: queueURL(data.response_url, data.request_id),
      cancel: queueURL(data.cancel_url, data.request_id), exp: Date.now() + 24 * 3600000 };
    return json({ token: await sign(payload, env.FAL_KEY), requestId: data.request_id }, 202);
  }
  if (route === '/api/ai/job' && ['GET', 'DELETE'].includes(request.method)) {
    const job = await verify(url.searchParams.get('token'), env.FAL_KEY, 'job');
    if (request.method === 'DELETE') {
      await provider(queueURL(job.cancel, job.id), env, { method: 'PUT' });
      return json({ cancelled: true });
    }
    const status = await provider(queueURL(job.status, job.id), env);
    if (status.error) throw new ApiError(422, 'AI không xử lý được ảnh này. Hãy đổi ảnh hoặc giảm số layer.');
    if (status.status !== 'COMPLETED') {
      if (!['IN_QUEUE', 'IN_PROGRESS'].includes(status.status)) throw new ApiError(502, 'Trạng thái AI không hợp lệ.');
      return json({ status: status.status, queuePosition: status.queue_position });
    }
    const result = await provider(queueURL(job.result, job.id), env);
    if (result.error || result.has_nsfw_concepts?.some(Boolean)) throw new ApiError(422, 'Dịch vụ AI không cung cấp kết quả cho ảnh này.');
    const images = result.images || (result.image ? [result.image] : []);
    if (!Array.isArray(images) || !images.length || images.length > 12) throw new ApiError(502, 'Dịch vụ AI không trả về layer ảnh hợp lệ.');
    const files = await Promise.all(images.map(async (image, i) => ({ name: job.action === 'layers' ? `AI · Layer ${i + 1}` : `AI · ${job.action}`,
      token: await sign({ kind: 'image', url: mediaURL(image.url), exp: Date.now() + 2 * 3600000 }, env.FAL_KEY) })));
    return json({ status: 'COMPLETED', images: files });
  }
  if (route === '/api/ai/image' && request.method === 'GET') {
    const image = await verify(url.searchParams.get('token'), env.FAL_KEY, 'image');
    let response;
    try { response = await fetch(mediaURL(image.url), { redirect: 'error', signal: AbortSignal.timeout(30000) }); }
    catch { throw new ApiError(502, 'Không tải được ảnh kết quả.'); }
    if (!response.ok || !/^image\/(png|jpeg|webp)(;|$)/.test(response.headers.get('content-type') || '')) throw new ApiError(502, 'Ảnh kết quả không hợp lệ.');
    const bytes = await boundedBytes(response.body, 20 * 1024 * 1024);
    return new Response(bytes, { headers: { 'Content-Type': response.headers.get('content-type'), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  throw new ApiError(404, 'Không tìm thấy API.');
}
export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request, env); }
    catch (error) { return json({ error: error instanceof ApiError ? error.message : 'Có lỗi khi xử lý AI.' }, error instanceof ApiError ? error.status : 500); }
  },
};

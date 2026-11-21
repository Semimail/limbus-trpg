/**
 * 이미지 생성 공급자. 서버에서만 쓴다.
 *  - openai: Images API (gpt-image 계열). 입력 이미지(원본 또는 참고)가 있으면 /images/edits, 없으면 /images/generations.
 *            background=transparent 로 알파 PNG를 바로 받는다. 입력 이미지 여러 장은 multipart `image[]` 로 보낸다
 *            (순서: 원본(있으면) → 참고 이미지). 참고 이미지를 붙인 요청이 400 으로 거절되면 참고를 빼고 한 번 더 시도한다.
 *  - mock:   키 없이 파이프라인을 시험할 때. 원본을 그대로 돌려주거나 1픽셀 투명 PNG.
 * 환경 변수: SPRITE_PROVIDER(openai|mock, 기본 openai), OPENAI_API_KEY, SPRITE_IMAGE_MODEL(기본 gpt-image-2.5-flare; gpt-image-1 은 2026-10-23 종료됨. 투명 배경은 2.5 sunburst/flare 가 지원),
 *            SPRITE_IMAGE_QUALITY(low|medium|high, 기본 medium), SPRITE_IMAGE_SIZE(기본 1024x1536),
 *            SPRITE_COST_PER_IMAGE_USD(로그용 추정 단가, 선택)
 */
import { getDevFetch } from "@/lib/dev-fetch";

export interface ImageInput { bytes: Uint8Array; mime: string }
export interface SpriteRequest {
  prompt: string;
  /** 그릴 대상(원본). 첫 번째 입력 이미지 */
  source?: ImageInput | null;
  /** 원작 참고 이미지(스타일 → 동작 순). 원본 뒤에 붙는다 */
  refs?: ImageInput[];
  /** 요청 크기 (기본 SPRITE_IMAGE_SIZE). 프레임 띠는 strip.ts 규격으로 넘긴다 */
  size?: string;
}
export interface SpriteResult {
  png: Uint8Array;
  usage: unknown;
  costUsd: number | null;
  /** 참고 이미지를 붙인 요청이 거절되어 참고 없이 다시 만든 경우 그 오류 */
  refsDropped?: string;
}
export interface SpriteProvider {
  name: string;
  model: string;
  generate(req: SpriteRequest): Promise<SpriteResult>;
}

const TRANSPARENT_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

function costPerImage(): number | null {
  const v = Number(process.env.SPRITE_COST_PER_IMAGE_USD);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function mockProvider(): SpriteProvider {
  return {
    name: "mock", model: "mock",
    async generate(req) {
      await new Promise((r) => setTimeout(r, 400));
      const first = req.source ?? req.refs?.[0];
      return { png: first ? first.bytes : new Uint8Array(TRANSPARENT_PNG), usage: { mock: true, inputs: (req.source ? 1 : 0) + (req.refs?.length ?? 0) }, costUsd: 0 };
    },
  };
}

class OpenAIHttpError extends Error { constructor(public status: number, message: string) { super(message); } }

function openaiProvider(): SpriteProvider {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.SPRITE_IMAGE_MODEL || "gpt-image-2.5-flare";
  const quality = process.env.SPRITE_IMAGE_QUALITY || "medium";
  const size = process.env.SPRITE_IMAGE_SIZE || "1024x1536";
  async function call(req: SpriteRequest, inputs: ImageInput[]): Promise<SpriteResult> {
    const f = (await getDevFetch()) ?? fetch;
    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    let res: Response;
    if (inputs.length) {
      const form = new FormData();
      form.set("model", model); form.set("prompt", req.prompt); form.set("n", "1");
      form.set("size", req.size ?? size); form.set("quality", quality); form.set("background", "transparent"); form.set("output_format", "png");
      const field = inputs.length > 1 ? "image[]" : "image";
      inputs.forEach((im, i) => form.append(field, new Blob([im.bytes as BlobPart], { type: im.mime }), `input-${i + 1}.png`));
      res = await f("https://api.openai.com/v1/images/edits", { method: "POST", headers, body: form });
    } else {
      res = await f("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: req.prompt, n: 1, size: req.size ?? size, quality, background: "transparent", output_format: "png" }),
      });
    }
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 400);
      try { const j = JSON.parse(text) as { error?: { message?: string } }; if (j.error?.message) msg = j.error.message; } catch { /* 본문이 JSON이 아님 */ }
      throw new OpenAIHttpError(res.status, `OpenAI ${res.status}: ${msg}`);
    }
    const j = JSON.parse(text) as { data?: { b64_json?: string }[]; usage?: unknown };
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error("응답에 이미지가 없습니다");
    return { png: new Uint8Array(Buffer.from(b64, "base64")), usage: j.usage ?? null, costUsd: costPerImage() };
  }
  return {
    name: "openai", model,
    async generate(req) {
      if (!key) throw new Error("OPENAI_API_KEY 가 설정되지 않았습니다 (Vercel 환경 변수 또는 apps/web/.env.local)");
      const refs = req.refs ?? [];
      const inputs = [...(req.source ? [req.source] : []), ...refs];
      try { return await call(req, inputs); }
      catch (e) {
        // 참고 이미지 수·크기 때문에 거절되면 참고를 빼고 다시 (프롬프트의 참고 문장은 그대로지만 결과는 나온다)
        if (refs.length && e instanceof OpenAIHttpError && e.status === 400) {
          const r = await call(req, req.source ? [req.source] : []);
          return { ...r, refsDropped: e.message };
        }
        throw e;
      }
    },
  };
}

export function resolveSpriteProvider(): SpriteProvider {
  const name = (process.env.SPRITE_PROVIDER || "openai").toLowerCase();
  if (name === "mock") return mockProvider();
  if (name === "openai") return openaiProvider();
  throw new Error(`알 수 없는 SPRITE_PROVIDER: ${name}`);
}

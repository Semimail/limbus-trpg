/**
 * 이미지 생성 공급자. 서버에서만 쓴다.
 *  - openai: Images API (gpt-image 계열). 참고 이미지가 있으면 /images/edits, 없으면 /images/generations.
 *            background=transparent 로 알파 PNG를 바로 받는다.
 *  - mock:   키 없이 파이프라인을 시험할 때. 참고 이미지를 그대로 돌려주거나 1픽셀 투명 PNG.
 * 환경 변수: SPRITE_PROVIDER(openai|mock, 기본 openai), OPENAI_API_KEY, SPRITE_IMAGE_MODEL(기본 gpt-image-2.5-flare; gpt-image-1 은 2026-10-23 종료됨. 투명 배경은 2.5 sunburst/flare 가 지원),
 *            SPRITE_IMAGE_QUALITY(low|medium|high, 기본 medium), SPRITE_IMAGE_SIZE(기본 1024x1536),
 *            SPRITE_COST_PER_IMAGE_USD(로그용 추정 단가, 선택)
 */
import { getDevFetch } from "@/lib/dev-fetch";

export interface SpriteRequest {
  prompt: string;
  source?: { bytes: Uint8Array; mime: string } | null;
}
export interface SpriteResult {
  png: Uint8Array;
  usage: unknown;
  costUsd: number | null;
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
      return { png: req.source ? req.source.bytes : new Uint8Array(TRANSPARENT_PNG), usage: { mock: true }, costUsd: 0 };
    },
  };
}

function openaiProvider(): SpriteProvider {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.SPRITE_IMAGE_MODEL || "gpt-image-2.5-flare";
  const quality = process.env.SPRITE_IMAGE_QUALITY || "medium";
  const size = process.env.SPRITE_IMAGE_SIZE || "1024x1536";
  return {
    name: "openai", model,
    async generate(req) {
      if (!key) throw new Error("OPENAI_API_KEY 가 설정되지 않았습니다 (Vercel 환경 변수 또는 apps/web/.env.local)");
      const f = (await getDevFetch()) ?? fetch;
      const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
      let res: Response;
      if (req.source) {
        const form = new FormData();
        form.set("model", model); form.set("prompt", req.prompt); form.set("n", "1");
        form.set("size", size); form.set("quality", quality); form.set("background", "transparent"); form.set("output_format", "png");
        form.set("image", new Blob([req.source.bytes as BlobPart], { type: req.source.mime }), "source.png");
        res = await f("https://api.openai.com/v1/images/edits", { method: "POST", headers, body: form });
      } else {
        res = await f("https://api.openai.com/v1/images/generations", {
          method: "POST", headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: req.prompt, n: 1, size, quality, background: "transparent", output_format: "png" }),
        });
      }
      const text = await res.text();
      if (!res.ok) {
        let msg = text.slice(0, 400);
        try { const j = JSON.parse(text) as { error?: { message?: string } }; if (j.error?.message) msg = j.error.message; } catch { /* 본문이 JSON이 아님 */ }
        throw new Error(`OpenAI ${res.status}: ${msg}`);
      }
      const j = JSON.parse(text) as { data?: { b64_json?: string }[]; usage?: unknown };
      const b64 = j.data?.[0]?.b64_json;
      if (!b64) throw new Error("응답에 이미지가 없습니다");
      return { png: new Uint8Array(Buffer.from(b64, "base64")), usage: j.usage ?? null, costUsd: costPerImage() };
    },
  };
}

export function resolveSpriteProvider(): SpriteProvider {
  const name = (process.env.SPRITE_PROVIDER || "openai").toLowerCase();
  if (name === "mock") return mockProvider();
  if (name === "openai") return openaiProvider();
  throw new Error(`알 수 없는 SPRITE_PROVIDER: ${name}`);
}

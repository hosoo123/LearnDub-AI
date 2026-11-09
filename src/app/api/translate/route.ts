import { TranslationProviderError, TranslationSegment, translationProvider } from "@/lib/providers";

const MAX_TEXT_LENGTH = 5_000;
const MAX_BATCH_SEGMENTS = 8;
const MAX_SEGMENT_LENGTH = 3_000;

function isTranslationSegment(value: unknown): value is TranslationSegment {
  return typeof value === "object"
    && value !== null
    && "id" in value
    && typeof value.id === "string"
    && value.id.length > 0
    && value.id.length <= 100
    && "text" in value
    && typeof value.text === "string"
    && value.text.trim().length > 0
    && value.text.length <= MAX_SEGMENT_LENGTH
    && (!("contextTranslation" in value)
      || (typeof value.contextTranslation === "string"
        && value.contextTranslation.length <= MAX_SEGMENT_LENGTH));
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const style = typeof body === "object" && body !== null && "style" in body ? body.style : "dialogue";
    if (style !== "dialogue" && style !== "song") {
      return Response.json({ error: "Орчуулгын төрөл 'dialogue' эсвэл 'song' байх ёстой." }, { status: 400 });
    }
    if (typeof body === "object" && body !== null && "segments" in body) {
      const segments = body.segments;
      if (!Array.isArray(segments) || segments.length === 0) {
        return Response.json({ error: "segments талбарт хадмалын мөрүүд шаардлагатай." }, { status: 400 });
      }
      if (segments.length > MAX_BATCH_SEGMENTS) {
        return Response.json({ error: `Нэг удаад ${MAX_BATCH_SEGMENTS}-аас олон хадмалын мөр орчуулж болохгүй.` }, { status: 413 });
      }
      if (!segments.every(isTranslationSegment)) {
        return Response.json({ error: `Хадмалын мөр бүр ID болон 1–${MAX_SEGMENT_LENGTH} тэмдэгтийн тексттэй байх ёстой.` }, { status: 400 });
      }
      if (new Set(segments.map(({ id }) => id)).size !== segments.length) {
        return Response.json({ error: "Хадмалын ID давхардсан байна." }, { status: 400 });
      }
      if (segments.reduce((total, segment) => total + segment.text.length
        + ("contextTranslation" in segment && typeof segment.contextTranslation === "string" ? segment.contextTranslation.length : 0), 0) > MAX_TEXT_LENGTH) {
        return Response.json({ error: `Нэг багцын нийт текст ${MAX_TEXT_LENGTH} тэмдэгтээс урт байж болохгүй.` }, { status: 413 });
      }
      const translatedSegments = await translationProvider.translateBatch(segments.map(({ id, text, contextTranslation }) => ({
        id,
        text: text.trim(),
        ...(typeof contextTranslation === "string" && contextTranslation.trim() ? { contextTranslation: contextTranslation.trim() } : {}),
      })), style);
      return Response.json({ status: "ready", translatedSegments });
    }

    const text = typeof body === "object" && body !== null && "text" in body ? (body as { text?: unknown }).text : undefined;
    if (typeof text !== "string" || !text.trim()) return Response.json({ error: "text талбар хоосон байж болохгүй." }, { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) return Response.json({ error: `Текст ${MAX_TEXT_LENGTH} тэмдэгтээс урт байж болохгүй.` }, { status: 413 });
    return Response.json(await translationProvider.translate(text.trim(), style));
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Хүсэлтийн JSON формат буруу байна." }, { status: 400 });
    if (error instanceof TranslationProviderError) return Response.json({ error: error.message }, { status: 503 });
    return Response.json({ error: "Орчуулгын үйлчилгээ түр хариу өгөхгүй байна." }, { status: 502 });
  }
}

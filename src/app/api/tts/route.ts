import { TtsProviderError, ttsProvider } from "@/lib/providers";
import { MONGOLIAN_TTS_VOICES, isMongolianTtsVoice } from "@/lib/speech";

const MAX_TEXT_LENGTH = 1_500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sourceDelivery(value: unknown) {
  if (!isRecord(value)) return undefined;
  const keys = ["loudness", "pauseRatio", "tempo", "energy"] as const;
  if (!keys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]))) return undefined;
  const profile = value as Record<(typeof keys)[number], number>;
  if (profile.loudness < 0 || profile.loudness > 1 || profile.pauseRatio < 0 || profile.pauseRatio > 1
    || profile.tempo < 0.5 || profile.tempo > 2 || profile.energy < 0 || profile.energy > 1) return undefined;
  return { loudness: profile.loudness, pauseRatio: profile.pauseRatio, tempo: profile.tempo, energy: profile.energy };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return Response.json({ error: "Хүсэлтийн JSON объект шаардлагатай." }, { status: 400 });
    const text = body.text;
    if (body.expressive !== undefined && typeof body.expressive !== "boolean") {
      return Response.json({ error: "expressive талбар boolean байх ёстой." }, { status: 400 });
    }
    if (typeof text !== "string" || !text.trim()) return Response.json({ error: "text талбар хоосон байж болохгүй." }, { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) return Response.json({ error: `Текст ${MAX_TEXT_LENGTH} тэмдэгтээс урт байж болохгүй.` }, { status: 413 });
    if (body.sourceText !== undefined && (typeof body.sourceText !== "string" || body.sourceText.length > MAX_TEXT_LENGTH)) {
      return Response.json({ error: `sourceText талбар ${MAX_TEXT_LENGTH} тэмдэгтээс уртгүй текст байх ёстой.` }, { status: 400 });
    }
    if (body.cueDuration !== undefined && (typeof body.cueDuration !== "number" || !Number.isFinite(body.cueDuration)
      || body.cueDuration < 0.2 || body.cueDuration > 30)) {
      return Response.json({ error: "cueDuration талбар 0.2–30 секундийн тоо байх ёстой." }, { status: 400 });
    }
    const delivery = body.sourceDelivery === undefined ? undefined : sourceDelivery(body.sourceDelivery);
    if (body.sourceDelivery !== undefined && !delivery) {
      return Response.json({ error: "sourceDelivery талбарын утга буруу байна." }, { status: 400 });
    }
    const voice = body.voice === undefined ? MONGOLIAN_TTS_VOICES.bataa : body.voice;
    if (!isMongolianTtsVoice(voice)) {
      return Response.json({ error: "Дэмжигдээгүй Монгол дуу хоолой сонгосон байна." }, { status: 400 });
    }
    return Response.json(await ttsProvider.synthesize(text.trim(), {
      voice,
      expressive: body.expressive === true,
      ...(typeof body.cueDuration === "number" ? { cueDuration: body.cueDuration } : {}),
      ...(delivery ? { sourceDelivery: delivery } : {}),
      ...(typeof body.sourceText === "string" ? { sourceText: body.sourceText } : {}),
    }));
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Хүсэлтийн JSON формат буруу байна." }, { status: 400 });
    if (error instanceof TtsProviderError) return Response.json({ error: error.message }, { status: 502 });
    return Response.json({ error: "Монгол дуу үүсгэхэд алдаа гарлаа. Дахин оролдоно уу." }, { status: 502 });
  }
}

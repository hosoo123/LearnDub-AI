import { TtsProviderError, ttsProvider } from "@/lib/providers";
import { MONGOLIAN_TTS_VOICES, isMongolianTtsVoice } from "@/lib/speech";

const MAX_TEXT_LENGTH = 1_500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    const voice = body.voice === undefined ? MONGOLIAN_TTS_VOICES.bataa : body.voice;
    if (!isMongolianTtsVoice(voice)) {
      return Response.json({ error: "Дэмжигдээгүй Монгол дуу хоолой сонгосон байна." }, { status: 400 });
    }
    return Response.json(await ttsProvider.synthesize(text.trim(), {
      voice,
      expressive: body.expressive === true,
      ...(typeof body.sourceText === "string" ? { sourceText: body.sourceText } : {}),
    }));
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Хүсэлтийн JSON формат буруу байна." }, { status: 400 });
    if (error instanceof TtsProviderError) return Response.json({ error: error.message }, { status: 502 });
    return Response.json({ error: "Монгол дуу үүсгэхэд алдаа гарлаа. Дахин оролдоно уу." }, { status: 502 });
  }
}

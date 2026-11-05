import { ttsProvider } from "@/lib/providers";

const MAX_TEXT_LENGTH = 1_500;

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const text = typeof body === "object" && body !== null && "text" in body ? (body as { text?: unknown }).text : undefined;
    if (typeof text !== "string" || !text.trim()) return Response.json({ error: "text талбар хоосон байж болохгүй." }, { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) return Response.json({ error: `Текст ${MAX_TEXT_LENGTH} тэмдэгтээс урт байж болохгүй.` }, { status: 413 });
    return Response.json(await ttsProvider.synthesize(text.trim()));
  } catch { return Response.json({ error: "Хүсэлтийн JSON формат буруу байна." }, { status: 400 }); }
}

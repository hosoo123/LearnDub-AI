import { MAX_TRANSCRIPTION_VIDEO_BYTES, transcribeVideo, TranscriptionError } from "@/lib/transcription";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function POST(request: Request) {
  try {
    const filename = decodeURIComponent(request.headers.get("x-file-name") ?? "");
    if (!filename) return Response.json({ error: "Видео файлын нэр дамжуулаагүй байна." }, { status: 400 });
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_TRANSCRIPTION_VIDEO_BYTES) {
      return Response.json({ error: "Яриа таних видео 250 MB-аас бага байх ёстой." }, { status: 413 });
    }
    const video = await request.blob();
    const file = new File([video], filename, { type: video.type });
    const segments = await transcribeVideo(file);
    return Response.json({ status: "ready", segments });
  } catch (error) {
    if (error instanceof TranscriptionError) {
      const status = /250 MB|30 минутаас|зөвхөн MP4|хоосон байна/.test(error.message) ? 400 : 503;
      return Response.json({ error: error.message }, { status });
    }
    if (error instanceof URIError) return Response.json({ error: "Видео файлын нэрийн кодчилол буруу байна." }, { status: 400 });
    return Response.json({ error: "Видеоны яриаг танихад алдаа гарлаа." }, { status: 502 });
  }
}

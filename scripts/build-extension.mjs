import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";

const outdir = "extension/dist";
const result = await build({
  entryPoints: ["extension/src/popup.ts", "extension/src/content.ts", "extension/src/background.ts", "extension/src/transcribe.ts"],
  outdir,
  bundle: true,
  format: "esm",
  target: ["chrome120"],
  sourcemap: false,
  write: false,
});
// Keep the installed extension intact when compilation fails.
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
for (const file of result.outputFiles) await writeFile(file.path, file.contents);
await writeFile(`${outdir}/popup.html`, `<!doctype html>
<html lang="mn">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>LearnDub AI хадмал</title>
    <style>
      body { width: 320px; margin: 0; padding: 18px; background: #f8fbf8; color: #1d2927; font: 14px Arial, sans-serif; }
      h1 { margin: 0 0 8px; font-size: 18px; }
      p { margin: 9px 0; color: #627067; line-height: 1.5; }
      #capture-status { color: #28785f; font-weight: 700; }
      .actions { display: grid; gap: 8px; margin-top: 16px; }
      button { min-height: 40px; padding: 10px 12px; border: 0; border-radius: 6px; background: #28785f; color: #fff; font-weight: 700; cursor: pointer; }
      button.secondary { background: #e8efeb; color: #1d2927; }
      button:focus-visible { outline: 3px solid #d5a950; outline-offset: 2px; }
      button:disabled { opacity: .5; cursor: default; }
      .privacy { font-size: 11px; }
    </style>
  </head>
  <body>
    <h1>LearnDub AI</h1>
    <p id="status" role="status" aria-live="polite">YouTube видеогоо нээгээд English CC асаана уу.</p>
    <p id="capture-status" aria-live="polite">Төлөв шалгаж байна…</p>
    <div class="actions">
      <button id="translate-toggle" type="button" disabled>Монгол хадмал асаах</button>
      <button id="speech-toggle" type="button" disabled>Монгол дуу асаах</button>
      <button id="retry" class="secondary" type="button" hidden>Алдааг арилгаад дахин оролдох</button>
      <label><input id="sync-mode" type="checkbox"> Дуу бэлдэх зуур видеог хүлээлгэх</label>
      <label>AI дуу <input id="speech-gain" type="range" min="25" max="200" value="125" step="5"></label>
      <label>AI ярианы үеийн эх дуу <input id="original-mix" type="range" min="0" max="100" value="15" step="5"></label>
      <p class="privacy">Синк горим нэг мөр дээр 8 секунд хүртэл хүлээнэ. Эх дууны тохиргоо зөвхөн AI ярьж байх үед үйлчилнэ.</p>
      <p class="privacy">Монгол дуу асаахад орчуулсан текст Microsoft Edge онлайн TTS үйлчилгээнд илгээгдэнэ. Дуу эхлэхэд видеоны эх дуу түр намсана.</p>
      <button id="capture-start" type="button">Хадмал бичиж эхлэх</button>
      <button id="capture-stop" type="button" disabled>Зогсоож VTT татах</button>
      <button id="open-app" class="secondary" type="button">LearnDub AI веб апп нээх</button>
      <button id="open-transcribe" class="secondary" type="button">Бичлэгээс яриа таних</button>
    </div>
    <p class="privacy">Монгол хадмал асаахад дэлгэцэд харагдах CC текст localhost:3000 дээрх LearnDub серверт орчуулагдана. Сервер болон Ollama ажиллаж байх шаардлагатай. Шинэ мөрийн орчуулга саатаж болно.</p>
    <script type="module" src="popup.js"></script>
  </body>
</html>
`);
await writeFile(`${outdir}/transcribe.html`, `<!doctype html>
<html lang="mn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LearnDub AI — Бичлэгээс орчуулах</title>
<style>
body{max-width:680px;margin:60px auto;padding:24px;background:#f8fbf8;color:#1d2927;font:16px/1.6 Arial,sans-serif}h1{font-size:26px}label{display:block;margin:20px 0}select,input,button{font:inherit;padding:10px;max-width:100%;box-sizing:border-box}button{border:0;border-radius:6px;background:#28785f;color:white;cursor:pointer;margin:6px 6px 6px 0}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #d5a950;outline-offset:2px}#status{padding:16px;background:#e8efeb;border-radius:8px}small{display:block;color:#627067}
</style></head><body>
<h1>Бичлэгээс Монгол хадмал</h1>
<p>YouTube дээр нээсэнтэй ижил MP4/WebM файлыг сонгоно. Файлын эхлэл видеотой таарах шаардлагатай. 250 MB, 30 минут хүртэлх англи бичлэг дэмжинэ.</p>
<label>Яриа таних горим <select id="quality"><option value="accurate">Whisper base.en · том загвар</option><option value="fast">Whisper tiny.en · жижиг загвар</option></select></label>
<label>Бичлэг сонгох <input id="video-file" type="file" accept=".mp4,.webm,video/mp4,video/webm"></label>
<p id="status" role="status" aria-live="polite">Бичлэгээ сонгож эхлээрэй.</p>
<button id="cancel" type="button" disabled>Хүлээлт цуцлах</button><button id="apply" type="button" disabled>Видеонд холбох</button><button id="download" type="button" disabled>Англи VTT хадгалах</button>
<small>Файл localhost:3000 дээрх LearnDub серверт боловсруулагдана. FFmpeg/FFprobe шаардлагатай. Popup хаасан ч энэ таб нээлттэй байвал ажил үргэлжилнэ. Табыг хаах эсвэл шинэчлэхэд хадгалаагүй үр дүн арилна.</small>
<script type="module" src="transcribe.js"></script></body></html>`);

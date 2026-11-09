import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";

const outdir = "extension/dist";
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: ["extension/src/popup.ts", "extension/src/content.ts"],
  outdir,
  bundle: true,
  format: "esm",
  target: ["chrome120"],
  sourcemap: false,
});
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
      <button id="capture-start" type="button">Хадмал бичиж эхлэх</button>
      <button id="capture-stop" type="button" disabled>Зогсоож VTT татах</button>
      <button id="open-app" class="secondary" type="button">LearnDub AI веб апп нээх</button>
    </div>
    <p class="privacy">Зөвхөн YouTube дээр дэлгэцэд харагдаж буй CC хадмалыг хадгална.</p>
    <script type="module" src="popup.js"></script>
  </body>
</html>
`);

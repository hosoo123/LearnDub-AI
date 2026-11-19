import { app, Menu, nativeImage, shell, Tray } from "electron";
import { createWriteStream, mkdirSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { findAvailablePort, findLearnDubServer, inspectCompanionHealth, type CompanionHealth } from "./health";

let tray: Tray;
let server: ChildProcess | undefined;
let health: CompanionHealth = { ollamaReady: false, modelReady: false, detail: "Шалгаж байна…" };
let shuttingDown = false;
let logPath = "";

function trayImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#28785f"/><path d="M8 9h5v10h6v4H8V9zm12 0h4v14h-4V9z" fill="white"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`).resize({ width: 16, height: 16 });
}

function rebuildMenu() {
  const ready = Boolean(health.serverUrl && health.ollamaReady && health.modelReady);
  tray.setToolTip(`LearnDub AI — ${ready ? "Бэлэн" : health.detail}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: ready ? "● LearnDub бэлэн" : `● ${health.detail}`, enabled: false }, { type: "separator" },
    { label: "LearnDub нээх", enabled: Boolean(health.serverUrl), click: () => health.serverUrl && void shell.openExternal(health.serverUrl) },
    { label: "Дахин шалгах", click: () => void refresh() },
    { label: "Сервер restart", click: () => void restartServer() },
    { label: "Log нээх", click: () => void shell.openPath(logPath) }, { type: "separator" },
    { label: "Windows асахад ажиллуулах", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true }) },
    { label: "Гарах", click: () => { shuttingDown = true; server?.kill(); app.quit(); } },
  ]));
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = await findLearnDubServer();
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return undefined;
}

async function startServer() {
  const existing = await findLearnDubServer();
  if (existing) return existing;
  const port = await findAvailablePort();
  const log = createWriteStream(logPath, { flags: "a" });
  if (app.isPackaged) {
    const serverFile = path.join(process.resourcesPath, "server", "server.js");
    server = spawn(process.execPath, [serverFile], { cwd: path.dirname(serverFile), windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(port), HOSTNAME: "127.0.0.1" } });
  } else {
    const projectRoot = path.resolve(__dirname, "../..");
    server = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "-p", String(port)],
      { cwd: projectRoot, windowsHide: true, env: process.env });
  }
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  server.once("exit", () => { server = undefined; if (!shuttingDown) void refresh(); });
  return waitForServer();
}

async function restartServer() {
  server?.kill(); server = undefined;
  health = { ollamaReady: health.ollamaReady, modelReady: health.modelReady, detail: "Сервер restart хийж байна…" };
  rebuildMenu(); await startServer(); await refresh();
}

async function refresh() {
  health = await inspectCompanionHealth();
  if (!health.serverUrl) {
    health.detail = "LearnDub сервер асааж байна…"; rebuildMenu();
    health.serverUrl = await startServer(); health = await inspectCompanionHealth();
  }
  rebuildMenu();
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else app.whenReady().then(async () => {
  const logDir = path.join(app.getPath("userData"), "logs");
  mkdirSync(logDir, { recursive: true }); logPath = path.join(logDir, "companion.log");
  tray = new Tray(trayImage()); rebuildMenu();
  tray.on("double-click", () => health.serverUrl && void shell.openExternal(health.serverUrl));
  await refresh(); setInterval(() => void refresh(), 15_000).unref();
});

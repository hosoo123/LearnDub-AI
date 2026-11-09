import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const extensionDirectory = "extension";
const archiveName = "learndub-ai-chrome.zip";

if (platform() === "win32") {
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path 'manifest.json','dist' -DestinationPath '${archiveName}' -Force`,
  ], { cwd: extensionDirectory, stdio: "inherit" });
} else {
  execFileSync("zip", ["-r", "-FS", archiveName, "manifest.json", "dist"], {
    cwd: extensionDirectory,
    stdio: "inherit",
  });
}

console.log(`Created ${extensionDirectory}/${archiveName}`);

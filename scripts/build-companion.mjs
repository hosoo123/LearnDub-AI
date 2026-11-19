import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("companion/dist", { recursive: true });
await build({ entryPoints: ["companion/src/main.ts"], outfile: "companion/dist/main.cjs", bundle: true,
  platform: "node", format: "cjs", target: "node22", external: ["electron"], sourcemap: false });

import { readFile } from "node:fs/promises";
import { pipeline } from "@huggingface/transformers";

const [, , audioPath, modelId, cacheDir] = process.argv;
if (!audioPath || !modelId || !cacheDir) {
  throw new Error("Audio path, model ID, and cache path are required.");
}

const buffer = await readFile(audioPath);
if (buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
  throw new Error("Audio file has an invalid Float32 format.");
}
const audio = new Float32Array(buffer.buffer.slice(
  buffer.byteOffset,
  buffer.byteOffset + buffer.byteLength,
));
const transcriber = await pipeline("automatic-speech-recognition", modelId, {
  device: "cpu",
  dtype: "q8",
  cache_dir: cacheDir,
});
const result = await transcriber(audio, {
  return_timestamps: true,
  chunk_length_s: 30,
  stride_length_s: 5,
});

process.stdout.write(JSON.stringify({ chunks: result.chunks ?? [] }));

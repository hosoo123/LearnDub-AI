import { formatRelevantGlossary } from "./translation-glossary";
import { EdgeTTS } from "node-edge-tts";
import { getSpeechProsody, MONGOLIAN_TTS_VOICES, type MongolianTtsVoice } from "./speech";

export type TranslationResult = { status: "demo" | "ready"; translatedText?: string; message: string };
export type TranslationSegment = { id: string; text: string; contextTranslation?: string };
export type TranslatedSegment = { id: string; translatedText: string };
export type TtsResult = { status: "not-configured" | "ready"; audioUrl?: string; message: string };
export type TtsOptions = { voice?: MongolianTtsVoice; sourceText?: string };

export interface TranslationProvider {
  translate(text: string): Promise<TranslationResult>;
  translateBatch(segments: TranslationSegment[]): Promise<TranslatedSegment[]>;
}
export interface TtsProvider { synthesize(text: string, options?: TtsOptions): Promise<TtsResult>; }

export class TranslationProviderError extends Error {}
export class TtsProviderError extends Error {}

const OLLAMA_REQUEST_TIMEOUT_MS = 300_000;

function getOllamaModels() {
  const configured = process.env.OLLAMA_MODEL?.trim();
  const fallbackModels = ["mongolian-llama3-v0.1-q4_k_m:latest", "qwen2.5-coder:7b", "gemma4:e4b"];
  return [...new Set([configured, ...fallbackModels].filter((model): model is string => Boolean(model && model.trim())))]
    .filter((model) => model !== "");
}

function isTimeoutLikeError(error: unknown) {
  if (error instanceof DOMException) return error.name === "TimeoutError" || error.name === "AbortError";
  if (error instanceof Error) return /timeout|aborted/i.test(error.message) || /timeout|aborted/i.test(error.name);
  return false;
}

async function translateBatchWithOllama(segments: TranslationSegment[]): Promise<TranslatedSegment[]> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
  const relevantGlossary = formatRelevantGlossary(segments.map(({ text }) => text));
  const glossaryInstructions = relevantGlossary
    ? `\n\nЭнэ багцад таарсан нэр томьёоны сан. Утга нь тухайн контекстэд тохирч байвал тогтвортой хэрэглэ; хэлц үгийг үгчлэн орчуулж болохгүй:\n${relevantGlossary}`
    : "";

  const models = getOllamaModels();
  const primaryModel = models[0];
  let lastError: Error | undefined;

  for (const model of models) {
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: "json",
          messages: [
            {
              role: "system",
              content: "Чи англи хэлнээс монгол хэл рүү хадмал орчуулдаг туршлагатай орчуулагч. Бүх дараалсан мөрийг эхлээд хамтад нь уншиж, утгыг нь ойлго. Өгүүлбэр хэд хэдэн мөрөнд хуваагдсан бол ойролцоох мөрөөр утгыг нөхөж ойлгоод, мөрийн таслал дээр өгүүлбэрийн утгыг бүү тасал; cue бүрийг монгол хэлэнд байгалийн сонсогдохоор орчуул. Үг бүрийг салгаж шууд орчуулж болохгүй. Хэлц үгийг тухайн харилцан ярианы утгаар нь буулга; нэг үг олон утгатай бол ойр орчмын мөрөөр сонго. Энгийн харилцан ярианд 'чи' хэлбэрийг хэрэглэж, эхэд албан ёсны эсвэл хүндэтгэсэн өнгө тодорхой байвал 'та' хэлбэрийг сонго; нэг ярианд хандлагыг тогтвортой байлга. Монгол кириллээр зөв бичиж, үсэг холих/эвдэрхий үг гаргахгүй; орчуулсны дараа өгүүлбэр бүрийг уншигдах байдал, нөхцөл залгавраар шалгаж зас. Эхэд хараал, бүдүүлэг үг, доромжлол байвал утга, хүч, өнгө аясыг хадгалан цензургүй орчуул; зөөлрүүлж эсвэл орхиж болохгүй. Эхэд байхгүй зүйл нэмэхгүй, нэр болон дууны тэмдэглэгээг хадгал, мөрийг алгасахгүй эсвэл нэгтгэхгүй. Зөвхөн хүссэн бүтэцтэй JSON буцаа; тайлбар бүү нэм.",
            },
            {
              role: "user",
              content: `Дараах хадмалын мөр бүрийг утгаар нь монгол хэл рүү орчуул. contextTranslation нь өмнө баталсан хөрш орчуулга бөгөөд утга, нэр томьёо, өнгө аясыг зөв ойлгоход ашиглана. ID бүрийг хэвээр хадгалж, мөрүүдийг ижил дарааллаар яг нэг удаа буцаа. JSON бүтэц: {"translations":[{"id":"...","translatedText":"..."}]}${glossaryInstructions}\n\n${JSON.stringify(segments)}`,
            },
          ],
          options: { temperature: 0.1 },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(OLLAMA_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (response.status === 404) {
          const missingModelMessage = `Ollama '${model}' загварыг олсонгүй. PowerShell дээр 'ollama pull ${model}' командыг ажиллуулна уу.`;
          if (model === primaryModel) {
            throw new TranslationProviderError(missingModelMessage);
          }
          lastError = new TranslationProviderError(missingModelMessage);
          continue;
        }
        lastError = new TranslationProviderError(`Ollama '${model}' хүсэлтийг амжилтгүй болголоо (HTTP ${response.status}).`);
        continue;
      }

      let data: { message?: { content?: string } };
      try {
        data = await response.json() as { message?: { content?: string } };
      } catch {
        lastError = new TranslationProviderError(`Ollama '${model}'-оос унших боломжгүй хариу ирлээ.`);
        continue;
      }
      const content = data.message?.content?.trim();
      if (!content) {
        lastError = new TranslationProviderError(`Ollama '${model}' хоосон орчуулга буцаалаа.`);
        continue;
      }

      let parsed: { translations?: unknown };
      try {
        parsed = JSON.parse(content) as { translations?: unknown };
      } catch {
        lastError = new TranslationProviderError(`Ollama '${model}' орчуулгыг шаардлагатай JSON форматаар буцаасангүй. Дахин оролдоно уу.`);
        continue;
      }

      if (!Array.isArray(parsed.translations) || parsed.translations.length !== segments.length) {
        lastError = new TranslationProviderError(`Ollama '${model}' хадмалын мөр бүрд орчуулга буцаасангүй. Дахин оролдоно уу.`);
        continue;
      }

      const expectedIds = new Set(segments.map((segment) => segment.id));
      const translated = new Map<string, string>();
      for (const item of parsed.translations) {
        if (typeof item !== "object" || item === null || !("id" in item) || !("translatedText" in item)) {
          lastError = new TranslationProviderError(`Ollama '${model}' орчуулгын хариуны бүтэц буруу байна. Дахин оролдоно уу.`);
          throw lastError;
        }
        const { id, translatedText } = item as { id: unknown; translatedText: unknown };
        if (typeof id !== "string" || !expectedIds.has(id) || translated.has(id) || typeof translatedText !== "string" || !translatedText.trim()) {
          lastError = new TranslationProviderError(`Ollama '${model}' хадмалын ID эсвэл орчуулгын хариуг буруу буцаалаа. Дахин оролдоно уу.`);
          throw lastError;
        }
        translated.set(id, translatedText.trim());
      }

      return segments.map(({ id }) => {
        const translatedText = translated.get(id);
        if (!translatedText) {
          throw new TranslationProviderError(`Ollama '${model}' зарим хадмалын мөрийг орхисон байна. Дахин оролдоно уу.`);
        }
        return { id, translatedText };
      });
    } catch (error) {
      if (isTimeoutLikeError(error)) {
        lastError = new TranslationProviderError(`Ollama '${model}' 300 секундэд хариу өгсөнгүй. Загвар ачаалж байгаа эсэхийг шалгаад дахин оролдоно уу.`);
        continue;
      }
      if (error instanceof TranslationProviderError) {
        lastError = error;
        continue;
      }
      lastError = new TranslationProviderError("Ollama-д холбогдож чадсангүй. Ollama ажиллаж байгаа эсэхийг шалгана уу.");
      continue;
    }
  }

  throw lastError ?? new TranslationProviderError("Ollama-д холбогдож чадсангүй. Ollama ажиллаж байгаа эсэхийг шалгана уу.");
}

async function translateBatchWithAzure(segments: TranslationSegment[]): Promise<TranslatedSegment[]> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  if (!key) throw new TranslationProviderError("Azure ашиглахын тулд AZURE_TRANSLATOR_KEY тохируулна уу.");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": key,
  };
  if (region) headers["Ocp-Apim-Subscription-Region"] = region;
  const response = await fetch("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=mn-Cyrl", {
    method: "POST",
    headers,
    body: JSON.stringify(segments.map(({ text }) => ({ text }))),
    cache: "no-store",
  });
  if (!response.ok) throw new TranslationProviderError(`Azure Translator хүсэлтийг амжилтгүй болголоо (HTTP ${response.status}).`);
  const data = await response.json() as Array<{ translations?: Array<{ text?: string }> }>;
  if (data.length !== segments.length) throw new TranslationProviderError("Azure Translator бүх хадмалын мөрд хариу өгсөнгүй.");
  return segments.map((segment, index) => {
    const translatedText = data[index]?.translations?.[0]?.text;
    if (!translatedText) throw new TranslationProviderError("Azure Translator хоосон орчуулга буцаалаа.");
    return { id: segment.id, translatedText };
  });
}

async function translateBatch(segments: TranslationSegment[]): Promise<TranslatedSegment[]> {
  const provider = process.env.TRANSLATION_PROVIDER || "ollama";
  if (provider === "ollama") return translateBatchWithOllama(segments);
  if (provider === "azure") return translateBatchWithAzure(segments);
  throw new TranslationProviderError("TRANSLATION_PROVIDER нь 'ollama' эсвэл 'azure' байх ёстой.");
}

export const translationProvider: TranslationProvider = {
  async translate(text) {
    const [translated] = await translateBatch([{ id: "single", text }]);
    return { status: "ready", translatedText: translated.translatedText, message: "Орчуулга бэлэн боллоо." };
  },
  translateBatch,
};

export const ttsProvider: TtsProvider = {
  async synthesize(text, { voice = MONGOLIAN_TTS_VOICES.bataa, sourceText = text } = {}) {
    const prosody = getSpeechProsody(sourceText);
    const provider = new EdgeTTS({
      voice,
      lang: "mn-MN",
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      rate: prosody.rate,
      pitch: prosody.pitch,
      timeout: 15_000,
    });
    const chunks: Buffer[] = [];

    try {
      for await (const chunk of provider.streamAudio(text)) {
        if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      }
    } catch (error) {
      throw new TtsProviderError("Монгол дууны онлайн үйлчилгээ хариу өгөхгүй байна. Интернэтээ шалгаад дахин оролдоно уу.", { cause: error });
    }

    if (!chunks.length) throw new TtsProviderError("Монгол дууны үйлчилгээ аудио үүсгэсэнгүй.");
    const audioUrl = `data:audio/mpeg;base64,${Buffer.concat(chunks).toString("base64")}`;
    return { status: "ready", audioUrl, message: "Монгол neural дуу бэлэн боллоо." };
  },
};

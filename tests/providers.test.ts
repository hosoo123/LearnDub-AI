import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationProviderError, translationProvider } from "../src/lib/providers";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Ollama translation provider", () => {
  it("sends consecutive cues as a contextual, non-streaming translation request", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434/");
    vi.stubEnv("OLLAMA_MODEL", "gemma4:e4b");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      message: { content: JSON.stringify({ translations: [{ id: "cue-1", translatedText: "Хоёр дахь мөр" }, { id: "cue-0", translatedText: "Эхний мөр" }] }) },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(translationProvider.translateBatch([
      { id: "cue-0", text: "First line", contextTranslation: "Өмнөх баталсан орчуулга" },
      { id: "cue-1", text: "Second line" },
    ])).resolves.toEqual([
      { id: "cue-0", translatedText: "Эхний мөр" },
      { id: "cue-1", translatedText: "Хоёр дахь мөр" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(requestBody).toMatchObject({
      model: "gemma4:e4b",
      stream: false,
      think: false,
      format: "json",
      messages: [
        { role: "system", content: expect.stringContaining("Энгийн харилцан ярианд 'чи' хэлбэрийг хэрэглэ") },
        { role: "user", content: expect.stringContaining("First line") },
      ],
      options: { temperature: 0.1 },
    });
    expect(requestBody.messages[1].content).toContain("Өмнөх баталсан орчуулга");
  });

  it("includes only matching context-aware glossary terms", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      message: { content: JSON.stringify({ translations: [{ id: "cue-0", translatedText: "Амьдралаа цэгцэлж эхэлж байтал чи буцаж ирлээ." }] }) },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await translationProvider.translateBatch([
      { id: "cue-0", text: "I was starting to get my life together when you came back from outer space." },
    ]);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const userPrompt = requestBody.messages[1].content as string;
    expect(userPrompt).toContain("starting to get my life together = амьдралаа цэгцэлж эхлэх");
    expect(userPrompt).toContain("from outer space = сансар огторгуйгаас");
    expect(userPrompt).not.toContain("astronaut =");
    expect(userPrompt).not.toContain("key =");
  });

  it("provides contextual glossary entries for the sample dialogue", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      message: { content: JSON.stringify({ translations: [
        { id: "cue-0", translatedText: "Би амьдралаа цэгцэлж эхэлж байтал чи буцаж ирсэн." },
        { id: "cue-1", translatedText: "Чи буцаж ирээд амьдралыг минь там болгоно гэдгийг мэдсэн ч болоосой." },
        { id: "cue-2", translatedText: "Би нүүж гараад түлхүүрээ авч явах минь яав." },
      ] }) },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await translationProvider.translateBatch([
      { id: "cue-0", text: "I was just starting to get my life together." },
      { id: "cue-1", text: "I wish I had known you would come back and make my life a living hell." },
      { id: "cue-2", text: "I should have moved out and taken my keys with me." },
    ]);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const userPrompt = requestBody.messages[1].content as string;
    expect(userPrompt).toContain("I was just starting to get my life together = Би амьдралаа цэгцэлж эхэлж байтал");
    expect(userPrompt).toContain("I wish I had known you would come back and make my life a living hell");
    expect(userPrompt).toContain("should have moved out and taken my keys with me = нүүж гараад түлхүүрээ авч явсан бол дээр байж");
  });

  it("uses subtitle-specific meanings for ambiguous phrases and sound cues", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      message: { content: JSON.stringify({ translations: [
        { id: "cue-0", translatedText: "Би чамгүйгээр амьдарч сурсан. Тэгтэл чи буцаад ирлээ." },
        { id: "cue-1", translatedText: "[Хөгжим эгшиглэж байна]" },
        { id: "cue-2", translatedText: "Тэр тэнэг цоожийг солих ёстой байж." },
        { id: "cue-3", translatedText: "Чамайг түлхүүрээ үлдээгээд явахыг шаардах ёстой байж." },
        { id: "cue-4", translatedText: "Ганцхан хором ч болов мэдсэн бол." },
        { id: "cue-5", translatedText: "Чи дахиад ирж намайг зовоох байсныг." },
        { id: "cue-6", translatedText: "Цонхыг чинь өргөж хаахаас өмнө толгойгоо дотогш тат." },
        { id: "cue-7", translatedText: "Одоо харсан чинь чи энд гунигтай царайтай байж байсан." },
        { id: "cue-8", translatedText: "[Ая аялж байна]" },
      ] }) },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await translationProvider.translateBatch([
      { id: "cue-0", text: "And I learned how to get along, and so you're back." },
      { id: "cue-1", text: "[Music playing]" },
      { id: "cue-2", text: "I should have changed that stupid lock." },
      { id: "cue-3", text: "I should have made you leave your key." },
      { id: "cue-4", text: "If I'd known for just one second." },
      { id: "cue-5", text: "You'd be back to bother me." },
      { id: "cue-6", text: "Bring your head in this window before I roll it up in there." },
      { id: "cue-7", text: "I just walked in to find you here with that sad look upon your face." },
      { id: "cue-8", text: "[Humming the tune]" },
    ]);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const userPrompt = requestBody.messages[1].content as string;
    expect(userPrompt).toContain("learned how to get along = чамгүйгээр амьдарч сурсан");
    expect(userPrompt).toContain("and so you're back = тэгтэл чи буцаад ирлээ");
    expect(userPrompt).toContain("[music playing] = [Хөгжим эгшиглэж байна]");
    expect(userPrompt).toContain("should have changed that stupid lock = тэр тэнэг цоожийг солих ёстой байж");
    expect(userPrompt).toContain("should have made you leave your key = чамайг түлхүүрээ үлдээгээд явахыг шаардах ёстой байж");
    expect(userPrompt).toContain("if I'd known for just one second = ганцхан хором ч болов мэдсэн бол");
    expect(userPrompt).toContain("back to bother me = дахиад ирж намайг зовоох");
    expect(userPrompt).toContain("before I roll it up in there = цонхыг чинь өргөж хаахаас өмнө");
    expect(userPrompt).toContain("find you here with that sad look = чи энд гунигтай царайтай сууж байх юм");
    expect(userPrompt).toContain("just walked in = дөнгөж орж иртэл");
    expect(userPrompt).toContain("[humming the tune] = [Ая аялж байна]");
  });

  it("rejects a batch response that omits a subtitle cue", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      message: { content: JSON.stringify({ translations: [{ id: "cue-0", translatedText: "Орчуулга" }] }) },
    })));

    await expect(translationProvider.translateBatch([
      { id: "cue-0", text: "First line" },
      { id: "cue-1", text: "Second line" },
    ])).rejects.toThrow("мөр бүрд орчуулга");
  });

  it("explains when Ollama cannot be reached", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection refused")));

    await expect(translationProvider.translate("Hello")).rejects.toThrow(TranslationProviderError);
    await expect(translationProvider.translate("Hello")).rejects.toThrow("Ollama-д холбогдож чадсангүй");
  });

  it("explains when the configured model is missing", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_MODEL", "missing-model");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(translationProvider.translate("Hello")).rejects.toThrow("ollama pull missing-model");
  });
});

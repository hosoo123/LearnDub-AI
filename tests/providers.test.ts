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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ translations: [{ id: "cue-1", translatedText: "Хоёр дахь мөр" }, { id: "cue-0", translatedText: "Эхний мөр" }] }) },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
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
        { role: "system", content: expect.stringContaining("Англи хэлний үгийн дарааллыг бүү дуурай") },
        { role: "user", content: expect.stringContaining("First line") },
      ],
      options: { temperature: 0.1 },
    });
    expect(requestBody.messages[0].content).toContain("Cue бүрд зөвхөн тухайн эх мөрийн утгыг өг");
    expect(requestBody.messages[0].content).toContain("давталтгүй, залгамж холбоотой хуваарил");
    expect(requestBody.messages[0].content).toContain("'Чи арай' / 'тоглоогүй биз?'");
    expect(requestBody.messages[1].content).toContain("Өмнөх баталсан орчуулга");
    expect(requestBody.messages[1].content).toContain("бүтэн орчуулгыг нэг cue-д шахаж, бусдад давтаж болохгүй");
    expect(requestBody.messages[1].content).toContain('"Чи арай" / "тоглоогүй биз?"');
  });

  it("preserves profanity and the source tone instead of censoring subtitles", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ translations: [{ id: "cue-0", translatedText: "Бүдүүлэг өнгө аясыг хадгалсан орчуулга." }] }) },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await translationProvider.translateBatch([{ id: "cue-0", text: "What the hell are you doing?" }]);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(requestBody.messages[0].content).toContain("цензургүй орчуул");
    expect(requestBody.messages[0].content).toContain("зөөлрүүлж эсвэл орхиж болохгүй");
    expect(requestBody.messages[1].content).toContain("what the hell are you doing = Чи юу хийгээд байгаа юм бэ, новш гэж?");
  });

  it("uses contextual Mongolian for profanity and common sarcastic dialogue", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ translations: [
        { id: "cue-0", translatedText: "Энэ чинь худлаа шаасан юм." },
        { id: "cue-1", translatedText: "Надад ёстой падгүй." },
        { id: "cue-2", translatedText: "Чи тоглоод байгаа юм уу?" },
      ] }) },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await translationProvider.translateBatch([
      { id: "cue-0", text: "This is bullshit." },
      { id: "cue-1", text: "I don't give a damn." },
      { id: "cue-2", text: "You have got to be kidding me." },
    ]);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const userPrompt = requestBody.messages[1].content as string;
    expect(userPrompt).toContain("this is bullshit = Энэ чинь худлаа шаасан юм");
    expect(userPrompt).toContain("i don't give a damn = Надад ёстой падгүй.");
    expect(userPrompt).toContain("you have got to be kidding me = Чи тоглоод байгаа юм уу?");
  });

  it("provides contextual guidance for commonly mistranslated colloquial phrases", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ translations: [
        { id: "cue-0", translatedText: "Чи намайг инээлгээд аллаа!" },
        { id: "cue-1", translatedText: "За боль л доо." },
        { id: "cue-2", translatedText: "Чи нээрээ юу?" },
        { id: "cue-3", translatedText: "Би үүнээс залхлаа." },
        { id: "cue-4", translatedText: "Арай л алдсангүй шүү." },
        { id: "cue-5", translatedText: "Надад огт хамаагүй." },
        { id: "cue-6", translatedText: "Чи ч ёстой ичих нүүргүй юм аа." },
        { id: "cue-7", translatedText: "[Санаа алдлаа]" },
      ] }) },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await translationProvider.translateBatch([
      { id: "cue-0", text: "You're killing me!" },
      { id: "cue-1", text: "Come on, give me a break." },
      { id: "cue-2", text: "Are you serious right now?" },
      { id: "cue-3", text: "I'm done with this." },
      { id: "cue-4", text: "That was close." },
      { id: "cue-5", text: "I couldn't care less." },
      { id: "cue-6", text: "You have some nerve." },
      { id: "cue-7", text: "[sighs]" },
    ]);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const userPrompt = requestBody.messages[1].content as string;
    expect(userPrompt).toContain("you're killing me = Чи намайг инээлгээд аллаа / Чи намайг бүр залхааж гүйцлээ");
    expect(userPrompt).toContain("come on, give me a break = За боль л доо");
    expect(userPrompt).toContain("are you serious right now = Чи нээрээ юу? / Чи яг үнэнээсээ хэлж байна уу?");
    expect(userPrompt).toContain("i'm done with this = Би үүнээс залхлаа / Би үүнийг дуусгалаа");
    expect(userPrompt).toContain("that was close = Арай л алдсангүй шүү");
    expect(userPrompt).toContain("i couldn't care less = Надад огт хамаагүй");
    expect(userPrompt).toContain("you have some nerve = Чи ч ёстой ичих нүүргүй юм аа");
    expect(userPrompt).toContain("[sighs] = [Санаа алдлаа]");
  });

  it("matches glossary phrases that continue across subtitle cues", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ translations: [
        { id: "cue-0", translatedText: "Чи тоглоод байгаа юм уу?" },
        { id: "cue-1", translatedText: "За боль л доо." },
      ] }) },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await translationProvider.translateBatch([
      { id: "cue-0", text: "You have got to be" },
      { id: "cue-1", text: "kidding me." },
    ]);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const userPrompt = requestBody.messages[1].content as string;
    expect(userPrompt).toContain("you have got to be kidding me = Чи тоглоод байгаа юм уу?");
  });

  it("uses lyric-specific meaning and repetition guidance in song mode", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ translations: [
        { id: "cue-0", translatedText: "Өглөөний гэрэл нам гүм замыг гийгүүлнэ." },
        { id: "cue-1", translatedText: "Би түүний мөнгөлөг туяаг дагана." },
      ] }) },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await translationProvider.translateBatch([
      { id: "cue-0", text: "Morning light fills the quiet road." },
      { id: "cue-1", text: "I follow its silver line." },
    ], "song");

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(requestBody.options.temperature).toBe(0.2);
    expect(requestBody.messages[0].content).toContain("Энэ багц дууны үг");
    expect(requestBody.messages[0].content).toContain("давталт, дахилтыг эхтэй адил хадгал");
    expect(requestBody.messages[0].content).toContain("утга, зөв монгол хэл, хараалын хүчийг хэзээ ч золиосолж болохгүй");
    expect(requestBody.messages[1].content).toContain("i follow its silver line = Би түүний мөнгөлөг туяаг дагана");
  });

  it("falls back to the next installed Ollama model when the primary model times out", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_MODEL", "gemma4:e4b");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" }))
      .mockImplementationOnce(async () => new Response(JSON.stringify({
        message: { content: JSON.stringify({ translations: [{ id: "cue-0", translatedText: "Амьдралаа цэгцэлж эхэлж байтал чи буцаж ирлээ." }] }) },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(translationProvider.translateBatch([
      { id: "cue-0", text: "I was starting to get my life together when you came back from outer space." },
    ])).resolves.toEqual([
      { id: "cue-0", translatedText: "Амьдралаа цэгцэлж эхэлж байтал чи буцаж ирлээ." },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].body).toContain('"model":"gemma4:e4b"');
    expect(fetchMock.mock.calls[1][1].body).toContain('"model":"mongolian-llama3-v0.1-q4_k_m:latest"');
  });

  it("includes only matching context-aware glossary terms", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ translations: [{ id: "cue-0", translatedText: "Амьдралаа цэгцэлж эхэлж байтал чи буцаж ирлээ." }] }) },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ translations: [
        { id: "cue-0", translatedText: "Би амьдралаа цэгцэлж эхэлж байтал чи буцаж ирсэн." },
        { id: "cue-1", translatedText: "Чи буцаж ирээд амьдралыг минь там болгоно гэдгийг мэдсэн ч болоосой." },
        { id: "cue-2", translatedText: "Би нүүж гараад түлхүүрээ авч явах минь яав." },
      ] }) },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
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
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ translations: [{ id: "cue-0", translatedText: "Орчуулга" }] }) },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

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

  it("explains when the configured and fallback Ollama models are unavailable", async () => {
    vi.stubEnv("TRANSLATION_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_MODEL", "gemma4:e4b");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    await expect(translationProvider.translate("Hello")).rejects.toThrow("ollama pull qwen2.5-coder:7b");
  });
});

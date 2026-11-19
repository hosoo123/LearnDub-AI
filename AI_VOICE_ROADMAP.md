# LearnDub AI Voice Roadmap

Энэ жагсаалтыг дээрээс нь доош нэг нэгээр хэрэгжүүлнэ. Дууссан ажил бүр тесттэй байна.

- [x] Cue-ийн хугацаа, үгийн тоо, emotion-оор TTS-ийн анхны ярих хурдыг тохируулах.
- [x] Монгол TTS text normalization: тоо, товчлол, URL, түгээмэл гадаад нэрийн дуудлага.
- [x] Эх аудионы volume/pause/tempo-г browser дээр шинжилж delivery profile үүсгэх.
- [ ] Эх аудионы emotion/confidence-ийг text emotion-той нэгтгэх.
- [ ] Cue-үүдийг бүтэн өгүүлбэрээр ухаалгаар нэгтгэж, амьсгал ба pause хадгалах.
- [ ] Bataa/Yesui voice-ийг speaker болон дүрээр автоматаар сонгох.
- [ ] TTS audio-г урьдчилан бэлтгэх priority queue, cancel болон latency telemetry нэмэх.
- [x] YouTube signed timed transcript-ийг автоматаар авч, live cue-ээс түрүүлж translation/TTS cache хийх.
- [x] Future cue бүрийг тусдаа request болгохгүй, priority-aware batch prefetch ашиглаж Ollama queue бөглөрөхөөс хамгаалах.
- [x] Extension live горимд богино prompt, хязгаартай context/output budget, model keep-alive ашиглах.
- [x] Cue солигдоход stale live/prefetch request-ийг abort хийж Ollama queue цэвэр байлгах.
- [ ] Хэрэглэгчийн зөвшөөрөлтэй reference voice ашиглах local voice-cloning prototype судлах.
- [ ] Монгол voice dataset-ийн consent, цэвэрлэгээ, transcript болон evaluation pipeline төлөвлөх.
- [ ] Fine-tuned Монгол TTS model-ийн prototype, pronunciation/MOS/speaker-similarity үнэлгээ хийх.

## Одоогийн milestone

### 1. Duration-aware expressive delivery — дууссан

Extension cue дуусах хүртэлх хугацааг `/api/tts` рүү дамжуулна. Сервер Монгол үгийн тоогоор байгалийн үргэлжлэх хугацааг тооцоолж, emotion profile-ийн rate-тай нэгтгэн хязгаартай хурд сонгоно. Browser талын эцсийн sync correction хэвээр үлдэнэ.

### 2. Монгол TTS text normalization — дууссан

TTS provider руу орохын өмнө 0–999,999 хүртэлх бүхэл тоо, аравтын бутархай, хувь, доллар, URL болон түгээмэл технологийн товчлол/нэрийг Монгол дуудлагад хөрвүүлнэ. Давхар whitespace ба эвдэрсэн punctuation-ийг мөн цэвэрлэнэ.

### 3. Source audio delivery analysis — дууссан

YouTube video-гийн audio stream боломжтой үед Web Audio analyser-аар rolling RMS loudness, silence ratio, energy transition болон playback tempo хэмжинэ. Эх дууг Web Audio destination руу дахин route хийхгүй тул playback-д нөлөөлөхгүй. Browser/cross-origin хязгаарлалтаар capture боломжгүй үед neutral profile ашиглана.

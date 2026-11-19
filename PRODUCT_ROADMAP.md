# LearnDub Product Roadmap

Зорилго: terminal, Node.js, port болон model-ийн тохиргоо мэдэхгүй хэрэглэгч YouTube дээр Монгол хадмал, AI дубляжийг нэг товчоор ашигладаг Windows бүтээгдэхүүн болгох.

## Product architecture

```text
Chrome Extension
       ↓ localhost health discovery
LearnDub Desktop Companion
       ↓
Ollama translation + Whisper transcription + Mongolian TTS
```

## Phase 1 — Windows beta

- [x] LearnDub Desktop Companion application skeleton үүсгэх.
- [x] Windows system tray: Ready, Starting, Error, Restart, Open logs, Quit.
- [x] LearnDub серверийг companion-оос автоматаар асааж, зогсоох.
- [x] 3000–3005 дотроос сул port сонгож health endpoint-оор мэдэгдэх.
- [x] Ollama суусан, ажиллаж байгаа эсэхийг автоматаар шалгах.
- [ ] `gemma4:e4b` model байгаа эсэхийг шалгаж, хэрэглэгчийн зөвшөөрлөөр татах.
- [ ] Model storage drive/folder сонгох UI нэмэх.
- [ ] FFmpeg/FFprobe болон Whisper runtime-ийг bundle эсвэл managed install болгох.
- [ ] Server/model/TTS/Whisper-ийн self-test болон automatic repair нэмэх.
- [x] Нэг товчтой Windows NSIS installer/uninstaller үүсгэх.
- [x] Optional Windows login auto-start tray тохиргоо нэмэх.
- [ ] Installer upgrade хийхэд settings/model cache устахгүй байх.

## Phase 2 — Extension onboarding and reliability

- [ ] Анхны setup wizard: companion, Ollama, model, server, TTS, YouTube permission.
- [ ] Popup дээр connection, transcript, translation, TTS, latency-ийн бодит төлөв харуулах.
- [ ] Алдаа бүрд хэрэглэгчийн хийх тодорхой repair action харуулах.
- [ ] Desktop companion-ийн port-ийг автоматаар олж хадгалах.
- [ ] Extension update/companion version compatibility шалгах.
- [ ] Permission-уудыг feature хэрэглэх үед optional байдлаар хүсэх.
- [ ] Offline, server restart, browser restart, YouTube SPA navigation тест нэмэх.

## Phase 3 — Low-latency live translation

- [x] YouTube signed timed transcript автоматаар ачаалах.
- [x] Current cue priority болон future cue batch prefetch.
- [x] Stale request cancel, model keep-alive, live богино prompt.
- [ ] Transcript cache-г video ID, language, model version-оор хадгалах.
- [ ] Partial/final auto-CC state machine нэмэх.
- [ ] Adaptive debounce болон latency-based lookahead нэмэх.
- [ ] Translation queue-ийн deadline, priority, cancel telemetry нэмэх.
- [ ] Current cue хоцорвол subtitle-only graceful fallback хийх.
- [ ] Translation quality/latency benchmark dataset үүсгэх.

## Phase 4 — Direct tab-audio fallback

- [ ] `tabCapture` болон `offscreen` optional permissions нэмэх.
- [ ] Хэрэглэгчийн тодорхой consent-ийн дараа tab audio stream авах.
- [ ] Offscreen document + AudioWorklet-аар 16 kHz mono PCM үүсгэх.
- [ ] WebRTC/Silero VAD ашиглан яриа, silence, background sound ялгах.
- [ ] Local streaming Whisper service үүсгэх.
- [ ] Partial/final English transcript болон timestamp state machine хийх.
- [ ] YouTube CC болон Whisper transcript-ийг deduplicate/merge хийх.
- [ ] Music, сул авиа, амьсгал, sound effect-ийг орчуулгаас хасах.
- [ ] Seek, pause, playback-rate, tab navigation үед stream reset хийх.

## Phase 5 — AI voice and sync

- [x] Cue duration-aware TTS rate.
- [x] Монгол TTS text normalization.
- [x] Source volume/pause/tempo delivery analysis.
- [ ] Audio emotion confidence-ийг text emotion-той нэгтгэх.
- [ ] Бүтэн өгүүлбэрээр cue merge хийж pause/амьсгал хадгалах.
- [ ] Bataa/Yesui voice сонголт болон preview UI.
- [ ] Speaker/character consistency нэмэх.
- [ ] TTS priority queue, retry болон fallback voice нэмэх.
- [ ] Audio drift correction болон deadline-aware playback хийх.
- [ ] AI voice хоцорвол эх дууг хэрэггүйгээр намсгахгүй байх.

Дэлгэрэнгүй voice ажлууд: [AI_VOICE_ROADMAP.md](./AI_VOICE_ROADMAP.md)

## Phase 6 — Privacy, security and compliance

- [ ] Extension-ийн single purpose болон data-flow баримтжуулах.
- [ ] Privacy policy болон Limited Use disclosure бичих.
- [ ] Caption/audio хаашаа илгээгдэхийг UI дээр урьдчилан тайлбарлах.
- [ ] Tab audio capture-д affirmative consent авах.
- [ ] Local mode-д raw audio/transcript хадгалахгүй default хэрэгжүүлэх.
- [ ] Log дотор subtitle/audio/auth data оруулахгүй байх.
- [ ] Minimum Chrome permissions audit хийх.
- [ ] Content Security Policy болон dependency security audit хийх.
- [ ] YouTube standard controls/playback experience-ийг эвдэхгүй шалгах.
- [ ] Data deletion болон retention policy тодорхойлох.

## Phase 7 — Chrome Web Store beta

- [ ] Extension icon, screenshots, description, support page бэлтгэх.
- [ ] Developer account болон 2-step verification бэлдэх.
- [ ] Privacy practices form бөглөх.
- [ ] Remote executable code байхгүйг баталгаажуулах.
- [ ] Store review test account/instructions бэлтгэх.
- [ ] Closed beta channel гаргах.
- [ ] Crash/latency metrics-ийг зөвшөөрөлтэй, anonymous байдлаар цуглуулах.
- [ ] 20–50 хэрэглэгчийн beta feedback авах.
- [ ] Review blocker-уудыг засаж public release хийх.

## Phase 8 — Cloud mode (дараагийн шат)

- [ ] GPU-гүй хэрэглэгчид зориулсан optional cloud translation/transcription.
- [ ] Authentication, account deletion болон session management.
- [ ] Usage limits, billing болон subscription.
- [ ] Encrypted transport, rate limiting, abuse protection.
- [ ] Region, retention, deletion болон cost controls.
- [ ] Local/cloud mode сонголтыг хэрэглэгчид тодорхой харуулах.

## Release gates

### Windows beta бэлэн гэж үзэх нөхцөл

- [ ] Шинэ Windows computer дээр terminal ашиглахгүй сууж ажиллана.
- [ ] Companion болон extension бие биеэ автоматаар олно.
- [ ] English timed transcript-тай видео дээр median subtitle latency 1.5 секундээс бага.
- [ ] Transcript байхгүй видео audio fallback-аар ажиллана.
- [ ] Pause, seek, refresh, browser restart-д sync алдагдахгүй.
- [ ] Алдаа гарвал UI дээр засах боломжтой тайлбар гарна.

### Store release бэлэн гэж үзэх нөхцөл

- [ ] Privacy/consent flow бүрэн.
- [ ] Installer code signing хийгдсэн.
- [ ] Automated test, clean install, upgrade, uninstall тест амжилттай.
- [ ] Beta үеийн crash-free session 99%+.
- [ ] Chrome Web Store review шаардлагууд хангагдсан.

## Хэрэглэгч/эзэмшигчээс зайлшгүй шаардлагатай зүйлс

- [ ] Windows code-signing certificate.
- [ ] Chrome Web Store developer account.
- [ ] Privacy policy байрлуулах public domain/website.
- [ ] Store listing-ийн нэр, logo, screenshots, support email.
- [ ] Cloud mode хийх үед provider account, billing болон төсөв.
- [ ] Voice cloning хийх бол дуу хоолой эзэмшигчийн баримтжуулсан зөвшөөрөл.

## Implementation order

1. Desktop companion skeleton + tray.
2. Server/Ollama/model/FFmpeg health manager.
3. Windows installer болон clean-machine test.
4. Extension onboarding/repair UI.
5. Timed transcript reliability/latency.
6. Tab audio + VAD + streaming Whisper.
7. AI voice sync/quality.
8. Privacy, beta, Chrome Web Store.
9. Optional cloud mode.

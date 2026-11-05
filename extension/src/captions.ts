export type CapturedCaption = {
  start: number;
  end: number;
  text: string;
};

function formatTimestamp(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000).toString().padStart(2, "0");
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000).toString().padStart(2, "0");
  const remainingSeconds = Math.floor((milliseconds % 60_000) / 1000).toString().padStart(2, "0");
  const remainingMilliseconds = (milliseconds % 1000).toString().padStart(3, "0");
  return `${hours}:${minutes}:${remainingSeconds}.${remainingMilliseconds}`;
}

export function captionsToVtt(captions: readonly CapturedCaption[]) {
  if (!captions.length) throw new Error("Бичлэгийн хугацаанд харагдсан хадмал олдсонгүй. YouTube CC асааж дахин оролдоно уу.");

  const cues = captions.map(({ start, end, text }, index) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !text.trim()) {
      throw new Error("YouTube хадмалын хугацаа эсвэл текст буруу байна.");
    }
    const safeText = text.trim()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `${index + 1}\n${formatTimestamp(start)} --> ${formatTimestamp(end)}\n${safeText}`;
  });

  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

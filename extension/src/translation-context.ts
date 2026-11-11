export type ContextCue = { text: string; translatedText?: string };

// Match the server's 5,000 character limit, retaining the nearest dialogue.
export function contextualSegments(text: string, history: readonly ContextCue[]) {
  let remaining = 5000 - text.length;
  const context: ContextCue[] = [];
  for (const cue of history.slice(-2).reverse()) {
    if (cue.text === text) continue;
    const length = cue.text.length + (cue.translatedText?.length ?? 0);
    if (length > remaining) break;
    context.unshift(cue);
    remaining -= length;
  }
  return [...context.map((cue, index) => ({
    id: `context-${index}`, text: cue.text,
    ...(cue.translatedText ? { contextTranslation: cue.translatedText } : {}),
  })), { id: "current", text }];
}

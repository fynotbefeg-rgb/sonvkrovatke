// Conservative layout for RomanFactoryV1 (pure; no React). Not face detection:
// fixed bands chosen from control stills of talking-head sources where face + microphone
// occupy roughly the middle 18–70% of the frame height. Re-check stills for new framing.

export const CAPTION_LINE_HEIGHT = 1.12;
// Average advance of Golos Text Black, in em, measured conservatively for Cyrillic.
export const CHAR_EM = 0.62;
export const CAPTION_FONT = { max: 92, min: 52, maxLines: 2 } as const;

export const conservativeLayout = {
  topInset: 20, // px below safeZone.top
  topBandHeight: 330, // accents live in the top band: safeZone.top + 20 … ≈ 550 px (cap level, above the eyes)
  captionLift: 40, // px above safeZone.bottom; two caption lines end ≈ 1560 px, below the microphone
  zoomScale: 1.05,
  zoomOrigin: "50% 40%",
} as const;

const width = (text: string, fontSize: number) => text.length * CHAR_EM * fontSize;

/** Greedy line wrapping with the same estimate the renderer budget uses. */
export function wrapLines(words: string[], fontSize: number, maxWidth: number): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  for (const word of words) {
    const candidate = [...line, word].join(" ");
    if (line.length > 0 && width(candidate, fontSize) > maxWidth) {
      lines.push(line);
      line = [word];
    } else {
      line.push(word);
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Largest font size (step 2 px) where every word fits one line and the page fits ≤2 lines. */
export function captionFontSize(words: string[], maxWidth: number): number {
  for (let size = CAPTION_FONT.max; size > CAPTION_FONT.min; size -= 2) {
    const longest = Math.max(...words.map((w) => width(w, size)));
    if (longest <= maxWidth && wrapLines(words, size, maxWidth).length <= CAPTION_FONT.maxLines) return size;
  }
  return CAPTION_FONT.min;
}

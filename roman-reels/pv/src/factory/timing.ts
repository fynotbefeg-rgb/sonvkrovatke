// Pure animation timing for RomanFactoryV1 (no React/Remotion imports).
// Remotion interpolate needs a strictly increasing inputRange; Director may legally
// shorten an accent (the next accent trims its hold), so fades must scale to the event.

/** Nominal fade lengths, seconds, used by RomanFactoryV1. */
export const FADES = {
  accent: { in: 0.22, out: 0.25 },
  zoom: { in: 0.6, out: 0.6 },
} as const;

/** Share of an event that fade-in + fade-out may take together; the rest stays fully visible. */
export const MAX_FADE_SHARE = 0.8;

/**
 * Keyframes [start, fullIn, fullOut, end] for a 0→1→1→0 envelope.
 * Fades keep their nominal length when the event is long enough; otherwise both shrink
 * proportionally so fadeIn + fadeOut ≤ 80% of the event. Returns null when floating-point
 * precision cannot give four strictly increasing points (event shorter than any frame);
 * the caller then shows the event without fades.
 */
export function fadeKeyframes(
  start: number, end: number, fadeIn: number, fadeOut: number,
): [number, number, number, number] | null {
  const values = [start, end, fadeIn, fadeOut];
  if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) throw new Error("Non-finite animation time");
  if (end <= start) throw new Error("Animation event must have positive length");
  if (fadeIn <= 0 || fadeOut <= 0) throw new Error("Fade lengths must be positive");
  const length = end - start;
  const scale = Math.min(1, (MAX_FADE_SHARE * length) / (fadeIn + fadeOut));
  const points: [number, number, number, number] = [start, start + fadeIn * scale, end - fadeOut * scale, end];
  for (let i = 1; i < points.length; i++) if (!(points[i] > points[i - 1])) return null;
  return points;
}

/** True when an inputRange is acceptable for Remotion interpolate. */
export const strictlyIncreasing = (points: readonly number[]) =>
  points.every((p, i) => Number.isFinite(p) && (i === 0 || p > points[i - 1]));

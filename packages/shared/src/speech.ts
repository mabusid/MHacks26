// Text-to-speech cleanup: everything Mission Control says (Grok verbatim lines, template hints, browser
// speechSynthesis) goes through `speakable` so it sounds like a person talking — no parentheses, no symbols.
// Captions use `noParens`: the same words, but symbols like CO₂ and °C stay readable.

/** Parenthetical content that is a number/conversion ("94 K") rather than a source ("LCROSS"). */
const NUMERIC = /^[~−-]?\d/;

/** Captions: parentheses rewritten as spoken phrases (same words the voice says), symbols kept for reading. */
export function noParens(text: string): string {
  return tidy(
    text
      // "craters (LCROSS)." → "craters, according to LCROSS." · "−179 °C (94 K)" → "−179 °C, or 94 K"
      .replace(/\s*\(([^()]*)\)/g, (_, inner: string) => {
        const t = inner.trim();
        if (!t) return '';
        return NUMERIC.test(t) ? `, or ${t},` : `, according to ${t},`;
      })
      .replace(/[()[\]{}]/g, '')
  );
}

/** Everything spoken aloud: no parentheses, and symbols read as words. */
export function speakable(text: string): string {
  return tidy(
    noParens(text)
      .replace(/~\s*/g, 'about ')
      .replace(/(\d)\s*×/g, '$1 times')
      .replace(/×/g, ' times ')
      .replace(/−\s*(?=\d)/g, 'minus ')
      .replace(/(\d)\s*°C\b/g, '$1 degrees Celsius')
      .replace(/(\d)\s*K\b/g, '$1 kelvin')
      .replace(/(\d)\s*mSv\/day/g, '$1 millisieverts a day')
      .replace(/(\d)\s*mSv\b/g, '$1 millisieverts')
      .replace(/(\d)\s*m\/s²/g, '$1 meters per second squared')
      .replace(/(\d)\s*CU\b/g, '$1 cargo units')
      .replace(/CO₂/g, 'C O 2')
      .replace(/O₂/g, 'oxygen')
      .replace(/[“”"]/g, '')
      .replace(/\s*[—–]\s*/g, ', ')
  );
}

/** Tidy punctuation left behind by the rewrites. */
function tidy(text: string): string {
  const s = text
    .replace(/,\s*([.!?;:])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s.endsWith(',') ? `${s.slice(0, -1)}.` : s;
}

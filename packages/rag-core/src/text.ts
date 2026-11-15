export const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by
can could did do does doing down during each few for from further had has have having he her here hers herself him himself his
how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours
ourselves out over own same she should so some such than that the their theirs them themselves then there these they this
those through to too under until up very was we were what when where which while who whom why will with would you your yours
yourself yourselves called known used use uses using example examples called many much may might must one two three first second
new however therefore thus also often usually include includes including within without whether between based like via e.g i.e etc
does what's explain describe define`.split(/\s+/),
);

/** Lowercase word tokens with stopwords removed. */
export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9-]{1,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

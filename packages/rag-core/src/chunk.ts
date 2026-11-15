import { splitSentences, wordCount } from "./text.js";

export interface ChildChunk {
  content: string;
}
export interface ParentChunk {
  heading: string;
  content: string;
  children: ChildChunk[];
}

export interface ChunkOptions {
  parentWords?: number;
  childWords?: number;
}

interface Section {
  heading: string;
  body: string;
}

/** Splits on markdown headings (or short title-like lines) so chunks never straddle two topics. */
export function splitSections(text: string, fallbackHeading: string): Section[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const sections: Section[] = [];
  let heading = fallbackHeading;
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) sections.push({ heading, body });
    buf = [];
  };
  for (const line of lines) {
    const md = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (md) {
      flush();
      heading = md[1]!.trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

/** Packs sentences into groups of roughly `limit` words, never splitting a sentence. */
function pack(sentences: string[], limit: number): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let n = 0;
  for (const s of sentences) {
    const w = wordCount(s);
    if (n > 0 && n + w > limit) {
      out.push(cur.join(" "));
      cur = [];
      n = 0;
    }
    cur.push(s);
    n += w;
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

/**
 * Parent/child ("small-to-big") chunking. Small children (~60 words) are embedded so matches are
 * precise; the parent (~180 words) is what the model reads, so it gets enough surrounding context.
 * Small parents keep prompts short, which matters a lot on CPU-only local models.
 */
export function chunkDocument(text: string, title: string, opts: ChunkOptions = {}): ParentChunk[] {
  const parentWords = opts.parentWords ?? 180;
  const childWords = opts.childWords ?? 60;
  const parents: ParentChunk[] = [];
  for (const section of splitSections(text, title)) {
    const paragraphs = section.body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    const sentences = paragraphs.flatMap((p) => splitSentences(p.replace(/^[-*]\s+/, "")));
    for (const content of pack(sentences, parentWords)) {
      const children = pack(splitSentences(content), childWords).map((c) => ({ content: c }));
      parents.push({ heading: section.heading, content, children });
    }
  }
  return parents;
}

/** The "contextual retrieval" prefix embedded with each child, so a chunk knows where it came from. */
export const contextLine = (docTitle: string, heading: string) =>
  heading && heading !== docTitle ? `${docTitle} › ${heading}` : docTitle;

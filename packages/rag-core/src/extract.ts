import { readFile } from "node:fs/promises";

/** Reads an uploaded file as plain text. PDFs are parsed with unpdf (pure JS, no native deps). */
export async function readDocument(filePath: string, mime: string): Promise<string> {
  const buf = await readFile(filePath);
  if (mime === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join("\n\n");
  }
  return buf.toString("utf8");
}

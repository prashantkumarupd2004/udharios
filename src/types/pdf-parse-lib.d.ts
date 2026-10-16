// pdf-parse ka main entry (index.js) me debug code hai jo bundled env
// (Vercel/Next.js) me './test/data/05-versions-space.pdf' dhoondta hai aur
// ENOENT deta hai — isliye seedha lib/pdf-parse.js import karte hain.
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string
    numpages: number
    numrender: number
    info: Record<string, unknown>
    metadata: unknown
    version: string
  }
  const pdfParse: (buffer: Buffer) => Promise<PdfParseResult>
  export default pdfParse
}

/**
 * Minimal, DOM-free ambient types for the Node-friendly legacy pdfjs build.
 *
 * pdfjs-dist ships full types for its main entry only (no `exports` map), and
 * those types drag in browser/DOM lib references. We import the legacy build for
 * Node and declare just the slice of the API this package uses, keeping the
 * surface controlled and free of DOM dependencies.
 */
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export interface TextItem {
    str: string;
    /** Text matrix `[a, b, c, d, e, f]`; `e`/`f` are the glyph-run origin. */
    transform: number[];
    width: number;
    height: number;
    fontName: string;
    hasEOL?: boolean;
  }

  export interface TextMarkedContent {
    type: string;
  }

  export interface TextContent {
    items: Array<TextItem | TextMarkedContent>;
  }

  export interface PageViewport {
    width: number;
    height: number;
  }

  export interface OperatorList {
    fnArray: number[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    argsArray: any[];
  }

  export interface PdfImage {
    width: number;
    height: number;
    kind?: number;
    data?: Uint8Array | Uint8ClampedArray;
  }

  export interface ObjStore {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(id: string, callback?: (obj: any) => void): any;
    has(id: string): boolean;
  }

  export interface PDFPageProxy {
    getViewport(params: { scale: number }): PageViewport;
    getTextContent(): Promise<TextContent>;
    getOperatorList(): Promise<OperatorList>;
    objs: ObjStore;
    commonObjs: ObjStore;
    /** `[x1, y1, x2, y2]` page box in PDF units. */
    view: number[];
    cleanup(): void;
  }

  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    destroy(): Promise<void>;
  }

  export interface DocumentInitParameters {
    data?: Uint8Array | ArrayBuffer;
    useSystemFonts?: boolean;
    isEvalSupported?: boolean;
    disableFontFace?: boolean;
    verbosity?: number;
    standardFontDataUrl?: string;
    useWorkerFetch?: boolean;
  }

  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>;
    destroy(): Promise<void>;
  }

  export function getDocument(src: DocumentInitParameters): PDFDocumentLoadingTask;

  export const OPS: Record<string, number>;
  export const VerbosityLevel: { ERRORS: number; WARNINGS: number; INFOS: number };
}

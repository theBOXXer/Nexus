import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

export interface ExtractionResult {
  text: string;
  pageCount?: number;
}

export function getSupportedTypes(): string {
  return '.pdf,.csv,.txt,.md,.docx';
}

export function getDocPreviewText(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'PDF document';
  if (ext === 'csv') return 'Spreadsheet';
  if (ext === 'docx') return 'Word document';
  if (ext === 'md') return 'Markdown';
  return 'Text file';
}

export async function extractFromFile(file: File): Promise<ExtractionResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'pdf':
      return extractPDF(file);
    case 'csv':
      return extractCSV(file);
    case 'txt':
    case 'md':
      return extractText(file);
    case 'docx':
      return extractDocx(file);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

async function extractPDF(file: File): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: { str?: string }) => (item.str || '')).join(' ');
    pages.push(text);
  }

  return { text: pages.join('\n\n'), pageCount: pdf.numPages };
}

async function extractCSV(file: File): Promise<ExtractionResult> {
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { text };

  const rows = lines.map((line) => {
    const cols: string[] = [];
    let col = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cols.push(col);
        col = '';
      } else {
        col += ch;
      }
    }
    cols.push(col);
    return cols;
  });

  if (rows.length === 0) return { text };

  const maxCols = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => [...r, ...Array(maxCols - r.length).fill('')]);

  const md = [
    '| ' + padded[0].map((c) => c || ' ').join(' | ') + ' |',
    '| ' + padded[0].map(() => '---').join(' | ') + ' |',
    ...padded.slice(1).map((r) => '| ' + r.map((c) => c || ' ').join(' | ') + ' |'),
  ].join('\n');

  return { text: md, pageCount: rows.length - 1 };
}

async function extractText(file: File): Promise<ExtractionResult> {
  const text = await file.text();
  return { text };
}

async function extractDocx(file: File): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return { text: result.value };
}

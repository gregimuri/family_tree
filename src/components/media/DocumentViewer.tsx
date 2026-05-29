import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { MediaItem } from '../../types';
import './MediaViewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export function DocumentViewer({ url, media }: { url: string; media: MediaItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageSize, setPageSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdf = await pdfjs.getDocument(url).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setPageSize({ w: viewport.width, h: viewport.height });
      await page.render({ canvas, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="document-viewer">
      <canvas ref={canvasRef} />
      {media.documentRegions?.map((r, i) => (
        <div
          key={i}
          className="doc-region"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`,
          }}
          title={r.transcription}
        >
          <div className="doc-region-text">{r.transcription}</div>
        </div>
      ))}
      {pageSize.w === 0 && <p>Загрузка документа…</p>}
    </div>
  );
}

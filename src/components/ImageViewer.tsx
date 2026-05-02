import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, Minus, Download } from 'lucide-react';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function ImageViewer({ src, alt, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const pinchStartRef = useRef<{ dist: number; scale: number; midX: number; midY: number; offX: number; offY: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; offX: number; offY: number } | null>(null);
  const lastTapRef = useRef(0);

  const clampScale = (v: number) => Math.min(5, Math.max(0.25, v));

  const zoomIn = () => setScale((s) => clampScale(s * 1.4));
  const zoomOut = () => setScale((s) => clampScale(s / 1.4));

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => clampScale(s + delta));
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === '+' || e.key === '=') zoomIn();
    if (e.key === '-') zoomOut();
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Mouse ──
  function handleMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return;
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }

  function handleMouseUp() { setDragging(false); }

  function handleDoubleClick() { resetZoom(); }

  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 300) { resetZoom(); }
    lastTapRef.current = now;
  }

  // ── Touch ──
  function handleTouchStart(e: React.TouchEvent) {
    const touches = e.touches;
    if (touches.length === 2) {
      // Pinch start
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      pinchStartRef.current = {
        dist: Math.hypot(dx, dy),
        scale,
        midX: (touches[0].clientX + touches[1].clientX) / 2,
        midY: (touches[0].clientY + touches[1].clientY) / 2,
        offX: offset.x,
        offY: offset.y,
      };
    } else if (touches.length === 1 && scale > 1) {
      // Pan start
      panStartRef.current = {
        x: touches[0].clientX,
        y: touches[0].clientY,
        offX: offset.x,
        offY: offset.y,
      };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    const touches = e.touches;
    if (touches.length === 2 && pinchStartRef.current) {
      const p = pinchStartRef.current;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const newScale = clampScale((newDist / p.dist) * p.scale);

      const midX = (touches[0].clientX + touches[1].clientX) / 2;
      const midY = (touches[0].clientY + touches[1].clientY) / 2;
      const scaleRatio = newScale / p.scale;
      const newOffX = p.offX + (midX - p.midX) - (midX - p.midX) * scaleRatio;
      const newOffY = p.offY + (midY - p.midY) - (midY - p.midY) * scaleRatio;

      setScale(newScale);
      setOffset({ x: newOffX, y: newOffY });
    } else if (touches.length === 1 && panStartRef.current) {
      const p = panStartRef.current;
      setOffset({
        x: p.offX + touches[0].clientX - p.x,
        y: p.offY + touches[0].clientY - p.y,
      });
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    pinchStartRef.current = null;
    panStartRef.current = null;
    if (e.touches.length === 0 && scale < 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    }
  }

  async function handleDownload() {
    const token = localStorage.getItem('nexus_token');
    const proxyUrl = `/api/download-image?src=${encodeURIComponent(src)}`;
    try {
      const res = await fetch(proxyUrl, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = alt || 'image.png';
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(src, '_blank');
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="h-12 flex items-center justify-between px-4 text-white flex-shrink-0">
        <span className="text-sm text-white/60 truncate max-w-[40%]">{alt}</span>
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} className="w-8 h-8 md:w-8 md:h-8 w-10 h-10 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors" title="Zoom out">
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/50 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="w-10 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors" title="Zoom in">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={resetZoom} className="w-10 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-xs font-bold" title="Reset zoom">
            1:1
          </button>
          <button onClick={handleDownload} className="w-10 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors" title="Download image">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="w-10 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center"
        style={{ touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onClick={handleDoubleTap}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
            maxWidth: '90%',
            maxHeight: '85%',
            transition: dragging || pinchStartRef.current ? 'none' : 'transform 0.15s ease-out',
            objectFit: 'contain',
          }}
          className="rounded-lg select-none"
        />
      </div>
    </div>
  );
}

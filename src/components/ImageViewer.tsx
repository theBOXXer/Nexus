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

  const clampScale = (v: number) => Math.min(5, Math.max(0.25, v));

  const zoomIn = () => setScale((s) => clampScale(s * 1.4));
  const zoomOut = () => setScale((s) => clampScale(s / 1.4));

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

  function handleMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return;
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }

  function handleMouseUp() {
    setDragging(false);
  }

  function handleDoubleClick() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = src;
    a.download = alt || 'image';
    a.click();
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="h-12 flex items-center justify-between px-4 text-white flex-shrink-0">
        <span className="text-sm text-white/60 truncate max-w-[60%]">{alt}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/50 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={zoomIn}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleDoubleClick}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-xs font-bold"
            title="Reset zoom"
          >
            1:1
          </button>
          <button
            onClick={handleDownload}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Download image"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onDoubleClick={handleDoubleClick}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
            maxWidth: '90%',
            maxHeight: '85%',
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
            objectFit: 'contain',
          }}
          className="rounded-lg select-none"
        />
      </div>
    </div>
  );
}

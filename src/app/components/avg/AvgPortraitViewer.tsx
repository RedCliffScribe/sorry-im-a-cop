import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from 'react';
import { createPortal } from 'react-dom';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface AvgPortraitViewerProps {
  src: string;
  alt: string;
  title: string;
  onClose: () => void;
}

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
}

export function AvgPortraitViewer({
  src,
  alt,
  title,
  onClose
}: AvgPortraitViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<DragState | null>(null);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setZoom((current) => clampZoom(current + ZOOM_STEP));
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setZoom((current) => clampZoom(current - ZOOM_STEP));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomBy = (delta: number) => {
    setZoom((current) => clampZoom(current + delta));
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    const dragging = dragState.current;
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    setPan({
      x: dragging.originX + event.clientX - dragging.startX,
      y: dragging.originY + event.clientY - dragging.startY
    });
  };

  const stopDragging = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragState.current = null;
  };

  const fullscreenElement = document.fullscreenElement;
  const portalHost =
    fullscreenElement instanceof HTMLElement ? fullscreenElement : document.body;

  return createPortal(
    <div
      className="avg-portrait-viewer-backdrop"
      data-avg-no-advance
      role="dialog"
      aria-modal="true"
      aria-label={`${title}立绘大图`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <span className="visually-hidden">
        滚轮、触控板或底部按钮可以缩放立绘；拖动立绘可查看细节，双击恢复原始大小。
      </span>
      <button
        type="button"
        className="avg-portrait-viewer-close"
        aria-label="关闭立绘大图"
        autoFocus
        onClick={onClose}
      >
        ×
      </button>

      <div
        className="avg-portrait-viewer-canvas"
        onWheel={handleWheel}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <img
          className="avg-portrait-viewer-artwork"
          src={src}
          alt={alt}
          draggable="false"
          title="拖动查看细节，双击恢复 100%"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onDoubleClick={resetView}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
          }}
        />
      </div>

      <div
        className="avg-portrait-viewer-zoom-controls"
        role="group"
        aria-label="立绘缩放控制"
      >
        <button
          type="button"
          aria-label="缩小立绘"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomBy(-ZOOM_STEP)}
        >
          −
        </button>
        <input
          type="range"
          aria-label="立绘缩放"
          min={MIN_ZOOM * 100}
          max={MAX_ZOOM * 100}
          step={ZOOM_STEP * 100}
          value={zoom * 100}
          onChange={(event) => setZoom(clampZoom(Number(event.target.value) / 100))}
        />
        <button
          type="button"
          aria-label="放大立绘"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          +
        </button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
      </div>
    </div>,
    portalHost
  );
}

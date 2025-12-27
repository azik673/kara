
import React, { useRef, useEffect, useState } from 'react';
import { ToolType, BrushSettings } from '../types';

interface DrawingCanvasProps {
  backgroundImage: string | null;
  overlayImage: string | null;
  onOverlayProcessed: () => void;
  tool: ToolType;
  brushSettings: BrushSettings;
  onCanvasUpdate: (dataUrl: string) => void;
  className?: string;
  mode?: 'default' | 'mask'; // 'mask' outputs Black/White only
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  backgroundImage,
  overlayImage,
  onOverlayProcessed,
  tool,
  brushSettings,
  onCanvasUpdate,
  className,
  mode = 'default'
}) => {
  // We use two canvases: one for the background (uploaded image) and one for the drawing/overlays.
  // This allows the user to erase their drawing without erasing the background photo.
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [fgContext, setFgContext] = useState<CanvasRenderingContext2D | null>(null);
  const [bgContext, setBgContext] = useState<CanvasRenderingContext2D | null>(null);

  // Initialize Canvases
  useEffect(() => {
    const initCanvas = (canvas: HTMLCanvasElement, setCtx: (c: CanvasRenderingContext2D) => void) => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      setCtx(ctx);

      const dpr = window.devicePixelRatio || 1;
      // We rely on the parent container size. 
      // Ideally this should update on resize, but for now we init once on mount.
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };

    if (bgCanvasRef.current) initCanvas(bgCanvasRef.current, setBgContext);
    if (fgCanvasRef.current) initCanvas(fgCanvasRef.current, setFgContext);

  }, []);

  // Helper to combine layers and emit update
  const emitComposite = () => {
    if (!bgCanvasRef.current || !fgCanvasRef.current) return;

    // Create a temp canvas to merge both
    const canvas = document.createElement('canvas');
    canvas.width = bgCanvasRef.current.width;
    canvas.height = bgCanvasRef.current.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (mode === 'mask') {
      // MASK MODE: Output Black Background + White Strokes (FG)
      // We ignore the BG image in the output, as it's just for reference.
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw FG
      ctx.drawImage(fgCanvasRef.current, 0, 0);
    } else {
      // DEFAULT MODE: WYSIWYG Composite
      // Fill white background (good for transparent PNG export)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw BG
      ctx.drawImage(bgCanvasRef.current, 0, 0);
      // Draw FG
      ctx.drawImage(fgCanvasRef.current, 0, 0);
    }

    onCanvasUpdate(canvas.toDataURL('image/png'));
  };

  // Load Background Image to BG Layer
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    const ctx = bgContext;
    if (!canvas || !ctx) return;

    if (backgroundImage) {
      const img = new Image();
      img.src = backgroundImage;
      img.onload = () => {
        // Clear bg canvas
        ctx.clearRect(0, 0, canvas.width / ctx.getTransform().a, canvas.height / ctx.getTransform().d); // Clear using logic size

        const dpr = window.devicePixelRatio || 1;
        const canvasWidth = canvas.width / dpr;
        const canvasHeight = canvas.height / dpr;

        const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
        const x = (canvasWidth / 2) - (img.width / 2) * scale;
        const y = (canvasHeight / 2) - (img.height / 2) * scale;

        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // Clear FG canvas when a NEW background is loaded (fresh start)
        if (fgCanvasRef.current && fgContext) {
          fgContext.clearRect(0, 0, fgCanvasRef.current.width, fgCanvasRef.current.height);
        }

        emitComposite();
      };
    } else {
      // No background image, clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      emitComposite();
    }
  }, [backgroundImage, bgContext, mode]); // Re-run if mode changes

  // Handle Overlay Image (Stamps onto FG Layer)
  useEffect(() => {
    const canvas = fgCanvasRef.current;
    const ctx = fgContext;
    if (!canvas || !ctx || !overlayImage) return;

    const img = new Image();
    img.src = overlayImage;
    img.onload = () => {
      const dpr = window.devicePixelRatio || 1;
      const canvasWidth = canvas.width / dpr;
      const canvasHeight = canvas.height / dpr;

      const scale = Math.min((canvasWidth * 0.5) / img.width, (canvasHeight * 0.5) / img.height);
      const finalScale = scale < 1 ? scale : 1;

      const w = img.width * finalScale;
      const h = img.height * finalScale;
      const x = (canvasWidth - w) / 2;
      const y = (canvasHeight - h) / 2;

      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(img, x, y, w, h);
      ctx.globalCompositeOperation = prevOp;

      emitComposite();
      onOverlayProcessed();
    };
  }, [overlayImage, fgContext, onOverlayProcessed]);

  // Configure Brush
  useEffect(() => {
    if (!fgContext) return;

    if (tool === ToolType.MARKER) {
      fgContext.strokeStyle = brushSettings.color;
      fgContext.lineWidth = brushSettings.size * 2;
      fgContext.globalAlpha = 0.5;
      fgContext.globalCompositeOperation = 'source-over';

    } else {
      // BRUSH
      fgContext.strokeStyle = brushSettings.color;
      fgContext.lineWidth = brushSettings.size;
      fgContext.globalAlpha = brushSettings.opacity;
      fgContext.globalCompositeOperation = 'source-over';
    }
  }, [brushSettings, tool, fgContext]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (tool === ToolType.MOVE) return;
    if (!fgContext) return;

    setIsDrawing(true);
    const { offsetX, offsetY } = getCoordinates(e);
    fgContext.beginPath();
    fgContext.moveTo(offsetX, offsetY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (tool === ToolType.MOVE) return;
    if (!isDrawing || !fgContext) return;
    const { offsetX, offsetY } = getCoordinates(e);
    fgContext.lineTo(offsetX, offsetY);
    fgContext.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing || !fgContext) return;
    fgContext.closePath();
    setIsDrawing(false);
    emitComposite();
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!fgCanvasRef.current) return { offsetX: 0, offsetY: 0 };

    const canvas = fgCanvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const scaleX = canvas.offsetWidth / rect.width;
    const scaleY = canvas.offsetHeight / rect.height;

    return {
      offsetX: (clientX - rect.left) * scaleX,
      offsetY: (clientY - rect.top) * scaleY
    };
  };

  const getCursorStyle = () => {
    if (tool === ToolType.MOVE) return 'cursor-grab';

    return 'cursor-crosshair';
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Background Layer (Passive) */}
      <canvas
        ref={bgCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      />

      {/* Foreground Layer (Interactive) */}
      <canvas
        ref={fgCanvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className={`absolute inset-0 w-full h-full touch-none ${getCursorStyle()}`}
        style={{ zIndex: 10 }}
      />
    </div>
  );
};

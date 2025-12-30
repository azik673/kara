import React, { useRef, useEffect, useState, useMemo } from 'react';

interface Point {
  x: number;
  y: number;
}

export type CurveChannel = 'master' | 'red' | 'green' | 'blue';

interface CurvesControlProps {
  points: Point[];
  onChange: (points: Point[]) => void;
  channel: CurveChannel;
  histogramData?: number[]; // Normalized 0-1
  width?: number;
  height?: number;
}

// Monotonic Cubic Spline Interpolation (Same as backend)
const getSplinePoints = (points: Point[], numSteps: number = 256): Point[] => {
  if (points.length < 2) return [];
  
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const n = sorted.length;
  
  const m = new Array(n).fill(0);
  const dx = new Array(n - 1).fill(0);
  const dy = new Array(n - 1).fill(0);
  const slope = new Array(n - 1).fill(0);

  for (let i = 0; i < n - 1; i++) {
    dx[i] = sorted[i + 1].x - sorted[i].x;
    dy[i] = sorted[i + 1].y - sorted[i].y;
    slope[i] = dy[i] / dx[i];
  }

  m[0] = slope[0];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m[i] = 0;
    } else {
      const common = dx[i - 1] + dx[i];
      m[i] = (3 * common) / ((common + dx[i]) / slope[i - 1] + (common + dx[i - 1]) / slope[i]);
    }
  }
  m[n - 1] = slope[n - 2];

  const result: Point[] = [];
  let pIndex = 0;
  for (let i = 0; i < numSteps; i++) {
    const x = i / (numSteps - 1);
    
    while (pIndex < n - 1 && x > sorted[pIndex + 1].x) {
      pIndex++;
    }
    
    let y;
    if (x <= sorted[0].x) {
      y = sorted[0].y;
    } else if (x >= sorted[n - 1].x) {
      y = sorted[n - 1].y;
    } else {
      const p0 = sorted[pIndex];
      const p1 = sorted[pIndex + 1];
      const h = p1.x - p0.x;
      const t = (x - p0.x) / h;
      const t2 = t * t;
      const t3 = t2 * t;

      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      y = h00 * p0.y + h10 * h * m[pIndex] + h01 * p1.y + h11 * h * m[pIndex + 1];
    }
    result.push({ x, y: Math.max(0, Math.min(1, y)) });
  }
  return result;
};

export const CurvesControl: React.FC<CurvesControlProps> = ({
  points,
  onChange,
  channel,
  histogramData,
  width = 280,
  height = 280,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const sortedPoints = useMemo(() => {
    return [...points].sort((a, b) => a.x - b.x);
  }, [points]);

  const toCanvasCoords = (p: Point) => ({
    x: p.x * width,
    y: (1 - p.y) * height,
  });

  const toNormalizedCoords = (x: number, y: number) => ({
    x: Math.max(0, Math.min(1, x / width)),
    y: Math.max(0, Math.min(1, 1 - y / height)),
  });

  const getChannelColor = () => {
    switch (channel) {
      case 'red': return '#ff4444';
      case 'green': return '#44ff44';
      case 'blue': return '#4444ff';
      default: return 'white';
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      ctx.moveTo((i / 4) * width, 0);
      ctx.lineTo((i / 4) * width, height);
      ctx.moveTo(0, (i / 4) * height);
      ctx.lineTo(width, (i / 4) * height);
    }
    ctx.stroke();

    // Histogram
    if (histogramData && histogramData.length > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(0, height);
      histogramData.forEach((val, i) => {
        const x = (i / (histogramData.length - 1)) * width;
        const y = height - val * height;
        ctx.lineTo(x, y);
      });
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    }

    // Diagonal Reference
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Spline Curve
    if (sortedPoints.length >= 2) {
      const splinePoints = getSplinePoints(sortedPoints, width); // One point per pixel width for smoothness
      
      ctx.strokeStyle = getChannelColor();
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const start = toCanvasCoords(splinePoints[0]);
      ctx.moveTo(start.x, start.y);

      for (let i = 1; i < splinePoints.length; i++) {
        const p = toCanvasCoords(splinePoints[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Control Points
    sortedPoints.forEach((p, i) => {
      const { x, y } = toCanvasCoords(p);
      const isHovered = i === hoveredIndex || i === draggingIndex;
      
      ctx.fillStyle = isHovered ? 'white' : 'rgba(0,0,0,0.5)';
      ctx.strokeStyle = isHovered ? getChannelColor() : 'white';
      ctx.lineWidth = 1.5;
      
      const size = 8;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    });

  }, [sortedPoints, width, height, histogramData, hoveredIndex, draggingIndex, channel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clickedIndex = sortedPoints.findIndex(p => {
      const cp = toCanvasCoords(p);
      return Math.abs(cp.x - x) < 10 && Math.abs(cp.y - y) < 10;
    });

    if (clickedIndex !== -1) {
      setDraggingIndex(clickedIndex);
    } else {
      const newPoint = toNormalizedCoords(x, y);
      const newPoints = [...sortedPoints, newPoint].sort((a, b) => a.x - b.x);
      onChange(newPoints);
      const newIndex = newPoints.findIndex(p => p.x === newPoint.x && p.y === newPoint.y);
      setDraggingIndex(newIndex);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (draggingIndex !== null) {
      const newPos = toNormalizedCoords(x, y);
      const isFirst = draggingIndex === 0;
      const isLast = draggingIndex === sortedPoints.length - 1;
      
      let finalX = newPos.x;
      let finalY = newPos.y;

      if (isFirst) finalX = 0;
      if (isLast) finalX = 1;

      // Constrain X between neighbors to maintain order
      if (!isFirst && !isLast) {
        const prevX = sortedPoints[draggingIndex - 1].x;
        const nextX = sortedPoints[draggingIndex + 1].x;
        // Add small buffer to prevent overlap
        finalX = Math.max(prevX + 0.02, Math.min(nextX - 0.02, finalX));
      }

      const newPoints = [...sortedPoints];
      newPoints[draggingIndex] = { x: finalX, y: finalY };
      onChange(newPoints);
    } else {
      const index = sortedPoints.findIndex(p => {
        const cp = toCanvasCoords(p);
        return Math.abs(cp.x - x) < 10 && Math.abs(cp.y - y) < 10;
      });
      setHoveredIndex(index !== -1 ? index : null);
    }
  };

  const handleMouseUp = () => {
    setDraggingIndex(null);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clickedIndex = sortedPoints.findIndex(p => {
      const cp = toCanvasCoords(p);
      return Math.abs(cp.x - x) < 10 && Math.abs(cp.y - y) < 10;
    });

    if (clickedIndex !== -1 && clickedIndex !== 0 && clickedIndex !== sortedPoints.length - 1) {
      const newPoints = sortedPoints.filter((_, i) => i !== clickedIndex);
      onChange(newPoints);
      setHoveredIndex(null);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="cursor-crosshair w-full h-full touch-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    />
  );
};

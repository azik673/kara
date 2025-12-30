import React, { useEffect, useRef, useState } from 'react';

interface HistogramProps {
    imageSrc: string;
    width?: number;
    height?: number;
    className?: string;
}

export const Histogram: React.FC<HistogramProps> = ({ imageSrc, width = 256, height = 100, className }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [histogramData, setHistogramData] = useState<number[]>(new Array(256).fill(0));

    useEffect(() => {
        if (!imageSrc) return;

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageSrc;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Resize for performance (we don't need full res for histogram)
            const scale = Math.min(1, 512 / Math.max(img.width, img.height));
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

            const counts = new Array(256).fill(0);
            for (let i = 0; i < imageData.length; i += 4) {
                // Simple luminance or RGB average
                const r = imageData[i];
                const g = imageData[i + 1];
                const b = imageData[i + 2];
                const val = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                counts[val]++;
            }

            // Normalize
            const max = Math.max(...counts);
            const normalized = counts.map(c => c / max);
            setHistogramData(normalized);
        };
    }, [imageSrc]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);
        
        // Draw Histogram
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(0, height);

        histogramData.forEach((val, i) => {
            const x = (i / 255) * width;
            const y = height - (val * height);
            ctx.lineTo(x, y);
        });

        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

    }, [histogramData, width, height]);

    return (
        <canvas 
            ref={canvasRef} 
            width={width} 
            height={height} 
            className={className}
        />
    );
};

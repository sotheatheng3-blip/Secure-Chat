import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  ExternalLink,
  Calendar,
  User,
  Image as ImageIcon
} from "lucide-react";

export interface GalleryItem {
  id: string;
  src: string;
  fileName: string;
  fileSize?: number;
  sender: string;
  timestamp: number;
  caption?: string;
  mediaType?: string;
}

interface ImageGalleryModalProps {
  isOpen: boolean;
  images: GalleryItem[];
  initialIndex?: number;
  onClose: () => void;
  themeAccentText?: string;
  themeAccentBg?: string;
}

export default function ImageGalleryModal({
  isOpen,
  images,
  initialIndex = 0,
  onClose,
  themeAccentText = "text-indigo-400",
  themeAccentBg = "bg-indigo-600"
}: ImageGalleryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const filmstripRef = useRef<HTMLDivElement>(null);
  const currentImage = images[currentIndex];

  // Sync initial index when modal opens
  useEffect(() => {
    if (isOpen) {
      const validIndex = Math.max(0, Math.min(initialIndex, images.length - 1));
      setCurrentIndex(validIndex);
      setZoomLevel(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, initialIndex, images.length]);

  // Reset zoom & pan when switching images
  useEffect(() => {
    setZoomLevel(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });

    // Center active thumbnail in filmstrip
    if (filmstripRef.current) {
      const activeThumb = filmstripRef.current.children[currentIndex] as HTMLElement;
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [currentIndex]);

  const handlePrev = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(prev - 0.5, 0.5);
      if (next <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleResetView = () => {
    setZoomLevel(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleDoubleClick = () => {
    if (zoomLevel > 1) {
      handleResetView();
    } else {
      setZoomLevel(2);
    }
  };

  // Pan / Drag handlers when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "+" || e.key === "=") {
        handleZoomIn();
      } else if (e.key === "-") {
        handleZoomOut();
      } else if (e.key === "0") {
        handleResetView();
      } else if (e.key.toLowerCase() === "r") {
        handleRotate();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  if (!isOpen || !currentImage) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex flex-col bg-slate-955/95 backdrop-blur-xl select-none animate-fadeIn overflow-hidden text-slate-100"
      onMouseUp={handleMouseUp}
    >
      {/* Top Header Controls Bar */}
      <header className="h-16 px-4 sm:px-6 flex items-center justify-between bg-slate-900/80 border-b border-white/10 shrink-0 z-20 backdrop-blur-md">
        {/* Left: Image Info & Counter */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-3 py-1 rounded-xl shrink-0">
            <ImageIcon className={`w-3.5 h-3.5 ${themeAccentText}`} />
            <span className="text-xs font-mono font-bold text-slate-200">
              {currentIndex + 1} / {images.length}
            </span>
          </div>

          <div className="min-w-0 flex flex-col">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-200 truncate max-w-xs sm:max-w-md" title={currentImage.fileName}>
              {currentImage.fileName || "Image"}
            </h3>
            <div className="flex items-center gap-3 text-[10px] text-slate-400 font-sans">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3 text-slate-500" />
                <span>@{currentImage.sender}</span>
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" />
                <span>{formatDate(currentImage.timestamp)}</span>
              </span>
              {currentImage.fileSize && (
                <span className="font-mono text-slate-500">
                  {formatFileSize(currentImage.fileSize)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Tools & Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center bg-slate-800/80 border border-slate-700/60 rounded-xl p-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono px-2 text-slate-300 min-w-12 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 4}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors ml-0.5 border-l border-slate-700"
              title="Reset view (0)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Rotate button */}
          <button
            type="button"
            onClick={handleRotate}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 rounded-xl transition-colors"
            title="Rotate 90° (R)"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* External link / open in new tab */}
          <a
            href={currentImage.src}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 rounded-xl transition-colors"
            title="Open in new window"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Download button */}
          <a
            href={currentImage.src}
            download={currentImage.fileName || "image"}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 rounded-xl transition-colors"
            title="Download image"
          >
            <Download className="w-4 h-4" />
          </a>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className={`p-2 text-white ${themeAccentBg} hover:opacity-90 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer ml-1`}
            title="Close gallery (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Viewport Container */}
      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center p-4"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onClick={(e) => {
          // If clicking the dark background outside and not dragging/zoomed
          if (e.target === e.currentTarget && zoomLevel === 1) {
            onClose();
          }
        }}
        style={{ cursor: zoomLevel > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
      >
        {/* Left Arrow Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer"
            title="Previous image (←)"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Right Arrow Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer"
            title="Next image (→)"
            aria-label="Next image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Center Display Image */}
        <div
          className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-100 ease-out select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel}) rotate(${rotation}deg)`
          }}
          onDoubleClick={handleDoubleClick}
        >
          <img
            src={currentImage.src}
            alt={currentImage.fileName || "Gallery image"}
            referrerPolicy="no-referrer"
            draggable={false}
            className="max-w-[85vw] max-h-[68vh] object-contain rounded-xl shadow-2xl border border-white/5 pointer-events-auto"
          />
        </div>

        {/* Caption overlay if present */}
        {currentImage.caption && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 max-w-xl bg-slate-900/85 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-2xl text-center text-xs text-slate-200 shadow-2xl pointer-events-none z-20">
            {currentImage.caption}
          </div>
        )}
      </div>

      {/* Bottom Filmstrip Carousel */}
      {images.length > 1 && (
        <div className="h-20 bg-slate-900/90 border-t border-white/10 px-4 flex items-center justify-center shrink-0 z-20 backdrop-blur-md">
          <div
            ref={filmstripRef}
            className="flex items-center gap-2 overflow-x-auto max-w-4xl py-2 px-1 custom-scrollbar"
          >
            {images.map((img, idx) => {
              const isActive = idx === currentIndex;
              return (
                <button
                  key={img.id || idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border transition-all cursor-pointer ${
                    isActive
                      ? `ring-2 ring-indigo-500 border-transparent scale-105 shadow-lg brightness-110`
                      : `border-slate-700/60 opacity-60 hover:opacity-100 hover:border-slate-500`
                  }`}
                  title={`${img.fileName} (${idx + 1}/${images.length})`}
                >
                  <img
                    src={img.src}
                    alt={img.fileName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {isActive && (
                    <div className="absolute inset-0 bg-indigo-500/10 pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Keyboard / Escape Hint */}
      <div className="hidden sm:block absolute bottom-2 right-4 text-[10px] text-slate-500 font-mono pointer-events-none z-30">
        Use arrows ← → to navigate • ESC to exit
      </div>
    </div>
  );
}

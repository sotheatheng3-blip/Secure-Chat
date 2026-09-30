import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, Mic, Download, ExternalLink, Cloud } from "lucide-react";

interface AudioPlayerProps {
  src: string; // Decrypted blob URL, data URI, or Google Drive URL
  duration?: number; // Pre-calculated duration in seconds if available
  fileName?: string;
  fileSize?: number;
}

// Convert Google Drive view URLs to direct downloadable/streamable audio URLs
function getStreamableAudioUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  // If it's a Google Drive link e.g. https://drive.google.com/file/d/FILE_ID/view...
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch && fileMatch[1]) {
    return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  }
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1] && url.includes("drive.google.com")) {
    return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
  }
  return url;
}

export default function AudioPlayer({ src, duration: initialDuration, fileName, fileSize }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isDriveFile, setIsDriveFile] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIsDriveFile(typeof src === "string" && src.includes("drive.google.com"));
    const streamUrl = getStreamableAudioUrl(src);
    const audio = new Audio(streamUrl);
    audioRef.current = audio;
    audio.playbackRate = playbackRate;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (initialDuration && initialDuration > 0) {
        setDuration(initialDuration);
      } else {
        // Fallback for Chrome WebM duration bug: seek to high number then reset
        audio.currentTime = 1e10;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = handleTimeUpdate;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setDuration(audio.duration);
          }
          audio.currentTime = 0;
        };
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = (e: Event) => {
      console.warn("Audio playback error notice:", e);
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.src = "";
    };
  }, [src, initialDuration]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn("Audio playback play request interrupted:", err);
        setIsPlaying(false);
      });
    }
  };

  const handleSeek = (percentage: number) => {
    if (!audioRef.current || !duration || duration <= 0) return;
    const targetTime = (percentage / 100) * duration;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const cyclePlaybackRate = () => {
    if (!audioRef.current) return;
    const rates = [1, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    audioRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time) || isNaN(time) || time < 0) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const effectiveDuration = duration > 0 ? duration : (initialDuration || 0);
  const progressPercentage = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  // Waveform bars
  const waveHeights = [12, 18, 10, 24, 16, 22, 28, 20, 14, 16, 24, 20, 18, 22, 14, 10, 16, 12, 20, 14];

  return (
    <div className="flex flex-col bg-slate-800/80 p-3 rounded-2xl border border-slate-700/60 w-72 max-w-full shadow-md select-none">
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 active:scale-95 transition-all text-white focus:outline-none cursor-pointer shadow-md shrink-0"
          title={isPlaying ? "Pause voice note" : "Play voice note"}
          aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current translate-x-0.5" />
          )}
        </button>

        {/* Waveform & Scrubber */}
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <div
            className="h-7 flex items-end gap-[3px] mb-1 px-1 cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const pct = (clickX / rect.width) * 100;
              handleSeek(Math.max(0, Math.min(100, pct)));
            }}
            title="Click to seek playback position"
          >
            {waveHeights.map((baseHeight, i) => {
              const barPercent = (i / waveHeights.length) * 100;
              const isPlayed = progressPercentage >= barPercent;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-full transition-all duration-150 ${
                    isPlayed
                      ? "bg-indigo-400 group-hover:bg-indigo-300"
                      : "bg-slate-600/80 group-hover:bg-slate-500"
                  } ${isPlaying && isPlayed ? "opacity-100" : "opacity-75"}`}
                  style={{
                    height: `${baseHeight}px`,
                  }}
                />
              );
            })}
          </div>

          {/* Time & Playback Controls */}
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 px-1">
            <span>{formatTime(currentTime)}</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={cyclePlaybackRate}
                className="px-1.5 py-0.5 rounded bg-slate-700/80 hover:bg-slate-600 text-[9px] font-bold text-slate-300 transition-colors cursor-pointer"
                title="Change playback speed"
              >
                {playbackRate}x
              </button>
              <span>{formatTime(effectiveDuration)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info: Google Drive sync indicator & details */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/40 text-[10px] text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <Mic className="w-3 h-3 text-indigo-400 shrink-0" />
          <span className="truncate max-w-[130px] font-medium text-slate-300">
            {fileName || "Voice Note"}
          </span>
          {fileSize && (
            <span className="text-slate-500 text-[9px]">
              • {formatFileSize(fileSize)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {isDriveFile ? (
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-950/50 border border-blue-500/30 text-blue-300 hover:text-white hover:bg-blue-900/60 transition-colors text-[9px] font-medium cursor-pointer"
              title="Stored in Google Drive - Click to open"
            >
              <Cloud className="w-2.5 h-2.5" />
              <span>Drive</span>
              <ExternalLink className="w-2 h-2" />
            </a>
          ) : (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-[9px]">
              <span>Audio</span>
            </span>
          )}

          {src && (
            <a
              href={getStreamableAudioUrl(src)}
              download={fileName || "voice-recording.webm"}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
              title="Download voice note"
              aria-label="Download voice note"
            >
              <Download className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

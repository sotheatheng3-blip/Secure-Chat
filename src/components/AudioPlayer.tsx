import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, Mic } from "lucide-react";

interface AudioPlayerProps {
  src: string; // Decrypted blob URL
}

export default function AudioPlayer({ src }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      // Revoke the blob URL to clear RAM
      try {
        URL.revokeObjectURL(src);
      } catch (e) {
        // Safe fail if already revoked
      }
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(err => console.error("Playback failed:", err));
      setIsPlaying(true);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const progressPercentage = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 bg-slate-800/80 p-3 rounded-2xl border border-slate-700/50 w-64 max-w-full">
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 transition-colors text-white focus:outline-none cursor-pointer"
        title={isPlaying ? "Pause" : "Play voice message"}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
      </button>

      <div className="flex-1 flex flex-col justify-center min-w-0">
        {/* Waveform Visualization */}
        <div className="h-6 flex items-end gap-[2px] mb-1 px-1">
          {Array.from({ length: 18 }).map((_, i) => {
            // Generate some static heights for waves
            const baseHeight = [12, 16, 8, 22, 14, 20, 24, 18, 12, 14, 22, 18, 16, 20, 10, 8, 14, 12][i] || 10;
            const isPlayed = progressPercentage > (i / 18) * 100;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-colors ${
                  isPlayed 
                    ? "bg-indigo-400" 
                    : "bg-slate-600"
                } ${isPlaying && isPlayed ? "wave-bar" : ""}`}
                style={{
                  height: `${baseHeight}px`,
                  animationDelay: `${i * 0.05}s`
                }}
              />
            );
          })}
        </div>

        {/* Playback Stats */}
        <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 px-1">
          <span className="flex items-center gap-1">
            <Mic className="w-3 h-3 text-indigo-400" />
            Voice Note
          </span>
          <span>
            {formatTime(currentTime)} / {formatTime(duration || 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

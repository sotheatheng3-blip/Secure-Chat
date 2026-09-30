import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Trash2, Send, Pause, Play, Loader2, AlertCircle, CloudUpload, StopCircle } from "lucide-react";

export interface VoiceRecorderProps {
  onSendVoice: (audioBlob: Blob, durationSeconds?: number) => Promise<void>;
  onRecordingStateChange?: (isRecording: boolean) => void;
  className?: string;
  themeAccentText?: string;
  themeAccentBg?: string;
}

// Determine best supported audio format in user's browser
function getOptimalAudioConfig(): { mimeType?: string; extension: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: undefined, extension: "webm" };
  }
  const mimeTypes = [
    { type: "audio/webm;codecs=opus", ext: "webm" },
    { type: "audio/webm", ext: "webm" },
    { type: "audio/mp4", ext: "m4a" },
    { type: "audio/aac", ext: "aac" },
    { type: "audio/ogg;codecs=opus", ext: "ogg" },
    { type: "audio/ogg", ext: "ogg" }
  ];
  for (const item of mimeTypes) {
    if (MediaRecorder.isTypeSupported(item.type)) {
      return { mimeType: item.type, extension: item.ext };
    }
  }
  return { mimeType: undefined, extension: "webm" };
}

export default function VoiceRecorder({
  onSendVoice,
  onRecordingStateChange,
  className = "",
  themeAccentText = "text-indigo-400",
  themeAccentBg = "bg-indigo-600"
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>([15, 25, 35, 20, 45, 60, 30, 20, 40, 50, 25, 15]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const secondsRef = useRef<number>(0);

  // Web Audio API Analyzer for live waveform visualization
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupAudio = useCallback(() => {
    stopTimer();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [stopTimer]);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const startTimer = () => {
    stopTimer();
    setRecordingSeconds(0);
    secondsRef.current = 0;
    timerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => {
        const next = prev + 1;
        secondsRef.current = next;
        // Auto-stop at 5 minutes to prevent giant files
        if (next >= 300) {
          handleStopAndSend();
        }
        return next;
      });
    }, 1000);
  };

  // Start live audio visualization using Web Audio Analyser
  const setupVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const renderWave = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Compute 14 bar values scaled between 10% and 100%
        const barsCount = 14;
        const step = Math.floor(dataArray.length / barsCount) || 1;
        const newLevels: number[] = [];

        for (let i = 0; i < barsCount; i++) {
          const val = dataArray[i * step] || 0;
          // Normalize 0-255 to percentage height (minimum 15% height for aesthetic wave)
          const pct = Math.max(15, Math.min(100, Math.round((val / 255) * 100)));
          newLevels.push(pct);
        }
        setAudioLevels(newLevels);
        animationFrameRef.current = requestAnimationFrame(renderWave);
      };

      animationFrameRef.current = requestAnimationFrame(renderWave);
    } catch (e) {
      console.warn("AudioContext visualizer setup notice:", e);
    }
  };

  const handleStartRecording = async () => {
    setErrorMessage(null);
    audioChunksRef.current = [];

    if (!navigator?.mediaDevices?.getUserMedia) {
      setErrorMessage("Audio recording is not supported on this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      const { mimeType } = getOptimalAudioConfig();
      mimeTypeRef.current = mimeType || "audio/webm";

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250); // collect data in 250ms slices
      setupVisualizer(stream);

      setIsRecording(true);
      setIsPaused(false);
      onRecordingStateChange?.(true);
      startTimer();
    } catch (err: unknown) {
      console.error("Microphone access denied or error:", err);
      const isPermissionDenied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      setErrorMessage(
        isPermissionDenied
          ? "Microphone access blocked. Click the lock/site settings in your browser address bar to allow audio."
          : "Could not access microphone. Please verify your audio device settings."
      );
      setIsRecording(false);
      onRecordingStateChange?.(false);
    }
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      // Resume timer
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      stopTimer();
    }
  };

  const handleCancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        // Safe fail
      }
    }
    cleanupAudio();
    audioChunksRef.current = [];
    setIsRecording(false);
    setIsPaused(false);
    setIsUploading(false);
    setRecordingSeconds(0);
    onRecordingStateChange?.(false);
  };

  const handleStopAndSend = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    const recordedSeconds = Math.max(1, secondsRef.current || recordingSeconds);

    setIsUploading(true);
    stopTimer();

    mediaRecorderRef.current.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeTypeRef.current || "audio/webm"
        });

        if (audioBlob.size > 200) {
          await onSendVoice(audioBlob, recordedSeconds);
        } else {
          setErrorMessage("Recording was too short to send.");
        }
      } catch (err: unknown) {
        console.error("Failed to upload audio voice memo to Google Drive:", err);
        setErrorMessage("Upload to Google Drive encountered an issue.");
      } finally {
        cleanupAudio();
        setIsRecording(false);
        setIsPaused(false);
        setIsUploading(false);
        setRecordingSeconds(0);
        onRecordingStateChange?.(false);
      }
    };

    try {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch (e) {
      console.warn("MediaRecorder stop notice:", e);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // When active recording or uploading, render the complete full-width interactive recording bar
  if (isRecording || isUploading) {
    return (
      <div className={`flex items-center justify-between w-full bg-slate-900/90 border border-red-500/40 px-3 py-2 rounded-2xl shadow-inner animate-fadeIn ${className}`}>
        {/* Left: Indicator & Timer */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative flex items-center justify-center">
            <div className={`w-3 h-3 rounded-full ${isPaused ? "bg-amber-500" : "bg-red-500"} ${isPaused ? "" : "animate-ping opacity-75"} absolute`} />
            <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? "bg-amber-500" : "bg-red-500"}`} />
          </div>

          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-red-400 tracking-wider">
              {formatDuration(recordingSeconds)}
            </span>
            <span className="text-[10px] text-slate-400 font-medium leading-none">
              {isUploading ? "Uploading to Drive..." : isPaused ? "Recording paused" : "Recording audio"}
            </span>
          </div>
        </div>

        {/* Center: Live Waveform Visualizer or Uploading Spinner */}
        <div className="flex-1 flex items-center justify-center px-4 max-w-sm">
          {isUploading ? (
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium animate-pulse">
              <CloudUpload className="w-4 h-4 animate-bounce" />
              <span>Saving voice message to Google Drive...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-[3px] h-6 w-full">
              {audioLevels.map((lvl, index) => (
                <div
                  key={index}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    isPaused
                      ? "bg-slate-600"
                      : index % 2 === 0
                      ? "bg-red-400"
                      : "bg-indigo-400"
                  }`}
                  style={{
                    height: isPaused ? "6px" : `${Math.max(6, Math.round((lvl / 100) * 24))}px`
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Controls (Cancel, Pause/Resume, Send) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isUploading && (
            <>
              {/* Cancel Button */}
              <button
                type="button"
                onClick={handleCancelRecording}
                className="p-2 hover:bg-red-950/50 active:scale-95 text-slate-400 hover:text-red-400 rounded-xl transition-all cursor-pointer"
                title="Discard voice recording"
                aria-label="Discard voice recording"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* Pause/Resume Button */}
              <button
                type="button"
                onClick={togglePause}
                className="p-2 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
                title={isPaused ? "Resume recording" : "Pause recording"}
                aria-label={isPaused ? "Resume recording" : "Pause recording"}
              >
                {isPaused ? <Play className="w-4 h-4 text-emerald-400 fill-current" /> : <Pause className="w-4 h-4 text-amber-400" />}
              </button>
            </>
          )}

          {/* Send / Upload Button */}
          <button
            type="button"
            onClick={handleStopAndSend}
            disabled={isUploading}
            className={`flex items-center gap-1.5 px-3 py-1.5 ${themeAccentBg} hover:opacity-90 active:scale-95 text-white rounded-xl font-medium text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Upload voice memo to Google Drive and send"
            aria-label="Upload voice memo to Google Drive and send"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Send</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Idle trigger state button
  return (
    <div className={`relative flex items-center ${className}`}>
      {errorMessage && (
        <div className="absolute bottom-full mb-2 left-0 z-30 bg-slate-900 border border-amber-500/40 text-amber-300 text-xs px-3 py-2 rounded-xl shadow-xl max-w-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div className="flex-1">
            <p className="text-[11px] leading-tight">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-slate-400 hover:text-white text-xs ml-1"
          >
            ✕
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleStartRecording}
        className={`p-2 text-slate-400 hover:${themeAccentText} transition-all duration-150 rounded-xl cursor-pointer flex items-center justify-center hover:bg-slate-800/60 active:scale-95`}
        title="Record voice memo (Google Drive cloud audio)"
        aria-label="Record voice memo"
      >
        <Mic className="w-5 h-5 hover:scale-110 transition-transform" />
      </button>
    </div>
  );
}


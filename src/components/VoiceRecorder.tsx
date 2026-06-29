import React, { useState, useRef, useEffect } from "react";
import { Mic, Trash2, Send, StopCircle, CircleAlert } from "lucide-react";

interface VoiceRecorderProps {
  onSendVoice: (audioBlob: Blob) => Promise<void>;
}

export default function VoiceRecorder({ onSendVoice }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [permissionError, setPermissionError] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      stopTimer();
    };
  }, []);

  const startTimer = () => {
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleStartRecording = async () => {
    audioChunksRef.current = [];
    setPermissionError(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size > 1000) {
          await onSendVoice(audioBlob);
        }
        // Stop all tracks to release red recording browser icon
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      startTimer();
    } catch (err) {
      console.error("Microphone access denied:", err);
      setPermissionError(true);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTimer();
    }
  };

  const handleCancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Discard the recorded chunks by clearing them and stopping
      mediaRecorderRef.current.onstop = () => {
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
        }
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTimer();
      setRecordingSeconds(0);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="flex items-center gap-2">
      {isRecording ? (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-500/30 px-3 py-1.5 rounded-full text-red-400 font-medium text-xs animate-pulse">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span>Recording {formatDuration(recordingSeconds)}</span>

          <div className="flex gap-2 ml-2">
            <button
              onClick={handleCancelRecording}
              className="p-1 hover:bg-red-900/30 rounded-full text-red-500 transition-colors cursor-pointer"
              title="Cancel audio recording"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleStopRecording}
              className="p-1 hover:bg-emerald-900/30 rounded-full text-emerald-400 transition-colors cursor-pointer"
              title="Lock and send voice message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {permissionError && (
            <span 
              className="text-[10px] text-amber-500 flex items-center gap-0.5" 
              title="Microphone blocked. Check your address-bar permissions."
            >
              <CircleAlert className="w-3 h-3" />
            </span>
          )}
          <button
            onClick={handleStartRecording}
            className="p-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-indigo-400 rounded-xl transition-all cursor-pointer flex items-center justify-center"
            title="Record secure voice message"
          >
            <Mic className="w-4 h-4 hover:scale-110 transition-transform text-indigo-400" />
          </button>
        </div>
      )}
    </div>
  );
}

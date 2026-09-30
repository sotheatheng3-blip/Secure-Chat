import React, { useState, useEffect, useRef } from "react";
import { 
  PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, Volume1, VolumeX, 
  Maximize2, Minimize2, LayoutGrid, Radio, Sliders, Headphones, 
  FlipHorizontal, ChevronDown, Check, Sparkles, Monitor, RotateCcw
} from "lucide-react";
import { CallSession, User } from "../types";

interface ActiveCallModalProps {
  activeCall: CallSession;
  currentUsername: string;
  currentUserAvatar: string;
  activeUsers: User[];
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  onToggleAudioMute: () => void;
  onToggleVideoMute: () => void;
  onEndCall: () => void;
}

export default function ActiveCallModal({
  activeCall,
  currentUsername,
  currentUserAvatar,
  activeUsers,
  localStream,
  remoteStream,
  isAudioMuted,
  isVideoMuted,
  onToggleAudioMute,
  onToggleVideoMute,
  onEndCall,
}: ActiveCallModalProps) {
  // Call timer
  const [callDuration, setCallDuration] = useState<number>(0);

  // Audio Speaker states
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [speakerVolume, setSpeakerVolume] = useState<number>(1.0); // 0.0 to 1.0
  const [showSpeakerMenu, setShowSpeakerMenu] = useState<boolean>(false);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState<string>("default");
  const [remoteAudioLevel, setRemoteAudioLevel] = useState<number>(0);

  // Video layout & display states
  const [layoutMode, setLayoutMode] = useState<"spotlight" | "grid">("spotlight");
  const [isSwapped, setIsSwapped] = useState<boolean>(false); // in spotlight: swap main and PiP
  const [pipPosition, setPipPosition] = useState<"bottom-right" | "top-right" | "bottom-left" | "top-left">("bottom-right");
  const [videoFit, setVideoFit] = useState<"cover" | "contain">("cover");
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Video and Audio DOM refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Identify friend in call
  const friendUsername = activeCall.participants.find(p => p !== currentUsername) 
    || (activeCall.caller !== currentUsername ? activeCall.caller : "Friend");
  const friendUser = activeUsers.find(
    u => u.username.toLowerCase() === friendUsername.toLowerCase()
  );
  const friendAvatar = friendUser?.avatar || (friendUsername ? friendUsername.slice(0, 2).toUpperCase() : "👤");

  // Call timer effect
  useEffect(() => {
    if (activeCall.status !== "active") return;
    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall.status]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Enumerate audio output devices if supported
  useEffect(() => {
    const fetchAudioDevices = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const outputs = devices.filter(d => d.kind === "audiooutput");
          setAudioOutputDevices(outputs);
        }
      } catch (err) {
        console.warn("Could not query audio output devices:", err);
      }
    };
    fetchAudioDevices();
  }, []);

  // Sync local stream with local video ref
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.warn("Local video play notice:", e));
    }
  }, [localStream, isVideoMuted, layoutMode, isSwapped]);

  // Sync remote stream with remote video & audio elements
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(e => console.warn("Remote video play notice:", e));
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(e => console.warn("Remote audio play notice:", e));
    }
  }, [remoteStream, layoutMode, isSwapped]);

  // Handle speaker volume & mute adjustments
  useEffect(() => {
    const effectiveVolume = isSpeakerOn ? speakerVolume : 0;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerOn;
      remoteAudioRef.current.volume = effectiveVolume;
      if (selectedOutputId && typeof (remoteAudioRef.current as any).setSinkId === "function") {
        (remoteAudioRef.current as any).setSinkId(selectedOutputId).catch((err: any) => {
          console.warn("setSinkId failed on audio element:", err);
        });
      }
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !isSpeakerOn;
      remoteVideoRef.current.volume = effectiveVolume;
      if (selectedOutputId && typeof (remoteVideoRef.current as any).setSinkId === "function") {
        (remoteVideoRef.current as any).setSinkId(selectedOutputId).catch((err: any) => {
          console.warn("setSinkId failed on video element:", err);
        });
      }
    }
  }, [isSpeakerOn, speakerVolume, selectedOutputId]);

  // Real-time Audio Speaker Level Visualizer from friend's remoteStream
  useEffect(() => {
    if (!remoteStream || !isSpeakerOn) {
      setRemoteAudioLevel(0);
      return;
    }

    const audioTracks = remoteStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(remoteStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Normalize between 0 and 1
        const level = Math.min(1, average / 128);
        setRemoteAudioLevel(level);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();

      return () => {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
        try {
          audioCtx.close();
        } catch (e) {}
      };
    } catch (err) {
      console.warn("Audio meter initialization notice:", err);
    }
  }, [remoteStream, isSpeakerOn]);

  // Toggle speaker phone
  const toggleSpeaker = () => {
    setIsSpeakerOn(prev => !prev);
  };

  // Listen for native fullscreen change events (standard & vendor prefixes)
  useEffect(() => {
    const handleFsChange = () => {
      const doc = document as any;
      const fsEl =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement;
      setIsFullscreen(!!fsEl);
    };

    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    document.addEventListener("mozfullscreenchange", handleFsChange);
    document.addEventListener("MSFullscreenChange", handleFsChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
      document.removeEventListener("mozfullscreenchange", handleFsChange);
      document.removeEventListener("MSFullscreenChange", handleFsChange);
    };
  }, []);

  // Safe Fullscreen toggle with vendor prefixes and iframe/iOS fallback
  const toggleFullscreen = async () => {
    const el = containerRef.current as any;
    const doc = document as any;

    if (!el) return;

    const currentFsElement =
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement;

    if (!currentFsElement) {
      // Find supported request fullscreen function
      const requestFn =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.webkitRequestFullScreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen;

      if (typeof requestFn === "function") {
        try {
          const promise = requestFn.call(el);
          if (promise && typeof promise.then === "function") {
            await promise;
          }
          setIsFullscreen(true);
        } catch (err) {
          console.warn("Native fullscreen request could not be fulfilled (falling back to view maximize):", err);
          setIsFullscreen(prev => !prev);
        }
      } else {
        // Fullscreen API not supported on this element/browser (e.g., iOS Safari or restricted iframe)
        setIsFullscreen(prev => !prev);
      }
    } else {
      const exitFn =
        doc.exitFullscreen ||
        doc.webkitExitFullscreen ||
        doc.webkitCancelFullScreen ||
        doc.mozCancelFullScreen ||
        doc.msExitFullscreen;

      if (typeof exitFn === "function") {
        try {
          const promise = exitFn.call(doc);
          if (promise && typeof promise.then === "function") {
            await promise;
          }
          setIsFullscreen(false);
        } catch (err) {
          console.warn("Native exit fullscreen error:", err);
          setIsFullscreen(false);
        }
      } else {
        setIsFullscreen(false);
      }
    }
  };

  // Safe end call handler that also cleans up native fullscreen if active
  const handleSafeEndCall = () => {
    try {
      const doc = document as any;
      const fsEl =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement;
      if (fsEl) {
        const exitFn =
          doc.exitFullscreen ||
          doc.webkitExitFullscreen ||
          doc.webkitCancelFullScreen ||
          doc.mozCancelFullScreen ||
          doc.msExitFullscreen;
        if (typeof exitFn === "function") {
          exitFn.call(doc).catch(() => {});
        }
      }
    } catch (e) {}
    onEndCall();
  };

  // Check if remote stream has active video track
  const hasRemoteVideo = remoteStream && remoteStream.getVideoTracks().some(t => t.enabled && t.readyState === "live");
  const isCallConnected = activeCall.status === "active";

  // PiP CSS position class
  const getPipPositionClass = () => {
    switch (pipPosition) {
      case "top-left":
        return "top-20 left-6";
      case "top-right":
        return "top-20 right-6";
      case "bottom-left":
        return "bottom-28 left-6";
      case "bottom-right":
      default:
        return "bottom-28 right-6";
    }
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white select-none overflow-hidden animate-fadeIn font-sans"
    >
      {/* Hidden dedicated audio tag for remote speaker audio stream */}
      <audio 
        ref={remoteAudioRef} 
        autoPlay 
        playsInline 
        className="hidden" 
      />

      {/* Top Header Bar */}
      <div className="h-16 px-5 border-b border-white/10 flex items-center justify-between bg-slate-900/80 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-lg font-bold shadow-md shadow-cyan-500/20">
              {friendAvatar.length <= 2 ? friendAvatar : (
                <span className="text-xl">{friendAvatar}</span>
              )}
            </div>
            {isCallConnected && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full animate-pulse" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">
                @{friendUsername}
              </h2>
              <span className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                {activeCall.callType === "video" ? "Real-to-Real Video" : "HD Audio Call"}
              </span>
            </div>
            
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              {isCallConnected ? (
                <>
                  <span className="flex items-center gap-1 text-emerald-400 font-mono font-semibold">
                    <Radio className="w-3 h-3 animate-pulse" />
                    {formatDuration(callDuration)}
                  </span>
                  <span>•</span>
                  <span className="text-slate-400">P2P Encrypted Direct</span>
                </>
              ) : (
                <span className="text-amber-400 animate-pulse flex items-center gap-1">
                  <Radio className="w-3 h-3 animate-spin" />
                  Ringing friend line...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Header Right Controls: Speaker status, Layout toggle & Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Audio Speaker Quick Indicator & Menu Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowSpeakerMenu(prev => !prev)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                isSpeakerOn 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20" 
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
              }`}
              title="Audio Speaker Settings"
            >
              {isSpeakerOn ? (
                speakerVolume > 0.5 ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <Volume1 className="w-4 h-4 text-emerald-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-rose-400" />
              )}
              <span className="hidden sm:inline">
                {isSpeakerOn ? `Speaker: ${Math.round(speakerVolume * 100)}%` : "Speaker: Muted"}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Audio Speaker Floating Dropdown Menu */}
            {showSpeakerMenu && (
              <div className="absolute right-0 top-11 w-64 p-3 bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl z-50 text-xs animate-scaleUp">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                    Audio Speaker Output
                  </span>
                  <button
                    onClick={toggleSpeaker}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                      isSpeakerOn ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" : "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                    }`}
                  >
                    {isSpeakerOn ? "ON" : "OFF"}
                  </button>
                </div>

                {/* Speaker Volume Slider */}
                <div className="space-y-1.5 mb-3">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Speaker Volume</span>
                    <span className="font-mono font-bold text-cyan-400">
                      {Math.round(speakerVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isSpeakerOn ? speakerVolume : 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setSpeakerVolume(val);
                      if (!isSpeakerOn && val > 0) setIsSpeakerOn(true);
                      if (val === 0) setIsSpeakerOn(false);
                    }}
                    className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <button 
                      onClick={() => { setIsSpeakerOn(false); setSpeakerVolume(0); }}
                      className="hover:text-slate-300 cursor-pointer"
                    >
                      Mute
                    </button>
                    <button 
                      onClick={() => { setIsSpeakerOn(true); setSpeakerVolume(0.5); }}
                      className="hover:text-slate-300 cursor-pointer"
                    >
                      50%
                    </button>
                    <button 
                      onClick={() => { setIsSpeakerOn(true); setSpeakerVolume(1.0); }}
                      className="hover:text-slate-300 cursor-pointer"
                    >
                      100% Max
                    </button>
                  </div>
                </div>

                {/* Speaker Real-time Activity Visualizer */}
                <div className="p-2 rounded-xl bg-slate-950/60 border border-white/5 mb-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Headphones className="w-3 h-3 text-cyan-400" />
                      Speaker Activity
                    </span>
                    <span className={remoteAudioLevel > 0.05 ? "text-emerald-400 font-bold" : "text-slate-500"}>
                      {remoteAudioLevel > 0.05 ? "Friend Speaking" : "Idle"}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex items-center p-0.5">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full transition-all duration-75"
                      style={{ width: `${Math.max(4, remoteAudioLevel * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Audio Output Device Selection (if browser supports) */}
                {audioOutputDevices.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 block">
                      Output Device:
                    </label>
                    <select
                      value={selectedOutputId}
                      onChange={(e) => setSelectedOutputId(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-400 cursor-pointer"
                    >
                      <option value="default">System Default Speaker</option>
                      {audioOutputDevices.map((dev) => (
                        <option key={dev.deviceId} value={dev.deviceId}>
                          {dev.label || `Speaker (${dev.deviceId.slice(0, 5)})`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Video Layout Toggle (Grid vs Spotlight) */}
          {activeCall.callType === "video" && (
            <div className="hidden sm:flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
              <button
                onClick={() => setLayoutMode("spotlight")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  layoutMode === "spotlight" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
                }`}
                title="Spotlight View (Large Friend Video + PiP)"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Spotlight
              </button>
              <button
                onClick={() => setLayoutMode("grid")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  layoutMode === "grid" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
                }`}
                title="Grid View (Equal Split Video)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Grid
              </button>
            </div>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Call"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Central Stage Area */}
      <div className="flex-1 relative flex items-center justify-center p-3 sm:p-6 overflow-hidden">
        {/* Subtle dynamic background gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(6,182,212,0.06)_0%,rgba(99,102,241,0.04)_50%,transparent_100%)] pointer-events-none" />

        {activeCall.callType === "video" ? (
          layoutMode === "grid" ? (
            /* ================= GRID VIEW: Equal 50/50 split ================= */
            <div className="w-full h-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
              {/* Friend's Video Card */}
              <div className="relative rounded-3xl overflow-hidden bg-slate-900/90 border border-white/10 shadow-2xl flex items-center justify-center group">
                {remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`w-full h-full ${videoFit === "cover" ? "object-cover" : "object-contain"} transition-all duration-300`}
                  />
                ) : (
                  <div className="text-center p-6 animate-fadeIn">
                    <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center text-4xl shadow-xl mb-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-20"></span>
                      {friendAvatar}
                    </div>
                    <h4 className="text-base font-bold text-white">@{friendUsername}</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                      {isCallConnected ? "Connecting real-time camera feed..." : "Waiting for friend to connect..."}
                    </p>
                  </div>
                )}

                {/* Friend Card Overlay Badges */}
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-slate-950/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold text-white">@{friendUsername}</span>
                  {remoteAudioLevel > 0.05 && (
                    <span className="flex items-center gap-0.5 text-cyan-400">
                      <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" />
                      <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse" />
                      <span className="w-1 h-4 bg-cyan-400 rounded-full animate-pulse" />
                    </span>
                  )}
                </div>

                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-slate-300 border border-white/5">
                  Remote Friend Line • 720p HD
                </div>
              </div>

              {/* Local Camera (You) Card */}
              <div className="relative rounded-3xl overflow-hidden bg-slate-900/90 border border-white/10 shadow-2xl flex items-center justify-center group">
                {!isVideoMuted && localStream ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isMirrored ? "scale-x-[-1]" : ""}`}
                  />
                ) : (
                  <div className="text-center p-6 animate-fadeIn">
                    <div className="w-20 h-20 mx-auto rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl mb-3">
                      {currentUserAvatar}
                    </div>
                    <h4 className="text-sm font-bold text-slate-300">You (Local Camera)</h4>
                    <p className="text-xs text-slate-500 mt-1">Your camera is currently disabled</p>
                  </div>
                )}

                {/* Local Card Overlay Badges */}
                <div className="absolute top-4 left-4 bg-slate-950/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <span>You</span>
                  {isAudioMuted && <span className="text-rose-400 text-[10px] font-bold">(Muted)</span>}
                </div>

                {/* Flip mirror toggle button */}
                {!isVideoMuted && (
                  <button
                    onClick={() => setIsMirrored(prev => !prev)}
                    className="absolute top-4 right-4 p-2 rounded-xl bg-black/50 hover:bg-black/75 border border-white/10 text-slate-300 transition-colors cursor-pointer"
                    title="Flip camera mirror view"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                  </button>
                )}

                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-slate-300 border border-white/5">
                  Local Camera Feed
                </div>
              </div>
            </div>
          ) : (
            /* ================= SPOTLIGHT VIEW: Main video + Floating PiP ================= */
            <div className="w-full h-full max-w-6xl relative flex items-center justify-center">
              {/* Main Stage Video: Friend (or You if swapped) */}
              <div className="w-full h-full rounded-3xl overflow-hidden bg-slate-900 border border-white/10 shadow-2xl relative flex items-center justify-center group">
                {!isSwapped ? (
                  /* Friend Video in Main Stage */
                  remoteStream ? (
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className={`w-full h-full ${videoFit === "cover" ? "object-cover" : "object-contain"} transition-all duration-300`}
                    />
                  ) : (
                    <div className="text-center p-8 animate-fadeIn">
                      <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center text-5xl shadow-2xl mb-4 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-20"></span>
                        {friendAvatar}
                      </div>
                      <h3 className="text-xl font-bold text-white">@{friendUsername}</h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                        {isCallConnected ? "Waiting for friend's camera feed to start..." : "Calling friend companion line..."}
                      </p>
                    </div>
                  )
                ) : (
                  /* Local User Video in Main Stage if swapped */
                  !isVideoMuted && localStream ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${isMirrored ? "scale-x-[-1]" : ""}`}
                    />
                  ) : (
                    <div className="text-center p-8">
                      <div className="w-24 h-24 mx-auto rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-4xl mb-3">
                        {currentUserAvatar}
                      </div>
                      <h3 className="text-lg font-bold text-slate-300">Your Camera</h3>
                      <p className="text-xs text-slate-500">Camera is turned off</p>
                    </div>
                  )
                )}

                {/* Main Video Overlay Top-Left Header */}
                <div className="absolute top-5 left-5 flex items-center gap-2.5 bg-slate-950/75 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-white/10 text-xs shadow-lg">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-bold text-white">
                    {!isSwapped ? `@${friendUsername}` : "You (Preview)"}
                  </span>
                  {!isSwapped && remoteAudioLevel > 0.05 && (
                    <span className="flex items-center gap-0.5 text-cyan-400 ml-1">
                      <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" />
                      <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse" />
                      <span className="w-1 h-4 bg-cyan-400 rounded-full animate-pulse" />
                    </span>
                  )}
                </div>

                {/* Main Video Aspect Mode (Fit vs Fill) Toggle */}
                <div className="absolute top-5 right-5 flex items-center gap-2">
                  <button
                    onClick={() => setVideoFit(prev => prev === "cover" ? "contain" : "cover")}
                    className="px-2.5 py-1 rounded-xl bg-black/60 hover:bg-black/80 border border-white/10 text-[11px] text-slate-300 backdrop-blur-md transition-colors cursor-pointer flex items-center gap-1"
                    title={videoFit === "cover" ? "Switch to Fit (no crop)" : "Switch to Fill (cover screen)"}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span className="capitalize">{videoFit}</span>
                  </button>
                </div>

                {/* Main Video Bottom Bar Indicators */}
                <div className="absolute bottom-5 left-5 flex items-center gap-2">
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-xl text-[11px] text-slate-300 border border-white/5 flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-cyan-400" />
                    <span>Real-to-Real Video Stream</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-emerald-400 font-medium">720p HD</span>
                  </div>

                  {/* Speaker Status Pill on Stage */}
                  <div className={`px-2.5 py-1 rounded-xl text-[11px] border backdrop-blur-md flex items-center gap-1.5 ${
                    isSpeakerOn ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300" : "bg-rose-500/20 border-rose-500/30 text-rose-300"
                  }`}>
                    {isSpeakerOn ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                    <span>{isSpeakerOn ? `Speaker ${Math.round(speakerVolume * 100)}%` : "Speaker Muted"}</span>
                  </div>
                </div>
              </div>

              {/* Floating Picture-in-Picture (PiP) Window */}
              <div 
                className={`absolute ${getPipPositionClass()} w-36 h-48 sm:w-48 sm:h-64 rounded-2xl overflow-hidden bg-slate-900 border-2 border-cyan-500/40 shadow-2xl z-20 transition-all duration-300 group cursor-pointer hover:border-cyan-400 hover:scale-[1.02]`}
                onClick={() => setIsSwapped(prev => !prev)}
                title="Click to swap view with main video"
              >
                {/* Content inside PiP: Opposite of main stage */}
                {isSwapped ? (
                  /* Friend Video inside PiP if swapped */
                  remoteStream ? (
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-950">
                      <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-xl mb-1">
                        {friendAvatar}
                      </div>
                      <p className="text-[10px] text-slate-400">@{friendUsername}</p>
                    </div>
                  )
                ) : (
                  /* Local User Video inside PiP (Default) */
                  !isVideoMuted && localStream ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${isMirrored ? "scale-x-[-1]" : ""}`}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-950">
                      <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xl mb-1">
                        {currentUserAvatar}
                      </div>
                      <p className="text-[10px] text-slate-400">Camera Off</p>
                    </div>
                  )
                )}

                {/* PiP Overlay label */}
                <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-lg text-[9px] text-white flex items-center gap-1 border border-white/10">
                  <span>{isSwapped ? `@${friendUsername}` : "You"}</span>
                  {!isSwapped && isAudioMuted && <span className="text-rose-400 font-bold">(Muted)</span>}
                </div>

                {/* Corner cycle button on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const positions: Array<"bottom-right" | "top-right" | "top-left" | "bottom-left"> = [
                      "bottom-right", "bottom-left", "top-left", "top-right"
                    ];
                    const currentIndex = positions.indexOf(pipPosition);
                    setPipPosition(positions[(currentIndex + 1) % positions.length]);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-slate-300 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[9px]"
                  title="Move PiP corner"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        ) : (
          /* ================= VOICE CALL MODE ================= */
          <div className="w-full max-w-md bg-slate-900/80 border border-white/10 rounded-3xl p-8 text-center relative z-10 shadow-2xl backdrop-blur-xl animate-scaleUp">
            {/* Friend's Avatar with Audio Speaker Aura */}
            <div className="relative w-32 h-32 mx-auto mb-6">
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 opacity-20 transition-transform duration-100"
                style={{ transform: `scale(${1 + remoteAudioLevel * 0.4})` }}
              />
              <div className="relative w-full h-full rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-5xl font-bold shadow-2xl border-2 border-white/20">
                {friendAvatar}
              </div>
              {isCallConnected && (
                <span className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 border-3 border-slate-900 rounded-full animate-pulse" />
              )}
            </div>

            <h3 className="text-xl font-bold text-white tracking-wide">
              @{friendUsername}
            </h3>

            <p className="text-xs text-slate-400 mt-1 mb-6 flex items-center justify-center gap-1.5">
              {isCallConnected ? (
                <>
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span className="text-emerald-400 font-semibold font-mono">
                    {formatDuration(callDuration)}
                  </span>
                  <span>•</span>
                  <span>Audio Speaker Connected</span>
                </>
              ) : (
                <span className="text-amber-400 animate-pulse">Calling friend line...</span>
              )}
            </p>

            {/* Audio Speaker Waveform Graphic */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 mb-6">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3">
                <span className="flex items-center gap-1.5 font-medium">
                  {isSpeakerOn ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5 text-rose-400" />}
                  Speaker Output {isSpeakerOn ? `(${Math.round(speakerVolume * 100)}%)` : "(Muted)"}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {isSpeakerOn ? (remoteAudioLevel > 0.05 ? "Incoming Audio Active" : "Line Connected") : "Speaker Off"}
                </span>
              </div>

              {/* Dynamic Equalizer Bars */}
              <div className="flex items-center justify-center gap-1.5 h-10">
                {[...Array(16)].map((_, i) => {
                  const barHeight = isSpeakerOn 
                    ? Math.max(6, Math.min(36, Math.floor((remoteAudioLevel * 45) + Math.sin(i * 0.5) * 8 + 6)))
                    : 4;
                  return (
                    <span 
                      key={i} 
                      className={`w-1.5 rounded-full transition-all duration-75 ${
                        isSpeakerOn 
                          ? "bg-gradient-to-t from-cyan-500 to-emerald-400" 
                          : "bg-slate-700"
                      }`}
                      style={{ height: `${barHeight}px` }} 
                    />
                  );
                })}
              </div>
            </div>

            {/* Quick Speaker Slider inside Voice Card */}
            <div className="flex items-center gap-3 px-2">
              <button
                onClick={toggleSpeaker}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                  isSpeakerOn ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-rose-500/20 border-rose-500/40 text-rose-300"
                }`}
                title="Toggle Audio Speaker"
              >
                {isSpeakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isSpeakerOn ? speakerVolume : 0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSpeakerVolume(val);
                    if (!isSpeakerOn && val > 0) setIsSpeakerOn(true);
                    if (val === 0) setIsSpeakerOn(false);
                  }}
                  className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                />
              </div>

              <span className="text-[11px] font-mono text-slate-400 w-9 text-right">
                {Math.round(speakerVolume * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action Control Ribbon Bottom Bar */}
      <div className="h-24 px-6 border-t border-white/10 flex items-center justify-center gap-4 sm:gap-6 bg-slate-900/90 backdrop-blur-md z-30">
        {/* Toggle Microphone */}
        <button
          onClick={onToggleAudioMute}
          className={`p-4 rounded-full transition-all active:scale-95 cursor-pointer shadow-lg ${
            isAudioMuted 
              ? "bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500/35" 
              : "bg-white/10 border border-white/10 text-slate-200 hover:bg-white/15"
          }`}
          title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Audio Speaker Phone Control Button */}
        <button
          onClick={toggleSpeaker}
          className={`p-4 rounded-full transition-all active:scale-95 cursor-pointer shadow-lg ${
            isSpeakerOn 
              ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30" 
              : "bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500/35"
          }`}
          title={isSpeakerOn ? "Speaker Output ON (Click to Mute Speaker)" : "Speaker Muted (Click to Turn On Speaker)"}
        >
          {isSpeakerOn ? (
            speakerVolume > 0.5 ? <Volume2 className="w-5 h-5" /> : <Volume1 className="w-5 h-5" />
          ) : (
            <VolumeX className="w-5 h-5" />
          )}
        </button>

        {/* Hang Up Button */}
        <button
          onClick={handleSafeEndCall}
          className="px-8 py-4 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold transition-all shadow-xl shadow-rose-600/30 flex items-center gap-2 cursor-pointer"
          title="End Call"
        >
          <PhoneOff className="w-5 h-5" />
          <span className="hidden sm:inline">End Call</span>
        </button>

        {/* Toggle Video Camera (Only in Video Call) */}
        {activeCall.callType === "video" && (
          <button
            onClick={onToggleVideoMute}
            className={`p-4 rounded-full transition-all active:scale-95 cursor-pointer shadow-lg ${
              isVideoMuted 
                ? "bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500/35" 
                : "bg-white/10 border border-white/10 text-slate-200 hover:bg-white/15"
            }`}
            title={isVideoMuted ? "Turn Video Camera On" : "Turn Video Camera Off"}
          >
            {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>
        )}
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { X, Hash, MessageSquare, ShieldAlert, Plus, Users, Camera, RefreshCw, AlertCircle, Sparkles, Image } from "lucide-react";
import { User } from "../types";

interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeUsers: User[];
  currentUsername: string;
  onCreateRoom: (roomName: string, isGroup: boolean, inviteeUsername?: string, avatar?: string, privacy?: "public" | "private") => Promise<void>;
}

const PALETTES = [
  { name: "Cyan Spark", start: "#22d3ee", end: "#2563eb", bgClass: "from-cyan-400 to-blue-600" },
  { name: "Sunset Gold", start: "#f59e0b", end: "#ef4444", bgClass: "from-amber-400 to-rose-500" },
  { name: "Emerald Grove", start: "#34d399", end: "#059669", bgClass: "from-emerald-400 to-emerald-600" },
  { name: "Grape Royale", start: "#a855f7", end: "#6366f1", bgClass: "from-purple-500 to-indigo-600" },
  { name: "Cosmic Velvet", start: "#ec4899", end: "#8b5cf6", bgClass: "from-pink-500 to-purple-600" },
  { name: "Deep Ruby", start: "#f43f5e", end: "#be123c", bgClass: "from-rose-500 to-rose-800" },
];

const generateInitialsSvg = (name: string, gradientStart: string, gradientEnd: string): string => {
  const initials = (name || "GR").trim().slice(0, 2).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${gradientStart};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${gradientEnd};stop-opacity:1" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#grad)" />
      <text x="50" y="55" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="34" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text>
    </svg>
  `.trim().replace(/\s+/g, " ");
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export default function RoomModal({
  isOpen,
  onClose,
  activeUsers,
  currentUsername,
  onCreateRoom,
}: RoomModalProps) {
  const [tab, setTab] = useState<"group" | "direct">("group");
  const [groupName, setGroupName] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "private">("public");
  const [loading, setLoading] = useState(false);

  // Custom Avatar / Profile Image state
  const [avatarMode, setAvatarMode] = useState<"placeholder" | "camera">("placeholder");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Stream track cleanup on close or switch
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [cameraStream]);

  // Clean camera state if tab changes or modal closes
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedImage(null);
      setGroupName("");
      setPrivacy("public");
    }
  }, [isOpen, tab]);

  if (!isOpen) return null;

  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(true);
    setCapturedImage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 300, height: 300, facingMode: "user" },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => console.error("Video play failed:", err));
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setCameraError("Could not access your camera. Please ensure permissions are granted and no other app is using it.");
      setCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const video = videoRef.current;
        const size = Math.min(video.videoWidth, video.videoHeight);
        const xOffset = (video.videoWidth - size) / 2;
        const yOffset = (video.videoHeight - size) / 2;
        ctx.drawImage(video, xOffset, yOffset, size, size, 0, 0, 300, 300);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setLoading(true);
    try {
      const avatarToSubmit = avatarMode === "camera" && capturedImage
        ? capturedImage
        : generateInitialsSvg(
            groupName.trim() || "GR",
            PALETTES[paletteIndex].start,
            PALETTES[paletteIndex].end
          );

      await onCreateRoom(groupName.trim(), true, undefined, avatarToSubmit, privacy);
      setGroupName("");
      setCapturedImage(null);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartDirect = async (targetUsername: string) => {
    setLoading(true);
    try {
      await onCreateRoom(`${currentUsername} & ${targetUsername}`, false, targetUsername);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const dmTargets = activeUsers.filter((u) => u.username !== currentUsername);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-lg font-semibold font-display text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-400" />
            New Conversation
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/20 p-1">
          <button
            onClick={() => setTab("group")}
            className={`flex-1 py-2.5 text-xs font-medium rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              tab === "group"
                ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            Group Channel (Secure AES)
          </button>
          <button
            onClick={() => setTab("direct")}
            className={`flex-1 py-2.5 text-xs font-medium rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              tab === "direct"
                ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Direct Messages (E2E Encrypted)
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5">
          {tab === "group" ? (
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  CHANNEL NAME
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                    <Hash className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g. general, crypto-talk, team-friends"
                    maxLength={25}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  PRIVACY SETTING
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setPrivacy("public")}
                    className={`py-2 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      privacy === "public"
                        ? "bg-emerald-500/10 text-emerald-305 border border-emerald-500/20"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <span>🌐 Public Group</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrivacy("private")}
                    className={`py-2 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      privacy === "private"
                        ? "bg-rose-500/10 text-rose-305 border border-rose-500/20"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <span>🔒 Private Group</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 cursor-default">
                  {privacy === "public" 
                    ? "Anyone can discover, join, and view secure logs for public channels."
                    : "Only group creator and members can discover or view private channels."}
                </p>
              </div>

              {/* Group Profile Image Config */}
              <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-800/80 space-y-3.5">
                <label className="block text-[10px] font-bold text-slate-400 tracking-wider">
                  GROUP AVATAR / PROFILE IMAGE
                </label>
                
                {/* Mode Selector Tabs */}
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-900">
                  <button
                    type="button"
                    onClick={() => { setAvatarMode("placeholder"); stopCamera(); }}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-md flex items-center justify-center gap-1.5 transition-all outline-none cursor-pointer ${
                      avatarMode === "placeholder"
                        ? "bg-slate-800/85 text-indigo-300 shadow-sm"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto Placeholder
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarMode("camera")}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-md flex items-center justify-center gap-1.5 transition-all outline-none cursor-pointer ${
                      avatarMode === "camera"
                        ? "bg-slate-800/85 text-indigo-300 shadow-sm"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Camera Snapshot
                  </button>
                </div>

                {/* Main Avatar Area */}
                <div className="flex items-center gap-4 py-1">
                  {/* Avatar Preview Sphere */}
                  <div className="relative shrink-0">
                    {avatarMode === "placeholder" ? (
                      <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${PALETTES[paletteIndex].bgClass} flex items-center justify-center text-lg font-bold text-white shadow-lg border border-slate-800 font-sans tracking-wide uppercase`}>
                        {(groupName || "GR").trim().slice(0, 2).toUpperCase()}
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
                        {capturedImage ? (
                          <img src={capturedImage} alt="Captured Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <Camera className="w-6 h-6 text-slate-700 animate-pulse" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Avatar Options Control Panel */}
                  <div className="flex-1 space-y-1.5">
                    {avatarMode === "placeholder" ? (
                      <>
                        <p className="text-[10px] text-slate-400">
                          Generates custom visual branding using initials & selected back-gradient colors.
                        </p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {PALETTES.map((palette, idx) => (
                            <button
                              key={palette.name}
                              type="button"
                              onClick={() => setPaletteIndex(idx)}
                              title={palette.name}
                              className={`w-6 h-6 rounded-full bg-gradient-to-br ${palette.bgClass} border hover:scale-105 active:scale-95 transition-all cursor-pointer ${
                                paletteIndex === idx ? "border-indigo-400 ring-2 ring-indigo-500/15 scale-105" : "border-slate-800"
                              }`}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        {cameraActive ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={capturePhoto}
                              className="px-2.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping shrink-0" />
                              Snap Photo
                            </button>
                            <button
                              type="button"
                              onClick={stopCamera}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-750 text-slate-400 hover:text-slate-200 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={startCamera}
                              className="px-2.5 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-305 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              {capturedImage ? "Retake Photo" : "Activate Camera"}
                            </button>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-500 leading-normal">
                          Snap high-fidelity snap using browser local device sandbox.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-view: Active Live Camera stream viewport */}
                {avatarMode === "camera" && cameraActive && (
                  <div className="relative aspect-square w-full max-w-[180px] mx-auto rounded-xl overflow-hidden bg-black border border-slate-800 shadow-inner">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <div className="absolute top-2 right-2 bg-black/60 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      LIVE FEED
                    </div>
                  </div>
                )}

                {/* Error handling for Camera block */}
                {avatarMode === "camera" && cameraError && (
                  <div className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/10 text-red-400 text-[10px] flex gap-2 items-start">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                )}
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex gap-3 text-xs text-slate-400">
                <ShieldAlert className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-200 mb-1">
                    Automatic Key Agreement
                  </p>
                  A 256-bit AES symmetric key will be created locally. When friends enter, your client securely exchanges the encrypted keys.
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !groupName.trim()}
                className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 font-medium text-xs text-white rounded-xl transition-all cursor-pointer select-none border border-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Establishing safe channel..." : "Create Secure Group Channel"}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-400">
                SELECT ONLINE FRIEND
              </label>

              {dmTargets.length === 0 ? (
                <div className="text-center py-6 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-500">
                  No other users are currently online to start an E2E session with. Invite a friend using a secondary browser window!
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {dmTargets.map((user) => (
                    <button
                      key={user.username}
                      onClick={() => handleStartDirect(user.username)}
                      disabled={loading}
                      className="w-full p-2.5 rounded-xl hover:bg-slate-800/80 bg-slate-950/40 border border-slate-850 hover:border-slate-700 flex items-center justify-between transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-400 border border-indigo-500/20 uppercase">
                          {user.username.slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-200">
                            {user.username}
                          </p>
                          <span className="text-[10px] text-emerald-400 font-mono">
                            ● online
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                        RSA E2E
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

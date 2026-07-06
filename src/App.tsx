import React, { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Server, Mail, Lock as LockIcon, User as UserIcon, Smile, Settings, Plus, BookOpen, Key, LogOut, RefreshCw, Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, Bell, BellOff } from "lucide-react";
import { User, Room, Message, ActiveKeyMap, CallSession, CallRecord } from "./types";
import { ThemeId, getTheme } from "./utils/theme";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import RoomModal from "./components/RoomModal";
import ProfileModal from "./components/ProfileModal";
import FriendsModal from "./components/FriendsModal";
import { auth, googleProvider } from "./utils/firebase";
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

export default function App() {
  // Identity States
  const [username, setUsername] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [avatar, setAvatar] = useState<string>("🦊");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isLogged, setIsLogged] = useState<boolean>(false);
  const [registering, setRegistering] = useState<boolean>(false);

  // Authentication Fields & Screens
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [registerEmail, setRegisterEmail] = useState<string>("");
  const [registerPassword, setRegisterPassword] = useState<string>("");
  const [registerUsername, setRegisterUsername] = useState<string>("");
  const [registerAvatar, setRegisterAvatar] = useState<string>("🦊");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Networking / WebSocket State
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [activeKeys, setActiveKeys] = useState<ActiveKeyMap>({}); 

  // Rooms and Messages State
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>("general");
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    "general": [],
    "tech": []
  });

  // Operational State
  const [isRoomModalOpen, setIsRoomModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [typingUsersRecord, setTypingUsersRecord] = useState<Record<string, string[]>>({});
  const [securityLogs, setSecurityLogs] = useState<string[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<ThemeId>(() => {
    try {
      const stored = localStorage.getItem("workspace_active_theme");
      if (stored === "slate" || stored === "emerald" || stored === "purple" || stored === "ocean" || stored === "sunset") {
        return stored as ThemeId;
      }
    } catch (e) {}
    return "slate";
  });
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [sidebarActiveTab, setSidebarActiveTab] = useState<"chats" | "calls">("chats");

  // Call State
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Call History State
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);

  // Call history tracking refs
  const callConnectedTimeRef = useRef<number | null>(null);
  const callTypeRef = useRef<"voice" | "video">("voice");
  const callRoomIdRef = useRef<string | null>(null);
  const callIsOutgoingRef = useRef<boolean>(false);
  const callWasConnectedRef = useRef<boolean>(false);

  // WebRTC & Audio refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeCallRef = useRef<CallSession | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Load call history when user changes
  useEffect(() => {
    if (username) {
      try {
        const stored = localStorage.getItem(`call_history_${username}`);
        if (stored) {
          setCallHistory(JSON.parse(stored));
        } else {
          setCallHistory([]);
        }
      } catch (e) {
        setCallHistory([]);
      }
    } else {
      setCallHistory([]);
    }
  }, [username]);

  const saveCallLog = useCallback((record: Omit<CallRecord, "id">) => {
    setCallHistory(prev => {
      const newRecord: CallRecord = {
        ...record,
        id: `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      };
      const updated = [newRecord, ...prev];
      if (username) {
        localStorage.setItem(`call_history_${username}`, JSON.stringify(updated));
      }
      return updated;
    });
  }, [username]);

  const handleClearCallHistory = useCallback(() => {
    setCallHistory([]);
    if (username) {
      localStorage.removeItem(`call_history_${username}`);
    }
  }, [username]);

  const completeCallSessionAndLog = useCallback((forcedStatus?: "missed" | "incoming" | "outgoing") => {
    const roomId = callRoomIdRef.current;
    if (!roomId) return;

    const wasConnected = callWasConnectedRef.current;
    const isOutgoing = callIsOutgoingRef.current;
    const callType = callTypeRef.current;
    const connectedTime = callConnectedTimeRef.current;

    // Calculate duration
    const duration = wasConnected && connectedTime ? Math.floor((Date.now() - connectedTime) / 1000) : 0;

    // Determine status
    let status: "missed" | "incoming" | "outgoing" = "missed";
    if (forcedStatus) {
      status = forcedStatus;
    } else if (wasConnected) {
      status = isOutgoing ? "outgoing" : "incoming";
    } else {
      status = isOutgoing ? "outgoing" : "missed";
    }

    // Resolve room display name
    const room = rooms.find(r => r.id === roomId);
    let resolvedRoomName = roomId;
    if (room) {
      if (room.isGroup) {
        resolvedRoomName = room.name;
      } else {
        resolvedRoomName = room.name
          .replace(username, "")
          .replace("&", "")
          .trim();
      }
    } else if (activeCall) {
      const otherParties = activeCall.participants.filter(p => p !== username);
      if (otherParties.length > 0) {
        resolvedRoomName = otherParties.join(", ");
      }
    } else if (incomingCall) {
      resolvedRoomName = incomingCall.caller;
    }

    saveCallLog({
      roomId,
      roomName: resolvedRoomName || "Unknown conversation",
      caller: isOutgoing ? username : (activeCall?.caller || incomingCall?.caller || "unknown"),
      callType,
      status,
      timestamp: connectedTime || Date.now(),
      duration,
      participants: activeCall?.participants || incomingCall?.participants || [username]
    });

    // Reset tracking refs
    callRoomIdRef.current = null;
    callConnectedTimeRef.current = null;
    callWasConnectedRef.current = false;
    callIsOutgoingRef.current = false;
  }, [rooms, username, activeCall, incomingCall, saveCallLog]);

  // Accessibility & Privacy Settings Reactive State
  const [fontSize, setFontSizeState] = useState<string>("font-size-normal");
  const [dyslexicFont, setDyslexicFont] = useState<boolean>(false);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [increasedSpacing, setIncreasedSpacing] = useState<boolean>(false);
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);
  const [justMentionedFlash, setJustMentionedFlash] = useState<boolean>(false);
  const [activeMentionBanner, setActiveMentionBanner] = useState<{
    id: string;
    roomId: string;
    roomName: string;
    sender: string;
    text: string;
  } | null>(null);

  const applySettings = useCallback(() => {
    if (typeof window !== "undefined") {
      const fs = localStorage.getItem("accessibility_fontSize") || "normal";
      setFontSizeState(
        fs === "small" 
          ? "font-size-small" 
          : fs === "large" 
            ? "font-size-large" 
            : fs === "xlarge" 
              ? "font-size-xlarge" 
              : "font-size-normal"
      );
      setDyslexicFont(localStorage.getItem("accessibility_dyslexicFont") === "true");
      setHighContrast(localStorage.getItem("accessibility_highContrast") === "true");
      setIncreasedSpacing(localStorage.getItem("accessibility_increasedSpacing") === "true");
      setReduceMotion(localStorage.getItem("accessibility_reduceMotion") === "true");
    }
  }, []);

  useEffect(() => {
    applySettings();
    window.addEventListener("app-settings-updated", applySettings);
    return () => {
      window.removeEventListener("app-settings-updated", applySettings);
    };
  }, [applySettings]);

  const triggerScreenFlash = useCallback(() => {
    if (typeof window !== "undefined") {
      if (localStorage.getItem("accessibility_screenFlashForMentions") !== "false") {
        setJustMentionedFlash(true);
        setTimeout(() => setJustMentionedFlash(false), 900);
      }
    }
  }, []);

  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState<boolean>(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);

  const fetchPendingRequestsCount = useCallback(async (userHandle?: string) => {
    const targetUsr = userHandle || username;
    if (!targetUsr) return;
    try {
      const res = await fetch(`/api/friends/status?username=${encodeURIComponent(targetUsr)}`);
      const data = await res.json();
      if (data.success && data.requests) {
        const incoming = data.requests.filter(
          (r: any) => r.status === "pending" && r.receiver.toLowerCase() === targetUsr.toLowerCase()
        );
        setPendingRequestsCount(incoming.length);
      }
    } catch (err) {
      console.error("Failed to fetch friends count:", err);
    }
  }, [username]);

  const handleSelectTheme = (themeId: ThemeId) => {
    setActiveThemeId(themeId);
    try {
      localStorage.setItem("workspace_active_theme", themeId);
    } catch (e) {}
    logSecurity(`Updated workspace interface preset to "${themeId}" color theme.`);
  };

  const wsRef = useRef<WebSocket | null>(null);

  // Simple event logging pane
  const logSecurity = useCallback((text: string) => {
    const time = new Date().toLocaleTimeString();
    setSecurityLogs((prev) => [...prev, `[${time}] ${text}`]);
    console.log(`[Session Event Log] ${text}`);
  }, []);

  // Audio Ringtone generator using Web Audio API
  const playRingSound = useCallback(() => {
    try {
      if (typeof window === "undefined") return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
      }

      // Dual-frequency ringing tone loop (US Ringback tone simulation: 440Hz + 480Hz)
      const playTone = () => {
        try {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gainNode = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.value = 440;
          osc2.type = "sine";
          osc2.frequency.value = 480;

          gainNode.gain.setValueAtTime(0.04, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.8);

          osc1.connect(gainNode);
          osc2.connect(gainNode);
          gainNode.connect(ctx.destination);

          osc1.start();
          osc2.start();

          setTimeout(() => {
            try {
              osc1.stop();
              osc2.stop();
              osc1.disconnect();
              osc2.disconnect();
              gainNode.disconnect();
            } catch (e) {}
          }, 1850);
        } catch (err) {}
      };

      playTone();
      ringIntervalRef.current = setInterval(playTone, 4000);
    } catch (e) {
      console.warn("AudioContext ringtone generation failed:", e);
    }
  }, []);

  const stopRingSound = useCallback(() => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }, []);

  // Custom synthesized notification sound generator
  const playNotificationSound = useCallback((preset: string = "chime", volume: number = 0.5) => {
    try {
      if (typeof window === "undefined" || preset === "none") return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      if (preset === "chime") {
        const playNote = (freq: number, delay: number, duration: number) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          
          gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
          gainNode.gain.linearRampToValueAtTime(0.05 * volume, ctx.currentTime + delay + 0.02);
          gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
          
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + duration);
          
          setTimeout(() => {
            try {
              osc.disconnect();
              gainNode.disconnect();
            } catch (e) {}
          }, (delay + duration + 0.1) * 1000);
        };
        
        playNote(1318.51, 0, 0.4); // E6
        playNote(1760.00, 0.08, 0.5); // A6
      } else if (preset === "bloop") {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
        
        gainNode.gain.setValueAtTime(0.06 * volume, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
        
        setTimeout(() => {
          try {
            osc.disconnect();
            gainNode.disconnect();
          } catch (e) {}
        }, 300);
      } else if (preset === "ping") {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(2048, ctx.currentTime);
        
        gainNode.gain.setValueAtTime(0.08 * volume, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
        
        setTimeout(() => {
          try {
            osc.disconnect();
            gainNode.disconnect();
          } catch (e) {}
        }, 400);
      } else if (preset === "echo") {
        const playPingAt = (delay: number, vol: number) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(1500, ctx.currentTime + delay);
          
          gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
          gainNode.gain.linearRampToValueAtTime(vol * volume, ctx.currentTime + delay + 0.01);
          gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.12);
          
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.15);
          
          setTimeout(() => {
            try {
              osc.disconnect();
              gainNode.disconnect();
            } catch (e) {}
          }, (delay + 0.2) * 1000);
        };
        
        playPingAt(0, 0.06);
        playPingAt(0.12, 0.03);
        playPingAt(0.24, 0.015);
      }
    } catch (err) {
      console.warn("Failed to play notification sound:", err);
    }
  }, []);

  const cleanupCallMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setRemoteStream(null);
    Object.keys(peerConnectionsRef.current).forEach(user => {
      try {
        peerConnectionsRef.current[user].close();
      } catch (e) {}
    });
    peerConnectionsRef.current = {};
    setIsAudioMuted(false);
    setIsVideoMuted(false);
  }, []);

  const initiatePeerConnection = useCallback(async (targetUser: string, rId: string) => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun1.l.google.com:19302" }]
      });

      peerConnectionsRef.current[targetUser] = pc;

      // Add local stream tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          if (localStreamRef.current) {
            pc.addTrack(track, localStreamRef.current);
          }
        });
      }

      // Track ICE candidates
      pc.onicecandidate = (e) => {
        if (e.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "call:signal",
            roomId: rId,
            to: targetUser,
            from: username,
            signal: { candidate: e.candidate }
          }));
        }
      };

      // Remote stream track arriving
      pc.ontrack = (e) => {
        if (e.streams && e.streams[0]) {
          setRemoteStream(e.streams[0]);
          logSecurity(`Established clear audio/video channel connection with @${targetUser}`);
        }
      };

      // Create and send SDP Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "call:signal",
          roomId: rId,
          to: targetUser,
          from: username,
          signal: { offer }
        }));
      }
    } catch (err) {
      console.warn("RTCPeerConnection initiation failed:", err);
    }
  }, [username, logSecurity]);

  const handleSignalingMessage = useCallback(async (from: string, signal: any) => {
    try {
      let pc = peerConnectionsRef.current[from];

      if (!pc) {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun1.l.google.com:19302" }]
        });
        peerConnectionsRef.current[from] = pc;

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => {
            if (localStreamRef.current) {
              pc.addTrack(track, localStreamRef.current);
            }
          });
        }

        pc.onicecandidate = (e) => {
          if (e.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: "call:signal",
              roomId: activeCall?.roomId || activeRoomId,
              to: from,
              from: username,
              signal: { candidate: e.candidate }
            }));
          }
        };

        pc.ontrack = (e) => {
          if (e.streams && e.streams[0]) {
            setRemoteStream(e.streams[0]);
            logSecurity(`Connected dynamic audio/video stream with @${from}`);
          }
        };
      }

      if (signal.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "call:signal",
            roomId: activeCall?.roomId || activeRoomId,
            to: from,
            from: username,
            signal: { answer }
          }));
        }
      } else if (signal.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.warn("Error processing call signal packet:", err);
    }
  }, [username, activeCall, activeRoomId, logSecurity]);

  // Calling Action Handlers
  const handleInitiateCall = useCallback(async (callType: "voice" | "video") => {
    if (!activeRoomId) return;
    logSecurity(`Initiating ${callType} call loop in room #${activeRoomId}...`);
    playRingSound();

    // Set call tracking refs
    callRoomIdRef.current = activeRoomId;
    callTypeRef.current = callType;
    callIsOutgoingRef.current = true;
    callWasConnectedRef.current = false;
    callConnectedTimeRef.current = null;

    const initialSession: CallSession = {
      roomId: activeRoomId,
      caller: username,
      callType,
      status: "ringing",
      participants: [username]
    };

    setActiveCall(initialSession);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "call:initiate",
        roomId: activeRoomId,
        callType,
        caller: username
      }));
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video" ? { width: 640, height: 480 } : false
      });
      localStreamRef.current = stream;
      logSecurity("Acquired local media stream successfully");
    } catch (err) {
      console.warn("Could not capture real microphone or WebCam:", err);
      logSecurity("Hardware permission blocked. Falling back to secure simulated call channel.");
    }
  }, [activeRoomId, username, playRingSound, logSecurity]);

  const handleAcceptCall = useCallback(async () => {
    if (!incomingCall) return;
    const rId = incomingCall.roomId;
    logSecurity(`Accepting incoming ${incomingCall.callType} call from @${incomingCall.caller}...`);
    
    // Set call tracking refs
    callRoomIdRef.current = incomingCall.roomId;
    callTypeRef.current = incomingCall.callType;
    callIsOutgoingRef.current = false;
    callWasConnectedRef.current = true;
    callConnectedTimeRef.current = Date.now();

    stopRingSound();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "call:accept",
        roomId: rId,
        username
      }));
    }

    setActiveCall({
      ...incomingCall,
      status: "active",
      participants: [...incomingCall.participants, username]
    });
    setIncomingCall(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incomingCall.callType === "video" ? { width: 640, height: 480 } : false
      });
      localStreamRef.current = stream;
      logSecurity("Acquired local stream for active call session");
    } catch (err) {
      console.warn("Could not capture mic or WebCam for accepted call:", err);
      logSecurity("Hardware permission blocked. Joining call in secure simulated mode.");
    }
  }, [incomingCall, username, stopRingSound, logSecurity]);

  const handleDeclineCall = useCallback(() => {
    if (!incomingCall) return;
    logSecurity(`Declining incoming call from @${incomingCall.caller}`);
    
    // Set call tracking refs
    callRoomIdRef.current = incomingCall.roomId;
    callTypeRef.current = incomingCall.callType;
    callIsOutgoingRef.current = false;
    callWasConnectedRef.current = false;
    callConnectedTimeRef.current = null;
    completeCallSessionAndLog("missed");

    stopRingSound();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "call:decline",
        roomId: incomingCall.roomId,
        username
      }));
    }
    setIncomingCall(null);
  }, [incomingCall, username, stopRingSound, logSecurity, completeCallSessionAndLog]);

  const handleEndCall = useCallback(() => {
    logSecurity("Ending active call session");
    stopRingSound();

    const targetRoomId = activeCall?.roomId || activeRoomId;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "call:end",
        roomId: targetRoomId,
        username
      }));
    }

    completeCallSessionAndLog();

    cleanupCallMedia();
    setActiveCall(null);
    setIncomingCall(null);
  }, [activeCall, activeRoomId, username, stopRingSound, cleanupCallMedia, logSecurity, completeCallSessionAndLog]);

  const toggleAudioMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted(prev => !prev);
      logSecurity(`Audio tracks ${!isAudioMuted ? "muted" : "unmuted"}`);
    } else {
      setIsAudioMuted(prev => !prev);
    }
  }, [isAudioMuted, logSecurity]);

  const toggleVideoMute = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoMuted(prev => !prev);
      logSecurity(`Video tracks ${!isVideoMuted ? "disabled" : "enabled"}`);
    } else {
      setIsVideoMuted(prev => !prev);
    }
  }, [isVideoMuted, logSecurity]);

  // Connect to the WebSocket server
  const connectWebSocket = useCallback((userHandle: string, emailAddr: string, userAvatar: string) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    logSecurity(`Opening client WebSocket connection to ${wsUrl}...`);

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      setWsConnected(true);
      logSecurity("WebSocket Connection Established. Synchronizing local profile metadata...");
      
      // Register with backend WS
      socket.send(JSON.stringify({
        type: "user:register",
        username: userHandle,
        publicKey: "none",
        avatar: userAvatar
      }));
      logSecurity(`Registered session metadata for user @${userHandle}`);
    };

    socket.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type } = payload;

        switch (type) {
          case "sync:rooms": {
            const syncedRooms: Room[] = payload.rooms;
            setRooms(syncedRooms);
            logSecurity(`Synchronized ${syncedRooms.length} room feeds from channel server`);
            break;
          }

          case "sync:active_keys": {
            const syncedKeys: ActiveKeyMap = payload.keys;
            const syncedAvatars: Record<string, string> = payload.avatars || {};
            const syncedStatusMessages: Record<string, string> = payload.statusMessages || {};
            setActiveKeys((prev) => ({ ...prev, ...syncedKeys }));

            // Update activeUsers array with usernames, status, avatars, and status messages
            setActiveUsers((prev) => {
              const updated = prev.map((u) => {
                const pk = syncedKeys[u.username];
                const av = syncedAvatars[u.username];
                const sm = syncedStatusMessages[u.username];
                const isOnline = !!pk;
                return {
                  ...u,
                  status: (isOnline ? "online" : "offline") as "online" | "offline",
                  publicKey: pk || u.publicKey,
                  avatar: av || u.avatar,
                  statusMessage: sm !== undefined ? sm : u.statusMessage
                };
              });

              for (const [name, key] of Object.entries(syncedKeys)) {
                if (!updated.some((u) => u.username === name)) {
                  updated.push({
                    username: name,
                    status: "online",
                    publicKey: key,
                    avatar: syncedAvatars[name] || "🦊",
                    statusMessage: syncedStatusMessages[name] || ""
                  });
                }
              }
              return updated;
            });
            break;
          }

          case "user:presence": {
            const { username: presUsername, publicKey: presKey, avatar: presAvatar, status, statusMessage: presStatusMsg } = payload;
            if (status === "online") {
              setActiveUsers((prev) => {
                const filtered = prev.filter(u => u.username !== presUsername);
                return [...filtered, { 
                  username: presUsername, 
                  status: "online", 
                  publicKey: presKey || "none", 
                  avatar: presAvatar || "🦊",
                  statusMessage: presStatusMsg || ""
                }];
              });
              logSecurity(`Presence: User @${presUsername} is online (${presStatusMsg || "no status message"})`);
            } else {
              setActiveUsers((prev) => {
                const exists = prev.some(u => u.username === presUsername);
                if (exists) {
                  return prev.map(u => u.username === presUsername ? { ...u, status: "offline" as "online" | "offline" } : u);
                } else {
                  return [...prev, { username: presUsername, status: "offline" as "online" | "offline", avatar: "🦊" }];
                }
              });
              logSecurity(`Presence: User @${presUsername} logged off`);
            }
            break;
          }

          case "room:created": {
            const newRoom: Room = payload.room;
            if (newRoom.isGroup && newRoom.privacy === "private") {
              const isAllowed = newRoom.createdBy === username || (newRoom.members && newRoom.members.includes(username));
              if (!isAllowed) {
                break;
              }
            }
            setRooms((prev) => {
              if (prev.some(r => r.id === newRoom.id)) return prev;
              return [...prev, newRoom];
            });
            logSecurity(`New chat channel created: #${newRoom.name}`);
            break;
          }

          case "room:privacy_updated": {
            const { roomId, privacy, room } = payload;
            
            if (activeRoomId === roomId) {
              const isAllowed = !room.isGroup || privacy !== "private" || 
                room.createdBy === username || 
                (room.members && room.members.includes(username));
              if (!isAllowed) {
                setActiveRoomId("general");
              }
            }

            setRooms((prev) => {
              const isAllowed = !room.isGroup || privacy !== "private" || 
                room.createdBy === username || 
                (room.members && room.members.includes(username));
                
              if (!isAllowed) {
                return prev.filter(r => r.id !== roomId);
              }
              
              const exists = prev.some(r => r.id === roomId);
              if (exists) {
                return prev.map(r => r.id === roomId ? { ...r, privacy } : r);
              } else {
                return [...prev, room];
              }
            });
            
            logSecurity(`Channel #${room.name} privacy changed to ${privacy}`);
            break;
          }

          case "room:sync_history": {
            const { roomId, members, messages: roomMessages, encryptedKeys } = payload;
            
            setRooms((prev) =>
              prev.map((r) =>
                r.id === roomId ? { ...r, members, encryptedKeys } : r
              )
            );

            // Store plaintext messages immediately
            setMessages((prev) => ({
              ...prev,
              [roomId]: roomMessages
            }));
            logSecurity(`Loaded ${roomMessages.length} messages for channel #${roomId}`);
            break;
          }

          case "room:keys_updated": {
            const { roomId, encryptedKeys } = payload;
            setRooms((prev) =>
              prev.map((r) =>
                r.id === roomId ? { ...r, encryptedKeys } : r
              )
            );
            break;
          }

          case "room:user_joined": {
            const { roomId, username: joinedUser, members } = payload;
            setRooms((prev) =>
              prev.map((r) =>
                r.id === roomId ? { ...r, members } : r
              )
            );
            logSecurity(`User @${joinedUser} has joined #${roomId}`);
            break;
          }

          case "message:received": {
            const { roomId, message } = payload;

            setMessages((prev) => {
              const currentRoomMessages = prev[roomId] || [];
              const exists = currentRoomMessages.some((msg) => msg.id === message.id);
              if (exists) {
                return prev;
              }
              return {
                ...prev,
                [roomId]: [...currentRoomMessages, message]
              };
            });

            // BROWSER PUSH NOTIFICATION SYSTEM
            if (message.sender !== userHandle) {
              const isRoomNotActive = roomId !== activeRoomId;
              const isDocHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
              
              const targetRoom = rooms.find(r => r.id === roomId);
              const isGroup = targetRoom ? targetRoom.isGroup : false;
              
              // Detect explicit @mentions (e.g. @username)
              const isMentioned = !!(message.ciphertext && message.ciphertext.toLowerCase().includes(`@${userHandle.toLowerCase()}`));
              
              // Load mute configurations
              let isRoomMuted = false;
              if (typeof window !== "undefined") {
                const mutedListStr = localStorage.getItem("muted_rooms_list") || "[]";
                try {
                  const mutedList: string[] = JSON.parse(mutedListStr);
                  isRoomMuted = mutedList.includes(roomId);
                } catch (e) {}
              }
              const isGroupMutedGlobally = localStorage.getItem("notifications_mute_groups") === "true";
              
              // If it's a group, evaluate if general notifications are muted
              const shouldMuteGeneral = isGroup && (isGroupMutedGlobally || isRoomMuted);
              
              // 1. Play notification sound
              // Mentions ALWAYS trigger sound in groups. Others only trigger if sound enabled and not muted.
              const soundEnabled = localStorage.getItem("notifications_sound_enabled") !== "false";
              const playSoundOnMention = isGroup && isMentioned && soundEnabled;
              const playSoundOnNormal = soundEnabled && !shouldMuteGeneral && (isRoomNotActive || isDocHidden);
              
              if (playSoundOnMention || playSoundOnNormal) {
                const preset = localStorage.getItem("notifications_sound_preset") || "chime";
                const vol = parseFloat(localStorage.getItem("notifications_sound_volume") || "0.5");
                playNotificationSound(preset, vol);
              }
              
              // 2. Trigger screen flash for alerts
              if (isMentioned || (!shouldMuteGeneral && (isRoomNotActive || isDocHidden))) {
                triggerScreenFlash();
              }
              
              // 3. Set persistent in-app banner for mentions in group chat
              if (isGroup && isMentioned) {
                setActiveMentionBanner({
                  id: message.id,
                  roomId,
                  roomName: targetRoom ? targetRoom.name : "Group Chat",
                  sender: message.sender,
                  text: message.ciphertext || "Sent a message"
                });
              }
              
              // 4. Desktop push notifications
              const desktopEnabled = localStorage.getItem("notifications_enabled") !== "false";
              const shouldShowDesktop = desktopEnabled && (isMentioned || !shouldMuteGeneral);
              
              if (shouldShowDesktop && (isRoomNotActive || isDocHidden)) {
                if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                  let notifTitle = `Message from @${message.sender}`;
                  let notifBody = message.ciphertext || "Sent a message";
                  
                  if (targetRoom) {
                    if (targetRoom.isGroup) {
                      notifTitle = (isMentioned ? "⚠️ MENTIONED • " : "") + `#${targetRoom.name} • @${message.sender}`;
                    } else {
                      notifTitle = `@${message.sender}`;
                    }
                  }
                  
                  if (message.isAudio) {
                    notifBody = "🎙️ Sent an audio voice memo";
                  } else if (message.isMedia) {
                    notifBody = `📷 Shared file: ${message.fileName || "attachment"}`;
                  }
                  
                  if (notifBody.length > 90) {
                    notifBody = notifBody.slice(0, 90) + "...";
                  }
                  
                  try {
                    const no = new Notification(notifTitle, {
                      body: notifBody,
                      icon: "https://cdn-icons-png.flaticon.com/512/5609/5609141.png"
                    });
                    no.onclick = () => {
                      window.focus();
                      setActiveRoomId(roomId);
                    };
                  } catch (err) {
                    console.error("Notification trigger failing:", err);
                  }
                }
              }
            }
            break;
          }

          case "typing:update": {
            const { roomId, username: typingUser, isTyping } = payload;
            setTypingUsersRecord((prev) => {
              const existing = prev[roomId] || [];
              const updated = isTyping
                ? [...existing.filter(u => u !== typingUser), typingUser]
                : existing.filter(u => u !== typingUser);
              return { ...prev, [roomId]: updated };
            });
            break;
          }

          case "friend:request_received": {
            const { request } = payload;
            if (request && request.receiver.toLowerCase() === userHandle.toLowerCase()) {
              triggerScreenFlash();
              fetchPendingRequestsCount(userHandle);
              logSecurity(`Received a friend request from @${request.sender}`);

              // Play custom notification sound if enabled
              const soundEnabled = localStorage.getItem("notifications_sound_enabled") !== "false";
              if (soundEnabled) {
                const preset = localStorage.getItem("notifications_sound_preset") || "chime";
                const vol = parseFloat(localStorage.getItem("notifications_sound_volume") || "0.5");
                playNotificationSound(preset, vol);
              }

              const desktopEnabled = localStorage.getItem("notifications_enabled") !== "false";
              if (desktopEnabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                try {
                  const no = new Notification("New Friend Request", {
                    body: `@${request.sender} sent you a friend request!`,
                    icon: "https://cdn-icons-png.flaticon.com/512/5609/5609141.png"
                  });
                  no.onclick = () => {
                    window.focus();
                    setIsFriendsModalOpen(true);
                  };
                } catch (err) {
                  console.error("Failed to showcase notification:", err);
                }
              }
            }
            break;
          }

          case "message:reaction_updated": {
            const { roomId, messageId, reactions } = payload;
            setMessages((prev) => {
              const rMessages = prev[roomId] || [];
              const updated = rMessages.map((msg) =>
                msg.id === messageId ? { ...msg, reactions } : msg
              );
              return {
                ...prev,
                [roomId]: updated
              };
            });
            break;
          }

          case "message:poll_updated": {
            const { roomId, messageId, pollOptions } = payload;
            setMessages((prev) => {
              const rMessages = prev[roomId] || [];
              const updated = rMessages.map((msg) =>
                msg.id === messageId ? { ...msg, pollOptions } : msg
              );
              return {
                ...prev,
                [roomId]: updated
              };
            });
            break;
          }

          case "message:read_receipt": {
            const { roomId, messages: readReceiptMessages } = payload;
            setMessages((prev) => ({
              ...prev,
              [roomId]: readReceiptMessages
            }));
            break;
          }

          case "message:edited": {
            const { roomId, messageId, text, isEdited } = payload;
            setMessages((prev) => {
              const rMessages = prev[roomId] || [];
              const updated = rMessages.map((msg) =>
                msg.id === messageId ? { ...msg, ciphertext: text, isEdited } : msg
              );
              return {
                ...prev,
                [roomId]: updated
              };
            });
            break;
          }

          case "message:deleted": {
            const { roomId, messageId, isDeleted } = payload;
            setMessages((prev) => {
              const rMessages = prev[roomId] || [];
              const updated = rMessages.map((msg) =>
                msg.id === messageId ? { ...msg, ciphertext: "This message was deleted", isDeleted } : msg
              );
              return {
                ...prev,
                [roomId]: updated
              };
            });
            break;
          }

          case "call:incoming": {
            const { roomId, callType, caller, participants } = payload;
            if (caller !== userHandle) {
              setIncomingCall({ roomId, callType, caller, status: "ringing", participants });
              logSecurity(`Incoming ${callType} call from @${caller} in room #${roomId}`);
              
              // Set call tracking refs for receiver
              callRoomIdRef.current = roomId;
              callTypeRef.current = callType;
              callIsOutgoingRef.current = false;
              callWasConnectedRef.current = false;
              callConnectedTimeRef.current = null;

              playRingSound();
            }
            break;
          }

          case "call:accepted": {
            const { roomId, username: acceptedUsername, participants } = payload;
            logSecurity(`@${acceptedUsername} accepted the call for room #${roomId}`);
            stopRingSound();
            setActiveCall((prev) => {
              if (prev && prev.roomId === roomId) {
                return { ...prev, status: "active", participants };
              }
              return prev;
            });

            // If we are the initiating caller, start WebRTC offer to this accepted user
            const currentSession = activeCallRef.current;
            if (userHandle !== acceptedUsername && currentSession && currentSession.caller === userHandle) {
              // Update call connected state for initiator
              callConnectedTimeRef.current = Date.now();
              callWasConnectedRef.current = true;
              initiatePeerConnection(acceptedUsername, roomId);
            }
            break;
          }

          case "call:declined": {
            const { roomId, username: declinedUsername } = payload;
            logSecurity(`@${declinedUsername} declined the call for room #${roomId}`);
            stopRingSound();
            if (incomingCall && incomingCall.roomId === roomId && incomingCall.caller === declinedUsername) {
              setIncomingCall(null);
            }
            break;
          }

          case "call:ended": {
            const { roomId } = payload;
            logSecurity(`The call in room #${roomId} has ended`);
            stopRingSound();
            
            completeCallSessionAndLog();

            cleanupCallMedia();
            setActiveCall(null);
            setIncomingCall(null);
            break;
          }

          case "call:participant_left": {
            const { roomId, username: leftUsername, participants } = payload;
            logSecurity(`@${leftUsername} left the call in room #${roomId}`);
            setActiveCall((prev) => {
              if (prev && prev.roomId === roomId) {
                return { ...prev, participants };
              }
              return prev;
            });

            if (peerConnectionsRef.current[leftUsername]) {
              peerConnectionsRef.current[leftUsername].close();
              delete peerConnectionsRef.current[leftUsername];
            }
            break;
          }

          case "call:signal": {
            const { roomId, from, signal } = payload;
            handleSignalingMessage(from, signal);
            break;
          }

          case "friend:request_accepted": {
            const { request, room } = payload;
            fetchPendingRequestsCount(userHandle);
            if (request && room && (request.sender.toLowerCase() === userHandle.toLowerCase() || request.receiver.toLowerCase() === userHandle.toLowerCase())) {
              triggerScreenFlash();
              setRooms((prev) => {
                if (prev.some(r => r.id === room.id)) return prev;
                return [...prev, room];
              });
              const companion = request.sender.toLowerCase() === userHandle.toLowerCase() ? request.receiver : request.sender;
              logSecurity(`Friend request accepted! Encrypted chat channel created with @${companion}`);
            }
            break;
          }

          case "friend:request_declined": {
            const { request } = payload;
            if (request && (request.sender.toLowerCase() === userHandle.toLowerCase() || request.receiver.toLowerCase() === userHandle.toLowerCase())) {
              fetchPendingRequestsCount(userHandle);
            }
            break;
          }

          default:
            console.log("Unknown WS type:", type);
        }
      } catch (err) {
        console.error("Error handshaking WS message payload:", err);
      }
    };

    socket.onclose = () => {
      setWsConnected(false);
      logSecurity("WebSocket Connection Closed. Retrying in 3 seconds...");
      setTimeout(() => {
        if (isLogged) connectWebSocket(userHandle, emailAddr, userAvatar);
      }, 3000);
    };

    socket.onerror = (err) => {
      console.error("WebSocket socket error:", err);
    };
  }, [isLogged, rooms, activeRoomId, logSecurity]);

  // Synchronize read status when viewing active room messages
  useEffect(() => {
    if (!activeRoomId || !username || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    const roomMessages = messages[activeRoomId] || [];
    const hasUnread = roomMessages.some(
      (m) => m.sender !== username && (!m.readBy || !m.readBy.includes(username))
    );
    
    if (hasUnread) {
      wsRef.current.send(JSON.stringify({
        type: "message:read",
        roomId: activeRoomId,
        username
      }));
    }
  }, [activeRoomId, messages, username]);

  // Load existing credentials state from localStorage on init
  useEffect(() => {
    const storedUsername = localStorage.getItem("secure_chat_username");
    const storedEmail = localStorage.getItem("secure_chat_email");
    const storedAvatar = localStorage.getItem("secure_chat_avatar");
    const storedStatus = localStorage.getItem("secure_chat_status") || "";

    if (storedUsername && storedEmail) {
      try {
        const resolvedEmail = storedEmail;
        const resolvedAvatar = storedAvatar || "🦊";
        
        setUsername(storedUsername);
        setEmail(resolvedEmail);
        setAvatar(resolvedAvatar);
        setStatusMessage(storedStatus);
        setIsLogged(true);

        if (typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "default") {
            Notification.requestPermission();
          }
        }

        connectWebSocket(storedUsername, resolvedEmail, resolvedAvatar);
        logSecurity(`Restored active account session for @${storedUsername}`);
        fetchPendingRequestsCount(storedUsername);
      } catch (e) {
        console.error("Restoring session failed", e);
      }
    } else {
      logSecurity("Awaiting login credentials verification.");
    }
  }, []);

  // Handle registration
  const handleRegisterIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!registerEmail.trim() || !registerPassword || !registerUsername.trim()) {
      setErrorMsg("All registration fields are required.");
      return;
    }

    setRegistering(true);
    logSecurity("Creating safe sandbox. Registering account credentials...");

    try {
      let emailToRegister = registerEmail.trim();

      try {
        // 1. Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, registerEmail.trim(), registerPassword);
        const fbUser = userCredential.user;
        emailToRegister = fbUser.email || registerEmail.trim();
        logSecurity("Account registered successfully in Firebase Auth sandbox.");
      } catch (fbErr: any) {
        console.warn("Firebase Auth registration failed, using backend-only storage fallback:", fbErr);
        logSecurity(`Firebase auth failed (${fbErr.code || fbErr.message}). Registering directly with secure server database.`);
      }

      // 2. Register user on traditional backend
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailToRegister,
          password: registerPassword,
          username: registerUsername.trim(),
          avatar: registerAvatar,
          rsaPublicKeyJwk: "none",
          rsaPrivateKeyJwk: "none"
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to complete account registration on the server.");
      }

      // Save credentials locally
      localStorage.setItem("secure_chat_username", registerUsername.trim());
      localStorage.setItem("secure_chat_email", registerEmail.trim());
      localStorage.setItem("secure_chat_avatar", registerAvatar);
      localStorage.setItem("secure_chat_status", "");

      // Update states
      setUsername(registerUsername.trim());
      setEmail(registerEmail.trim());
      setAvatar(registerAvatar);
      setStatusMessage("");
      setIsLogged(true);

      logSecurity(`Registered user and unlocked active workspace for @${registerUsername.trim()}`);
      connectWebSocket(registerUsername.trim(), registerEmail.trim(), registerAvatar);
      fetchPendingRequestsCount(registerUsername.trim());

      if (typeof window !== "undefined" && "Notification" in window) {
        Notification.requestPermission();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during account registration.");
      logSecurity(`Error during registration: ${err.message}`);
    } finally {
      setRegistering(false);
    }
  };

  // Handle logging in
  const handleLoginIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!loginEmail.trim() || !loginPassword) {
      setErrorMsg("Email and password are required credentials.");
      return;
    }

    setRegistering(true);
    logSecurity("Contacting authentication server...");

    try {
      let usr = "";
      let av = "🦊";
      let statusMsg = "";
      let success = false;

      try {
        // 1. Try Firebase Email/Password Sign In
        const userCredential = await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
        const fbUser = userCredential.user;
        
        // 2. Sync profile from backend
        const res = await fetch("/api/auth/firebase-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: fbUser.email })
        });

        if (res.ok) {
          const data = await res.json();
          usr = data.user.username;
          av = data.user.avatar;
          statusMsg = data.user.statusMessage || "";
          success = true;
        } else {
          // Profile does not exist on the backend yet, but exists in Firebase Auth.
          // Let's create a server-side profile on the fly!
          const registerRes = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: fbUser.email,
              password: loginPassword,
              username: fbUser.email ? fbUser.email.split("@")[0].slice(0, 15) : "User",
              avatar: "🦊"
            })
          });
          const data = await registerRes.json();
          if (registerRes.ok) {
            usr = data.user.username;
            av = data.user.avatar;
            statusMsg = data.user.statusMessage || "";
            success = true;
          } else {
            throw new Error(data.error || "Failed to synchronize profile with the server.");
          }
        }
      } catch (fbErr: any) {
        console.warn("Firebase sign-in failed, trying backend fallback...", fbErr);
        // Fallback to traditional backend-only login if Firebase fails (e.g. provider not yet configured or legacy user)
        const fallbackRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: loginEmail.trim(),
            password: loginPassword
          })
        });

        const fallbackData = await fallbackRes.json();
        if (!fallbackRes.ok) {
          // If fallback also fails, we throw the Firebase error or fallback error
          throw new Error(fbErr.message || fallbackData.error || "Failed to login.");
        }

        usr = fallbackData.user.username;
        av = fallbackData.user.avatar;
        statusMsg = fallbackData.user.statusMessage || "";
        success = true;
      }

      if (success) {
        // Save session locally
        localStorage.setItem("secure_chat_username", usr);
        localStorage.setItem("secure_chat_email", loginEmail.trim());
        localStorage.setItem("secure_chat_avatar", av);
        localStorage.setItem("secure_chat_status", statusMsg);

        // Set states
        setUsername(usr);
        setEmail(loginEmail.trim());
        setAvatar(av);
        setStatusMessage(statusMsg);
        setIsLogged(true);

        logSecurity(`Welcome back to the unified space, @${usr}! Accounts verified successfully.`);
        connectWebSocket(usr, loginEmail.trim(), av);
        fetchPendingRequestsCount(usr);

        if (typeof window !== "undefined" && "Notification" in window) {
          Notification.requestPermission();
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during authentication.");
      logSecurity(`Error during login: ${err.message}`);
    } finally {
      setRegistering(false);
    }
  };

  // Handle Google Sign-In / Account Creation
  const handleGoogleSignIn = async () => {
    setErrorMsg("");
    setRegistering(true);
    logSecurity("Initiating Google Sign-In connection popup...");

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      if (!fbUser.email) {
        throw new Error("No email returned from Google authentication.");
      }

      // Sync/register on traditional backend
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fbUser.email,
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to complete Google authentication on the server.");
      }

      const { username: usr, avatar: av, statusMessage: statusMsg } = data.user;

      // Save credentials locally
      localStorage.setItem("secure_chat_username", usr);
      localStorage.setItem("secure_chat_email", fbUser.email);
      localStorage.setItem("secure_chat_avatar", av);
      localStorage.setItem("secure_chat_status", statusMsg || "");

      // Update states
      setUsername(usr);
      setEmail(fbUser.email);
      setAvatar(av);
      setStatusMessage(statusMsg || "");
      setIsLogged(true);

      logSecurity(`Welcome back to the unified space, @${usr}! Signed in via Google.`);
      connectWebSocket(usr, fbUser.email, av);
      fetchPendingRequestsCount(usr);

      if (typeof window !== "undefined" && "Notification" in window) {
        Notification.requestPermission();
      }
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || "An unexpected error occurred during Google Sign-In.";
      if (err.code === "auth/operation-not-allowed" || (err.message && err.message.includes("operation-not-allowed"))) {
        errMsg = "Google Sign-In is not enabled in this Firebase project console. Please sign up or sign in using an Email & Password instead!";
      }
      setErrorMsg(errMsg);
      logSecurity(`Error during Google Sign-In: ${err.message}`);
    } finally {
      setRegistering(false);
    }
  };

  // Handle updating user profile handle, avatar icon, and password
  const handleUpdateProfile = async (
    newUsername: string,
    newAvatar: string,
    oldPassword?: string,
    newPassword?: string,
    newStatusMessage?: string
  ) => {
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username: newUsername,
          avatar: newAvatar,
          oldPassword,
          newPassword,
          statusMessage: newStatusMessage
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile settings.");
      }

      const updatedStatus = data.user?.statusMessage || newStatusMessage || "";

      // Update local storage
      localStorage.setItem("secure_chat_username", newUsername);
      localStorage.setItem("secure_chat_avatar", newAvatar);
      localStorage.setItem("secure_chat_status", updatedStatus);

      // Update local state
      setUsername(newUsername);
      setAvatar(newAvatar);
      setStatusMessage(updatedStatus);

      logSecurity(`Profile updated on database. Synchronizing username @${newUsername}, avatar ${newAvatar} and status "${updatedStatus}"...`);

      // Broadcast changes via websocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "user:register",
          username: newUsername,
          publicKey: "none",
          avatar: newAvatar
        }));
      }
    } catch (err: any) {
      console.error(err);
      logSecurity(`Profile update failed: ${err.message}`);
      throw err;
    }
  };

  // Select active room channel
  const handleSelectRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setMobileView("chat");
    setSidebarActiveTab("chats");
    logSecurity(`Loading chat stream: #${roomId}`);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "room:join",
        roomId,
        username
      }));
    }
  };

  // Create a brand new DM or Group Chat room (no encryption keys required!)
  const handleCreateRoom = async (roomName: string, isGroup: boolean, inviteeUsername?: string, avatar?: string, privacy?: "public" | "private") => {
    const roomId = isGroup 
      ? `group-${Math.random().toString(36).substring(2, 9)}`
      : `dm-${[username, inviteeUsername].sort().join("-")}`.replace(/\s+/g, "");

    logSecurity(`Instantiated new conversation channel #${roomName}`);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "room:create",
        id: roomId,
        name: roomName,
        isGroup,
        createdBy: username,
        encryptedKeys: {},
        avatar,
        privacy: privacy || "public"
      }));

      // Autojoin newly created room
      setTimeout(() => {
        handleSelectRoom(roomId);
      }, 300);
    }
  };

  const handleUpdateRoomPrivacy = (roomId: string, privacy: "public" | "private") => {
    logSecurity(`Changing privacy of channel #${roomId} to ${privacy}`);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "room:update_privacy",
        roomId,
        privacy,
        username
      }));
    }
  };

  const handleStartPrivateChat = async (friendUsername: string) => {
    const roomId = `dm-${[username, friendUsername].sort().join("-")}`.replace(/\s+/g, "").toLowerCase();
    const roomExists = rooms.some(r => r.id === roomId);
    if (roomExists) {
      handleSelectRoom(roomId);
    } else {
      await handleCreateRoom(`${username} & ${friendUsername}`, false, friendUsername);
    }
  };

  // Send plaintext messages over websocket
  const handleSendMessage = async (textVal: string) => {
    try {
      const messageObj: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: username,
        timestamp: Date.now(),
        ciphertext: textVal,
        iv: "unencrypted"
      };

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "message:send",
          roomId: activeRoomId,
          message: messageObj
        }));
      }
    } catch (err) {
      logSecurity(`Message send failed: ${err}`);
    }
  };

  // React to a message using emoji
  const handleReactToMessage = useCallback((messageId: string, emoji: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "message:react",
        roomId: activeRoomId,
        messageId,
        emoji,
        username
      }));
    }
  }, [activeRoomId, username]);

  // Edit an existing message
  const handleEditMessage = useCallback((messageId: string, newText: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "message:edit",
        roomId: activeRoomId,
        messageId,
        text: newText,
        username
      }));
    }
  }, [activeRoomId, username]);

  // Delete an existing message
  const handleDeleteMessage = useCallback((messageId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "message:delete",
        roomId: activeRoomId,
        messageId,
        username
      }));
    }
  }, [activeRoomId, username]);

  // Forward an existing message to a different room
  const handleForwardMessage = useCallback((messageToForward: Message, targetRoomId: string) => {
    try {
      const messageObj: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: username,
        timestamp: Date.now(),
        ciphertext: messageToForward.ciphertext,
        iv: messageToForward.iv,
        isMedia: messageToForward.isMedia,
        mediaType: messageToForward.mediaType,
        isAudio: messageToForward.isAudio,
        fileName: messageToForward.fileName,
        fileSize: messageToForward.fileSize,
        isPoll: messageToForward.isPoll,
        pollQuestion: messageToForward.pollQuestion,
        pollOptions: messageToForward.pollOptions ? messageToForward.pollOptions.map((opt, i) => ({
          id: `opt-${i}-${Math.random().toString(36).substring(2, 7)}`,
          text: opt.text,
          votes: []
        })) : undefined,
        isForwarded: true,
        forwardedFrom: messageToForward.sender
      };

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "message:send",
          roomId: targetRoomId,
          message: messageObj
        }));
        logSecurity(`Forwarded message to room: #${targetRoomId}`);
      }
    } catch (err) {
      logSecurity(`Failed to forward message: ${err}`);
    }
  }, [username]);

  // Create and send a new poll
  const handleSendPoll = useCallback((question: string, options: string[]) => {
    try {
      const messageObj: Message = {
        id: `poll-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: username,
        timestamp: Date.now(),
        ciphertext: `Poll: ${question}`,
        iv: "unencrypted",
        isPoll: true,
        pollQuestion: question,
        pollOptions: options
          .filter(opt => opt.trim() !== "")
          .map((text, i) => ({
            id: `opt-${i}-${Math.random().toString(36).substring(2, 7)}`,
            text: text.trim(),
            votes: []
          }))
      };

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "message:send",
          roomId: activeRoomId,
          message: messageObj
        }));
      }
    } catch (err) {
      console.error(`Poll creation failed: ${err}`);
    }
  }, [activeRoomId, username]);

  // Vote or toggle a vote on a poll option
  const handleVotePoll = useCallback((messageId: string, optionId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "message:vote",
        roomId: activeRoomId,
        messageId,
        optionId,
        username
      }));
    }
  }, [activeRoomId, username]);

  // Upload file or media as Data URL
  const handleSendFile = async (file: File) => {
    logSecurity(`Uploading file ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`);

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const messageObj: Message = {
          id: `msg-${Date.now()}`,
          sender: username,
          timestamp: Date.now(),
          ciphertext: dataUrl,
          iv: "unencrypted",
          isMedia: true,
          mediaType: file.type,
          fileName: file.name,
          fileSize: file.size
        };

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "message:send",
            roomId: activeRoomId,
            message: messageObj
          }));
          logSecurity(`Dispatched file ${file.name} completely!`);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      logSecurity(`File upload failed: ${err}`);
    }
  };

  // Upload recorded voice note as Data URL
  const handleSendVoice = async (audioBlob: Blob) => {
    logSecurity("Uploading voice memo recording...");

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const messageObj: Message = {
          id: `msg-${Date.now()}`,
          sender: username,
          timestamp: Date.now(),
          ciphertext: dataUrl,
          iv: "unencrypted",
          isAudio: true,
          mediaType: "audio/webm",
          fileName: "voice_note.webm",
          fileSize: audioBlob.size
        };

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "message:send",
            roomId: activeRoomId,
            message: messageObj
          }));
          logSecurity("Dispatched voice recording successfully.");
        }
      };
      reader.readAsDataURL(audioBlob);
    } catch (err) {
      console.error(err);
      logSecurity(`Voice upload failed: ${err}`);
    }
  };

  // Share typing indicators
  const handleTypingStatus = (isTyping: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "typing:status",
        roomId: activeRoomId,
        username,
        isTyping
      }));
    }
  };

  // Log out of the workspace
  const handleLogout = () => {
    logSecurity("Flushing active user settings and clearing persistent memory sessions...");
    
    localStorage.removeItem("secure_chat_username");
    localStorage.removeItem("secure_chat_email");
    localStorage.removeItem("secure_chat_avatar");

    setUsername("");
    setEmail("");
    setAvatar("🦊");
    setIsLogged(false);
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const selectedRoomObj = rooms.find((r) => r.id === activeRoomId) || null;

  // 1. Render Login / Registration Forms on load if not logged-in
  if (!isLogged) {
    return (
      <div className={`h-screen bg-[#0F172A] bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] flex items-center justify-center p-4 ${fontSize} ${dyslexicFont ? "font-dyslexic-active" : "font-sans"} ${highContrast ? "high-contrast-active" : ""} ${increasedSpacing ? "spacing-expanded" : ""} ${reduceMotion ? "reduce-motion-active" : ""}`}>
        <div className="w-full max-w-sm bg-[#1E293B] border border-slate-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden">
          {/* Logo Heading */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-500/5">
              <MessageSquare className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-xl font-display font-semibold text-slate-100">
              Cooperative Unified Chat
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
              Real-time workspace communication. Configure your active profile, coordinate with colleagues, and share assets cleanly.
            </p>
          </div>

          {/* Toggle Tab Login / Register */}
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 mb-5 text-xs font-semibold">
            <button
              onClick={() => { setAuthMode("login"); setErrorMsg(""); }}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                authMode === "login" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode("register"); setErrorMsg(""); }}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                authMode === "register" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 mb-4 text-center">
              {errorMsg}
            </div>
          )}

          {/* Authenticate View */}
          {authMode === "login" ? (
            <form onSubmit={handleLoginIdentity} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 tracking-wider mb-1.5 uppercase flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  disabled={registering}
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-xl text-sm outline-none text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 tracking-wider mb-1.5 uppercase flex items-center gap-1">
                  <LockIcon className="w-3.5 h-3.5 text-slate-500" />
                  Account Password
                </label>
                <input
                  type="password"
                  required
                  disabled={registering}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-xl text-sm outline-none text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-700"
                />
              </div>

              <button
                type="submit"
                disabled={registering}
                className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 py-3 rounded-xl font-semibold text-xs text-white border border-indigo-500/30 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-indigo-600/10 disabled:opacity-55 select-none"
              >
                {registering ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    Authenticating credentials...
                  </>
                ) : (
                  <>
                    Sign In to Account
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Registration View */
            <form onSubmit={handleRegisterIdentity} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 tracking-wider mb-1.5 uppercase flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  disabled={registering}
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-xl text-sm outline-none text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 tracking-wider mb-1.5 uppercase flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                  Username
                </label>
                <input
                  type="text"
                  required
                  disabled={registering}
                  maxLength={15}
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value.replace(/\s+/g, ""))}
                  placeholder="sothea, alice"
                  className="w-full bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-xl text-sm outline-none text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 tracking-wider mb-1.5 uppercase flex items-center gap-1">
                  <LockIcon className="w-3.5 h-3.5 text-slate-500" />
                  Create Password
                </label>
                <input
                  type="password"
                  required
                  disabled={registering}
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-xl text-sm outline-none text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 tracking-wider mb-2 uppercase flex items-center gap-1">
                  <Smile className="w-3.5 h-3.5 text-slate-500" />
                  Select Avatar Emoji
                </label>
                <div className="grid grid-cols-5 gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  {["🦊", "🦁", "🐯", "🐼", "🐨", "🐱", "🐶", "🐭", "Ham", "🐰"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setRegisterAvatar(emoji)}
                      className={`text-xl p-2 rounded-xl transition-all cursor-pointer hover:bg-slate-800 hover:scale-110 active:scale-95 ${
                        registerAvatar === emoji ? "bg-indigo-600/30 border border-indigo-500/50 scale-105" : "border border-transparent"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={registering}
                className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 py-3 rounded-xl font-semibold text-xs text-white border border-indigo-500/30 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-indigo-600/10 disabled:opacity-55 select-none"
              >
                {registering ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    Registering Account...
                  </>
                ) : (
                  <>
                    Register & Setup Profile
                  </>
                )}
              </button>
            </form>
          )}

          {/* Google authentication integration divider and button */}
          <div className="relative my-5 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <span className="relative bg-[#1E293B] px-3 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
              Or continue with
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={registering}
            className="w-full bg-slate-900/60 hover:bg-slate-900/90 active:bg-slate-950 border border-slate-800/80 py-2.5 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 select-none shadow-md mb-5"
          >
            <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.9h6.69c-.29 1.5-.114 2.76-1.41 3.65v3.0h2.28c5.44-5.01 6.58-12.42 4.185-8.48z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.86-3.0c-1.08.72-2.45 1.16-4.1 1.16-3.15 0-5.81-2.13-6.76-5.01H1.17v3.1A12 12 0 0 0 12 24z"/>
              <path fill="#FBBC05" d="M5.24 14.24a7.15 7.15 0 0 1 0-4.48V6.66H1.17a12 12 0 0 0 0 10.68l4.07-3.1z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44A12 12 0 0 0 1.17 6.66l4.07 3.1c.95-2.88 3.61-5.01 6.76-5.01z"/>
            </svg>
            Google Account
          </button>

          {/* Clean footer context */}
          <div className="pt-4 border-t border-slate-800/80 text-center text-[10px] text-slate-600 font-medium">
            Active Workspace Services Online
          </div>
        </div>
      </div>
    );
  }

  // 2. Verified Logged-In Chat Dashboard structure
  const theme = getTheme(activeThemeId);

  return (
    <div className={`h-screen ${theme.bgMain} flex ${dyslexicFont ? "font-dyslexic-active" : "font-sans"} ${theme.textMain} ${fontSize} ${highContrast ? "high-contrast-active" : ""} ${increasedSpacing ? "spacing-expanded" : ""} ${reduceMotion ? "reduce-motion-active" : ""} overflow-hidden relative`}>
      {justMentionedFlash && (
        <div className="absolute inset-0 z-[100] pointer-events-none ring-8 ring-amber-500/80 bg-amber-550/5 mix-blend-screen" />
      )}
      {/* Top network connectivity status alerts */}
      <div className="absolute top-2 right-4 z-40 text-[10px] hidden sm:flex items-center gap-2 bg-[#1E293B]/80 border border-slate-800 px-3 py-1 rounded-full select-none backdrop-blur-md">
        {wsConnected ? (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400 font-mono">CONNECTION ACTIVE</span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-amber-500 font-mono">RECONNECTING...</span>
          </>
        )}
      </div>

      {/* Persistent Group Mention Banner */}
      {activeMentionBanner && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div className="bg-slate-900/95 border border-amber-500/40 text-slate-100 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-start gap-3 animate-fade-in">
            <div className="p-2 bg-amber-500/15 text-amber-400 rounded-xl shrink-0 mt-0.5 animate-pulse">
              <Bell className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-400 font-mono">
                  🚨 Mentioned in #{activeMentionBanner.roomName}
                </span>
                <span className="text-[8px] text-slate-500 font-mono font-bold">NEW</span>
              </div>
              <h4 className="text-[11px] font-bold text-slate-200 mt-1">
                From @{activeMentionBanner.sender}:
              </h4>
              <p className="text-[10.5px] text-slate-350 leading-relaxed mt-0.5 truncate italic">
                "{activeMentionBanner.text}"
              </p>
              
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRoomId(activeMentionBanner.roomId);
                    setActiveMentionBanner(null);
                  }}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[9px] rounded-lg tracking-wider uppercase transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  View Chat &rarr;
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMentionBanner(null)}
                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 font-extrabold text-[9px] rounded-lg tracking-wider uppercase transition-all cursor-pointer active:scale-95 border border-white/5"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Primary Navigation Sidebar */}
      <div className={`h-full shrink-0 ${mobileView === "list" ? "w-full flex" : "hidden"} md:flex md:w-80`}>
        <Sidebar
          currentUsername={username}
          currentUserAvatar={avatar}
          onEditProfile={() => setIsProfileModalOpen(true)}
          rooms={rooms}
          activeRoomId={activeRoomId}
          activeUsers={activeUsers}
          onSelectRoom={handleSelectRoom}
          onOpenNewConversation={() => setIsRoomModalOpen(true)}
          onLogout={handleLogout}
          publicKeyFingerprint="none"
          hasAesKey={() => true}
          securityLogs={securityLogs}
          activeThemeId={activeThemeId}
          onOpenFriendsList={() => setIsFriendsModalOpen(true)}
          pendingRequestsCount={pendingRequestsCount}
          callHistory={callHistory}
          onClearCallHistory={handleClearCallHistory}
          activeTab={sidebarActiveTab}
          onTabChange={(tab) => {
            setSidebarActiveTab(tab);
            if (tab === "chats") {
              setMobileView("list");
            }
          }}
          typingUsersRecord={typingUsersRecord}
        />
      </div>

      {/* Main Active Area */}
      <div className={`h-full flex-1 ${mobileView === "chat" ? "w-full flex" : "hidden"} md:flex`}>
        <ChatWindow
          activeRoom={selectedRoomObj}
          currentUsername={username}
          messages={messages[activeRoomId] || []}
          onSendMessage={handleSendMessage}
          onSendFile={handleSendFile}
          onSendVoice={handleSendVoice}
          typingUsers={typingUsersRecord[activeRoomId] || []}
          onTyping={handleTypingStatus}
          hasAesKey={true}
          onNegotiateKey={() => {}}
          activeThemeId={activeThemeId}
          onBack={() => setMobileView("list")}
          onReactToMessage={handleReactToMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onSendPoll={handleSendPoll}
          onVotePoll={handleVotePoll}
          onInitiateCall={handleInitiateCall}
          onUpdateRoomPrivacy={handleUpdateRoomPrivacy}
          rooms={rooms}
          onForwardMessage={handleForwardMessage}
        />
      </div>

      {/* Dedicated room instantiation dialog */}
      <RoomModal
        isOpen={isRoomModalOpen}
        onClose={() => setIsRoomModalOpen(false)}
        activeUsers={activeUsers}
        currentUsername={username}
        onCreateRoom={handleCreateRoom}
      />

      {/* Profile settings modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        username={username}
        avatar={avatar}
        statusMessage={statusMessage}
        email={email}
        onUpdate={handleUpdateProfile}
        activeThemeId={activeThemeId}
        onSelectTheme={handleSelectTheme}
      />

      {/* Friends workspace modal */}
      <FriendsModal
        isOpen={isFriendsModalOpen}
        onClose={() => setIsFriendsModalOpen(false)}
        currentUsername={username}
        activeThemeId={activeThemeId}
        onStartPrivateChat={handleStartPrivateChat}
        onRefreshRooms={() => {
          fetchPendingRequestsCount(username);
        }}
      />

      {/* Incoming Call Dialog Overlay */}
      {incomingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center select-none shadow-2xl relative overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-indigo-500/10 opacity-60 pointer-events-none" />
            
            <div className="relative z-10">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-emerald-400 to-teal-500 flex items-center justify-center text-3xl font-bold text-white shadow-xl mb-4 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-30"></span>
                {incomingCall.caller.slice(0, 2).toUpperCase()}
              </div>
              
              <h3 className="text-lg font-bold text-white mb-1">
                @{incomingCall.caller}
              </h3>
              
              <p className="text-xs text-slate-400 mb-6 font-medium animate-pulse flex items-center justify-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
                Incoming {incomingCall.callType} call...
              </p>
              
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handleDeclineCall}
                  className="px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all text-white font-semibold text-xs flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  <PhoneOff className="w-4 h-4" />
                  Decline
                </button>
                <button
                  onClick={handleAcceptCall}
                  className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all text-white font-semibold text-xs flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  <Phone className="w-4 h-4" />
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Calling Dashboard / Screen Modal */}
      {activeCall && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white select-none animate-fadeIn">
          {/* Header Panel */}
          <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between bg-slate-900 bg-opacity-40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-400 to-indigo-500 flex items-center justify-center font-bold text-xs text-white">
                LIVE
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {activeCall.callType} call session
                </h3>
                <p className="text-[10px] text-emerald-400 font-semibold animate-pulse mt-0.5">
                  {activeCall.status === "ringing" ? "Ringing participants..." : "In encrypted conversation"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 text-[10px] font-mono text-slate-300">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Participants: {activeCall.participants.length}</span>
            </div>
          </div>

          {/* Central Stage (Media Display Pane) */}
          <div className="flex-1 p-6 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Ambient Background Grid and Aura */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.03)_0_70%,transparent_100%)] pointer-events-none" />
            
            {activeCall.callType === "video" ? (
              <div className="w-full max-w-4xl h-full max-h-[500px] grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10 animate-scaleUp">
                {/* Local Camera stream */}
                <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-white/5 shadow-2xl flex flex-col items-center justify-center h-full">
                  {!isVideoMuted && localStreamRef.current ? (
                    <video
                      ref={(el) => {
                        if (el && localStreamRef.current) {
                          el.srcObject = localStreamRef.current;
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  ) : (
                    <div className="text-center animate-fadeIn">
                      <div className="w-16 h-16 mx-auto rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl font-bold text-indigo-400 mb-2">
                        {username.slice(0, 2).toUpperCase()}
                      </div>
                      <p className="text-[10px] text-slate-400">Your camera is off</p>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-slate-300">
                    You {isAudioMuted && "(Muted)"}
                  </div>
                </div>

                {/* Remote Participant stream */}
                <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-white/5 shadow-2xl flex flex-col items-center justify-center h-full">
                  {remoteStream ? (
                    <video
                      ref={(el) => {
                        if (el) {
                          el.srcObject = remoteStream;
                        }
                      }}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center animate-fadeIn">
                      <div className="w-16 h-16 mx-auto rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-xl font-bold text-cyan-400 mb-2 animate-pulse">
                        {activeCall.caller === username ? "👤" : activeCall.caller.slice(0, 2).toUpperCase()}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {activeCall.status === "ringing" ? "Awaiting answer..." : "Connecting dynamic talking feed..."}
                      </p>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-slate-300">
                    {activeCall.participants.find(p => p !== username) || "Remote participant"}
                  </div>
                </div>
              </div>
            ) : (
              /* Voice Call Visualization Mode - Elegant bento card layout */
              <div className="w-full max-w-sm bg-slate-900/60 border border-white/5 rounded-3xl p-8 text-center relative z-10 shadow-2xl backdrop-blur-sm animate-scaleUp">
                <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-tr from-cyan-400 to-indigo-500 flex items-center justify-center text-4xl font-bold shadow-xl mb-6 relative">
                  <div className="absolute inset-0 rounded-full bg-cyan-400/20 animate-pulse" />
                  {activeCall.caller.slice(0, 2).toUpperCase()}
                </div>
                
                <h3 className="text-lg font-bold">
                  {activeCall.caller === username ? "Secure Call Channel" : `@${activeCall.caller}`}
                </h3>
                
                <p className="text-xs text-slate-400 mt-1 mb-6">
                  {activeCall.status === "ringing" ? "Calling companion line..." : "Encrypted audio talking lines live"}
                </p>

                {/* Animated Pulsing Sound Wave indicator lines */}
                <div className="flex items-center justify-center gap-1.5 h-8">
                  {[...Array(6)].map((_, i) => (
                    <span 
                      key={i} 
                      className="w-1 bg-gradient-to-t from-cyan-400 to-indigo-500 rounded-full animate-pulse"
                      style={{ 
                        height: activeCall.status === "ringing" ? "4px" : `${Math.floor(Math.random() * 24) + 6}px`,
                        animationDelay: `${i * 0.15}s`
                      }} 
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Control Ribbon Bottom Bar */}
          <div className="h-24 border-t border-white/5 flex items-center justify-center gap-6 bg-slate-900 bg-opacity-40">
            <button
              onClick={toggleAudioMute}
              className={`p-4 rounded-full transition-all active:scale-95 cursor-pointer ${
                isAudioMuted 
                  ? "bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/35"
                  : "bg-white/5 border border-white/5 text-slate-300 hover:bg-white/10"
              }`}
              title={isAudioMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              onClick={handleEndCall}
              className="p-5 rounded-full bg-rose-600 hover:bg-rose-700 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] text-white font-semibold transition-all active:scale-95 cursor-pointer"
              title="Hang Up call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>

            {activeCall.callType === "video" && (
              <button
                onClick={toggleVideoMute}
                className={`p-4 rounded-full transition-all active:scale-95 cursor-pointer ${
                  isVideoMuted 
                    ? "bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/35"
                    : "bg-white/5 border border-white/5 text-slate-300 hover:bg-white/10"
                }`}
                title={isVideoMuted ? "Start Video" : "Stop Video"}
              >
                {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Send, Image, MessageSquare, Users, Paperclip, Loader, Info, User, ArrowLeft, X, Download, BarChart2, Plus, Trash2, List, Phone, Video, Check, CheckCheck, Pencil, Files, Forward, Bell, BellOff, Eye, FileText, Search, ChevronUp, ChevronDown } from "lucide-react";
import { Room, Message, User as UserType, UserStatus } from "../types";
import AudioPlayer from "./AudioPlayer";
import VoiceRecorder from "./VoiceRecorder";
import ImageGalleryModal, { GalleryItem } from "./ImageGalleryModal";
import { ThemeId, getTheme } from "../utils/theme";

interface PendingUpload {
  file: File;
  previewUrl: string;
  isImage: boolean;
  name: string;
  size: number;
  type: string;
}

interface ChatWindowProps {
  activeRoom: Room | null;
  currentUsername: string;
  messages: Message[];
  activeUsers?: UserType[];
  onSendMessage: (text: string) => Promise<void>;
  onSendFile: (file: File, caption?: string) => Promise<void>;
  onSendVoice: (audioBlob: Blob, durationSeconds?: number) => Promise<void>;
  typingUsers: string[];
  onTyping: (isTyping: boolean) => void;
  // Kept for backward compatibility but unused/always active
  hasAesKey?: boolean;
  onNegotiateKey?: () => void;
  activeThemeId: ThemeId;
  onBack?: () => void;
  onReactToMessage: (messageId: string, emoji: string) => void;
  onEditMessage?: (messageId: string, text: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onSendPoll?: (question: string, options: string[]) => void;
  onVotePoll?: (messageId: string, optionId: string) => void;
  onInitiateCall?: (callType: "voice" | "video") => void;
  onUpdateRoomPrivacy?: (roomId: string, privacy: "public" | "private") => void;
  rooms?: Room[];
  onForwardMessage?: (message: Message, targetRoomId: string) => void;
  blockedUsers?: string[];
}

export default function ChatWindow({
  activeRoom,
  currentUsername,
  messages,
  activeUsers = [],
  onSendMessage,
  onSendFile,
  onSendVoice,
  typingUsers,
  onTyping,
  hasAesKey = true,
  onNegotiateKey,
  activeThemeId,
  onBack,
  onReactToMessage,
  onEditMessage,
  onDeleteMessage,
  onSendPoll,
  onVotePoll,
  onInitiateCall,
  onUpdateRoomPrivacy,
  rooms = [],
  onForwardMessage,
  blockedUsers = [],
}: ChatWindowProps) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingUpload | null>(null);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const [standaloneGalleryItem, setStandaloneGalleryItem] = useState<GalleryItem | null>(null);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [galleryTab, setGalleryTab] = useState<"images" | "files">("images");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const theme = getTheme(activeThemeId);

  // Edit and Delete states
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);

  // Poll creation state
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  // Forward message state
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardSearchQuery, setForwardSearchQuery] = useState("");

  // Per-room mute notifications state
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Active voice recording state for full input area takeover
  const [isVoiceRecording, setIsVoiceRecording] = useState<boolean>(false);

  // Message read receipts inspection modal state
  const [activeReadInfoMsgId, setActiveReadInfoMsgId] = useState<string | null>(null);

  // Helper to resolve user presence and avatar for read status
  const getUserInfo = (uname: string) => {
    const found = activeUsers.find((u) => u.username.toLowerCase() === uname.toLowerCase());
    return {
      username: uname,
      avatar: found?.avatar || "🦊",
      status: (found?.status as UserStatus) || "offline",
      statusMessage: found?.statusMessage
    };
  };

  const getStatusDotBg = (st: UserStatus) => {
    switch (st) {
      case "online": return "bg-emerald-400";
      case "away": return "bg-amber-400";
      case "busy": return "bg-rose-400";
      case "offline": default: return "bg-slate-500";
    }
  };

  // Close message read info modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeReadInfoMsgId) {
        setActiveReadInfoMsgId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeReadInfoMsgId]);

  // Message history keyword search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"filter" | "highlight">("filter");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcuts: Ctrl+F / Cmd+F opens search, Escape closes search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === "Escape" && isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchOpen]);

  // Reset search state when switching active chat rooms
  useEffect(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setActiveMatchIndex(0);
  }, [activeRoom?.id]);

  // Check if message matches the search keyword
  const isMessageMatch = (msg: Message, query: string): boolean => {
    if (!query || !query.trim()) return true;
    const q = query.toLowerCase().trim();

    // Plaintext / Decrypted text / Ciphertext
    const text = (msg.decryptedText || msg.ciphertext || "").toLowerCase();
    if (text.includes(q)) return true;

    // Sender username
    if (msg.sender && msg.sender.toLowerCase().includes(q)) return true;

    // Caption
    if (msg.caption && msg.caption.toLowerCase().includes(q)) return true;

    // File name
    if (msg.fileName && msg.fileName.toLowerCase().includes(q)) return true;

    // Poll question & options
    if (msg.pollQuestion && msg.pollQuestion.toLowerCase().includes(q)) return true;
    if (msg.pollOptions?.some((opt) => opt.text.toLowerCase().includes(q))) return true;

    return false;
  };

  // Helper: highlight matched query inside text with accessible mark tag
  const highlightText = (text?: string, query?: string): React.ReactNode => {
    if (!text) return "";
    if (!query || !query.trim()) return text;
    const trimmed = query.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);

    if (parts.length <= 1) return text;

    return parts.map((part, i) => {
      if (part.toLowerCase() === trimmed.toLowerCase()) {
        return (
          <mark
            key={i}
            className="bg-amber-400 text-slate-950 font-bold px-1 py-0.5 rounded-sm shadow-xs mx-0.5"
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  useEffect(() => {
    if (activeRoom && typeof window !== "undefined") {
      const mutedListStr = localStorage.getItem("muted_rooms_list") || "[]";
      try {
        const mutedList: string[] = JSON.parse(mutedListStr);
        setIsMuted(mutedList.includes(activeRoom.id));
      } catch (e) {
        setIsMuted(false);
      }
    }
  }, [activeRoom]);

  const toggleMuteRoom = () => {
    if (!activeRoom || typeof window === "undefined") return;
    const mutedListStr = localStorage.getItem("muted_rooms_list") || "[]";
    try {
      let mutedList: string[] = JSON.parse(mutedListStr);
      if (mutedList.includes(activeRoom.id)) {
        mutedList = mutedList.filter(id => id !== activeRoom.id);
        setIsMuted(false);
      } else {
        mutedList.push(activeRoom.id);
        setIsMuted(true);
      }
      localStorage.setItem("muted_rooms_list", JSON.stringify(mutedList));
      window.dispatchEvent(new Event("app-settings-updated"));
    } catch (e) {
      console.error("Error toggling room mute", e);
    }
  };

  const handleAddPollOption = () => {
    if (pollOptions.length >= 8) return; // Limit to maximum 8 options
    setPollOptions([...pollOptions, ""]);
  };

  const handleRemovePollOption = (index: number) => {
    if (pollOptions.length <= 2) return; // Must have at least 2 options
    setPollOptions(pollOptions.filter((_, i) => i !== index));
  };

  const handlePollOptionChange = (index: number, val: string) => {
    const updated = [...pollOptions];
    updated[index] = val;
    setPollOptions(updated);
  };

  const handleCreatePollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOptions = pollOptions.filter(o => o.trim() !== "");
    if (!pollQuestion.trim() || cleanOptions.length < 2) return;
    if (onSendPoll) {
      onSendPoll(pollQuestion, cleanOptions);
    }
    // Reset state & close creator UI
    setPollQuestion("");
    setPollOptions(["", ""]);
    setShowPollCreator(false);
  };

  // Filter messages from blocked users
  const visibleMessages = useMemo(() => {
    return messages.filter(
      (msg) => !blockedUsers.some((b) => b.toLowerCase() === msg.sender?.toLowerCase())
    );
  }, [messages, blockedUsers]);

  // Active matching messages when searching
  const matchingMessages = useMemo(() => {
    if (!isSearchOpen || !searchQuery.trim()) return visibleMessages;
    return visibleMessages.filter((msg) => isMessageMatch(msg, searchQuery));
  }, [visibleMessages, isSearchOpen, searchQuery]);

  // Displayed messages in chat feed:
  // When search is open, keyword entered, and filterMode is 'filter', show only matching messages
  // Otherwise show full visibleMessages (with matches highlighted in thread)
  const displayedMessages = useMemo(() => {
    if (isSearchOpen && searchQuery.trim() && filterMode === "filter") {
      return matchingMessages;
    }
    return visibleMessages;
  }, [visibleMessages, matchingMessages, isSearchOpen, searchQuery, filterMode]);

  // Navigate between search matches
  const scrollToMatch = (index: number) => {
    if (matchingMessages.length === 0) return;
    const targetMsg = matchingMessages[index];
    if (!targetMsg) return;
    const el = document.getElementById(`msg-${targetMsg.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleNextMatch = () => {
    if (matchingMessages.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % matchingMessages.length;
    setActiveMatchIndex(nextIdx);
    scrollToMatch(nextIdx);
  };

  const handlePrevMatch = () => {
    if (matchingMessages.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + matchingMessages.length) % matchingMessages.length;
    setActiveMatchIndex(prevIdx);
    scrollToMatch(prevIdx);
  };

  // Active typing participants excluding current user
  const activeTypingUsers = useMemo(() => {
    return typingUsers.filter((u) => u && u.toLowerCase() !== currentUsername.toLowerCase());
  }, [typingUsers, currentUsername]);

  // Auto Scroll
  useEffect(() => {
    if (!isSearchOpen || !searchQuery.trim()) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [displayedMessages, activeTypingUsers, isSearchOpen, searchQuery]);

  // Clean up typing status on change of room or unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      onTyping(false);
    };
  }, [activeRoom]);

  // Bind Escape key to close image preview modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsGalleryOpen(false);
        setStandaloneGalleryItem(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Extract all images in current chat for full-screen gallery modal
  const galleryImages = useMemo<GalleryItem[]>(() => {
    return messages
      .filter((msg) => {
        if (!msg.isMedia || msg.isAudio) return false;
        const url = msg.decryptedMediaUrl || msg.ciphertext;
        if (!url) return false;
        const isImg =
          msg.mediaType?.startsWith("image/") ||
          /\.(jpeg|jpg|gif|png|webp|svg|bmp|ico)$/i.test(msg.fileName || "");
        return isImg;
      })
      .map((msg) => ({
        id: msg.id,
        src: msg.decryptedMediaUrl || msg.ciphertext,
        fileName: msg.fileName || "Image",
        fileSize: msg.fileSize,
        sender: msg.sender,
        timestamp: msg.timestamp,
        caption: msg.caption,
        mediaType: msg.mediaType
      }));
  }, [messages]);

  const openGalleryAtImage = (msgIdOrSrc: string) => {
    setStandaloneGalleryItem(null);
    const idx = galleryImages.findIndex(
      (item) => item.id === msgIdOrSrc || item.src === msgIdOrSrc
    );
    if (idx !== -1) {
      setGalleryInitialIndex(idx);
    } else {
      const msg = messages.find((m) => m.id === msgIdOrSrc);
      if (msg) {
        const item: GalleryItem = {
          id: msg.id,
          src: msg.decryptedMediaUrl || msg.ciphertext,
          fileName: msg.fileName || "Image",
          fileSize: msg.fileSize,
          sender: msg.sender,
          timestamp: msg.timestamp,
          caption: msg.caption,
          mediaType: msg.mediaType
        };
        setStandaloneGalleryItem(item);
        setGalleryInitialIndex(0);
      } else {
        setGalleryInitialIndex(0);
      }
    }
    setIsGalleryOpen(true);
  };

  const processSelectedFile = (file: File) => {
    const isImg = file.type.startsWith("image/") || /\.(jpeg|jpg|gif|png|webp|svg|bmp|ico)$/i.test(file.name);
    const previewUrl = URL.createObjectURL(file);
    if (pendingFile?.previewUrl) {
      URL.revokeObjectURL(pendingFile.previewUrl);
    }
    setPendingFile({
      file,
      previewUrl,
      isImage: isImg,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream"
    });
  };

  const handleCancelPendingFile = () => {
    if (pendingFile?.previewUrl) {
      URL.revokeObjectURL(pendingFile.previewUrl);
    }
    setPendingFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    return () => {
      if (pendingFile?.previewUrl) {
        URL.revokeObjectURL(pendingFile.previewUrl);
      }
    };
  }, [pendingFile]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && !pendingFile) || isSending) return;

    setIsSending(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    onTyping(false);

    try {
      if (pendingFile) {
        const fileToSend = pendingFile.file;
        const captionToSend = text.trim();
        handleCancelPendingFile();
        setText("");
        await onSendFile(fileToSend, captionToSend || undefined);
      } else {
        const textToSend = text.trim();
        setText("");
        await onSendMessage(textToSend);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    
    // Typing indicator flow
    onTyping(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
    if (e.target) {
      e.target.value = "";
    }
  };

  // Drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      processSelectedFile(file);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDateHeader = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }
  };

  if (!activeRoom) {
    return (
      <div className={`flex-1 ${theme.bgMain} flex flex-col items-center justify-center text-center p-8 select-none animate-fadeIn`}>
        <div className={`w-16 h-16 rounded-3xl ${theme.accentBgMuted} border ${theme.accentBorderMuted} flex items-center justify-center mb-5 shadow-lg ${theme.accentGlow}`}>
          <MessageSquare className={`w-8 h-8 ${theme.accentText}`} />
        </div>
        <h3 className={`text-lg font-display font-medium ${theme.textMain} mb-2`}>
          Unified Chat Space
        </h3>
        <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
          Select or instantiate a brand new chat channel on the sidebar to share thoughts, files, or voice note recordings with friends.
        </p>
      </div>
    );
  }

  const cleanRoomName = activeRoom.name
    .replace(currentUsername, "")
    .replace("&", "")
    .trim();

  // Filter shared media (images and files)
  const sharedMedia = visibleMessages.filter((msg) => {
    if (msg.isDeleted) return false;
    if (msg.isMedia) return true;
    
    // Check if plain text message is a data image or normal image URL
    const content = (msg.decryptedText || msg.ciphertext || "").trim();
    const isImage = content.startsWith("data:image/") || /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico))(?:\?.*)?$/i.test(content);
    return isImage;
  });

  const sharedImages = sharedMedia.filter((msg) => {
    if (msg.isMedia) {
      return msg.mediaType?.startsWith("image/");
    }
    const content = (msg.decryptedText || msg.ciphertext || "").trim();
    const isImage = content.startsWith("data:image/") || /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico))(?:\?.*)?$/i.test(content);
    return isImage;
  });

  const sharedFiles = sharedMedia.filter((msg) => {
    if (msg.isMedia) {
      return !msg.mediaType?.startsWith("image/");
    }
    return false;
  });

  return (
    <div className="flex-1 flex h-full overflow-hidden relative">
      <div 
        className={`flex-1 ${theme.bgMain} flex flex-col relative h-full min-w-0 ${
          dragActive ? `border-2 border-dashed ${theme.accentBorder} bg-black/45` : ""
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
      {/* Upper Bar */}
      <div className={`h-16 px-4 md:px-6 border-b ${theme.borderColor} ${theme.bgSidebar} bg-opacity-30 flex items-center justify-between shrink-0 select-none`}>
        <div className="flex items-center gap-2 md:gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className={`p-2 rounded-xl text-slate-400 hover:${theme.accentText} hover:bg-white/5 active:scale-95 transition-all md:hidden`}
              title="Go Back to Chats List"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          {(() => {
            const counterpartInfo = !activeRoom.isGroup ? getUserInfo(cleanRoomName) : null;
            const customAvatar = activeRoom.avatar || (counterpartInfo?.avatar && (counterpartInfo.avatar.startsWith("data:image") || counterpartInfo.avatar.startsWith("http")) ? counterpartInfo.avatar : null);

            return (
              <div className="relative shrink-0">
                {customAvatar ? (
                  <img
                    src={customAvatar}
                    alt={cleanRoomName}
                    className="w-10 h-10 rounded-full object-cover shadow-md shrink-0 border border-slate-800/40"
                    referrerPolicy="no-referrer"
                  />
                ) : counterpartInfo?.avatar ? (
                  <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700/80 flex items-center justify-center text-lg shadow-md shrink-0">
                    {counterpartInfo.avatar}
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center font-bold text-white shadow-md shrink-0">
                    {cleanRoomName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                {/* Status Dot on counterpart avatar */}
                {counterpartInfo && (
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-slate-900 ${getStatusDotBg(counterpartInfo.status)}`}
                    title={`Status: ${counterpartInfo.status}`}
                  />
                )}
              </div>
            );
          })()}
          <div>
            <h2 className={`text-sm font-bold ${theme.textMain}`}>{cleanRoomName}</h2>
            {activeTypingUsers.length > 0 ? (
              <div className="flex items-center gap-1.5 mt-0.5 animate-fadeIn">
                {/* Specific typing user avatar(s) in header */}
                <div className="flex items-center -space-x-1.5 overflow-hidden">
                  {activeTypingUsers.map((typingUser) => {
                    const uInfo = getUserInfo(typingUser);
                    const isImg = uInfo.avatar && (uInfo.avatar.startsWith("data:image") || uInfo.avatar.startsWith("http"));
                    return (
                      <div
                        key={typingUser}
                        className="relative w-4.5 h-4.5 rounded-full ring-1 ring-slate-900 bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 shadow-sm"
                        title={`@${typingUser} is typing...`}
                      >
                        {isImg ? (
                          <img src={uInfo.avatar} alt={typingUser} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[9px]">{uInfo.avatar || "🦊"}</span>
                        )}
                        <span className={`absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full ring-1 ring-slate-900 ${getStatusDotBg(uInfo.status)}`} />
                      </div>
                    );
                  })}
                </div>
                {/* Animated wave dots and '...typing' label */}
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 font-mono tracking-tight animate-pulse">
                  <span className="flex gap-0.5 items-center">
                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.8s' }} />
                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.8s' }} />
                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.8s' }} />
                  </span>
                  <span>{activeTypingUsers.map(u => `@${u}`).join(", ")} ...typing</span>
                </span>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                {activeRoom.isGroup ? "Active group" : "Direct chat"} • {activeRoom.members.length} member{activeRoom.members.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-3">
          {activeRoom.isGroup && (
            <div className="flex items-center gap-2 bg-black/15 border border-slate-800/40 px-2 sm:px-2.5 py-1 rounded-xl">
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-450 tracking-wider hidden sm:inline font-mono">PRIVACY:</span>
              <button
                onClick={() => {
                  const newPrivacy = activeRoom.privacy === "private" ? "public" : "private";
                  onUpdateRoomPrivacy?.(activeRoom.id, newPrivacy);
                }}
                className={`flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                  activeRoom.privacy === "private"
                    ? "bg-rose-500/10 text-rose-300 border-rose-500/25 hover:bg-rose-500/20"
                    : "bg-emerald-500/10 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/20"
                }`}
                title="Click to toggle group privacy setting"
              >
                {activeRoom.privacy === "private" ? "🔒 Private" : "🌐 Public"}
              </button>
            </div>
          )}
          {onInitiateCall && (
            <div className="flex items-center gap-1.5 border-r border-slate-800 pr-3 mr-1">
              <button
                onClick={() => onInitiateCall("voice")}
                className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/5 active:scale-95 transition-all rounded-xl cursor-pointer flex items-center justify-center border border-transparent hover:border-emerald-500/10"
                title="Start Voice Call"
              >
                <Phone className="w-4.5 h-4.5" />
              </button>
              <button
                onClick={() => onInitiateCall("video")}
                className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/5 active:scale-95 transition-all rounded-xl cursor-pointer flex items-center justify-center border border-transparent hover:border-indigo-500/10"
                title="Start Video Call"
              >
                <Video className="w-4.5 h-4.5" />
              </button>
            </div>
          )}
          
          {/* Mute Room Button */}
          <button
            onClick={toggleMuteRoom}
            className={`p-2 active:scale-95 transition-all rounded-xl cursor-pointer flex items-center justify-center border ${
              isMuted
                ? "bg-rose-500/15 text-rose-400 border-rose-500/25 animate-pulse"
                : "text-slate-400 hover:text-indigo-400 hover:bg-white/5 border-transparent"
            }`}
            title={isMuted ? "Unmute Chat Notifications" : "Mute Chat Notifications"}
          >
            {isMuted ? <BellOff className="w-4.5 h-4.5" /> : <Bell className="w-4.5 h-4.5" />}
          </button>

          {/* Shared Media Gallery Button */}
          <button
            onClick={() => setShowMediaGallery(!showMediaGallery)}
            className={`p-2 active:scale-95 transition-all rounded-xl cursor-pointer flex items-center justify-center border ${
              showMediaGallery
                ? `bg-indigo-500/15 ${theme.accentText} border-indigo-500/25`
                : `text-slate-400 hover:${theme.accentText} hover:bg-white/5 border-transparent`
            }`}
            title="Shared Media & Files"
          >
            <Files className="w-4.5 h-4.5" />
          </button>

          {/* Message Search Button */}
          <button
            onClick={() => {
              setIsSearchOpen((prev) => {
                const next = !prev;
                if (next) {
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                } else {
                  setSearchQuery("");
                  setActiveMatchIndex(0);
                }
                return next;
              });
            }}
            className={`p-2 active:scale-95 transition-all rounded-xl cursor-pointer flex items-center justify-center border ${
              isSearchOpen
                ? "bg-amber-400/15 text-amber-300 border-amber-400/30"
                : "text-slate-400 hover:text-amber-300 hover:bg-white/5 border-transparent"
            }`}
            title="Search & filter messages (Ctrl+F)"
            aria-label="Search messages"
          >
            <Search className="w-4.5 h-4.5" />
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-semibold tracking-wider">
            CONNECTED
          </div>
        </div>
      </div>

      {/* Message Search Toolbar */}
      {isSearchOpen && (
        <div className={`px-4 md:px-6 py-2.5 border-b ${theme.borderColor} bg-slate-900/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 animate-fadeIn z-20 select-none shadow-md`}>
          {/* Left: Search input field */}
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveMatchIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) {
                      handlePrevMatch();
                    } else {
                      handleNextMatch();
                    }
                  }
                }}
                placeholder={`Search keyword in #${cleanRoomName}...`}
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all font-sans"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveMatchIndex(0);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  title="Clear search query"
                  aria-label="Clear query"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Results count indicator */}
            {searchQuery.trim() && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-lg border font-semibold ${
                  matchingMessages.length > 0 
                    ? "bg-amber-400/15 border-amber-400/30 text-amber-300"
                    : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                }`}>
                  {matchingMessages.length > 0 
                    ? `${activeMatchIndex + 1} of ${matchingMessages.length} ${matchingMessages.length === 1 ? "match" : "matches"}`
                    : "0 matches"
                  }
                </span>

                {/* Match navigation buttons (Next/Prev) */}
                {matchingMessages.length > 0 && (
                  <div className="flex items-center gap-0.5 bg-slate-950/60 border border-slate-800 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={handlePrevMatch}
                      className="p-1 text-slate-400 hover:text-amber-300 hover:bg-white/5 rounded transition-colors cursor-pointer"
                      title="Previous match (Shift+Enter)"
                      aria-label="Previous match"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMatch}
                      className="p-1 text-slate-400 hover:text-amber-300 hover:bg-white/5 rounded transition-colors cursor-pointer"
                      title="Next match (Enter)"
                      aria-label="Next match"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Filter mode segmented controls & close button */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFilterMode("filter")}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  filterMode === "filter" 
                    ? "bg-amber-400/20 text-amber-200 font-semibold border border-amber-400/30 shadow-xs" 
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Filter thread to show only matching messages"
              >
                Filter Thread
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("highlight")}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  filterMode === "highlight" 
                    ? "bg-amber-400/20 text-amber-200 font-semibold border border-amber-400/30 shadow-xs" 
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Keep full conversation and highlight matches"
              >
                Highlight All
              </button>
            </div>

            {/* Close Search */}
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery("");
                setActiveMatchIndex(0);
              }}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
              title="Close search (Esc)"
              aria-label="Close search"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Messages Scroll Panel */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {displayedMessages.length === 0 ? (
          isSearchOpen && searchQuery.trim() ? (
            <div className="flex flex-col items-center justify-center text-center h-full text-slate-500 select-none py-16 animate-fadeIn">
              <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-300 flex items-center justify-center mb-3 shadow-md">
                <Search className="w-6 h-6 stroke-[2]" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">No matching messages</h3>
              <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
                No messages in this chat thread contain <span className="font-semibold text-amber-300">"{searchQuery}"</span>.
              </p>
              <div className="flex items-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
                >
                  Clear Search Filter
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("highlight")}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 text-amber-300 text-xs font-semibold rounded-xl border border-amber-400/30 transition-colors cursor-pointer"
                >
                  View Full Thread
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center h-full text-slate-600 select-none py-12">
              <MessageSquare className="w-10 h-10 text-slate-750 stroke-1 mb-2.5 animate-pulse" />
              <p className="text-xs font-medium">No messages in this chat stream yet.</p>
              <p className="text-[10px] mt-1 max-w-xs text-slate-500">
                Type or record below. Start the conversation by sharing a greeting or a file.
              </p>
            </div>
          )
        ) : (
          displayedMessages.map((msg, index) => {
            const isMe = msg.sender === currentUsername;
            const prevMsg = index > 0 ? displayedMessages[index - 1] : null;
            const isMatch = isSearchOpen && Boolean(searchQuery.trim()) ? isMessageMatch(msg, searchQuery) : false;
            const isCurrentActiveMatch = isSearchOpen && Boolean(searchQuery.trim()) && matchingMessages.length > 0 && matchingMessages[activeMatchIndex]?.id === msg.id;
            
            const msgDate = new Date(msg.timestamp || Date.now()).toDateString();
            const prevMsgDate = prevMsg ? new Date(prevMsg.timestamp || Date.now()).toDateString() : null;
            const isDifferentDay = msgDate !== prevMsgDate;

            return (
              <React.Fragment key={`${msg.id || "msg"}-${index}`}>
                {isDifferentDay && (
                  <div className="flex items-center justify-center my-8 select-none animate-fadeIn w-full col-span-full">
                    <div className={`h-[1px] flex-1 bg-gradient-to-r from-transparent to-slate-800/80`} />
                    <span className={`mx-4 px-3 py-1 text-[9px] font-bold tracking-widest text-slate-400 uppercase bg-slate-900/40 border ${theme.borderColor} rounded-full font-mono shadow-sm`}>
                      {formatDateHeader(msg.timestamp)}
                    </span>
                    <div className={`h-[1px] flex-1 bg-gradient-to-l from-transparent to-slate-800/80`} />
                  </div>
                )}
                
                <div
                  id={`msg-${msg.id}`}
                  className={`flex items-end gap-3 max-w-[75%] transition-all ${isMe ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                >
                  {/* User rounded avatar circle info */}
                  <div 
                    className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white shadow-sm uppercase ${
                      isMe 
                        ? `${theme.accentBg} border ${theme.accentBorder}` 
                        : `bg-slate-700 border ${theme.borderColor}`
                    }`}
                  >
                    {msg.sender.slice(0, 2)}
                  </div>

                  <div className="space-y-1 min-w-0 max-w-full">
                    {/* Sender & Time above the bubble */}
                    <div className={`flex items-center gap-2 text-[10px] font-medium text-slate-500 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
                      <span className="text-slate-400 truncate max-w-36">{isMe ? "You" : highlightText(msg.sender, isSearchOpen ? searchQuery : undefined)}</span>
                      <span>•</span>
                      <span>{formatTime(msg.timestamp)}</span>
                      {isMatch && (
                        <>
                          <span>•</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold tracking-wider uppercase transition-all ${
                            isCurrentActiveMatch
                              ? "bg-amber-400 text-slate-950 shadow-sm ring-1 ring-amber-300"
                              : "bg-amber-400/20 text-amber-300 border border-amber-400/35"
                          }`}>
                            {isCurrentActiveMatch ? `Match #${activeMatchIndex + 1}` : "Match"}
                          </span>
                        </>
                      )}
                      {msg.isForwarded && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400 font-bold flex items-center gap-0.5" title={msg.forwardedFrom ? `Forwarded from ${msg.forwardedFrom}` : "Forwarded"}>
                            <Forward className="w-2.5 h-2.5 shrink-0" />
                            <span>forwarded</span>
                          </span>
                        </>
                      )}
                      {msg.isEdited && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-400 italic font-semibold">edited</span>
                        </>
                      )}
                      {isMe && (
                        (() => {
                          const otherMembers = (activeRoom.members || []).filter(u => u !== msg.sender);
                          const otherReaders = msg.readBy ? msg.readBy.filter(u => u !== msg.sender) : [];
                          
                          const isReadByAll = otherMembers.length > 0 && otherMembers.every(u => otherReaders.includes(u));
                          const isReadBySome = otherReaders.length > 0 && !isReadByAll;
                          
                          let iconTitle = "Sent";
                          let readText = "Sent";
                          if (isReadByAll) {
                            iconTitle = `Read by everyone (${otherReaders.join(", ")})`;
                            readText = "Read";
                          } else if (isReadBySome) {
                            iconTitle = `Read by: ${otherReaders.join(", ")} (Waiting for others)`;
                            readText = `${otherReaders.length}/${otherMembers.length} Read`;
                          }

                          return (
                            <>
                              <span>•</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveReadInfoMsgId(activeReadInfoMsgId === msg.id ? null : msg.id);
                                }}
                                className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                                title={iconTitle + ". Click to view reader list."}
                              >
                                {isReadByAll ? (
                                  <>
                                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                                    <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">{readText}</span>
                                  </>
                                ) : isReadBySome ? (
                                  <>
                                    <CheckCheck className="w-3.5 h-3.5 text-indigo-400 stroke-[2.5]" />
                                    <span className="text-[9px] font-semibold text-indigo-400 uppercase tracking-wider">{readText}</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-slate-500 stroke-[2.5]" />
                                    <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">{readText}</span>
                                  </>
                                )}
                              </button>
                            </>
                          );
                        })()
                      )}
                      {!msg.isDeleted && (
                        <div className="flex items-center gap-1.5 ml-1 border-l border-slate-800 pl-1.5 md:hidden">
                          <button
                            onClick={() => {
                              setForwardingMessage(msg);
                              setForwardSearchQuery("");
                            }}
                            className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold uppercase transition-colors cursor-pointer"
                          >
                            Forward
                          </button>
                          {isMe && !msg.isPoll && !msg.isMedia && !msg.isAudio && (
                            <button
                              onClick={() => {
                                if (msg.id) {
                                  setEditingMessageId(msg.id);
                                  setEditingText(msg.decryptedText || msg.ciphertext || "");
                                }
                              }}
                              className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold uppercase transition-colors cursor-pointer"
                            >
                              Edit
                            </button>
                          )}
                          {isMe && (
                            <button
                              onClick={() => {
                                if (msg.id) {
                                  setDeletingMessageId(msg.id);
                                }
                              }}
                              className="text-[9px] text-rose-400 hover:text-rose-300 font-bold uppercase transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Hover Reaction trigger and message bubble container overlay */}
                    <div className="relative group/bubble-container max-w-full flex flex-col">
                      {/* Reaction picker and action menu on hover */}
                      {!msg.isDeleted && (
                        <div className={`absolute -top-7 z-20 hidden group-hover/bubble-container:flex items-center gap-1 bg-slate-800/95 border border-slate-700/80 rounded-full px-2 py-0.5 shadow-xl backdrop-blur-md animate-fadeIn ${
                          isMe ? "right-2" : "left-2"
                        }`}>
                          {["👍", "❤️", "😂", "😮", "😢", "🔥"].map((emoji) => {
                            const hasReacted = msg.reactions?.[emoji]?.includes(currentUsername);
                            return (
                              <button
                                key={emoji}
                                onClick={() => {
                                  if (msg.id) {
                                    onReactToMessage(msg.id, emoji);
                                  }
                                }}
                                className={`w-6 h-6 flex items-center justify-center text-xs rounded-full transition-all hover:scale-135 hover:bg-slate-700/80 active:scale-90 cursor-pointer ${
                                  hasReacted ? "bg-slate-700 scale-110" : ""
                                }`}
                              >
                                {emoji}
                              </button>
                            );
                          })}

                          <div className="w-[1px] h-4 bg-slate-700 mx-1 shrink-0" />
                          <button
                            title="Forward Message"
                            onClick={() => {
                              setForwardingMessage(msg);
                              setForwardSearchQuery("");
                            }}
                            className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-emerald-400 hover:bg-slate-700/80 transition-all cursor-pointer"
                          >
                            <Forward className="w-3.5 h-3.5" />
                          </button>

                          {isMe && !msg.isPoll && !msg.isMedia && !msg.isAudio && (
                            <>
                              <div className="w-[1px] h-4 bg-slate-700 mx-1 shrink-0" />
                              <button
                                title="Edit Message"
                                onClick={() => {
                                  if (msg.id) {
                                    setEditingMessageId(msg.id);
                                    setEditingText(msg.decryptedText || msg.ciphertext || "");
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-indigo-400 hover:bg-slate-700/80 transition-all cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </>
                          )}

                          {isMe && (
                            <>
                              {(msg.isPoll || msg.isMedia || msg.isAudio) && (
                                <div className="w-[1px] h-4 bg-slate-700 mx-1 shrink-0" />
                              )}
                              <button
                                title="Delete Message"
                                onClick={() => {
                                  if (msg.id) {
                                    setDeletingMessageId(msg.id);
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-rose-400 hover:bg-slate-700/80 transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Standard Message Bubble */}
                      <div
                        className={`p-3 rounded-2xl border text-left text-sm max-w-full transition-all duration-200 ${
                          isCurrentActiveMatch
                            ? "ring-2 ring-amber-400 border-amber-400/80 shadow-[0_0_20px_rgba(251,191,36,0.35)] scale-[1.01]"
                            : isMatch
                            ? "ring-1 ring-amber-400/50 border-amber-400/50 shadow-[0_0_12px_rgba(251,191,36,0.18)]"
                            : ""
                        } ${
                          isMe
                            ? `${theme.bubbleMe} rounded-tr-none shadow-xl ${theme.accentGlow}`
                            : `${theme.bubbleOther} rounded-tl-none shadow-sm`
                        }`}
                      >
                        {msg.isDeleted ? (
                          <div className="flex items-center gap-2 text-slate-500 italic text-xs select-none">
                            <span>🚫</span>
                            <span>This message was deleted</span>
                          </div>
                        ) : deletingMessageId === msg.id ? (
                          <div className="flex flex-col gap-2 p-1 text-xs text-slate-300 min-w-[200px]">
                            <p className="font-semibold text-rose-300">Delete this message?</p>
                            <p className="text-[10px] text-slate-500">This action cannot be undone.</p>
                            <div className="flex justify-end gap-1.5 mt-1">
                              <button
                                type="button"
                                onClick={() => setDeletingMessageId(null)}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 hover:bg-slate-850 text-slate-350 transition-all cursor-pointer border border-slate-800"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onDeleteMessage && msg.id) {
                                    onDeleteMessage(msg.id);
                                  }
                                  setDeletingMessageId(null);
                                }}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer shadow-md"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ) : editingMessageId === msg.id ? (
                          <div className="flex flex-col gap-2 p-1 text-xs text-slate-300 min-w-[220px]">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full text-xs bg-slate-950/80 text-slate-100 border border-slate-700/60 rounded-xl p-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none font-sans"
                              rows={2}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  if (editingText.trim() && onEditMessage && msg.id) {
                                    onEditMessage(msg.id, editingText.trim());
                                  }
                                  setEditingMessageId(null);
                                } else if (e.key === "Escape") {
                                  setEditingMessageId(null);
                                }
                              }}
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingMessageId(null)}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 hover:bg-slate-850 text-slate-350 transition-all cursor-pointer border border-slate-800"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingText.trim() && onEditMessage && msg.id) {
                                    onEditMessage(msg.id, editingText.trim());
                                  }
                                  setEditingMessageId(null);
                                }}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-md"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : msg.isAudio ? (
                          msg.decryptedMediaUrl || msg.ciphertext ? (
                            <AudioPlayer
                              src={msg.decryptedMediaUrl || msg.ciphertext}
                              duration={msg.audioDuration}
                              fileName={msg.fileName}
                              fileSize={msg.fileSize}
                            />
                          ) : (
                            <div className="flex items-center gap-2 text-xs italic text-slate-400">
                              <Loader className={`w-3.5 h-3.5 animate-spin ${theme.accentText}`} />
                              <span>Streaming audio...</span>
                            </div>
                          )
                        ) : msg.isMedia ? (
                          <div>
                            {msg.decryptedMediaUrl || msg.ciphertext ? (
                              (msg.mediaType?.startsWith("image/") || /\.(jpeg|jpg|gif|png|webp|svg)/i.test(msg.fileName || "")) ? (
                                <div className="relative group/img max-w-full">
                                  <img
                                    src={msg.decryptedMediaUrl || msg.ciphertext}
                                    alt={msg.fileName || "Shared image"}
                                    referrerPolicy="no-referrer"
                                    onClick={() => openGalleryAtImage(msg.id)}
                                    className="max-h-60 rounded-xl max-w-full border border-slate-800 media-glow mb-1 bg-slate-950 object-contain hover:scale-[1.02] hover:brightness-110 transition-all cursor-pointer shadow-lg"
                                  />
                                  <div className="absolute bottom-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity bg-slate-900/80 px-2 py-1 rounded text-[10px] text-slate-350 pointer-events-none select-none backdrop-blur-xs">
                                    Click to view in gallery
                                  </div>
                                </div>
                              ) : (
                                <a
                                  href={msg.decryptedMediaUrl || msg.ciphertext}
                                  download={msg.fileName || "downloaded-file"}
                                  className={`inline-flex items-center gap-2 p-2 bg-slate-950 hover:bg-slate-950/60 transition-colors border ${theme.accentBorderMuted} ${theme.accentText} rounded-xl text-xs font-mono`}
                                >
                                  <Paperclip className={`w-4 h-4 ${theme.accentText}`} />
                                  <div className="text-left">
                                    <p className="truncate max-w-40 font-medium text-slate-200">
                                      {highlightText(msg.fileName, isSearchOpen ? searchQuery : undefined)}
                                    </p>
                                    <p className="text-[10px] text-slate-500">{msg.mediaType} • {((msg.fileSize || 0) / 1024).toFixed(1)} KB</p>
                                  </div>
                                </a>
                              )
                            ) : (
                              <div className="flex items-center gap-2 text-xs italic text-slate-400">
                                <Loader className={`w-3.5 h-3.5 animate-spin ${theme.accentText}`} />
                                <span>Unpacking attachment...</span>
                              </div>
                            )}
                            {/* Render caption if attached */}
                            {msg.caption && (
                              <p className="text-xs text-slate-200 mt-1.5 px-0.5 font-sans leading-relaxed whitespace-pre-wrap break-words">
                                {highlightText(msg.caption, isSearchOpen ? searchQuery : undefined)}
                              </p>
                            )}
                          </div>
                        ) : msg.isPoll ? (
                          <div className="w-72 max-w-full text-slate-100 flex flex-col gap-3 font-sans">
                            {/* Poll Header Banner */}
                            <div className="flex items-start gap-2 border-b border-white/5 pb-2">
                              <span className={`p-1.5 rounded-lg bg-indigo-500/15 ${theme.accentText} shrink-0`}>
                                <BarChart2 className="w-4 h-4" />
                              </span>
                              <div className="font-semibold text-[13px] leading-snug break-words pr-1 text-slate-100">
                                {highlightText(msg.pollQuestion, isSearchOpen ? searchQuery : undefined)}
                              </div>
                            </div>

                            {/* Options List */}
                            <div className="space-y-2 mt-0.5">
                              {msg.pollOptions?.map((opt) => {
                                const totalVotes = msg.pollOptions?.reduce((acc, curr) => acc + (curr.votes?.length || 0), 0) || 0;
                                const optVotesCount = opt.votes?.length || 0;
                                const percentage = totalVotes > 0 ? Math.round((optVotesCount / totalVotes) * 100) : 0;
                                const isVoted = opt.votes?.includes(currentUsername);

                                return (
                                  <button
                                    key={opt.id}
                                    onClick={() => onVotePoll && onVotePoll(msg.id, opt.id)}
                                    className={`w-full relative overflow-hidden rounded-xl p-2.5 text-left border text-xs font-semibold cursor-pointer transition-all active:scale-[0.98] block ${
                                      isVoted 
                                        ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-200" 
                                        : "bg-slate-950/40 border-slate-800 hover:bg-slate-950/70 text-slate-300"
                                    }`}
                                  >
                                    {/* Fill Progress Tracker Bar */}
                                    <div 
                                      className={`absolute inset-y-0 left-0 transition-all duration-500 ease-out ${
                                        isVoted ? "bg-indigo-500/15" : "bg-slate-700/10"
                                      }`}
                                      style={{ width: `${percentage}%` }}
                                    />

                                    {/* Text display with counts */}
                                    <div className="relative flex items-center justify-between gap-3 z-10">
                                      <div className="flex items-center gap-2 truncate pr-1">
                                        <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                                          isVoted ? "bg-indigo-400 animate-pulse" : "bg-slate-700"
                                        }`} />
                                        <span className="truncate">
                                          {highlightText(opt.text, isSearchOpen ? searchQuery : undefined)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0 text-slate-400 font-mono text-[10px]">
                                        <span>{percentage}%</span>
                                        <span className="opacity-60">({optVotesCount})</span>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Total summary info */}
                            <div className="text-[9px] text-slate-500 font-mono flex items-center justify-between border-t border-white/5 pt-2 select-none">
                              <span>Total Votes: {msg.pollOptions?.reduce((acc, curr) => acc + (curr.votes?.length || 0), 0) || 0}</span>
                              {msg.sender === currentUsername ? (
                                <span className="text-indigo-400 font-medium">You created this poll</span>
                              ) : (
                                <span>Created by @{msg.sender}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          (() => {
                            const content = (msg.decryptedText || msg.ciphertext || "").trim();
                            const isImage = content.startsWith("data:image/") || /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico))(?:\?.*)?$/i.test(content);
                            if (isImage) {
                              return (
                                <div className="relative group/img max-w-full">
                                  <img
                                    src={content}
                                    alt="Shared image"
                                    referrerPolicy="no-referrer"
                                    onClick={() => openGalleryAtImage(msg.id || content)}
                                    className="max-h-60 rounded-xl max-w-full border border-slate-800 media-glow bg-slate-950 object-contain hover:scale-[1.02] hover:brightness-110 transition-all cursor-pointer shadow-lg"
                                  />
                                  <div className="absolute bottom-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity bg-slate-900/80 px-2 py-1 rounded text-[10px] text-slate-350 pointer-events-none select-none backdrop-blur-xs">
                                    Click to view in gallery
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <p className="whitespace-pre-wrap breakdown-all break-words leading-relaxed leading-6 text-slate-100">
                                {highlightText(msg.decryptedText || msg.ciphertext, isSearchOpen ? searchQuery : undefined)}
                              </p>
                            );
                          })()
                        )}
                      </div>

                      {/* Reactions display count below the message bubble */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1.5 ${isMe ? "justify-end" : "justify-start"}`}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => {
                            const userList = Array.isArray(users) ? (users as string[]) : [];
                            if (userList.length === 0) return null;
                            const hasReacted = userList.includes(currentUsername);
                            return (
                              <button
                                key={emoji}
                                onClick={() => {
                                  if (msg.id) {
                                    onReactToMessage(msg.id, emoji);
                                  }
                                }}
                                title={userList.join(", ")}
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border backdrop-blur-xs select-none transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                                  hasReacted
                                    ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                                    : "bg-slate-800/80 text-slate-300 border-slate-700"
                                }`}
                              >
                                <span>{emoji}</span>
                                <span className="text-[10px] font-semibold">{userList.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Visual Participant Read Status Indicator */}
                    {(() => {
                      const otherMembers = (activeRoom.members || []).filter(u => u !== msg.sender);
                      const otherReaders = (msg.readBy || []).filter(u => u !== msg.sender);
                      const isReadByAll = otherMembers.length > 0 && otherMembers.every(u => otherReaders.includes(u));
                      const isReadBySome = otherReaders.length > 0 && !isReadByAll;

                      // Display for user's own sent messages, or group messages that have readers
                      if (!isMe && (!activeRoom.isGroup || otherReaders.length === 0)) {
                        return null;
                      }

                      return (
                        <div className={`flex items-center gap-1.5 mt-1 select-none ${isMe ? "justify-end" : "justify-start"}`}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveReadInfoMsgId(activeReadInfoMsgId === msg.id ? null : msg.id);
                            }}
                            className={`group/read inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10.5px] transition-all cursor-pointer backdrop-blur-xs ${
                              isReadByAll
                                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/60 hover:border-emerald-500/50"
                                : isReadBySome
                                ? "bg-indigo-950/40 border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/60 hover:border-indigo-500/50"
                                : "bg-slate-900/50 border-slate-800/80 text-slate-400 hover:bg-slate-900/80"
                            }`}
                            title="Click to view reader list and status"
                          >
                            {isMe ? (
                              isReadByAll ? (
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5] shrink-0" />
                              ) : isReadBySome ? (
                                <CheckCheck className="w-3.5 h-3.5 text-indigo-400 stroke-[2.5] shrink-0" />
                              ) : (
                                <Check className="w-3.5 h-3.5 text-slate-500 stroke-[2] shrink-0" />
                              )
                            ) : (
                              <Eye className="w-3 h-3 text-slate-400 shrink-0" />
                            )}

                            {/* Viewer avatar stack */}
                            {otherReaders.length > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <div className="flex items-center -space-x-1.5 overflow-hidden py-0.5">
                                  {otherReaders.slice(0, 3).map((readerName) => {
                                    const uInfo = getUserInfo(readerName);
                                    const isImg = uInfo.avatar && (uInfo.avatar.startsWith("data:image") || uInfo.avatar.startsWith("http"));
                                    return (
                                      <div
                                        key={readerName}
                                        className="relative w-4.5 h-4.5 rounded-full ring-2 ring-slate-900 bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 shadow-sm"
                                        title={`Read by @${readerName} (${uInfo.status})`}
                                      >
                                        {isImg ? (
                                          <img src={uInfo.avatar} alt={readerName} className="w-full h-full object-cover" />
                                        ) : (
                                          <span className="text-[9px]">{uInfo.avatar || "🦊"}</span>
                                        )}
                                        <span className={`absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full ring-1 ring-slate-900 ${getStatusDotBg(uInfo.status)}`} />
                                      </div>
                                    );
                                  })}
                                  {otherReaders.length > 3 && (
                                    <div className="w-4.5 h-4.5 rounded-full ring-2 ring-slate-900 bg-indigo-900/90 text-indigo-200 text-[8px] font-bold flex items-center justify-center shrink-0">
                                      +{otherReaders.length - 3}
                                    </div>
                                  )}
                                </div>
                                <span className="font-semibold text-[10px]">
                                  {activeRoom.isGroup ? (
                                    isReadByAll ? (
                                      <span>Read by all ({otherReaders.length})</span>
                                    ) : (
                                      <span>Read by {otherReaders.length}/{otherMembers.length}</span>
                                    )
                                  ) : (
                                    <span>Read by @{otherReaders[0]}</span>
                                  )}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-medium">
                                Delivered
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}

        {/* Remote typing statuses with specific user avatar(s) and '...typing' */}
        {activeTypingUsers.length > 0 && (
          <div className="space-y-2 px-3 sm:px-6 py-2 select-none animate-fadeIn">
            {activeTypingUsers.map((typingUser) => {
              const uInfo = getUserInfo(typingUser);
              const isImg = uInfo.avatar && (uInfo.avatar.startsWith("data:image") || uInfo.avatar.startsWith("http"));

              return (
                <div key={typingUser} className="flex items-end gap-2.5 max-w-md animate-fadeIn">
                  {/* Specific User Avatar with real-time status ring */}
                  <div className="relative shrink-0 mb-0.5">
                    <div 
                      className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700/80 overflow-hidden flex items-center justify-center text-sm shadow-md"
                      title={`@${typingUser} (${uInfo.status})`}
                    >
                      {isImg ? (
                        <img src={uInfo.avatar} alt={typingUser} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span>{uInfo.avatar || "🦊"}</span>
                      )}
                    </div>
                    {/* Live status dot */}
                    <span 
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${getStatusDotBg(uInfo.status)}`}
                      title={`Status: ${uInfo.status}`}
                    />
                  </div>

                  {/* Typing bubble containing username and '...typing' indicator */}
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-[10px] font-semibold text-slate-400 ml-1 mb-0.5">
                      @{typingUser}
                    </span>
                    <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/70 px-3.5 py-2 rounded-2xl rounded-bl-xs shadow-lg backdrop-blur-md">
                      {/* Animated wave bounce dots */}
                      <span className="flex items-center gap-1 shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${theme.accentBg} animate-bounce`} style={{ animationDelay: '0ms', animationDuration: '0.9s' }} />
                        <span className={`w-1.5 h-1.5 rounded-full ${theme.accentBg} animate-bounce`} style={{ animationDelay: '150ms', animationDuration: '0.9s' }} />
                        <span className={`w-1.5 h-1.5 rounded-full ${theme.accentBg} animate-bounce`} style={{ animationDelay: '300ms', animationDuration: '0.9s' }} />
                      </span>
                      {/* Explicit '...typing' label next to the avatar */}
                      <span className="text-xs font-semibold text-emerald-400 font-mono tracking-tight animate-pulse">
                        ...typing
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Drag & drop overlay indicator */}
      {dragActive && (
        <div className={`absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 ${theme.accentText} text-sm z-30 select-none`}>
          <div className={`w-14 h-14 rounded-full ${theme.accentBgMuted} border ${theme.accentBorderMuted} flex items-center justify-center animate-pulse`}>
            <Paperclip className="w-6 h-6" />
          </div>
          <span className="font-display font-medium text-slate-200">Drop media here to upload</span>
          <span className="text-xs text-slate-500">Share instantly with the chat feed</span>
        </div>
      )}

      {/* Send Input Panel */}
      <footer className={`p-4 border-t ${theme.borderColor} ${theme.bgSidebar} bg-opacity-20 shrink-0`}>
        {/* Real-time typing notification banner right next to active user avatars */}
        {activeTypingUsers.length > 0 && (
          <div className="mb-2 px-1 flex items-center gap-2 animate-fadeIn select-none">
            <div className="flex items-center -space-x-1.5 overflow-hidden">
              {activeTypingUsers.map((typingUser) => {
                const uInfo = getUserInfo(typingUser);
                const isImg = uInfo.avatar && (uInfo.avatar.startsWith("data:image") || uInfo.avatar.startsWith("http"));
                return (
                  <div
                    key={typingUser}
                    className="relative w-5 h-5 rounded-full ring-2 ring-slate-900 bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 shadow-sm"
                    title={`@${typingUser} (${uInfo.status})`}
                  >
                    {isImg ? (
                      <img src={uInfo.avatar} alt={typingUser} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-[10px]">{uInfo.avatar || "🦊"}</span>
                    )}
                    <span className={`absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full ring-1 ring-slate-900 ${getStatusDotBg(uInfo.status)}`} />
                  </div>
                );
              })}
            </div>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono font-medium">
              <span className="flex gap-0.5 items-center">
                <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.8s' }} />
                <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.8s' }} />
                <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.8s' }} />
              </span>
              <span>{activeTypingUsers.map((u) => `@${u}`).join(", ")}</span>
              <span className="font-semibold animate-pulse">...typing</span>
            </span>
          </div>
        )}

        {/* Pending File Thumbnail / Attachment Preview */}
        {pendingFile && (
          <div className="mb-3 p-2.5 bg-slate-900/90 border border-indigo-500/40 rounded-2xl flex items-center justify-between gap-3 shadow-xl backdrop-blur-md animate-fadeIn">
            {/* Left: Thumbnail & File Metadata */}
            <div className="flex items-center gap-3 min-w-0">
              {pendingFile.isImage ? (
                <div className="relative group/thumb w-14 h-14 rounded-xl overflow-hidden bg-slate-950 border border-white/10 shrink-0 shadow-md">
                  <img
                    src={pendingFile.previewUrl}
                    alt={pendingFile.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setStandaloneGalleryItem({
                        id: "pending-preview",
                        src: pendingFile.previewUrl,
                        fileName: pendingFile.name,
                        fileSize: pendingFile.size,
                        sender: currentUsername,
                        timestamp: Date.now(),
                        caption: text.trim() || undefined
                      });
                      setGalleryInitialIndex(0);
                      setIsGalleryOpen(true);
                    }}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-white cursor-pointer"
                    title="Expand preview full-screen"
                    aria-label="Expand preview full-screen"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="w-14 h-14 rounded-xl bg-slate-950 border border-slate-700/80 flex flex-col items-center justify-center text-indigo-400 shrink-0">
                  <FileText className="w-6 h-6" />
                  <span className="text-[9px] uppercase font-bold text-slate-400 mt-0.5">
                    {pendingFile.name.split(".").pop()?.slice(0, 4) || "FILE"}
                  </span>
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-200 truncate max-w-[180px] sm:max-w-xs md:max-w-md" title={pendingFile.name}>
                    {pendingFile.name}
                  </p>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[9px] font-bold uppercase tracking-wider shrink-0 border border-indigo-500/30">
                    {pendingFile.isImage ? "Image Ready" : "Document"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                  {(pendingFile.size / 1024).toFixed(1)} KB • Backed up to Google Drive on send
                </p>
              </div>
            </div>

            {/* Right: Discard / Cancel button */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleCancelPendingFile}
                className="p-2 rounded-xl hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all cursor-pointer active:scale-95"
                title="Discard attachment"
                aria-label="Discard attachment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {isVoiceRecording ? (
          <div className="w-full">
            <VoiceRecorder
              onSendVoice={onSendVoice}
              onRecordingStateChange={setIsVoiceRecording}
              themeAccentText={theme.accentText}
              themeAccentBg={theme.accentBg}
            />
          </div>
        ) : (
          <div className={`flex items-center gap-3 ${theme.bgInput} rounded-2xl p-2 pr-3 border ${theme.borderColor}`}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/*,application/pdf,application/zip,text/plain"
            />

            {/* Media picker button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`p-2 text-slate-400 hover:${theme.accentText} transition-colors cursor-pointer flex items-center justify-center`}
              title="Attach image or document"
              type="button"
            >
              <Paperclip className="w-5 h-5 hover:scale-110 transition-transform" />
            </button>

            {/* Voice Recorder button (triggers recording state) */}
            <VoiceRecorder
              onSendVoice={onSendVoice}
              onRecordingStateChange={setIsVoiceRecording}
              themeAccentText={theme.accentText}
              themeAccentBg={theme.accentBg}
            />

            {/* Create Poll Trigger Button */}
            <button
              type="button"
              onClick={() => setShowPollCreator(true)}
              className="p-2 text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer flex items-center justify-center"
              title="Create a chat stream Poll"
            >
              <BarChart2 className="w-5 h-5 hover:scale-110 transition-transform" />
            </button>

            {/* Text Input Block */}
            <form onSubmit={handleSend} className="flex-1 flex items-center gap-2">
              <input
                type="text"
                value={text}
                onChange={handleInputChange}
                onPaste={handlePaste}
                placeholder={pendingFile ? "Add a caption (optional) or press Send..." : "Type your message..."}
                className="flex-1 bg-transparent border-none text-sm text-slate-100 placeholder-slate-600 focus:ring-0 py-2 outline-none"
              />

              <button
                type="submit"
                disabled={(!text.trim() && !pendingFile) || isSending}
                className={`${theme.accentBg} hover:${theme.accentHoverBg} w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${theme.accentGlow} transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0`}
                title="Send Message"
              >
                {isSending ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 translate-x-0.5" />
                )}
              </button>
            </form>
          </div>
        )}
      </footer>
      </div>

      {showMediaGallery && (
        <div className={`w-72 sm:w-80 border-l ${theme.borderColor} ${theme.bgSidebar} bg-opacity-95 flex flex-col h-full shrink-0 select-none backdrop-blur-md absolute md:relative inset-y-0 right-0 z-20 md:z-10 shadow-2xl md:shadow-none animate-slideInRight`}>
          {/* Header */}
          <div className="h-16 px-4 border-b border-slate-800/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Image className={`w-4 h-4 ${theme.accentText}`} />
              <span className={`text-xs font-bold ${theme.textMain} tracking-wider uppercase`}>Room Media</span>
            </div>
            <button
              onClick={() => setShowMediaGallery(false)}
              className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close gallery"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Subtabs for Images and Files */}
          <div className="flex p-1 bg-black/15 rounded-xl border border-slate-800/40 m-4 gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setGalleryTab("images")}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                galleryTab === "images"
                  ? `${theme.accentBg} text-white shadow-sm`
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Images ({sharedImages.length})
            </button>
            <button
              type="button"
              onClick={() => setGalleryTab("files")}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                galleryTab === "files"
                  ? `${theme.accentBg} text-white shadow-sm`
                  : "text-slate-400 hover:text-slate-250"
              }`}
            >
              Files ({sharedFiles.length})
            </button>
          </div>

          {/* Media list / grid */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
            {galleryTab === "images" ? (
              sharedImages.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-2xl bg-black/10 border border-slate-800/20">
                  <Image className="w-8 h-8 text-slate-600 mx-auto mb-2.5 animate-pulse" />
                  <p className="text-xs font-bold text-slate-400">No Shared Images</p>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] mx-auto leading-relaxed">
                    Any images sent in this conversation will show up here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {sharedImages.map((msg, idx) => {
                    const src = msg.isMedia 
                      ? (msg.decryptedMediaUrl || msg.ciphertext) 
                      : (msg.decryptedText || msg.ciphertext || "").trim();
                    const name = msg.fileName || "Shared Image";
                    
                    return (
                      <div 
                        key={msg.id || idx}
                        className="relative group/gallery-item aspect-square rounded-xl overflow-hidden border border-slate-800 bg-slate-950 cursor-pointer shadow-md hover:scale-[1.03] transition-all animate-fadeIn"
                        onClick={() => openGalleryAtImage(msg.id || src)}
                        title={`Shared by @${msg.sender}`}
                      >
                        <img 
                          src={src} 
                          alt={name} 
                          className="w-full h-full object-cover group-hover/gallery-item:brightness-110 transition-all"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/gallery-item:opacity-100 transition-all flex flex-col justify-end p-2 pointer-events-none">
                          <p className="text-[9px] font-semibold text-white truncate">@{msg.sender}</p>
                          <p className="text-[8px] text-slate-450 font-mono truncate">{new Date(msg.timestamp || Date.now()).toLocaleDateString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              sharedFiles.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-2xl bg-black/10 border border-slate-800/20">
                  <Paperclip className="w-8 h-8 text-slate-600 mx-auto mb-2.5 animate-pulse" />
                  <p className="text-xs font-bold text-slate-400">No Shared Files</p>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] mx-auto leading-relaxed">
                    Any documents or attachments sent will show up here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sharedFiles.map((msg, idx) => {
                    const url = msg.decryptedMediaUrl || msg.ciphertext;
                    const name = msg.fileName || "downloaded-file";
                    
                    return (
                      <div 
                        key={msg.id || idx}
                        className="p-2.5 rounded-xl bg-black/15 border border-slate-800/60 hover:border-slate-700 transition-all flex items-center justify-between gap-3 group/file animate-fadeIn"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`p-2 rounded-lg bg-slate-950 border border-slate-800 shrink-0 ${theme.accentText}`}>
                            <Paperclip className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-200 truncate" title={name}>
                              {name}
                            </p>
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                              {msg.mediaType} • {((msg.fileSize || 0) / 1024).toFixed(1)} KB
                            </p>
                            <p className="text-[9px] text-slate-400 mt-0.5">
                              by @{msg.sender}
                            </p>
                          </div>
                        </div>
                        <a
                          href={url}
                          download={name}
                          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Download file"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Full-screen Image Gallery Modal */}
      <ImageGalleryModal
        isOpen={isGalleryOpen}
        images={standaloneGalleryItem ? [standaloneGalleryItem, ...galleryImages.filter(g => g.id !== standaloneGalleryItem.id)] : galleryImages}
        initialIndex={galleryInitialIndex}
        onClose={() => {
          setIsGalleryOpen(false);
          setStandaloneGalleryItem(null);
        }}
        themeAccentText={theme.accentText}
        themeAccentBg={theme.accentBg}
      />

      {/* Create Poll Dialog Modal */}
      {showPollCreator && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-955/90 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setShowPollCreator(false)}
        >
          <div 
            className="w-full max-w-md bg-slate-900 border border-slate-800/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/5 select-none shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                  <BarChart2 className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-display">Create a New Poll</h3>
                  <p className="text-[10px] text-slate-500 leading-tight">Gather real-time room feedback</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPollCreator(false)}
                className="p-1.5 text-slate-405 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Poll Creation Form */}
            <form onSubmit={handleCreatePollSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh] custom-scrollbar text-left">
                
                {/* Question Input */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Poll Question
                  </label>
                  <input
                    type="text"
                    required
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="e.g., What topic should we study tomorrow?"
                    className="w-full bg-slate-950/50 border border-slate-800/80 px-3.5 py-2.5 rounded-xl text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/10 transition-all font-medium"
                    autoFocus
                  />
                </div>

                {/* Options List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between select-none">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                      Choice Options ({pollOptions.length}/8)
                    </label>
                    <span className="text-[9px] text-slate-500">Minimum 2 options</span>
                  </div>

                  <div className="space-y-2.5">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2 group">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            required={idx < 2}
                            value={opt}
                            onChange={(e) => handlePollOptionChange(idx, e.target.value)}
                            placeholder={`Option ${idx + 1}`}
                            className="w-full bg-slate-950/30 border border-slate-800 px-3.5 py-2 rounded-xl text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/10 transition-all font-sans font-medium"
                          />
                        </div>
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePollOption(idx)}
                            className="p-2 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/5 transition-all cursor-pointer shrink-0 flex items-center justify-center border border-transparent hover:border-slate-800 bg-slate-950/20"
                            title="Delete this option"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add option capability */}
                  {pollOptions.length < 8 && (
                    <button
                      type="button"
                      onClick={handleAddPollOption}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 mt-1.5 border border-dashed border-slate-800 hover:border-indigo-500/40 hover:bg-indigo-500/5 text-[10px] font-bold text-slate-400 hover:text-indigo-400 rounded-xl transition-all select-none cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Option
                    </button>
                  )}
                </div>
              </div>

              {/* Bottom Actions Footer */}
              <div className="p-4 bg-slate-950/40 border-t border-white/5 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPollCreator(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim() !== "").length < 2}
                  className={`px-5 py-2 text-xs font-extrabold text-white rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer ${
                    (!pollQuestion.trim() || pollOptions.filter(o => o.trim() !== "").length < 2)
                      ? "bg-slate-800 text-slate-600 cursor-not-allowed shadow-none border border-transparent"
                      : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/10 border border-indigo-500/10"
                  }`}
                >
                  Post Poll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardingMessage && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-955/90 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setForwardingMessage(null)}
        >
          <div 
            className="w-full max-w-md bg-slate-900 border border-slate-800/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/5 select-none shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                  <Forward className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-display">Forward Message</h3>
                  <p className="text-[10px] text-slate-500 leading-tight">Send this message to another channel or direct message</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                className="p-1.5 text-slate-405 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message Preview */}
            <div className="px-5 py-3 bg-slate-950/40 border-b border-white/5 text-xs text-slate-400 flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Message Preview:</span>
              <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/60 truncate italic max-h-16 overflow-y-auto">
                {forwardingMessage.isDeleted ? (
                  "Deleted Message"
                ) : forwardingMessage.isPoll ? (
                  `📊 Poll: ${forwardingMessage.pollQuestion}`
                ) : forwardingMessage.isMedia ? (
                  `📁 File: ${forwardingMessage.fileName || "Media file"}`
                ) : forwardingMessage.isAudio ? (
                  `🎤 Voice Note`
                ) : (
                  forwardingMessage.decryptedText || forwardingMessage.ciphertext || ""
                )}
              </div>
            </div>

            {/* Search and Channels List */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search chats, groups, or friends..."
                  value={forwardSearchQuery}
                  onChange={(e) => setForwardSearchQuery(e.target.value)}
                  className="w-full bg-slate-955/40 border border-slate-800 px-3.5 py-2 pl-9 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10 transition-all font-sans"
                />
                <div className="absolute left-3 top-2.5 text-slate-600">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>

              {/* Room list */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Select Destination</span>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {(() => {
                    const filteredRooms = (rooms || []).filter(room => {
                      // Don't forward to the current room
                      if (activeRoom && room.id === activeRoom.id) return false;
                      
                      // Filter by search query
                      if (room.isGroup) {
                        return room.name.toLowerCase().includes(forwardSearchQuery.toLowerCase());
                      } else {
                        // For DM, display friend's name
                        const displayFriend = room.name
                          .replace(currentUsername, "")
                          .replace("&", "")
                          .trim();
                        return displayFriend.toLowerCase().includes(forwardSearchQuery.toLowerCase());
                      }
                    });

                    if (filteredRooms.length === 0) {
                      return (
                        <div className="text-center py-6 text-xs text-slate-600 italic">
                          No other rooms found matching search query
                        </div>
                      );
                    }

                    return filteredRooms.map(room => {
                      const roomName = room.isGroup 
                        ? room.name 
                        : room.name.replace(currentUsername, "").replace("&", "").trim();

                      return (
                        <button
                          key={room.id}
                          onClick={() => {
                            if (onForwardMessage) {
                              onForwardMessage(forwardingMessage, room.id);
                            }
                            setForwardingMessage(null);
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-slate-800/50 flex items-center justify-between transition-all text-left group cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {room.isGroup ? (
                              room.avatar ? (
                                <img
                                  src={room.avatar}
                                  alt={roomName}
                                  className="w-8 h-8 rounded-full object-cover shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0 uppercase">
                                  {roomName.slice(0, 2)}
                                </div>
                              )
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-750 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0 uppercase border border-slate-700/40">
                                {roomName.slice(0, 2)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-slate-200 block truncate group-hover:text-emerald-400 transition-colors">{roomName}</span>
                              <span className="text-[9px] text-slate-550 block truncate">
                                {room.isGroup ? `${room.privacy === "private" ? "🔒" : "🌐"} Group Chat` : "👤 Direct Message"}
                              </span>
                            </div>
                          </div>
                          
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
                            Forward
                          </span>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950/40 border-t border-white/5 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Message Read Details Modal */}
      {activeReadInfoMsgId && (() => {
        const targetMsg = messages.find(m => m.id === activeReadInfoMsgId);
        if (!targetMsg || !activeRoom) return null;

        const otherMembers = (activeRoom.members || []).filter(u => u !== targetMsg.sender);
        const readers = targetMsg.readBy ? targetMsg.readBy.filter(u => u !== targetMsg.sender) : [];
        const unreadMembers = otherMembers.filter(u => !readers.includes(u));

        return (
          <div 
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
            onClick={() => setActiveReadInfoMsgId(null)}
          >
            <div 
              className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-5 flex flex-col gap-4 animate-scaleUp select-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-500/15 text-emerald-400 rounded-xl">
                    <CheckCheck className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Message Read Status</h3>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Sent {new Date(targetMsg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} • #{activeRoom.name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveReadInfoMsgId(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Message Snippet Preview */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 text-xs text-slate-300 font-sans">
                <div className="text-[10px] text-slate-400 font-semibold mb-1">
                  {targetMsg.sender === currentUsername ? "Your message:" : `@${targetMsg.sender}:`}
                </div>
                <p className="truncate italic text-slate-300 text-xs">
                  {targetMsg.decryptedText || targetMsg.ciphertext || (targetMsg.isMedia ? `Shared ${targetMsg.fileName || "attachment"}` : "Message")}
                </p>
              </div>

              {/* Read by section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCheck className="w-3.5 h-3.5" />
                    Read by ({readers.length})
                  </span>
                  {activeRoom.isGroup && (
                    <span className="text-[10px] font-mono text-slate-400">
                      {Math.round((readers.length / Math.max(otherMembers.length, 1)) * 100)}%
                    </span>
                  )}
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {readers.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-3 text-center">
                      No participants have viewed this message yet
                    </p>
                  ) : (
                    readers.map((rName) => {
                      const uInfo = getUserInfo(rName);
                      const isImg = uInfo.avatar && (uInfo.avatar.startsWith("data:image") || uInfo.avatar.startsWith("http"));
                      return (
                        <div
                          key={rName}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative w-7 h-7 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                              {isImg ? (
                                <img src={uInfo.avatar} alt={rName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm">{uInfo.avatar || "🦊"}</span>
                              )}
                              <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ring-2 ring-slate-900 ${getStatusDotBg(uInfo.status)}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-200 truncate">@{rName}</p>
                              <p className="text-[10px] text-slate-400 capitalize flex items-center gap-1 font-mono">
                                <span className={`w-1.5 h-1.5 rounded-full ${getStatusDotBg(uInfo.status)}`} />
                                {uInfo.status}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shrink-0">
                            <CheckCheck className="w-3 h-3" />
                            Read
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Unread / Delivered section if in group */}
              {activeRoom.isGroup && unreadMembers.length > 0 && (
                <div className="space-y-2 border-t border-slate-800 pt-3">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Check className="w-3.5 h-3.5" />
                      Delivered ({unreadMembers.length})
                    </span>
                    <span className="text-[10px] text-slate-500">Awaiting view</span>
                  </div>

                  <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                    {unreadMembers.map((mName) => {
                      const uInfo = getUserInfo(mName);
                      const isImg = uInfo.avatar && (uInfo.avatar.startsWith("data:image") || uInfo.avatar.startsWith("http"));
                      return (
                        <div
                          key={mName}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-950/20 border border-slate-800/40 text-xs opacity-75"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative w-6 h-6 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                              {isImg ? (
                                <img src={uInfo.avatar} alt={mName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs">{uInfo.avatar || "🦊"}</span>
                              )}
                              <span className={`absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full ring-1 ring-slate-900 ${getStatusDotBg(uInfo.status)}`} />
                            </div>
                            <span className="font-medium text-slate-300 truncate">@{mName}</span>
                          </div>
                          <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                            Delivered
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dismiss button */}
              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveReadInfoMsgId(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

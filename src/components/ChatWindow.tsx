import React, { useState, useRef, useEffect } from "react";
import { Send, Image, MessageSquare, Users, Paperclip, Loader, Info, User, ArrowLeft, X, Download, BarChart2, Plus, Trash2, List, Phone, Video, Check, CheckCheck } from "lucide-react";
import { Room, Message } from "../types";
import AudioPlayer from "./AudioPlayer";
import VoiceRecorder from "./VoiceRecorder";
import { ThemeId, getTheme } from "../utils/theme";

interface ChatWindowProps {
  activeRoom: Room | null;
  currentUsername: string;
  messages: Message[];
  onSendMessage: (text: string) => Promise<void>;
  onSendFile: (file: File) => Promise<void>;
  onSendVoice: (audioBlob: Blob) => Promise<void>;
  typingUsers: string[];
  onTyping: (isTyping: boolean) => void;
  // Kept for backward compatibility but unused/always active
  hasAesKey?: boolean;
  onNegotiateKey?: () => void;
  activeThemeId: ThemeId;
  onBack?: () => void;
  onReactToMessage: (messageId: string, emoji: string) => void;
  onSendPoll?: (question: string, options: string[]) => void;
  onVotePoll?: (messageId: string, optionId: string) => void;
  onInitiateCall?: (callType: "voice" | "video") => void;
  onUpdateRoomPrivacy?: (roomId: string, privacy: "public" | "private") => void;
}

export default function ChatWindow({
  activeRoom,
  currentUsername,
  messages,
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
  onSendPoll,
  onVotePoll,
  onInitiateCall,
  onUpdateRoomPrivacy,
}: ChatWindowProps) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ src: string; name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const theme = getTheme(activeThemeId);

  // Poll creation state
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

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

  // Auto Scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

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
        setSelectedImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isSending) return;

    setIsSending(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    onTyping(false);

    try {
      await onSendMessage(text.trim());
      setText("");
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onSendFile(file);
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await onSendFile(file);
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

  const cleanRoomName = activeRoom.name
    .replace(currentUsername, "")
    .replace("&", "")
    .trim();

  return (
    <div 
      className={`flex-1 ${theme.bgMain} flex flex-col relative h-full ${
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
          {activeRoom.avatar ? (
            <img
              src={activeRoom.avatar}
              alt={cleanRoomName}
              className="w-10 h-10 rounded-full object-cover shadow-md shrink-0 border border-slate-800/40"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center font-bold text-white shadow-md`}>
              {cleanRoomName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className={`text-sm font-bold ${theme.textMain}`}>{cleanRoomName}</h2>
            <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Active chatroom • {activeRoom.members.length} member{activeRoom.members.length === 1 ? "" : "s"}
            </p>
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
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-semibold tracking-wider">
            CONNECTED
          </div>
        </div>
      </div>

      {/* Messages Scroll Panel */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center h-full text-slate-600 select-none py-12">
            <MessageSquare className="w-10 h-10 text-slate-750 stroke-1 mb-2.5 animate-pulse" />
            <p className="text-xs font-medium">No messages in this chat stream yet.</p>
            <p className="text-[10px] mt-1 max-w-xs text-slate-500">
              Type or record below. Start the conversation by sharing a greeting or a file.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.sender === currentUsername;
            const prevMsg = index > 0 ? messages[index - 1] : null;
            
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
                  className={`flex items-end gap-3 max-w-[75%] ${isMe ? "ml-auto flex-row-reverse" : "mr-auto"}`}
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
                      <span className="text-slate-400 truncate max-w-36">{isMe ? "You" : msg.sender}</span>
                      <span>•</span>
                      <span>{formatTime(msg.timestamp)}</span>
                      {isMe && (
                        (() => {
                          const otherReaders = msg.readBy ? msg.readBy.filter(u => u !== msg.sender) : [];
                          const hasOtherReaders = otherReaders.length > 0;
                          return (
                            <>
                              <span>•</span>
                              <span className="flex items-center" title={hasOtherReaders ? `Read by: ${otherReaders.join(", ")}` : "Sent"}>
                                {hasOtherReaders ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-sky-450 stroke-[2.5]" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-slate-500 stroke-[2.5]" />
                                )}
                              </span>
                            </>
                          );
                        })()
                      )}
                    </div>

                    {/* Hover Reaction trigger and message bubble container overlay */}
                    <div className="relative group/bubble-container max-w-full flex flex-col">
                      {/* Reaction picker on hover */}
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
                      </div>

                      {/* Standard Message Bubble */}
                      <div
                        className={`p-3 rounded-2xl border text-left text-sm max-w-full ${
                          isMe
                            ? `${theme.bubbleMe} rounded-tr-none shadow-xl ${theme.accentGlow}`
                            : `${theme.bubbleOther} rounded-tl-none shadow-sm`
                        }`}
                      >
                        {msg.isAudio ? (
                          msg.decryptedMediaUrl || msg.ciphertext ? (
                            <AudioPlayer src={msg.decryptedMediaUrl || msg.ciphertext} />
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
                                    onClick={() => setSelectedImage({
                                      src: msg.decryptedMediaUrl || msg.ciphertext || "",
                                      name: msg.fileName || "Shared Image"
                                    })}
                                    className="max-h-60 rounded-xl max-w-full border border-slate-800 media-glow mb-1 bg-slate-950 object-contain hover:scale-[1.02] hover:brightness-110 transition-all cursor-pointer shadow-lg"
                                  />
                                  <div className="absolute bottom-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity bg-slate-900/80 px-2 py-1 rounded text-[10px] text-slate-350 pointer-events-none select-none backdrop-blur-xs">
                                    Click to expand
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
                                    <p className="truncate max-w-40 font-medium text-slate-200">{msg.fileName}</p>
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
                          </div>
                        ) : msg.isPoll ? (
                          <div className="w-72 max-w-full text-slate-100 flex flex-col gap-3 font-sans">
                            {/* Poll Header Banner */}
                            <div className="flex items-start gap-2 border-b border-white/5 pb-2">
                              <span className={`p-1.5 rounded-lg bg-indigo-500/15 ${theme.accentText} shrink-0`}>
                                <BarChart2 className="w-4 h-4" />
                              </span>
                              <div className="font-semibold text-[13px] leading-snug break-words pr-1 text-slate-100">
                                {msg.pollQuestion}
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
                                        <span className="truncate">{opt.text}</span>
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
                          <p className="whitespace-pre-wrap breakdown-all break-words leading-relaxed leading-6 text-slate-100">
                            {msg.decryptedText || msg.ciphertext}
                          </p>
                        )}
                      </div>

                      {/* Reactions display count below the message bubble */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1.5 ${isMe ? "justify-end" : "justify-start"}`}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => {
                            if (!users || users.length === 0) return null;
                            const hasReacted = users.includes(currentUsername);
                            return (
                              <button
                                key={emoji}
                                onClick={() => {
                                  if (msg.id) {
                                    onReactToMessage(msg.id, emoji);
                                  }
                                }}
                                title={users.join(", ")}
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border backdrop-blur-xs select-none transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                                  hasReacted
                                    ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                                    : "bg-slate-800/80 text-slate-300 border-slate-700"
                                }`}
                              >
                                <span>{emoji}</span>
                                <span className="text-[10px] font-semibold">{users.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}

        {/* Remote typing statuses */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-sans italic px-12 py-1 select-none animate-fadeIn">
            <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/40 px-2.5 py-1 rounded-full">
              <span className="flex gap-1 items-center shrink-0">
                <span className={`h-1.5 w-1.5 rounded-full ${theme.accentBg} animate-bounce`} style={{ animationDelay: '0ms', animationDuration: '1s' }}></span>
                <span className={`h-1.5 w-1.5 rounded-full ${theme.accentBg} animate-bounce`} style={{ animationDelay: '150ms', animationDuration: '1s' }}></span>
                <span className={`h-1.5 w-1.5 rounded-full ${theme.accentBg} animate-bounce`} style={{ animationDelay: '300ms', animationDuration: '1s' }}></span>
              </span>
              <span className="text-slate-350 ml-1 font-medium not-italic">{typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...</span>
            </div>
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
          >
            <Paperclip className="w-5 h-5 hover:scale-110 transition-transform" />
          </button>

          {/* Voice Recorder */}
          <VoiceRecorder onSendVoice={onSendVoice} />

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
              placeholder="Type your message..."
              className="flex-1 bg-transparent border-none text-sm text-slate-100 placeholder-slate-600 focus:ring-0 py-2 outline-none"
            />

            <button
              type="submit"
              disabled={!text.trim() || isSending}
              className={`${theme.accentBg} hover:${theme.accentHoverBg} w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${theme.accentGlow} transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0`}
              title="Send Message"
            >
              <Send className="w-4 h-4 translate-x-0.5" />
            </button>
          </form>
        </div>
      </footer>

      {/* Full-screen Image Preview Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md animate-fadeIn p-4"
          onClick={() => setSelectedImage(null)}
        >
          {/* Top header controls */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-30 select-none">
            <h4 className="text-xs font-mono text-slate-350 truncate max-w-[70%] bg-slate-900/60 px-3 py-1.5 rounded-full border border-white/5">
              {selectedImage.name}
            </h4>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <a
                href={selectedImage.src}
                download={selectedImage.name}
                className="p-2.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-350 hover:text-white rounded-full transition-all active:scale-95 flex items-center justify-center"
                title="Download original file"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-all active:scale-95 flex items-center justify-center shadow-lg cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Centered Image Container */}
          <div 
            className="relative max-w-full max-h-[85vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage.src}
              alt={selectedImage.name}
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[80vh] md:max-h-[85vh] rounded-2xl object-scale-down border border-slate-800 shadow-2xl transition-transform"
            />
          </div>

          {/* Footnote instruction */}
          <div className="absolute bottom-4 text-center text-[10px] text-slate-500 font-mono select-none pointer-events-none">
            Press [ESC] or click anywhere outside to exit
          </div>
        </div>
      )}

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
    </div>
  );
}

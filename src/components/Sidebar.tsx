import React, { useState } from "react";
import { Hash, MessageSquare, Users, BookOpen, User, LogOut, Plus, Settings, Search, X, Shield, ShieldCheck, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, Clock, Trash2 } from "lucide-react";
import { Room, User as TypeUser, CallRecord } from "../types";
import { ThemeId, getTheme } from "../utils/theme";

interface SidebarProps {
  currentUsername: string;
  currentUserAvatar: string;
  onEditProfile: () => void;
  rooms: Room[];
  activeRoomId: string;
  activeUsers: TypeUser[];
  onSelectRoom: (roomId: string) => void;
  onOpenNewConversation: () => void;
  onLogout: () => void;
  // Security parameters (optional/ignored for non-crypto theme)
  publicKeyFingerprint?: string;
  hasAesKey: (roomId: string) => boolean;
  securityLogs: string[];
  activeThemeId: ThemeId;
  onOpenFriendsList: () => void;
  pendingRequestsCount?: number;
  callHistory: CallRecord[];
  onClearCallHistory: () => void;
  activeTab?: "chats" | "calls";
  onTabChange?: (tab: "chats" | "calls") => void;
  typingUsersRecord?: Record<string, string[]>;
}

const formatCallTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) {
    return `Today, ${timeStr}`;
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }
  
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
};

const formatCallDuration = (seconds: number) => {
  if (!seconds || seconds === 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
};

export default function Sidebar({
  currentUsername,
  currentUserAvatar,
  onEditProfile,
  rooms,
  activeRoomId,
  activeUsers,
  onSelectRoom,
  onOpenNewConversation,
  onLogout,
  publicKeyFingerprint,
  hasAesKey,
  securityLogs,
  activeThemeId,
  onOpenFriendsList,
  pendingRequestsCount = 0,
  callHistory,
  onClearCallHistory,
  activeTab: controlledActiveTab,
  onTabChange,
  typingUsersRecord = {},
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [localActiveTab, setLocalActiveTab] = useState<"chats" | "calls">("chats");
  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : localActiveTab;

  const setActiveTab = (tab: "chats" | "calls") => {
    setLocalActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const theme = getTheme(activeThemeId);

  // Split groups vs DMs
  const groupChannels = rooms.filter((r) => r.isGroup);
  const directMessages = rooms.filter((r) => !r.isGroup);

  const filteredGroupChannels = groupChannels.filter((room) =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDirectMessages = directMessages.filter((room) => {
    const displayFriend = room.name
      .replace(currentUsername, "")
      .replace("&", "")
      .trim();
    return (
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      displayFriend.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className={`w-full md:w-80 border-r ${theme.borderColor} ${theme.bgSidebar} flex flex-col h-full shrink-0 select-none backdrop-blur-md`}>
      {/* Top Banner (User Info) */}
      <div className={`p-4 border-b ${theme.borderColor} bg-black/15`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div 
              onClick={onEditProfile} 
              className={`w-10 h-10 rounded-full overflow-hidden ${theme.accentBgMuted} border-2 ${theme.accentBorderMuted} flex items-center justify-center text-lg shadow-inner shrink-0 cursor-pointer hover:scale-105 transition-transform`}
              title="Edit Profile & Account Settings"
            >
              {currentUserAvatar && (currentUserAvatar.startsWith("data:image") || currentUserAvatar.startsWith("http")) ? (
                <img src={currentUserAvatar} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                currentUserAvatar || "🦊"
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${theme.textMain} truncate cursor-pointer hover:${theme.accentText} transition-colors`} onClick={onEditProfile} title={currentUsername}>
                {currentUsername}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span className="text-[10px] text-emerald-400 font-medium">Online</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={onEditProfile}
              className={`p-1.5 hover:bg-white/5 text-slate-400 hover:${theme.accentText} rounded-lg transition-colors cursor-pointer`}
              title="Profile & Account Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onLogout}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
              title="Sign out / Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Conversations Input */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            id="sidebar-search-input"
            type="text"
            placeholder="Search rooms or people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full ${theme.bgInput} border ${theme.borderColor} rounded-xl pl-8.5 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:${theme.accentBorder} focus:ring-1 focus:ring-${theme.accentName}-500 transition-all`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 hover:bg-slate-800 p-0.5 rounded text-slate-500 hover:text-slate-300 transition-colors cursor-pointer flex items-center justify-center"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Cohesive Segmented Tabs Switcher */}
        <div className="flex p-1 bg-black/15 rounded-xl border border-slate-800/40 mt-3.5 gap-0.5">
          <button
            onClick={() => setActiveTab("chats")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === "chats"
                ? `${theme.accentBg} text-white shadow-sm`
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chats
          </button>
          <button
            onClick={() => setActiveTab("calls")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer relative ${
              activeTab === "calls"
                ? `${theme.accentBg} text-white shadow-sm`
                : "text-slate-400 hover:text-slate-250"
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            Calls
            {callHistory.length > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[8px] font-bold bg-indigo-600 text-white rounded-full flex items-center justify-center shrink-0">
                {callHistory.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Middle Scroll Area (Group Channels & DMs) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-5">
        {activeTab === "calls" ? (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 tracking-wider px-2">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-indigo-400" />
                RECENT CALLS
              </span>
              {callHistory.length > 0 && (
                <button
                  onClick={onClearCallHistory}
                  className="text-slate-500 hover:text-red-400 font-bold transition-all flex items-center gap-1 text-[9px] cursor-pointer"
                  title="Clear call logs"
                >
                  <Trash2 className="w-3 h-3" />
                  CLEAR ALL
                </button>
              )}
            </div>

            {callHistory.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-2xl bg-black/10 border border-slate-800/20">
                <Phone className="w-8 h-8 text-slate-600 mx-auto mb-2.5 animate-pulse" />
                <p className="text-xs font-bold text-slate-400">No Call History</p>
                <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] mx-auto leading-relaxed">
                  Voice and video conversation logs will be saved automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                {callHistory.map((item) => {
                  const isMissed = item.status === "missed";
                  const isOutgoing = item.status === "outgoing";
                  
                  let StatusIcon = PhoneIncoming;
                  let statusColorText = "text-indigo-400";
                  let statusBg = "bg-indigo-400/5 border-indigo-400/10";
                  let statusLabel = "Incoming";

                  if (isMissed) {
                    StatusIcon = PhoneMissed;
                    statusColorText = "text-rose-400";
                    statusBg = "bg-rose-500/5 border-rose-500/10";
                    statusLabel = "Missed";
                  } else if (isOutgoing) {
                    StatusIcon = PhoneOutgoing;
                    statusColorText = "text-emerald-400";
                    statusBg = "bg-emerald-400/5 border-emerald-400/10";
                    statusLabel = "Outgoing";
                  }

                  const callTypeIcon = item.callType === "video" ? (
                    <Video className="w-3.5 h-3.5 text-indigo-400" />
                  ) : (
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  );

                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelectRoom(item.roomId)}
                      className={`group p-3 rounded-2xl bg-black/15 border ${theme.borderColor} hover:${theme.accentBorderMuted} transition-all cursor-pointer flex items-center justify-between gap-3 relative`}
                      title="Jump to conversation"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Circle badge */}
                        <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0 uppercase relative">
                          {item.roomName ? item.roomName.slice(0, 2) : "CL"}
                          <div className={`absolute -bottom-1 -right-1 p-1 rounded-full border border-slate-900 bg-slate-900 shadow-md ${statusColorText}`}>
                            <StatusIcon className="w-2.5 h-2.5" />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <span className="text-sm font-semibold truncate block text-slate-200">
                            {item.roomName}
                          </span>
                          
                          <div className="flex items-center gap-2 mt-1">
                            {/* type label */}
                            <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                              {callTypeIcon}
                              <span className="capitalize">{item.callType}</span>
                            </span>
                            
                            <span className="text-[10px] text-slate-600 font-bold">•</span>

                            {/* Duration */}
                            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {item.status === "missed" ? "0s" : formatCallDuration(item.duration)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="text-[9px] text-slate-500 font-medium block">
                          {formatCallTimestamp(item.timestamp)}
                        </span>
                        
                        <span className={`text-[9px] font-semibold border px-1.5 py-0.5 rounded-md ${statusColorText} ${statusBg}`}>
                          {statusLabel.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Friends Launcher Tab */}
            <div className="px-1 shrink-0">
              <button
                onClick={onOpenFriendsList}
                className={`w-full px-4 py-3 flex items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border ${theme.borderColor} hover:${theme.accentBorderMuted} text-slate-300 hover:text-white transition-all cursor-pointer shadow-md`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl ${theme.accentBgMuted} border ${theme.accentBorderMuted} flex items-center justify-center text-indigo-400 font-bold shrink-0 shadow-sm`}>
                    <Users className={`w-4 h-4 ${theme.accentText}`} />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="text-xs font-bold block leading-snug">Friends Workspace</span>
                    <span className="text-[10px] text-slate-500 block">Add people & direct chat</span>
                  </div>
                </div>
                {pendingRequestsCount > 0 ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full animate-bounce shadow">
                    {pendingRequestsCount}
                  </span>
                ) : (
                  <span className={`text-[10px] ${theme.accentTextMuted} bg-white/5 border border-white/5 px-2 py-0.5 rounded-lg`}>
                    Manage
                  </span>
                )}
              </button>
            </div>

            {/* Simple Group Channels */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 tracking-wider mb-2 px-2.5">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  CHANNELS
                </span>
              </div>

              <div className="space-y-0.5">
                {filteredGroupChannels.length === 0 ? (
                  <p className="text-[11px] text-slate-600 italic px-2.5">
                    {searchQuery ? "No matching channels" : "No group channels"}
                  </p>
                ) : (
                  filteredGroupChannels.map((room) => {
                    const active = room.id === activeRoomId;
                    const roomTypingUsers = typingUsersRecord?.[room.id] || [];
                    const isSomeoneTyping = roomTypingUsers.length > 0;
                    return (
                      <button
                        key={room.id}
                        onClick={() => onSelectRoom(room.id)}
                        className={`w-full px-4 py-3 flex items-center justify-between transition-all text-left cursor-pointer border-r-2 ${
                          active
                            ? `${theme.accentBgMuted} ${theme.accentBorder} ${theme.textMain}`
                            : `hover:bg-white/5 border-transparent text-slate-400 hover:${theme.textMain}`
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {room.avatar ? (
                            <img
                              src={room.avatar}
                              alt={room.name}
                              className="w-10 h-10 rounded-full object-cover shadow-md shrink-0 border border-slate-800/40"
                              referrerPolicy="no-referrer"
                              id={`channel-avatar-${room.id}`}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-xs font-bold text-white shadow-md shrink-0 uppercase" id={`channel-avatar-${room.id}`}>
                              {room.name.slice(0, 2)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-semibold truncate block text-slate-200">{room.name}</span>
                            {isSomeoneTyping ? (
                              <span className="text-[10px] text-emerald-400 truncate block animate-pulse font-semibold flex items-center gap-1">
                                <span className="flex gap-0.5 items-center shrink-0">
                                  <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.8s' }}></span>
                                  <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.8s' }}></span>
                                  <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.8s' }}></span>
                                </span>
                                {roomTypingUsers.join(", ")} {roomTypingUsers.length === 1 ? "is" : "are"} typing...
                              </span>
                            ) : (
                              <span className={`text-[10px] ${theme.accentTextMuted} truncate block flex items-center gap-1`}>
                                {room.privacy === "private" ? "🔒 Private Group" : "🌐 Public Group"}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Direct Messages */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 tracking-wider mb-2 px-2.5">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                  DIRECT CHATS
                </span>
              </div>

              <div className="space-y-0.5">
                {filteredDirectMessages.length === 0 ? (
                  <p className="text-[11px] text-slate-600 italic px-2.5">
                    {searchQuery ? "No matching direct chats" : "No active direct DMs. Use \"+\" below to launch one."}
                  </p>
                ) : (
                  filteredDirectMessages.map((room) => {
                    const active = room.id === activeRoomId;
                    const displayFriend = room.name
                      .replace(currentUsername, "")
                      .replace("&", "")
                      .trim();
                    const roomTypingUsers = typingUsersRecord?.[room.id] || [];
                    const isSomeoneTyping = roomTypingUsers.length > 0;

                    return (
                      <button
                        key={room.id}
                        onClick={() => onSelectRoom(room.id)}
                        className={`w-full px-4 py-3 flex items-center justify-between transition-all text-left cursor-pointer border-r-2 ${
                          active
                            ? `${theme.accentBgMuted} ${theme.accentBorder} ${theme.textMain}`
                            : `hover:bg-white/5 border-transparent text-slate-400 hover:${theme.textMain}`
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-slate-700/80 flex items-center justify-center text-xs font-bold text-slate-300 shadow-sm shrink-0 uppercase border border-slate-600/50" id={`dm-avatar-${room.id}`}>
                            {displayFriend.slice(0, 2)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-semibold truncate block text-slate-200">{displayFriend}</span>
                            {isSomeoneTyping ? (
                              <span className="text-[10px] text-emerald-400 truncate block animate-pulse font-semibold flex items-center gap-1">
                                <span className="flex gap-0.5 items-center shrink-0">
                                  <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.8s' }}></span>
                                  <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.8s' }}></span>
                                  <span className="h-1 w-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.8s' }}></span>
                                </span>
                                typing...
                              </span>
                            ) : (
                              <span className={`text-[10px] ${theme.accentTextMuted} truncate block`}>Direct Message</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Active Session Directory */}
            <div>
              {(() => {
                const sortedUsers = [...activeUsers].sort((a, b) => {
                  if (a.status === b.status) {
                    return a.username.localeCompare(b.username);
                  }
                  return a.status === "online" ? -1 : 1;
                });
                const onlineCount = activeUsers.filter(u => u.status === "online").length;

                return (
                  <>
                    <div className="text-[10px] font-bold text-slate-500 tracking-wider mb-2 px-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 animate-fadeIn">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        USER DIRECTORY
                      </span>
                      <span className="text-[9px] font-mono font-semibold text-slate-500">
                        {onlineCount} / {activeUsers.length} ONLINE
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {sortedUsers.map((user) => {
                        const isOnline = user.status === "online";
                        return (
                          <div
                            key={user.username}
                            className={`flex flex-col p-2 rounded-xl border text-xs transition-all gap-1 ${
                              isOnline
                                ? `bg-black/20 border-slate-800/40 text-slate-300`
                                : `bg-black/10 border-transparent text-slate-500 opacity-55`
                            }`}
                          >
                            <div className="flex items-center justify-between w-full min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-sm shrink-0 leading-none w-5 h-5 rounded-full overflow-hidden flex items-center justify-center ${!isOnline ? "grayscale filter contrast-75" : ""}`}>
                                  {user.avatar && (user.avatar.startsWith("data:image") || user.avatar.startsWith("http")) ? (
                                    <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    user.avatar || "🦊"
                                  )}
                                </span>
                                <span className="truncate max-w-28 font-medium">
                                  {user.username}
                                </span>
                                {user.username === currentUsername && (
                                  <span className={`text-[9px] ${theme.accentText} ${theme.accentBgMuted} border ${theme.accentBorderMuted} px-1 rounded`}>
                                    you
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-705/80 bg-slate-600"}`} />
                                <span className="text-[9px] font-semibold text-slate-500 font-mono">
                                  {isOnline ? "Active" : "Offline"}
                                </span>
                              </div>
                            </div>
                            {user.statusMessage && (
                              <p className="text-[10px] text-slate-400 italic px-7 truncate max-w-full" title={user.statusMessage}>
                                "{user.statusMessage}"
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        )}
      </div>

      {/* Trigger New Conversation button */}
      <div className={`p-3 border-t ${theme.borderColor} bg-black/10`}>
        <button
          onClick={onOpenNewConversation}
          className={`w-full py-2.5 ${theme.accentBg} ${theme.accentHoverBg} ${theme.accentActiveBg} text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-lg ${theme.accentGlow} cursor-pointer`}
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
      </div>

      {/* Cyber Incident / Event log ledger */}
      <div className={`p-3 border-t ${theme.borderColor} mt-auto bg-black/20 text-[10px] font-mono text-slate-500 hidden md:block`}>
        <div className="flex items-center gap-1 mb-1.5 font-bold text-slate-400">
          <BookOpen className={`w-3.5 h-3.5 ${theme.accentText}`} />
          <span>SESSION EVENT LOGS</span>
        </div>
        <div className="h-20 overflow-y-auto space-y-1 pr-1 custom-scrollbar scroll-smooth">
          {securityLogs.slice(-10).map((log, index) => {
            // Clean out "cryptographic", "E2EE", "signature", "AES-GCM", etc. from the logs for complete removal
            const cleanedLog = log
              .replace(/cryptographic/gi, "account")
              .replace(/E2EE/gi, "secure")
              .replace(/Client websocket/gi, "WebSocket")
              .replace(/signature/gi, "profile")
              .replace(/AES-GCM/gi, "message")
              .replace(/sovereign/gi, "personal")
              .replace(/asymmetric/gi, "access")
              .replace(/E2E/gi, "secure")
              .replace(/crashed/gi, "failed")
              .replace(/wrapped specifically with.*RSA public key/gi, "completed");

            return (
              <div key={index} className="leading-tight shrink-0">
                <span className={`${theme.accentText}`}>🔔</span> {cleanedLog}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

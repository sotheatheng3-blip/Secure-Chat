import React, { useState, useRef, useEffect } from "react";
import { Hash, MessageSquare, Users, BookOpen, User, LogOut, Plus, Settings, Search, X, Shield, ShieldCheck, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, Clock, Trash2, ChevronDown, Zap } from "lucide-react";
import { Room, User as TypeUser, CallRecord, UserStatus } from "../types";
import { ThemeId, getTheme } from "../utils/theme";

interface SidebarProps {
  currentUsername: string;
  currentUserAvatar: string;
  currentUserStatus?: UserStatus;
  currentUserCustomStatus?: UserStatus | null;
  onUpdateUserStatus?: (status: "online" | "away" | "busy" | "auto") => void;
  lastActivity?: number;
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
  blockedUsers?: string[];
  onStartPrivateChat?: (friendUsername: string) => void;
}

export const getStatusConfig = (status: UserStatus = "offline") => {
  switch (status) {
    case "online":
      return {
        label: "Online",
        colorClass: "text-emerald-400",
        bgClass: "bg-emerald-400",
        borderClass: "border-emerald-500/40",
        ringClass: "ring-emerald-500/30",
        badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        subtitle: "Active now"
      };
    case "away":
      return {
        label: "Away",
        colorClass: "text-amber-400",
        bgClass: "bg-amber-400",
        borderClass: "border-amber-500/40",
        ringClass: "ring-amber-500/30",
        badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        subtitle: "Idle / Stepped away"
      };
    case "busy":
      return {
        label: "Busy",
        colorClass: "text-rose-400",
        bgClass: "bg-rose-500",
        borderClass: "border-rose-500/40",
        ringClass: "ring-rose-500/30",
        badgeBg: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        subtitle: "In a call / DND"
      };
    case "offline":
    default:
      return {
        label: "Offline",
        colorClass: "text-slate-400",
        bgClass: "bg-slate-500",
        borderClass: "border-slate-600/40",
        ringClass: "ring-slate-600/20",
        badgeBg: "bg-slate-800/40 text-slate-400 border-slate-700/30",
        subtitle: "Offline"
      };
  }
};

export const formatRelativeActivity = (lastActivity?: number, status: UserStatus = "offline") => {
  if (status === "busy") return "In a call / Busy";
  if (status === "offline") return "Offline";
  if (!lastActivity) return status === "online" ? "Active now" : "Away";
  
  const diffSec = Math.floor((Date.now() - lastActivity) / 1000);
  if (diffSec < 60) return status === "online" ? "Active now" : "Away (< 1m)";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${status === "online" ? "Active" : "Away"} (${diffMin}m ago)`;
  const diffHour = Math.floor(diffMin / 60);
  return `${status === "online" ? "Active" : "Away"} (${diffHour}h ago)`;
};

export const StatusDot = ({ 
  status = "offline", 
  size = "sm", 
  ping = true 
}: { 
  status?: UserStatus; 
  size?: "xs" | "sm" | "md"; 
  ping?: boolean 
}) => {
  const config = getStatusConfig(status);
  const sizeClasses = {
    xs: "w-2 h-2",
    sm: "w-2.5 h-2.5",
    md: "w-3.5 h-3.5"
  };
  const dotSize = sizeClasses[size] || sizeClasses.sm;

  return (
    <span className="relative flex items-center justify-center shrink-0">
      {status === "online" && ping && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.bgClass} opacity-40`} />
      )}
      <span className={`${dotSize} rounded-full ${config.bgClass} ring-2 ring-slate-900 shadow-sm flex items-center justify-center`}>
        {status === "away" && (
          <span className="w-1 h-1 bg-slate-900 rounded-full" />
        )}
        {status === "busy" && (
          <span className="w-1.5 h-0.5 bg-slate-900 rounded-full" />
        )}
      </span>
    </span>
  );
};

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
  currentUserStatus = "online",
  currentUserCustomStatus = null,
  onUpdateUserStatus,
  lastActivity,
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
  blockedUsers = [],
  onStartPrivateChat,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [localActiveTab, setLocalActiveTab] = useState<"chats" | "calls">("chats");
  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : localActiveTab;
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    };
    if (showStatusMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showStatusMenu]);

  const setActiveTab = (tab: "chats" | "calls") => {
    setLocalActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const theme = getTheme(activeThemeId);
  const query = searchQuery.trim().toLowerCase();
  const isSearchActive = query.length > 0;

  // Split groups vs DMs
  const groupChannels = rooms.filter((r) => r.isGroup);
  const directMessages = rooms.filter((r) => {
    if (r.isGroup) return false;
    const counterpart = r.name.replace(currentUsername, "").replace("&", "").trim();
    if (blockedUsers.some((b) => b.toLowerCase() === counterpart.toLowerCase())) return false;
    return true;
  });

  // Filter group channels by name
  const filteredGroupChannels = groupChannels.filter((room) =>
    room.name.toLowerCase().includes(query)
  );

  // Filter direct messages by channel name or contact/counterpart name
  const filteredDirectMessages = directMessages.filter((room) => {
    const displayFriend = room.name
      .replace(currentUsername, "")
      .replace("&", "")
      .trim();
    return (
      room.name.toLowerCase().includes(query) ||
      displayFriend.toLowerCase().includes(query)
    );
  });

  // Filter active contacts/users by username or status message
  const filteredContacts = activeUsers.filter((user) => {
    if (!isSearchActive) return true;
    const nameMatch = user.username.toLowerCase().includes(query);
    const msgMatch = user.statusMessage ? user.statusMessage.toLowerCase().includes(query) : false;
    return nameMatch || msgMatch;
  });

  const sortedFilteredContacts = [...filteredContacts].sort((a, b) => {
    const statusWeight: Record<UserStatus, number> = { online: 0, away: 1, busy: 2, offline: 3 };
    const weightA = statusWeight[a.status as UserStatus] ?? 3;
    const weightB = statusWeight[b.status as UserStatus] ?? 3;
    if (weightA !== weightB) {
      return weightA - weightB;
    }
    return a.username.localeCompare(b.username);
  });

  // Filter call history
  const filteredCallHistory = callHistory.filter((item) => {
    if (!isSearchActive) return true;
    return (item.roomName || "").toLowerCase().includes(query);
  });

  const totalMatchingChats = filteredGroupChannels.length + filteredDirectMessages.length;
  const noMatchesFound = isSearchActive && totalMatchingChats === 0 && filteredContacts.length === 0;

  const handleContactClick = (targetUsername: string) => {
    if (targetUsername === currentUsername) {
      onEditProfile();
      return;
    }
    // Switch to existing DM channel or initiate new direct chat
    const existingDm = directMessages.find((room) => {
      const counterpart = room.name
        .replace(currentUsername, "")
        .replace("&", "")
        .trim();
      return counterpart.toLowerCase() === targetUsername.toLowerCase();
    });

    if (existingDm) {
      onSelectRoom(existingDm.id);
    } else if (onStartPrivateChat) {
      onStartPrivateChat(targetUsername);
    }
  };

  const currentStatusConfig = getStatusConfig(currentUserStatus);

  return (
    <div className={`w-full md:w-80 border-r ${theme.borderColor} ${theme.bgSidebar} flex flex-col h-full shrink-0 select-none backdrop-blur-md`}>
      {/* Top Banner (User Info with Real-time Status Indicator) */}
      <div className={`p-4 border-b ${theme.borderColor} bg-black/15`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* User Avatar with Real-time Status Badge */}
            <div className="relative shrink-0">
              <div 
                onClick={onEditProfile} 
                className={`w-10 h-10 rounded-full overflow-hidden ${theme.accentBgMuted} border-2 ${theme.accentBorderMuted} flex items-center justify-center text-lg shadow-inner cursor-pointer hover:scale-105 transition-transform`}
                title="Edit Profile & Account Settings"
              >
                {currentUserAvatar && (currentUserAvatar.startsWith("data:image") || currentUserAvatar.startsWith("http")) ? (
                  <img src={currentUserAvatar} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  currentUserAvatar || "🦊"
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStatusMenu((prev) => !prev);
                }}
                className="absolute -bottom-0.5 -right-0.5 cursor-pointer hover:scale-125 transition-transform p-0.5 rounded-full bg-slate-900 shadow-md focus:outline-none"
                title={`Status: ${currentUserStatus} (${formatRelativeActivity(lastActivity, currentUserStatus)}). Click to change.`}
                aria-label="Change status"
              >
                <StatusDot status={currentUserStatus} size="sm" ping={currentUserStatus === "online"} />
              </button>
            </div>

            <div className="min-w-0 flex-1 relative">
              <p 
                className={`text-sm font-semibold ${theme.textMain} truncate cursor-pointer hover:${theme.accentText} transition-colors`} 
                onClick={onEditProfile} 
                title={currentUsername}
              >
                {currentUsername}
              </p>

              {/* Status Indicator pill with quick selector dropdown */}
              <div className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setShowStatusMenu((prev) => !prev)}
                  className="flex items-center gap-1.5 mt-0.5 px-1.5 py-0.5 -ml-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer group text-left"
                  title="Click to toggle status (Online, Away, Busy, Auto)"
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${currentStatusConfig.bgClass} ${currentUserStatus === "online" ? "animate-pulse" : ""}`} />
                    <span className={`text-[10px] font-semibold ${currentStatusConfig.colorClass} capitalize`}>
                      {currentUserStatus}
                    </span>
                  </span>
                  {currentUserCustomStatus && (
                    <span className="text-[8px] font-mono text-slate-400 bg-white/5 border border-white/10 px-1 rounded">
                      fixed
                    </span>
                  )}
                  <ChevronDown className="w-2.5 h-2.5 text-slate-500 group-hover:text-slate-300 transition-transform" />
                </button>

                {/* Quick Status Dropdown Menu */}
                {showStatusMenu && (
                  <div
                    ref={statusMenuRef}
                    className="absolute left-0 top-full mt-1.5 w-52 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-1.5 shadow-2xl z-50 animate-fadeIn text-xs"
                  >
                    <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 mb-1 flex items-center justify-between">
                      <span>Live Status</span>
                      <span className="text-[9px] font-mono text-emerald-400 lowercase">websocket</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateUserStatus?.("online");
                        setShowStatusMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer text-left ${
                        currentUserStatus === "online" && currentUserCustomStatus === "online"
                          ? "bg-emerald-500/20 text-emerald-300 font-semibold"
                          : "hover:bg-white/5 text-slate-200"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
                        <span>Online</span>
                      </span>
                      <span className="text-[9px] text-slate-500">Active</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateUserStatus?.("away");
                        setShowStatusMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer text-left ${
                        currentUserStatus === "away" && currentUserCustomStatus === "away"
                          ? "bg-amber-500/20 text-amber-300 font-semibold"
                          : "hover:bg-white/5 text-slate-200"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/30" />
                        <span>Away</span>
                      </span>
                      <span className="text-[9px] text-slate-500">Idle / stepped away</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateUserStatus?.("busy");
                        setShowStatusMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer text-left ${
                        currentUserStatus === "busy" && currentUserCustomStatus === "busy"
                          ? "bg-rose-500/20 text-rose-300 font-semibold"
                          : "hover:bg-white/5 text-slate-200"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-500/30" />
                        <span>Busy</span>
                      </span>
                      <span className="text-[9px] text-slate-500">Do not disturb</span>
                    </button>

                    <div className="border-t border-slate-800/80 my-1" />

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateUserStatus?.("auto");
                        setShowStatusMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer text-left ${
                        !currentUserCustomStatus
                          ? "bg-indigo-500/20 text-indigo-300 font-semibold"
                          : "hover:bg-white/5 text-slate-300"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-indigo-400" />
                        <span>Auto Activity</span>
                      </span>
                      <span className="text-[9px] text-indigo-400 font-mono">Sync</span>
                    </button>
                  </div>
                )}
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

        {/* Search Active Chats & Contacts Input */}
        <div className="mt-3 relative">
          <label htmlFor="sidebar-search-input" className="sr-only">
            Filter active chats and contacts by name
          </label>
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            id="sidebar-search-input"
            type="text"
            placeholder="Search active chats & contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchQuery("");
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Filter active chats and contacts by name"
            className={`w-full ${theme.bgInput} border ${theme.borderColor} rounded-xl pl-8.5 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:${theme.accentBorder} focus:ring-1 focus:ring-${theme.accentName}-500 transition-all`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 hover:bg-slate-800 p-0.5 rounded text-slate-500 hover:text-slate-300 transition-colors cursor-pointer flex items-center justify-center"
              title="Clear search filter (Esc)"
              aria-label="Clear search filter"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Live Filter Indicator when searching */}
        {isSearchActive && (
          <div className="flex items-center justify-between mt-2.5 px-2 py-1 rounded-lg bg-black/25 border border-slate-800/40 text-[10px] text-slate-400">
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
              <span className="truncate">
                Filter: <span className="font-semibold text-slate-200">"{searchQuery.trim()}"</span>
              </span>
            </span>
            <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-1">
              {totalMatchingChats} {totalMatchingChats === 1 ? "chat" : "chats"} • {filteredContacts.length} {filteredContacts.length === 1 ? "contact" : "contacts"}
            </span>
          </div>
        )}

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
            ) : filteredCallHistory.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-2xl bg-black/10 border border-slate-800/20">
                <Search className="w-8 h-8 text-slate-600 mx-auto mb-2.5" />
                <p className="text-xs font-bold text-slate-400">No Matching Calls</p>
                <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] mx-auto leading-relaxed">
                  No calls match "{searchQuery.trim()}".
                </p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                >
                  Clear Filter
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                {filteredCallHistory.map((item) => {
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
        ) : noMatchesFound ? (
          <div className="text-center py-10 px-4 rounded-2xl bg-black/15 border border-slate-800/40 my-2">
            <Search className="w-7 h-7 text-slate-600 mx-auto mb-2.5" />
            <p className="text-xs font-bold text-slate-300">No chats or contacts found</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[210px] mx-auto leading-relaxed">
              No active rooms or contacts match "{searchQuery.trim()}".
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="mt-3.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
            >
              Clear Search Filter
            </button>
          </div>
        ) : (
          <>
            {/* Friends Launcher Tab */}
            {!isSearchActive && (
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
            )}

            {/* Simple Group Channels */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 tracking-wider mb-2 px-2.5">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  CHANNELS {isSearchActive && <span className="text-[9px] font-mono text-slate-400">({filteredGroupChannels.length})</span>}
                </span>
              </div>

              <div className="space-y-0.5">
                {filteredGroupChannels.length === 0 ? (
                  <p className="text-[11px] text-slate-600 italic px-2.5">
                    {isSearchActive ? "No matching channels" : "No group channels"}
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
                  DIRECT CHATS {isSearchActive && <span className="text-[9px] font-mono text-slate-400">({filteredDirectMessages.length})</span>}
                </span>
              </div>

              <div className="space-y-0.5">
                {filteredDirectMessages.length === 0 ? (
                  <p className="text-[11px] text-slate-600 italic px-2.5">
                    {isSearchActive ? "No matching direct chats" : "No active direct DMs. Use \"+\" below to launch one."}
                  </p>
                ) : (
                  filteredDirectMessages.map((room) => {
                    const active = room.id === activeRoomId;
                    const displayFriend = room.name
                      .replace(currentUsername, "")
                      .replace("&", "")
                      .trim();
                    const friendUser = activeUsers.find(
                      (u) => u.username.toLowerCase() === displayFriend.toLowerCase()
                    );
                    const friendStatus: UserStatus = (friendUser?.status as UserStatus) || "offline";
                    const friendAvatar = friendUser?.avatar;
                    const friendLastActivity = friendUser?.lastActivity;
                    const friendStatusConfig = getStatusConfig(friendStatus);
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
                          {/* Avatar with real-time status indicator */}
                          <div className="relative shrink-0" id={`dm-avatar-${room.id}`}>
                            <div className="w-10 h-10 rounded-full bg-slate-700/80 flex items-center justify-center text-xs font-bold text-slate-200 shadow-sm shrink-0 uppercase border border-slate-600/50 overflow-hidden">
                              {friendAvatar && (friendAvatar.startsWith("data:image") || friendAvatar.startsWith("http")) ? (
                                <img src={friendAvatar} alt={displayFriend} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                friendAvatar || displayFriend.slice(0, 2)
                              )}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full bg-slate-900 shadow-md">
                              <StatusDot status={friendStatus} size="sm" ping={friendStatus === "online"} />
                            </div>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-semibold truncate block text-slate-200">{displayFriend}</span>
                              <span className={`text-[9px] font-mono shrink-0 font-medium ${friendStatusConfig.colorClass}`}>
                                {friendStatusConfig.label}
                              </span>
                            </div>
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
                              <span className="text-[10px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${friendStatusConfig.bgClass} shrink-0`} />
                                <span className={`truncate ${friendStatusConfig.colorClass}`}>
                                  {formatRelativeActivity(friendLastActivity, friendStatus)}
                                </span>
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

            {/* Active Session Directory / Contacts */}
            <div>
              {(() => {
                const activeCount = activeUsers.filter(u => u.status === "online" || u.status === "away" || u.status === "busy").length;

                return (
                  <>
                    <div className="text-[10px] font-bold text-slate-500 tracking-wider mb-2 px-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 animate-fadeIn">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {isSearchActive ? "CONTACTS" : "USER DIRECTORY"}
                        {isSearchActive && (
                          <span className="text-[9px] font-mono text-slate-400">
                            ({filteredContacts.length})
                          </span>
                        )}
                      </span>
                      <span className="text-[9px] font-mono font-semibold text-slate-500">
                        {activeCount} / {activeUsers.length} ACTIVE
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {sortedFilteredContacts.length === 0 ? (
                        <p className="text-[11px] text-slate-600 italic px-2 py-1">
                          {isSearchActive ? "No matching contacts" : "No contacts available"}
                        </p>
                      ) : (
                        sortedFilteredContacts.map((user) => {
                          const userStatus: UserStatus = (user.status as UserStatus) || "offline";
                          const isSelf = user.username === currentUsername;
                          const statusConfig = getStatusConfig(userStatus);
                          return (
                            <div
                              key={user.username}
                              onClick={() => handleContactClick(user.username)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleContactClick(user.username);
                                }
                              }}
                              className={`group flex flex-col p-2.5 rounded-xl border text-xs transition-all gap-1 cursor-pointer select-none ${
                                userStatus !== "offline"
                                  ? `bg-black/20 border-slate-800/50 hover:${theme.accentBorderMuted} hover:bg-white/5 text-slate-300`
                                  : `bg-black/10 border-transparent hover:border-slate-800/40 hover:bg-white/5 text-slate-400 opacity-75 hover:opacity-100`
                              }`}
                              title={isSelf ? "Your profile (Click to edit)" : `Click to message @${user.username} • ${statusConfig.label}`}
                            >
                              <div className="flex items-center justify-between w-full min-w-0">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {/* Avatar with real-time status badge */}
                                  <div className="relative shrink-0">
                                    <span className={`text-sm leading-none w-7 h-7 rounded-full overflow-hidden flex items-center justify-center border border-slate-700/60 ${userStatus === "offline" ? "grayscale filter contrast-75" : ""}`}>
                                      {user.avatar && (user.avatar.startsWith("data:image") || user.avatar.startsWith("http")) ? (
                                        <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      ) : (
                                        user.avatar || "🦊"
                                      )}
                                    </span>
                                    <span className="absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full bg-slate-900 shadow-sm">
                                      <StatusDot status={userStatus} size="xs" ping={userStatus === "online"} />
                                    </span>
                                  </div>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate max-w-28 font-medium text-slate-200 group-hover:text-white transition-colors">
                                        {user.username}
                                      </span>
                                      {isSelf ? (
                                        <span className={`text-[9px] ${theme.accentText} ${theme.accentBgMuted} border ${theme.accentBorderMuted} px-1.5 py-0.2 rounded font-mono`}>
                                          you
                                        </span>
                                      ) : (
                                        <MessageSquare className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 shrink-0" />
                                      )}
                                    </div>
                                    <span className="text-[9px] text-slate-500 truncate block">
                                      {formatRelativeActivity(user.lastActivity, userStatus)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md border ${statusConfig.badgeBg} font-mono flex items-center gap-1`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.bgClass}`} />
                                    {statusConfig.label}
                                  </span>
                                </div>
                              </div>
                              {user.statusMessage && (
                                <p className="text-[10px] text-slate-400 italic px-9 truncate max-w-full" title={user.statusMessage}>
                                  "{user.statusMessage}"
                                </p>
                              )}
                            </div>
                          );
                        })
                      )}
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

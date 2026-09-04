import React, { useState, useEffect } from "react";
import { X, Search, UserPlus, Check, Ban, MessageSquare, Loader, Users, Inbox, Sparkles, UserCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import { Friend, FriendRequest } from "../types";
import { ThemeId, getTheme } from "../utils/theme";
import { apiRequest } from "../utils/api";

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
  activeThemeId: ThemeId;
  onStartPrivateChat: (friendUsername: string) => Promise<void>;
  // Socket signal trigger to sync up parent state or fetch on demand
  onRefreshRooms?: () => void;
  blockedUsers?: string[];
  onBlockedUsersChange?: (blocked: string[]) => void;
}

export default function FriendsModal({
  isOpen,
  onClose,
  currentUsername,
  activeThemeId,
  onStartPrivateChat,
  onRefreshRooms,
  blockedUsers = [],
  onBlockedUsersChange,
}: FriendsModalProps) {
  const [tab, setTab] = useState<"friends" | "requests" | "add" | "blocked">("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [localBlocked, setLocalBlocked] = useState<string[]>(blockedUsers);
  const [searchQuery, setSearchQuery] = useState("");
  const [friendsSearchQuery, setFriendsSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const theme = getTheme(activeThemeId);

  // Sync external blocked users
  useEffect(() => {
    setLocalBlocked(blockedUsers);
  }, [blockedUsers]);

  // Fetch status of friends, requests and blocked list
  const fetchFriendsStatus = async () => {
    try {
      const res = await apiRequest(`/api/friends/status?username=${encodeURIComponent(currentUsername)}`);
      if (res.ok && res.data?.success) {
        setFriends(res.data.friends || []);
        setRequests(res.data.requests || []);
      }

      // Fetch blocked list
      const blockRes = await apiRequest(`/api/friends/blocked-list?username=${encodeURIComponent(currentUsername)}`);
      if (blockRes.ok && blockRes.data?.success && Array.isArray(blockRes.data.blockedUsers)) {
        setLocalBlocked(blockRes.data.blockedUsers);
        if (onBlockedUsersChange) {
          onBlockedUsersChange(blockRes.data.blockedUsers);
        }
      }
    } catch (err) {
      console.error("Failed to load friend status:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFriendsStatus();
      setErrorText(null);
      setSuccessText(null);
    }
  }, [isOpen, tab]);

  // Handle searching registered users
  const handleSearchUsers = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    setErrorText(null);
    try {
      const res = await apiRequest("/api/users/search", {
        method: "POST",
        body: JSON.stringify({ query: searchQuery, currentUsername }),
      });
      if (res.ok && res.data?.success) {
        setSearchResults(res.data.users || []);
      } else {
        setErrorText(res.error || "Search failed.");
      }
    } catch (err) {
      setErrorText("Failed to search. Service offline.");
    } finally {
      setIsSearching(false);
    }
  };

  // Auto search when user is on "add" tab and types
  useEffect(() => {
    if (tab === "add") {
      const delayDebounce = setTimeout(() => {
        handleSearchUsers();
      }, 300);
      return () => clearTimeout(delayDebounce);
    }
  }, [searchQuery, tab]);

  // Handle sending friend request
  const handleSendRequest = async (targetUsername: string) => {
    setActionLoadingId(targetUsername);
    setErrorText(null);
    setSuccessText(null);
    try {
      const res = await apiRequest("/api/friends/request/send", {
        method: "POST",
        body: JSON.stringify({ sender: currentUsername, receiver: targetUsername }),
      });
      if (res.ok && res.data?.success) {
        setSuccessText(`Request successfully sent to @${targetUsername}!`);
        fetchFriendsStatus();
      } else {
        setErrorText(res.error || "Request failed.");
      }
    } catch (err) {
      setErrorText("Failed to dispatch request.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle accepting request
  const handleAcceptRequest = async (reqId: string, senderName: string) => {
    setActionLoadingId(reqId);
    setErrorText(null);
    setSuccessText(null);
    try {
      const res = await apiRequest("/api/friends/request/accept", {
        method: "POST",
        body: JSON.stringify({ requestId: reqId, username: currentUsername }),
      });
      if (res.ok && res.data?.success) {
        setSuccessText(`Successfully established friendship with @${senderName}!`);
        fetchFriendsStatus();
        if (onRefreshRooms) onRefreshRooms();
      } else {
        setErrorText(res.error || "Failed to accept.");
      }
    } catch (err) {
      setErrorText("Acceptance request failed.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle declining requests
  const handleDeclineRequest = async (reqId: string) => {
    setActionLoadingId(reqId);
    setErrorText(null);
    try {
      const res = await apiRequest("/api/friends/request/decline", {
        method: "POST",
        body: JSON.stringify({ requestId: reqId, username: currentUsername }),
      });
      if (res.ok && res.data?.success) {
        setSuccessText("Friend request declined/cancelled.");
        fetchFriendsStatus();
      }
    } catch (err) {
      setErrorText("Decline failed.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Blocking a User
  const handleBlockUser = async (targetUsername: string) => {
    if (!window.confirm(`Are you sure you want to block @${targetUsername}? You will not receive any messages or calls from them.`)) {
      return;
    }
    setActionLoadingId(`block-${targetUsername}`);
    setErrorText(null);
    setSuccessText(null);

    try {
      const res = await apiRequest("/api/friends/block", {
        method: "POST",
        body: JSON.stringify({ username: currentUsername, blockedUsername: targetUsername }),
      });

      const updated = res.ok && Array.isArray(res.data?.blockedUsers)
        ? res.data.blockedUsers
        : Array.from(new Set([...localBlocked, targetUsername]));

      setLocalBlocked(updated);
      localStorage.setItem("secure_chat_blocked_users", JSON.stringify(updated));
      if (onBlockedUsersChange) {
        onBlockedUsersChange(updated);
      }
      setSuccessText(`Blocked @${targetUsername}. Messages and incoming calls from this user are now hidden.`);
    } catch (err) {
      setErrorText("Failed to block user.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Unblocking a User
  const handleUnblockUser = async (targetUsername: string) => {
    setActionLoadingId(`unblock-${targetUsername}`);
    setErrorText(null);
    setSuccessText(null);

    try {
      const res = await apiRequest("/api/friends/unblock", {
        method: "POST",
        body: JSON.stringify({ username: currentUsername, unblockedUsername: targetUsername }),
      });

      const updated = res.ok && Array.isArray(res.data?.blockedUsers)
        ? res.data.blockedUsers
        : localBlocked.filter(b => b.toLowerCase() !== targetUsername.toLowerCase());

      setLocalBlocked(updated);
      localStorage.setItem("secure_chat_blocked_users", JSON.stringify(updated));
      if (onBlockedUsersChange) {
        onBlockedUsersChange(updated);
      }
      setSuccessText(`Unblocked @${targetUsername}.`);
    } catch (err) {
      setErrorText("Failed to unblock user.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleFriendsChat = async (friendUsername: string) => {
    try {
      await onStartPrivateChat(friendUsername);
      onClose();
    } catch (err) {
      setErrorText("Starting conversation channel failed.");
    }
  };

  if (!isOpen) return null;

  const incomingRequests = requests.filter(r => r.status === "pending" && r.receiver.toLowerCase() === currentUsername.toLowerCase());
  const outgoingRequests = requests.filter(r => r.status === "pending" && r.sender.toLowerCase() === currentUsername.toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
      <div className={`w-full max-w-lg ${theme.bgForm} border ${theme.borderColor} rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]`}>
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-white/5 bg-black/20 shrink-0">
          <h2 className="text-lg font-bold font-display text-white flex items-center gap-2">
            <Users className={`w-5 h-5 ${theme.accentText}`} />
            Friends Workspace
          </h2>
          <button
            onClick={onClose}
            className={`p-1.5 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-white/5 bg-black/10 p-1 shrink-0">
          <button
            onClick={() => setTab("friends")}
            className={`flex-1 py-3 text-xs font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              tab === "friends"
                ? `${theme.accentBgMuted} ${theme.accentText} border ${theme.accentBorderMuted}`
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setTab("requests")}
            className={`flex-1 py-3 text-xs font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer relative ${
              tab === "requests"
                ? `${theme.accentBgMuted} ${theme.accentText} border ${theme.accentBorderMuted}`
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            Requests
            {incomingRequests.length > 0 && (
              <span className="absolute top-2 right-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("add")}
            className={`flex-1 py-3 text-xs font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              tab === "add"
                ? `${theme.accentBgMuted} ${theme.accentText} border ${theme.accentBorderMuted}`
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add
          </button>
          <button
            onClick={() => setTab("blocked")}
            className={`flex-1 py-3 text-xs font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              tab === "blocked"
                ? "bg-red-500/15 text-red-400 border border-red-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            Blocked ({localBlocked.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-[300px]">
          {/* Alerts */}
          {errorText && (
            <div className="p-3 mb-4 rounded-xl text-xs bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
              {errorText}
            </div>
          )}
          {successText && (
            <div className="p-3 mb-4 rounded-xl text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
              {successText}
            </div>
          )}

          {/* TAB 1: FRIENDS LIST */}
          {tab === "friends" && (
            <div className="space-y-3">
              {friends.length > 0 && (
                <div className="relative mb-3">
                  <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search friends in real-time..."
                    value={friendsSearchQuery}
                    onChange={(e) => setFriendsSearchQuery(e.target.value)}
                    className={`w-full ${theme.bgInput} border ${theme.borderColor} rounded-2xl pl-10 pr-10 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:${theme.accentBorder} focus:ring-1 focus:ring-indigo-500 transition-all`}
                  />
                  {friendsSearchQuery && (
                    <button
                      onClick={() => setFriendsSearchQuery("")}
                      className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {friends.length === 0 ? (
                <div className="text-center py-12 select-none">
                  <div className={`w-14 h-14 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4 border ${theme.borderColor}`}>
                    <Users className="w-6 h-6 text-slate-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-300">No friends yet</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Start looking for colleagues inside the "Add Friend" tab to invite them to private encrypted conversations!
                  </p>
                </div>
              ) : friends.filter(friend => friend.username.toLowerCase().includes(friendsSearchQuery.toLowerCase())).length === 0 ? (
                <div className="text-center py-12 select-none border border-dashed border-white/5 rounded-2xl bg-black/5">
                  <p className="text-sm font-semibold text-slate-300">No matching friends</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Try checking your spelling or looking for another name.
                  </p>
                </div>
              ) : (
                friends
                  .filter(friend => friend.username.toLowerCase().includes(friendsSearchQuery.toLowerCase()))
                  .map((friend) => {
                    const isBlocked = localBlocked.some(b => b.toLowerCase() === friend.username.toLowerCase());
                    return (
                      <div
                        key={friend.username}
                        className={`flex items-center justify-between p-3.5 rounded-2xl bg-black/15 border ${theme.borderColor} hover:bg-black/25 transition-all`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 flex items-center justify-center text-base border border-slate-700/50">
                              {friend.avatar && (friend.avatar.startsWith("data:image") || friend.avatar.startsWith("http")) ? (
                                <img src={friend.avatar} alt={friend.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                friend.avatar || "🦊"
                              )}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${theme.bgForm} ${friend.status === "online" ? "bg-emerald-400" : "bg-slate-500"}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-slate-100 truncate">@{friend.username}</p>
                              {isBlocked && (
                                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.2 rounded font-mono">Blocked</span>
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-slate-500 capitalize leading-none">{friend.status}</span>
                              {friend.statusMessage && (
                                <p className="text-[11px] text-slate-400 italic truncate max-w-[200px] mt-0.5" title={friend.statusMessage}>
                                  "{friend.statusMessage}"
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleFriendsChat(friend.username)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 text-xs font-semibold cursor-pointer border border-indigo-500/20 active:scale-95 transition-transform`}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Chat
                          </button>

                          {isBlocked ? (
                            <button
                              onClick={() => handleUnblockUser(friend.username)}
                              disabled={actionLoadingId !== null}
                              className="p-1.5 text-xs text-red-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg border border-red-500/20 hover:border-emerald-500/20 transition-all cursor-pointer"
                              title="Unblock user"
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBlockUser(friend.username)}
                              disabled={actionLoadingId !== null}
                              className="p-1.5 text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                              title="Block user (hide messages & calls)"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          )}

          {/* TAB 2: REQUESTS LIST */}
          {tab === "requests" && (
            <div className="space-y-6">
              {/* Incoming */}
              <div>
                <h4 className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-3 px-1">
                  Incoming Requests ({incomingRequests.length})
                </h4>
                {incomingRequests.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-4 text-center border border-dashed border-white/5 rounded-2xl bg-black/5">
                    No pending incoming requests
                  </p>
                ) : (
                  <div className="space-y-2">
                    {incomingRequests.map((req) => (
                      <div
                        key={req.id}
                        className={`flex items-center justify-between p-3 rounded-xl bg-black/15 border ${theme.borderColor}`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-100">@{req.sender}</p>
                          <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                            Received {new Date(req.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleAcceptRequest(req.id, req.sender)}
                            disabled={actionLoadingId !== null}
                            className={`p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-all cursor-pointer`}
                            title="Accept request"
                          >
                            {actionLoadingId === req.id ? (
                              <Loader className="w-4 h-4 animate-spin text-emerald-400" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeclineRequest(req.id)}
                            disabled={actionLoadingId !== null}
                            className={`p-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition-all cursor-pointer`}
                            title="Decline request"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outgoing */}
              <div>
                <h4 className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-3 px-1">
                  Outgoing Requests ({outgoingRequests.length})
                </h4>
                {outgoingRequests.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-4 text-center border border-dashed border-white/5 rounded-2xl bg-black/5">
                    No pending outgoing requests
                  </p>
                ) : (
                  <div className="space-y-2">
                    {outgoingRequests.map((req) => (
                      <div
                        key={req.id}
                        className={`flex items-center justify-between p-3 rounded-xl bg-black/10 border ${theme.borderColor}`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-100">@{req.receiver}</p>
                          <span className={`inline-block text-[9px] px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-md font-medium mt-1 uppercase`}>
                            Pending
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeclineRequest(req.id)}
                          className={`p-1.5 bg-slate-800 text-slate-400 hover:text-slate-200 border ${theme.borderColor} rounded-lg hover:bg-slate-700 transition-all cursor-pointer`}
                          title="Cancel request"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ADD FRIEND SEARCH */}
          {tab === "add" && (
            <div className="space-y-4">
              <form onSubmit={handleSearchUsers} className="relative">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Type username or key identifier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full ${theme.bgInput} border ${theme.borderColor} rounded-2xl pl-10 pr-24 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:${theme.accentBorder} focus:ring-1 focus:ring-indigo-500 transition-all`}
                />
                <button
                  type="submit"
                  className={`absolute right-1.5 top-1.5 px-3 py-1.5 rounded-xl ${theme.accentBg} hover:${theme.accentHoverBg} text-white text-xs font-semibold transition-all cursor-pointer`}
                >
                  Search
                </button>
              </form>

              {/* Results */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 px-1">
                  Directory Results
                </h4>

                {isSearching ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Loader className={`w-6 h-6 animate-spin ${theme.accentText}`} />
                    <span className="text-xs text-slate-500">Querying directory...</span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-8 select-none border border-dashed border-white/5 rounded-2xl bg-black/5">
                    <p className="text-xs text-slate-400">
                      {searchQuery ? "No workspace users found with that name" : "Showing list of other active users..."}
                    </p>
                  </div>
                ) : (
                  searchResults.map((user) => {
                    const isFriend = friends.some(f => f.username.toLowerCase() === user.username.toLowerCase());
                    const incomingReq = incomingRequests.find(r => r.sender.toLowerCase() === user.username.toLowerCase());
                    const outgoingReq = outgoingRequests.find(r => r.receiver.toLowerCase() === user.username.toLowerCase());
                    const isBlocked = localBlocked.some(b => b.toLowerCase() === user.username.toLowerCase());

                    return (
                      <div
                        key={user.username}
                        className={`flex items-center justify-between p-3 rounded-2xl bg-black/15 border ${theme.borderColor}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 flex items-center justify-center text-sm border border-slate-700/40">
                            {user.avatar && (user.avatar.startsWith("data:image") || user.avatar.startsWith("http")) ? (
                              <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              user.avatar || "🦊"
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-100">@{user.username}</p>
                            <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="shrink-0 flex items-center gap-1.5">
                          {isFriend ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                              <UserCheck className="w-3.5 h-3.5" />
                              Friends
                            </span>
                          ) : incomingReq ? (
                            <button
                              onClick={() => handleAcceptRequest(incomingReq.id, incomingReq.sender)}
                              disabled={actionLoadingId !== null}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Accept
                            </button>
                          ) : outgoingReq ? (
                            <span className="inline-block text-[11px] font-medium text-yellow-500 px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-xl uppercase">
                              Pending
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSendRequest(user.username)}
                              disabled={actionLoadingId !== null}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${theme.accentBg} hover:${theme.accentHoverBg} text-white hover:text-white text-xs font-semibold cursor-pointer border ${theme.accentBorder} active:scale-95 transition-transform`}
                            >
                              {actionLoadingId === user.username ? (
                                <Loader className="w-3 h-3 animate-spin text-white" />
                              ) : (
                                <UserPlus className="w-3.5 h-3.5" />
                              )}
                              Add
                            </button>
                          )}

                          {isBlocked ? (
                            <button
                              onClick={() => handleUnblockUser(user.username)}
                              className="p-1.5 text-xs text-red-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg border border-red-500/20 transition-all cursor-pointer"
                              title="Unblock user"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBlockUser(user.username)}
                              className="p-1.5 text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                              title="Block user"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 4: BLOCKED USERS */}
          {tab === "blocked" && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-xs text-red-300 leading-relaxed">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>
                  Blocked users cannot contact you. All incoming messages, direct chat threads, and incoming audio/video calls from blocked users will be hidden.
                </span>
              </div>

              {localBlocked.length === 0 ? (
                <div className="text-center py-12 select-none border border-dashed border-white/5 rounded-2xl bg-black/5">
                  <div className="w-12 h-12 rounded-full bg-slate-800/40 flex items-center justify-center mx-auto mb-3 text-slate-500">
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-300">No Blocked Users</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    You haven't blocked anyone yet. You can block any user from your friends list or directory search.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {localBlocked.map((blockedName) => (
                    <div
                      key={blockedName}
                      className={`flex items-center justify-between p-3.5 rounded-2xl bg-black/15 border ${theme.borderColor}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center text-sm text-red-400 font-bold">
                          {blockedName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-200">@{blockedName}</p>
                          <span className="text-[10px] text-red-400/80">Messages & calls hidden</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleUnblockUser(blockedName)}
                        disabled={actionLoadingId === `unblock-${blockedName}`}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        {actionLoadingId === `unblock-${blockedName}` ? (
                          <Loader className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        Unblock
                      </button>
                    </div>
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

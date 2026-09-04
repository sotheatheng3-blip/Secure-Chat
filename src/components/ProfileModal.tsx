import React, { useState, useEffect } from "react";
import { 
  X, User, Mail, Smile, Settings, Key, Lock, Palette, 
  Accessibility, Eye, VolumeX, ShieldAlert, Monitor, Check, 
  Terminal, UserCheck, EyeOff, Shield, RefreshCw, Smartphone, 
  HelpCircle, Sparkles, MessageSquare, LayoutGrid, ArrowLeft,
  Bell, Volume2, Cloud, FileSpreadsheet, HardDrive, ExternalLink,
  Copy, CheckCircle2, FolderOpen, Loader, Upload
} from "lucide-react";
import { ThemeId, THEME_PRESETS } from "../utils/theme";
import { compressAvatarFile, normalizeMediaUrl } from "../utils/imageUtils";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  username: string;
  avatar: string;
  statusMessage: string;
  activeThemeId: ThemeId;
  onSelectTheme: (themeId: ThemeId) => void;
  onUpdate: (
    newUsername: string,
    newAvatar: string,
    oldPassword?: string,
    newPassword?: string,
    statusMessage?: string
  ) => Promise<void>;
  onSettingsChange?: () => void;
}

const AVATAR_OPTIONS = [
  "🦊", "🦁", "🐯", "🐼", "🐨", "🦄", "🦖", "🐙", "🐱", "🐶", 
  "🐒", "🦉", "🐧", "🐷", "🐸", "🐹", "🦖", "🦄", "🐝", "🐥"
];

const KEYBOARD_SHORTCUTS = [
  { keys: "Ctrl + K", desc: "Open global command workspace search" },
  { keys: "Esc", desc: "Close any modal, side dialog, or dropdown" },
  { keys: "Ctrl + F", desc: "Search through the directory of active conversation channels" },
  { keys: "Tab", desc: "Easily navigate between focusable chat elements & forms" },
  { keys: "Space / Enter", desc: "Activate buttons, select items, and commit modals" }
];

export default function ProfileModal({
  isOpen,
  onClose,
  email,
  username,
  avatar,
  statusMessage,
  activeThemeId,
  onSelectTheme,
  onUpdate,
  onSettingsChange,
}: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<"menu" | "profile" | "theme" | "accessibility" | "privacy" | "notifications" | "cloud">("menu");

  // Account states
  const [newUsername, setNewUsername] = useState(username);
  const [newAvatar, setNewAvatar] = useState(avatar);
  const [newStatusMessage, setNewStatusMessage] = useState(statusMessage || "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);

  // Google Apps Script Cloud Sync States
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState("");
  const [cloudStatus, setCloudStatus] = useState<{
    loading: boolean;
    connected: boolean;
    configured: boolean;
    spreadsheetUrl?: string;
    spreadsheetId?: string;
    driveFolderUrl?: string;
    driveFolderId?: string;
    message?: string;
    error?: string;
  }>({
    loading: false,
    connected: false,
    configured: false
  });
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [cloudFeedback, setCloudFeedback] = useState<string | null>(null);

  // Accessibility States (Loaded from LocalStorage)
  const [fontSize, setFontSizeState] = useState<"small" | "normal" | "large" | "xlarge">("normal");
  const [dyslexicFont, setDyslexicFont] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [increasedSpacing, setIncreasedSpacing] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenFlashForMentions, setScreenFlashForMentions] = useState(true);

  // Privacy & Security States
  const [sharePresence, setSharePresence] = useState(true);
  const [shareTyping, setShareTyping] = useState(true);
  const [shareReadReceipts, setShareReadReceipts] = useState(true);
  const [strictE2eeOnly, setStrictE2eeOnly] = useState(false);
  const [sessionAutoLock, setSessionAutoLock] = useState("never"); // 'never' | '5m' | '15m' | '30m'

  // Notification States (Loaded from LocalStorage)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundPreset, setSoundPreset] = useState("chime");
  const [soundVolume, setSoundVolume] = useState(0.5);
  const [muteGroupNotifications, setMuteGroupNotifications] = useState(false);

  const audioCtxRef = React.useRef<AudioContext | null>(null);

  // Play test sound notification using synthesizer
  const playTestSound = (preset: string, volume: number) => {
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
  };

  // Load cloud status
  const fetchCloudStatus = async () => {
    try {
      setCloudStatus(prev => ({ ...prev, loading: true }));
      const res = await fetch("/api/appscript/status");
      const data = await res.json();
      setCloudStatus({
        loading: false,
        connected: !!data.connected,
        configured: !!data.configured,
        spreadsheetUrl: data.spreadsheetUrl,
        spreadsheetId: data.spreadsheetId,
        driveFolderUrl: data.driveFolderUrl,
        driveFolderId: data.driveFolderId,
        message: data.message,
        error: data.error
      });
      if (data.url && !appsScriptUrlInput) {
        setAppsScriptUrlInput(data.url);
      }
    } catch (err: any) {
      setCloudStatus({
        loading: false,
        connected: false,
        configured: false,
        error: err.message || "Failed to reach server."
      });
    }
  };

  const handleSaveAppsScriptUrl = async () => {
    if (!appsScriptUrlInput.trim()) return;
    setIsSavingUrl(true);
    setCloudFeedback(null);
    try {
      const res = await fetch("/api/appscript/set-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: appsScriptUrlInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setCloudFeedback("Apps Script URL connected successfully!");
        await fetchCloudStatus();
      } else {
        setCloudFeedback("Failed to connect: " + (data.error || "Unknown error"));
      }
    } catch (err: any) {
      setCloudFeedback("Error connecting: " + err.message);
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handleSyncAllData = async () => {
    setIsSyncingAll(true);
    setCloudFeedback(null);
    try {
      const res = await fetch("/api/appscript/sync-all", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setCloudFeedback(`Synced ${data.syncedAccounts} accounts and ${data.syncedRooms} rooms to Sheet!`);
        await fetchCloudStatus();
      } else {
        setCloudFeedback("Sync failed: " + (data.error || "Check your Apps Script URL"));
      }
    } catch (err: any) {
      setCloudFeedback("Sync error: " + err.message);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleCopyCodeGs = () => {
    const codeGs = `// ==============================================================================
// SECURE CHAT - FULL GOOGLE APPS SCRIPT DATABASE & DRIVE STORAGE ENGINE
// ==============================================================================
// 1. Open Google Sheets (create a new blank spreadsheet or use an existing one)
// 2. Click Extensions > Apps Script
// 3. Delete any default code and paste this entire Code.gs file
// 4. Click 'Deploy' > 'New deployment' > Select type: 'Web app'
// 5. Set 'Execute as: Me' and 'Who has access: Anyone'
// 6. Click 'Deploy', authorize permissions, and copy the Web App URL!
// ==============================================================================

const SPREADSHEET_ID = ""; // Leave blank to auto-use active spreadsheet
const DRIVE_FOLDER_NAME = "SecureChat_Cloud_Drive";

function getOrInitSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0F172A").setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function initSpreadsheetTabs() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  getOrInitSheet(ss, "Accounts", ["Email", "Username", "Avatar", "StatusMessage", "RegisteredAt", "LastSeen", "DataJSON"]);
  getOrInitSheet(ss, "Media_Drive", ["FileID", "FileName", "MimeType", "DriveLink", "Sender", "RoomID", "Timestamp"]);
  getOrInitSheet(ss, "Messages", ["MessageID", "RoomID", "Sender", "Timestamp", "Ciphertext", "IsMedia", "DriveLink", "RawJSON"]);
  getOrInitSheet(ss, "Rooms", ["RoomID", "RoomName", "Description", "CreatedBy", "CreatedAt", "MemberCount", "DataJSON"]);
  getOrInitSheet(ss, "Friends", ["UserEmail", "FriendUsername", "Status", "Timestamp"]);
  return ss;
}

function getOrCreateDriveFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  const folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const ss = initSpreadsheetTabs();
    const folder = getOrCreateDriveFolder();

    if (action === "upload_media") {
      const base64Data = payload.base64.split(",")[1] || payload.base64;
      const decodedBytes = Utilities.base64Decode(base64Data);
      const blob = Utilities.newBlob(decodedBytes, payload.mimeType || "image/png", payload.fileName || "upload.png");
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const fileUrl = file.getUrl();
      const directUrl = "https://lh3.googleusercontent.com/d/" + file.getId();

      const mediaSheet = ss.getSheetByName("Media_Drive");
      mediaSheet.appendRow([file.getId(), payload.fileName, payload.mimeType, directUrl, payload.sender || "anonymous", payload.roomId || "general", new Date().toISOString()]);

      return ContentService.createTextOutput(JSON.stringify({ success: true, fileId: file.getId(), fileUrl: directUrl, driveUrl: fileUrl, fileName: payload.fileName })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "register_user") {
      const accountsSheet = ss.getSheetByName("Accounts");
      const data = accountsSheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).toLowerCase() === String(payload.email).toLowerCase()) { rowIndex = i + 1; break; }
      }
      const row = [payload.email, payload.username, payload.avatar || "🦊", payload.statusMessage || "", payload.registeredAt || new Date().toISOString(), new Date().toISOString(), JSON.stringify(payload)];
      if (rowIndex > 0) accountsSheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      else accountsSheet.appendRow(row);
      return ContentService.createTextOutput(JSON.stringify({ success: true, action: "user_registered" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "save_message") {
      const msgSheet = ss.getSheetByName("Messages");
      const msg = payload.message || {};
      msgSheet.appendRow([msg.id || "msg-" + Date.now(), payload.roomId || "general", msg.sender || "anonymous", new Date(msg.timestamp || Date.now()).toISOString(), String(msg.ciphertext || "").slice(0, 500), msg.isMedia || false, msg.decryptedMediaUrl || "", JSON.stringify(msg)]);
      return ContentService.createTextOutput(JSON.stringify({ success: true, action: "message_saved" })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Action processed" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  const ss = initSpreadsheetTabs();
  const folder = getOrCreateDriveFolder();
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    appName: "SecureChat Apps Script Engine",
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    driveFolderId: folder.getId(),
    driveFolderUrl: folder.getUrl()
  })).setMimeType(ContentService.MimeType.JSON);
}`;

    navigator.clipboard.writeText(codeGs);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  // Diagnostic states
  const [currentTime, setCurrentTime] = useState("");
  const [userAgent, setUserAgent] = useState("");

  // Load configuration options
  useEffect(() => {
    if (typeof window !== "undefined") {
      setFontSizeState((localStorage.getItem("accessibility_fontSize") as any) || "normal");
      setDyslexicFont(localStorage.getItem("accessibility_dyslexicFont") === "true");
      setHighContrast(localStorage.getItem("accessibility_highContrast") === "true");
      setIncreasedSpacing(localStorage.getItem("accessibility_increasedSpacing") === "true");
      setReduceMotion(localStorage.getItem("accessibility_reduceMotion") === "true");
      setScreenFlashForMentions(localStorage.getItem("accessibility_screenFlashForMentions") !== "false");

      setSharePresence(localStorage.getItem("privacy_sharePresence") !== "false");
      setShareTyping(localStorage.getItem("privacy_shareTyping") !== "false");
      setShareReadReceipts(localStorage.getItem("privacy_shareReadReceipts") !== "false");
      setStrictE2eeOnly(localStorage.getItem("privacy_strictE2eeOnly") === "true");
      setSessionAutoLock(localStorage.getItem("privacy_sessionAutoLock") || "never");

      // Load notifications
      setNotificationsEnabled(localStorage.getItem("notifications_enabled") !== "false");
      setSoundEnabled(localStorage.getItem("notifications_sound_enabled") !== "false");
      setSoundPreset(localStorage.getItem("notifications_sound_preset") || "chime");
      setSoundVolume(parseFloat(localStorage.getItem("notifications_sound_volume") || "0.5"));
      setMuteGroupNotifications(localStorage.getItem("notifications_mute_groups") === "true");

      setCurrentTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setUserAgent(navigator.userAgent);
    }
  }, [isOpen]);

  // Handle saving notifications parameters
  const updateNotifications = (key: string, value: any) => {
    localStorage.setItem(key, String(value));
    
    if (key === "notifications_enabled") setNotificationsEnabled(value);
    if (key === "notifications_sound_enabled") setSoundEnabled(value);
    if (key === "notifications_sound_preset") setSoundPreset(value);
    if (key === "notifications_sound_volume") setSoundVolume(value);
    if (key === "notifications_mute_groups") setMuteGroupNotifications(value);

    window.dispatchEvent(new Event("app-settings-updated"));
    if (onSettingsChange) onSettingsChange();
  };

  const requestPermissionDirectly = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const permission = await Notification.requestPermission();
      return permission;
    }
    return "default";
  };

  // Handle saving accessibility parameters
  const updateAccessibility = (key: string, value: any) => {
    localStorage.setItem(key, String(value));
    
    // Also trigger instant body adjustment or callbacks
    if (key === "accessibility_fontSize") setFontSizeState(value);
    if (key === "accessibility_dyslexicFont") setDyslexicFont(value);
    if (key === "accessibility_highContrast") setHighContrast(value);
    if (key === "accessibility_increasedSpacing") setIncreasedSpacing(value);
    if (key === "accessibility_reduceMotion") setReduceMotion(value);
    if (key === "accessibility_screenFlashForMentions") setScreenFlashForMentions(value);

    // Broadcast standard event so App.tsx can adjust root classes on-the-fly
    window.dispatchEvent(new Event("app-settings-updated"));
    if (onSettingsChange) onSettingsChange();
  };

  // Handle saving privacy parameters
  const updatePrivacy = (key: string, value: any) => {
    localStorage.setItem(key, String(value));
    
    if (key === "privacy_sharePresence") setSharePresence(value);
    if (key === "privacy_shareTyping") setShareTyping(value);
    if (key === "privacy_shareReadReceipts") setShareReadReceipts(value);
    if (key === "privacy_strictE2eeOnly") setStrictE2eeOnly(value);
    if (key === "privacy_sessionAutoLock") setSessionAutoLock(value);

    window.dispatchEvent(new Event("app-settings-updated"));
    if (onSettingsChange) onSettingsChange();
  };

  useEffect(() => {
    if (isOpen) {
      setNewUsername(username);
      setNewAvatar(avatar);
      setNewStatusMessage(statusMessage || "");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrorMsg("");
      setSuccess(false);
    }
  }, [isOpen, username, avatar, statusMessage]);

  if (!isOpen) return null;

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccess(false);

    if (!newUsername.trim()) {
      setErrorMsg("Username cannot be empty.");
      return;
    }

    if (newPassword || oldPassword) {
      if (!oldPassword) {
        setErrorMsg("Please enter your current password to process updates.");
        return;
      }
      if (!newPassword) {
        setErrorMsg("Please enter a new password.");
        return;
      }
      if (newPassword.length < 4) {
        setErrorMsg("New password must be at least 4 characters long.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg("New passwords do not match.");
        return;
      }
    }

    setUpdating(true);
    try {
      await onUpdate(
        newUsername.trim(),
        newAvatar,
        oldPassword || undefined,
        newPassword || undefined,
        newStatusMessage.trim()
      );
      setSuccess(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update profile.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fade-in">
      <div className="w-full max-w-4xl bg-[#1E293B] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[88vh] md:h-[78vh]">
        
        {/* Sidebar Nav (Settings Categories) */}
        <div className={`w-full md:w-64 bg-[#0F172A]/80 border-b md:border-b-0 md:border-r border-slate-800 p-4 shrink-0 flex flex-col justify-start gap-1.5 overflow-y-auto h-full max-h-none ${
          activeTab !== "menu" ? "hidden md:flex" : "flex"
        }`}>
          <div className="flex items-center justify-between px-3 py-3 md:py-4 mb-2 md:mb-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-400 animate-spin-slow" />
              <div>
                <h3 className="text-sm font-bold text-slate-100 font-display leading-tight">System Settings</h3>
                <span className="text-[10px] text-slate-500">Configure Workspace</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer md:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("menu")}
            className={`flex items-center gap-2.5 px-4 py-3 text-xs font-bold rounded-2xl transition-all cursor-pointer truncate w-full ${
              activeTab === "menu"
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-extrabold shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Dashboard Overview
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2.5 px-4 py-3 text-xs font-bold rounded-2xl transition-all cursor-pointer truncate w-full ${
              activeTab === "profile"
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-extrabold shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <User className="w-4 h-4" />
            My Profile
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("theme")}
            className={`flex items-center gap-2.5 px-4 py-3 text-xs font-bold rounded-2xl transition-all cursor-pointer truncate w-full ${
              activeTab === "theme"
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-extrabold shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <Palette className="w-4 h-4" />
            Visual Themes
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("accessibility")}
            className={`flex items-center gap-2.5 px-4 py-3 text-xs font-bold rounded-2xl transition-all cursor-pointer truncate w-full ${
              activeTab === "accessibility"
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-extrabold shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <Accessibility className="w-4 h-4" />
            Accessibility Tools
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("privacy")}
            className={`flex items-center gap-2.5 px-4 py-3 text-xs font-bold rounded-2xl transition-all cursor-pointer truncate w-full ${
              activeTab === "privacy"
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-extrabold shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <Shield className="w-4 h-4" />
            Privacy & Security
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("notifications")}
            className={`flex items-center gap-2.5 px-4 py-3 text-xs font-bold rounded-2xl transition-all cursor-pointer truncate w-full ${
              activeTab === "notifications"
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-extrabold shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <Bell className="w-4 h-4" />
            Notification Alerts
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("cloud"); fetchCloudStatus(); }}
            className={`flex items-center gap-2.5 px-4 py-3 text-xs font-bold rounded-2xl transition-all cursor-pointer truncate w-full ${
              activeTab === "cloud"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-extrabold shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Sheets & Drive Cloud
          </button>

          <div className="mt-auto text-[10px] text-slate-500 px-3 py-2 border-t border-white/5 pt-3">
            <p>Active Node: <span className="text-emerald-400 font-mono font-bold">Secure</span></p>
            <p className="mt-1 font-mono text-[9px]">Last Sync: {currentTime}</p>
          </div>
        </div>

        {/* Content Container */}
        <div className={`flex-1 flex flex-col min-w-0 bg-[#1E293B] relative ${
          activeTab === "menu" ? "hidden md:flex" : "flex"
        }`}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0F172A]/30">
            <div className="flex items-center gap-3">
              {activeTab !== "menu" && (
                <button
                  type="button"
                  onClick={() => setActiveTab("menu")}
                  className="px-2 py-1 bg-slate-800/85 hover:bg-slate-850 border border-slate-700/60 rounded-lg text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase font-mono shadow-sm"
                  title="Back to Settings Dashboard"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Menu</span>
                </button>
              )}
              <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase font-mono">
                {activeTab === "menu" && "⚙️ System Configuration Dashboard"}
                {activeTab === "profile" && "👤 Credentials Security & Account details"}
                {activeTab === "theme" && "🎨 UI Theme and Palette Layout Selector"}
                {activeTab === "accessibility" && "♿ Inclusivity, Layout parameters, & Assistive Tech"}
                {activeTab === "privacy" && "🔒 Enterprise Privacy controls & active sessions info"}
                {activeTab === "notifications" && "🔔 Message Notifications & Custom Sound Alerts"}
                {activeTab === "cloud" && "📊 Google Sheets Database & Google Drive Cloud"}
              </h4>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form / Grid body */}
          <div className="flex-1 overflow-y-auto md:overflow-y-hidden p-5 sm:p-6 scroll-smooth custom-scrollbar pb-12">
            
            {/* DASHBOARD OVERVIEW */}
            {activeTab === "menu" && (
              <div className="space-y-6">
                <div className="bg-[#0F172A]/40 p-4 border border-slate-800 rounded-2xl">
                  <h3 className="text-xs font-bold text-indigo-400 uppercase font-mono tracking-wider mb-1">
                    System Control Portal
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Welcome to your personalized system settings dashboard. Configure your active profile credentials, visual themes, accessibility layout modifiers, or enterprise privacy gates.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Card 1: My Profile */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("profile")}
                    className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-indigo-500/60 hover:bg-slate-900/70 text-left transition-all cursor-pointer group flex flex-col justify-between h-40 scale-100 active:scale-[0.98] duration-150"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-extrabold uppercase font-mono tracking-wider text-indigo-450">My Profile</span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-100 group-hover:text-indigo-400 transition-colors mb-1 font-display">
                        Credentials & Account Photo
                      </h4>
                      <p className="text-[10.5px] text-slate-400 leading-normal line-clamp-2">
                        Modify user handle, select animated avatar emojis, or upload custom profile pictures.
                      </p>
                    </div>
                    <span className="text-[9.5px] font-bold text-slate-500 group-hover:text-indigo-455 transition-colors font-mono self-end">Configure Options &rarr;</span>
                  </button>

                  {/* Card 2: Visual Themes */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("theme")}
                    className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-emerald-500/60 hover:bg-slate-900/70 text-left transition-all cursor-pointer group flex flex-col justify-between h-40 scale-100 active:scale-[0.98] duration-150"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
                          <Palette className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-extrabold uppercase font-mono tracking-wider text-emerald-450">Visual Themes</span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-100 group-hover:text-emerald-400 transition-colors mb-1 font-display">
                        Palette & Interface Mode
                      </h4>
                      <p className="text-[10.5px] text-slate-400 leading-normal line-clamp-2">
                        Customize sidebar and dialog color palettes. ToggleSlate, Cosmic, Ocean, or Emerald.
                      </p>
                    </div>
                    <span className="text-[9.5px] font-bold text-slate-500 group-hover:text-emerald-455 transition-colors font-mono self-end">Configure Options &rarr;</span>
                  </button>

                  {/* Card 3: Accessibility Tools */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("accessibility")}
                    className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-yellow-500/60 hover:bg-slate-900/70 text-left transition-all cursor-pointer group flex flex-col justify-between h-40 scale-100 active:scale-[0.98] duration-150"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="p-2 bg-yellow-500/10 text-yellow-400 rounded-xl group-hover:bg-yellow-650 group-hover:text-white transition-colors shrink-0">
                          <Accessibility className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-extrabold uppercase font-mono tracking-wider text-yellow-450">Accessibility Tools</span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-100 group-hover:text-yellow-450 transition-colors mb-1 font-display">
                        Assistive Tech & Scaling
                      </h4>
                      <p className="text-[10.5px] text-slate-400 leading-normal line-clamp-2">
                        Enlarge active font sizes, toggle dyslexic reader weights, or expand character gaps.
                      </p>
                    </div>
                    <span className="text-[9.5px] font-bold text-slate-500 group-hover:text-yellow-500 transition-colors font-mono self-end">Configure Options &rarr;</span>
                  </button>

                   {/* Card 4: Privacy & Security */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("privacy")}
                    className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-purple-500/60 hover:bg-slate-900/70 text-left transition-all cursor-pointer group flex flex-col justify-between h-40 scale-100 active:scale-[0.98] duration-150"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
                          <Shield className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-extrabold uppercase font-mono tracking-wider text-purple-450">Privacy & Security</span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-100 group-hover:text-purple-400 transition-colors mb-1 font-display">
                        Visibility & Encryption
                      </h4>
                      <p className="text-[10.5px] text-slate-400 leading-normal line-clamp-2">
                        Control online presences status sharing, E2EE channels verification state, or timeouts.
                      </p>
                    </div>
                    <span className="text-[9.5px] font-bold text-slate-500 group-hover:text-purple-455 transition-colors font-mono self-end">Configure Options &rarr;</span>
                  </button>

                  {/* Card 5: Notification Alerts */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("notifications")}
                    className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-pink-500/60 hover:bg-slate-900/70 text-left transition-all cursor-pointer group flex flex-col justify-between h-40 scale-100 active:scale-[0.98] duration-150"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="p-2 bg-pink-500/10 text-pink-400 rounded-xl group-hover:bg-pink-600 group-hover:text-white transition-colors shrink-0">
                          <Bell className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-extrabold uppercase font-mono tracking-wider text-pink-450">Notifications</span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-100 group-hover:text-pink-400 transition-colors mb-1 font-display">
                        Alert Customization & Sound
                      </h4>
                      <p className="text-[10.5px] text-slate-400 leading-normal line-clamp-2">
                        Toggle system push alerts, adjust custom sound effects, or select premium notification tunes.
                      </p>
                    </div>
                    <span className="text-[9.5px] font-bold text-slate-500 group-hover:text-pink-455 transition-colors font-mono self-end">Configure Options &rarr;</span>
                  </button>

                  {/* Card 6: Sheets & Drive Cloud */}
                  <button
                    type="button"
                    onClick={() => { setActiveTab("cloud"); fetchCloudStatus(); }}
                    className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-emerald-500/60 hover:bg-slate-900/70 text-left transition-all cursor-pointer group flex flex-col justify-between h-40 scale-100 active:scale-[0.98] duration-150"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
                          <FileSpreadsheet className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-extrabold uppercase font-mono tracking-wider text-emerald-450">Cloud Sync & Storage</span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-100 group-hover:text-emerald-400 transition-colors mb-1 font-display">
                        Google Sheets & Drive
                      </h4>
                      <p className="text-[10.5px] text-slate-400 leading-normal line-clamp-2">
                        Real-time automatic sync of accounts, rooms & chats to Google Sheets with photo storage in Drive.
                      </p>
                    </div>
                    <span className="text-[9.5px] font-bold text-slate-500 group-hover:text-emerald-455 transition-colors font-mono self-end">Configure Cloud &rarr;</span>
                  </button>
                </div>
              </div>
            )}
            
            {/* TAP 1: PROFILE SETUP */}
            {activeTab === "profile" && (
              <form onSubmit={handleSubmitProfile} className="space-y-4">
                {errorMsg && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-red-400">
                    {errorMsg}
                  </div>
                )}
                {success && (
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-400 text-center font-medium animate-pulse">
                    ✓ Account information parsed and updated successfully!
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column: Profile Info & Custom Photo */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Email & Info */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">
                          Registered Email (Read-Only)
                        </label>
                        <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-400 text-[11px]">
                          <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{email || "none@example.com"}</span>
                        </div>
                      </div>

                      {/* Username */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">
                          Edit Handle / Alias
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value.replace(/\s+/g, ""))}
                            placeholder="eg. alice"
                            maxLength={15}
                            required
                            className="w-full bg-slate-900 border border-slate-800 px-3 py-1.5 pl-8 rounded-xl text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-slate-650"
                          />
                          <User className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                        </div>
                      </div>
                    </div>

                    {/* Photo Uploader Component with Live Preview */}
                    <div className="bg-slate-900/30 p-2.5 rounded-xl border border-slate-800/80 flex items-center gap-3.5">
                      <div className="relative group shrink-0">
                        {newAvatar && (newAvatar.startsWith("data:image") || newAvatar.startsWith("http")) ? (
                          <img
                            src={normalizeMediaUrl(newAvatar)}
                            alt="Profile Preview"
                            className="w-11 h-11 rounded-full object-cover border-2 border-indigo-500 shadow-md"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-xl shadow-lg font-sans">
                            {newAvatar || "🦊"}
                          </div>
                        )}
                        {isUploadingPhoto && (
                          <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                            <Loader className="w-4 h-4 text-indigo-400 animate-spin" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">
                          Custom Photo Profile
                        </label>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg cursor-pointer transition-all shadow-sm active:scale-95">
                            {isUploadingPhoto ? (
                              <Loader className="w-3 h-3 animate-spin" />
                            ) : (
                              <Upload className="w-3 h-3" />
                            )}
                            <span>{isUploadingPhoto ? "Processing..." : "Upload Photo"}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={isUploadingPhoto}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setIsUploadingPhoto(true);
                                setErrorMsg("");
                                try {
                                  const compressedDataUrl = await compressAvatarFile(file);
                                  setNewAvatar(compressedDataUrl);
                                } catch (err: any) {
                                  console.error("Avatar compression error:", err);
                                  setErrorMsg("Failed to process photo: " + (err.message || "Unknown error"));
                                } finally {
                                  setIsUploadingPhoto(false);
                                  // Reset input value so same file can be re-selected if needed
                                  e.target.value = "";
                                }
                              }}
                            />
                          </label>
                          {newAvatar && (newAvatar.startsWith("data:image") || newAvatar.startsWith("http")) && (
                            <button
                              type="button"
                              onClick={() => setNewAvatar("🦊")}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 text-[10px] font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Choose Preset Emojis (Compact Grid: col-10) */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">
                        Or Choose From Emojis Preset
                      </label>
                      <div className="grid grid-cols-10 gap-1 bg-slate-900/30 p-2 rounded-xl border border-slate-800/80">
                        {AVATAR_OPTIONS.map((emoji, idx) => (
                          <button
                            key={`${emoji}-${idx}`}
                            type="button"
                            onClick={() => setNewAvatar(emoji)}
                            className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all cursor-pointer ${
                              newAvatar === emoji
                                ? "bg-indigo-600 scale-105 shadow-md border border-indigo-400/50"
                                : "bg-slate-800/40 hover:bg-slate-700/60 border border-transparent"
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Status Message */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">
                        Status Message
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={newStatusMessage}
                          onChange={(e) => setNewStatusMessage(e.target.value)}
                          placeholder="What's on your mind? (eg. Coding, AFK, Busy...)"
                          maxLength={60}
                          className="w-full bg-slate-900 border border-slate-800 px-3 py-1.5 pl-8 rounded-xl text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-slate-650"
                        />
                        <Smile className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Cryptographic passwords edit and actions */}
                  <div className="space-y-3.5 flex flex-col justify-between">
                    <div className="space-y-3 p-3.5 bg-slate-900/30 border border-slate-800/60 rounded-xl">
                      <div className="flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-[9px] font-bold text-indigo-400 tracking-wider uppercase">
                          Change Account Password (Optional)
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        <div className="space-y-1">
                          <label className="text-[8.5px] font-bold text-slate-450 uppercase block">
                            Current Password
                          </label>
                          <div className="relative">
                            <input
                              type="password"
                              value={oldPassword}
                              onChange={(e) => setOldPassword(e.target.value)}
                              placeholder="Current active password"
                              className="w-full bg-slate-950 border border-slate-850 px-3 py-1.5 pl-8 rounded-xl text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                            <Lock className="w-3 h-3 text-slate-505 absolute left-2.5 top-2.5" />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[8.5px] font-bold text-slate-450 uppercase block">
                              New Password
                            </label>
                            <div className="relative">
                              <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Min 4 chars"
                                className="w-full bg-slate-950 border border-slate-850 px-3 py-1.5 pl-8 rounded-xl text-[10.5px] text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                              <Lock className="w-3 h-3 text-slate-505 absolute left-2.5 top-2.5" />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[8.5px] font-bold text-slate-450 uppercase block">
                              Confirm Password
                            </label>
                            <div className="relative">
                              <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Repeat pass"
                                className="w-full bg-slate-950 border border-slate-850 px-3 py-1.5 pl-8 rounded-xl text-[10.5px] text-slate-200 focus:outline-none"
                              />
                              <Lock className="w-3 h-3 text-slate-505 absolute left-2.5 top-2.5" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions bar bottom right */}
                    <div className="flex items-center justify-end gap-2.5 pt-2.5 mt-auto">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-400 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={
                          updating ||
                          (newUsername === username &&
                            newAvatar === avatar &&
                            newStatusMessage === (statusMessage || "") &&
                            !oldPassword &&
                            !newPassword)
                        }
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all disabled:opacity-40"
                      >
                        {updating ? "Saving..." : "Save Account Info"}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            )}

            {/* TAB 2: THEME SWITCHER */}
            {activeTab === "theme" && (
              <div className="space-y-3 animate-fade-in">
                <div className="p-2 px-3 bg-indigo-950/25 border border-indigo-500/10 rounded-xl text-[10.5px] text-indigo-300 leading-normal flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>
                    Select a workspace appearance theme. This updates the sidebar gradients, backgrounds, and accent hues instantly.
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {THEME_PRESETS.map((theme) => {
                    const isSelected = activeThemeId === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => onSelectTheme(theme.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer group ${
                          isSelected
                            ? "bg-indigo-600/10 border-indigo-500 shadow-md ring-1 ring-indigo-500/10"
                            : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/65"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5 font-display">
                              <span className="text-sm">{theme.icon}</span>
                              {theme.name}
                            </span>
                            {isSelected && (
                              <span className="text-[8px] font-extrabold bg-indigo-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-450 leading-relaxed line-clamp-1">
                            {theme.description}
                          </p>
                        </div>

                        {/* Theme preview chips */}
                        <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-white/5 w-full">
                          <span className="text-[8px] uppercase tracking-wider text-slate-505 mr-auto font-mono">Palette:</span>
                          <div 
                            className="w-2.5 h-2.5 rounded-full border border-slate-700/80 shadow-inner"
                            style={{ backgroundColor: theme.id === "slate" ? "#0F172A" : theme.id === "emerald" ? "#061C15" : theme.id === "purple" ? "#0B051D" : theme.id === "ocean" ? "#04101E" : "#1C0D0D" }}
                            title="Main Color"
                          />
                          <div 
                            className="w-2.5 h-2.5 rounded-full border border-slate-700/80 shadow-inner"
                            style={{ backgroundColor: theme.id === "slate" ? "#1E293B" : theme.id === "emerald" ? "#0B2C24" : theme.id === "purple" ? "#180C34" : theme.id === "ocean" ? "#081F38" : "#331414" }}
                            title="Secondary Color"
                          />
                          <div 
                            className="w-2.5 h-2.5 rounded-full border border-slate-750 shadow-inner"
                            style={{ backgroundColor: theme.id === "slate" ? "#6366f1" : theme.id === "emerald" ? "#10b981" : theme.id === "purple" ? "#d946ef" : theme.id === "ocean" ? "#06b6d4" : "#f59e0b" }}
                            title="Accent Light"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: ACCESSIBILITY OPTIONS */}
            {activeTab === "accessibility" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                
                {/* Left Column: Font sizing & Inclusive Checkboxes */}
                <div className="space-y-3">
                  {/* Font resizing block */}
                  <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-xl space-y-2.5">
                    <div>
                      <h5 className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                        <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                        Workspace Font Scaling
                      </h5>
                      <p className="text-[9px] text-slate-500">Adjust the font size of the application text details.</p>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {(["small", "normal", "large", "xlarge"] as const).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => updateAccessibility("accessibility_fontSize", sz)}
                          className={`py-1.5 px-2 rounded-lg border text-[10px] font-bold capitalize transition-all cursor-pointer ${
                            fontSize === sz
                              ? "bg-indigo-600/15 text-indigo-400 border-indigo-500 shadow-sm"
                              : "bg-slate-800/40 border-slate-750 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {sz === "normal" ? "Normal" : sz === "large" ? "Large" : sz === "xlarge" ? "X-Large" : "Small"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* inclusive switches card */}
                  <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-xl space-y-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Inclusive System Adjustments</span>
                    
                    <div className="space-y-2 max-h-[220px] overflow-hidden">
                      {/* Dyslexic friendly font */}
                      <div className="flex items-start gap-2 text-[10.5px]">
                        <input
                          type="checkbox"
                          id="check-dyslexic"
                          checked={dyslexicFont}
                          onChange={(e) => updateAccessibility("accessibility_dyslexicFont", e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-800 border-slate-700 mt-0.5 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <label htmlFor="check-dyslexic" className="font-bold text-slate-250 cursor-pointer block">Dyslexic Reader Font</label>
                          <span className="text-[9px] text-slate-500 block leading-tight">Switches system typography to high readability open-dyslexic shapes.</span>
                        </div>
                      </div>

                      {/* High Contrast */}
                      <div className="flex items-start gap-2 text-[10.5px]">
                        <input
                          type="checkbox"
                          id="check-contrast"
                          checked={highContrast}
                          onChange={(e) => updateAccessibility("accessibility_highContrast", e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-800 border-slate-700 mt-0.5 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <label htmlFor="check-contrast" className="font-bold text-slate-250 cursor-pointer block">High Contrast Elements</label>
                          <span className="text-[9px] text-slate-500 block leading-tight">Amplifies outlines and panel contrasts to high-contrast levels.</span>
                        </div>
                      </div>

                      {/* Enhanced letter spacing */}
                      <div className="flex items-start gap-2 text-[10.5px]">
                        <input
                          type="checkbox"
                          id="check-spacing"
                          checked={increasedSpacing}
                          onChange={(e) => updateAccessibility("accessibility_increasedSpacing", e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-800 border-slate-700 mt-0.5 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <label htmlFor="check-spacing" className="font-bold text-slate-250 cursor-pointer block">Expanded Letter Spacing</label>
                          <span className="text-[9px] text-slate-500 block leading-tight">Adds letter tracking horizontal space for better legibility.</span>
                        </div>
                      </div>

                      {/* Reduced motion */}
                      <div className="flex items-start gap-2 text-[10.5px]">
                        <input
                          type="checkbox"
                          id="check-motion"
                          checked={reduceMotion}
                          onChange={(e) => updateAccessibility("accessibility_reduceMotion", e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-800 border-slate-700 mt-0.5 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <label htmlFor="check-motion" className="font-bold text-slate-250 cursor-pointer block">Reduce UI motion</label>
                          <span className="text-[9px] text-slate-500 block leading-tight">Disables intensive transitions and vestibular strobe triggers.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Keyboard Shortcuts Sheet */}
                <div className="space-y-2.5">
                  <div className="p-3.5 border border-slate-850 bg-[#0F172A]/40 rounded-xl h-full flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <HelpCircle className="w-4 h-4 text-indigo-400" />
                        <span className="text-[11px] font-bold text-slate-200">System Keyboard Shortcuts</span>
                      </div>
                      <div className="space-y-1.5">
                        {KEYBOARD_SHORTCUTS.map((item, index) => (
                          <div key={index} className="flex justify-between items-center p-1.5 rounded-lg bg-black/10 border border-white/5 text-[10px]">
                            <span className="text-slate-400 font-mono leading-none">{item.desc}</span>
                            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold border border-slate-750 font-mono text-[9px] tracking-tight shrink-0">{item.keys}</kbd>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* visual screen flash */}
                    <div className="p-2.5 bg-indigo-950/20 rounded-xl border border-indigo-900/30 flex items-start gap-2.5 mt-3 text-[10px]">
                      <input
                        type="checkbox"
                        id="check-flash"
                        checked={screenFlashForMentions}
                        onChange={(e) => updateAccessibility("accessibility_screenFlashForMentions", e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-800 border-slate-700 mt-0.5 focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <label htmlFor="check-flash" className="font-bold text-slate-250 cursor-pointer">Visible Notification Flash-Assist</label>
                        <span className="text-[8.5px] text-slate-500 block leading-tight">Flashes soft border rings around the workspace on chat mentions.</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 4: PRIVACY & SECURITY DETAILS */}
            {activeTab === "privacy" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                
                {/* Left Column: Privacy Switches & Lockdown parameters */}
                <div className="space-y-3">
                  <div className="p-3.5 bg-slate-900/40 border border-slate-850 rounded-xl space-y-3">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Online privacy visibility</span>
                    
                    <div className="space-y-2.5 text-[10.5px]">
                      {/* Presence toggle */}
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <span className="font-bold text-slate-200 block">Online Presence Status</span>
                          <span className="text-[8.5px] text-slate-500 block leading-tight">Allows contacts to view whether you are active in standard feeds.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updatePrivacy("privacy_sharePresence", !sharePresence)}
                          className={`w-8 h-4.5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${sharePresence ? "bg-indigo-600" : "bg-slate-800"}`}
                        >
                          <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform ${sharePresence ? "translate-x-3.5" : "translate-x-0"}`} />
                        </button>
                      </div>

                      {/* Typing toggle */}
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <span className="font-bold text-slate-200 block">Typing indicators state</span>
                          <span className="text-[8.5px] text-slate-500 block leading-tight">Transmits real-time feedback when you are actively drafting a note.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updatePrivacy("privacy_shareTyping", !shareTyping)}
                          className={`w-8 h-4.5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${shareTyping ? "bg-indigo-600" : "bg-slate-800"}`}
                        >
                          <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform ${shareTyping ? "translate-x-3.5" : "translate-x-0"}`} />
                        </button>
                      </div>

                      {/* Read receipts toggle */}
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <span className="font-bold text-slate-200 block">Message Read Receipts</span>
                          <span className="text-[8.5px] text-slate-500 block leading-tight">Enables green checkmark tokens indicating received and read chats.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updatePrivacy("privacy_shareReadReceipts", !shareReadReceipts)}
                          className={`w-8 h-4.5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${shareReadReceipts ? "bg-indigo-600" : "bg-slate-800"}`}
                        >
                          <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform ${shareReadReceipts ? "translate-x-3.5" : "translate-x-0"}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Lockdown & Auto lock dropdown */}
                  <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-xl space-y-2 text-[10.5px]">
                    {/* E2EE checks */}
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id="check-strict-e2ee"
                        checked={strictE2eeOnly}
                        onChange={(e) => updatePrivacy("privacy_strictE2eeOnly", e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-800 border-slate-700 mt-0.5 focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <label htmlFor="check-strict-e2ee" className="font-bold text-slate-250 cursor-pointer">Strict Encrypted Channels Guard</label>
                        <span className="text-[8.5px] text-slate-500 block leading-tight">Locks system threads exclusively to E2EE secure channels.</span>
                      </div>
                    </div>

                    {/* Timeout dropdown */}
                    <div className="pt-1 select-none">
                      <label className="font-semibold text-slate-300 text-[10px] block mb-1">
                        Workspace Auto-Lock Timeout
                      </label>
                      <select
                        value={sessionAutoLock}
                        onChange={(e) => updatePrivacy("privacy_sessionAutoLock", e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 py-1.5 px-2 rounded-lg text-[10px] text-slate-300 outline-none"
                      >
                        <option value="never">Never lock automatically</option>
                        <option value="5m">Lock after 5 minutes workspace inactivity</option>
                        <option value="15m">Lock after 15 minutes limit</option>
                        <option value="30m">Lock after 30 minutes limit</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Right Column: Peer node and diagnostics */}
                <div className="space-y-3">
                  {/* Terminal block */}
                  <div className="p-3.5 border border-slate-850 bg-[#0F172A]/40 rounded-xl h-full flex flex-col justify-between min-h-[220px]">
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200 mb-1.5">
                        <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                        Active Peer Node Diagnostics
                      </div>
                      <p className="text-[9.5px] text-slate-500 leading-relaxed mb-2">
                        System environment handshake is verified. Accessing cryptographic interface. Signature details:
                      </p>
                      <p className="text-[9px] font-mono text-indigo-350 bg-black/20 p-2 rounded-lg break-words leading-normal max-h-[85px] overflow-hidden">
                        {userAgent || "Determined at handshake..."}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 font-mono">Last Sync: {currentTime}</span>
                      <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-555/20 text-emerald-400 rounded-lg text-[8.5px] font-bold uppercase tracking-wider font-mono">
                        Key Saved
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: MESSAGE NOTIFICATIONS & CUSTOM SOUND ALERTS */}
            {activeTab === "notifications" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in text-[11px] text-slate-300">
                
                {/* Left Column: Notification Toggles & Controls */}
                <div className="space-y-4">
                  <div className="p-4 bg-slate-900/40 border border-slate-850 rounded-2xl space-y-4">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block font-mono">General Notification Gateways</span>
                    
                    <div className="space-y-4">
                      {/* Desktop notifications toggle */}
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <span className="font-bold text-slate-200 block">Desktop Push Alerts</span>
                          <span className="text-[9px] text-slate-400 block leading-tight">Shows HTML5 desktop popup notifications for incoming messages when backgrounded.</span>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (notificationsEnabled) {
                              updateNotifications("notifications_enabled", false);
                            } else {
                              const perm = await requestPermissionDirectly();
                              updateNotifications("notifications_enabled", perm === "granted");
                            }
                          }}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${notificationsEnabled ? "bg-indigo-500" : "bg-slate-800"}`}
                        >
                          <div className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${notificationsEnabled ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                      </div>

                      {/* Sound alerts toggle */}
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <span className="font-bold text-slate-200 block">Audible Sound Alerts</span>
                          <span className="text-[9px] text-slate-400 block leading-tight">Plays custom synthesizer tone alerts upon receiving incoming room messages.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateNotifications("notifications_sound_enabled", !soundEnabled)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${soundEnabled ? "bg-indigo-500" : "bg-slate-800"}`}
                        >
                          <div className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${soundEnabled ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                      </div>

                      {/* Mute group notifications toggle */}
                      <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-3.5">
                        <div>
                          <span className="font-bold text-slate-200 block">Mute General Group Chats</span>
                          <span className="text-[9px] text-slate-400 block leading-tight font-sans">Silence sound and alerts for general group messages unless you are explicitly @mentioned.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateNotifications("notifications_mute_groups", !muteGroupNotifications)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${muteGroupNotifications ? "bg-indigo-500" : "bg-slate-800"}`}
                        >
                          <div className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${muteGroupNotifications ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Browser permission details info card */}
                  <div className="p-4 bg-[#0F172A]/40 border border-slate-850 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-[10px] uppercase font-mono tracking-wider">
                      <Monitor className="w-4 h-4" />
                      Browser Authorization Status
                    </div>
                    <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-xl border border-white/5 mt-1.5">
                      <span className="text-slate-400">Current Permission:</span>
                      <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-lg font-mono ${
                        typeof window !== "undefined" && "Notification" in window
                          ? Notification.permission === "granted"
                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                            : Notification.permission === "denied"
                              ? "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                              : "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
                          : "bg-slate-800 text-slate-500"
                      }`}>
                        {typeof window !== "undefined" && "Notification" in window ? Notification.permission : "Unsupported"}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-normal pt-1">
                      If notifications are denied, click the lock icon in your browser's address bar to reset permissions.
                    </p>
                  </div>
                </div>

                {/* Right Column: Premium Synthesized Tone Selection */}
                <div className="space-y-4">
                  <div className="p-4 bg-slate-900/40 border border-slate-850 rounded-2xl space-y-4 font-sans">
                    <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider block font-mono">Synthesizer Tone Customization</span>
                    
                    <div className="space-y-3.5 select-none">
                      <div>
                        <label className="font-semibold text-slate-300 text-[10px] block mb-1.5 uppercase font-mono tracking-wide">
                          Alert Sound Tune Preset
                        </label>
                        <select
                          value={soundPreset}
                          disabled={!soundEnabled}
                          onChange={(e) => updateNotifications("notifications_sound_preset", e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 py-2 px-2.5 rounded-xl text-[10.5px] text-slate-300 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/10 disabled:opacity-50 transition-all font-sans cursor-pointer"
                        >
                          <option value="chime">🔔 Classic Pleasant Chime (Double-note E6-A6)</option>
                          <option value="bloop">💧 Cybernetic Bloop (Fast Upward Sweep)</option>
                          <option value="ping">✨ Crystal Ping (Crisp High-Frequency Beep)</option>
                          <option value="echo">📡 Echo Radar (Decaying Decay Pings)</option>
                        </select>
                      </div>

                      {/* Volume Slider */}
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="font-semibold text-slate-300 text-[10px] block uppercase font-mono tracking-wide">
                            Notification Volume
                          </label>
                          <span className="text-[9.5px] text-indigo-400 font-bold font-mono">
                            {soundEnabled ? `${Math.round(soundVolume * 100)}%` : "MUTED"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <VolumeX className="w-4 h-4 text-slate-500" />
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={soundVolume}
                            disabled={!soundEnabled}
                            onChange={(e) => updateNotifications("notifications_sound_volume", parseFloat(e.target.value))}
                            className="flex-1 accent-indigo-500 h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer disabled:opacity-40"
                          />
                          <Volume2 className="w-4 h-4 text-indigo-455" />
                        </div>
                      </div>

                      {/* Test Sound Button */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => playTestSound(soundPreset, soundVolume)}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md hover:shadow-indigo-500/10 disabled:opacity-50 active:scale-[0.98]"
                        >
                          <Volume2 className="w-4 h-4" />
                          <span>Test Sound Notification</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Aesthetic Background Note helper card */}
                  <div className="p-4 border border-slate-850 bg-[#0F172A]/40 rounded-2xl flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-pink-400 font-bold text-[10px] uppercase font-mono tracking-wider mb-1.5">
                      <HelpCircle className="w-4 h-4" />
                      Active Background Delivery
                    </div>
                    <p className="text-[9.5px] text-slate-450 leading-relaxed font-sans">
                      Our dynamic background push engine ensures you receive incoming room messages in real-time even when your tab is minimized or the app runs in the background. To guarantee sound delivery, ensure your browser has sound authorization permitted.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: GOOGLE SHEETS & DRIVE CLOUD STORAGE */}
            {activeTab === "cloud" && (
                <div className="space-y-6">
                  {/* Status Banner */}
                  <div className={`p-4.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    cloudStatus.connected 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : cloudStatus.configured
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl shrink-0 ${
                        cloudStatus.connected
                          ? "bg-emerald-500/20 text-emerald-400"
                          : cloudStatus.configured
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-indigo-500/20 text-indigo-400"
                      }`}>
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold font-mono uppercase tracking-wider">
                            {cloudStatus.connected
                              ? "✓ Cloud Database & Drive Connected"
                              : cloudStatus.configured
                              ? "⚠️ Apps Script Configured (Testing Connectivity...)"
                              : "🚀 Google Sheets & Drive Auto-Sync"}
                          </h4>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase font-mono ${
                            cloudStatus.connected
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}>
                            {cloudStatus.connected ? "Real-time Live" : "Setup Required"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          {cloudStatus.connected
                            ? "All user accounts, chat rooms, and messages are continuously backed up to your Google Sheet. Uploaded photos & voice memos are hosted in Google Drive."
                            : "Connect your Google Apps Script Web App to automatically store user accounts and messages in Google Sheets, and host photos directly in Google Drive."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={fetchCloudStatus}
                        disabled={cloudStatus.loading}
                        className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-slate-700 shadow-sm disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${cloudStatus.loading ? "animate-spin" : ""}`} />
                        <span>Refresh Status</span>
                      </button>
                    </div>
                  </div>

                  {cloudFeedback && (
                    <div className={`p-3 rounded-xl text-xs font-medium border flex items-center gap-2 ${
                      cloudFeedback.includes("successfully") || cloudFeedback.includes("Synced")
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-red-500/10 border-red-500/20 text-red-400"
                    }`}>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{cloudFeedback}</span>
                    </div>
                  )}

                  {/* Apps Script Web App URL Input */}
                  <div className="p-5 bg-[#0F172A]/50 border border-slate-800 rounded-2xl space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-200 block uppercase font-mono tracking-wider mb-1">
                        Google Apps Script Web App URL
                      </label>
                      <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                        Paste your deployed Google Apps Script Web App URL (ending with <code className="text-indigo-400 font-mono">/exec</code>).
                      </p>
                      
                      <div className="flex flex-col sm:flex-row items-stretch gap-2">
                        <input
                          type="url"
                          value={appsScriptUrlInput}
                          onChange={(e) => setAppsScriptUrlInput(e.target.value)}
                          placeholder="https://script.google.com/macros/s/.../exec"
                          className="flex-1 bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                        />
                        <button
                          type="button"
                          onClick={handleSaveAppsScriptUrl}
                          disabled={isSavingUrl || !appsScriptUrlInput.trim()}
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md hover:shadow-indigo-500/20 shrink-0 font-mono active:scale-[0.98]"
                        >
                          {isSavingUrl ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Connect & Save</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Quick Action Links if connected */}
                    {cloudStatus.spreadsheetUrl && (
                      <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <a
                          href={cloudStatus.spreadsheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-xl flex items-center justify-between text-slate-300 hover:text-emerald-400 text-xs font-bold transition-all group"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="truncate">Open Google Sheet</span>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 shrink-0" />
                        </a>

                        {cloudStatus.driveFolderUrl && (
                          <a
                            href={cloudStatus.driveFolderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-xl flex items-center justify-between text-slate-300 hover:text-indigo-400 text-xs font-bold transition-all group"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
                              <span className="truncate">Open Drive Photos</span>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 shrink-0" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={handleSyncAllData}
                          disabled={isSyncingAll}
                          className="p-3 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-purple-500/40 rounded-xl flex items-center justify-between text-slate-300 hover:text-purple-400 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <RefreshCw className={`w-4 h-4 text-purple-400 shrink-0 ${isSyncingAll ? "animate-spin" : ""}`} />
                            <span className="truncate">{isSyncingAll ? "Syncing..." : "Sync All Now"}</span>
                          </div>
                          <Cloud className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Setup Guide & Copy Code.gs */}
                  <div className="p-5 bg-[#0F172A]/50 border border-slate-800 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
                          <HardDrive className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider">
                          How to Set Up (One-Time Setup in 60 seconds)
                        </h4>
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyCodeGs}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-mono shadow-sm ${
                          copiedCode
                            ? "bg-emerald-600 text-white"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white"
                        }`}
                      >
                        {copiedCode ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Copied Code.gs!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Full Code.gs</span>
                          </>
                        )}
                      </button>
                    </div>

                    <ol className="text-xs text-slate-400 space-y-2.5 list-decimal list-inside leading-relaxed">
                      <li>
                        Open <a href="https://sheets.new" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline font-semibold">sheets.new</a> in your browser to create a new blank Google Spreadsheet.
                      </li>
                      <li>
                        Click on <span className="text-slate-200 font-semibold">Extensions &rarr; Apps Script</span> in the top menu.
                      </li>
                      <li>
                        Delete any existing sample code in <code className="text-indigo-400 font-mono">Code.gs</code>, click the button above to copy the script, and paste it.
                      </li>
                      <li>
                        Click the blue <span className="text-slate-200 font-semibold">Deploy &rarr; New deployment</span> button (top-right).
                      </li>
                      <li>
                        Select type <span className="text-slate-200 font-semibold">Web app</span>, set <span className="text-slate-200 font-semibold">Execute as: Me</span>, and set <span className="text-slate-200 font-semibold">Who has access: Anyone</span>.
                      </li>
                      <li>
                        Click <span className="text-slate-200 font-semibold">Deploy</span>, authorize permissions with your Google account, copy the Web App URL, and paste it into the field above!
                      </li>
                    </ol>

                    <div className="p-3 bg-slate-950/80 border border-slate-850 rounded-xl text-[11px] text-slate-400 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>The Apps Script will automatically create all tabs (<b className="text-slate-300">Accounts</b>, <b className="text-slate-300">Media_Drive</b>, <b className="text-slate-300">Messages</b>, <b className="text-slate-300">Rooms</b>) and create the <b className="text-slate-300">SecureChat_Cloud_Drive</b> folder in your Google Drive automatically!</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}

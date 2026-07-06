export interface User {
  username: string;
  status: "online" | "offline";
  publicKey?: string; // String representation of RSA Public JWK
  avatar?: string;
  email?: string;
  statusMessage?: string;
}

export interface Room {
  id: string;
  name: string;
  isGroup: boolean;
  createdBy: string;
  members: string[];
  encryptedKeys: Record<string, string>; // Map of username -> RSA-encrypted AES symmetric room key
  avatar?: string; // Custom profile image or initials SVG / base64 string
  privacy?: "public" | "private";
}

export interface Message {
  id: string;
  sender: string;
  timestamp: number;
  // Encrypted values (transferred securely)
  ciphertext: string;
  iv: string;
  // Media properties
  isMedia?: boolean;
  mediaType?: string; // mime-type like image/png, image/jpeg, application/pdf
  isAudio?: boolean; // Audio voice recordings
  fileName?: string;
  fileSize?: number;
  
  // Poll properties
  isPoll?: boolean;
  pollQuestion?: string;
  pollOptions?: PollOption[];
  
  // Local only properties (not sent to the server)
  isSystem?: boolean;
  systemText?: string;
  decryptedText?: string; // Readability cache in RAM
  decryptedMediaUrl?: string; // Decrypted blob object URL in RAM
  reactions?: Record<string, string[]>; // mapping of emoji -> list of usernames
  readBy?: string[]; // list of usernames who have viewed this message
  
  // Edit and delete state
  isEdited?: boolean;
  isDeleted?: boolean;
  isForwarded?: boolean;
  forwardedFrom?: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // usernames of users who voted for this option
}

export interface ActiveKeyMap {
  [username: string]: string; // username -> Jwk public key string
}

export interface Friend {
  username: string;
  avatar: string;
  status: "online" | "offline";
  statusMessage?: string;
}

export interface FriendRequest {
  id: string;
  sender: string;
  receiver: string;
  timestamp: number;
  status: "pending" | "accepted" | "declined";
}

export interface CallSession {
  roomId: string;
  caller: string;
  callType: "voice" | "video";
  status: "ringing" | "active";
  participants: string[];
}

export interface CallRecord {
  id: string;
  roomId: string;
  roomName: string;
  caller: string;
  callType: "voice" | "video";
  status: "missed" | "incoming" | "outgoing";
  timestamp: number;
  duration: number;
  participants: string[];
}


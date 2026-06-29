import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";

// Support ES modules & CommonJS path resolution safely
const getDirnameAndFilename = () => {
  try {
    if (typeof __filename !== "undefined" && __filename) {
      return { __filename, __dirname };
    }
  } catch (e) {}

  try {
    const metaUrl = import.meta.url;
    if (metaUrl) {
      const filename = fileURLToPath(metaUrl);
      const dirname = path.dirname(filename);
      return { __filename: filename, __dirname: dirname };
    }
  } catch (e) {}

  return { __filename: "", __dirname: "" };
};

const { __filename, __dirname } = getDirnameAndFilename();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  const PORT = 3000;

  // In-memory application state
  const rooms: Record<string, any> = {
    "general": {
      id: "general",
      name: "Global Plaza",
      isGroup: true,
      createdBy: "system",
      members: [],
      encryptedKeys: {}, // Key storage mapped by username -> encryptedRoomKey
      privacy: "public"
    },
    "tech": {
      id: "tech",
      name: "Tech & Security Lounge",
      isGroup: true,
      createdBy: "system",
      members: [],
      encryptedKeys: {},
      privacy: "public"
    }
  };

  const messages: Record<string, any[]> = {
    "general": [],
    "tech": []
  };

  const activeCalls: Record<string, any> = {};

  // Map of connection ID to socket plus metadata
  const activeConnections = new Map<string, { socket: WebSocket; username?: string; publicKey?: string; avatar?: string }>();

  wss.on("connection", (ws) => {
    const connId = Math.random().toString(36).substring(2, 9);
    activeConnections.set(connId, { socket: ws });

    ws.on("message", (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage.toString());
        const { type } = payload;

        switch (type) {
          case "user:register": {
            const { username, publicKey, avatar } = payload;
            if (!username) return;

            const conn = activeConnections.get(connId);
            if (conn) {
              conn.username = username;
              conn.publicKey = publicKey;
              conn.avatar = avatar || "🦊";
            }

            // Send all current rooms to the registering client
            const roomList = Object.values(rooms)
              .filter((r: any) => {
                if (!r.isGroup) return true;
                return r.privacy !== "private" || r.createdBy === username || (r.members && r.members.includes(username));
              })
              .map((r: any) => ({
                id: r.id,
                name: r.name,
                isGroup: r.isGroup,
                createdBy: r.createdBy,
                members: r.members,
                encryptedKeys: r.encryptedKeys,
                avatar: r.avatar,
                privacy: r.privacy || "public"
              }));

            ws.send(JSON.stringify({
              type: "sync:rooms",
              rooms: roomList
            }));

            // Sync other users' keys and avatars
            const activeKeys: Record<string, string> = {};
            const activeAvatars: Record<string, string> = {};
            for (const [_, c] of activeConnections.entries()) {
              if (c.username && c.publicKey) {
                activeKeys[c.username] = c.publicKey;
                if (c.avatar) {
                  activeAvatars[c.username] = c.avatar;
                }
              }
            }
            ws.send(JSON.stringify({
              type: "sync:active_keys",
              keys: activeKeys,
              avatars: activeAvatars
            }));

            // Broadcast user presence to other clients
            broadcast({
              type: "user:presence",
              username,
              publicKey,
              avatar: avatar || "🦊",
              status: "online"
            });
            break;
          }

          case "room:create": {
            const { id, name, isGroup, createdBy, encryptedKeys, avatar, privacy } = payload;
            if (rooms[id]) return;

            rooms[id] = {
              id,
              name,
              isGroup,
              createdBy,
              members: [createdBy],
              encryptedKeys: encryptedKeys || {},
              avatar: avatar,
              privacy: privacy || "public"
            };
            messages[id] = [];

            broadcast({
              type: "room:created",
              room: rooms[id]
            });
            break;
          }

          case "room:update_privacy": {
            const { roomId, privacy, username } = payload;
            const room = rooms[roomId];
            if (!room) return;

            room.privacy = privacy;

            // Broadcast privacy change back to all clients
            broadcast({
              type: "room:privacy_updated",
              roomId,
              privacy,
              room
            });
            break;
          }

          case "room:join": {
            const { roomId, username } = payload;
            const room = rooms[roomId];
            if (!room) return;

            if (!room.members.includes(username)) {
              room.members.push(username);
            }

            // Sync room state and decrypted history back to the joining browser
            ws.send(JSON.stringify({
              type: "room:sync_history",
              roomId,
              members: room.members,
              encryptedKeys: room.encryptedKeys,
              messages: messages[roomId] || []
            }));

            // Broadcast join message to fellow room members
            broadcastToRoom(roomId, {
              type: "room:user_joined",
              roomId,
              username,
              members: room.members
            });
            break;
          }

          case "room:add_member_keys": {
            const { roomId, encryptedKeys } = payload;
            const room = rooms[roomId];
            if (!room) return;

            room.encryptedKeys = {
              ...room.encryptedKeys,
              ...encryptedKeys
            };

            broadcastToRoom(roomId, {
              type: "room:keys_updated",
              roomId,
              encryptedKeys: room.encryptedKeys
            });
            break;
          }

          case "message:send": {
            const { roomId, message } = payload;
            if (!rooms[roomId]) return;

            if (!messages[roomId]) {
              messages[roomId] = [];
            }
            messages[roomId].push(message);

            broadcastToRoom(roomId, {
              type: "message:received",
              roomId,
              message
            });
            break;
          }

          case "message:read": {
            const { roomId, username } = payload;
            if (!rooms[roomId]) return;

            if (!messages[roomId]) {
              messages[roomId] = [];
            }

            let changed = false;
            messages[roomId].forEach((msg: any) => {
              if (msg.sender !== username) {
                if (!msg.readBy) {
                  msg.readBy = [];
                }
                if (!msg.readBy.includes(username)) {
                  msg.readBy.push(username);
                  changed = true;
                }
              }
            });

            if (changed) {
              broadcastToRoom(roomId, {
                type: "message:read_receipt",
                roomId,
                messages: messages[roomId]
              });
            }
            break;
          }

          case "message:react": {
            const { roomId, messageId, emoji, username } = payload;
            if (!rooms[roomId]) return;

            if (!messages[roomId]) {
              messages[roomId] = [];
            }
            const msg = messages[roomId].find(m => m.id === messageId);
            if (!msg) return;

            if (!msg.reactions) {
              msg.reactions = {};
            }

            if (!msg.reactions[emoji]) {
              msg.reactions[emoji] = [];
            }

            const uIdx = msg.reactions[emoji].indexOf(username);
            if (uIdx > -1) {
              msg.reactions[emoji].splice(uIdx, 1);
              if (msg.reactions[emoji].length === 0) {
                delete msg.reactions[emoji];
              }
            } else {
              msg.reactions[emoji].push(username);
            }

            broadcastToRoom(roomId, {
              type: "message:reaction_updated",
              roomId,
              messageId,
              reactions: msg.reactions
            });
            break;
          }

          case "message:vote": {
            const { roomId, messageId, optionId, username } = payload;
            if (!rooms[roomId]) return;

            const roomMsgs = messages[roomId] || [];
            const msg = roomMsgs.find(m => m.id === messageId);
            if (!msg || !msg.isPoll || !msg.pollOptions) return;

            // Find the specified option and toggle/register the vote
            msg.pollOptions = msg.pollOptions.map((opt: any) => {
              const currentVotes = opt.votes || [];
              const alreadyVoted = currentVotes.includes(username);
              let updatedVotes;

              if (alreadyVoted) {
                // Remove vote if already voted
                updatedVotes = currentVotes.filter((u: string) => u !== username);
              } else {
                // Otherwise add vote
                updatedVotes = [...currentVotes, username];
              }

              return {
                ...opt,
                votes: updatedVotes
              };
            });

            broadcastToRoom(roomId, {
              type: "message:poll_updated",
              roomId,
              messageId,
              pollOptions: msg.pollOptions
            });
            break;
          }

          case "call:initiate": {
            const { roomId, callType, caller } = payload;
            if (!rooms[roomId]) return;

            activeCalls[roomId] = {
              roomId,
              caller,
              callType,
              status: "ringing",
              participants: [caller]
            };

            broadcastToRoom(roomId, {
              type: "call:incoming",
              roomId,
              callType,
              caller,
              participants: [caller]
            });
            break;
          }

          case "call:accept": {
            const { roomId, username } = payload;
            const call = activeCalls[roomId];
            if (!call) return;

            if (!call.participants.includes(username)) {
              call.participants.push(username);
            }
            call.status = "active";

            broadcastToRoom(roomId, {
              type: "call:accepted",
              roomId,
              username,
              participants: call.participants
            });
            break;
          }

          case "call:decline": {
            const { roomId, username } = payload;
            const call = activeCalls[roomId];
            
            broadcastToRoom(roomId, {
              type: "call:declined",
              roomId,
              username
            });

            if (call && call.status === "ringing") {
              delete activeCalls[roomId];
              broadcastToRoom(roomId, {
                type: "call:ended",
                roomId
              });
            }
            break;
          }

          case "call:end": {
            const { roomId, username } = payload;
            const call = activeCalls[roomId];
            if (!call) return;

            call.participants = call.participants.filter((p: string) => p !== username);
            if (call.participants.length <= 1) {
              delete activeCalls[roomId];
              broadcastToRoom(roomId, {
                type: "call:ended",
                roomId
              });
            } else {
              broadcastToRoom(roomId, {
                type: "call:participant_left",
                roomId,
                username,
                participants: call.participants
              });
            }
            break;
          }

          case "call:signal": {
            const { roomId, to, from, signal } = payload;
            // Forward signal to the target user
            for (const [_, conn] of activeConnections.entries()) {
              if (conn.username === to) {
                if (conn.socket.readyState === WebSocket.OPEN) {
                  conn.socket.send(JSON.stringify({
                    type: "call:signal",
                    roomId,
                    from,
                    signal
                  }));
                }
                break;
              }
            }
            break;
          }

          case "typing:status": {
            const { roomId, username, isTyping } = payload;
            broadcastToRoom(roomId, {
              type: "typing:update",
              roomId,
              username,
              isTyping
            }, connId);
            break;
          }

          case "user:get_active_keys": {
            const activeKeys: Record<string, string> = {};
            const activeAvatars: Record<string, string> = {};
            for (const [_, c] of activeConnections.entries()) {
              if (c.username && c.publicKey) {
                activeKeys[c.username] = c.publicKey;
                if (c.avatar) {
                  activeAvatars[c.username] = c.avatar;
                }
              }
            }
            ws.send(JSON.stringify({
              type: "sync:active_keys",
              keys: activeKeys,
              avatars: activeAvatars
            }));
            break;
          }

          default:
            console.log("Unhandled message type:", type);
        }
      } catch (err) {
        console.error("Error processing message:", err);
      }
    });

    ws.on("close", () => {
      const conn = activeConnections.get(connId);
      if (conn && conn.username) {
        const { username } = conn;
        activeConnections.delete(connId);

        // Clean up any active calls the user was in
        for (const roomId of Object.keys(activeCalls)) {
          const call = activeCalls[roomId];
          if (call && call.participants.includes(username)) {
            call.participants = call.participants.filter((p: string) => p !== username);
            if (call.participants.length <= 1) {
              delete activeCalls[roomId];
              broadcastToRoom(roomId, {
                type: "call:ended",
                roomId
              });
            } else {
              broadcastToRoom(roomId, {
                type: "call:participant_left",
                roomId,
                username,
                participants: call.participants
              });
            }
          }
        }

        broadcast({
          type: "user:presence",
          username,
          status: "offline"
        });
      } else {
        activeConnections.delete(connId);
      }
    });
  });

  function broadcast(payloadObj: any) {
    const raw = JSON.stringify(payloadObj);
    for (const { socket } of activeConnections.values()) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(raw);
      }
    }
  }

  function broadcastToRoom(roomId: string, payloadObj: any, excludeConnId?: string) {
    const room = rooms[roomId];
    if (!room) return;

    const raw = JSON.stringify(payloadObj);
    for (const [id, conn] of activeConnections.entries()) {
      if (excludeConnId && id === excludeConnId) continue;
      // For system rooms or groups, standard membership validation
      if (conn.username && (room.members.includes(conn.username) || roomId === "general" || roomId === "tech")) {
        if (conn.socket.readyState === WebSocket.OPEN) {
          conn.socket.send(raw);
        }
      }
    }
  }

  // Setup APIs
  app.use(express.json());

  // In-memory persistent user accounts
  const userAccounts: Record<string, {
    email: string;
    username: string;
    passwordHash: string;
    salt: string;
    avatar: string;
    rsaPublicKeyJwk: string;
    rsaPrivateKeyJwk: string;
  }> = {};

  // In-memory friendship system
  // Map of username (lowercase) to array of friend usernames (retaining exact case)
  const friendshipList: Record<string, string[]> = {};
  
  // Pending friend requests
  interface FriendRequest {
    id: string;
    sender: string;
    receiver: string;
    timestamp: number;
    status: "pending" | "accepted" | "declined";
  }
  const friendRequests: FriendRequest[] = [];

  function hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  }

  function generateSalt(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  // Registration endpoint
  app.post("/api/auth/register", (req, res) => {
    try {
      const { email, password, username, avatar, rsaPublicKeyJwk, rsaPrivateKeyJwk } = req.body;
      if (!email || !password || !username || !avatar) {
        return res.status(400).json({ error: "Missing required registration parameters." });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const normalizedUsername = username.trim().slice(0, 15);

      if (!normalizedEmail.includes("@")) {
        return res.status(400).json({ error: "Invalid email address format." });
      }

      // Check existing email
      if (userAccounts[normalizedEmail]) {
        return res.status(400).json({ error: "Email already registered." });
      }

      // Check unique username
      const usernameTaken = Object.values(userAccounts).some(
        u => u.username.toLowerCase() === normalizedUsername.toLowerCase()
      );
      if (usernameTaken) {
        return res.status(400).json({ error: "Username is already taken by another participant." });
      }

      // Hash securely
      const salt = generateSalt();
      const passwordHash = hashPassword(password, salt);

      userAccounts[normalizedEmail] = {
        email: normalizedEmail,
        username: normalizedUsername,
        passwordHash,
        salt,
        avatar,
        rsaPublicKeyJwk: rsaPublicKeyJwk || "none",
        rsaPrivateKeyJwk: rsaPrivateKeyJwk || "none"
      };

      res.json({
        success: true,
        user: {
          email: normalizedEmail,
          username: normalizedUsername,
          avatar,
          rsaPublicKeyJwk: rsaPublicKeyJwk || "none",
          rsaPrivateKeyJwk: rsaPrivateKeyJwk || "none"
        }
      });
    } catch (err) {
      console.error("Register API error:", err);
      res.status(500).json({ error: "Internal server error during registration." });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required credentials." });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const account = userAccounts[normalizedEmail];
      if (!account) {
        return res.status(400).json({ error: "No account found registered under this email." });
      }

      const candidateHash = hashPassword(password, account.salt);
      if (candidateHash !== account.passwordHash) {
        return res.status(400).json({ error: "Secure password combination does not match." });
      }

      res.json({
        success: true,
        user: {
          email: account.email,
          username: account.username,
          avatar: account.avatar,
          rsaPublicKeyJwk: account.rsaPublicKeyJwk,
          rsaPrivateKeyJwk: account.rsaPrivateKeyJwk
        }
      });
    } catch (err) {
      console.error("Login API error:", err);
      res.status(500).json({ error: "Internal server error during authentication." });
    }
  });

  // Update profile endpoint
  app.post("/api/auth/update-profile", (req, res) => {
    try {
      const { email, username, avatar, oldPassword, newPassword } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email parameter is required to identify identity." });
      }

      const normalizedEmail = email.trim().toLowerCase();
      let account = userAccounts[normalizedEmail];
      if (!account) {
        const { rsaPublicKeyJwk, rsaPrivateKeyJwk } = req.body;
        const salt = generateSalt();
        userAccounts[normalizedEmail] = {
          email: normalizedEmail,
          username: (username || "Participant").trim().slice(0, 15),
          passwordHash: hashPassword("sess-restore-fallback-pwd", salt),
          salt,
          avatar: avatar || "🦊",
          rsaPublicKeyJwk: rsaPublicKeyJwk || "none",
          rsaPrivateKeyJwk: rsaPrivateKeyJwk || "none"
        };
        account = userAccounts[normalizedEmail];
      }

      // Check password change request
      if (oldPassword && newPassword) {
        const currentHash = hashPassword(oldPassword, account.salt);
        if (currentHash !== account.passwordHash) {
          return res.status(400).json({ error: "Incorrect current password. Password was not updated." });
        }
        if (newPassword.length < 4) {
          return res.status(400).json({ error: "New password must be at least 4 characters long." });
        }
        // Save new password
        const newSalt = generateSalt();
        account.salt = newSalt;
        account.passwordHash = hashPassword(newPassword, newSalt);
      }

      if (username) {
        const newUsername = username.trim().slice(0, 15);
        if (newUsername.toLowerCase() !== account.username.toLowerCase()) {
          const usernameTaken = Object.values(userAccounts).some(
            u => u.email !== normalizedEmail && u.username.toLowerCase() === newUsername.toLowerCase()
          );
          if (usernameTaken) {
            return res.status(400).json({ error: "Requested username is already taken." });
          }
        }
        account.username = newUsername;
      }

      if (avatar) {
        account.avatar = avatar;
      }

      // Also proactively update metadata on the active Websocket connections if they exist
      for (const [_, c] of activeConnections.entries()) {
        if (c.username && c.username === account.username) {
          c.avatar = account.avatar;
        }
      }

      res.json({
        success: true,
        user: {
          email: account.email,
          username: account.username,
          avatar: account.avatar,
          rsaPublicKeyJwk: account.rsaPublicKeyJwk,
          rsaPrivateKeyJwk: account.rsaPrivateKeyJwk
        }
      });
    } catch (err) {
      console.error("Update Profile API error:", err);
      res.status(500).json({ error: "Internal server error during profile adjustments." });
    }
  });

  // Search users API
  app.post("/api/users/search", (req, res) => {
    try {
      const { query, currentUsername } = req.body;
      if (!currentUsername) return res.status(400).json({ error: "Current username is required." });
      const searchQuery = (query || "").trim().toLowerCase();
      
      const allUsers = Object.values(userAccounts).map(u => ({
        username: u.username,
        avatar: u.avatar,
        email: u.email
      }));
      
      const results = allUsers.filter(u => {
        if (u.username.toLowerCase() === currentUsername.toLowerCase()) return false;
        if (!searchQuery) return true; // Show all users if search query is empty
        return u.username.toLowerCase().includes(searchQuery) || u.email.toLowerCase().includes(searchQuery);
      });
      
      res.json({ success: true, users: results });
    } catch (err) {
      console.error("User search API error:", err);
      res.status(500).json({ error: "Internal server error during search." });
    }
  });

  // Send friend request API
  app.post("/api/friends/request/send", (req, res) => {
    try {
      const { sender, receiver } = req.body;
      if (!sender || !receiver) {
        return res.status(400).json({ error: "Sender and receiver are required." });
      }
      
      if (sender.toLowerCase() === receiver.toLowerCase()) {
        return res.status(400).json({ error: "You cannot add yourself as a friend." });
      }
      
      const receiverAccount = Object.values(userAccounts).find(
        u => u.username.toLowerCase() === receiver.toLowerCase()
      );
      if (!receiverAccount) {
         return res.status(404).json({ error: "Target user not found." });
      }
      
      const senderNorm = sender.toLowerCase();
      const receiverNorm = receiverAccount.username.toLowerCase();
      const currentFriends = friendshipList[senderNorm] || [];
      if (currentFriends.some(f => f.toLowerCase() === receiverNorm)) {
        return res.status(400).json({ error: "You are already friends with this user." });
      }
      
      const existingRequest = friendRequests.find(r => 
        r.status === "pending" && 
        ((r.sender.toLowerCase() === senderNorm && r.receiver.toLowerCase() === receiverNorm) ||
         (r.sender.toLowerCase() === receiverNorm && r.receiver.toLowerCase() === senderNorm))
      );
      
      if (existingRequest) {
        if (existingRequest.sender.toLowerCase() === receiverNorm) {
          return res.status(400).json({ error: "This user has already sent you a friend request. Check your pending requests." });
        } else {
          return res.status(400).json({ error: "A friend request is already pending for this user." });
        }
      }
      
      const newRequest: FriendRequest = {
        id: `freq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: sender,
        receiver: receiverAccount.username,
        timestamp: Date.now(),
        status: "pending"
      };
      
      friendRequests.push(newRequest);
      
      // Broadcast WebSocket notification so the companion gets an immediate alert
      broadcast({
        type: "friend:request_received",
        request: newRequest
      });
      
      res.json({ success: true, request: newRequest });
    } catch (err) {
      console.error("Send friend request error:", err);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Get friends and requests status
  app.get("/api/friends/status", (req, res) => {
    try {
      const username = req.query.username as string;
      if (!username) return res.status(400).json({ error: "Username parameter is required." });
      
      const usernameNorm = username.toLowerCase();
      const friends = friendshipList[usernameNorm] || [];
      
      const relatedRequests = friendRequests.filter(r => 
        r.sender.toLowerCase() === usernameNorm || r.receiver.toLowerCase() === usernameNorm
      );
      
      const detailedFriends = friends.map(fName => {
        const fAcc = Object.values(userAccounts).find(u => u.username.toLowerCase() === fName.toLowerCase());
        let isOnline = false;
        for (const c of activeConnections.values()) {
          if (c.username && c.username.toLowerCase() === fName.toLowerCase()) {
            isOnline = true;
            break;
          }
        }
        return {
          username: fAcc?.username || fName,
          avatar: fAcc?.avatar || "🦊",
          status: isOnline ? "online" : "offline"
        };
      });
      
      res.json({
        success: true,
        friends: detailedFriends,
        requests: relatedRequests
      });
    } catch (err) {
      console.error("Get friends status error:", err);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Accept friend request
  app.post("/api/friends/request/accept", (req, res) => {
    try {
      const { requestId, username } = req.body;
      if (!requestId || !username) {
        return res.status(400).json({ error: "Request ID and username are required." });
      }
      
      const reqIndex = friendRequests.findIndex(r => r.id === requestId && r.status === "pending");
      if (reqIndex === -1) {
        return res.status(404).json({ error: "Pending friend request not found." });
      }
      
      const request = friendRequests[reqIndex];
      if (request.receiver.toLowerCase() !== username.toLowerCase()) {
        return res.status(403).json({ error: "You can only accept requests sent to you." });
      }
      
      request.status = "accepted";
      
      const senderNorm = request.sender.toLowerCase();
      const receiverNorm = request.receiver.toLowerCase();
      
      if (!friendshipList[senderNorm]) friendshipList[senderNorm] = [];
      if (!friendshipList[senderNorm].includes(request.receiver)) {
        friendshipList[senderNorm].push(request.receiver);
      }
      
      if (!friendshipList[receiverNorm]) friendshipList[receiverNorm] = [];
      if (!friendshipList[receiverNorm].includes(request.sender)) {
        friendshipList[receiverNorm].push(request.sender);
      }
      
      // Automatically establish direct message room
      const roomName = `${request.sender} & ${request.receiver}`;
      const dmRoomId = `dm-${[request.sender, request.receiver].sort().join("-")}`.replace(/\s+/g, "").toLowerCase();
      
      if (!rooms[dmRoomId]) {
        rooms[dmRoomId] = {
          id: dmRoomId,
          name: roomName,
          isGroup: false,
          createdBy: "system",
          members: [request.sender, request.receiver],
          encryptedKeys: {}
        };
        messages[dmRoomId] = [];
      } else {
        if (!rooms[dmRoomId].members.includes(request.sender)) {
          rooms[dmRoomId].members.push(request.sender);
        }
        if (!rooms[dmRoomId].members.includes(request.receiver)) {
          rooms[dmRoomId].members.push(request.receiver);
        }
      }
      
      broadcast({
        type: "friend:request_accepted",
        request,
        room: rooms[dmRoomId]
      });
      
      res.json({ success: true, room: rooms[dmRoomId] });
    } catch (err) {
      console.error("Accept friend request error:", err);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Decline friend request
  app.post("/api/friends/request/decline", (req, res) => {
    try {
      const { requestId, username } = req.body;
      if (!requestId || !username) {
        return res.status(400).json({ error: "Request ID and username are required." });
      }
      
      const reqIndex = friendRequests.findIndex(r => r.id === requestId && r.status === "pending");
      if (reqIndex === -1) {
        return res.status(404).json({ error: "Pending friend request not found." });
      }
      
      const request = friendRequests[reqIndex];
      if (request.receiver.toLowerCase() !== username.toLowerCase() && request.sender.toLowerCase() !== username.toLowerCase()) {
        return res.status(403).json({ error: "Unauthorized action." });
      }
      
      request.status = "declined";
      
      broadcast({
        type: "friend:request_declined",
        request
      });
      
      res.json({ success: true });
    } catch (err) {
      console.error("Decline friend request error:", err);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Serve static assets or mount Vite handler
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Bootstrapping server failed:", err);
});

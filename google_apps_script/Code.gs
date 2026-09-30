/**
 * ==============================================================================
 * SECURE CHAT - FULL GOOGLE APPS SCRIPT BACKEND
 * ==============================================================================
 * Features:
 *  1. Auto-Initializes Google Sheet Tabs with headers, colors, and formatting.
 *  2. Auto-Creates Google Drive Folder ("SecureChat_Cloud_Drive") for Photos & Files.
 *  3. Stores User Accounts with Unique IDs, Timestamps, and JSON data.
 *  4. Uploads Photos, Voice Notes & Attachments to Drive, setting public links in Sheet.
 *  5. Synchronizes Real-Time Messages, Group Rooms, and Friend Requests.
 * ==============================================================================
 */

// Configuration Constants
const DRIVE_FOLDER_NAME = "SecureChat_Cloud_Drive";
const SHEET_ACCOUNTS = "Accounts";
const SHEET_MEDIA = "Media_Drive";
const SHEET_MESSAGES = "Messages";
const SHEET_ROOMS = "Rooms";
const SHEET_FRIENDS = "Friend_Requests";

/**
 * Main Web API Entry Point for POST requests
 */
function doPost(e) {
  try {
    // Ensure spreadsheet tabs & Drive folder are initialized
    initAutoSetup();

    let requestData = {};
    if (e && e.postData && e.postData.contents) {
      try {
        requestData = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        requestData = e.parameter || {};
      }
    } else if (e && e.parameter) {
      requestData = e.parameter;
    }

    const action = requestData.action || "test";
    let responsePayload = { success: false, error: "Unknown action" };

    switch (action) {
      case "ping":
      case "test":
      case "init":
        responsePayload = handleInitAction();
        break;

      case "register_user":
      case "save_user":
        responsePayload = handleRegisterUser(requestData);
        break;

      case "upload_media":
      case "upload_photo":
      case "upload_file":
        responsePayload = handleUploadMedia(requestData);
        break;

      case "save_message":
        responsePayload = handleSaveMessage(requestData);
        break;

      case "save_room":
        responsePayload = handleSaveRoom(requestData);
        break;

      case "sync_state":
      case "get_all_data":
        responsePayload = handleGetAllData();
        break;

      case "save_friend_request":
        responsePayload = handleSaveFriendRequest(requestData);
        break;

      default:
        responsePayload = { success: true, message: "Action received: " + action };
    }

    return ContentService.createTextOutput(JSON.stringify(responsePayload))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (globalErr) {
    const errorResponse = {
      success: false,
      error: globalErr.toString(),
      stack: globalErr.stack || ""
    };
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Main Web API Entry Point for GET requests
 */
function doGet(e) {
  try {
    initAutoSetup();
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : "status";

    if (action === "json" || action === "status") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const folder = getOrCreateDriveFolder();
      const payload = {
        success: true,
        service: "SecureChat Google Sheets & Drive API",
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        driveFolderId: folder.getId(),
        driveFolderUrl: folder.getUrl(),
        timestamp: new Date().toISOString()
      };
      return ContentService.createTextOutput(JSON.stringify(payload))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Default HTML Status page if opened directly in browser
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const folder = getOrCreateDriveFolder();
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>SecureChat Google Apps Script API</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; }
            .card { max-width: 600px; margin: 0 auto; background: #1e293b; padding: 2rem; border-radius: 1rem; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
            h1 { font-size: 1.5rem; color: #60a5fa; margin-top: 0; }
            .badge { display: inline-block; padding: 0.25rem 0.75rem; background: #059669; color: #ffffff; border-radius: 9999px; font-weight: bold; font-size: 0.75rem; }
            a { color: #38bdf8; text-decoration: none; word-break: break-all; }
            a:hover { text-decoration: underline; }
            .row { margin: 1rem 0; padding-bottom: 0.5rem; border-bottom: 1px solid #334155; }
            .label { font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
            .val { font-size: 0.95rem; margin-top: 0.25rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">API ACTIVE & READY</span>
            <h1>SecureChat Database & Drive Sync</h1>
            <p>Your Google Apps Script Web App is connected and automatically synchronizing user accounts, messages, rooms, and photos to Google Drive.</p>
            
            <div class="row">
              <div class="label">Google Spreadsheet</div>
              <div class="val"><a href="${ss.getUrl()}" target="_blank">Open Google Sheets Database ↗</a></div>
            </div>

            <div class="row">
              <div class="label">Google Drive Media Folder</div>
              <div class="val"><a href="${folder.getUrl()}" target="_blank">Open SecureChat_Cloud_Drive ↗</a></div>
            </div>

            <div class="row">
              <div class="label">Server Status</div>
              <div class="val">Connected & Dynamic Synced (${new Date().toLocaleString()})</div>
            </div>
          </div>
        </body>
      </html>
    `;
    return HtmlService.createHtmlOutput(html)
      .setTitle("SecureChat Google Apps Script API")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.toString());
  }
}

/**
 * --------------------------------------------------------------------------
 * HANDLERS FOR ACTIONS
 * --------------------------------------------------------------------------
 */

/**
 * Handle Account Registration & Profile Updates
 */
function handleRegisterUser(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ACCOUNTS) || createAccountsSheet(ss);
  
  const email = (data.email || "").toLowerCase().trim();
  const username = (data.username || "").trim();
  const rawJson = JSON.stringify(data);
  const now = new Date();
  const isoDate = now.toISOString();

  if (!username && !email) {
    return { success: false, error: "Missing required username or email." };
  }

  // Check if avatar is base64 image; if so, save it directly to Google Drive
  let avatarUrl = data.avatar || "";
  if (avatarUrl.startsWith("data:image")) {
    try {
      const uploadResult = saveBase64ToDrive(avatarUrl, "avatar_" + username + "_" + Date.now() + ".png", "image/png", username, "avatar");
      if (uploadResult && uploadResult.viewUrl) {
        avatarUrl = uploadResult.viewUrl;
      }
    } catch (avErr) {
      Logger.log("Avatar Drive save note: " + avErr);
    }
  }

  const values = sheet.getDataRange().getValues();
  let existingRowIndex = -1;

  for (let i = 1; i < values.length; i++) {
    const rowEmail = String(values[i][3] || "").toLowerCase().trim();
    const rowUsername = String(values[i][2] || "").toLowerCase().trim();
    if ((email && rowEmail === email) || (username && rowUsername === username.toLowerCase())) {
      existingRowIndex = i + 1; // 1-indexed row number
      break;
    }
  }

  let accountId = "";
  if (existingRowIndex > 0) {
    // Update existing user row
    accountId = sheet.getRange(existingRowIndex, 1).getValue();
    sheet.getRange(existingRowIndex, 2).setValue(isoDate);
    sheet.getRange(existingRowIndex, 3).setValue(username || values[existingRowIndex - 1][2]);
    sheet.getRange(existingRowIndex, 4).setValue(email || values[existingRowIndex - 1][3]);
    sheet.getRange(existingRowIndex, 5).setValue(avatarUrl || values[existingRowIndex - 1][4]);
    sheet.getRange(existingRowIndex, 6).setValue(data.statusMessage || "");
    sheet.getRange(existingRowIndex, 7).setValue(rawJson);
    sheet.getRange(existingRowIndex, 8).setValue(isoDate); // Last Active
  } else {
    // Create new account row with auto-increment ID
    const rowCount = values.length; // includes header
    accountId = "ACC-" + (1000 + rowCount);
    sheet.appendRow([
      accountId,
      isoDate,
      username,
      email,
      avatarUrl,
      data.statusMessage || "",
      rawJson,
      isoDate
    ]);
  }

  return {
    success: true,
    accountId: accountId,
    username: username,
    email: email,
    avatarUrl: avatarUrl,
    timestamp: isoDate
  };
}

/**
 * Handle Media / Photos / Voice / Files Upload to Google Drive + Record to Sheet
 */
function handleUploadMedia(data) {
  const base64Data = data.base64 || data.dataUrl || data.fileBase64 || data.ciphertext;
  const fileName = data.fileName || ("upload_" + Date.now() + ".bin");
  const mimeType = data.mimeType || data.mediaType || "application/octet-stream";
  const uploader = data.sender || data.username || "anonymous";
  const roomId = data.roomId || "general";

  if (!base64Data) {
    return { success: false, error: "Missing Base64 file payload." };
  }

  const uploadResult = saveBase64ToDrive(base64Data, fileName, mimeType, uploader, roomId);
  
  // Record in Media_Drive Sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mediaSheet = ss.getSheetByName(SHEET_MEDIA) || createMediaSheet(ss);
  const mediaId = "MED-" + (1000 + mediaSheet.getLastRow());
  const now = new Date().toISOString();

  mediaSheet.appendRow([
    mediaId,
    now,
    uploader,
    fileName,
    mimeType,
    uploadResult.fileSize,
    uploadResult.viewUrl,
    uploadResult.downloadUrl,
    uploadResult.fileId,
    roomId
  ]);

  return {
    success: true,
    mediaId: mediaId,
    fileId: uploadResult.fileId,
    fileUrl: uploadResult.viewUrl,
    downloadUrl: uploadResult.downloadUrl,
    fileName: fileName,
    fileSize: uploadResult.fileSize,
    mimeType: mimeType
  };
}

/**
 * Handle Chat Messages persistence
 */
function handleSaveMessage(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const msgSheet = ss.getSheetByName(SHEET_MESSAGES) || createMessagesSheet(ss);

  const message = data.message || data;
  const roomId = data.roomId || message.roomId || "general";
  const msgId = message.id || ("msg-" + Date.now());
  const timestamp = message.timestamp || Date.now();
  const dateStr = new Date(timestamp).toISOString();
  const sender = message.sender || "unknown";
  
  let msgType = "text";
  let content = message.ciphertext || "";
  let attachmentUrl = "";

  if (message.isMedia) {
    msgType = "image/file";
    attachmentUrl = message.ciphertext || "";
  } else if (message.isAudio) {
    msgType = "voice";
    attachmentUrl = message.ciphertext || "";
  } else if (message.isPoll) {
    msgType = "poll";
    content = message.pollQuestion || "Poll";
  }

  msgSheet.appendRow([
    msgId,
    timestamp,
    dateStr,
    roomId,
    sender,
    msgType,
    content.length > 500 ? content.slice(0, 500) + "... [Truncated]" : content,
    attachmentUrl.length > 500 ? "[Data/Drive URL]" : attachmentUrl,
    message.fileName || "",
    JSON.stringify(message.reactions || {}),
    JSON.stringify(message)
  ]);

  return { success: true, messageId: msgId, timestamp: timestamp };
}

/**
 * Handle Room persistence
 */
function handleSaveRoom(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roomSheet = ss.getSheetByName(SHEET_ROOMS) || createRoomsSheet(ss);

  const room = data.room || data;
  const roomId = room.id || ("room-" + Date.now());
  const now = new Date().toISOString();

  // Check if room exists
  const values = roomSheet.getDataRange().getValues();
  let existingIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(roomId)) {
      existingIndex = i + 1;
      break;
    }
  }

  const membersStr = Array.isArray(room.members) ? room.members.join(", ") : (room.members || "");

  if (existingIndex > 0) {
    roomSheet.getRange(existingIndex, 3).setValue(room.name || values[existingIndex - 1][2]);
    roomSheet.getRange(existingIndex, 4).setValue(room.isGroup ? "Group" : "DM");
    roomSheet.getRange(existingIndex, 6).setValue(membersStr);
    roomSheet.getRange(existingIndex, 7).setValue(room.privacy || "public");
    roomSheet.getRange(existingIndex, 8).setValue(JSON.stringify(room));
  } else {
    roomSheet.appendRow([
      roomId,
      now,
      room.name || "Channel",
      room.isGroup ? "Group" : "DM",
      room.createdBy || "system",
      membersStr,
      room.privacy || "public",
      JSON.stringify(room)
    ]);
  }

  return { success: true, roomId: roomId };
}

/**
 * Handle Friend Requests persistence
 */
function handleSaveFriendRequest(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const friendSheet = ss.getSheetByName(SHEET_FRIENDS) || createFriendsSheet(ss);

  const reqId = data.id || ("freq-" + Date.now());
  const sender = data.sender || "";
  const receiver = data.receiver || "";
  const status = data.status || "pending";
  const now = new Date().toISOString();

  friendSheet.appendRow([
    reqId,
    now,
    sender,
    receiver,
    status,
    now
  ]);

  return { success: true, requestId: reqId };
}

/**
 * Retrieve all state for initial hydration
 */
function handleGetAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const accSheet = ss.getSheetByName(SHEET_ACCOUNTS);
  const roomSheet = ss.getSheetByName(SHEET_ROOMS);
  const mediaSheet = ss.getSheetByName(SHEET_MEDIA);

  const accounts = [];
  if (accSheet) {
    const accRows = accSheet.getDataRange().getValues();
    for (let i = 1; i < accRows.length; i++) {
      accounts.push({
        id: accRows[i][0],
        username: accRows[i][2],
        email: accRows[i][3],
        avatar: accRows[i][4],
        statusMessage: accRows[i][5],
        lastActive: accRows[i][7]
      });
    }
  }

  const rooms = [];
  if (roomSheet) {
    const roomRows = roomSheet.getDataRange().getValues();
    for (let i = 1; i < roomRows.length; i++) {
      try {
        const parsed = JSON.parse(roomRows[i][7] || "{}");
        rooms.push(parsed);
      } catch (e) {
        rooms.push({
          id: roomRows[i][0],
          name: roomRows[i][2],
          isGroup: roomRows[i][3] === "Group",
          createdBy: roomRows[i][4],
          privacy: roomRows[i][6]
        });
      }
    }
  }

  return {
    success: true,
    accounts: accounts,
    rooms: rooms,
    serverTime: new Date().toISOString()
  };
}

/**
 * Test Connection & Initialization action
 */
function handleInitAction() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const folder = getOrCreateDriveFolder();
  return {
    success: true,
    message: "Google Sheets and Google Drive initialized successfully!",
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    driveFolderId: folder.getId(),
    driveFolderUrl: folder.getUrl(),
    sheets: [SHEET_ACCOUNTS, SHEET_MEDIA, SHEET_MESSAGES, SHEET_ROOMS, SHEET_FRIENDS],
    timestamp: new Date().toISOString()
  };
}

/**
 * --------------------------------------------------------------------------
 * GOOGLE DRIVE HELPER
 * --------------------------------------------------------------------------
 */

/**
 * Get or create the dedicated Google Drive folder
 */
function getOrCreateDriveFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    const folder = folders.next();
    try {
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}
    return folder;
  }
  const newFolder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
  try {
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}
  return newFolder;
}

/**
 * Save Base64 or Data URI string directly as a Google Drive File
 */
function saveBase64ToDrive(dataUriOrBase64, fileName, mimeType, uploader, roomId) {
  const folder = getOrCreateDriveFolder();
  
  let cleanBase64 = dataUriOrBase64;
  let detectedMime = mimeType || "application/octet-stream";

  if (dataUriOrBase64.indexOf(";base64,") > -1) {
    const parts = dataUriOrBase64.split(";base64,");
    detectedMime = parts[0].replace("data:", "");
    cleanBase64 = parts[1];
  }

  const decodedBytes = Utilities.base64Decode(cleanBase64);
  const blob = Utilities.newBlob(decodedBytes, detectedMime, fileName);
  
  const file = folder.createFile(blob);
  file.setDescription("Uploaded by @" + uploader + " in room #" + roomId + " on " + new Date().toISOString());
  
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    Logger.log("Sharing permission note: " + err);
  }

  const fileId = file.getId();
  const viewUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
  const downloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;

  return {
    fileId: fileId,
    viewUrl: viewUrl,
    downloadUrl: downloadUrl,
    fileSize: file.getSize()
  };
}

/**
 * --------------------------------------------------------------------------
 * AUTO-SETUP SHEET CREATORS & STYLERS
 * --------------------------------------------------------------------------
 */

/**
 * Auto-Setup function callable directly from Apps Script Editor or on first run
 */
function initAutoSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  createAccountsSheet(ss);
  createMediaSheet(ss);
  createMessagesSheet(ss);
  createRoomsSheet(ss);
  createFriendsSheet(ss);
  getOrCreateDriveFolder();
}

/**
 * 1. Accounts Sheet
 */
function createAccountsSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_ACCOUNTS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ACCOUNTS);
  }
  if (sheet.getLastRow() === 0) {
    const headers = [
      "Account ID",
      "Created / Updated",
      "Username",
      "Email Address",
      "Avatar / Drive Link",
      "Status Message",
      "Account JSON Data",
      "Last Active"
    ];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, "#1e3a8a", "#ffffff"); // Deep blue
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 140);
    sheet.setColumnWidth(4, 200);
    sheet.setColumnWidth(5, 220);
    sheet.setColumnWidth(6, 180);
    sheet.setColumnWidth(7, 250);
    sheet.setColumnWidth(8, 160);
  }
  return sheet;
}

/**
 * 2. Media_Drive Sheet
 */
function createMediaSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_MEDIA);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_MEDIA);
  }
  if (sheet.getLastRow() === 0) {
    const headers = [
      "Media ID",
      "Upload Time",
      "Uploader",
      "File Name",
      "MIME Type",
      "Size (Bytes)",
      "Drive View Link",
      "Drive Download Link",
      "Google Drive File ID",
      "Room ID"
    ];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, "#065f46", "#ffffff"); // Emerald green
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 140);
    sheet.setColumnWidth(4, 180);
    sheet.setColumnWidth(5, 140);
    sheet.setColumnWidth(6, 100);
    sheet.setColumnWidth(7, 240);
    sheet.setColumnWidth(8, 240);
    sheet.setColumnWidth(9, 180);
    sheet.setColumnWidth(10, 130);
  }
  return sheet;
}

/**
 * 3. Messages Sheet
 */
function createMessagesSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_MESSAGES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_MESSAGES);
  }
  if (sheet.getLastRow() === 0) {
    const headers = [
      "Message ID",
      "Timestamp (Unix)",
      "Date Time",
      "Room ID",
      "Sender",
      "Message Type",
      "Content / Preview",
      "Drive Attachment Link",
      "File Name",
      "Reactions JSON",
      "Full JSON Payload"
    ];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, "#4c1d95", "#ffffff"); // Indigo / purple
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(2, 130);
    sheet.setColumnWidth(3, 160);
    sheet.setColumnWidth(4, 130);
    sheet.setColumnWidth(5, 130);
    sheet.setColumnWidth(6, 110);
    sheet.setColumnWidth(7, 260);
    sheet.setColumnWidth(8, 220);
    sheet.setColumnWidth(9, 150);
    sheet.setColumnWidth(10, 150);
    sheet.setColumnWidth(11, 260);
  }
  return sheet;
}

/**
 * 4. Rooms Sheet
 */
function createRoomsSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_ROOMS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ROOMS);
  }
  if (sheet.getLastRow() === 0) {
    const headers = [
      "Room ID",
      "Created At",
      "Room Name",
      "Room Type",
      "Created By",
      "Members",
      "Privacy",
      "Full Room JSON"
    ];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, "#831843", "#ffffff"); // Rose
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(4, 100);
    sheet.setColumnWidth(5, 130);
    sheet.setColumnWidth(6, 200);
    sheet.setColumnWidth(7, 100);
    sheet.setColumnWidth(8, 250);
  }
  return sheet;
}

/**
 * 5. Friends Sheet
 */
function createFriendsSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_FRIENDS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_FRIENDS);
  }
  if (sheet.getLastRow() === 0) {
    const headers = [
      "Request ID",
      "Created At",
      "Sender",
      "Receiver",
      "Status",
      "Updated At"
    ];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, "#374151", "#ffffff"); // Slate
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 140);
    sheet.setColumnWidth(4, 140);
    sheet.setColumnWidth(5, 110);
    sheet.setColumnWidth(6, 160);
  }
  return sheet;
}

/**
 * Helper to apply styling to header row
 */
function formatHeaderRow(sheet, bgColor, textColor) {
  const range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setBackground(bgColor);
  range.setFontColor(textColor);
  range.setFontWeight("bold");
  range.setFontFamily("Arial");
  range.setHorizontalAlignment("center");
  range.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 35);
}

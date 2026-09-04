/**
 * Google Apps Script Cloud Sync Client Utility
 * Integrates directly with Google Sheets for tabular logging and Google Drive for cloud media storage.
 */

export interface AppsScriptStatus {
  connected: boolean;
  spreadsheetUrl?: string;
  spreadsheetId?: string;
  driveFolderUrl?: string;
  driveFolderId?: string;
  sheets?: string[];
  lastSync?: string;
  error?: string;
}

export interface UploadMediaResult {
  success: boolean;
  fileUrl?: string;
  downloadUrl?: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string;
}

/**
 * Upload a media file (Image, Document, Audio Voice Note) to Google Drive via Apps Script API
 */
export async function uploadMediaToGoogleDrive(
  dataUrlOrBase64: string,
  fileName: string,
  mimeType: string,
  uploader: string,
  roomId: string
): Promise<UploadMediaResult> {
  try {
    const res = await fetch("/api/appscript/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: dataUrlOrBase64,
        fileName,
        mimeType,
        uploader,
        roomId
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || "Failed to upload file to Google Drive"
      };
    }

    return {
      success: true,
      fileUrl: data.fileUrl,
      downloadUrl: data.downloadUrl,
      fileId: data.fileId,
      fileName: data.fileName,
      fileSize: data.fileSize,
      mimeType: data.mimeType
    };
  } catch (err: any) {
    console.warn("Google Drive upload via server proxy note:", err);
    return {
      success: false,
      error: err.message || "Failed to contact Google Drive upload service"
    };
  }
}

/**
 * Test connectivity and get current Google Sheet & Google Drive status
 */
export async function checkAppsScriptStatus(): Promise<AppsScriptStatus> {
  try {
    const res = await fetch("/api/appscript/status");
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      connected: false,
      error: err.message || "Unable to reach Apps Script status endpoint"
    };
  }
}

/**
 * Update the dynamic Apps Script URL
 */
export async function updateAppsScriptUrl(url: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch("/api/appscript/set-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to save Apps Script URL"
    };
  }
}

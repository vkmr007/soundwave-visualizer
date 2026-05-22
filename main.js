const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let fileWriteStream = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // Crucial so background recording doesn't stall
    },
    title: 'Soundwave Visualizer Studio',
    autoHideMenuBar: true,
    show: false
  });

  // Enable hardware acceleration and canvas rendering optimization
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-oop-rasterization');
  app.commandLine.appendSwitch('accelerated-2d-canvas');

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (fileWriteStream) {
      fileWriteStream.end();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for Native Dialogs and File operations
ipcMain.handle('dialog:openAudio', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Audio Song',
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  // Read file as base64 or pass file path. Passing data URI is easy for loading into audio element.
  const audioData = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1);
  const mimeType = ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`;
  const dataUri = `data:${mimeType};base64,${audioData.toString('base64')}`;

  return {
    path: filePath,
    name: path.basename(filePath),
    dataUri: dataUri
  };
});

ipcMain.handle('dialog:openBackground', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Background Image',
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const imgData = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1);
  const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const dataUri = `data:${mimeType};base64,${imgData.toString('base64')}`;

  return {
    path: filePath,
    name: path.basename(filePath),
    dataUri: dataUri
  };
});

ipcMain.handle('dialog:getSavePath', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Soundwave Video',
    defaultPath: path.join(app.getPath('videos'), 'soundwave-video.mp4'),
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'WebM Video', extensions: ['webm'] }
    ]
  });

  return result.canceled ? null : result.filePath;
});

ipcMain.handle('file:startWrite', async (event, savePath) => {
  try {
    if (fileWriteStream) {
      fileWriteStream.end();
    }
    fileWriteStream = fs.createWriteStream(savePath);
    return { success: true };
  } catch (error) {
    console.error('Error starting file write:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('file:writeChunk', async (event, chunkBuffer) => {
  return new Promise((resolve) => {
    if (!fileWriteStream) {
      resolve({ success: false, error: 'Write stream not initialized' });
      return;
    }
    // Write the Uint8Array buffer
    const buffer = Buffer.from(chunkBuffer);
    const result = fileWriteStream.write(buffer);

    if (result) {
      resolve({ success: true });
    } else {
      fileWriteStream.once('drain', () => {
        resolve({ success: true });
      });
    }
  });
});

ipcMain.handle('file:close', async () => {
  return new Promise((resolve) => {
    if (fileWriteStream) {
      fileWriteStream.end(() => {
        fileWriteStream = null;
        resolve({ success: true });
      });
    } else {
      resolve({ success: true });
    }
  });
});

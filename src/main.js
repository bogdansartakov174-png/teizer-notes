const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_FILE = path.join(app.getPath('userData'), 'teizer_notes.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch(e) {}
  return { notes: [], settings: { apiKey: '', theme: 'dark', fontSize: 14 } };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch(e) {}
}

let mainWindow;
let appData = loadData();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0c0c10',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', () => {
    saveData(appData);
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// IPC — notes
ipcMain.handle('get-data', () => appData);
ipcMain.handle('save-notes', (_, notes) => { appData.notes = notes; saveData(appData); return true; });
ipcMain.handle('save-settings', (_, settings) => { appData.settings = settings; saveData(appData); return true; });

// IPC — window controls
ipcMain.on('win-minimize', () => mainWindow.minimize());
ipcMain.on('win-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win-close', () => { saveData(appData); mainWindow.close(); });

// IPC — AI proxy (forward to Anthropic)
const https = require('https');
ipcMain.handle('ai-chat', async (_, { messages, apiKey }) => {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: 'Ты умный помощник внутри приложения для заметок Teizer Notes. Отвечай кратко и по делу. Можешь помогать с заметками: суммаризировать, улучшать текст, отвечать на вопросы. Отвечай на том же языке, на котором пишет пользователь.',
      messages
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: true, text: parsed.content?.[0]?.text || 'No response' });
        } catch(e) {
          resolve({ ok: false, error: 'Parse error' });
        }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
});

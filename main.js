const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,
    minWidth: 950,
    minHeight: 650,
    resizable: true,
    frame: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  mainWindow.loadFile('index.html');

  // 鍵盤焦點與標準複製貼上功能解鎖選單
  const template = [
    {
      label: '編輯',
      submenu: [
        { label: '復原', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪下', role: 'cut' },
        { label: '複製', role: 'copy' },
        { label: '貼上', role: 'paste' },
        { label: '全選', role: 'selectall' }
      ]
    },
    {
      label: '檢視',
      submenu: [
        { label: '重新載入', role: 'reload' },
        { label: '開發者工具', role: 'toggleDevTools' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// =================================================================
// 💡 動態獲取正確的 profiles 外部路徑
// =================================================================
function getProfilesPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'profiles');
  }
  return path.join(__dirname, 'profiles');
}

// =================================================================
// 核心自動化處理器
// =================================================================
ipcMain.on('action-trigger', (event, args) => {
  const { action, tpPath, profileKey, gameTargetDir } = args;
  const profilesRoot = getProfilesPath();

  // --- 【功能：打開原生 TP】 ---
  if (action === 'open-tp') {
    const { exec } = require('child_process');
    const relativeTpPath = tpPath.replace(/^profiles[/\\]/, '');
    const fullTpPath = path.join(profilesRoot, relativeTpPath);
    const tpDirectory = path.dirname(fullTpPath);
    
    if (!fs.existsSync(fullTpPath)) {
      console.error(`[Error] 找不到 TeknoParrot: ${fullTpPath}`);
      return;
    }
    exec(`"${fullTpPath}"`, { cwd: tpDirectory }, (error) => { if (error) console.error(error); });
  }

  // --- 💡【多版本相容：原生喚醒各版本專用 MaxiTerminal.exe】 ---
  if (action === 'open-maxi-terminal') {
    const { exec } = require('child_process');
    let terminalExePath = "";

    // 依據不同遊戲分流精準路徑
    if (profileKey === 'w6w') {
      terminalExePath = path.join(profilesRoot, 'w6w', 'MaxiTerminal', 'MaxiTerminal.exe');
    } else if (profileKey === 'w5p') {
      terminalExePath = path.join(profilesRoot, 'w5p', 'MaxiTerminal', 'MaxiTerminal.exe');
    } else if (profileKey === 'wm5') {
      // 依要求：專屬雙層路徑 wm5\MaxiTerminal\MaxiTerminal\MaxiTerminal.exe
      terminalExePath = path.join(profilesRoot, 'wm5', 'MaxiTerminal', 'MaxiTerminal', 'MaxiTerminal.exe');
    }

    const terminalDirectory = path.dirname(terminalExePath);

    if (!fs.existsSync(terminalExePath)) {
      console.error(`[Error] 找不到該版本的 MaxiTerminal 主程式！位置: ${terminalExePath}`);
      return;
    }

    // 第一步：強制把可能卡住的背景程序清場
    exec('taskkill /F /IM MaxiTerminal.exe', () => {
      console.log(`[Patch Clean] 後台舊端終端程序清理完成，開始建置新伺服器...`);

      // 第二步：使用 Windows 原生 cmd 獨立叫起
      const spawnCmd = `cmd /c start "" "${terminalExePath}"`;
      
      exec(spawnCmd, { cwd: terminalDirectory }, (error) => {
        if (error) console.error(`[Native Error] 啟動 MaxiTerminal 失敗:`, error.message);
      });
    });
  }

  // --- 【功能：原生喚醒解析度修改器】 ---
  if (action === 'open-resolution-patcher') {
    const { exec } = require('child_process');
    const patcherExePath = path.join(profilesRoot, 'Resolution', 'WMMT Resolution Patcher.exe');
    const patcherDirectory = path.dirname(patcherExePath);
    if (!fs.existsSync(patcherExePath)) return;
    exec(`"${patcherExePath}"`, { cwd: patcherDirectory }, (error) => { if (error) console.error(error); });
  }

  // --- 【功能：精準相容性補丁安裝 (XCOPY 碾壓唯讀保護)】 ---
  if (action === 'install-patch') {
    const { exec } = require('child_process');
    let cleanGameDir = gameTargetDir.replace(/['"]/g, '').trim();
    
    if (!path.isAbsolute(cleanGameDir)) { 
      event.reply('patch-response', { success: false, error: '請輸入正確的 Windows 絕對路徑' }); 
      return; 
    }
    if (fs.existsSync(cleanGameDir) && fs.lstatSync(cleanGameDir).isFile()) { 
      cleanGameDir = path.dirname(cleanGameDir); 
    }
    if (!fs.existsSync(cleanGameDir)) { 
      event.reply('patch-response', { success: false, error: `找不到該遊戲資料夾！` }); 
      return; 
    }

    // 流程 1：WM5 Nova 部署線路
    if (profileKey === 'wm5') {
      const fileSrc = path.join(profilesRoot, 'wm5', 'OpenBanaW5p.dll');
      const dirSrc = path.join(profilesRoot, 'wm5', 'AMCUS');
      const amcusTarget = path.join(cleanGameDir, 'AMCUS');
      
      exec(`xcopy "${fileSrc}" "${cleanGameDir}" /Y /R /I`, (err1) => {
        if (err1) { event.reply('patch-response', { success: false, error: err1.message }); return; }
        exec(`xcopy "${dirSrc}" "${amcusTarget}" /S /E /Y /R /I`, (err2) => {
          if (err2) event.reply('patch-response', { success: false, error: err2.message });
          else event.reply('patch-response', { success: true, message: '【WM5 Nova】相容性補丁已成功部署至遊戲目錄！' });
        });
      });
    } 
    // 流程 2：W6W 與 W5P 精準部署線路
    else if (profileKey === 'w6w' || profileKey === 'w5p') {
      const fileSrc = path.join(profilesRoot, profileKey, 'bngrw.dll');
      exec(`xcopy "${fileSrc}" "${cleanGameDir}" /Y /R /I`, (err) => {
        if (err) event.reply('patch-response', { success: false, error: err.message });
        else event.reply('patch-response', { success: true, message: `【${profileKey.toUpperCase()}】bngrw.dll 補丁已成功部署至遊戲目錄！` });
      });
    }
  }
});

// 外部社群連結開啟
ipcMain.on('open-link', (event, url) => { if (url) shell.openExternal(url); });
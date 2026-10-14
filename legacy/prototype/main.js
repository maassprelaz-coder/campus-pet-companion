const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let petWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => {
    app.quit();
  });
}
function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 120,
    height: 150,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      enableRemoteModule: true
    }
  });

  petWindow.loadFile('desktop-pet.html');
  petWindow.hide();

  // 关键：等窗口完全加载完成后，再发送宠物数据
petWindow.webContents.on('did-finish-load', () => {
  // 窗口加载完成后，注册监听请求
  ipcMain.on('request-pet-data', () => {
    mainWindow.webContents.send('get-pet-data');
  });
});
}

// 新增：接收主窗口发来的宠物数据，转发给桌宠窗口
ipcMain.on('send-pet-data-to-pet', (event, petInfo) => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet-updated', petInfo);
  }
});
// 切换桌宠模式
ipcMain.on('toggle-pet-mode', (event, isOpen) => {
  if (isOpen) {
    mainWindow.hide();
    petWindow.show();
  } else {
    petWindow.hide();
    mainWindow.show();
  }
});

// 同步宠物数据
ipcMain.on('sync-pet-data', (event, petInfo) => {
  petWindow.webContents.send('pet-updated', petInfo);
});

// 加金币
ipcMain.on('add-coins-to-main', (event, amount) => {
  mainWindow.webContents.send('coins-added', amount);
});

app.whenReady().then(() => {
  createMainWindow();
  createPetWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
// 监听桌宠窗口的加币请求
ipcMain.on('add-coins-to-main', (event, amount) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('coins-added', amount);
  }
});
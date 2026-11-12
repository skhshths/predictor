// Desktop shell for Tailwind Bay. Serves the game files through a private app:// scheme
// (ES modules will not load from file://) and opens them in a single window.
const { app, BrowserWindow, Menu, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
// Laptops with two GPUs should use the fast one.
app.commandLine.appendSwitch('force_high_performance_gpu');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 800, minHeight: 500, backgroundColor: '#0d1626', title: 'Tailwind Bay', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  // F11 toggles full screen. Alt+Enter does too.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'Enter' && input.alt))) { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadURL('app://game/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const rel = decodeURIComponent(new URL(request.url).pathname);
    const file = path.normalize(path.join(ROOT, rel === '/' ? 'index.html' : rel));
    if (!file.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());

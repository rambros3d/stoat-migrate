import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../../icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        title: "Discord Terminator"
    });

    // Start the Express server as a background process
    serverProcess = fork(path.join(__dirname, 'server.js'), [], {
        env: { ...process.env, PORT: 8001 }
    });

    // Handle port signaled from the server process
    serverProcess.on('message', (message) => {
        if (message.type === 'PORT_ALREADY') {
            console.log(`Desktop UI connecting to actual port: ${message.port}`);
            mainWindow.loadURL(`http://localhost:${message.port}`);
        }
    });

    // Fallback load if no message received within 5 seconds
    const fallbackTimeout = setTimeout(() => {
        if (mainWindow && !mainWindow.webContents.getURL()) {
            mainWindow.loadURL('http://localhost:8001');
        }
    }, 5000);

    mainWindow.on('closed', () => {
        clearTimeout(fallbackTimeout);
        mainWindow = null;
        if (serverProcess) serverProcess.kill();
    });
}

// Ensure the server process is killed when the app is quitting
app.on('will-quit', () => {
    if (serverProcess) serverProcess.kill();
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

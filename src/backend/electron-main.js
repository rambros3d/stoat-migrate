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
        env: { ...process.env, PORT: 8001 } // Use a different port if needed
    });

    // Give the server a second to start, then load the address
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:8001');
    }, 2000);

    mainWindow.on('closed', () => {
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

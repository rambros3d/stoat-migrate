import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { MigrationEngine } from './engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Get the directory paths
const BASE_DIR = path.resolve(__dirname, '../..');
const FRONTEND_DIST = path.join(BASE_DIR, 'src', 'frontend', 'dist');

// Middleware
app.use(cors());
app.use(express.json());

// Store active log streams
const logStreams = {};

// Health check endpoints
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Discord Terminator API',
        version: '2.0.0'
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        frontend_available: fs.existsSync(FRONTEND_DIST),
        api: 'operational'
    });
});

// Background task runner
async function runEngineTask(taskType, config, taskId) {
    const logCallback = async (msg) => {
        if (logStreams[taskId]) {
            for (const ws of logStreams[taskId]) {
                try {
                    if (ws.readyState === 1) { // OPEN
                        ws.send(msg);
                    }
                } catch (err) {
                    console.error('WebSocket send error:', err);
                }
            }
        }
    };

    const engine = new MigrationEngine({ dry_run: config.dry_run }, logCallback);

    try {
        if (taskType === 'clone') {
            await engine.runClone(
                config.discord_token,
                config.stoat_token,
                config.source_server_id,
                config.target_server_id
            );
            await logCallback('TASK_COMPLETE');
        } else if (taskType === 'migrate') {
            await engine.runMigration(
                config.discord_token,
                config.stoat_token,
                config.source_channel_id,
                config.target_channel_id,
                config.after_id
            );
        }
    } catch (err) {
        await logCallback(`Error: ${err.message}`);
        await logCallback('TASK_FAILED');
    }
}

// Bot info endpoints
app.post('/api/bot-info/discord', async (req, res) => {
    try {
        const { token } = req.body;
        const response = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bot ${token}` }
        });

        const user = response.data;
        const avatarUrl = user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
            : null;

        res.json({ name: user.username, avatar: avatarUrl });
    } catch (err) {
        res.json({ error: 'Invalid token' });
    }
});

app.post('/api/bot-info/stoat', async (req, res) => {
    try {
        const { token } = req.body;
        const response = await axios.get('https://api.stoat.chat/users/@me', {
            headers: { 'X-Bot-Token': token }
        });

        const user = response.data;
        let avatarUrl = null;
        if (user.avatar) {
            const tag = user.avatar.tag || 'attachments';
            avatarUrl = `https://cdn.stoatusercontent.com/${tag}/${user.avatar._id}/${user.avatar.filename}`;
        }

        res.json({ name: user.username, avatar: avatarUrl });
    } catch (err) {
        res.json({ error: 'Invalid token' });
    }
});

// Server info endpoints
app.post('/api/server-info/discord', async (req, res) => {
    try {
        const { token, server_id } = req.body;
        const response = await axios.get(`https://discord.com/api/v10/guilds/${server_id}`, {
            headers: { Authorization: `Bot ${token}` }
        });

        const guild = response.data;
        const iconUrl = guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
            : null;

        res.json({ name: guild.name, icon: iconUrl });
    } catch (err) {
        res.json({ error: 'Invalid server ID or token privileges' });
    }
});

app.post('/api/server-info/stoat', async (req, res) => {
    try {
        const { token, server_id } = req.body;
        const response = await axios.get(`https://api.stoat.chat/servers/${server_id}`, {
            headers: { 'X-Bot-Token': token }
        });

        const server = response.data;
        let iconUrl = null;
        if (server.icon) {
            const tag = server.icon.tag || 'attachments';
            iconUrl = `https://cdn.stoatusercontent.com/${tag}/${server.icon._id}/${server.icon.filename}`;
        }

        res.json({ name: server.name, icon: iconUrl });
    } catch (err) {
        res.json({ error: 'Invalid server ID or token privileges' });
    }
});

// List channels endpoints
app.post('/api/list-channels/discord', async (req, res) => {
    try {
        const { token, server_id } = req.body;
        const response = await axios.get(`https://discord.com/api/v10/guilds/${server_id}/channels`, {
            headers: { Authorization: `Bot ${token}` }
        });

        const channels = response.data;
        const filtered = channels
            .filter(c => c.type === 0 || c.type === 5)
            .map(c => ({ id: c.id, name: c.name, type: c.type }));

        res.json(filtered);
    } catch (err) {
        res.json({ error: 'Failed to fetch Discord channels' });
    }
});

app.post('/api/list-channels/stoat', async (req, res) => {
    try {
        const { token, server_id } = req.body;
        const serverResponse = await axios.get(`https://api.stoat.chat/servers/${server_id}`, {
            headers: { 'X-Bot-Token': token }
        });

        const server = serverResponse.data;
        const channelIds = server.channels || [];

        const channelPromises = channelIds.map(async (cid) => {
            try {
                const response = await axios.get(`https://api.stoat.chat/channels/${cid}`, {
                    headers: { 'X-Bot-Token': token }
                });
                return response.data;
            } catch {
                return null;
            }
        });

        const results = await Promise.all(channelPromises);
        const filtered = results
            .filter(c => c && c.channel_type === 'TextChannel')
            .map(c => ({ id: c._id, name: c.name || 'Unknown' }));

        res.json(filtered);
    } catch (err) {
        res.json({ error: `Stoat API Error ${err.response?.status || 500}` });
    }
});

// Channel preview endpoint
app.post('/api/channel-preview/discord', async (req, res) => {
    try {
        const { token, channel_id, after_id } = req.body;
        const headers = { Authorization: `Bot ${token}` };

        let msg;
        if (after_id) {
            const response = await axios.get(
                `https://discord.com/api/v10/channels/${channel_id}/messages/${after_id}`,
                { headers }
            );
            msg = response.data;
        } else {
            const response = await axios.get(
                `https://discord.com/api/v10/channels/${channel_id}/messages`,
                { headers, params: { limit: 1, after: '0' } }
            );
            const msgs = response.data;
            if (!msgs || msgs.length === 0) {
                return res.json({ error: 'Channel is empty' });
            }
            msg = msgs[0];
        }

        let count = 0;
        let currentBefore = null;
        let isTruncated = false;
        let oldestMsg = msg;

        while (count < 5000) {
            const params = { limit: 100 };
            if (currentBefore) params.before = currentBefore;

            try {
                const response = await axios.get(
                    `https://discord.com/api/v10/channels/${channel_id}/messages`,
                    { headers, params }
                );
                const batch = response.data;
                if (!batch || batch.length === 0) break;

                oldestMsg = batch[batch.length - 1];
                if (after_id) {
                    const foundIndex = batch.findIndex(m => m.id === after_id);
                    if (foundIndex >= 0) {
                        count += foundIndex + 1;
                        oldestMsg = batch[foundIndex];
                        break;
                    }
                }

                count += batch.length;
                currentBefore = batch[batch.length - 1].id;
            } catch {
                break;
            }
        }

        if (count >= 5000) isTruncated = true;

        res.json({
            date: oldestMsg.timestamp,
            author: oldestMsg.author.username,
            content: (oldestMsg.content || '').substring(0, 100),
            id: oldestMsg.id,
            link: `https://discord.com/channels/@me/${channel_id}/${oldestMsg.id}`,
            count,
            is_truncated: isTruncated
        });
    } catch (err) {
        res.json({ error: `Discord API Error: ${err.message}` });
    }
});

// Create channel endpoint
app.post('/api/channels/stoat', async (req, res) => {
    try {
        const { token, server_id, name, type = 'Text' } = req.body;
        const response = await axios.post(
            `https://api.stoat.chat/servers/${server_id}/channels`,
            { name, type },
            { headers: { 'X-Bot-Token': token } }
        );
        res.json(response.data);
    } catch (err) {
        const errorText = err.response?.data || err.message;
        res.json({ error: `Failed to create channel: ${err.response?.status} - ${errorText}` });
    }
});

// Task endpoints
app.post('/api/clone', async (req, res) => {
    const taskId = `clone_${Math.floor(Date.now() / 1000)}`;
    const config = req.body;
    runEngineTask('clone', config, taskId).catch(err => {
        console.error('Clone task error:', err);
    });
    res.json({ task_id: taskId, status: 'started' });
});

app.post('/api/migrate', async (req, res) => {
    const taskId = `migrate_${Math.floor(Date.now() / 1000)}`;
    const config = req.body;
    runEngineTask('migrate', config, taskId).catch(err => {
        console.error('Migration task error:', err);
    });
    res.json({ task_id: taskId, status: 'started' });
});

// Serve static frontend files
if (fs.existsSync(FRONTEND_DIST)) {
    app.use('/assets', express.static(path.join(FRONTEND_DIST, 'assets')));
    app.get('/favicon.png', (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'favicon.png')));
    app.get('/icon.png', (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'icon.png')));
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
}

// Start HTTP server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ App successfully started!`);
    console.log(`👉 Open http://localhost:${PORT} in your browser`);
    console.log('Press Ctrl+C to stop.');
});

// WebSocket server for real-time logs
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);
    if (pathname.startsWith('/ws/logs/')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', (ws, req) => {
    const pathParts = req.url.split('/');
    const taskId = pathParts[pathParts.length - 1];
    if (!logStreams[taskId]) logStreams[taskId] = [];
    logStreams[taskId].push(ws);
    console.log(`WebSocket connection opened for task: ${taskId}`);
    ws.on('close', () => {
        if (logStreams[taskId]) {
            const index = logStreams[taskId].indexOf(ws);
            if (index > -1) logStreams[taskId].splice(index, 1);
        }
        console.log(`WebSocket connection closed for task: ${taskId}`);
    });
    ws.on('error', (err) => console.error('WebSocket error:', err));
});

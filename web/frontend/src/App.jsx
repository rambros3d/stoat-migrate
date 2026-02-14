import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Server, MessageSquare, Terminal, Play, Trash2, Github, Edit3, Hash, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

const App = () => {
    const [config, setConfig] = useState(() => {
        const saved = localStorage.getItem('stoat_migrate_config');
        return saved ? JSON.parse(saved) : {
            discord_token: '',
            stoat_token: '',
            source_server_id: '',
            target_server_id: '',
            source_channel_id: '',
            target_channel_id: '',
            dry_run: true
        };
    });
    const [status, setStatus] = useState('idle'); // idle, running, success, error
    const [taskId, setTaskId] = useState(null);
    const [logs, setLogs] = useState([]);

    const [botInfos, setBotInfos] = useState({ discord: null, stoat: null });
    const [serverInfos, setServerInfos] = useState({ discord: null, stoat: null });

    const [isEditingToken, setIsEditingToken] = useState({ discord: false, stoat: false });
    const [isEditingServer, setIsEditingServer] = useState({ discord: false, stoat: false });

    const logEndRef = useRef(null);

    // Bot Info Effect
    useEffect(() => {
        if (config.discord_token.length > 50) fetchBotInfo('discord', config.discord_token);
        else setBotInfos(prev => ({ ...prev, discord: null }));

        if (config.stoat_token.length > 20) fetchBotInfo('stoat', config.stoat_token);
        else setBotInfos(prev => ({ ...prev, stoat: null }));
    }, [config.discord_token, config.stoat_token]);

    // Server Info Effect
    useEffect(() => {
        if (config.source_server_id && config.discord_token) {
            fetchServerInfo('discord', config.discord_token, config.source_server_id);
        } else setServerInfos(prev => ({ ...prev, discord: null }));

        if (config.target_server_id && config.stoat_token) {
            fetchServerInfo('stoat', config.stoat_token, config.target_server_id);
        } else setServerInfos(prev => ({ ...prev, stoat: null }));
    }, [config.source_server_id, config.target_server_id, config.discord_token, config.stoat_token]);

    const fetchBotInfo = async (platform, token) => {
        try {
            const res = await axios.post(`/api/bot-info/${platform}`, { token });
            if (!res.data.error) {
                setBotInfos(prev => ({ ...prev, [platform]: res.data }));
                setIsEditingToken(prev => ({ ...prev, [platform]: false }));
            } else {
                setBotInfos(prev => ({ ...prev, [platform]: null }));
                setIsEditingToken(prev => ({ ...prev, [platform]: true }));
            }
        } catch (err) {
            console.error(`Error fetching ${platform} bot info:`, err);
        }
    };

    const fetchServerInfo = async (platform, token, serverId) => {
        try {
            const res = await axios.post(`/api/server-info/${platform}`, { token, server_id: serverId });
            if (!res.data.error) {
                setServerInfos(prev => ({ ...prev, [platform]: res.data }));
                setIsEditingServer(prev => ({ ...prev, [platform]: false }));
            } else {
                setServerInfos(prev => ({ ...prev, [platform]: null }));
                setIsEditingServer(prev => ({ ...prev, [platform]: true }));
            }
        } catch (err) {
            console.error(`Error fetching ${platform} server info:`, err);
        }
    };

    useEffect(() => {
        localStorage.setItem('stoat_migrate_config', JSON.stringify(config));
    }, [config]);

    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const handleClearData = () => {
        if (window.confirm("Are you sure you want to clear all saved data? This cannot be undone.")) {
            localStorage.removeItem('stoat_migrate_config');
            setConfig({
                discord_token: '',
                stoat_token: '',
                source_server_id: '',
                target_server_id: '',
                source_channel_id: '',
                target_channel_id: '',
                dry_run: true
            });
            setBotInfos({ discord: null, stoat: null });
            setServerInfos({ discord: null, stoat: null });
            setIsEditingToken({ discord: true, stoat: true });
            setIsEditingServer({ discord: true, stoat: true });
            setLogs(['Data cleared.']);
        }
    };

    const connectWebSocket = (tid) => {
        const ws = new WebSocket(`ws://${window.location.host}/ws/logs/${tid}`);
        ws.onmessage = (event) => {
            setLogs(prev => [...prev, event.data]);
        };
        ws.onclose = () => console.log('Log stream finished');
    };

    const handleRun = async (type) => {
        setStatus('running');
        setLogs([]);
        try {
            const endpoint = type === 'clone' ? '/api/clone' : '/api/migrate';
            const res = await axios.post(endpoint, config);
            setTaskId(res.data.task_id);
            connectWebSocket(res.data.task_id);
        } catch (err) {
            setStatus('error');
            setLogs(prev => [...prev, `Error starting task: ${err.message}`]);
        }
    };

    const extractId = (input, platform, type) => {
        if (!input) return '';

        const discordGuildRegex = /(?:discord\.com|discordapp\.com)\/channels\/(\d+)/;
        const discordChannelRegex = /(?:discord\.com|discordapp\.com)\/channels\/\d+\/(\d+)/;
        const stoatServerRegex = /(?:revolt\.chat|stoat\.chat)\/server\/([A-Z0-9]+)/i;
        const stoatChannelRegex = /(?:revolt\.chat|stoat\.chat)\/channel\/([A-Z0-9]+)/i;

        let match;
        if (platform === 'discord') {
            if (type === 'server') match = input.match(discordGuildRegex);
            else if (type === 'channel') match = input.match(discordChannelRegex);
        } else if (platform === 'stoat') {
            if (type === 'server') match = input.match(stoatServerRegex);
            else if (type === 'channel') match = input.match(stoatChannelRegex);
        }

        return match ? match[1] : input;
    };

    const IdentityBadge = ({ info, platform, type, onEdit }) => (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: '#f8f9fa',
                padding: '12px 16px',
                borderRadius: '10px',
                border: '2px solid #edf2f7',
                marginBottom: '10px'
            }}
        >
            <div style={{ position: 'relative' }}>
                {(info.avatar || info.icon) ? (
                    <img src={info.avatar || info.icon} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} alt="identity" />
                ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#4a90e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>
                        {info.name[0].toUpperCase()}
                    </div>
                )}
                <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', background: '#27ae60', borderRadius: '50%', border: '2px solid #fff' }}></div>
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2d3436' }}>{info.name}</div>
                <div style={{ fontSize: '0.7rem', color: '#636e72', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{platform} {type}</div>
            </div>
            <button
                onClick={onEdit}
                style={{
                    background: 'rgba(74, 144, 226, 0.1)',
                    border: 'none',
                    color: '#4a90e2',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.7rem',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontWeight: 600
                }}
            >
                <Edit3 size={12} /> Change
            </button>
        </motion.div>
    );

    return (
        <div className="dashboard-container">
            <motion.h1
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="title"
            >
                Stoat Migrate Dashboard
            </motion.h1>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', width: '100%', maxWidth: '1400px' }}>
                {/* 1. Authentication */}
                <motion.div className="card glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
                        <Shield size={22} color="#4a90e2" />
                        <h2 style={{ fontSize: '1.1rem' }}>1. Authentication</h2>
                    </div>

                    {/* Discord Bot */}
                    <div className="form-group" style={{ minHeight: '80px' }}>
                        <label>Discord Bot Token</label>
                        <AnimatePresence mode="wait">
                            {(isEditingToken.discord || !botInfos.discord) ? (
                                <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <input
                                        type="password"
                                        placeholder="MTEyM..."
                                        value={config.discord_token}
                                        onChange={(e) => setConfig({ ...config, discord_token: e.target.value })}
                                    />
                                </motion.div>
                            ) : (
                                <IdentityBadge info={botInfos.discord} platform="Discord" type="Bot" onEdit={() => setIsEditingToken({ ...isEditingToken, discord: true })} />
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Stoat Bot */}
                    <div className="form-group" style={{ minHeight: '80px' }}>
                        <label>Stoat Bot Token</label>
                        <AnimatePresence mode="wait">
                            {(isEditingToken.stoat || !botInfos.stoat) ? (
                                <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <input
                                        type="password"
                                        placeholder="je89..."
                                        value={config.stoat_token}
                                        onChange={(e) => setConfig({ ...config, stoat_token: e.target.value })}
                                    />
                                </motion.div>
                            ) : (
                                <IdentityBadge info={botInfos.stoat} platform="Stoat" type="Bot" onEdit={() => setIsEditingToken({ ...isEditingToken, stoat: true })} />
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>

                {/* 2. Server Setup */}
                <motion.div className="card glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
                        <Server size={22} color="#4a90e2" />
                        <h2 style={{ fontSize: '1.1rem' }}>2. Server Setup</h2>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#636e72', marginTop: '-15px', marginBottom: '20px', fontWeight: 500 }}>
                        Paste a Server ID or a direct Channel/Server link
                    </p>

                    {/* Source Server */}
                    <div className="form-group" style={{ minHeight: '80px' }}>
                        <label>Source Server ID (Discord)</label>
                        <AnimatePresence mode="wait">
                            {(isEditingServer.discord || !serverInfos.discord) ? (
                                <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <input
                                        type="text"
                                        placeholder="10793..."
                                        value={config.source_server_id}
                                        onChange={(e) => setConfig({ ...config, source_server_id: extractId(e.target.value, 'discord', 'server') })}
                                    />
                                </motion.div>
                            ) : (
                                <IdentityBadge info={serverInfos.discord} platform="Discord" type="Server" onEdit={() => setIsEditingServer({ ...isEditingServer, discord: true })} />
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Target Server */}
                    <div className="form-group" style={{ minHeight: '80px' }}>
                        <label>Target Server ID (Stoat)</label>
                        <AnimatePresence mode="wait">
                            {(isEditingServer.stoat || !serverInfos.stoat) ? (
                                <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <input
                                        type="text"
                                        placeholder="01KHC..."
                                        value={config.target_server_id}
                                        onChange={(e) => setConfig({ ...config, target_server_id: extractId(e.target.value, 'stoat', 'server') })}
                                    />
                                </motion.div>
                            ) : (
                                <IdentityBadge info={serverInfos.stoat} platform="Stoat" type="Server" onEdit={() => setIsEditingServer({ ...isEditingServer, stoat: true })} />
                            )}
                        </AnimatePresence>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
                        <input type="checkbox" checked={config.dry_run} onChange={(e) => setConfig({ ...config, dry_run: e.target.checked })} style={{ width: 'auto' }} />
                        <label style={{ margin: 0, fontSize: '0.85rem' }}>Dry Run Mode</label>
                    </div>
                    <button className="btn btn-primary" onClick={() => handleRun('clone')} disabled={status === 'running'}>
                        <Play size={16} /> Clone Structure
                    </button>
                </motion.div>

                {/* 3. Channel Migration */}
                <motion.div className="card glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
                        <Hash size={22} color="#00cec9" />
                        <h2 style={{ fontSize: '1.1rem' }}>3. Channel Migration</h2>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#636e72', marginTop: '-15px', marginBottom: '20px', fontWeight: 500 }}>
                        Paste a Channel ID or a direct Channel link
                    </p>
                    <div className="form-group">
                        <label>Source Channel ID (Discord)</label>
                        <input
                            type="text"
                            placeholder="13285..."
                            value={config.source_channel_id}
                            onChange={(e) => setConfig({ ...config, source_channel_id: extractId(e.target.value, 'discord', 'channel') })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Target Channel ID (Stoat)</label>
                        <input
                            type="text"
                            placeholder="01KHC..."
                            value={config.target_channel_id}
                            onChange={(e) => setConfig({ ...config, target_channel_id: extractId(e.target.value, 'stoat', 'channel') })}
                        />
                    </div>
                    <div style={{ height: '37px' }}></div>
                    <button className="btn btn-primary" style={{ background: '#00cec9' }} onClick={() => handleRun('migrate')} disabled={status === 'running'}>
                        <MessageSquare size={16} /> Migrate History
                    </button>
                </motion.div>
            </div>

            {/* Console Output */}
            <motion.div
                className="card glass"
                style={{ maxWidth: '1400px', marginTop: '30px', padding: '20px' }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                    <Terminal size={20} color="#4a90e2" />
                    <h3 style={{ fontSize: '0.9rem', color: '#636e72', fontWeight: 600 }}>Live Console Output</h3>
                </div>
                <div className="log-window">
                    {logs.length === 0 && <div className="log-entry" style={{ color: '#888' }}>Ready. Start a task to see logs...</div>}
                    {logs.map((log, i) => (
                        <div key={i} className={`log-entry ${log.includes('ERROR') ? 'log-error' : log.includes('WARNING') ? 'log-warn' : 'log-info'}`}>
                            {log}
                        </div>
                    ))}
                    <div ref={logEndRef} />
                </div>
            </motion.div>

            <button className="btn btn-danger" onClick={handleClearData}>
                <Trash2 size={16} /> Clear Saved Data
            </button>
            <div style={{ marginTop: '20px', color: '#b2bec3', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Github size={14} /> <span>v1.3.0 • stoat-migrate.org</span>
            </div>
        </div>
    );
};

export default App;

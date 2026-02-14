import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Server, MessageSquare, Terminal, Play, Trash2, Github, Edit3, Hash } from 'lucide-react';
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
    const [isEditing, setIsEditing] = useState({ discord: false, stoat: false });
    const logEndRef = useRef(null);

    useEffect(() => {
        // Auto-fetch bot info if tokens look valid
        if (config.discord_token.length > 50) fetchBotInfo('discord', config.discord_token);
        else setBotInfos(prev => ({ ...prev, discord: null }));

        if (config.stoat_token.length > 20) fetchBotInfo('stoat', config.stoat_token);
        else setBotInfos(prev => ({ ...prev, stoat: null }));
    }, [config.discord_token, config.stoat_token]);

    const fetchBotInfo = async (platform, token) => {
        try {
            const res = await axios.post(`/api/bot-info/${platform}`, { token });
            if (!res.data.error) {
                setBotInfos(prev => ({ ...prev, [platform]: res.data }));
                setIsEditing(prev => ({ ...prev, [platform]: false }));
            } else {
                setBotInfos(prev => ({ ...prev, [platform]: null }));
                setIsEditing(prev => ({ ...prev, [platform]: true }));
            }
        } catch (err) {
            console.error(`Error fetching ${platform} bot info:`, err);
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
        if (window.confirm("Are you sure you want to clear all saved tokens and configuration? This cannot be undone.")) {
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
            setIsEditing({ discord: true, stoat: true });
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

    const TokenInput = ({ platform, label, placeholder }) => {
        const hasInfo = botInfos[platform];
        const editing = isEditing[platform] || !hasInfo;

        return (
            <div className="form-group" style={{ minHeight: '80px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ margin: 0 }}>{label}</label>
                    {hasInfo && !editing && (
                        <button
                            onClick={() => setIsEditing({ ...isEditing, [platform]: true })}
                            style={{
                                background: 'rgba(74, 144, 226, 0.1)',
                                border: 'none',
                                color: '#4a90e2',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.75rem',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontWeight: 600
                            }}
                        >
                            <Edit3 size={12} /> Change Token
                        </button>
                    )}
                </div>

                <AnimatePresence mode="wait">
                    {editing ? (
                        <motion.div
                            key="input"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                        >
                            <input
                                type="password"
                                placeholder={placeholder}
                                value={config[`${platform}_token`]}
                                onChange={(e) => setConfig({ ...config, [`${platform}_token`]: e.target.value })}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="badge"
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
                                border: '2px solid #edf2f7'
                            }}
                        >
                            <div style={{ position: 'relative' }}>
                                {hasInfo.avatar ? (
                                    <img src={hasInfo.avatar} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} alt="bot" />
                                ) : (
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#4a90e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>
                                        {hasInfo.name[0].toUpperCase()}
                                    </div>
                                )}
                                <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', background: '#27ae60', borderRadius: '50%', border: '2px solid #fff' }}></div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2d3436' }}>{hasInfo.name}</div>
                                <div style={{ fontSize: '0.7rem', color: '#636e72', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Logged in as {platform} bot</div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

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
                    <TokenInput platform="discord" label="Discord Bot Token" placeholder="MTEyM..." />
                    <TokenInput platform="stoat" label="Stoat Bot Token" placeholder="je89..." />
                </motion.div>

                {/* 2. Server Setup */}
                <motion.div className="card glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
                        <Server size={22} color="#4a90e2" />
                        <h2 style={{ fontSize: '1.1rem' }}>2. Server Setup</h2>
                    </div>
                    <div className="form-group">
                        <label>Source Server ID (Discord)</label>
                        <input
                            type="text"
                            placeholder="10793..."
                            value={config.source_server_id}
                            onChange={(e) => setConfig({ ...config, source_server_id: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Target Server ID (Stoat)</label>
                        <input
                            type="text"
                            placeholder="01KHC..."
                            value={config.target_server_id}
                            onChange={(e) => setConfig({ ...config, target_server_id: e.target.value })}
                        />
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
                    <div className="form-group">
                        <label>Source Channel ID (Discord)</label>
                        <input
                            type="text"
                            placeholder="13285..."
                            value={config.source_channel_id}
                            onChange={(e) => setConfig({ ...config, source_channel_id: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Target Channel ID (Stoat)</label>
                        <input
                            type="text"
                            placeholder="01KHC..."
                            value={config.target_channel_id}
                            onChange={(e) => setConfig({ ...config, target_channel_id: e.target.value })}
                        />
                    </div>
                    <div style={{ height: '37px' }}></div> {/* Spacer */}
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
                <Github size={14} /> <span>v1.2.0 • stoat-migrate.org</span>
            </div>
        </div>
    );
};

export default App;

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Server, MessageSquare, Terminal, Play, Trash2, Github, Edit3, Hash, CheckCircle2, ChevronRight, ChevronDown } from 'lucide-react';
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
    const [activeTab, setActiveTab] = useState('auth'); // auth, server, migration

    const [botInfos, setBotInfos] = useState({ discord: null, stoat: null });
    const [serverInfos, setServerInfos] = useState({ discord: null, stoat: null });
    const [channels, setChannels] = useState({ discord: [], stoat: [] });
    const [isFetchingChannels, setIsFetchingChannels] = useState({ discord: false, stoat: false });

    const [isEditingToken, setIsEditingToken] = useState({ discord: false, stoat: false });
    const [isEditingServer, setIsEditingServer] = useState({ discord: false, stoat: false });

    const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
    const [previewData, setPreviewData] = useState(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [customMessageLink, setCustomMessageLink] = useState('');
    const [messageLinkError, setMessageLinkError] = useState('');

    const logEndRef = useRef(null);

    useEffect(() => {
        if (config.discord_token.length > 50) fetchBotInfo('discord', config.discord_token);
        else setBotInfos(prev => ({ ...prev, discord: null }));

        if (config.stoat_token.length > 20) fetchBotInfo('stoat', config.stoat_token);
        else setBotInfos(prev => ({ ...prev, stoat: null }));
    }, [config.discord_token, config.stoat_token]);

    useEffect(() => {
        if (config.source_server_id && config.discord_token) {
            fetchServerInfo('discord', config.discord_token, config.source_server_id);
        } else setServerInfos(prev => ({ ...prev, discord: null }));

        if (config.target_server_id && config.stoat_token) {
            fetchServerInfo('stoat', config.stoat_token, config.target_server_id);
        } else setServerInfos(prev => ({ ...prev, stoat: null }));
    }, [config.source_server_id, config.target_server_id, config.discord_token, config.stoat_token]);

    // Fetch channels when migration tab becomes active
    useEffect(() => {
        if (activeTab === 'migration') {
            if (config.source_server_id && config.discord_token) fetchChannels('discord');
            if (config.target_server_id && config.stoat_token) fetchChannels('stoat');
        }
    }, [activeTab]);

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

    const fetchChannels = async (platform) => {
        setIsFetchingChannels(prev => ({ ...prev, [platform]: true }));
        try {
            const token = platform === 'discord' ? config.discord_token : config.stoat_token;
            const serverId = platform === 'discord' ? config.source_server_id : config.target_server_id;
            const res = await axios.post(`/api/list-channels/${platform}`, { token, server_id: serverId });
            if (Array.isArray(res.data)) {
                setChannels(prev => ({ ...prev, [platform]: res.data }));
            } else {
                setChannels(prev => ({ ...prev, [platform]: [] }));
            }
        } catch (err) {
            console.error(`Error fetching ${platform} channels:`, err);
            setChannels(prev => ({ ...prev, [platform]: [] }));
        } finally {
            setIsFetchingChannels(prev => ({ ...prev, [platform]: false }));
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
            setActiveTab('auth');
            setLogs(['Data cleared.']);
        }
    };

    const connectWebSocket = (tid) => {
        const ws = new WebSocket(`ws://${window.location.host}/ws/logs/${tid}`);
        ws.onmessage = (event) => {
            const data = event.data;

            // Robust parsing for signals within formatted logs
            const progressMatch = data.match(/PROGRESS:(\d+)\/(\d+)/);
            if (progressMatch) {
                const curr = parseInt(progressMatch[1]);
                const total = parseInt(progressMatch[2]);
                setProgress({ current: curr, total, percent: Math.round((curr / total) * 100) });
            }

            if (data.includes('TASK_COMPLETE') || data.includes('TASK_FAILED')) {
                setStatus(data.includes('TASK_COMPLETE') ? 'success' : 'error');
                setProgress(prev => ({ ...prev, percent: 100 }));
                ws.close();
            } else {
                setLogs(prev => [...prev, data]);
            }
        };
        ws.onclose = () => {
            console.log('Log stream finished');
            // Ensure status is success if we didn't get TASK_COMPLETE but closed normally
            setStatus(prev => prev === 'running' ? 'success' : prev);
        };
        ws.onerror = (err) => {
            console.error('WebSocket Error:', err);
            setStatus('error');
        };
    };

    const handleRun = async (type) => {
        if (type === 'migrate' && !showConfirmation && config.target_channel_id !== 'CREATE_NEW') {
            try {
                const res = await axios.post('/api/channel-preview/discord', {
                    token: config.discord_token,
                    channel_id: config.source_channel_id
                });
                if (res.data.error) throw new Error(res.data.error);
                setPreviewData(res.data);
                setShowConfirmation(true);
                setCustomMessageLink('');
                setMessageLinkError('');
                return;
            } catch (err) {
                alert(`Error fetching preview: ${err.message}`);
                return;
            }
        }

        let afterId = null;
        if (customMessageLink) {
            const match = customMessageLink.match(/channels\/\d+\/\d+\/(\d+)/);
            if (match) afterId = match[1];
        }

        setShowConfirmation(false);
        setStatus('running');
        setProgress({ current: 0, total: 0, percent: 0 });
        setLogs([]);
        try {
            let finalConfig = { ...config, after_id: afterId };

            if (type === 'migrate' && config.target_channel_id === 'CREATE_NEW') {
                const sourceChannel = channels.discord.find(c => c.id === config.source_channel_id);
                const channelName = sourceChannel ? sourceChannel.name : 'new-channel';

                setLogs(prev => [...prev, `Creating new Stoat channel: #${channelName}...`]);

                const res = await axios.post('/api/channels/stoat', {
                    token: config.stoat_token,
                    server_id: config.target_server_id,
                    name: channelName
                });

                if (res.data.error) throw new Error(res.data.error);

                const newChannelId = res.data._id;
                setLogs(prev => [...prev, `Created channel #${channelName} (ID: ${newChannelId})`]);

                finalConfig.target_channel_id = newChannelId;

                // Update local state for UI consistency
                setConfig(prev => ({ ...prev, target_channel_id: newChannelId }));
                fetchChannels('stoat');
            }

            const endpoint = `/api/${type}`;
            const res = await axios.post(endpoint, finalConfig);
            setTaskId(res.data.task_id);
            connectWebSocket(res.data.task_id);
        } catch (err) {
            setStatus('error');
            setLogs(prev => [...prev, `Error starting task: ${err.message}`]);
        }
    };

    const extractId = (input, platform, type) => {
        if (!input || typeof input !== 'string') return input;

        // Discord Regex
        const discordGuildRegex = /discord(?:app)?\.com\/channels\/(\d+)/;
        const discordChannelRegex = /discord(?:app)?\.com\/channels\/\d+\/(\d+)/;

        // Stoat/Revolt Regex (Support app.stoat.chat, revolt.chat, etc)
        const stoatServerRegex = /(?:revolt\.chat|stoat\.chat)\/server\/([A-Z0-9]+)/i;
        const stoatChannelRegex = /(?:revolt\.chat|stoat\.chat)\/channel\/([A-Z0-9]+)/i;

        let match;
        if (platform === 'discord') {
            match = input.match(type === 'server' ? discordGuildRegex : discordChannelRegex);
        } else {
            match = input.match(type === 'server' ? stoatServerRegex : stoatChannelRegex);
        }

        return match ? match[1] : input;
    };

    const IdentityBadge = ({ info, platform, type, onEdit }) => (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f8f9fa', padding: '12px 16px', borderRadius: '10px', border: '2px solid #edf2f7', marginBottom: '10px' }}>
            <div style={{ position: 'relative' }}>
                {(info.avatar || info.icon) ? (
                    <img src={info.avatar || info.icon} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} alt="identity" />
                ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#4a90e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>{info.name?.[0]?.toUpperCase() || '?'}</div>
                )}
                <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', background: '#27ae60', borderRadius: '50%', border: '2px solid #fff' }}></div>
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2d3436' }}>{info.name}</div>
                <div style={{ fontSize: '0.7rem', color: '#636e72', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{platform} {type}</div>
            </div>
            <button onClick={onEdit} style={{ background: 'rgba(74, 144, 226, 0.1)', border: 'none', color: '#4a90e2', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', padding: '4px 8px', borderRadius: '6px', fontWeight: 600 }}><Edit3 size={12} /> Change</button>
        </motion.div>
    );

    const TabButton = ({ id, label, icon: Icon, color }) => {
        const isDisabled = (id === 'server' && (!botInfos.discord || !botInfos.stoat)) ||
            (id === 'migration' && (!serverInfos.discord || !serverInfos.stoat));

        return (
            <button
                onClick={() => !isDisabled && setActiveTab(id)}
                className={`tab-btn ${activeTab === id ? 'active' : ''}`}
                disabled={isDisabled}
                style={{
                    '--tab-color': color,
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '16px',
                    border: 'none',
                    background: 'none',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: activeTab === id ? color : '#636e72',
                    borderBottom: `3px solid ${activeTab === id ? color : 'transparent'}`,
                    transition: 'all 0.3s ease',
                    opacity: isDisabled ? 0.4 : 1
                }}
            >
                <Icon size={18} />
                {label}
                {((id === 'auth' && botInfos.discord && botInfos.stoat) ||
                    (id === 'server' && serverInfos.discord && serverInfos.stoat)) && (
                        <CheckCircle2 size={14} color="#27ae60" />
                    )}
            </button>
        );
    };

    return (
        <div className="dashboard-container">
            <motion.h1 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="title">Discord Terminator</motion.h1>

            <div className="card glass" style={{ width: '100%', maxWidth: '800px', padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid #edf2f7', background: 'rgba(255,255,255,0.5)' }}>
                    <TabButton id="auth" label="1. Auth" icon={Shield} color="#4a90e2" />
                    <TabButton id="server" label="2. Server" icon={Server} color="#a29bfe" />
                    <TabButton id="migration" label="3. Migration" icon={Hash} color="#00cec9" />
                </div>

                <div style={{ padding: '30px' }}>
                    <AnimatePresence mode="wait">
                        {activeTab === 'auth' && (
                            <motion.div key="auth" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
                                    <Shield size={22} color="#4a90e2" />
                                    <h2 style={{ fontSize: '1.2rem' }}>Bot Authentication</h2>
                                </div>
                                <div className="form-group" style={{ minHeight: '80px' }}>
                                    <label>Discord Bot Token</label>
                                    <AnimatePresence mode="wait">
                                        {(isEditingToken.discord || !botInfos.discord) ? (
                                            <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <input type="password" placeholder="MTEyM..." value={config.discord_token} onChange={(e) => setConfig({ ...config, discord_token: e.target.value })} />
                                            </motion.div>
                                        ) : (
                                            <IdentityBadge info={botInfos.discord} platform="Discord" type="Bot" onEdit={() => setIsEditingToken({ ...isEditingToken, discord: true })} />
                                        )}
                                    </AnimatePresence>
                                </div>
                                <div className="form-group" style={{ minHeight: '80px' }}>
                                    <label>Stoat Bot Token</label>
                                    <AnimatePresence mode="wait">
                                        {(isEditingToken.stoat || !botInfos.stoat) ? (
                                            <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <input type="password" placeholder="je89..." value={config.stoat_token} onChange={(e) => setConfig({ ...config, stoat_token: e.target.value })} />
                                            </motion.div>
                                        ) : (
                                            <IdentityBadge info={botInfos.stoat} platform="Stoat" type="Bot" onEdit={() => setIsEditingToken({ ...isEditingToken, stoat: true })} />
                                        )}
                                    </AnimatePresence>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => setActiveTab('server')}
                                        disabled={!botInfos.discord || !botInfos.stoat}
                                        style={{ width: 'auto', padding: '10px 25px' }}
                                    >
                                        Next: Server Setup <ChevronRight size={18} />
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'server' && (
                            <motion.div key="server" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                    <Server size={22} color="#a29bfe" />
                                    <h2 style={{ fontSize: '1.2rem' }}>Server Setup</h2>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#636e72', marginBottom: '25px' }}>Paste a Server ID or a direct Channel/Server link</p>

                                <div className="form-group" style={{ minHeight: '80px' }}>
                                    <label>Source Server (Discord)</label>
                                    <AnimatePresence mode="wait">
                                        {(isEditingServer.discord || !serverInfos.discord) ? (
                                            <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <input type="text" placeholder="10793..." value={config.source_server_id} onChange={(e) => setConfig({ ...config, source_server_id: extractId(e.target.value, 'discord', 'server') })} />
                                            </motion.div>
                                        ) : (
                                            <IdentityBadge info={serverInfos.discord} platform="Discord" type="Server" onEdit={() => setIsEditingServer({ ...isEditingServer, discord: true })} />
                                        )}
                                    </AnimatePresence>
                                </div>
                                <div className="form-group" style={{ minHeight: '80px' }}>
                                    <label>Target Server (Stoat)</label>
                                    <AnimatePresence mode="wait">
                                        {(isEditingServer.stoat || !serverInfos.stoat) ? (
                                            <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <input type="text" placeholder="01KHC..." value={config.target_server_id} onChange={(e) => setConfig({ ...config, target_server_id: extractId(e.target.value, 'stoat', 'server') })} />
                                            </motion.div>
                                        ) : (
                                            <IdentityBadge info={serverInfos.stoat} platform="Stoat" type="Server" onEdit={() => setIsEditingServer({ ...isEditingServer, stoat: true })} />
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '12px' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => handleRun('clone')}
                                        disabled={status === 'running' || !serverInfos.discord || !serverInfos.stoat}
                                        style={{ width: 'auto', padding: '10px 25px', background: '#a29bfe', color: '#fff' }}
                                    >
                                        <Server size={18} /> Clone Structure
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => setActiveTab('migration')}
                                        disabled={!serverInfos.discord || !serverInfos.stoat}
                                        style={{ width: 'auto', padding: '10px 25px' }}
                                    >
                                        Next: Migration <ChevronRight size={18} />
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'migration' && (
                            <motion.div key="migration" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                    <Hash size={22} color="#00cec9" />
                                    <h2 style={{ fontSize: '1.2rem' }}>Channel Migration</h2>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#636e72', marginBottom: '25px' }}>Select channels or paste IDs to start synchronization</p>

                                <div className="form-group">
                                    <label>Source Channel (Discord)</label>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <input
                                            type="text"
                                            placeholder="Channel ID or Link"
                                            value={config.source_channel_id}
                                            onChange={(e) => setConfig({ ...config, source_channel_id: extractId(e.target.value, 'discord', 'channel') })}
                                            style={{ flex: '1 1 50%' }}
                                        />
                                        <select
                                            style={{ flex: '1 1 50%', borderRadius: '10px', border: '2px solid #edf2f7', padding: '0 12px', background: '#fff' }}
                                            value={config.source_channel_id}
                                            onChange={(e) => setConfig({ ...config, source_channel_id: e.target.value })}
                                            disabled={isFetchingChannels.discord || channels.discord.length === 0}
                                        >
                                            <option value="">
                                                {isFetchingChannels.discord ? 'Loading channels...' : channels.discord.length > 0 ? 'Quick Select Discord...' : 'No channels found'}
                                            </option>
                                            {channels.discord.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Target Channel (Stoat)</label>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <input
                                            type="text"
                                            placeholder="Channel ID or Link"
                                            value={config.target_channel_id}
                                            onChange={(e) => setConfig({ ...config, target_channel_id: extractId(e.target.value, 'stoat', 'channel') })}
                                            style={{ flex: '1 1 50%' }}
                                        />
                                        <select
                                            style={{ flex: '1 1 50%', borderRadius: '10px', border: '2px solid #edf2f7', padding: '0 12px', background: '#fff' }}
                                            value={config.target_channel_id}
                                            onChange={(e) => setConfig({ ...config, target_channel_id: e.target.value })}
                                            disabled={isFetchingChannels.stoat}
                                        >
                                            <option value="">
                                                {isFetchingChannels.stoat ? 'Loading channels...' : channels.stoat.length > 0 ? 'Quick Select Stoat...' : 'No channels found'}
                                            </option>
                                            <option value="CREATE_NEW" style={{ fontWeight: 600, color: '#a29bfe' }}>+ Create a new channel</option>
                                            {channels.stoat.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                    <input type="checkbox" checked={config.dry_run} onChange={(e) => setConfig({ ...config, dry_run: e.target.checked })} style={{ width: 'auto' }} />
                                    <label style={{ margin: 0, fontSize: '0.85rem' }}>Run a Test without copying</label>
                                </div>

                                <div style={{ display: 'flex', gap: '15px' }}>
                                    <button
                                        className="btn btn-primary"
                                        style={{ background: '#00cec9', flex: 1 }}
                                        onClick={() => handleRun('migrate')}
                                        disabled={status === 'running' || !config.source_channel_id || !config.target_channel_id}
                                    >
                                        <MessageSquare size={16} /> Start Migration
                                    </button>
                                </div>

                                {status === 'running' && (
                                    <div style={{ marginTop: '20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', color: '#636e72' }}>
                                            <span>Migration Progress</span>
                                            <span>{progress.percent}% ({progress.current}/{progress.total})</span>
                                        </div>
                                        <div style={{ height: '8px', background: '#edf2f7', borderRadius: '4px', overflow: 'hidden' }}>
                                            <motion.div
                                                style={{ height: '100%', background: '#00cec9' }}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${progress.percent}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <AnimatePresence>
                {showConfirmation && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="card glass" style={{ maxWidth: '450px', width: '90%', padding: '30px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                            <h3 style={{ marginBottom: '15px' }}>Confirm Migration</h3>
                            <p style={{ color: '#636e72', fontSize: '0.9rem', marginBottom: '20px' }}>
                                This will migrate messages from the selected channel starting from its first message.
                            </p>

                            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '10px', marginBottom: '25px', border: '1px solid #edf2f7' }}>
                                <div style={{ fontSize: '0.7rem', color: '#b2bec3', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>First Message Preview</div>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{previewData?.author}</div>
                                <div style={{ fontSize: '0.85rem', color: '#2d3436', marginBottom: '10px' }}>"{previewData?.content}..."</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <a href={previewData?.link} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#4a90e2', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        View on Discord <ChevronRight size={12} />
                                    </a>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#27ae60', background: 'rgba(39, 174, 96, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                                        {previewData?.count ? `${previewData.count}${previewData.is_truncated ? '+' : ''} messages` : 'Calculating...'}
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '25px' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#636e72', marginBottom: '8px', textTransform: 'uppercase' }}>Start from specific message (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="Paste Discord Message Link"
                                    value={customMessageLink}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setCustomMessageLink(val);
                                        if (!val) { setMessageLinkError(''); return; }

                                        const match = val.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
                                        if (match) {
                                            const [_, gid, cid, mid] = match;
                                            if (gid !== String(config.source_server_id)) {
                                                setMessageLinkError('Link is from a different server!');
                                            } else if (cid !== String(config.source_channel_id)) {
                                                setMessageLinkError('Link is from a different channel!');
                                            } else {
                                                setMessageLinkError('');
                                                // Trigger preview re-fetch
                                                axios.post('/api/channel-preview/discord', {
                                                    token: config.discord_token,
                                                    channel_id: config.source_channel_id,
                                                    after_id: mid
                                                }).then(res => {
                                                    if (!res.data.error) setPreviewData(res.data);
                                                });
                                            }
                                        } else {
                                            setMessageLinkError('Invalid Discord message link format');
                                        }
                                    }}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `2px solid ${messageLinkError ? '#ff7675' : '#edf2f7'}`, outline: 'none' }}
                                />
                                {messageLinkError && <div style={{ fontSize: '0.7rem', color: '#ff7675', marginTop: '4px', fontWeight: 600 }}>{messageLinkError}</div>}
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button className="btn btn-primary" style={{ background: '#00cec9' }} onClick={() => handleRun('migrate')} disabled={!!messageLinkError}>Confirm & Start</button>
                                <button className="btn btn-primary" style={{ background: '#eee', color: '#2d3436' }} onClick={() => setShowConfirmation(false)}>Cancel</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Console Output */}
            <motion.div className="card glass" style={{ maxWidth: '800px', width: '100%', padding: '20px' }} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                    <Terminal size={20} color="#4a90e2" />
                    <h3 style={{ fontSize: '0.9rem', color: '#636e72', fontWeight: 600 }}>Live Console Output</h3>
                </div>
                <div className="log-window" style={{ height: '300px' }}>
                    {logs.length === 0 && <div className="log-entry" style={{ color: '#888' }}>Ready. Start a task to see logs...</div>}
                    {logs.map((log, i) => <div key={i} className={`log-entry ${log.includes('ERROR') || log.includes('FAILED') ? 'log-error' : log.includes('SUCCESS') ? 'log-success' : 'log-info'}`}>{log}</div>)}
                    <div ref={logEndRef} />
                </div>
            </motion.div>

            <button className="btn btn-danger" onClick={handleClearData} style={{ marginTop: '40px' }}><Trash2 size={16} /> Clear Saved Data</button>
            <div style={{ marginTop: '20px', color: '#b2bec3', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Github size={14} /> <span>v2.0.0</span>
            </div>
        </div>
    );
};

export default App;

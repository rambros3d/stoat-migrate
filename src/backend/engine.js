import { Client, GatewayIntentBits, PermissionsBitField } from 'discord.js';
import axios from 'axios';
import FormData from 'form-data';

export class MigrationEngine {
    constructor(config, logCallback) {
        this.config = config;
        this.logCallback = logCallback;
        this.stoatApi = 'https://api.stoat.chat';
        this.stoatCdn = null;
        this.roleMap = {};
        this.channelMap = {};
        this.messageAuthorCache = {};
        this.avatarCache = {};
    }

    async log(message) {
        const timestamp = new Date().toISOString();
        const formattedMsg = `${timestamp} - INFO - ${message}`;
        await this.logCallback(formattedMsg);
    }

    async getStoatCdnUrl(token) {
        if (this.stoatCdn) return this.stoatCdn;

        try {
            const response = await axios.get(this.stoatApi, { timeout: 5000 });
            const cdnUrl = response.data?.features?.autumn?.url;
            if (cdnUrl) {
                this.stoatCdn = cdnUrl.replace(/\/$/, '');
                await this.log(`Detected Stoat CDN URL: ${this.stoatCdn}`);
                return this.stoatCdn;
            }
        } catch (err) {
            await this.log(`Failed to fetch CDN URL from API root: ${err.message}`);
        }

        this.stoatCdn = 'https://cdn.stoatusercontent.com';
        return this.stoatCdn;
    }

    async uploadToStoat(token, fileUrl, filename, tag = 'attachments') {
        if (this.config.dry_run) {
            await this.log(`[DRY RUN] Would upload ${filename} to Stoat CDN (${tag})`);
            return 'dry-run-file-id';
        }

        const cdnBase = await this.getStoatCdnUrl(token);

        try {
            // Download from Discord CDN
            const fileResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const fileData = Buffer.from(fileResponse.data);

            // Upload to Stoat CDN
            const form = new FormData();
            form.append('file', fileData, { filename });

            const response = await axios.post(`${cdnBase}/${tag}`, form, {
                headers: {
                    ...form.getHeaders(),
                    'X-Bot-Token': token
                }
            });

            return response.data.id;
        } catch (err) {
            await this.log(`Error uploading ${filename}: ${err.message}`);
            return null;
        }
    }

    async stoatRequest(token, method, path, jsonData = null) {
        const url = `${this.stoatApi}${path}`;
        const headers = { 'X-Bot-Token': token };

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const config = { headers };
                if (jsonData) config.data = jsonData;

                const response = await axios({ method, url, ...config });

                if (response.status === 200 || response.status === 201) {
                    return response.data;
                }
            } catch (err) {
                if (err.response?.status === 429) {
                    const retryAfter = (err.response.data?.retry_after || 1000) / 1000;
                    await this.log(`Rate limited. Waiting ${retryAfter}s...`);
                    await new Promise(resolve => setTimeout(resolve, (retryAfter + 0.1) * 1000));
                    continue;
                } else if (err.response?.status >= 500) {
                    await this.log(`Stoat API Gateway Error (${err.response.status}). Retrying in 2s...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                } else {
                    const error = err.response?.data || err.message;
                    await this.log(`Stoat API Error (${method} ${path}): ${err.response?.status} - ${error}`);
                    return null;
                }
            }
        }
        return null;
    }

    formatMessageContent(msg) {
        const parts = [];

        // 1. Handle Replies
        if (msg.reference && msg.reference.messageId) {
            const refId = msg.reference.messageId;
            const replyUser = this.messageAuthorCache[refId];
            parts.push(`> *Replying to ${replyUser || 'a message'}*`);
        }

        // 2. Rich Embeds (simplified - Discord.js handles embeds differently)
        if (msg.embeds && msg.embeds.length > 0) {
            for (const embed of msg.embeds) {
                if (embed.url && !msg.content?.includes(embed.url)) {
                    parts.push(embed.url);
                }
            }
        }

        // 3. Main Content
        if (msg.content) {
            parts.push(msg.content);
        }

        return parts.join('\n');
    }

    mapPermissions(discordPerms) {
        let stoatBits = 0;

        if (discordPerms.has(PermissionsBitField.Flags.ViewChannel)) stoatBits |= (1 << 20);
        if (discordPerms.has(PermissionsBitField.Flags.SendMessages)) stoatBits |= (1 << 22);
        if (discordPerms.has(PermissionsBitField.Flags.ManageMessages)) stoatBits |= (1 << 24);
        if (discordPerms.has(PermissionsBitField.Flags.ManageChannels)) stoatBits |= (1 << 2);
        if (discordPerms.has(PermissionsBitField.Flags.ManageRoles)) stoatBits |= (1 << 3);
        if (discordPerms.has(PermissionsBitField.Flags.Connect)) stoatBits |= (1 << 30);
        if (discordPerms.has(PermissionsBitField.Flags.Speak)) stoatBits |= (1 << 31);

        return stoatBits;
    }

    async getExistingStructure(token, serverId) {
        const server = await this.stoatRequest(token, 'GET', `/servers/${serverId}`);
        if (!server) return [{}, {}];

        const roles = {};
        if (server.roles) {
            for (const [rid, r] of Object.entries(server.roles)) {
                roles[r.name.toLowerCase()] = rid;
            }
        }

        const channelIds = server.channels || [];
        const channels = {};

        // Fetch channel details in parallel
        const channelPromises = channelIds.map(cid =>
            this.stoatRequest(token, 'GET', `/channels/${cid}`)
        );
        const results = await Promise.all(channelPromises);

        for (const c of results) {
            if (c && c.name) {
                channels[c.name.toLowerCase()] = c._id;
            }
        }

        return [roles, channels];
    }

    async runClone(discordToken, stoatToken, sourceId, targetId) {
        await this.log(`Starting cloning task for server ${sourceId} to ${targetId}`);

        const client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
        });

        return new Promise((resolve, reject) => {
            client.once('clientReady', async () => {
                try {
                    const guild = client.guilds.cache.get(sourceId.toString());
                    if (!guild) {
                        await this.log('Discord Guild not found.');
                        await client.destroy();
                        return resolve();
                    }

                    const [existingRoles, existingChannels] = await this.getExistingStructure(stoatToken, targetId);

                    // 1. Clone Roles
                    const sortedRoles = Array.from(guild.roles.cache.values())
                        .filter(r => !r.managed && r.id !== guild.id) // Skip @everyone and managed roles
                        .sort((a, b) => a.position - b.position);

                    for (const role of sortedRoles) {
                        const nameLower = role.name.toLowerCase();
                        if (existingRoles[nameLower]) {
                            this.roleMap[role.id] = existingRoles[nameLower];
                            continue;
                        }

                        if (this.config.dry_run) {
                            await this.log(`[DRY RUN] Would create role: ${role.name}`);
                            this.roleMap[role.id] = `dry_role_${role.id}`;
                            continue;
                        }

                        const res = await this.stoatRequest(stoatToken, 'POST', `/servers/${targetId}/roles`, {
                            name: role.name,
                            permissions: [this.mapPermissions(role.permissions), 0],
                            colour: role.color ? `#${role.color.toString(16).padStart(6, '0')}` : null,
                            hoist: role.hoist
                        });

                        if (res?.id) {
                            this.roleMap[role.id] = res.id;
                            await this.log(`Created role: ${role.name}`);
                        }
                    }

                    // 2. Clone Channels & Categories
                    const stoatCategories = [];
                    const categories = Array.from(guild.channels.cache.values())
                        .filter(c => c.type === 4) // Category type
                        .sort((a, b) => a.position - b.position);

                    for (const category of categories) {
                        const catChannels = [];
                        const children = Array.from(category.children.cache.values())
                            .sort((a, b) => a.position - b.position);

                        for (const channel of children) {
                            if (channel.type !== 0 && channel.type !== 2) continue; // Text or Voice

                            const nameLower = channel.name.toLowerCase();
                            if (existingChannels[nameLower]) {
                                const chanId = existingChannels[nameLower];
                                this.channelMap[channel.id] = chanId;
                                catChannels.push(chanId);
                                continue;
                            }

                            if (this.config.dry_run) {
                                await this.log(`[DRY RUN] Would create channel: ${channel.name} in ${category.name}`);
                                const chanId = `dry_chan_${channel.id}`;
                                this.channelMap[channel.id] = chanId;
                                catChannels.push(chanId);
                                continue;
                            }

                            const res = await this.stoatRequest(stoatToken, 'POST', `/servers/${targetId}/channels`, {
                                name: channel.name,
                                type: channel.type === 0 ? 'Text' : 'Voice',
                                description: channel.topic || null
                            });

                            if (res?._id) {
                                const chanId = res._id;
                                this.channelMap[channel.id] = chanId;
                                catChannels.push(chanId);
                                await this.log(`Created channel: ${channel.name}`);
                            }
                        }

                        if (catChannels.length > 0) {
                            stoatCategories.push({
                                id: Math.random().toString(36).substring(7),
                                title: category.name,
                                channels: catChannels
                            });
                        }
                    }

                    if (stoatCategories.length > 0 && !this.config.dry_run) {
                        await this.stoatRequest(stoatToken, 'PATCH', `/servers/${targetId}`, {
                            categories: stoatCategories
                        });
                    }

                    await this.log('Server structure cloning finished.');
                    await client.destroy();
                    resolve();
                } catch (err) {
                    await this.log(`Error in cloning: ${err.message}`);
                    await client.destroy();
                    reject(err);
                }
            });

            client.login(discordToken).catch(err => {
                this.log(`Failed to start Discord client: ${err.message}`);
                reject(err);
            });
        });
    }

    async runMigration(discordToken, stoatToken, sourceChan, targetChan, afterId = null) {
        await this.log(`Starting message migration from ${sourceChan} to ${targetChan}${afterId ? ' after ' + afterId : ''}`);

        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        return new Promise((resolve, reject) => {
            client.once('clientReady', async () => {
                try {
                    const channel = client.channels.cache.get(sourceChan.toString());
                    if (!channel) {
                        await this.log('Discord channel not found.');
                        await client.destroy();
                        return resolve();
                    }

                    let messages = [];

                    // Fetch starting message if afterId provided
                    if (afterId) {
                        try {
                            const startingMsg = await channel.messages.fetch(afterId.toString());
                            messages.push(startingMsg);
                            await this.log(`Including starting message: ${afterId}`);
                        } catch {
                            await this.log(`Starting message ${afterId} not found or inaccessible.`);
                        }
                    }

                    // Fetch messages
                    const fetchOptions = { limit: 100 };
                    if (afterId) fetchOptions.after = afterId.toString();

                    let lastId = afterId?.toString();
                    while (true) {
                        const opts = { limit: 100 };
                        if (lastId) opts.after = lastId;

                        const fetched = await channel.messages.fetch(opts);
                        if (fetched.size === 0) break;

                        const sorted = Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                        messages.push(...sorted);
                        lastId = sorted[sorted.length - 1].id;

                        if (fetched.size < 100) break;
                    }

                    await this.log(`Found ${messages.length} messages to migrate.`);

                    // Fetch threads
                    await this.log('Fetching threads from channel...');
                    const allThreads = [];

                    try {
                        // Active threads
                        const activeThreads = await channel.threads.fetchActive();
                        allThreads.push(...activeThreads.threads.values());
                        await this.log(`Found ${activeThreads.threads.size} active threads`);

                        // Archived threads
                        const archivedThreads = await channel.threads.fetchArchived({ fetchAll: true });
                        allThreads.push(...archivedThreads.threads.values());

                        await this.log(`Found ${allThreads.length} total threads (active + archived)`);

                        // Process each thread
                        for (const thread of allThreads) {
                            await this.log(`Processing thread: ${thread.name}`);
                            const threadMessages = [];

                            let lastThreadId = null;
                            while (true) {
                                const opts = { limit: 100 };
                                if (lastThreadId) opts.before = lastThreadId;

                                const fetched = await thread.messages.fetch(opts);
                                if (fetched.size === 0) break;

                                const sorted = Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                                threadMessages.push(...sorted);
                                lastThreadId = sorted[0].id;

                                if (fetched.size < 100) break;
                            }

                            if (threadMessages.length > 0) {
                                // Thread start marker
                                const startMarker = {
                                    content: `[THREAD: '${thread.name}']`,
                                    createdTimestamp: thread.createdTimestamp,
                                    author: { displayName: 'System', username: 'System', displayAvatarURL: () => '' },
                                    attachments: new Map(),
                                    embeds: [],
                                    reference: null,
                                    id: '0',
                                    isThreadMarker: true,
                                    isStart: true
                                };
                                messages.push(startMarker);

                                messages.push(...threadMessages);

                                // Thread end marker
                                const endMarker = {
                                    content: '[end of THREAD]',
                                    createdTimestamp: threadMessages[threadMessages.length - 1].createdTimestamp,
                                    author: { displayName: 'System', username: 'System', displayAvatarURL: () => '' },
                                    attachments: new Map(),
                                    embeds: [],
                                    reference: null,
                                    id: '0',
                                    isThreadMarker: true,
                                    isStart: false
                                };
                                messages.push(endMarker);

                                await this.log(`Added ${threadMessages.length} messages from thread '${thread.name}'`);
                            }
                        }
                    } catch (err) {
                        await this.log(`Error fetching threads: ${err.message}`);
                    }

                    // Sort all messages by timestamp
                    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                    await this.log(`Total messages to migrate (including threads): ${messages.length}`);
                    const total = messages.length;

                    let migratedCount = 0;
                    let firstMessageLink = null;

                    for (let idx = 0; idx < messages.length; idx++) {
                        const msg = messages[idx];

                        if (idx === 0 && msg.url) {
                            firstMessageLink = msg.url;
                        }

                        // Handle thread markers
                        if (msg.isThreadMarker) {
                            if (!this.config.dry_run) {
                                await this.stoatRequest(stoatToken, 'POST', `/channels/${targetChan}/messages`, {
                                    content: msg.content
                                });
                            }
                            await this.log(`PROGRESS:${idx + 1}/${total}`);
                            await this.log(`Sent thread marker: ${msg.content}`);
                            migratedCount++;
                            continue;
                        }

                        const authorName = msg.author.displayName || msg.author.username;
                        this.messageAuthorCache[msg.id] = authorName;

                        const formattedContent = this.formatMessageContent(msg);

                        // Handle attachments
                        const stoatAttachments = [];
                        if (msg.attachments && msg.attachments.size > 0) {
                            for (const [, att] of msg.attachments) {
                                const fileId = await this.uploadToStoat(stoatToken, att.url, att.name);
                                if (fileId) stoatAttachments.push(fileId);
                            }
                        }

                        // Generate timestamp and header
                        const timestamp = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').replace(/\.\d{3}Z/, ' UTC');
                        const header = `*${timestamp}*\n`;

                        let finalContent;
                        if (!formattedContent) {
                            if (stoatAttachments.length > 0) {
                                finalContent = header;
                            } else {
                                finalContent = header + '*(Attachment/Embed)*';
                            }
                        } else {
                            finalContent = header + formattedContent;
                        }

                        const masquerade = {
                            name: authorName.substring(0, 32),
                            avatar: msg.author.displayAvatarURL()
                        };

                        if (this.config.dry_run) {
                            await this.log(`PROGRESS:${idx + 1}/${total}`);
                            await this.log(`[DRY RUN] Would migrate message from ${authorName}`);
                            migratedCount++;
                            continue;
                        }

                        const payload = {
                            content: finalContent,
                            masquerade
                        };
                        if (stoatAttachments.length > 0) {
                            payload.attachments = stoatAttachments;
                        }

                        await this.stoatRequest(stoatToken, 'POST', `/channels/${targetChan}/messages`, payload);
                        migratedCount++;
                        await this.log(`PROGRESS:${idx + 1}/${total}`);
                    }

                    // Send summary message
                    if (migratedCount > 0) {
                        const summaryText = `[Discord Terminator](<https://github.com/rambros3d/discord-terminator>) has migrated **${migratedCount}** messages from #${channel.name}${firstMessageLink ? ` ([link](<${firstMessageLink}>))` : ''}`;
                        await this.stoatRequest(stoatToken, 'POST', `/channels/${targetChan}/messages`, { content: summaryText });
                    }

                    await this.log('Message migration finished.');
                    await this.log('TASK_COMPLETE');
                    await client.destroy();
                    resolve();
                } catch (err) {
                    await this.log(`Error in migration: ${err.message}`);
                    await this.log('TASK_FAILED');
                    await client.destroy();
                    reject(err);
                }
            });

            client.login(discordToken).catch(err => {
                this.log(`Failed to start Discord client: ${err.message}`);
                reject(err);
            });
        });
    }
}

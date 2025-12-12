const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class SessionManager {
    constructor() {
        this.sessions = new Map(); // sessionId -> socket instance
        this.sessionStatus = new Map(); // sessionId -> status string
        this.io = null;
    }

    setSocketIO(io) {
        this.io = io;
    }

    // Helper to emit logs to console and Socket.io
    emitLog(sessionId, message) {
        console.log(`[${sessionId}] ${message}`);
        if (this.io) {
            this.io.emit('log', { sessionId, message, timestamp: new Date().toISOString() });
        }
    }

    // Helper to update and emit status
    updateStatus(sessionId, status) {
        this.sessionStatus.set(sessionId, status);
        if (this.io) {
            this.io.emit('session_status', { sessionId, status });
        }
    }

    async initSession(id) {
        if (this.sessions.has(id)) {
            this.emitLog(id, 'Session already active. Returning existing session.');
            return this.sessions.get(id);
        }

        this.emitLog(id, 'Initializing session...');
        this.updateStatus(id, 'INITIALIZING');

        const sessionPath = path.join(__dirname, 'sessions', id);
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ["WAHA Clone", "Chrome", "1.0"],
            connectTimeoutMs: 60000,
        });

        this.sessions.set(id, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.updateStatus(id, 'WAITING_QR');
                this.emitLog(id, 'QR Code generated');
                if (this.io) {
                    this.io.emit('qr_code', { sessionId: id, qr });
                }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = reason !== DisconnectReason.loggedOut;

                // If the session was explicitly removed from the map (via deleteSession), do not reconnect.
                if (!this.sessions.has(id)) {
                    this.emitLog(id, 'Connection closed. Session was explicitly deleted. Not reconnecting.');
                    return;
                }

                this.emitLog(id, `Connection closed: ${reason}. Reconnecting: ${shouldReconnect}`);

                if (shouldReconnect) {
                    this.updateStatus(id, 'RECONNECTING');
                    this.sessions.delete(id);
                    this.initSession(id);
                } else {
                    this.updateStatus(id, 'DISCONNECTED');
                    this.sessions.delete(id);
                    this.emitLog(id, 'Session logged out or destroyed.');
                }
            } else if (connection === 'open') {
                this.updateStatus(id, 'CONNECTED');
                this.emitLog(id, 'Session connected successfully');
                if (this.io) {
                     this.io.emit('qr_code', { sessionId: id, qr: null });
                }
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify') {
                for (const msg of m.messages) {
                    if (!msg.key.fromMe) {
                        this.emitLog(id, `Message received from ${msg.key.remoteJid}`);
                        this.handleWebhook(id, msg);
                    }
                }
            }
        });

        return sock;
    }

    async deleteSession(id) {
        this.emitLog(id, 'Deleting session...');
        const sock = this.sessions.get(id);
        if (sock) {
            sock.end(undefined);
            this.sessions.delete(id);
        }
        this.sessionStatus.delete(id);

        const sessionPath = path.join(__dirname, 'sessions', id);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        this.emitLog(id, 'Session deleted and files removed.');
        if (this.io) {
            this.io.emit('session_status', { sessionId: id, status: 'DELETED' });
        }
    }

    async handleWebhook(sessionId, message) {
        const webhookUrl = process.env.WEBHOOK_URL;
        if (!webhookUrl) return;

        try {
            await axios.post(webhookUrl, {
                event: 'message',
                sessionId,
                message
            });
            this.emitLog(sessionId, `Webhook sent to ${webhookUrl}`);
        } catch (error) {
            this.emitLog(sessionId, `Webhook failed: ${error.message}`);
        }
    }

    async sendMessage(sessionId, to, text) {
        const sock = this.sessions.get(sessionId);
        if (!sock) {
            throw new Error('Session not found or not connected');
        }

        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        await sock.sendMessage(jid, { text });
        this.emitLog(sessionId, `Message sent to ${jid}`);
    }

    getAllSessions() {
        const sessions = [];
        for (const [id, status] of this.sessionStatus.entries()) {
            sessions.push({ id, status });
        }
        return sessions;
    }

    async restoreSessions() {
        const sessionsDir = path.join(__dirname, 'sessions');
        if (!fs.existsSync(sessionsDir)) return;

        const files = fs.readdirSync(sessionsDir);
        for (const file of files) {
            const fullPath = path.join(sessionsDir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                const sessionId = file;
                this.emitLog('SYSTEM', `Restoring session: ${sessionId}`);
                await this.initSession(sessionId);
            }
        }
    }
}

module.exports = new SessionManager();

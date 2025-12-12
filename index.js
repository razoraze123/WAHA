require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const sessionManager = require('./sessionManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

sessionManager.setSocketIO(io);
sessionManager.restoreSessions();

app.post('/sessions/init', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Session ID is required' });

    try {
        await sessionManager.initSession(id);
        res.json({ success: true, message: `Session ${id} initialization started` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/sessions/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await sessionManager.deleteSession(id);
        res.json({ success: true, message: `Session ${id} deleted` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/sessions', (req, res) => {
    const sessions = sessionManager.getAllSessions();
    res.json(sessions);
});

app.post('/messages/send', async (req, res) => {
    const { sessionId, to, text } = req.body;
    if (!sessionId || !to || !text) {
        return res.status(400).json({ error: 'Missing parameters (sessionId, to, text)' });
    }

    try {
        await sessionManager.sendMessage(sessionId, to, text);
        res.json({ success: true, message: 'Message sent' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

io.on('connection', (socket) => {
    console.log('Dashboard connected (Socket.io)');
    const sessions = sessionManager.getAllSessions();
    socket.emit('init_sessions', sessions);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

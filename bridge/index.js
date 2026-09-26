import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;
const SECRET = process.env.BRIDGE_SECRET || 'default_secret';

// 基础路由测试
app.get('/', (req, res) => res.send('SVAKOM Bridge is running!'));

// WebSocket 连接，等待你的本地 bridge.py 连上来
wss.on('connection', (ws) => {
    console.log('Local bridge connected!');
    
    // 接收来自 AI 的 HTTP 请求，转发给本地 bridge.py
    app.post('/command', express.json(), (req, res) => {
        const { secret, command } = req.body;
        if (secret !== SECRET) return res.status(403).send('Forbidden');
        
        if (ws.readyState === 1) {
            ws.send(JSON.stringify(command));
            res.send({ status: 'sent' });
        } else {
            res.status(500).send('Local bridge offline');
        }
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

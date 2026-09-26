import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;
const SECRET = process.env.BRIDGE_SECRET || "default_secret";

let localBridgeWs = null;

// 你的 Mac 本地 bridge.py 连上来的地方
wss.on("connection", (ws) => {
    console.log("Local bridge connected!");
    localBridgeWs = ws;
    ws.on("close", () => { localBridgeWs = null; });
});

// 让 AI 识别到 /mcp 路由
app.post("/mcp", (req, res) => {
    const authHeader = req.headers["authorization"];
    const urlSecret = new URL(req.url, `http://${req.headers.host}`).searchParams.get("secret");
    
    // 验证密码
    if (urlSecret !== SECRET && authHeader !== `Bearer ${SECRET}`) {
        return res.status(403).json({ error: "Forbidden" });
    }

    // 这里做了一个极简的 MCP 握手响应，让第三方软件以为已经连上了
    if (req.body && req.body.method === "initialize") {
        return res.json({
            jsonrpc: "2.0",
            id: req.body.id,
            result: {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "svakom-bridge", version: "1.0.0" }
            }
        });
    }

    // 如果 AI 要查看工具列表
    if (req.body && req.body.method === "tools/list") {
        return res.json({
            jsonrpc: "2.0",
            id: req.body.id,
            result: {
                tools: [{
                    name: "control_device",
                    description: "控制设备震动、频率等",
                    inputSchema: {
                        type: "object",
                        properties: {
                            command: { type: "string", description: "发送的指令，比如 'vibrate:50'" }
                        },
                        required: ["command"]
                    }
                }]
            }
        });
    }

    // 如果 AI 真的要执行控制
    if (req.body && req.body.method === "tools/call") {
        const command = req.body.params?.arguments?.command || "";
        if (localBridgeWs && localBridgeWs.readyState === 1) {
            localBridgeWs.send(JSON.stringify({ command }));
            return res.json({
                jsonrpc: "2.0",
                id: req.body.id,
                result: { content: [{ type: "text", text: `已发送指令: ${command}` }] }
            });
        } else {
            return res.json({
                jsonrpc: "2.0",
                id: req.body.id,
                result: { content: [{ type: "text", text: "本地蓝牙未连接，请确保电脑上跑着 bridge.py" }] }
            });
        }
    }

    // 默认响应
    res.json({ jsonrpc: "2.0", id: req.body?.id || null, result: {} });
});

app.get("/", (req, res) => res.send("SVAKOM MCP Bridge is running!"));
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

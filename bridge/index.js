import express from "express";
import http from "http";

const app = express();
app.use(express.json());
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;
const SECRET = process.env.BRIDGE_SECRET || "default_secret";

// 存储 AI 发来的待执行指令
let pendingCommands = [];

// 1. 接收 AI 发来的指令 (MCP协议)
app.post("/mcp", (req, res) => {
    const authHeader = req.headers["authorization"];
    const urlSecret = new URL(req.url, `http://${req.headers.host}`).searchParams.get("secret");
    
    if (urlSecret !== SECRET && authHeader !== `Bearer ${SECRET}`) {
        return res.status(403).json({ error: "Forbidden" });
    }

    // 处理 MCP 握手
    if (req.body && req.body.method === "initialize") {
        return res.json({
            jsonrpc: "2.0",
            id: req.body.id,
            result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "svakom-bridge", version: "1.0.0" } }
        });
    }

    // 列出工具
    if (req.body && req.body.method === "tools/list") {
        return res.json({
            jsonrpc: "2.0", id: req.body.id,
            result: { tools: [{ name: "control_device", description: "控制设备震动", inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } }] }
        });
    }

    // 执行控制指令，存入队列，等待本地 bridge.py 来取
    if (req.body && req.body.method === "tools/call") {
        const command = req.body.params?.arguments?.command || "";
        pendingCommands.push(command); // 存入队列
        console.log("收到AI指令，存入队列:", command);
        return res.json({
            jsonrpc: "2.0", id: req.body.id,
            result: { content: [{ type: "text", text: `指令已进入队列: ${command}，等待本地电脑获取` }] }
        });
    }

    res.json({ jsonrpc: "2.0", id: req.body?.id || null, result: {} });
});

// 2. 本地 bridge.py 轮询取指令的接口
app.get("/get_command", (req, res) => {
    const secret = req.query.secret;
    if (secret !== SECRET) return res.status(403).send("Forbidden");
    
    if (pendingCommands.length > 0) {
        const cmd = pendingCommands.shift(); // 取出第一条并删除
        console.log("本地电脑取走指令:", cmd);
        res.json({ command: cmd });
    } else {
        res.json({ command: null }); // 没有新指令
    }
});

app.get("/", (req, res) => res.send("SVAKOM Polling Bridge is running!"));
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

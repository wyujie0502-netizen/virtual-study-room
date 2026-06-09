# 📚 虚拟自习室 / 专注空间

线上陪伴式专注学习平台 — 支持多人在线自习、番茄钟计时、状态实时同步、专注数据统计与排行榜。

基于《虚拟自习室》软件需求文档 V2.0 完成的全栈项目。

---

## 🚀 快速启动

### 环境要求

- **Node.js** >= 18.x
- **npm** >= 9.x

### 1. 安装依赖

```bash
cd virtual-study-room

# 安装所有依赖（服务端 + 客户端）
cd server && npm install && cd ../client && npm install && cd ..
```

### 2. 启动项目

**方式一：分别启动两个终端**

```bash
# 终端 1 — 启动后端服务（端口 3001）
cd server
npm run dev

# 终端 2 — 启动前端开发服务器（端口 5173）
cd client
npm run dev
```

**方式二：一键启动（需先安装 concurrently）**

```bash
npm install concurrently
npm run dev
```

### 3. 访问应用

浏览器打开 **http://localhost:5173**

---

## 📂 项目结构

```
virtual-study-room/
├── package.json                 # 根配置
├── README.md                    # 本文档
├── server/                      # 后端服务
│   ├── package.json
│   ├── index.js                 # 入口：Express + Socket.io
│   ├── db.js                    # SQLite 数据库 + 预编译语句
│   ├── studyroom.db             # 数据库文件（自动生成）
│   ├── middleware/
│   │   └── auth.js              # JWT 认证中间件（HTTP + Socket）
│   ├── routes/
│   │   ├── auth.js              # 注册 / 登录 / 获取用户
│   │   ├── rooms.js             # 房间 CRUD / 加入 / 离开
│   │   └── stats.js             # 个人统计 / 排行榜
│   └── socket/
│       └── handlers.js          # WebSocket 事件处理
└── client/                      # 前端应用
    ├── package.json
    ├── index.html
    ├── vite.config.js           # Vite 配置（含 API 代理）
    ├── tailwind.config.js       # Tailwind CSS 配置
    ├── postcss.config.js
    └── src/
        ├── main.jsx             # React 入口
        ├── App.jsx              # 路由 + 认证守卫
        ├── index.css            # Tailwind + 全局样式
        ├── context/
        │   ├── AuthContext.jsx  # 用户认证上下文
        │   └── SocketContext.jsx # Socket 连接上下文
        ├── services/
        │   └── api.js           # Axios 实例（自动附带 Token）
        ├── utils/
        │   └── sounds.js        # 白噪音播放器（Web Audio API）
        ├── pages/
        │   ├── LoginPage.jsx    # 登录页
        │   ├── RegisterPage.jsx # 注册页
        │   ├── LobbyPage.jsx    # 房间大厅
        │   └── RoomPage.jsx     # 自习房间（核心页面）
        └── components/
            ├── Timer.jsx        # 番茄钟（进度环 + 按钮）
            ├── MemberList.jsx   # 成员列表（头像 + 状态）
            ├── ChatBox.jsx      # 聊天框（禁言逻辑）
            ├── Leaderboard.jsx  # 排行榜
            └── WhiteNoise.jsx   # 白噪音面板
```

---

## ✨ 已实现功能清单

| 需求 ID | 功能 | 状态 |
|---------|------|------|
| REQ-USER-001 | 昵称 + 密码注册 | ✅ |
| REQ-USER-002 | 昵称 + 密码登录 | ✅ |
| REQ-ROOM-001 | 创建公开房间 | ✅ |
| REQ-ROOM-002 | 创建私密房间（仅创建者可见） | ✅ |
| REQ-ROOM-003 | 加入公开房间 | ✅ |
| REQ-ROOM-004 | 房间人数上限 8 人 | ✅ |
| REQ-ROOM-005 | 展示成员头像、昵称、状态 | ✅ |
| REQ-STATE-001 | 三种状态：专注中 / 休息中 / 离线 | ✅ |
| REQ-STATE-002 | 用户主动退出 → 离线 | ✅ |
| REQ-STATE-003 | 断网 > 5 秒 → 离线 | ✅ |
| REQ-TIMER-001 | 全局统一番茄钟（25 分钟专注 + 5 分钟休息） | ✅ |
| REQ-TIMER-002 | 任意用户可启动番茄钟 | ✅ |
| REQ-TIMER-003 | 专注中禁止聊天（输入框置灰） | ✅ |
| REQ-TIMER-004 | 休息中允许发送文字消息 | ✅ |
| REQ-SYNC-001 | 状态同步延迟 ≤ 1 秒 | ✅ |
| REQ-SYNC-002 | 房间全局视图一致 | ✅ |
| REQ-SYNC-003 | 断网重连自动恢复状态 | ✅ |
| REQ-DATA-001 | 记录有效专注时长（在线才算） | ✅ |
| REQ-DATA-002 | 提供个人专注统计 | ✅ |
| REQ-DATA-003 | 房间排行榜每 10 秒刷新 | ✅ |
| REQ-AUDIO-001 | 白噪音开关 | ✅ |
| REQ-AUDIO-002 | 支持雨声、森林、咖啡厅三种音效 | ✅ |
| REQ-AUDIO-003 | 白噪音仅本地播放，不同步房间 | ✅ |
| REQ-AUDIO-004 | 退出房间自动停止播放 | ✅ |
| REQ-AUDIO-005 | 支持音量调节 | ✅ |

---

## 🔧 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + React Router 6 |
| 样式 | Tailwind CSS 3 |
| 构建工具 | Vite 6 |
| 后端框架 | Express 4 |
| 实时通信 | Socket.io 4 |
| 数据库 | SQLite (better-sqlite3) |
| 认证 | JWT + bcryptjs |
| 白噪音 | Web Audio API（无需外部音频文件） |

---

## 📝 设计说明

### 断网重连机制

- 客户端每 2 秒发送心跳（`heartbeat` 事件）
- 服务端超过 5 秒未收到心跳，标记用户为离线
- 客户端断开后 Socket.io 自动重连，重连后发送 `room:reconnect` 恢复完整状态
- 重连不补计离线期间的专注时长（符合需求 REQ-SYNC-003）

### 番茄钟

- 全局统一：一个房间只有一个番茄钟
- 任意用户可启动，仅启动者可取消
- 专注期 (25min)：强制禁言，所有在线成员自动切换为「专注中」
- 休息期 (5min)：禁言解除，成员切换为「休息中」
- 番茄钟为空闲 (idle) 时，用户可手动切换状态

### 白噪音

- 使用 Web Audio API 生成模拟白噪音，无需外部音频文件
- 雨声 = 白噪音，森林 = 粉红噪音，咖啡厅 = 低频过滤噪音
- 纯本地播放，状态不通过服务端同步
- 退出房间或关闭页面自动停止

### 数据持久化

- SQLite 数据库文件 `server/studyroom.db` 自动创建
- 专注会话（focus_sessions）记录每次有效的专注时段
- 排行榜基于该房间成员的累计专注秒数排序

---

## 🎯 使用流程

1. **注册** → 输入昵称和密码创建账户
2. **登录** → 进入房间大厅
3. **创建房间** → 可选择公开或私密
4. **加入房间** → 点击任意公开房间进入
5. **开始番茄钟** → 点击"开始 25 分钟专注"
6. **休息聊天** → 番茄钟结束后进入 5 分钟休息期，可发消息
7. **查看统计** → 点击"我的统计"查看累计专注时长
8. **白噪音** → 点击"白噪音"按钮选择背景音

---

## ⚠️ 注意事项

- 本项目为学习/演示用途，生产环境部署需额外配置：
  - 使用环境变量管理 JWT_SECRET
  - 使用 PostgreSQL 等生产级数据库
  - 添加 HTTPS 支持
  - 添加输入限流和防刷机制
- 私密房间仅创建者可见，不支持邀请机制
- 番茄钟固定 25+5，不可自定义
- 仅支持文字消息，不支持图片/文件

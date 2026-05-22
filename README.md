# VAD Live DJ Mixer（4301）

这个仓库是现场演出的 DJ / 音乐模块。它在本地固定运行于 `4301`，负责播放、编排、混音，并把音乐实时特征发送给 4300 总控，让 VJ 与多屏系统可以跟随音乐变化。

## 它在整套系统里的位置

| 模块 | 端口 | 关系 |
| --- | --- | --- |
| 4300 总控 API | `http://localhost:4300` | DJ 连接它，上报音频帧和工程状态 |
| 4301 DJ | `http://localhost:4301` | 当前模块 |
| 4302 VJ | `http://localhost:4302` | 通过 4300 接收 DJ 音频驱动 |
| 4303 baofa | `http://localhost:4303` | 通过 4300 接收多屏控制 |

核心链路：

```text
DJ 4301 -> mixer.audioFrame -> 4300 /ws -> VJ 4302
DJ 4301 -> module.statePatch -> 4300 Dashboard
```

## 启动

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:4301
```

生产验证：

```bash
npm run build
npm run preview
```

类型检查：

```bash
npm run lint
```

## 固定端口

Vite 配置固定为：

- `port: 4301`
- `host: 0.0.0.0`
- `strictPort: true`
- `hmr: false`

如果端口被占用，启动应该失败，而不是自动漂移。现场排查时这比自动换端口更安全。

## 连接 4300

本地默认配置：

```env
VITE_SHOW_TRANSPORT=websocket
VITE_SHOW_BACKEND_URL=http://localhost:4300
VITE_SHOW_WS_URL=ws://localhost:4300/ws
VITE_SHOW_ID=show-main
```

跨机器部署时，把 `localhost` 换成控制机 LAN IP：

```env
VITE_SHOW_BACKEND_URL=http://192.168.x.x:4300
VITE_SHOW_WS_URL=ws://192.168.x.x:4300/ws
```

端口保持不变。

## 音频帧协议

DJ 会向 4300 WebSocket 发布高频 `mixer.audioFrame`，用于驱动 VJ：

```json
{
  "type": "mixer.audioFrame",
  "sourceId": "dj-main",
  "level": 0.72,
  "rms": 0.48,
  "peak": 0.91,
  "frequencyBands": [0.1, 0.2, 0.8],
  "beat": 1,
  "activeStep": 12
}
```

4300 会把它归一化成 `/api/audio-summary`，并通过 WebSocket 转发给 VJ。

## 状态上报

DJ 也会低频发送 `module.statePatch`，让 4300 Dashboard 显示：

- 播放状态
- 当前工程 / preset
- BPM
- active step
- mixer slots
- FX 状态

## 与 VJ 配合

VJ 不直接连接 DJ。VJ 只连接 4300：

```text
DJ -> 4300 -> VJ
```

这样总控可以记录、监控、降级，并且可以把同一份音乐信号同时给多个 VJ screen 页面。

## 与 baofa 配合

DJ 不直接控制 baofa。baofa 的屏幕 owner、debug、menu、tree/firework 等状态都由 4300 统一控制。

## Token 说明

如果 4300 设置了 `CONTROL_TOKEN`，浏览器端可通过 `VITE_CONTROL_TOKEN` 连接。但注意：

- `VITE_` 变量会进入前端 bundle，不是秘密。
- 本地/LAN 演出时它适合作为共享口令，防止误连。
- 公网部署时不要把高权限 token 放在 `VITE_` 变量里。

## Vercel / 远程部署

这个模块可以作为静态页面部署，但默认 `localhost:4300` 在公网环境会指向访问者自己的机器，不会连接现场总控。

如需远程部署，必须显式配置公网可达的 4300 替代服务；现场演出仍推荐本机或同 LAN 运行。

## 开发注意

- 不要改成自动端口。
- 不要启用 HMR 作为现场模式默认值。
- `tasks/` 是本地任务记录目录，不提交。
- 若修改音频帧字段，同时更新 4300 的解析与测试。

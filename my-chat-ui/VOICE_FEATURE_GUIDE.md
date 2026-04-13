# Kimi-Audio 语音功能集成指南

## 功能概述

本项目已集成 **Kimi-Audio** 多模态语音功能，支持：

- ✅ **文本转语音 (TTS)**：将 AI 回复转换为自然语音
- ✅ **语音转文本 (ASR)**：语音输入转文字
- ✅ **多音色支持**：4种内置音色 + 可扩展语音包系统
- ✅ **实时对话**：支持流式语音合成

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                       │
├─────────────────────────────────────────────────────────────┤
│  VoiceInput (语音输入)  │  AudioPlayer (播放器)  │  VoicePack │
│  - 麦克风录音           │  - 播放控制             │  - 音色管理 │
│  - ASR 识别            │  - 进度显示             │  - 切换选择 │
└──────────┬──────────────────────────────────────────────────┘
           │ HTTP
┌──────────▼──────────────────────────────────────────────────┐
│                    Backend (Next.js API)                    │
├─────────────────────────────────────────────────────────────┤
│  /api/asr              │  /api/tts/preview                    │
│  - 语音转文本           │  - 文本转语音预览                     │
└──────────┬──────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────┐
│              Kimi-Audio Service (Moonshot AI)               │
├─────────────────────────────────────────────────────────────┤
│  TTS Model (kimi-audio-tts)  │  ASR Model (kimi-audio-asr)   │
│  - 4种内置音色                │  - 中文/英文识别               │
│  - 可调节语速/音调/音量        │  - 实时流式识别                │
└─────────────────────────────────────────────────────────────┘
```

## 文件结构

```
apps/agents/src/react-agent/
├── audio_service.ts          # Kimi-Audio 服务封装
├── tools.ts                  # 新增 text_to_speech / get_available_voices 工具
└── prompts.ts                # 更新系统提示词

apps/web/src/
├── components/
│   ├── thread/
│   │   ├── audio-player.tsx  # 音频播放组件
│   │   ├── voice-input.tsx   # 语音输入组件
│   │   └── index.tsx         # 集成语音按钮
│   └── voice-pack-manager.tsx # 语音包管理面板
├── app/api/
│   ├── asr/route.ts          # ASR API 路由
│   └── tts/preview/route.ts  # TTS 预览 API
```

## 环境变量配置

在 `.env` 文件中添加：

```bash
# Moonshot AI / Kimi API Key（用于文本对话、语音 TTS/ASR）
# 获取地址：https://platform.moonshot.cn/
MOONSHOT_API_KEY="your-api-key-here"
MOONSHOT_BASE_URL="https://api.moonshot.cn/v1"

# 兼容配置（复用同一个 Key）
KIMI_API_KEY="${MOONSHOT_API_KEY}"
OPENAI_API_KEY="${MOONSHOT_API_KEY}"
OPENAI_BASE_URL="${MOONSHOT_BASE_URL}"
```

## 内置音色列表

| 音色ID | 名称 | 描述 | 适用场景 |
|--------|------|------|----------|
| `default` | 默认音色 | 标准普通话女声 | 日常对话 |
| `warm` | 温暖女声 | 温柔亲切 | 情感交流、安慰 |
| `professional` | 专业男声 | 稳重专业 | 商务、正式场合 |
| `energetic` | 活力青年 | 充满活力 | 轻松话题、新闻 |

## 使用方式

### 1. 语音输入（ASR）

- 点击输入框旁的 🎤 麦克风按钮
- 开始说话，实时显示录音时长
- 点击停止，自动识别并填入文本框

### 2. 语音输出（TTS）

- AI 可以主动调用 `text_to_speech` 工具生成语音
- 或在回复中包含 `[播放语音]` 指令
- 生成的音频会显示为可播放的 AudioPlayer 组件

### 3. 音色切换

- 通过 `VoicePackManager` 组件管理音色
- 支持试听、切换、导入自定义语音包

## 扩展语音包

### 添加自定义音色

1. 准备音色模型文件（需支持 Kimi-Audio 格式）
2. 在 `audio_service.ts` 中注册：

```typescript
const customVoice: VoiceProfile = {
  id: "custom_voice_1",
  name: "自定义音色",
  description: "描述...",
  params: { speed: 1.0, pitch: 1.0, volume: 1.0, emotion: "neutral" },
  modelRef: "path/to/model.bin",
  isBuiltIn: false,
};

voiceManager.addVoicePack(customVoice, modelData);
```

### 音色参数说明

| 参数 | 范围 | 说明 |
|------|------|------|
| `speed` | 0.5 - 2.0 | 语速倍率 |
| `pitch` | 0.5 - 2.0 | 音调倍率 |
| `volume` | 0.5 - 2.0 | 音量倍率 |
| `emotion` | string | 情感风格标签 |

## API 端点

### ASR 语音识别

```http
POST /api/asr
Content-Type: multipart/form-data

Form Data:
  - audio: File (webm/mp3/wav)

Response:
  {
    "text": "识别结果文本",
    "success": true
  }
```

### TTS 语音合成预览

```http
POST /api/tts/preview
Content-Type: application/json

Body:
  {
    "text": "要合成的文本",
    "voiceId": "default"
  }

Response:
  - Binary audio data (audio/mpeg)
```

## 注意事项

1. **API Key**：需要有效的 Moonshot API Key，语音功能才能正常工作
2. **浏览器权限**：语音输入需要麦克风权限，请确保用户授权
3. **音频格式**：ASR 支持 webm/mp3/wav，TTS 输出 mp3
4. **跨域问题**：部分浏览器可能有 CORS 限制，下载功能已做降级处理

## 后续扩展

- [ ] 实时语音对话模式（WebRTC）
- [ ] 更多第三方语音包集成（如 ElevenLabs、Azure TTS）
- [ ] 语音克隆功能（基于少量样本生成个性化音色）
- [ ] 情感语音合成（更细腻的情感表达）

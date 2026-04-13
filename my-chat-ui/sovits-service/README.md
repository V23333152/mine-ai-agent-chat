# GPT-SoVITS TTS 服务

为 Agent Chat UI 提供语音合成功能。

## 📁 推荐目录结构

```
my-chat-ui/                          # 项目根目录
├── apps/
│   ├── web/                        # 前端
│   └── agents/                     # 后端
├── sovits-service/                 # TTS Python 服务 (当前目录)
├── sovits-models/                  # 角色模型目录
│   └── 芙宁娜_ZH/
│       ├── gpt.pth
│       ├── sovits.ckpt
│       └── reference/
└── GPT-SoVITS/                     # ← 克隆到这里 (与 sovits-service 同级)
    ├── GPT_SoVITS/                 # 核心代码
    ├── tools/                      # 工具脚本
    └── inference_webui.py          # Web UI 入口
```

## 🚀 快速开始

### 1. 克隆 GPT-SoVITS（推荐位置）

```bash
# 在项目根目录执行
cd d:\IT\AI智能体\my-chat-ui

# 克隆到推荐位置
git clone https://github.com/RVC-Boss/GPT-SoVITS.git
```

**为什么不放在其他位置？**
- ✅ 与 `sovits-service` 同级，便于导入
- ✅ 路径已在 `config.yaml` 中配置好
- ✅ 避免 Python 路径问题

### 2. 安装依赖

```bash
# 进入 GPT-SoVITS 目录
cd GPT-SoVITS

# 安装基础依赖
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# 安装其他依赖
pip install -r requirements.txt

# 额外安装中文支持
pip install cnstd cnocr
```

### 3. 配置 CUDA（如需要）

确保显卡驱动和 CUDA Toolkit 已安装：
- CUDA 11.8+ 或 12.1+
- cuDNN 8.9+

### 4. 启动 TTS 服务

```bash
# 回到 sovits-service 目录
cd ..\sovits-service

# 方法一：使用启动脚本（推荐）
start.bat

# 方法二：手动启动
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

服务将在 http://127.0.0.1:8080 启动

## 🔧 配置文件说明

`config.yaml`:

```yaml
service:
  host: "127.0.0.1"
  port: 8880

models:
  base_path: "../sovits-models"      # 角色模型目录

gpt_sovits_path: "../GPT-SoVITS"      # GPT-SoVITS 安装路径
```

## 📡 API 接口

### 文本转语音（GPT-SoVITS 本地模型）

```http
POST http://127.0.0.1:8080/tts
Content-Type: application/json

{
  "text": "你好，我是芙宁娜",
  "character": "芙宁娜_ZH",
  "emotion": "default",
  "speed": 1.0
}
```

### 文本转语音（千问 TTS - 支持长文本）

```http
POST http://127.0.0.1:8080/tts/qwen
Content-Type: application/json

{
  "text": "支持超过300字的长文本，自动分段合成...",
  "speed": 1.0
}
```

**长文本特性：**
- 超过300字的文本会自动分段
- 多段音频自动合并为一个文件
- 需要安装 `pydub` 以获得最佳合并效果：`pip install pydub`

### 获取角色列表

```http
GET http://127.0.0.1:8080/characters
```

## 🎙️ 前端使用

1. 启动前端：`pnpm dev`
2. 打开 http://localhost:5173
3. 在输入框旁开启 **"语音开"**
4. 选择角色 **"芙宁娜 (GPT-SoVITS)"**
5. 发送消息，AI 回复将自动语音播放

## ❓ 常见问题

### Q: 可以放在其他位置吗？
A: 可以，但需要修改 `config.yaml` 中的 `gpt_sovits_path`。

### Q: 没有显卡能用吗？
A: 可以，但速度很慢。建议使用 CPU 模式或浏览器 TTS 作为备用。

### Q: 如何添加新角色？
1. 训练模型得到 `.pth` 和 `.ckpt` 文件
2. 放入 `sovits-models/新角色名/`
3. 更新 `config.yaml` 添加角色配置

## 📚 参考链接

- [GPT-SoVITS 官方仓库](https://github.com/RVC-Boss/GPT-SoVITS)
- [GPT-SoVITS 使用教程](https://www.yuque.com/baicaigongchang1145haoyuangong/ib3g1e)

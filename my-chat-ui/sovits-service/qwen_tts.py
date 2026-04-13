"""
通义千问 TTS 代理模块（新版 qwen3-tts-flash）
支持长文本分段合成，使用内置系统音色
"""
import os
import uuid
import requests
import logging
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

QWEN_API_KEY = "sk-e40494c523b74914aa9e40114a29032e"
MAX_SEGMENT_LENGTH = 280

# 系统音色映射（友好名称 -> API参数）
# Cherry=芊悦(阳光积极), Serena=苏瑶(温柔), Ethan=晨煦(阳光男声)
AVAILABLE_VOICES = {
    "zhimeng": "Cherry",      # 映射原知萌 -> 芊悦（活泼女声）
    "zhida": "Cherry",        # 知达 -> 芊悦
    "serena": "Serena",       # 苏瑶（温柔女声）
    "ethan": "Ethan",         # 晨煦（阳光男声）
    "chelsie": "Chelsie",     # 千雪（二次元）
}


def split_text_into_segments(text: str, max_length: int = MAX_SEGMENT_LENGTH) -> List[str]:
    """将长文本分割成多个段落"""
    if len(text) <= max_length:
        return [text]
    
    segments = []
    current_segment = ""
    import re
    sentences = re.split(r'([。！？.!?])', text)
    
    i = 0
    while i < len(sentences):
        sentence = sentences[i]
        if i + 1 < len(sentences) and sentences[i + 1] in '。！？.!?':
            sentence += sentences[i + 1]
            i += 2
        else:
            i += 1
        
        sentence = sentence.strip()
        if not sentence:
            continue
        
        if len(sentence) > max_length:
            if current_segment:
                segments.append(current_segment)
                current_segment = ""
            for j in range(0, len(sentence), max_length):
                segments.append(sentence[j:j + max_length])
        elif len(current_segment) + len(sentence) > max_length:
            if current_segment:
                segments.append(current_segment)
            current_segment = sentence
        else:
            current_segment += sentence
    
    if current_segment:
        segments.append(current_segment)
    
    return segments


def generate_single_segment(text: str, voice: str, temp_dir: Path) -> tuple[bool, Path]:
    """合成单段文本"""
    try:
        response = requests.post(
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {QWEN_API_KEY}",
            },
            json={
                "model": "qwen3-tts-flash",
                "input": {
                    "text": text,
                    "voice": voice,
                    "language_type": "Chinese"
                }
            },
            timeout=60
        )
        
        if response.status_code != 200:
            logger.error(f"[Qwen TTS] API error: {response.text[:500]}")
            return False, None
        
        data = response.json()
        audio_url = data.get("output", {}).get("audio", {}).get("url")
        
        if not audio_url:
            logger.error(f"[Qwen TTS] No audio URL in response")
            return False, None
        
        # 下载音频
        audio_response = requests.get(audio_url, timeout=30)
        if audio_response.status_code != 200:
            logger.error(f"[Qwen TTS] Failed to download audio")
            return False, None
        
        segment_id = str(uuid.uuid4())[:8]
        segment_path = temp_dir / f"segment_{segment_id}.wav"
        
        with open(segment_path, "wb") as f:
            f.write(audio_response.content)
        
        return True, segment_path
        
    except Exception as e:
        logger.error(f"[Qwen TTS] Single segment error: {e}")
        return False, None


def merge_audio_files(audio_paths: List[Path], output_path: Path) -> bool:
    """合并多个音频文件"""
    try:
        from pydub import AudioSegment
        combined = AudioSegment.empty()
        for path in audio_paths:
            audio = AudioSegment.from_wav(str(path))
            combined += audio
        combined.export(str(output_path), format="wav")
        return True
    except ImportError:
        # 简单拼接
        with open(output_path, 'wb') as outfile:
            for path in audio_paths:
                with open(path, 'rb') as infile:
                    outfile.write(infile.read())
        return True
    except Exception as e:
        logger.error(f"[Qwen TTS] Merge failed: {e}")
        return False


def generate_qwen_tts(text: str, voice: str = "zhimeng", speed: float = 1.0) -> tuple[bool, str, str]:
    """
    调用通义千问 TTS API（qwen3-tts-flash，支持长文本）
    """
    try:
        # 映射到系统音色
        voice_param = AVAILABLE_VOICES.get(voice, "Cherry")
        
        segments = split_text_into_segments(text)
        logger.info(f"[Qwen TTS] Text split into {len(segments)} segments")
        
        temp_dir = Path("./temp")
        temp_dir.mkdir(exist_ok=True)
        
        audio_paths = []
        for i, segment in enumerate(segments):
            logger.info(f"[Qwen TTS] Synthesizing segment {i+1}/{len(segments)}")
            
            success, audio_path = generate_single_segment(segment, voice_param, temp_dir)
            if success:
                audio_paths.append(audio_path)
            else:
                # 清理
                for path in audio_paths:
                    try:
                        path.unlink()
                    except:
                        pass
                return False, f"第{i+1}段合成失败", "分段合成失败"
        
        if not audio_paths:
            return False, "没有生成任何音频", "合成失败"
        
        output_id = str(uuid.uuid4())[:8]
        output_path = temp_dir / f"{output_id}.wav"
        
        if len(audio_paths) == 1:
            audio_paths[0].rename(output_path)
        else:
            # 合并
            if merge_audio_files(audio_paths, output_path):
                for path in audio_paths:
                    try:
                        path.unlink()
                    except:
                        pass
            else:
                audio_paths[0].rename(output_path)
        
        voice_name = "芊悦" if voice_param == "Cherry" else voice_param
        if len(segments) > 1:
            return True, str(output_path), f"千问-{voice_name}音色（长文本{len(segments)}段）"
        return True, str(output_path), f"千问-{voice_name}音色"
        
    except Exception as e:
        logger.error(f"[Qwen TTS] Exception: {e}")
        return False, str(e), "服务异常"

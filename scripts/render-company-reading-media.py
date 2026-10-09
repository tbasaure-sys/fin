"""Render sourced chapter frames and local Spanish speech from one engine result.

Windows prerequisites: Node, Pillow, System.Speech Spanish voice and ffmpeg.
No language model, market refresh, deployment or external generation service.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import wave
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "company-reading-media"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["node", str(ROOT / "scripts" / "export-company-reading-media.mjs"), str(OUT)], cwd=ROOT, check=True)
data = json.loads((OUT / "reading.json").read_text(encoding="utf-8"))
reading = data["reading"]
chapters = data["chapters"]
fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
def font(size, bold=False):
    return ImageFont.truetype(str(fonts / ("segoeuib.ttf" if bold else "segoeui.ttf")), size)
def wrapped(draw, text, f, width):
    rows, line = [], ""
    for word in text.split():
        candidate = (line + " " + word).strip()
        if draw.textlength(candidate, font=f) > width and line:
            rows.append(line)
            line = word
        else:
            line = candidate
    if line:
        rows.append(line)
    return rows
def block(draw, text, xy, f, width, fill, gap=6):
    x, y = xy
    for row in wrapped(draw, text, f, width):
        draw.text((x, y), row, font=f, fill=fill)
        y += f.size + gap
    return y

tts_script = OUT / "speak.ps1"
tts_script.write_text("""param([string]$InputFile, [string]$OutputDir)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speechReader = New-Object System.Speech.Synthesis.SpeechSynthesizer
$spanishReaderVoice = $speechReader.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'es-*' } | Select-Object -First 1
if (-not $spanishReaderVoice) { throw 'No hay voz española instalada.' }
$speechReader.SelectVoice($spanishReaderVoice.VoiceInfo.Name)
$speechReader.Rate = 0
$speechReader.Volume = 100
$mediaPayload = Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json
for ($chapterIndex = 0; $chapterIndex -lt $mediaPayload.chapters.Count; $chapterIndex++) {
  $chapterAudio = Join-Path $OutputDir ('chapter-' + $chapterIndex + '.wav')
  $speechReader.SetOutputToWaveFile($chapterAudio)
  $chapterText = $mediaPayload.chapters[$chapterIndex].title + '. ' + $mediaPayload.chapters[$chapterIndex].text
  $speechReader.Speak($chapterText)
  $speechReader.SetOutputToNull()
}
$speechReader.Dispose()
""", encoding="utf-8-sig")
subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(tts_script), "-InputFile", str(OUT / "reading.json"), "-OutputDir", str(OUT)], check=True)
ffmpeg = shutil.which("ffmpeg")
if not ffmpeg:
    raise RuntimeError("ffmpeg no disponible")
durations = []
for index, chapter in enumerate(chapters):
    image = Image.new("RGB", (1280, 720), "#0b1119")
    draw = ImageDraw.Draw(image)
    draw.text((58, 35), "BLS PRIME  /  AURORA", font=font(16, True), fill="#d5b477")
    draw.text((58, 73), "Microsoft Corporation", font=font(24), fill="#edf0f5")
    draw.text((940, 44), "CORTE 31/07/2024", font=font(17), fill="#a7b4c4")
    draw.text((940, 73), "Reconstrucción 07/10/2026", font=font(13), fill="#a7b4c4")
    draw.line((58, 118, 1222, 118), fill="#293340", width=1)
    draw.text((58, 142), f"{index + 1:02d} / {len(chapters):02d}", font=font(16), fill="#d5b477")
    block(draw, chapter["title"], (58, 179), font(36), 1150, "#edf0f5", 4)
    figures = chapter["figures"]
    width = 1160 / max(1, len(figures))
    for j, point in enumerate(figures):
        x = 58 + int(j * width)
        y = block(draw, point["label"], (x, 270), font(14), width - 30, "#a7b4c4")
        block(draw, point["display"], (x, y + 12), font(28), width - 30, "#d5b477")
        block(draw, f'{point.get("asOf") or "sin fecha"} · {point.get("provenance", "observado")}', (x, 370), font(11), width - 30, "#a7b4c4")
        label = point.get("sources", [{}])[0].get("label", "Sin fuente")
        block(draw, label, (x, 390), font(11), width - 30, "#a7b4c4", 3)
    block(draw, chapter["text"], (58, 451), font(18), 1150, "#c9d3df", 7)
    draw.line((58, 626, 1222, 626), fill="#293340", width=1)
    draw.text((58, 643), reading["snapshotId"] + "  ·  " + reading["runId"], font=font(12), fill="#a7b4c4")
    draw.text((58, 667), "Motor determinista · supuestos BLS v1 (07/10/2026) · Sin recomendaciones ni promesas de alfa", font=font(12), fill="#a7b4c4")
    frame = OUT / f"chapter-{index}.png"
    image.save(frame)
    if index == 0:
        image.save(OUT / "msft-reading-poster.png")
    audio = OUT / f"chapter-{index}.wav"
    with wave.open(str(audio)) as wav:
        duration = wav.getnframes() / wav.getframerate()
    durations.append(duration)
    segment = OUT / f"segment-{index}.mp4"
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", str(frame), "-i", str(audio), "-t", str(duration), "-r", "24", "-c:v", "libx264", "-preset", "fast", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", str(segment)], check=True)

concat = OUT / "concat.txt"
concat.write_text("\n".join(f"file 'segment-{i}.mp4'" for i in range(len(chapters))), encoding="utf-8")
video = OUT / "msft-reading-v1.mp4"
subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", "-movflags", "+faststart", str(video)], check=True)

def timestamp(seconds):
    ms = round(seconds * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}"
caption = ["WEBVTT", ""]
elapsed = 0
for chapter, duration in zip(chapters, durations):
    text = chapter["title"] + ". " + chapter["text"]
    words = text.split()
    chunks = [words[i:i + 18] for i in range(0, len(words), 18)]
    local = 0
    for chunk in chunks:
        end = local + duration * len(chunk) / len(words)
        caption += [f"{timestamp(elapsed + local)} --> {timestamp(elapsed + end)}", " ".join(chunk), ""]
        local = end
    elapsed += duration
(OUT / "msft-reading-v1.vtt").write_text("\n".join(caption), encoding="utf-8")
manifest = { "snapshotId": reading["snapshotId"], "runId": reading["runId"], "modelVersion": reading["modelVersion"], "durationSeconds": elapsed, "generatedFrom": "deterministic narration JSON", "voice": "Windows System.Speech es-MX", "chapters": len(chapters) }
(OUT / "msft-reading-v1.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
if "--publish-local" in sys.argv:
    public = ROOT / "public" / "media"
    public.mkdir(parents=True, exist_ok=True)
    for name in ["msft-reading-v1.mp4", "msft-reading-v1.vtt", "msft-reading-v1.json", "msft-reading-poster.png"]:
        shutil.copy2(OUT / name, public / name)
print(json.dumps(manifest, indent=2))

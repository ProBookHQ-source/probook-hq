#!/usr/bin/env python3
"""
Tractify Call Transcriber
Usage: python3 transcribe-call.py /path/to/recording.mov
- Auto-converts .mov to mp3 if needed (requires ffmpeg)
- Asks for business name, saves transcript as [slug]-transcript.txt on Desktop
- Upload the .txt to Claude — it handles everything else automatically
"""

import sys, os, time, json, urllib.request, subprocess, re
from datetime import date

API_KEY = "f54b5de5a59b468db95d34403ac16db4"
DESKTOP = os.path.expanduser("~/Desktop")
LIVE_CALLS = os.path.expanduser("~/Desktop/live sales calls")

def api_request(method, path, data=None, file_path=None):
    url = f"https://api.assemblyai.com{path}"
    headers = {"authorization": API_KEY}
    if file_path:
        with open(file_path, "rb") as f:
            file_data = f.read()
        req = urllib.request.Request(url, data=file_data, headers=headers, method="POST")
    elif data:
        headers["content-type"] = "application/json"
        req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers, method=method)
    else:
        req = urllib.request.Request(url, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def slugify(text):
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'\s+', '-', text)
    return text

def convert_to_mp3(input_path):
    mp3_path = os.path.join(DESKTOP, "call-audio.mp3")
    print(f"Converting to mp3 (this is fast)...")
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, "-vn", "-acodec", "mp3", "-q:a", "2", mp3_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print("ffmpeg error:", result.stderr[-500:])
        sys.exit(1)
    print("Conversion done.")
    return mp3_path

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 transcribe-call.py /path/to/recording.mov")
        sys.exit(1)

    recording = sys.argv[1]
    if not os.path.exists(recording):
        print(f"File not found: {recording}")
        sys.exit(1)

    # Ask for business name
    biz_name = input("Who was this call with? (business name): ").strip()
    if not biz_name:
        biz_name = "unknown"
    slug = slugify(biz_name)
    today = date.today().strftime("%Y-%m-%d")
    out_name = f"{slug}-{today}-transcript.txt"
    out_path = os.path.join(LIVE_CALLS, out_name)
    os.makedirs(LIVE_CALLS, exist_ok=True)

    # Convert if .mov
    ext = recording.rsplit(".", 1)[-1].lower()
    if ext in ("mov", "mp4", "m4a", "aac"):
        audio_path = convert_to_mp3(recording)
    else:
        audio_path = recording

    size_mb = os.path.getsize(audio_path) / (1024 * 1024)
    print(f"Uploading {os.path.basename(audio_path)} ({size_mb:.1f} MB)...")
    upload = api_request("POST", "/v2/upload", file_path=audio_path)
    audio_url = upload["upload_url"]
    print("Upload complete. Transcribing", end="", flush=True)

    transcript = api_request("POST", "/v2/transcript", data={
        "audio_url": audio_url,
        "speaker_labels": True,
        "sentiment_analysis": True,
        "auto_chapters": True
    })
    transcript_id = transcript["id"]

    while True:
        result = api_request("GET", f"/v2/transcript/{transcript_id}")
        status = result["status"]
        if status == "completed":
            print(" done.")
            break
        elif status == "error":
            print(f"\nError: {result.get('error')}")
            sys.exit(1)
        print(".", end="", flush=True)
        time.sleep(4)

    lines = []
    lines.append("CALL TRANSCRIPT")
    lines.append(f"Business: {biz_name}")
    lines.append(f"Date: {today}")
    lines.append(f"Duration: {result.get('audio_duration', 0):.0f}s")
    lines.append("=" * 60)
    lines.append("")

    if result.get("utterances"):
        for u in result["utterances"]:
            mins = u["start"] // 60000
            secs = (u["start"] % 60000) // 1000
            speaker = f"SPEAKER_{u['speaker']}"
            lines.append(f"[{mins}:{secs:02d}] {speaker}: {u['text']}")
            lines.append("")
    else:
        lines.append(result.get("text", ""))

    if result.get("chapters"):
        lines.append("")
        lines.append("=" * 60)
        lines.append("KEY MOMENTS")
        lines.append("")
        for ch in result["chapters"]:
            mins = ch["start"] // 60000
            secs = (ch["start"] % 60000) // 1000
            lines.append(f"[{mins}:{secs:02d}] {ch['headline']}")
            lines.append(f"       {ch['summary']}")
            lines.append("")

    output = "\n".join(lines)
    with open(out_path, "w") as f:
        f.write(output)

    print(f"\n✓ Saved to: {out_path}")
    print(f"\nUpload '{out_name}' to Claude — it will handle everything automatically.")

if __name__ == "__main__":
    main()

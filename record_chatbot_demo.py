import os
import time
import shutil
import subprocess
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

ARTIFACTS_DIR = r"C:\Users\Vaibhav\.gemini\antigravity-ide\brain\52dba762-a094-45dc-8b14-83d8c5224a6f"
FRAMES_DIR = os.path.join(ARTIFACTS_DIR, "scratch", "demo_frames")
OUTPUT_MP4 = os.path.join(ARTIFACTS_DIR, "voxai_chatbot_demo.mp4")
OUTPUT_WEBP = os.path.join(ARTIFACTS_DIR, "voxai_chatbot_demo.webp")
LOCAL_MP4 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voxai_chatbot_demo.mp4")
LOCAL_WEBP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voxai_chatbot_demo.webp")

FFMPEG_EXE = r"C:\Program Files\FFmpeg\bin\ffmpeg.exe"
if not os.path.exists(FFMPEG_EXE):
    FFMPEG_EXE = "ffmpeg"

def record_demo():
    if os.path.exists(FRAMES_DIR):
        shutil.rmtree(FRAMES_DIR, ignore_errors=True)
    os.makedirs(FRAMES_DIR, exist_ok=True)

    print("[*] Launching headless browser to record VoxAI Chatbot demo...")
    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--window-size=1280,820')
    opts.add_argument('--hide-scrollbars')

    driver = webdriver.Chrome(options=opts)
    frame_idx = 0

    def capture_frames(count=1, delay=0.2):
        nonlocal frame_idx
        for _ in range(count):
            fname = os.path.join(FRAMES_DIR, f"frame_{frame_idx:05d}.png")
            driver.save_screenshot(fname)
            frame_idx += 1
            if delay > 0:
                time.sleep(delay)

    try:
        url = "https://chatbot.vaibhavjain.click"
        print(f"[*] Navigating to {url}...")
        driver.get(url)
        time.sleep(3)

        # Initial view hold
        print("[*] Recording initial interface...")
        capture_frames(count=8, delay=0.25)

        queries = [
            ("Hello VoxAI! What can you do?", 6),
            ("What is deep learning and neural networks?", 7),
            ("Calculate 45 * 12 + 150", 6),
        ]

        # Find chat input
        wait = WebDriverWait(driver, 15)
        
        for q_idx, (query_text, hold_frames) in enumerate(queries):
            print(f"[*] Simulating user query {q_idx+1}: '{query_text}'")
            input_box = wait.until(EC.presence_of_element_located((
                By.CSS_SELECTOR, "input[placeholder*='Ask VoxAI'], input[placeholder*='Type your message'], input[type='text']"
            )))
            
            # Click and clear
            input_box.click()
            time.sleep(0.3)
            capture_frames(count=2, delay=0.15)

            # Type text smoothly
            typed_so_far = ""
            for char in query_text:
                typed_so_far += char
                driver.execute_script("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", input_box, typed_so_far)
                if len(typed_so_far) % 4 == 0:
                    capture_frames(count=1, delay=0.08)

            capture_frames(count=3, delay=0.15)
            
            # Press Enter
            input_box.send_keys(Keys.ENTER)
            capture_frames(count=3, delay=0.15)

            # Wait for bot response
            time.sleep(1.5)
            capture_frames(count=hold_frames, delay=0.3)

        # Scroll to show complete conversation history
        print("[*] Scrolling to show conversation history...")
        driver.execute_script("window.scrollTo({ top: 300, behavior: 'smooth' });")
        capture_frames(count=6, delay=0.25)
        
        driver.execute_script("window.scrollTo({ top: 0, behavior: 'smooth' });")
        capture_frames(count=8, delay=0.25)

        print(f"[OK] Captured {frame_idx} frames successfully!")

    finally:
        driver.quit()

    encode_frames()

def encode_frames():
    print("[*] Encoding frames into MP4 and WebP animations via FFmpeg...")
    input_pattern = os.path.join(FRAMES_DIR, "frame_%05d.png")

    # 1. MP4 Video (H.264, 4 fps)
    cmd_mp4 = [
        FFMPEG_EXE, "-y",
        "-framerate", "4",
        "-i", input_pattern,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-vf", "scale=1280:820",
        OUTPUT_MP4
    ]
    subprocess.run(cmd_mp4, check=True)
    shutil.copy2(OUTPUT_MP4, LOCAL_MP4)
    print(f"[OK] MP4 video saved: {OUTPUT_MP4} and {LOCAL_MP4}")

    # 2. Animated WebP (lossless/quality 85, loop 0)
    cmd_webp = [
        FFMPEG_EXE, "-y",
        "-framerate", "4",
        "-i", input_pattern,
        "-vcodec", "libwebp",
        "-lossless", "0",
        "-compression_level", "4",
        "-q:v", "80",
        "-loop", "0",
        OUTPUT_WEBP
    ]
    subprocess.run(cmd_webp, check=True)
    shutil.copy2(OUTPUT_WEBP, LOCAL_WEBP)
    print(f"[OK] WebP animation saved: {OUTPUT_WEBP} and {LOCAL_WEBP}")

    # Cleanup raw frames to save disk space
    shutil.rmtree(FRAMES_DIR, ignore_errors=True)
    print("[OK] Screen recording generation complete!")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--encode-only":
        encode_frames()
    else:
        record_demo()

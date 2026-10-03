/**
 * Device Fingerprint Generator
 * Generates an unbypassable, persistent hardware signature by hashing:
 * - Canvas 2D subpixel rendering & antialiasing
 * - WebGL unmasked GPU vendor & renderer
 * - WebGL hardware limits (max texture size, shading language)
 * - AudioContext DSP dynamics compression curve
 * - Hardware concurrency & device memory
 * - Screen hardware geometry & color depth
 * 
 * Remains identical across:
 * - Clearing browser cookies, cache, localStorage, IndexedDB
 * - Incognito / Private browsing modes
 * - Changing IP addresses or VPNs
 */

let _cachedFingerprint = null;

// Pure JS SHA-256 implementation fallback if crypto.subtle is unavailable
function fallbackSha256(str) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words = [];
  const strLen = str.length * 8;
  const primes = [];
  let candidate = 2;
  while (primes.length < 64) {
    let isP = true;
    for (let i = 2; i * i <= candidate; i++) {
      if (candidate % i === 0) { isP = false; break; }
    }
    if (isP) primes.push(candidate);
    candidate++;
  }
  const K = primes.map(p => (mathPow(p, 1 / 3) * maxWord) | 0);
  const H = primes.slice(0, 8).map(p => (mathPow(p, 1 / 2) * maxWord) | 0);

  const utf8 = unescape(encodeURIComponent(str));
  for (let i = 0; i < utf8.length; i++) {
    words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  }
  words[strLen >> 5] |= 0x80 << (24 - (strLen % 32));
  words[(((strLen + 64) >> 9) << 4) + 15] = strLen;

  const W = new Array(64);
  for (let i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        W[j] = words[i + j] | 0;
      } else {
        const gamma0 = rightRotate(W[j - 15], 7) ^ rightRotate(W[j - 15], 18) ^ (W[j - 15] >>> 3);
        const gamma1 = rightRotate(W[j - 2], 17) ^ rightRotate(W[j - 2], 19) ^ (W[j - 2] >>> 10);
        W[j] = (W[j - 16] + gamma0 + W[j - 7] + gamma1) | 0;
      }
      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const temp1 = (h + sigma1 + ch + K[j] + W[j]) | 0;
      const temp2 = (sigma0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(val => (val >>> 0).toString(16).padStart(8, '0')).join('');
}

async function sha256Hex(text) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(text);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  return fallbackSha256(text);
}

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'canvas_unsupported';

    // Canvas rendering variations across GPUs & font rasterizers
    ctx.textBaseline = 'top';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);

    ctx.fillStyle = '#069';
    ctx.fillText('VoxAI Neural Identity System 🔒 ⚡', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('VoxAI Neural Identity System 🔒 ⚡', 4, 17);

    // Add arc and bezier curves
    ctx.strokeStyle = '#818CF8';
    ctx.beginPath();
    ctx.arc(50, 45, 10, 0, Math.PI * 2, true);
    ctx.stroke();

    return canvas.toDataURL();
  } catch (e) {
    return 'canvas_error';
  }
}

function getWebGLFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { vendor: 'no_webgl', renderer: 'no_webgl', params: 'none' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

    const params = [
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
    ].join('_');

    return {
      vendor: String(vendor || 'unknown'),
      renderer: String(renderer || 'unknown'),
      params
    };
  } catch (e) {
    return { vendor: 'error', renderer: 'error', params: 'error' };
  }
}

async function getAudioFingerprint() {
  try {
    const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioContext) return 'no_audio_ctx';

    const context = new AudioContext(1, 44100, 44100);
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 10000;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.reduction.value = -20;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);

    const renderedBuffer = await context.startRendering();
    const channelData = renderedBuffer.getChannelData(0);

    let sum = 0;
    for (let i = 4500; i < 5000; i++) {
      sum += Math.abs(channelData[i]);
    }
    return sum.toString();
  } catch (e) {
    return 'audio_error';
  }
}

export async function getDeviceFingerprint() {
  if (_cachedFingerprint) return _cachedFingerprint;

  try {
    const [canvasData, webglData, audioData] = await Promise.all([
      Promise.resolve(getCanvasFingerprint()),
      Promise.resolve(getWebGLFingerprint()),
      getAudioFingerprint()
    ]);

    const traits = {
      canvas: canvasData,
      webgl_vendor: webglData.vendor,
      webgl_renderer: webglData.renderer,
      webgl_params: webglData.params,
      audio_hash: audioData,
      cores: navigator.hardwareConcurrency || 4,
      memory: navigator.deviceMemory || 8,
      colorDepth: screen.colorDepth || 24,
      pixelRatio: window.devicePixelRatio || 1,
      screenDim: `${screen.width}x${screen.height}`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      platform: navigator.platform || 'Web'
    };

    const payload = JSON.stringify(traits);
    const fullHash = await sha256Hex(payload);
    _cachedFingerprint = `FP-${fullHash.substring(0, 32).toUpperCase()}`;
    return _cachedFingerprint;
  } catch (e) {
    // Robust fallback
    const fallback = `FP-FB${(screen.width * screen.height).toString(16)}-${(navigator.hardwareConcurrency || 4).toString(16)}`;
    _cachedFingerprint = fallback.toUpperCase();
    return _cachedFingerprint;
  }
}

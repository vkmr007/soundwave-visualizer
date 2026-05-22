// ==========================================================================
// Soundwave Studio - Core Logic
// Handlers: Web Audio API, Canvas Drawing, Custom Settings, Electron IPC Export
// ==========================================================================

// Global state variables
let audioContext = null;
let audioSource = null;
let analyserNode = null;
let audioDestinationNode = null; // Node for recording audio track
let dataArray = null;
let timeDataArray = null;
let bufferLength = 0;
let isPlaying = false;
let animationFrameId = null;
let recordingInterval = null; // Strict setInterval timer for background-proof rendering
let visualizerTime = 0; // Synchronized timer for frame-perfect animations

// UI & Customization values
let activeStyle = 'linear-bars';
let primaryColor = '#00f2fe';
let secondaryColor = '#4facfe';
let colorMode = 'gradient';
let glowIntensity = 20;
let sensitivity = 1.5;
let scaleFactor = 1.0;
let posXOffset = 0; // percentage (-100 to 100)
let posYOffset = 0; // percentage (-100 to 100)
let barWidthSetting = 6;
let innerRadiusSetting = 120;
let isBeatReactiveText = true;

// Fonts & Overlays
let songTitleText = '';
let artistText = '';
let activeFont = 'Syne';

// Aspect Ratios & Resolutions
let activeAspectRatio = '16-9';
let exportFps = 60;
let canvasWidth = 1920;
let canvasHeight = 1080;

// Media Loading state
let bgImage = null;
let bgFileName = '';
let audioFileName = '';

// Particle systems for dynamic backgrounds
let starfieldParticles = [];
let visualizerParticles = []; // Particles bursting on circular visualizer beat hits

// Recording State
let mediaRecorder = null;
let isRecording = false;
let recordedChunks = [];
let exportSavePath = null;

// DOM Elements
const canvas = document.getElementById('visualizer-canvas');
const ctx = canvas.getContext('2d');
const audioElement = document.getElementById('audio-element');

// Sidebar Trigger Elements
const btnSelectAudio = document.getElementById('btn-select-audio');
const labelAudioFile = document.getElementById('label-audio-file');
const audioMeta = document.getElementById('audio-meta');

const btnSelectBg = document.getElementById('btn-select-bg');
const labelBgFile = document.getElementById('label-bg-file');
const bgMeta = document.getElementById('bg-meta');

// Wave Design Elements
const selectVisualizerStyle = document.getElementById('visualizer-style');
const inputColorPrimary = document.getElementById('color-primary');
const inputColorSecondary = document.getElementById('color-secondary');
const selectColorMode = document.getElementById('color-mode');
const sliderGlow = document.getElementById('slider-glow');
const valGlow = document.getElementById('val-glow');
const sliderSensitivity = document.getElementById('slider-sensitivity');
const valSensitivity = document.getElementById('val-sensitivity');

// Sizing & Positioning Elements
const sliderScale = document.getElementById('slider-scale');
const valScale = document.getElementById('val-scale');
const sliderPosX = document.getElementById('slider-pos-x');
const valPosX = document.getElementById('val-pos-x');
const sliderPosY = document.getElementById('slider-pos-y');
const valPosY = document.getElementById('val-pos-y');

const controlLinearOnly = document.getElementById('control-linear-only');
const sliderBarWidth = document.getElementById('slider-bar-width');
const valBarWidth = document.getElementById('val-bar-width');

const controlCircularOnly = document.getElementById('control-circular-only');
const sliderInnerRadius = document.getElementById('slider-inner-radius');
const valInnerRadius = document.getElementById('val-inner-radius');

// Typography Elements
const inputTitle = document.getElementById('input-title');
const inputArtist = document.getElementById('input-artist');
const selectFont = document.getElementById('select-font');
const checkBeatReact = document.getElementById('check-beat-react');

// Export Elements
const selectAspectRatio = document.getElementById('select-aspect-ratio');
const selectFps = document.getElementById('select-fps');
const btnExport = document.getElementById('btn-export');

// Diagnostics HUD
const diagStatus = document.getElementById('diag-status');
const diagStatusColor = document.getElementById('diag-status-color');
const diagBass = document.getElementById('diag-bass');
const diagBpm = document.getElementById('diag-bpm');
const diagResolution = document.getElementById('diag-resolution');

// Player Controls
const btnPlayPause = document.getElementById('btn-play-pause');
const seekSlider = document.getElementById('seek-slider');
const seekProgressFill = document.getElementById('seek-progress-fill');
const currentTimeLabel = document.getElementById('current-time');
const totalDurationLabel = document.getElementById('total-duration');
const volumeSlider = document.getElementById('volume-slider');

// Modal Elements
const exportModal = document.getElementById('export-modal');
const exportProgressBar = document.getElementById('export-progress');
const exportTimeLabel = document.getElementById('export-time');
const exportStatusLabel = document.getElementById('export-status-label');
const btnStopExport = document.getElementById('btn-stop-export');

// ==========================================================================
// Setup & Initialization
// ==========================================================================

function init() {
  setupEventListeners();
  updateAspectSettings();
  setupProceduralParticles();
  resizeCanvas();
  renderLoop();
}

function setupEventListeners() {
  // Audio selection
  btnSelectAudio.addEventListener('click', async () => {
    try {
      diagStatus.textContent = 'Opening Audio Dialog...';
      const fileData = await window.api.openAudio();
      if (fileData) {
        audioFileName = fileData.name;
        labelAudioFile.textContent = audioFileName;
        audioMeta.textContent = `Song: ${audioFileName}`;
        audioMeta.classList.remove('hidden');

        // Set audio source to base64 Data URI from main process
        audioElement.src = fileData.dataUri;
        audioElement.load();
        
        // Reset player states
        btnPlayPause.classList.remove('disabled');
        btnPlayPause.disabled = false;
        seekSlider.disabled = false;
        btnExport.disabled = false;
        
        diagStatus.textContent = 'Audio Loaded';
        diagStatusColor.style.backgroundColor = '#2ed573';
        diagStatusColor.style.boxShadow = '0 0 6px rgba(46, 213, 115, 0.5)';
      }
    } catch (err) {
      console.error(err);
      diagStatus.textContent = 'Audio Load Error';
    }
  });

  // Background selection
  btnSelectBg.addEventListener('click', async () => {
    try {
      const fileData = await window.api.openBackground();
      if (fileData) {
        bgFileName = fileData.name;
        labelBgFile.textContent = bgFileName;
        bgMeta.textContent = `Background: ${bgFileName}`;
        bgMeta.classList.remove('hidden');

        bgImage = new Image();
        bgImage.src = fileData.dataUri;
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Player functionality
  btnPlayPause.addEventListener('click', togglePlayback);
  
  audioElement.addEventListener('loadedmetadata', () => {
    totalDurationLabel.textContent = formatTime(audioElement.duration);
    seekSlider.max = Math.floor(audioElement.duration);
  });

  audioElement.addEventListener('timeupdate', () => {
    if (!isRecording) {
      seekSlider.value = Math.floor(audioElement.currentTime);
      currentTimeLabel.textContent = formatTime(audioElement.currentTime);
      const pct = (audioElement.currentTime / audioElement.duration) * 100;
      seekProgressFill.style.width = `${pct}%`;
    }
  });

  audioElement.addEventListener('ended', () => {
    if (isRecording) {
      stopRecordingAndSave();
    } else {
      isPlaying = false;
      btnPlayPause.querySelector('.play-icon').classList.remove('hidden');
      btnPlayPause.querySelector('.pause-icon').classList.add('hidden');
    }
  });

  seekSlider.addEventListener('input', () => {
    audioElement.currentTime = seekSlider.value;
    currentTimeLabel.textContent = formatTime(audioElement.currentTime);
    const pct = (audioElement.currentTime / audioElement.duration) * 100;
    seekProgressFill.style.width = `${pct}%`;
  });

  volumeSlider.addEventListener('input', () => {
    audioElement.volume = volumeSlider.value;
  });

  // Customization controls
  selectVisualizerStyle.addEventListener('change', (e) => {
    activeStyle = e.target.value;
    
    // Contextual controls display
    if (activeStyle === 'linear-bars') {
      controlLinearOnly.classList.remove('hidden');
      controlCircularOnly.classList.add('hidden');
    } else if (activeStyle === 'circular-ring') {
      controlLinearOnly.classList.add('hidden');
      controlCircularOnly.classList.remove('hidden');
    } else {
      controlLinearOnly.classList.add('hidden');
      controlCircularOnly.classList.add('hidden');
    }
  });

  inputColorPrimary.addEventListener('input', (e) => primaryColor = e.target.value);
  inputColorSecondary.addEventListener('input', (e) => secondaryColor = e.target.value);
  selectColorMode.addEventListener('change', (e) => colorMode = e.target.value);
  
  sliderGlow.addEventListener('input', (e) => {
    glowIntensity = parseInt(e.target.value);
    valGlow.textContent = `${glowIntensity}px`;
  });

  sliderSensitivity.addEventListener('input', (e) => {
    sensitivity = parseFloat(e.target.value);
    valSensitivity.textContent = `${sensitivity.toFixed(1)}x`;
  });

  sliderScale.addEventListener('input', (e) => {
    scaleFactor = parseFloat(e.target.value);
    valScale.textContent = `${scaleFactor.toFixed(2)}x`;
  });

  sliderPosX.addEventListener('input', (e) => {
    posXOffset = parseInt(e.target.value);
    valPosX.textContent = posXOffset === 0 ? 'Center' : `${posXOffset > 0 ? '+' : ''}${posXOffset}%`;
  });

  sliderPosY.addEventListener('input', (e) => {
    posYOffset = parseInt(e.target.value);
    valPosY.textContent = posYOffset === 0 ? 'Center' : `${posYOffset > 0 ? '+' : ''}${posYOffset}%`;
  });

  sliderBarWidth.addEventListener('input', (e) => {
    barWidthSetting = parseInt(e.target.value);
    valBarWidth.textContent = `${barWidthSetting}px`;
  });

  sliderInnerRadius.addEventListener('input', (e) => {
    innerRadiusSetting = parseInt(e.target.value);
    valInnerRadius.textContent = `${innerRadiusSetting}px`;
  });

  // Typography overlay bindings
  inputTitle.addEventListener('input', (e) => songTitleText = e.target.value);
  inputArtist.addEventListener('input', (e) => artistText = e.target.value);
  selectFont.addEventListener('change', (e) => activeFont = e.target.value);
  checkBeatReact.addEventListener('change', (e) => isBeatReactiveText = e.target.checked);

  // Aspect settings
  selectAspectRatio.addEventListener('change', updateAspectSettings);
  selectFps.addEventListener('change', (e) => exportFps = parseInt(e.target.value));

  // Export engine button
  btnExport.addEventListener('click', startRecordingPipeline);
  btnStopExport.addEventListener('click', stopRecordingAndSave);
}

// Format seconds into MM:SS
function formatTime(seconds) {
  if (isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Aspect ratio adjustments
function updateAspectSettings() {
  activeAspectRatio = selectAspectRatio.value;
  const outerFrame = document.getElementById('video-frame-outer');
  
  outerFrame.className = 'video-frame-container'; // clear aspect classes
  
  if (activeAspectRatio === '16-9') {
    canvasWidth = 1920;
    canvasHeight = 1080;
    outerFrame.classList.add('widescreen');
  } else if (activeAspectRatio === '9-16') {
    canvasWidth = 1080;
    canvasHeight = 1920;
    outerFrame.classList.add('vertical');
  } else if (activeAspectRatio === '1-1') {
    canvasWidth = 1080;
    canvasHeight = 1080;
    outerFrame.classList.add('square');
  }
  
  diagResolution.textContent = `${canvasWidth} x ${canvasHeight}`;
  resizeCanvas();
}

function resizeCanvas() {
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
}

// Setup audio nodes on initial user interaction
function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioContext.createAnalyser();
    
    // High FFT Size for high definition soundwaves
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.85;
    
    bufferLength = analyserNode.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    timeDataArray = new Uint8Array(bufferLength);

    audioSource = audioContext.createMediaElementSource(audioElement);
    audioSource.connect(analyserNode);
    analyserNode.connect(audioContext.destination);

    // Create stream destination node for crisp digital recording
    audioDestinationNode = audioContext.createMediaStreamDestination();
    analyserNode.connect(audioDestinationNode);
  }
  
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function togglePlayback() {
  ensureAudioContext();
  
  if (isPlaying) {
    audioElement.pause();
    isPlaying = false;
    btnPlayPause.querySelector('.play-icon').classList.remove('hidden');
    btnPlayPause.querySelector('.pause-icon').classList.add('hidden');
    diagStatus.textContent = 'Paused';
    diagStatusColor.style.backgroundColor = '#ffa502';
  } else {
    audioElement.play();
    isPlaying = true;
    btnPlayPause.querySelector('.play-icon').classList.add('hidden');
    btnPlayPause.querySelector('.pause-icon').classList.remove('hidden');
    diagStatus.textContent = 'Playing';
    diagStatusColor.style.backgroundColor = '#2ed573';
  }
}

// Setup background dynamic particle array
function setupProceduralParticles() {
  starfieldParticles = [];
  for (let i = 0; i < 200; i++) {
    starfieldParticles.push({
      x: Math.random() * 1920,
      y: Math.random() * 1920,
      radius: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.5 + 0.1,
      angle: Math.random() * Math.PI * 2
    });
  }
}

// ==========================================================================
// Visualizer Render Loops & Math Core
// ==========================================================================

function renderLoop() {
  if (!isRecording) {
    animationFrameId = requestAnimationFrame(renderLoop);
    drawFrame();
  }
}

function drawFrame() {
  let bass = 0;
  let mid = 0;
  let treble = 0;
  let volume = 0;

  // Advance time: tie to export FPS frame steps during record, else use real time
  if (isRecording) {
    visualizerTime += 1000 / exportFps;
  } else {
    visualizerTime = Date.now();
  }

  if (analyserNode) {
    analyserNode.getByteFrequencyData(dataArray);
    analyserNode.getByteTimeDomainData(timeDataArray);
    
    // Standard diagnostics analysis
    let bassSum = 0, midSum = 0, trebleSum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = dataArray[i];
      if (i < 10) bassSum += val;
      else if (i < 65) midSum += val;
      else trebleSum += val;
      volume += val * val;
    }
    
    bass = (bassSum / 10) / 255;
    mid = (midSum / 55) / 255;
    treble = (trebleSum / (bufferLength - 65)) / 255;
    volume = Math.sqrt(volume / bufferLength) / 255;
    
    // Dynamic diagnostics tags updates
    diagBass.textContent = bass.toFixed(2);
    
    // Direct BPM Pulse simulator based on transient threshold
    if (bass > 0.6) {
      diagBpm.textContent = 'BASS HIT';
      document.querySelector('.bpm-pill').style.boxShadow = '0 0 10px var(--color-primary)';
    } else {
      diagBpm.textContent = '--';
      document.querySelector('.bpm-pill').style.boxShadow = 'none';
    }
  }

  // Draw background frame
  drawBackground(bass, mid, treble);

  // Position offset translations
  const customX = canvasWidth / 2 + (posXOffset / 100) * canvasWidth;
  const customY = canvasHeight / 2 + (posYOffset / 100) * canvasHeight;
  
  // Render active Soundwave style
  ctx.save();
  ctx.translate(customX, customY);
  ctx.scale(scaleFactor, scaleFactor);
  
  if (analyserNode) {
    drawVisualizer(activeStyle, dataArray, timeDataArray, bass, mid, treble, volume);
  } else {
    // Draw dummy wave if no audio is connected yet
    drawDummyWave();
  }
  ctx.restore();

  // Typography overlay rendering
  drawTextOverlays(bass);

  // Exporter update loop inside drawing loop
  if (isRecording) {
    updateRecordingHUD();
  }
}

// Background Drawing
function drawBackground(bass, mid, treble) {
  ctx.fillStyle = '#01000f';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (bgImage && bgImage.complete) {
    // Custom Background Image Fit cover
    const aspectImg = bgImage.width / bgImage.height;
    const aspectCanvas = canvasWidth / canvasHeight;
    let renderW, renderH, renderX, renderY;

    if (aspectImg > aspectCanvas) {
      renderH = canvasHeight;
      renderW = canvasHeight * aspectImg;
      renderX = (canvasWidth - renderW) / 2;
      renderY = 0;
    } else {
      renderW = canvasWidth;
      renderH = canvasWidth / aspectImg;
      renderX = 0;
      renderY = (canvasHeight - renderH) / 2;
    }
    
    ctx.globalAlpha = 0.35; // Overlay opacity mix
    ctx.drawImage(bgImage, renderX, renderY, renderW, renderH);
    ctx.globalAlpha = 1.0;
  } else {
    // Procedural Starfield moving preset background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    const centerCX = canvasWidth / 2;
    const centerCY = canvasHeight / 2;
    
    for (let i = 0; i < starfieldParticles.length; i++) {
      const p = starfieldParticles[i];
      // Bass boost speed expansion
      const currentSpeed = p.speed * (1 + bass * 3);
      
      // Move from center outwards
      p.x += Math.cos(p.angle) * currentSpeed;
      p.y += Math.sin(p.angle) * currentSpeed;

      // Wrapping edges boundary check
      const dist = Math.hypot(p.x - centerCX, p.y - centerCY);
      if (dist > Math.hypot(centerCX, centerCY)) {
        p.x = centerCX;
        p.y = centerCY;
        p.angle = Math.random() * Math.PI * 2;
      }

      ctx.beginPath();
      // Particles scale size dynamically with treble bands
      ctx.arc(p.x, p.y, p.radius * (1 + treble), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Visualizer Core Draw Selector
function drawVisualizer(style, data, timeData, bass, mid, treble, volume) {
  ctx.shadowBlur = glowIntensity;
  ctx.lineWidth = 3;

  // Setup gradient stroke styles
  let gradient = ctx.createLinearGradient(-300, 0, 300, 0);
  if (colorMode === 'gradient') {
    gradient.addColorStop(0, primaryColor);
    gradient.addColorStop(1, secondaryColor);
    ctx.strokeStyle = gradient;
    ctx.fillStyle = gradient;
    ctx.shadowColor = primaryColor;
  } else if (colorMode === 'hsl-shift') {
    const timeColor = `hsl(${(Date.now() / 30) % 360}, 100%, 60%)`;
    ctx.strokeStyle = timeColor;
    ctx.fillStyle = timeColor;
    ctx.shadowColor = timeColor;
  } else {
    ctx.strokeStyle = primaryColor;
    ctx.fillStyle = primaryColor;
    ctx.shadowColor = primaryColor;
  }

  if (style === 'linear-bars') {
    drawLinearBars(data);
  } else if (style === 'circular-ring') {
    drawCircularRing(data, bass);
  } else if (style === 'fluid-wave') {
    drawFluidWave(data, bass, mid);
  } else if (style === 'starburst-particles') {
    drawStarburstParticles(data, bass);
  } else if (style === 'digital-matrix') {
    drawDigitalMatrix(data);
  } else if (style === 'oscilloscope') {
    drawOscilloscope(timeData);
  } else if (style === 'orbit-sphere') {
    drawOrbitSphere(data, bass);
  } else if (style === 'mirrored-border') {
    drawMirroredBorder(data, bass, mid);
  } else if (style === 'voice-assistant') {
    drawVoiceAssistant(data, bass, mid, volume);
  }
  
  ctx.shadowBlur = 0; // reset glow
}

// Dummy waveform drawing for static presentation when idle
function drawDummyWave() {
  ctx.shadowBlur = glowIntensity;
  ctx.strokeStyle = primaryColor;
  ctx.shadowColor = primaryColor;
  ctx.lineWidth = 4;
  
  ctx.beginPath();
  const width = 600;
  for (let i = -width / 2; i < width / 2; i++) {
    const time = visualizerTime / 150;
    const y = Math.sin(i * 0.05 - time) * 15 * Math.exp(-Math.pow(i * 0.007, 2));
    if (i === -width / 2) ctx.moveTo(i, y);
    else ctx.lineTo(i, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// Design style 1: Glowing Linear Bars
let peakMeters = []; // Falling peaks arrays
function drawLinearBars(data) {
  const barCount = 120;
  const barSpacing = 4;
  const totalWidth = barCount * (barWidthSetting + barSpacing);
  const startX = -totalWidth / 2;

  // Initialize peak holds
  if (peakMeters.length !== barCount) {
    peakMeters = Array(barCount).fill(0);
  }

  for (let i = 0; i < barCount; i++) {
    // Map FFT frequencies cleanly
    const index = Math.floor((i / barCount) * (bufferLength * 0.7));
    let val = data[index] * sensitivity;
    
    // Scale visual bar heights
    const barHeight = Math.max(6, (val / 255) * 200);

    const x = startX + i * (barWidthSetting + barSpacing);

    // Draw Double Sided glowing vertical bars
    ctx.beginPath();
    ctx.roundRect(x, -barHeight / 2, barWidthSetting, barHeight, barWidthSetting / 2);
    ctx.fill();

    // Falling peaks indicators dots
    if (barHeight > peakMeters[i]) {
      peakMeters[i] = barHeight;
    } else {
      peakMeters[i] -= 2; // slow fall rate
    }
    
    ctx.beginPath();
    ctx.arc(x + barWidthSetting / 2, -peakMeters[i] / 2 - 8, barWidthSetting / 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x + barWidthSetting / 2, peakMeters[i] / 2 + 8, barWidthSetting / 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Design style 2: Circular Ripple Rings
function drawCircularRing(data, bass) {
  // Pulse base circle radius in sync with bass peaks
  const dynamicRadius = innerRadiusSetting + (bass * 40);
  const totalPoints = 120;
  
  // Radial bars draw
  ctx.beginPath();
  for (let i = 0; i < totalPoints; i++) {
    const angle = (i / totalPoints) * Math.PI * 2;
    const index = Math.floor((i / totalPoints) * (bufferLength * 0.6));
    const val = (data[index] * sensitivity) / 255;
    const barLen = val * 120;
    
    const xStart = Math.cos(angle) * dynamicRadius;
    const yStart = Math.sin(angle) * dynamicRadius;
    const xEnd = Math.cos(angle) * (dynamicRadius + barLen);
    const yEnd = Math.sin(angle) * (dynamicRadius + barLen);
    
    ctx.moveTo(xStart, yStart);
    ctx.lineTo(xEnd, yEnd);
  }
  ctx.stroke();

  // Bursting particle explosions on bass peaks
  if (bass > 0.7 && Math.random() < 0.3) {
    for (let p = 0; p < 8; p++) {
      const pAngle = Math.random() * Math.PI * 2;
      visualizerParticles.push({
        x: Math.cos(pAngle) * dynamicRadius,
        y: Math.sin(pAngle) * dynamicRadius,
        vx: Math.cos(pAngle) * (Math.random() * 4 + 2),
        vy: Math.sin(pAngle) * (Math.random() * 4 + 2),
        alpha: 1.0,
        radius: Math.random() * 3 + 1
      });
    }
  }

  // Draw visual particles
  for (let idx = visualizerParticles.length - 1; idx >= 0; idx--) {
    const vp = visualizerParticles[idx];
    vp.x += vp.vx;
    vp.y += vp.vy;
    vp.alpha -= 0.02;

    if (vp.alpha <= 0) {
      visualizerParticles.splice(idx, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = vp.alpha;
    ctx.beginPath();
    ctx.arc(vp.x, vp.y, vp.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw concentric center ring pulse
  ctx.beginPath();
  ctx.arc(0, 0, dynamicRadius, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.lineWidth = 3;
}

// Design style 3: Fluid Wave Flow (sine/bezier curves)
function drawFluidWave(data, bass, mid) {
  const points = [];
  const totalPoints = 30;
  const width = 800;
  const time = visualizerTime / 300;

  for (let i = 0; i <= totalPoints; i++) {
    const pct = i / totalPoints;
    const x = -width / 2 + pct * width;
    
    // Map frequency bands across points
    const freqIdx = Math.floor(pct * (bufferLength * 0.4));
    const intensity = (data[freqIdx] * sensitivity) / 255;
    
    // Calculate undulating organic flowing sine wave
    const waveOffset = Math.sin(pct * 6 - time) * 35 * (1 + bass);
    const y = waveOffset * intensity;
    
    points.push({ x, y });
  }

  // Draw fluid smooth Bezier curve line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  ctx.stroke();

  // Draw secondary flowing mirror shadow wave
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(points[0].x, -points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (-points[i].y - points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, -points[i].y, xc, yc);
  }
  ctx.stroke();
  ctx.restore();
}

// Design style 4: Radial Starburst Particles
let starburstStars = [];
function drawStarburstParticles(data, bass) {
  const starCount = 150;
  if (starburstStars.length === 0) {
    for (let i = 0; i < starCount; i++) {
      starburstStars.push({
        angle: Math.random() * Math.PI * 2,
        distance: Math.random() * 400 + 30,
        speed: Math.random() * 2 + 0.5,
        size: Math.random() * 2.5 + 0.5
      });
    }
  }

  ctx.shadowBlur = glowIntensity * 1.5;
  for (let i = 0; i < starburstStars.length; i++) {
    const star = starburstStars[i];
    
    // Map frequency index based on radial order
    const fIdx = Math.floor((i / starCount) * (bufferLength * 0.5));
    const intensity = (data[fIdx] * sensitivity) / 255;
    
    // Expand velocity and size based on dynamic audio beats
    const currentSpeed = star.speed * (1 + bass * 4) + (intensity * 3);
    star.distance += currentSpeed;

    if (star.distance > 800) {
      star.distance = Math.random() * 40 + 10;
      star.angle = Math.random() * Math.PI * 2;
    }

    const x = Math.cos(star.angle) * star.distance;
    const y = Math.sin(star.angle) * star.distance;
    const drawSize = star.size * (1 + intensity * 2);

    ctx.beginPath();
    ctx.arc(x, y, drawSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Design style 5: Digital Matrix HUD
function drawDigitalMatrix(data) {
  const colCount = 35;
  const rowCount = 12;
  const blockW = 12;
  const blockH = 8;
  const spacingX = 6;
  const spacingY = 4;
  
  const totalW = colCount * (blockW + spacingX);
  const startX = -totalW / 2;
  const startY = -(rowCount * (blockH + spacingY)) / 2;

  for (let c = 0; c < colCount; c++) {
    const fIdx = Math.floor((c / colCount) * (bufferLength * 0.6));
    const intensity = (data[fIdx] * sensitivity) / 255;
    
    // Calculate active blocks inside vertical grid column
    const activeBlocks = Math.floor(intensity * rowCount);

    for (let r = 0; r < rowCount; r++) {
      // Row bottom-up draw order
      const x = startX + c * (blockW + spacingX);
      const y = -startY - r * (blockH + spacingY);

      if (r < activeBlocks) {
        ctx.globalAlpha = 1.0;
        ctx.fillRect(x, y, blockW, blockH);
      } else {
        ctx.globalAlpha = 0.15; // Unactive state grid blocks
        ctx.strokeRect(x, y, blockW, blockH);
      }
    }
  }
  ctx.globalAlpha = 1.0;
}

// Design style 6: Neon Oscilloscope (raw time domain waveforms)
function drawOscilloscope(timeData) {
  ctx.beginPath();
  const width = 800;
  const sliceWidth = width / bufferLength;
  let x = -width / 2;
  ctx.lineWidth = 4;
  
  for (let i = 0; i < bufferLength; i++) {
    const v = timeData[i] / 128.0;
    const y = (v - 1.0) * 120 * sensitivity;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    x += sliceWidth;
  }
  ctx.stroke();
  ctx.lineWidth = 3;
}

// Design style 7: 3D Wireframe Orbit Sphere
function drawOrbitSphere(data, bass) {
  const sphereRadius = (innerRadiusSetting * 0.8) + (bass * 35);
  const rings = 6;
  const points = 60;
  const time = visualizerTime / 900;

  for (let r = 0; r < rings; r++) {
    ctx.save();
    // Rotate orbits in perspective angles
    ctx.rotate(time * 0.18 + (r * Math.PI / rings));
    ctx.beginPath();

    for (let p = 0; p < points; p++) {
      const angle = (p / points) * Math.PI * 2;
      const fIdx = Math.floor((p / points) * (bufferLength * 0.4));
      const intensity = (data[fIdx] * sensitivity) / 255;
      
      const radius = sphereRadius + (intensity * 45 * Math.sin(angle * 4 + time * 3.5));
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.38; // Tilt angle ratio

      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Draw core volumetric glow orb
  ctx.beginPath();
  ctx.arc(0, 0, sphereRadius * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = primaryColor;
  ctx.globalAlpha = 0.15 + bass * 0.35;
  ctx.fill();
  ctx.globalAlpha = 1.0;
}

// Design style 8: Mirrored Wave Borders
function drawMirroredBorder(data, bass, mid) {
  const points = [];
  const totalPoints = 40;
  const width = canvasWidth;
  const time = visualizerTime / 250;

  for (let i = 0; i <= totalPoints; i++) {
    const pct = i / totalPoints;
    const x = -width / 2 + pct * width;
    const fIdx = Math.floor(pct * (bufferLength * 0.5));
    const intensity = (data[fIdx] * sensitivity) / 255;
    const waveY = Math.sin(pct * 8 + time) * 45 * (1 + bass * 0.5) * intensity;
    points.push({ x, y: waveY });
  }

  // Top border line
  ctx.save();
  ctx.translate(0, -canvasHeight / 2 + 100);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  ctx.stroke();
  ctx.restore();

  // Bottom border line
  ctx.save();
  ctx.translate(0, canvasHeight / 2 - 100);
  ctx.beginPath();
  ctx.moveTo(points[0].x, -points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (-points[i].y - points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, -points[i].y, xc, yc);
  }
  ctx.stroke();
  ctx.restore();
}

// ==========================================================================
// Typography Overlay Drawer
// ==========================================================================

function drawTextOverlays(bass) {
  if (!songTitleText && !artistText) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Set fonts overlay family
  const fontFam = activeFont === 'Syne' ? 'Syne, sans-serif' :
                  activeFont === 'Outfit' ? 'Outfit, sans-serif' :
                  activeFont === 'Montserrat' ? 'Montserrat, sans-serif' :
                  activeFont === 'Playfair Display' ? 'Playfair Display, serif' :
                  'Space Grotesk, monospace';

  // Apply beat reactivity scale and glow changes
  const pulseMultiplier = isBeatReactiveText ? (1 + bass * 0.12) : 1.0;
  const pulseGlow = isBeatReactiveText ? (glowIntensity * (1 + bass * 0.6)) : glowIntensity;

  // Title render
  if (songTitleText) {
    ctx.font = `800 ${Math.floor(48 * pulseMultiplier)}px ${fontFam}`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = pulseGlow;
    ctx.shadowColor = primaryColor;
    
    // Standard visual text placement (15% offset from bottom frame)
    ctx.fillText(songTitleText, canvasWidth / 2, canvasHeight - 200);
  }

  // Artist subtitle render
  if (artistText) {
    ctx.font = `300 ${Math.floor(22 * pulseMultiplier)}px ${fontFam}`;
    ctx.fillStyle = '#a4b0be';
    ctx.shadowBlur = pulseGlow / 2;
    ctx.shadowColor = secondaryColor;
    
    ctx.fillText(artistText, canvasWidth / 2, canvasHeight - 145);
  }

  ctx.restore();
}

// ==========================================================================
// Video Recording & Exporter Process (Native Save Dialog Connection)
// ==========================================================================

async function startRecordingPipeline() {
  ensureAudioContext();
  
  try {
    // 1. Trigger Native Dialog to locate export file path
    diagStatus.textContent = 'Opening Save Dialog...';
    const chosenSavePath = await window.api.getSavePath();
    if (!chosenSavePath) {
      diagStatus.textContent = 'Export cancelled';
      return;
    }
    exportSavePath = chosenSavePath;

    // 2. Initialize native file write stream
    const initRes = await window.api.startFileWrite(exportSavePath);
    if (!initRes.success) {
      alert(`Failed to initialize video file: ${initRes.error}`);
      return;
    }

    // 3. Reset audio and begin recording configuration
    isPlaying = false;
    audioElement.pause();
    audioElement.currentTime = 0;
    
    // Ensure renderer has clean blank frames
    setupProceduralParticles();
    
    // Stop standard requestAnimationFrame preview loop
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Set status
    isRecording = true;
    recordedChunks = [];
    diagStatus.textContent = 'Rendering...';
    diagStatusColor.style.backgroundColor = '#ff4757'; // blinking record HUD
    diagStatusColor.style.boxShadow = '0 0 10px #ff4757';

    // Show export modal overlay
    exportModal.classList.remove('hidden');
    exportProgressBar.style.width = '0%';
    exportStatusLabel.textContent = 'Preparing video tracks...';

    // Capture Canvas frame track
    const canvasStream = canvas.captureStream(exportFps);
    const combinedStream = new MediaStream();

    // Add Canvas Video track
    canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));

    // Route direct Audio tracks from WebAudio stream node
    if (audioDestinationNode) {
      audioDestinationNode.stream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
    }

    // Setup media recorder configuration with high compatibility MP4 prioritised 
    let mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4;codecs=h264,aac';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp9,opus';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8,opus';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = ''; // Let browser decide
    }
    
    console.log('Selected recording MIME type:', mimeType);

    let options = { videoBitsPerSecond: 8000000 }; // 8 Mbps for pristine high-bitrate video
    if (mimeType) {
      options.mimeType = mimeType;
    }
    
    mediaRecorder = new MediaRecorder(combinedStream, options);

    // Recording buffer chunks event streams
    mediaRecorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        // Stream recorded chunk directly through IPC contextBridge to disk
        const arrayBuf = await e.data.arrayBuffer();
        await window.api.writeFileChunk(arrayBuf);
      }
    };

    mediaRecorder.onstop = async () => {
      if (recordingInterval) {
        clearInterval(recordingInterval);
        recordingInterval = null;
      }
      
      exportStatusLabel.textContent = 'Closing file stream...';
      await window.api.closeFile();
      
      // Cleanup states
      isRecording = false;
      exportModal.classList.add('hidden');
      diagStatus.textContent = 'Export Completed';
      diagStatusColor.style.backgroundColor = '#2ed573';
      
      alert(`Success! Your music video has been saved to:\n${exportSavePath}`);
      
      // Restart standard interactive preview loop
      renderLoop();
    };

    // Begin recording and play audio
    mediaRecorder.start(1000); // Trigger dataavailable chunks every 1 second
    audioElement.play();
    isPlaying = true;
    btnPlayPause.querySelector('.play-icon').classList.add('hidden');
    btnPlayPause.querySelector('.pause-icon').classList.remove('hidden');

    // Run drawing loop on high-precision background-resilient timer
    // This runs drawing frames and updating indicators even if window is blurred/minimized!
    const frameTime = 1000 / exportFps;
    recordingInterval = setInterval(() => {
      drawFrame();
    }, frameTime);
    
  } catch (err) {
    console.error('Error starting recording:', err);
    alert(`Export recording failed: ${err.message}`);
    isRecording = false;
    exportModal.classList.add('hidden');
    
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    renderLoop();
  }
}

function updateRecordingHUD() {
  if (!isRecording) return;
  
  const curTime = audioElement.currentTime;
  const totalTime = audioElement.duration || 1;
  const percentage = (curTime / totalTime) * 100;
  
  // Update progress bars
  exportProgressBar.style.width = `${percentage}%`;
  exportTimeLabel.textContent = formatTime(curTime);
  exportStatusLabel.textContent = `Encoding frames at ${exportFps} FPS...`;

  // SoundCloud seek bars tracking
  seekSlider.value = Math.floor(curTime);
  currentTimeLabel.textContent = formatTime(curTime);
  seekProgressFill.style.width = `${percentage}%`;
}

async function stopRecordingAndSave() {
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    audioElement.pause();
    isPlaying = false;
    btnPlayPause.querySelector('.play-icon').classList.remove('hidden');
    btnPlayPause.querySelector('.pause-icon').classList.add('hidden');
  }
}

// Design style 9: Siri-style AI Voice Assistant Glowing Overlapping Waves
function drawVoiceAssistant(data, bass, mid, volume) {
  const waveCount = 7;
  const width = 800;
  const time = visualizerTime / 200;

  ctx.save();
  // Blend glowing additive overlay layers
  ctx.globalCompositeOperation = 'lighter';

  // 1. Draw a thin, glowing background resting baseline (always active)
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.15)';
  ctx.shadowColor = 'rgba(0, 242, 254, 0.3)';
  ctx.shadowBlur = glowIntensity * 0.5;
  ctx.lineWidth = 1;
  ctx.moveTo(-width / 2, 0);
  for (let i = -width / 2; i <= width / 2; i += 10) {
    const waveY = Math.sin(i * 0.01 - time * 0.2) * 3;
    ctx.lineTo(i, waveY);
  }
  ctx.stroke();

  // Bright premium digital gradients and blends
  const colors = [
    'rgba(0, 242, 254, 0.8)',   // Cyan/Aqua
    'rgba(255, 0, 127, 0.7)',   // Neon Pink/Magenta
    'rgba(127, 0, 255, 0.6)',   // Purple/Violet
    'rgba(0, 255, 127, 0.55)',  // Emerald Green
    'rgba(79, 172, 254, 0.75)',  // Electric Blue
    'rgba(255, 170, 0, 0.6)',   // Bright Gold/Orange
    'rgba(255, 255, 255, 0.55)'  // White Core Highlight
  ];

  // Specific frequencies and mathematical wave phases to create a highly complex, premium iOS siri voice design
  const waveParams = [
    { freq: 4.2, phaseSpeed: 0.14, ampScale: 1.0, power: 3.2, lineWidth: 3.5 },
    { freq: 6.5, phaseSpeed: -0.20, ampScale: 0.75, power: 3.5, lineWidth: 2 },
    { freq: 3.1, phaseSpeed: 0.08, ampScale: 0.6, power: 2.8, lineWidth: 1.5 },
    { freq: 8.2, phaseSpeed: 0.25, ampScale: 0.45, power: 4.0, lineWidth: 1 },
    { freq: 5.0, phaseSpeed: -0.11, ampScale: 0.85, power: 3.0, lineWidth: 2.5 },
    { freq: 2.4, phaseSpeed: 0.06, ampScale: 0.5, power: 2.2, lineWidth: 1.5 },
    { freq: 9.0, phaseSpeed: 0.32, ampScale: 0.35, power: 4.5, lineWidth: 0.8 }
  ];

  for (let w = 0; w < waveCount; w++) {
    const params = waveParams[w];
    ctx.strokeStyle = colors[w];
    ctx.shadowColor = colors[w];
    ctx.shadowBlur = glowIntensity * 0.95;
    ctx.lineWidth = params.lineWidth;

    ctx.beginPath();

    // Map audio intensity spectrum
    const fIdx = Math.floor((w / waveCount) * (bufferLength * 0.45));
    const audioMultiplier = (data[fIdx] * sensitivity) / 255;
    
    // Scale amplitude dynamic pulse (add a small breathing term so waves wiggle slightly when silent)
    const silentPulse = Math.sin(time * 0.5 + w) * 4;
    const peakAmplitude = 200 * (volume * 0.35 + audioMultiplier * 0.65 + bass * 0.15) + silentPulse;

    const points = 120; // higher density points for smoother lines
    const phase = time * params.phaseSpeed;

    for (let i = 0; i <= points; i++) {
      const pct = i / points;
      const x = -width / 2 + pct * width;

      // Teardrop Gabor-like mathematical envelope: flattens at edges, peaks in middle
      const envelope = Math.pow(Math.sin(pct * Math.PI), params.power);

      // Undulate glowing overlapping sine waves
      const y = Math.sin(pct * Math.PI * params.freq + phase) * peakAmplitude * envelope;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  ctx.restore();
}

// Run initial configurations
init();

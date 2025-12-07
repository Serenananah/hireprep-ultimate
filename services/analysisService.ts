import { AnalysisMetrics } from "../types";

// Types for Global Libraries (loaded via CDN in index.html)
declare global {
  interface Window {
    FaceMesh: any;
  }
}

/**
 * Real-time Analysis Service
 * Handles Web Audio API & MediaPipe Face Mesh
 * 
 * UPGRADES (Ultra Real-time Version):
 * 1. Audio window shortened to 0.5s for highly reactive speech metrics.
 * 2. Volume stability uses only last 5 RMS frames (more sensitive).
 * 3. Eye-contact smoothing window reduced to 3 frames (near frame-level).
 */
class AnalysisService {
  // Audio
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  
  // Rolling History
  private speechHistory: { time: number; isSpeech: boolean }[] = [];
  private rmsValues: number[] = [];
  private lastSpeechTimestamp: number = 0; // Track when user last spoke
  
  // Video
  private faceMesh: any | null = null;
  private gazeHistory: boolean[] = []; 
  
  // State
  private isRunning: boolean = false;
  
  public currentMetrics: AnalysisMetrics = {
    speechRate: 0,
    pauseRatio: 0,
    volumeStability: 10,
    eyeContact: 100,
    confidence: 100,
    clarity: 8
  };

  /**
   * Initialize Audio Analysis
   */
  async initAudio(stream: MediaStream) {
    if (this.audioContext) return; // Prevent double init
    
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);
    
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.isRunning = true;
    this.processAudioLoop();
  }

  /**
   * Initialize Video Analysis (FaceMesh)
   */
  async initVideo(videoElement: HTMLVideoElement) {
    if (!window.FaceMesh) {
      console.error("MediaPipe FaceMesh not loaded. Waiting...");
      // Simple retry logic
      setTimeout(() => this.initVideo(videoElement), 500);
      return;
    }
    
    // Safety check: ensure video is actually ready
    if (videoElement.readyState < 2) {
       console.warn("Video not ready yet, retrying in 100ms...");
       setTimeout(() => this.initVideo(videoElement), 100);
       return;
    }

    this.faceMesh = new window.FaceMesh({
      // Use the latest generic CDN path. This works with the unpinned script tag in index.html
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // IMPORTANT: Enables Iris landmarks (468-477)
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.faceMesh.onResults(this.onFaceResults.bind(this));

    // Manual Loop - More robust than CameraUtils in React
    const processFrame = async () => {
        if (!this.isRunning) return;
        
        if (videoElement && videoElement.readyState === 4) {
            try {
                await this.faceMesh.send({ image: videoElement });
            } catch (e) {
                // Ignore dropped frames
            }
        }
        requestAnimationFrame(processFrame);
    };
    
    this.isRunning = true;
    processFrame();
  }

  /**
   * Stop all sensors
   */
  stop() {
    this.isRunning = false;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.rmsValues = [];
    this.gazeHistory = [];
    this.speechHistory = [];
    this.lastSpeechTimestamp = 0;
  }

  // --- AUDIO PROCESSING LOGIC ---
  private processAudioLoop() {
    if (!this.isRunning || !this.analyser || !this.dataArray) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i] * this.dataArray[i];
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    // 对音量做对数压缩（logarithmic compressor），音频行业常用做法
    // Prevent log(0)
    const safe = rms + 1;
    // Logarithmic compression to prevent easy saturation
    const level = (Math.log10(safe) / Math.log10(200)) * 100;
    // Clamp to 0–100
    this.currentMetrics.audioLevel = Math.max(0, Math.min(100, Math.round(level)));


    
    // Track Volume Stability (super short history for high sensitivity)
    if (rms > 5) { 
        this.rmsValues.push(rms);
        if (this.rmsValues.length > 5) this.rmsValues.shift(); // only last 5 frames
    }

    const now = Date.now();
    const SILENCE_THRESHOLD = 15; // Adjusted threshold
    const isSpeech = rms > SILENCE_THRESHOLD;
    
    if (isSpeech) {
      this.lastSpeechTimestamp = now;
    }

    this.speechHistory.push({ time: now, isSpeech });

    // Ultra real-time window: keep last 0.5 seconds
    const WINDOW_MS = 500; // 0.5s window for highly reactive metrics
    if (this.speechHistory.length > 0) {
        while (this.speechHistory.length > 0 && (now - this.speechHistory[0].time > WINDOW_MS)) {
            this.speechHistory.shift();
        }
    }

    this.calculateAudioMetrics();
    requestAnimationFrame(() => this.processAudioLoop());
  }

  private calculateAudioMetrics() {
    // 1. Stability
    let stability = 10;
    if (this.rmsValues.length > 1) {
      const mean = this.rmsValues.reduce((a, b) => a + b, 0) / this.rmsValues.length;
      const variance = this.rmsValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.rmsValues.length;
      stability = Math.max(0, 10 - Math.sqrt(variance) / 5);
    }
    this.currentMetrics.volumeStability = Number(stability.toFixed(1));

    // 2. Strict WPM Logic
    const SILENCE_TIMEOUT = 500; // 500ms silence = stop counting
    const timeSinceSpeech = Date.now() - this.lastSpeechTimestamp;
    const isActuallySpeaking = timeSinceSpeech < SILENCE_TIMEOUT;

    if (!isActuallySpeaking) {
      // FORCE 0 when silent
      this.currentMetrics.speechRate = 0;
      this.currentMetrics.pauseRatio = 100; 
    } else {
      // Calculate WPM based on recent speech frames
      let speechFrames = 0;
      let totalFrames = this.speechHistory.length;

      for (const frame of this.speechHistory) {
          if (frame.isSpeech) speechFrames++;
      }

      // Approx 60 "frames" per second for this history
      const windowSeconds = totalFrames > 0 ? (totalFrames / 60) : 0.5; // fallback ~0.5s
      
      const activeSeconds = (speechFrames / 60);
      
      // Factor: 1 active second ~ 2.5 words
      const estimatedWords = activeSeconds * 2.5; 
      const wpm = windowSeconds > 0 ? (estimatedWords * 60) / windowSeconds : 0;
      
      this.currentMetrics.speechRate = Math.round(wpm);
      this.currentMetrics.pauseRatio = totalFrames > 0 ? Number(((1 - (speechFrames/totalFrames)) * 100).toFixed(1)) : 0;
    }
  }

  // --- VIDEO PROCESSING LOGIC ---
  private onFaceResults(results: any) {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const isLooking = this.checkGaze(landmarks);
      
      // Super short history for near real-time eye-contact
      this.gazeHistory.push(isLooking);
      if (this.gazeHistory.length > 20) this.gazeHistory.shift();
      const lookingCount = this.gazeHistory.filter(Boolean).length;
      const total = this.gazeHistory.length;
      // STRICT THRESHOLD — change this number to make it harder
      const THRESHOLD = 0.75; // 75% of frames must show eye contact
      let eyeContactScore = (lookingCount / total) * 100;
      // Apply strict rule: if below threshold, heavily penalize
      if ((lookingCount / total) < THRESHOLD) {
          eyeContactScore *= (lookingCount / total); 
      }
      this.currentMetrics.eyeContact = Math.round(eyeContactScore);

      // --- ADAPTIVE CONFIDENCE ---
      const isSpeaking = this.currentMetrics.speechRate > 0;

      if (isSpeaking) {
        // Speaking Confidence: Mix of Eye Contact, Volume Stability, and Pace
        // Pace Penalty: Too fast (>180) or too slow (<80) reduces confidence
        let paceScore = 100;
        if (this.currentMetrics.speechRate > 180) paceScore = 70;
        if (this.currentMetrics.speechRate < 80) paceScore = 60;

        const stabilityScore = this.currentMetrics.volumeStability * 10; 

        this.currentMetrics.confidence = Math.round(
          (this.currentMetrics.eyeContact * 0.4) + 
          (stabilityScore * 0.3) + 
          (paceScore * 0.3)
        );
      } else {
        // Listening Confidence: Purely Eye Contact
        // If you look at the interviewer while listening, you are confident.
        this.currentMetrics.confidence = this.currentMetrics.eyeContact;
      }

    } else {
      this.currentMetrics.eyeContact = 0;
      this.currentMetrics.confidence = 0; 
    }
  }

  /**
   * IRIS TRACKING
   * Uses Iris Landmarks (468, 473) vs Eye Corners to detect if user is looking at screen.
   */
  private checkGaze(landmarks: any[]): boolean {
    // 1. Head Pose (Gross check)
    const nose = landmarks[1];
    if (nose.x < 0.40 || nose.x > 0.60) return false; // Turned away

    // 2. Iris Logic
    // Left Eye indices (from observer): Inner 362, Outer 263, Iris 473
    // Right Eye indices (from observer): Inner 33, Outer 133, Iris 468
    
    const getRatio = (inner: any, outer: any, iris: any) => {
        const eyeWidth = Math.abs(outer.x - inner.x);
        const irisPos = Math.abs(iris.x - inner.x);
        return eyeWidth > 0 ? (irisPos / eyeWidth) : 0.5;
    };

    const rightEyeRatio = getRatio(landmarks[33], landmarks[133], landmarks[468]);
    const leftEyeRatio = getRatio(landmarks[362], landmarks[263], landmarks[473]);

    // Center is approx 0.5. Allow 0.4 - 0.6 range.
    const isLooking = 
        (rightEyeRatio > 0.40 && rightEyeRatio < 0.60) &&
        (leftEyeRatio > 0.40 && leftEyeRatio < 0.60);

    return isLooking;
  }
}

export const analysisService = new AnalysisService();

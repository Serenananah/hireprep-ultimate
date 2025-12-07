// services/geminiService.ts
import { GoogleGenAI, LiveServerMessage, FunctionDeclaration, Modality } from "@google/genai";
import { InterviewConfig } from "../types";

// --- CONFIGURATION ---
const API_KEY = process.env.API_KEY;
const MODEL = "gemini-2.0-flash-exp";

// --- AUDIO CONSTANTS ---
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

export interface LiveClientEvents {
  onOpen: () => void;
  onClose: (event: CloseEvent) => void;
  onError: (error: Event) => void;
  onAudioData: (audioBuffer: AudioBuffer) => void;
  onTranscript: (text: string, isUser: boolean, isFinal: boolean) => void;
  onToolCall: (toolName: string, args: any) => Promise<any>;
}

export class GeminiLiveClient {
  private ai: GoogleGenAI;
  private session: any = null;

  private audioContext: AudioContext | null = null;
  private inputProcessor: ScriptProcessorNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;

  private lastSpeechTime = 0;
  private isSpeaking = false;

  private nextStartTime = 0;
  private audioQueue: AudioBufferSourceNode[] = [];

  // ⭐ 最关键修复：控制 WS 发送状态
  private isSessionOpen = false;
  private ws: WebSocket | null = null;

  constructor(private events: LiveClientEvents) {
    if (!API_KEY) {
      throw new Error("API_KEY is not set");
    }
    this.ai = new GoogleGenAI({ apiKey: API_KEY });
  }

  /** ---------------- CONNECT ---------------- **/
  public async connect(config: InterviewConfig) {
    this.disconnect(); // 清状态

    const roleTitle = config.role?.title || "Candidate";
    const difficultyLevel = config.difficulty;

    // 完整系统指令（保持不变）
    const systemInstruction = `
    You are Sarah, an expert AI Interview Coach.
    Role: ${roleTitle}
    Industry: ${config.industry}
    Duration: ${config.duration} minutes
    Difficulty: ${difficultyLevel}

    Resume: ${config.resumeText.slice(0, 2000)}...
    JD: ${config.jdText.slice(0, 2000)}...

    Interview Phases:
    - Introduction
    - Structured Interview (resume, behavioral, technical)
    - Wrap-up

    Behavior rules:
    - Ask one question at a time.
    - Use candidate's resume.
    - Be realistic and conversational.
    `;

    const saveAssessmentTool: FunctionDeclaration = {
      name: "save_assessment",
      description: "Capture assessment.",
      parameters: {
        type: "OBJECT",
        properties: {},
        required: []
      }
    };

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: OUTPUT_SAMPLE_RATE
    });

    try {
      const liveConn = await this.ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
          systemInstruction,
          tools: [{ functionDeclarations: [saveAssessmentTool] }]
        },
        callbacks: {
          onopen: () => {
            console.log("[GeminiLive] WebSocket OPEN");
            this.isSessionOpen = true;
            this.events.onOpen();
          },
          onmessage: (msg) => this.safeHandleMessage(msg),
          onclose: (ev) => {
            console.log("[GeminiLive] CLOSED");
            this.isSessionOpen = false;
            this.events.onClose(ev as unknown as CloseEvent);
          },
          onerror: (ev) => {
            console.error("[GeminiLive] ERROR", ev);
            this.isSessionOpen = false;
            this.events.onError(ev as unknown as Event);
          }
        }
      });

      this.session = liveConn;
      this.ws = liveConn.websocket;

    } catch (err) {
      console.error("[GeminiLive] Connection failed:", err);
      this.events.onError(new Event("ConnectionFailed"));
    }
  }

  /** ---------------- MESSAGE HANDLER ---------------- **/
  private async safeHandleMessage(message: LiveServerMessage) {
    if (!this.isSessionOpen) return;

    const parts = message.serverContent?.modelTurn?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) this.queueAudio(part.inlineData.data);
        if (part.text) this.events.onTranscript(part.text, false, false);
      }
    }

    if (message.toolCall) {
      for (const call of message.toolCall.functionCalls) {
        await this.events.onToolCall(call.name, call.args).catch(console.error);
      }
    }
  }

  /** ---------------- SAFE SEND ---------------- **/
  private safeSend(data: any) {
    if (!this.isSessionOpen || !this.session || !this.ws) return;
    if (this.ws.readyState !== WebSocket.OPEN) return;

    try {
      this.session.sendRealtimeInput(data);
    } catch (err) {
      console.warn("[SendBlocked] WS Closed:", err);
    }
  }

  /** ---------------- SEND CONTROL ---------------- **/
  public async sendControlMessage(text: string) {
    this.safeSend({ content: [{ text: `[SYSTEM]: ${text}` }] });
  }

  /** ---------------- DISCONNECT ---------------- **/
  public async disconnect() {
    this.stopAudioInput();
    this.isSessionOpen = false;

    // 尝试关闭 session（异步）
    if (this.session) {
      try {
        await this.session.close();
      } catch {}
    }

    this.session = null;
    this.ws = null;

    // 清 audio queue
    this.audioQueue.forEach((s) => s.stop());
    this.audioQueue = [];

    if (this.audioContext) {
      try { await this.audioContext.close(); } catch {}
      this.audioContext = null;
    }
  }

  /** ---------------- MICROPHONE STREAM ---------------- **/
  public async startAudioInput(stream: MediaStream) {
    if (!this.audioContext) return;

    this.inputSource = this.audioContext.createMediaStreamSource(stream);
    this.inputProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.inputProcessor.onaudioprocess = (e) => {
      if (!this.isSessionOpen || !this.session) return;

      try {
        const input = e.inputBuffer.getChannelData(0);

        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        const rms = Math.sqrt(sum / input.length);
        const now = Date.now();

        if (rms > 0.02) {
          this.isSpeaking = true;
          this.lastSpeechTime = now;
        }

        if (now - this.lastSpeechTime > 1200) {
          this.isSpeaking = false;
        }

        let pcm16;
        if (this.isSpeaking) {
          pcm16 = this.downsample(input, this.audioContext!.sampleRate, INPUT_SAMPLE_RATE);
        } else {
          pcm16 = new Int16Array(320).fill(0);
        }

        this.safeSend({
          media: {
            mimeType: "audio/pcm;rate=16000",
            data: this.toBase64(pcm16.buffer)
          }
        });

      } catch (err) {
        console.error("[AudioError]", err);
      }
    };

    this.inputSource.connect(this.inputProcessor);
    this.inputProcessor.connect(this.audioContext.destination);
  }

  public stopAudioInput() {
    if (this.inputProcessor) {
      this.inputProcessor.onaudioprocess = null;   // ⭐ 必须清除，否则残留音频继续发
      try { this.inputProcessor.disconnect(); } catch {}
      this.inputProcessor = null;
    }

    if (this.inputSource) {
      try { this.inputSource.disconnect(); } catch {}
      this.inputSource = null;
    }
  }

  /** ---------------- AUDIO OUTPUT ---------------- **/
  private async queueAudio(base64Data: string) {
    if (!this.audioContext || !this.isSessionOpen) return;

    try {
      const pcm = this.fromBase64(base64Data);
      const audioBuffer = this.createAudioBuffer(pcm);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      const t = this.audioContext.currentTime;
      if (this.nextStartTime < t) this.nextStartTime = t;

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      this.audioQueue.push(source);
      source.onended = () => {
        this.audioQueue = this.audioQueue.filter((s) => s !== source);
      };

      this.events.onAudioData(audioBuffer);
    } catch (err) {
      console.error("[QueueAudioError]", err);
    }
  }

  private createAudioBuffer(pcm: Int16Array) {
    const buf = this.audioContext!.createBuffer(1, pcm.length, OUTPUT_SAMPLE_RATE);
    const channel = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
    return buf;
  }

  /** ---------------- HELPERS ---------------- **/
  private fromBase64(base64: string): Int16Array {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  private toBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  private downsample(buffer: Float32Array, inputRate: number, outputRate: number) {
    const compression = inputRate / outputRate;
    const length = Math.floor(buffer.length / compression);
    const result = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const s = buffer[Math.floor(i * compression)];
      result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return result;
  }
}

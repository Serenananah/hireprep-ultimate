// services/geminiService.ts
import { GoogleGenAI, LiveServerMessage, Type, FunctionDeclaration, Modality } from "@google/genai";
import { InterviewConfig } from "../types";

// --- CONFIGURATION ---
const API_KEY = process.env.API_KEY;  // ⚠ 保留你的原逻辑
const MODEL = "gemini-2.0-flash-exp"; 

// --- AUDIO CONSTANTS ---
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

// --- TYPES ---
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
  private connectPromise: Promise<any> | null = null;

  // ✅ 修复 WebSocket 已关闭仍发送的问题
  private isSessionOpen = false;

  constructor(private events: LiveClientEvents) {
    if (!API_KEY) {
      throw new Error("API_KEY is not set");
    }
    this.ai = new GoogleGenAI({ apiKey: API_KEY });
  }

  /** --- CONNECT --- **/
  public async connect(config: InterviewConfig) {
    this.disconnect(); // clean previous session

    // Build your system instruction (unchanged)
    const systemInstruction = `Interview logic unchanged ...`;

    const saveAssessmentTool: FunctionDeclaration = {
      name: "save_assessment",
      description: "Log the assessment result.",
      parameters: {
        type: "OBJECT",
        properties: {},
        required: []
      }
    };

    // Create output audio context
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: OUTPUT_SAMPLE_RATE,
    });

    try {
      this.connectPromise = this.ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [saveAssessmentTool] }]
        },
        callbacks: {
          onopen: () => {
            console.log("[GeminiLive] Connected");
            this.isSessionOpen = true;     // ⭐ mark session active
            this.events.onOpen();
          },
          onmessage: async (msg) => {
            if (!this.isSessionOpen) return;  // ⭐ protect closed socket
            await this.handleServerMessage(msg);
          },
          onclose: (ev) => {
            console.log("[GeminiLive] Closed");
            this.isSessionOpen = false;    // ⭐ mark session closed
            this.events.onClose(ev as unknown as CloseEvent);
          },
          onerror: (ev) => {
            console.error("[GeminiLive] Error", ev);
            this.isSessionOpen = false;    // ⭐ prevent further sending
            this.events.onError(ev as unknown as Event);
          }
        }
      });

      this.session = await this.connectPromise;
    } catch (e) {
      console.error("[GeminiLive] Connection failed", e);
      this.isSessionOpen = false;
      this.events.onError(new Event("ConnectionFailed"));
    }
  }

  /** --- SAFELY SEND CONTROL MESSAGE --- **/
  public async sendControlMessage(text: string) {
    if (!this.session || !this.isSessionOpen) {
      console.warn("sendControlMessage blocked: session closed");
      return;
    }

    try {
      await this.session.sendRealtimeInput({
        content: [{ text: `[SYSTEM_INSTRUCTION]: ${text}` }],
      });
    } catch (e) {
      console.error("Failed to send control message", e);
    }
  }

  /** --- HANDLE SERVER MESSAGE --- **/
  private async handleServerMessage(message: LiveServerMessage) {
    if (!this.isSessionOpen) return;

    const parts = message.serverContent?.modelTurn?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) {
          this.queueAudio(part.inlineData.data);
        }
        if (part.text) {
          this.events.onTranscript(part.text, false, false);
        }
      }
    }

    if (message.toolCall) {
      this.handleToolCall(message.toolCall);
    }
  }

  private async handleToolCall(toolCall: any) {
    if (!this.isSessionOpen) return;

    for (const call of toolCall.functionCalls) {
      try {
        await this.events.onToolCall(call.name, call.args);

        if (this.session && this.isSessionOpen) {
          this.session.sendToolResponse({
            functionResponses: [
              { name: call.name, id: call.id, response: { result: "assessment_saved" } },
            ],
          });
        }
      } catch (e) {
        console.error("Tool execution failed", e);
      }
    }
  }

  /** --- DISCONNECT --- **/
  public disconnect() {
    this.stopAudioInput();

    this.isSessionOpen = false;  // ⭐ block all further sending

    if (this.session && typeof this.session.close === "function") {
      try {
        this.session.close();
      } catch {}
    }

    this.session = null;
    this.connectPromise = null;

    this.audioQueue.forEach((s) => s.stop());
    this.audioQueue = [];

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /** --- MICROPHONE STREAM --- **/
  public async startAudioInput(stream: MediaStream) {
    if (!this.audioContext) return;

    this.inputSource = this.audioContext.createMediaStreamSource(stream);
    this.inputProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.inputProcessor.onaudioprocess = (e) => {
      // ⭐ BLOCK sending if session is closed
      if (!this.session || !this.isSessionOpen) return;

      try {
        const inputData = e.inputBuffer.getChannelData(0);

        // simple energy detector
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        const rms = Math.sqrt(sum / inputData.length);
        const now = Date.now();

        if (rms > 0.02) {
          this.isSpeaking = true;
          this.lastSpeechTime = now;
        }
        if (now - this.lastSpeechTime > 2000) {
          this.isSpeaking = false;
        }

        let pcm16;

        if (this.isSpeaking) {
          pcm16 = this.downsampleBuffer(inputData, this.audioContext!.sampleRate, INPUT_SAMPLE_RATE);
        } else {
          const len = Math.floor(inputData.length * (INPUT_SAMPLE_RATE / this.audioContext!.sampleRate));
          pcm16 = new Int16Array(len).fill(0);
        }

        if (!pcm16 || !pcm16.buffer) return;

        if (!this.isSessionOpen) return; // ⭐ double-protect

        const base64Audio = this.arrayBufferToBase64(pcm16.buffer);

        this.session.sendRealtimeInput({
          media: {
            mimeType: "audio/pcm;rate=16000",
            data: base64Audio,
          },
        });

      } catch (err) {
        console.error("Audio Input Processing Error:", err);
      }
    };

    this.inputSource.connect(this.inputProcessor);
    this.inputProcessor.connect(this.audioContext.destination);
  }

  public stopAudioInput() {
    if (this.inputProcessor) {
      this.inputProcessor.disconnect();
      this.inputProcessor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
  }

  /** --- AUDIO OUTPUT --- **/
  private async queueAudio(base64Data: string) {
    if (!this.audioContext || !this.isSessionOpen) return;

    try {
      const pcmData = this.base64ToPCM(base64Data);
      if (pcmData.length === 0) return;

      const audioBuffer = this.createAudioBuffer(pcmData);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      const currentTime = this.audioContext.currentTime;
      if (this.nextStartTime < currentTime) this.nextStartTime = currentTime;

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      this.audioQueue.push(source);
      source.onended = () => {
        this.audioQueue = this.audioQueue.filter((s) => s !== source);
      };

      this.events.onAudioData(audioBuffer);

    } catch (e) {
      console.error("Audio queueing error:", e);
    }
  }

  /** --- HELPERS --- **/
  private createAudioBuffer(pcmData: Int16Array): AudioBuffer {
    if (!this.audioContext) throw new Error("No AudioContext");
    const buffer = this.audioContext.createBuffer(1, pcmData.length, OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcmData.length; i++) channel[i] = pcmData[i] / 32768.0;
    return buffer;
  }

  private base64ToPCM(base64: string): Int16Array {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Int16Array(bytes.buffer);
    } catch {
      return new Int16Array(0);
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number): Int16Array {
    if (inputRate === outputRate) return this.floatTo16(buffer);
    const compression = inputRate / outputRate;
    const length = Math.floor(buffer.length / compression);
    const result = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const idx = Math.floor(i * compression);
      const s = Math.max(-1, Math.min(1, buffer[idx]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return result;
  }

  private floatTo16(input: Float32Array): Int16Array {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
}

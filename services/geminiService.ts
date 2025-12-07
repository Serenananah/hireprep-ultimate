
import { GoogleGenAI, LiveServerMessage, Type, FunctionDeclaration, Modality } from "@google/genai";
import { InterviewConfig, Difficulty } from "../types";

// --- CONFIGURATION ---
const API_KEY = process.env.API_KEY;
const MODEL = "gemini-2.0-flash-exp"; 

// --- AUDIO CONSTANTS ---
const INPUT_SAMPLE_RATE = 16000; // Gemini expects 16kHz
const OUTPUT_SAMPLE_RATE = 24000; // Gemini sends 24kHz

// --- TYPES ---
export interface LiveClientEvents {
  onOpen: () => void;
  onClose: (event: CloseEvent) => void;
  onError: (error: Event) => void;
  onAudioData: (audioBuffer: AudioBuffer) => void;
  onTranscript: (text: string, isUser: boolean, isFinal: boolean) => void;
  onToolCall: (toolName: string, args: any) => Promise<any>;
}

/**
 * GEMINI LIVE CLIENT (SDK VERSION)
 * Uses the official @google/genai SDK to manage the Live session.
 */
export class GeminiLiveClient {
  private ai: GoogleGenAI;
  private session: any = null;
  private audioContext: AudioContext | null = null;
  private inputProcessor: ScriptProcessorNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  
  // VAD State
  private lastSpeechTime = 0;
  private isSpeaking = false;
  
  // Audio Playback Queue
  private nextStartTime: number = 0;
  private audioQueue: AudioBufferSourceNode[] = [];
  
  // Connection Promise
  private connectPromise: Promise<any> | null = null;

  constructor(private events: LiveClientEvents) {
    if (!API_KEY) {
      throw new Error("API_KEY is not set");
    }
    this.ai = new GoogleGenAI({ apiKey: API_KEY });
  }

  /**
   * Connect to Gemini Live API using SDK
   */
  public async connect(config: InterviewConfig) {
    this.disconnect(); // Ensure clean state

    // 1. Calculate Plan based on Duration/Difficulty
    // Strategy: Mix Resume Deep-Dive, Behavioral, and Technical/Scenario
    let questionCount = 3;
    let topicMix = "1 Resume Deep-Dive, 1 Behavioral, 1 Technical Scenario";
    
    if (config.duration >= 30) {
      questionCount = 7;
      topicMix = "2 Resume Deep-Dive, 2 Behavioral, 3 Technical (Role-Specific Scenarios)";
    } else if (config.duration >= 20) {
      questionCount = 5;
      topicMix = "2 Resume Deep-Dive, 1 Behavioral, 2 Technical (Role-Specific Scenarios)";
    }

    const roleTitle = config.role?.title || "Candidate";
    const difficultyLevel = config.difficulty; // Easy/Standard/Hard

    const systemInstruction = `
    You are Sarah, an expert AI Interview Coach.
    
    SESSION PLAN:
    - Role: ${roleTitle} (${config.industry})
    - Duration: ${config.duration} mins
    - Target Question Count: ${questionCount}
    - Topic Strategy: ${topicMix}
    - Difficulty: ${difficultyLevel}
    - Resume Context: ${config.resumeText.slice(0, 2000)}...
    - JD Context: ${config.jdText.slice(0, 2000)}...
    
    INTERVIEW PHASES:
    1. **Introduction**: Brief welcome (keep it short).
    2. **Execution**: Ask questions following the Topic Strategy.
    3. **Wrap-up**: Brief closing after ${questionCount} questions.

    BEHAVIOR:
    - You are conducting a spoken interview.
    - Ask ONE question at a time.
    - **Resume Questions**: Ask specific questions about their actual projects, roles, or skills mentioned in the Resume Context.
    - **Technical/Scenario Questions**: Do NOT just ask definitions. Ask for **Role-Specific Scenarios** (e.g., "How would you design X system?" or "A client disagrees with Y, what do you do?") relevant to the JD and Role.
    - **Behavioral Questions**: Focus on soft skills and STAR method.
    - Natural pauses, thinking sounds ("uh", "um"), and breath sounds are NOT treated as silence.
    - If the user pauses while thinking, remain silent.
    - Do NOT mention "Question 1 of 5" explicitly, just ask naturally.
    - If the user gives a short answer, drill down.

    DIFFICULTY-BASED BEHAVIOR:
    EASY MODE:
    - Tone: warm, gentle, supportive.
    - Ask easy, high-level questions.
    STANDARD MODE:
    - Tone: professional, neutral.
    - Ask realistic mid-level interview questions.
    - Challenge when appropriate, but polite.
    HARD MODE:
    - Tone: firm, serious, no-nonsense.
    - Ask difficult, high-stress scenario or technical questions.
    - Drill down aggressively. Expect high rigor

    
    HIDDEN TOOLS:
    - When the candidate finishes an answer and you are satisfied (or want to move on), call \`save_assessment\`.
    - Calling this tool marks the question as "Done".
    - **CRITICAL**: You MUST provide \`strengths\` (2-3 bullet points) and \`areas_for_improvement\` (2-3 bullet points) in the tool call.
    `;

    // Tool Definition
    const saveAssessmentTool: FunctionDeclaration = {
      name: "save_assessment",
      description: "Log assessment data for the candidate's answer. Call this silently.",
      parameters: {
        type: "OBJECT",
        properties: {
          full_question_text: { type: "STRING", description: "The exact text of the question you just asked the candidate." },
          question_topic: { type: "STRING" },
          user_answer_summary: { type: "STRING" },
          content_score: { type: "NUMBER", description: "1-10" },
          delivery_score: { type: "NUMBER", description: "1-10" },
          feedback: { type: "STRING", description: "Short constructive feedback" },
          strengths: { 
            type: "ARRAY", 
            items: { type: "STRING" }, 
            description: "List of 2-3 specific strengths in the answer" 
          },
          areas_for_improvement: { 
            type: "ARRAY", 
            items: { type: "STRING" }, 
            description: "List of 2-3 specific areas to improve" 
          }
        },
        required: ["full_question_text", "question_topic", "user_answer_summary", "content_score", "delivery_score", "feedback", "strengths", "areas_for_improvement"]
      }
    };

    // Initialize Audio Context for Output
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: OUTPUT_SAMPLE_RATE 
    });

    try {
      this.connectPromise = this.ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO], 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
          },
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [saveAssessmentTool] }]
        },
        callbacks: {
          onopen: () => {
            console.log("[GeminiLive] Connected via SDK");
            this.events.onOpen();
          },
          onmessage: async (message: LiveServerMessage) => {
            await this.handleServerMessage(message);
          },
          onclose: (e) => {
            console.log("[GeminiLive] Closed");
            this.events.onClose(e as unknown as CloseEvent); 
          },
          onerror: (e) => {
            console.error("[GeminiLive] Error", e);
            this.events.onError(e as unknown as Event);
          }
        }
      });
      
      this.session = await this.connectPromise;

    } catch (e) {
      console.error("[GeminiLive] Connection failed", e);
      this.events.onError(new Event("ConnectionFailed"));
    }
  }

  /**
   * Send a "Hidden" text command to the model to steer behavior
   */
  public async sendControlMessage(text: string) {
    if (!this.session) return;
    try {
      await this.session.sendRealtimeInput({
        content: [{ text: `[SYSTEM_INSTRUCTION]: ${text}` }]
      });
    } catch (e) {
      console.error("Failed to send control message", e);
    }
  }

  /**
   * Handle incoming messages from the SDK
   */
  private async handleServerMessage(message: LiveServerMessage) {
    const parts = message.serverContent?.modelTurn?.parts;
    
    // 1. Handle Audio/Text Output
    if (parts) {
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                this.queueAudio(part.inlineData.data);
            }
            if (part.text) {
                this.events.onTranscript(part.text, false, false);
            }
        }
    }
    
    // 2. Handle Tool Calls
    if (message.toolCall) {
        this.handleToolCall(message.toolCall);
    }
  }

  private async handleToolCall(toolCall: any) {
    for (const call of toolCall.functionCalls) {
        console.log("[GeminiLive] Tool Call:", call.name);
        try {
           await this.events.onToolCall(call.name, call.args);
           
           // Send response back
           this.session?.sendToolResponse({
             functionResponses: [{
               name: call.name,
               id: call.id,
               response: { result: "assessment_saved" }
             }]
           });
        } catch (e) {
           console.error("Tool execution failed", e);
        }
      }
  }

  /**
   * Disconnect and cleanup
   */
  public disconnect() {
    this.stopAudioInput();
    
    if (this.session && typeof (this.session as any).close === 'function') {
        (this.session as any).close();
    }
    
    this.session = null;
    this.connectPromise = null;

    this.audioQueue.forEach(source => source.stop());
    this.audioQueue = [];
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * Start Microphone Streaming with VAD
   */
  public async startAudioInput(stream: MediaStream) {
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();

    this.inputSource = this.audioContext.createMediaStreamSource(stream);
    this.inputProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.inputProcessor.onaudioprocess = (e) => {
      if (!this.session) return;

      try {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // --- VAD LOGIC ---
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const now = Date.now();

        // Threshold: 0.01 is a reasonable noise floor
        if (rms > 0.02) {
            this.isSpeaking = true;
            this.lastSpeechTime = now;
        }
        
        // Hangover time: Keep active for 1500ms after speech stops to prevent interruptions
        if (now - this.lastSpeechTime > 2000) {
            this.isSpeaking = false;
        }

        // --- SEND DATA OR SILENCE ---
        let pcm16: Int16Array;
        
        if (this.isSpeaking) {
            pcm16 = this.downsampleBuffer(inputData, this.audioContext!.sampleRate, INPUT_SAMPLE_RATE);
        } else {
            // Send silence frame to keep connection alive
            const len = Math.floor(inputData.length * (INPUT_SAMPLE_RATE / this.audioContext!.sampleRate));
            pcm16 = new Int16Array(len).fill(0);
        }
        
        // CRITICAL CHECK: Ensure we have a valid buffer before converting
        if (pcm16 && pcm16.buffer) {
            const base64Audio = this.arrayBufferToBase64(pcm16.buffer);
            this.session.sendRealtimeInput({
                media: {
                mimeType: "audio/pcm;rate=16000",
                data: base64Audio
                }
            });
        }
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

  // --- AUDIO PROCESSING HELPERS ---

  private async queueAudio(base64Data: string) {
    if (!this.audioContext || !base64Data) return;

    try {
        const pcmData = this.base64ToPCM(base64Data);
        if (pcmData.length === 0) return;

        const audioBuffer = this.createAudioBuffer(pcmData);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        const currentTime = this.audioContext.currentTime;
        if (this.nextStartTime < currentTime) {
          this.nextStartTime = currentTime;
        }

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        
        this.audioQueue.push(source);
        source.onended = () => {
          this.audioQueue = this.audioQueue.filter(s => s !== source);
        };

        this.events.onAudioData(audioBuffer);
    } catch (e) {
        console.error("Audio queueing error:", e);
    }
  }

  private createAudioBuffer(pcmData: Int16Array): AudioBuffer {
    if (!this.audioContext) throw new Error("No AudioContext");
    const buffer = this.audioContext.createBuffer(1, pcmData.length, OUTPUT_SAMPLE_RATE);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 32768.0;
    }
    return buffer;
  }

  private base64ToPCM(base64: string): Int16Array {
    if (!base64) return new Int16Array(0);
    try {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Int16Array(bytes.buffer);
    } catch (e) {
        return new Int16Array(0);
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number): Int16Array {
    if (outputRate === inputRate) {
        return this.floatTo16BitPCM(buffer);
    }
    const compression = inputRate / outputRate;
    const length = Math.floor(buffer.length / compression);
    const result = new Int16Array(length);

    for (let i = 0; i < length; i++) {
      const inputIndex = Math.floor(i * compression);
      const sample = Math.max(-1, Math.min(1, buffer[inputIndex])); 
      result[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    return result;
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }
}

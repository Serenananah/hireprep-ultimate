
export interface GalaxyConfig {
  count: number;
  size: number;
  radius: number;
  branches: number;
  spin: number;
  randomness: number;
  randomnessPower: number;
  insideColor: string;
  outsideColor: string;
}

export type RGB = { r: number; g: number; b: number };

export enum Page {
  LANDING = 'LANDING',
  AUTH = 'AUTH',
  SETUP = 'SETUP',
  INTERVIEW = 'INTERVIEW',
  FEEDBACK = 'FEEDBACK'
}

export enum Difficulty {
  EASY = 'Easy',
  STANDARD = 'Standard',
  HARD = 'Hard'
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  avatar?: string;
  createdAt?: number;
}

export interface JobRole {
  id: string;
  industry: string;
  title: string;
  level: string;
  tags?: string[];
}

// --- PERCEPTION & METRICS ---
export interface AnalysisMetrics {
  speechRate: number;      // WPM (Words Per Minute)
  pauseRatio: number;      // % of silence
  volumeStability: number; // 0-10 Score (based on RMS Variance)
  eyeContact: number;      // % of time looking at camera
  confidence: number;      // 0-100 Score
  clarity: number;         // 0-10 Score
  audioLevel: number;        // Current audio input level (RMS)
}

// --- LIVE SESSION TYPES ---
export type LiveConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface InterviewConfig {
  industry: string;
  role: JobRole | null;
  duration: number; // minutes
  difficulty: Difficulty;
  jdText: string;
  resumeText: string;
}

export interface Message {
  role: 'ai' | 'user';
  text: string;
  timestamp: number;
}

export interface QuestionAnalysis {
  questionId: number;
  questionText: string; // Inferred from context or explicit
  userAnswer: string;   // Summary or transcript
  metrics: AnalysisMetrics; // Snapshot at that moment
  contentScore: number; 
  deliveryScore: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
}

export interface InterviewSession {
  id: string;
  config: InterviewConfig;
  transcript: Message[];
  analyses: QuestionAnalysis[];
  startTime: number;
  endTime?: number;
}

// --- STATE MANAGEMENT ---
export interface InterviewState {
  connectionState: LiveConnectionState;
  config: InterviewConfig;
  transcript: Message[];
  analyses: QuestionAnalysis[];
  
  // Progress Tracking
  currentQuestionIndex: number;
  totalQuestions: number;

  // Real-time text buffers
  currentQuestionText: string; // <--- ADDED: The question AI is currently asking
  realtimeInputText: string;  // User is saying...
  realtimeOutputText: string; // AI is saying... (Used for log, usually synced with currentQuestionText)
}

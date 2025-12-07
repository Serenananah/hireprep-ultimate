
import React, { useState, useEffect, useRef } from 'react';
import { InterviewSession, InterviewState, AnalysisMetrics } from '../types';
import GlassCard from '../components/GlassCard';
import { Mic, MicOff, Video, VideoOff, Power, MessageSquare, User, Activity, Wifi, HelpCircle, ChevronRight } from 'lucide-react';
import Webcam from 'react-webcam';
import { analysisService } from '../services/analysisService';
import { InterviewGraph } from '../services/interviewGraph';

interface InterviewPageProps {
  session: InterviewSession;
  onEndInterview: (s: InterviewSession) => void;
}

const InterviewPage: React.FC<InterviewPageProps> = ({ session, onEndInterview }) => {
  // --- STATE ---
  const [graph, setGraph] = useState<InterviewGraph | null>(null);
  const [state, setState] = useState<InterviewState | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  
  // Refs
  const webcamRef = useRef<Webcam>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // --- HANDLERS ---
  const handleEndSession = () => {
    if (state) {
        onEndInterview({
            ...session,
            analyses: state.analyses,
            transcript: state.transcript
        });
    }
  };

  // --- INIT GRAPH ---
  useEffect(() => {
    // Pass the end session callback to the graph so it can trigger auto-completion
    const newGraph = new InterviewGraph(session.config, handleEndSession);
    const unsubscribe = newGraph.subscribe(setState);
    setGraph(newGraph);
    return () => {
      unsubscribe();
      newGraph.stopSession();
    };
  }, [session.config]); // Careful with dependencies, ensure handleEndSession is stable or excluded if it doesn't change logic

  // --- LIVE METRICS POLL ---
  const [liveMetrics, setLiveMetrics] = useState<AnalysisMetrics>({
    speechRate: 0, pauseRatio: 0, volumeStability: 10, eyeContact: 100, clarity: 8, confidence: 100, audioLevel: 0
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveMetrics({ ...analysisService.currentMetrics });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleStartSession = async () => {
    if (!graph) return;
    await graph.startSession();

    // Init Video Analysis
    const checkVideo = setInterval(() => {
       if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
          clearInterval(checkVideo);
          analysisService.initVideo(webcamRef.current.video);
       }
    }, 200);
  };

  const handleNextTopic = () => {
      graph?.nextTopic();
  };

  if (!state) return <div className="p-10 text-white">Loading Interface...</div>;

  const isConnected = state.connectionState === 'CONNECTED';
  const isConnecting = state.connectionState === 'CONNECTING';

  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full min-h-screen px-2 py-2">
      
      {/* --- START OVERLAY --- */}
      {state.connectionState === 'DISCONNECTED' && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 
                p-10 rounded-3xl shadow-2xl text-center">
            <h2 className="text-2xl font-bold text-white">Start Interview</h2>
            <p className="text-white/60 mt-2">
               Establish a real-time, bi-directional voice connection with the AI Interviewer.
            </p>
            <button 
              onClick={handleStartSession} 
              disabled={isConnecting}
              className="
                w-full py-4 rounded-xl 
                bg-white/10 border border-white/30 
                text-white font-bold shadow-lg 
                mt-4 backdrop-blur-lg 
                hover:bg-white/20 transition-all
                flex items-center justify-center gap-2
              "
            >
              {isConnecting ? (
                  <>Connecting <span className="animate-pulse">...</span></>
              ) : "Connect Live Agent"}
            </button>

          </div>
        </div>
      )}

      {/* ============================
          LEFT MAIN COLUMN
      ============================= */}
      <div className="w-full lg:w-[70%] flex flex-col gap-4 min-w-0">

        {/* Avatar / Visualizer */}
        <div className="relative h-[300px] md:h-[350px] rounded-3xl overflow-hidden shadow-xl bg-black border border-white/10 flex-none group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900" />
          
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <div className="relative mb-6">
              <div className={`w-40 h-40 rounded-full blur-[60px] transition-all duration-500 ${isConnected ? 'bg-cyan-500/30 scale-110' : 'bg-white/5'}`} />
              
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-32 h-32 rounded-full bg-black/40 border backdrop-blur-md flex items-center justify-center shadow-2xl transition-all ${isConnected ? 'border-cyan-400/50 shadow-cyan-500/20' : 'border-white/10'}`}>
                  <User className={`w-14 h-14 ${isConnected ? 'text-cyan-300' : 'text-gray-500'}`} />
                </div>
              </div>
            </div>

            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">Sarah</h2>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold border ${isConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                    <Wifi className="w-3 h-3" />
                    {isConnected ? "LIVE CONNECTION" : "OFFLINE"}
                </div>
            </div>
          </div>
        </div>

        {/* CURRENT QUESTION BAR — ORIGINAL STYLE BUT MINIMIZED */}
        <GlassCard className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-blue-500/30 px-6 py-3 flex items-center justify-between">
          
          {/* Left: Icon + Label */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-blue-500/20 text-blue-400">
              <HelpCircle className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-blue-300 uppercase tracking-widest">
              Current Question
            </span>
          </div>

          {/* Right: Progress */}
          <div className="text-xs font-bold text-gray-400">
            Question {Math.min(state.currentQuestionIndex + 1, state.totalQuestions)} / {state.totalQuestions}
          </div>

        </GlassCard>


        {/* Live User Transcript */}
        <GlassCard className="flex-1 bg-black/20 flex flex-col relative overflow-hidden min-h-[80px]">
          <div className="px-5 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Your Transcript (Live)</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex items-center justify-center text-center">
            {state.realtimeInputText ? (
                 <div className="text-xl text-blue-200 font-medium leading-relaxed animate-fade-in">
                    "{state.realtimeInputText}"
                 </div>
            ) : (
                <div className="text-gray-600 italic">
                    Listening...
                </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </GlassCard>
      </div>

      {/* ============================
          RIGHT COLUMN (Controls)
      ============================= */}
      <div className="w-full lg:w-[30%] flex flex-col gap-4 flex-shrink-0">
        
        {/* Camera Feed */}
        <GlassCard className="aspect-[4/3] p-0 overflow-hidden relative bg-black rounded-3xl border border-white/20 shadow-xl">
          {camOn ? (
            <Webcam ref={webcamRef} className="w-full h-full object-cover scale-x-[-1]" audio={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-900">
              <VideoOff className="opacity-50 text-white" />
            </div>
          )}
          {isConnected && (
            <div className="absolute top-3 right-3 px-2 py-0.5 bg-red-600 text-[10px] font-bold text-white rounded flex items-center gap-1.5 shadow-lg">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> REC
            </div>
          )}
        </GlassCard>

        {/* Live Metrics */}
        <GlassCard className="p-6 space-y-5">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            <Activity className="w-4 h-4 text-blue-400" /> Biometrics
          </div>
          
          <MetricBar label="Confidence" value={liveMetrics.confidence} color="blue" />
          <MetricBar label="Eye Contact" value={liveMetrics.eyeContact} color={liveMetrics.eyeContact > 60 ? 'emerald' : 'amber'} />
          <MetricBar label="Pace (WPM)" value={Math.min(100, (liveMetrics.speechRate / 160) * 100)} displayValue={`${liveMetrics.speechRate}`} color="purple" />
          <MetricBar 
              label="Audio Level" 
              value={liveMetrics.audioLevel} 
              color="amber"
          />
        </GlassCard>

        {/* Controls */}
        <div className="mt-auto space-y-3">
             <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => setMicOn(!micOn)}
                    className={`h-14 rounded-xl flex items-center justify-center gap-2 font-bold transition-all border ${micOn ? 'bg-white/10 border-white/10 text-white hover:bg-white/20' : 'bg-red-500/20 border-red-500/50 text-red-400'}`}
                >
                    {micOn ? <Mic size={20} /> : <MicOff size={20} />}
                    {micOn ? "Mute" : "Unmuted"}
                </button>
                <button
                    onClick={() => setCamOn(!camOn)}
                    className={`h-14 rounded-xl flex items-center justify-center gap-2 font-bold transition-all border ${camOn ? 'bg-white/10 border-white/10 text-white hover:bg-white/20' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                >
                    {camOn ? <Video size={20} /> : <VideoOff size={20} />}
                    {camOn ? "Cam On" : "Cam Off"}
                </button>
             </div>
             
             {/* Next Topic Button (Hidden Control) */}
             {/*<button
                onClick={handleNextTopic}
                className="w-full h-12 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 font-bold border border-blue-500/20 flex items-center justify-center gap-2 transition-all"
             >
                Next Topic <ChevronRight className="w-4 h-4" />
             </button>*/}

             <button
                onClick={handleEndSession}
                className="w-full h-14 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 transition-all"
             >
                <Power size={20} /> End Interview
             </button>
        </div>
      </div>
    </div>
  );
};

const MetricBar = ({ label, value, displayValue, color }: { label: string, value: number, displayValue?: string, color: string }) => {
    const colorClasses: Record<string, string> = {
        blue: 'bg-blue-500',
        emerald: 'bg-emerald-500',
        amber: 'bg-amber-500',
        purple: 'bg-purple-500'
    };
    
    return (
        <div>
            <div className="flex justify-between text-xs font-bold text-gray-300 mb-1.5">
              <span>{label}</span>
              <span>{displayValue || `${Math.round(value)}%`}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${colorClasses[color] || 'bg-white'}`} 
                style={{ width: `${value}%` }} 
              />
            </div>
        </div>
    );
};

export default InterviewPage;

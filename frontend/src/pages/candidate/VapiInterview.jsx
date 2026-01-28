import React, { useState, useEffect, useRef } from 'react';
import Vapi from '@vapi-ai/web';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useProctoring from '../../hooks/useProctoring';
import API_URL from '../../apiConfig';

// Vapi Keys
const VAPI_PUBLIC_KEY = "85876843-8675-47b9-b5bd-f4387a97473d";

const VapiInterview = () => {
    const [status, setStatus] = useState("idle");
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0);
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(null);

    // Proctoring Integration
    const [showWarning, setShowWarning] = useState(false);
    const [warningMessage, setWarningMessage] = useState('');

    const { violations } = useProctoring({
        enabled: status === 'active',
        maxViolations: 3,
        onViolation: (reason, count) => {
            setWarningMessage(`Interruption Detected: ${reason}. Please stay on the interview screen.`);
            setShowWarning(true);
            setTimeout(() => setShowWarning(false), 5000);
        },
        onTerminalViolation: (reason) => {
            stopInterview();
            setTerminalMessage(`Maximum violations reached (${reason}). The interview session is being terminated.`);
            setShowTerminalOverlay(true);
        }
    });

    const [showTerminalOverlay, setShowTerminalOverlay] = useState(false);
    const [terminalMessage, setTerminalMessage] = useState('');
    const [transcript, setTranscript] = useState([]);
    const [currentSpeaker, setCurrentSpeaker] = useState(null);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const [leftWidth, setLeftWidth] = useState(70); // Resizable panel width
    const [connectionError, setConnectionError] = useState(null);

    const vapiRef = useRef(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const transcriptRef = useRef(null); // DOM element for auto-scroll
    const transcriptDataRef = useRef([]); // Data storage for transcript history
    const scrollTimeoutRef = useRef(null);
    const hasStartedRef = useRef(false);
    const connectionTimeoutRef = useRef(null);
    const startTimeRef = useRef(null);

    // Initialize Vapi
    useEffect(() => {
        try {
            const vapi = new Vapi(VAPI_PUBLIC_KEY);
            vapiRef.current = vapi;

            vapi.on('call-start', () => {
                setStatus("active");
                startTimeRef.current = Date.now();
                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

                const currentAssessment = JSON.parse(localStorage.getItem('currentAssessment') || '{}');
                let config = currentAssessment.config || {};

                // Handle stringified config
                if (typeof config === 'string') {
                    try { config = JSON.parse(config); } catch (e) { console.error("Config parse error", e); }
                }

                // Priority: config duration -> timeLimit -> default 30
                const duration = config.duration || config.timeLimit || 30;
                startTimer(duration);
            });

            vapi.on('call-end', async () => {
                setStatus("ended");
                stopTimer();
                setCurrentSpeaker(null);
                try {
                    console.log("Submitting interview results...");
                    await submitInterviewResults();
                    console.log("Submission complete. Redirecting...");
                } catch (e) {
                    console.error("Submission failed:", e);
                }
                redirectToCompletion();
            });

            vapi.on('volume-level', (level) => setVolume(level));

            vapi.on('message', (message) => {
                if (message.type === 'transcript' && message.transcriptType === 'final') {
                    const speaker = message.role === 'assistant' ? 'ai' : 'user';
                    const newEntry = {
                        speaker,
                        text: message.transcript,
                        timestamp: new Date().toLocaleTimeString()
                    };
                    setTranscript(prev => {
                        const updated = [...prev, newEntry];
                        transcriptDataRef.current = updated;
                        return updated;
                    });
                    setCurrentSpeaker(speaker);
                    setTimeout(() => setCurrentSpeaker(null), 2000);
                }
            });

            vapi.on('speech-start', () => setCurrentSpeaker('ai'));
            vapi.on('speech-end', () => setCurrentSpeaker(null));

            vapi.on('error', (e) => console.error("Vapi Error:", e));

            return () => {
                vapi.stop();
                stopCamera();
                stopTimer();
            };
        } catch (e) {
            console.error("Failed to init Vapi:", e);
        }
    }, []);

    // ... (rest of code) ...

    const stopInterview = () => {
        if (vapiRef.current) {
            try {
                vapiRef.current.stop();
                // Redirection will happen in 'call-end' handler
            } catch (e) {
                console.error("Error stopping Vapi:", e);
                // Fallback redirect if error
                redirectToCompletion();
            }
        } else {
            redirectToCompletion();
        }
    };

    const redirectToCompletion = () => {
        setTimeout(() => {
            alert("Interview completed! Thank you.");
            window.location.href = '/portal/login';
        }, 500);
    };

    const toggleMute = () => {
        if (vapiRef.current) {
            try {
                const newMuted = !isMuted;
                vapiRef.current.setMuted(newMuted);
                setIsMuted(newMuted);
            } catch (e) {
                console.error("Error toggling mute:", e);
            }
        }
    };

    // Submit Results
    const submitInterviewResults = async () => {
        try {
            const token = localStorage.getItem('candidateToken');
            const candidateInfo = JSON.parse(localStorage.getItem('candidateInfo') || '{}');

            // Calculate actual duration based on start time
            const interviewDuration = startTimeRef.current
                ? Math.floor((Date.now() - startTimeRef.current) / 1000)
                : 0;

            const response = await fetch(`${API_URL}/api/interview/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    round_type: 'interview',
                    score: 0,
                    total_score: 100,
                    duration: interviewDuration,
                    transcript: transcriptDataRef.current || [] // Use data ref for latest data
                })
            });

            if (response.ok) {
                console.log("Interview results submitted successfully");
            }
        } catch (error) {
            console.error("Failed to submit interview results:", error);
        }
    };

    // Handle scroll detection
    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;

        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

        setIsUserScrolling(!isAtBottom);

        scrollTimeoutRef.current = setTimeout(() => {
            if (isAtBottom) setIsUserScrolling(false);
        }, 1000);
    };

    // Format time
    const formatTime = (seconds) => {
        if (seconds === null) return "--:--";
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Handle panel resize
    const handleMouseDown = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = leftWidth;

        const handleMouseMove = (e) => {
            const deltaX = e.clientX - startX;
            const newWidth = startWidth + (deltaX / window.innerWidth) * 100;
            if (newWidth >= 50 && newWidth <= 85) {
                setLeftWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div className="h-screen bg-[#0a0a0a] flex flex-col text-white relative overflow-hidden">
            {/* Warning Banner */}
            <AnimatePresence>
                {showWarning && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white px-6 py-4 shadow-2xl"
                    >
                        <div className="max-w-5xl mx-auto flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
                                <PhoneOff size={20} />
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-lg">{warningMessage}</p>
                                <p className="text-sm text-red-100 mt-1">Warning: {violations}/3 - Further interruptions will terminate the interview.</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Terminal Violation Overlay */}
            <AnimatePresence>
                {showTerminalOverlay && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 z-[200] bg-gray-950/90 backdrop-blur-md flex items-center justify-center p-4 text-center"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-gray-900 border border-red-500/50 p-8 rounded-2xl max-w-md shadow-2xl"
                        >
                            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <PhoneOff size={40} className="text-red-500 animate-pulse" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Interview Terminated</h2>
                            <p className="text-gray-400 mb-8">{terminalMessage}</p>
                            <button
                                onClick={() => navigate('/portal/login')}
                                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
                            >
                                Return to Portal
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Top Bar */}
            <div className="bg-black/50 backdrop-blur-sm px-6 py-3 flex items-center justify-between border-b border-gray-800">
                <h1 className="text-sm font-medium text-gray-300">AI Video Interview</h1>
                <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-400">
                        Time: <span className="font-mono text-white text-lg font-bold">{formatTime(timeRemaining)}</span>
                    </div>
                    {currentSpeaker && (
                        <div className={`text-xs px-2 py-1 rounded ${currentSpeaker === 'ai' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                            }`}>
                            {currentSpeaker === 'ai' ? 'AI Speaking' : 'You Speaking'}
                        </div>
                    )}
                </div>
            </div>

            {/* Main 2-Panel Layout with Resizable Divider */}
            <div className="flex-1 flex min-h-0">
                {/* LEFT PANEL - AI Interviewer (Resizable) */}
                <div className="bg-[#1a1a1a] relative flex items-center justify-center" style={{ width: `${leftWidth}%` }}>
                    {/* AI Avatar */}
                    <div className="relative">
                        <motion.div
                            className={`w-64 h-64 rounded-full flex items-center justify-center ${currentSpeaker === 'ai' ? 'bg-gradient-to-br from-blue-600 to-purple-700' : 'bg-gradient-to-br from-gray-700 to-gray-800'
                                } shadow-2xl`}
                            animate={{
                                scale: currentSpeaker === 'ai' ? [1, 1.05, 1] : 1
                            }}
                            transition={{ duration: 1, repeat: Infinity }}
                        >
                            <div className="text-8xl">🤖</div>
                        </motion.div>

                        {currentSpeaker === 'ai' && (
                            <motion.div
                                className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-500 px-4 py-1 rounded-full text-xs"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                Speaking...
                            </motion.div>
                        )}
                    </div>

                    <div className="absolute bottom-6 left-6 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
                        <p className="text-sm font-medium">AI Interviewer</p>
                    </div>
                </div>

                {/* Resizable Divider */}
                <div
                    className="w-1 bg-gray-800 hover:bg-blue-500 cursor-col-resize transition-colors"
                    onMouseDown={handleMouseDown}
                />

                {/* RIGHT PANEL - Candidate + Transcript */}
                <div className="flex-1 bg-[#0f0f0f] flex flex-col border-l border-gray-800">
                    {/* Candidate Camera */}
                    <div className="relative bg-black aspect-video">
                        {cameraEnabled ? (
                            <>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover transform scale-x-[-1]"
                                />
                                <div className="absolute top-3 left-3 bg-gray-900/80 px-2 py-1 rounded text-xs font-medium">
                                    You
                                </div>
                                {currentSpeaker === 'user' && (
                                    <div className="absolute bottom-3 left-3 bg-green-500 px-3 py-1 rounded-full text-xs">
                                        Speaking...
                                    </div>
                                )}
                                {currentSpeaker === 'ai' && (
                                    <div className="absolute bottom-3 left-3 bg-gray-700 px-3 py-1 rounded-full text-xs">
                                        Listening...
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                <div className="text-center">
                                    <div className="text-4xl mb-2">📷</div>
                                    <p className="text-xs text-gray-500">Camera unavailable</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Live Transcript */}
                    <div className="flex-1 flex flex-col bg-[#0f0f0f] min-h-0">
                        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-gray-400 uppercase">Live Transcript</h3>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-xs text-gray-500">Live</span>
                            </div>
                        </div>

                        <div
                            ref={transcriptRef}
                            onScroll={handleScroll}
                            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                        >
                            {transcript.length === 0 ? (
                                <p className="text-xs text-gray-600 text-center mt-8">Transcript will appear here...</p>
                            ) : (
                                <AnimatePresence>
                                    {transcript.map((entry, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div className={`max-w-[85%] ${entry.speaker === 'ai'
                                                ? 'bg-gray-800 text-left'
                                                : 'bg-purple-600 text-right'
                                                } rounded-lg px-3 py-2`}>
                                                <p className={`text-[10px] font-semibold mb-1 ${entry.speaker === 'ai' ? 'text-blue-400' : 'text-purple-200'}`}>
                                                    {entry.speaker === 'ai' ? 'AI Interviewer' : 'You'}
                                                </p>
                                                <p className="text-xs text-white leading-relaxed">{entry.text}</p>
                                                <p className="text-[9px] text-gray-500 mt-1">{entry.timestamp}</p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            )}
                        </div>

                        {isUserScrolling && (
                            <button
                                onClick={() => {
                                    setIsUserScrolling(false);
                                    if (transcriptRef.current) {
                                        transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
                                    }
                                }}
                                className="mx-4 mb-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-full text-xs transition-colors"
                            >
                                ↓ Jump to latest
                            </button>
                        )}
                    </div>
                </div>
            </div >

            {/* Bottom Control Bar - Only show during active interview */}
            {
                status === 'active' && (
                    <div className="bg-black/50 backdrop-blur-sm border-t border-gray-800 py-4 flex items-center justify-center gap-4">
                        <button
                            onClick={toggleMute}
                            disabled={currentSpeaker === 'ai'}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${currentSpeaker === 'ai' ? 'bg-gray-700 opacity-50 cursor-not-allowed' :
                                isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                                }`}
                        >
                            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={stopInterview}
                            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
                        >
                            <PhoneOff className="w-5 h-5" />
                        </button>
                    </div>
                )
            }

            {/* Connecting Overlay */}
            {
                (status === 'connecting' || status === 'error') && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                        <div className="text-center max-w-md p-6">
                            {status === 'connecting' ? (
                                <>
                                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                    <p className="text-lg font-medium">Connecting to AI Interviewer...</p>
                                    <p className="text-sm text-gray-400 mt-2">Please wait...</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <PhoneOff className="w-8 h-8 text-red-500" />
                                    </div>
                                    <p className="text-lg font-medium text-red-400">Connection Failed</p>
                                    <p className="text-sm text-gray-400 mt-2 mb-4">{connectionError || "Could not connect to VAPI."}</p>
                                    <button
                                        onClick={() => window.location.reload()}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors"
                                    >
                                        Retry Connection
                                    </button>

                                    <div className="mt-4 pt-4 border-t border-gray-700">
                                        <p className="text-xs text-gray-400 mb-2">Override Assistant ID (Optional):</p>
                                        <input
                                            type="text"
                                            placeholder="Paste VAPI Assistant ID here"
                                            className="w-full bg-gray-900 border border-gray-700 text-white text-xs p-2 rounded mb-2"
                                            onChange={(e) => {
                                                if (e.target.value.length > 5) {
                                                    localStorage.setItem('vapi_manual_id', e.target.value);
                                                }
                                            }}
                                        />
                                        <p className="text-[10px] text-gray-500">Updates will apply on Retry</p>
                                    </div>

                                    <p className="text-xs text-slate-500 mt-4 max-w-xs mx-auto break-words">
                                        Debug: {connectionError}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default VapiInterview;

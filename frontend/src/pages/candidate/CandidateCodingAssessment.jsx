import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Editor } from '@monaco-editor/react';
import {
    Play, CheckCircle, Clock, Terminal, ChevronRight, ChevronLeft,
    Code, Check, AlertTriangle, Plus, X, RotateCcw, MonitorPlay, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useProctoring from '../../hooks/useProctoring';
import API_URL from '../../apiConfig';

// Language Configuration (Restricted to Python and Java)
const LANGUAGES = {
    python: { name: 'Python', monaco: 'python', icon: '🐍' },
    java: { name: 'Java', monaco: 'java', icon: '☕' }
};

// MULTIPLE CODING QUESTIONS with multi-language templates
const CODING_QUESTIONS = [
    {
        id: 1,
        title: "Loading Assessment...",
        description: "Please wait while we generate your customized assessment...",
        examples: [],
        constraints: [],
        starterCode: {
            python: `def solve(input_data):\n    # input_data is a dictionary\n    # return the result\n    pass`,
            java: `class Solution {\n    public int solve(int[] nums) {\n        // return the result\n        return 0;\n    }\n}`
        },
        defaultTestCases: []
    }
];

const CandidateCodingAssessment = () => {
    const navigate = useNavigate();

    // --- STATE MANAGEMENT ---

    // Navigation & Timer
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [questions, setQuestions] = useState(CODING_QUESTIONS); // Default to all, but will slice
    const [timeLeft, setTimeLeft] = useState(60 * 60); // Default 60m
    const [configuredTestCount, setConfiguredTestCount] = useState(5); // Default intensity
    const [submitted, setSubmitted] = useState(false);

    // Proctoring Integration
    const [showWarning, setShowWarning] = useState(false);
    const [warningMessage, setWarningMessage] = useState('');

    const { violations } = useProctoring({
        enabled: !submitted,
        maxViolations: 3,
        onViolation: (reason, count) => {
            setWarningMessage(`Malpractice Detected: ${reason}. This attempt has been logged.`);
            setShowWarning(true);
            setTimeout(() => setShowWarning(false), 5000);
        },
        onTerminalViolation: (reason) => {
            handleSubmit(`Malpractice - ${reason}`);
            setTerminalMessage(`Maximum violations reached (${reason}). Your assessment has been submitted automatically.`);
            setShowTerminalOverlay(true);
        }
    });

    const [scoreResult, setScoreResult] = useState(null);
    const [showTerminalOverlay, setShowTerminalOverlay] = useState(false);
    const [terminalMessage, setTerminalMessage] = useState('');

    // Load Config from LocalStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem('currentAssessment');
            if (stored) {
                const data = JSON.parse(stored);
                if (data.config) {
                    // CRITICAL: Load AI-Generated Questions (Dynamic)
                    if (data.config.generated_questions && data.config.generated_questions.length > 0) {
                        const dynamicQuestions = data.config.generated_questions.map(q => {
                            const STRICT_TEMPLATES = {
                                python: `def solve(input_data):\n    # return the result\n    pass`,
                                java: `class Solution {\n    public Object solve(Object input) {\n        // return the result\n        return null;\n    }\n}`
                            };

                            return {
                                id: q.id,
                                title: q.title || 'Coding Challenge',
                                description: q.description || 'Solve this problem.',
                                difficulty: q.difficulty || 'Medium',
                                examples: (q.examples && q.examples.length > 0) ? q.examples : [{ input: 'Example input', output: 'Example output', explanation: 'No examples provided' }],
                                testCases: (q.testCases && q.testCases.length > 0) ? q.testCases : [{ id: 1, input: '', expected: '' }],
                                defaultTestCases: (q.testCases && q.testCases.length > 0) ? q.testCases : [{ id: 1, input: '', expected: '' }],
                                constraints: q.constraints || [],
                                starterCode: {
                                    python: q.starterCode?.python || STRICT_TEMPLATES.python,
                                    java: q.starterCode?.java || STRICT_TEMPLATES.java
                                }
                            };
                        });
                        setQuestions(dynamicQuestions);
                    } else if (data.config.questionCount) {
                        setQuestions(CODING_QUESTIONS.slice(0, data.config.questionCount));
                    }

                    // Sync Time Limit
                    if (data.config.timeLimit) {
                        setTimeLeft(data.config.timeLimit * 60);
                    }
                    // Sync Test Intensity
                    if (data.config.testIntensity) {
                        setConfiguredTestCount(data.config.testIntensity);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load assessment config", e);
        }
    }, []);


    // Language State
    const [selectedLanguage, setSelectedLanguage] = useState('python');

    // Code State - initialized with all language templates
    const [codeByQuestion, setCodeByQuestion] = useState({});

    // FORCE SYNC: When questions load (from local storage or default), reset code state to Strict Templates
    // Added dependency on assessment.id to force reset if a different assessment is loaded on the same machine
    useEffect(() => {
        const assessment = JSON.parse(localStorage.getItem('currentAssessment') || '{}');
        const assessmentId = assessment.id || 'default';

        const newCodeState = {};
        questions.forEach((q, idx) => {
            newCodeState[idx] = { ...q.starterCode };
        });
        setCodeByQuestion(newCodeState);
        setAttemptedQuestions(new Set());
    }, [questions]);
    const [attemptedQuestions, setAttemptedQuestions] = useState(new Set());

    // UI State
    const [activeLeftTab, setActiveLeftTab] = useState('description'); // description, examples, constraints
    const [activeRightTab, setActiveRightTab] = useState('testcases'); // testcases, results
    const [isRunning, setIsRunning] = useState(false);

    // Test Case State
    const [activeTestCaseId, setActiveTestCaseId] = useState(1);
    const [customTestCases, setCustomTestCases] = useState(CODING_QUESTIONS[0].defaultTestCases);
    const [executionResults, setExecutionResults] = useState(null);
    const [testResultsByQuestion, setTestResultsByQuestion] = useState({
        0: { passed: 0, total: 5 },
        1: { passed: 0, total: 5 }
    }); // Note: Total will be updated on run

    // Layout State (Resizable)
    const [leftPanelWidth, setLeftPanelWidth] = useState(30); // Default 30% (Editor gets 70%)
    const [consoleHeight, setConsoleHeight] = useState(30);   // Default 30% percentage
    const [isDragging, setIsDragging] = useState(null);       // 'horizontal' | 'vertical' | null
    const [isCollaspedLeft, setIsCollapsedLeft] = useState(false);

    // Derived
    const currentQuestion = questions[currentQuestionIndex] || questions[0];
    const currentCode = codeByQuestion[currentQuestionIndex]?.[selectedLanguage] || '';

    // --- EFFECTS ---

    // Timer Logic
    useEffect(() => {
        if (!submitted && timeLeft > 0) {
            const timer = setInterval(() => {
                setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
            }, 1000);
            return () => clearInterval(timer);
        } else if (timeLeft === 0 && !submitted) {
            handleSubmit();
        }
    }, [timeLeft, submitted]);

    // Update test cases when question changes
    useEffect(() => {
        setCustomTestCases(currentQuestion.defaultTestCases);
        setActiveTestCaseId(1);
        setExecutionResults(null);
        setActiveRightTab('testcases');
    }, [currentQuestion, currentQuestionIndex]);

    // ANTI-MALPRACTICE: Prevent Back Button / Refresh (Handled by useProctoring)
    useEffect(() => {
        const handleUnload = (e) => {
            if (!submitted) {
                const token = localStorage.getItem('candidateToken');
                fetch(`${API_URL}/api/assessments/submit/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ result: { passed: 0, total: 10 }, status: 'Malpractice - Assessment Abandoned' }),
                    keepalive: true
                });
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [submitted]);

    // --- RESIZE HANDLERS ---

    // Attach to window/document to handle fast drags
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;

            if (isDragging === 'horizontal') {
                const newWidth = (e.clientX / window.innerWidth) * 100;
                // Clamp between 15% and 50%
                if (newWidth > 15 && newWidth < 50) setLeftPanelWidth(newWidth);
            } else if (isDragging === 'vertical') {
                // Get the right panel element to calculate relative to it
                const rightPanel = document.querySelector('[data-right-panel]');
                if (!rightPanel) return;

                const rect = rightPanel.getBoundingClientRect();
                const relativeY = e.clientY - rect.top;
                const panelHeight = rect.height;

                // Calculate console height as percentage from bottom
                const newHeight = ((panelHeight - relativeY) / panelHeight) * 100;

                if (newHeight > 5 && newHeight < 60) setConsoleHeight(newHeight);
            }
        };

        const handleMouseUp = () => {
            setIsDragging(null);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // --- HANDLERS ---

    const handleCodeChange = (value) => {
        setCodeByQuestion(prev => ({
            ...prev,
            [currentQuestionIndex]: {
                ...prev[currentQuestionIndex],
                [selectedLanguage]: value
            }
        }));
        if (value !== currentQuestion.starterCode[selectedLanguage]) {
            setAttemptedQuestions(prev => new Set([...prev, currentQuestionIndex]));
        }
    };

    const handleLanguageChange = (lang) => {
        setSelectedLanguage(lang);
    };

    const handleAddTestCase = () => {
        const newId = Math.max(...customTestCases.map(tc => tc.id), 0) + 1;
        setCustomTestCases([...customTestCases, { id: newId, input: "", expected: "" }]);
        setActiveTestCaseId(newId);
    };

    const handleRemoveTestCase = (id, e) => {
        e.stopPropagation();
        if (customTestCases.length <= 1) return;
        setCustomTestCases(customTestCases.filter(tc => tc.id !== id));
        if (activeTestCaseId === id) {
            setActiveTestCaseId(customTestCases[0].id);
        }
    };

    const handleTestCaseChange = (id, field, value) => {
        setCustomTestCases(customTestCases.map(tc =>
            tc.id === id ? { ...tc, [field]: value } : tc
        ));
    };

    const handleRunCode = async () => {
        setIsRunning(true);
        setActiveRightTab('results');

        setExecutionResults(null); // Clear previous

        try {
            const token = localStorage.getItem('candidateToken');
            const res = await fetch(`${API_URL}/api/assessments/execute/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    code: currentCode,
                    language: selectedLanguage,
                    question: currentQuestion,
                    testCases: customTestCases,
                    questionId: currentQuestion.id
                })
            });

            if (res.ok) {
                const data = await res.json();

                // If AI execution returns results, use them.
                if (!data.syntax_valid) {
                    // Show Syntax Error
                    setExecutionResults([{
                        id: 0,
                        status: 'error',
                        output: data.error_message || "Syntax Error",
                        expected: "-",
                        input: "Compilation"
                    }]);
                } else if (data.results && data.results.length > 0) {
                    // Use real results
                    setExecutionResults(data.results);
                } else {
                    // Fallback
                    setExecutionResults([{ status: 'failed', output: "No results returned from execution engine", expected: "-", input: "-" }]);
                }

                // Update Test Results Stats
                const visibleResults = data.results || [];
                const visiblePassed = visibleResults.filter(r => r.status === 'passed').length;
                const visibleTotal = visibleResults.length;

                // Use actually generated test cases for the total
                const actualTotal = currentQuestion.testCases?.length || visibleTotal;

                setTestResultsByQuestion(prev => ({
                    ...prev,
                    [currentQuestionIndex]: {
                        passed: visiblePassed,
                        total: actualTotal
                    }
                }));

            } else {
                setExecutionResults([{ status: 'error', output: "Execution Server Error", expected: "-", input: "System" }]);
            }
        } catch (error) {
            console.error(error);
            setExecutionResults([{ status: 'error', output: "Network Error", expected: "-", input: "System" }]);
        } finally {
            setIsRunning(false);
        }
    };

    const handleSubmit = async (forcedStatus = null) => {
        if (submitted) return;

        // If proctoring auto-submit, clear everything and submit
        if (forcedStatus) setSubmitted(true);

        const token = localStorage.getItem('candidateToken');
        if (!token) return;

        try {
            // Aggregate all code results
            const finalResults = {
                passed: 0,
                total: 0
            };

            Object.values(testResultsByQuestion).forEach(res => {
                finalResults.passed += (res.passed || 0);
                finalResults.total += (res.total || 0);
            });

            const response = await fetch(`${API_URL}/api/assessments/submit/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    result: finalResults,
                    status: forcedStatus
                })
            });

            if (response.ok) {
                const data = await response.json();
                setSubmitted(true);
                // Extract score if returned
                if (data.score !== undefined) {
                    setScoreResult(data.score * 10);
                }
            }
        } catch (e) {
            console.error("Submission failed:", e);
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    if (submitted) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-gray-800 border border-gray-700 rounded-2xl shadow-xl p-8 max-w-lg w-full text-center">
                    <div className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="text-green-500" size={40} />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Assessment Completed</h2>
                    <p className="text-gray-400 mb-6">Thank you for completing the assessment. Our recruitment team will review your performance.</p>
                    <div className="flex flex-col gap-3">
                        <button onClick={() => navigate('/portal/login')} className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500 transition-colors">Return to Portal</button>
                        <button
                            onClick={() => {
                                localStorage.clear();
                                navigate('/portal/login');
                            }}
                            className="w-full py-3 bg-gray-700 text-gray-300 rounded-xl font-semibold hover:bg-gray-600 transition-colors"
                        >
                            Log Out
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-gray-950 text-gray-300 overflow-hidden font-sans selection:bg-blue-500/30">
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
                            <AlertTriangle size={28} className="flex-shrink-0 animate-pulse" />
                            <div className="flex-1">
                                <p className="font-bold text-lg">{warningMessage}</p>
                                <p className="text-sm text-red-100 mt-1">Warning: {violations}/3 - Further violations will result in automatic submission.</p>
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
                                <AlertTriangle size={40} className="text-red-500 animate-pulse" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Assessment Terminated</h2>
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

            {/* --- HEADER --- */}
            <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600/20 p-1.5 rounded-lg">
                            <Code size={18} className="text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-gray-100">Coding Assessment</h2>
                            <span className="text-xs text-gray-500">Question {currentQuestionIndex + 1}/{questions.length}</span>
                        </div>
                    </div>
                    <div className="h-6 w-px bg-gray-800 mx-2" />
                    <div className="flex flex-1 overflow-x-auto gap-1">
                        {questions.map((q, idx) => (
                            <button
                                key={q.id}
                                onClick={() => setCurrentQuestionIndex(idx)}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${currentQuestionIndex === idx
                                    ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                                    }`}
                            >
                                {attemptedQuestions.has(idx) && <Check size={12} className="text-green-500" />}
                                {idx + 1}. {q.title}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded bg-gray-800 border border-gray-700`}>
                        <Clock size={14} className={timeLeft < 300 ? 'text-red-500' : 'text-gray-400'} />
                        <span className={`text-sm font-mono font-bold ${timeLeft < 300 ? 'text-red-400' : 'text-gray-200'}`}>{formatTime(timeLeft)}</span>
                    </div>
                    <button
                        onClick={() => handleSubmit()}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-semibold transition-colors shadow-lg shadow-green-900/20"
                    >
                        Submit
                    </button>
                </div>
            </header>

            {/* --- MAIN CONTENT (SPLIT LAYOUT) --- */}
            <div
                className="flex-1 flex overflow-hidden select-none bg-gray-900"
                onMouseMove={(e) => {
                    // Fallback move handler needed here if mouse leaves iframe/document
                    // Although main logic is in useEffect, having it here helps propagation
                }}
            >

                {/* LEFT PANEL (Resizable) */}
                <div
                    className={`flex flex-col border-r border-gray-800 bg-gray-900 transition-none ${isCollaspedLeft ? 'hidden' : 'flex'}`}
                    style={{ width: `${leftPanelWidth}%`, minWidth: '15%', maxWidth: '50%' }}
                >
                    {/* Tabs */}
                    <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-2 mt-2">
                        <div className="flex">
                            {['Description', 'Examples', 'Constraints'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveLeftTab(tab.toLowerCase())}
                                    className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${activeLeftTab === tab.toLowerCase()
                                        ? 'border-blue-500 text-blue-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setIsCollapsedLeft(true)}
                            className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors"
                            title="Collapse Problem View"
                        >
                            <ChevronLeft size={16} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeLeftTab}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                transition={{ duration: 0.15 }}
                            >
                                <h3 className="text-xl font-bold text-white mb-4">{currentQuestion.title}</h3>

                                {activeLeftTab === 'description' && (
                                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                                        {currentQuestion.description}
                                    </p>
                                )}

                                {activeLeftTab === 'examples' && (
                                    <div className="space-y-6">
                                        {currentQuestion.examples.map((ex, idx) => (
                                            <div key={idx} className="bg-gray-800/40 rounded-lg p-5 border border-gray-800/60 shadow-inner">
                                                <h4 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-4">Example {idx + 1}</h4>
                                                <div className="space-y-3">
                                                    <div className="grid grid-cols-[60px_1fr] gap-3">
                                                        <span className="text-xs text-gray-500 font-medium">Input:</span>
                                                        <code className="text-xs font-mono text-gray-200">
                                                            {typeof ex.input === 'object' ? JSON.stringify(ex.input) : String(ex.input)}
                                                        </code>
                                                    </div>
                                                    <div className="grid grid-cols-[60px_1fr] gap-3">
                                                        <span className="text-xs text-gray-500 font-medium">Output:</span>
                                                        <code className="text-xs font-mono text-gray-200">
                                                            {typeof ex.output === 'object' ? JSON.stringify(ex.output) : String(ex.output)}
                                                        </code>
                                                    </div>
                                                    {ex.explanation && (
                                                        <div className="grid grid-cols-[60px_1fr] gap-3 mt-1 pt-2 border-t border-gray-800/40">
                                                            <span className="text-xs text-gray-500 font-medium">Expl:</span>
                                                            <p className="text-xs text-gray-400 leading-relaxed italic">{ex.explanation}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {activeLeftTab === 'constraints' && (
                                    <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                                        {currentQuestion.constraints && currentQuestion.constraints.length > 0 ? (
                                            <ul className="space-y-3 list-disc list-inside text-gray-400 text-sm marker:text-blue-500">
                                                {currentQuestion.constraints.map((c, i) => (
                                                    <li key={i} className="pl-2">{c}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-10 text-gray-600 opacity-50">
                                                <AlertTriangle size={32} className="mb-2" />
                                                <p className="text-xs italic">Review problem description for constraints.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

                {/* LEFT COLLAPSED STRIP */}
                {isCollaspedLeft && (
                    <div className="w-10 border-r border-gray-800 bg-gray-900 flex flex-col items-center py-2 z-20 shrink-0">
                        <button onClick={() => setIsCollapsedLeft(false)} className="p-1.5 hover:bg-gray-800 rounded mb-4 text-blue-500 hover:text-blue-400">
                            <ChevronRight size={20} />
                        </button>
                        <div className="writing-vertical-lr text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 rotate-180" style={{ writingMode: 'vertical-rl' }}>
                            <span className="mb-2">Problem Description</span>
                        </div>
                    </div>
                )}


                {/* HORIZONTAL RESIZER */}
                {!isCollaspedLeft && (
                    <div
                        className="w-1 cursor-col-resize hover:bg-blue-600 active:bg-blue-600 bg-gray-900 transition-colors z-20 flex items-center justify-center group shrink-0"
                        onMouseDown={(e) => { e.preventDefault(); setIsDragging('horizontal'); }}
                    >
                        <div className="h-8 w-0.5 bg-gray-800 group-hover:bg-blue-300 rounded-full transition-colors" />
                    </div>
                )}


                {/* RIGHT PANEL: EDITOR & CONSOLE */}
                <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden relative min-w-0" data-right-panel style={{ isolation: 'isolate' }}>

                    {/* EDITOR CONTAINER (FLEX-1: Takes remaining space) */}
                    <div className="flex-1 relative flex flex-col min-h-0 bg-gray-900" style={{ contain: 'layout paint', willChange: 'auto' }}>
                        {/* Language Selector Header */}
                        <div className="flex items-center justify-between bg-gray-900 border-b border-gray-800 px-4 py-2 shrink-0">
                            <div className="flex items-center gap-2">
                                <Code size={14} className="text-gray-500" />
                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Code Editor</span>
                            </div>

                            {/* Language Dropdown */}
                            <div className="relative group">
                                <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-sm font-medium text-gray-200 transition-colors cursor-pointer">
                                    <span className="text-base">{LANGUAGES[selectedLanguage].icon}</span>
                                    <span>{LANGUAGES[selectedLanguage].name}</span>
                                    <ChevronDown size={14} className="text-gray-500" />
                                </button>

                                {/* Dropdown Menu */}
                                <div className="absolute top-full right-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 min-w-[160px] max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                                    {Object.entries(LANGUAGES).map(([lang, config]) => (
                                        <button
                                            key={lang}
                                            onClick={() => handleLanguageChange(lang)}
                                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-700 transition-colors ${selectedLanguage === lang ? 'bg-gray-700 text-white' : 'text-gray-300'
                                                } first:rounded-t-md last:rounded-b-md`}
                                        >
                                            <span className="text-base">{config.icon}</span>
                                            <span>{config.name}</span>
                                            {selectedLanguage === lang && <Check size={14} className="ml-auto text-green-500" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Monaco Editor */}
                        <div className="flex-1 border-b border-gray-800 bg-[#1e1e1e]">
                            <Editor
                                key={selectedLanguage} // FORCE REMOUNT on language change to prevent state mixup
                                height="100%"
                                language={LANGUAGES[selectedLanguage].monaco}
                                theme="vs-dark"
                                value={currentCode}
                                onChange={handleCodeChange}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    padding: { top: 20, bottom: 20 },
                                    codeLens: false,
                                    lineHeight: 22,
                                    letterSpacing: 0.5
                                }}
                            />
                        </div>
                    </div>

                    {/* VERTICAL RESIZER */}
                    <div
                        className="h-1 cursor-row-resize hover:bg-blue-600 active:bg-blue-600 bg-gray-900 transition-colors z-30 w-full flex justify-center items-center group shrink-0"
                        onMouseDown={(e) => { e.preventDefault(); setIsDragging('vertical'); }}
                    >
                        <div className="w-12 h-0.5 bg-gray-700 group-hover:bg-blue-300 rounded-full transition-colors" />
                    </div>

                    {/* CONSOLE (Optimized for gap-free resize) */}
                    <div className="flex flex-col bg-gray-900" style={{
                        flexBasis: `${consoleHeight}%`,
                        flexGrow: 0,
                        flexShrink: 0,
                        minHeight: '5%',
                        maxHeight: '60%',
                        contain: 'layout paint',
                        willChange: isDragging === 'vertical' ? 'flex-basis' : 'auto'
                    }}>
                        {/* Console Tabs */}
                        <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-2 min-h-[40px] shrink-0">
                            <div className="flex gap-1">
                                <button
                                    onClick={() => setActiveRightTab('testcases')}
                                    className={`px-3 py-2 text-xs font-medium border-t-2 items-center flex gap-2 ${activeRightTab === 'testcases' ? 'border-blue-500 text-gray-100 bg-gray-800' : 'border-transparent text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    <CheckCircle size={14} /> Test Cases
                                </button>
                                <button
                                    onClick={() => setActiveRightTab('results')}
                                    className={`px-3 py-2 text-xs font-medium border-t-2 items-center flex gap-2 ${activeRightTab === 'results' ? 'border-green-500 text-gray-100 bg-gray-800' : 'border-transparent text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    <Terminal size={14} /> Test Results
                                </button>
                            </div>
                            <div className="flex items-center gap-2 pr-2">
                                <button
                                    onClick={() => setConsoleHeight(consoleHeight < 10 ? 30 : 5)}
                                    className="p-1.5 text-gray-500 hover:bg-gray-800 rounded"
                                    title={consoleHeight < 10 ? "Maximize Console" : "Minimize Console"}
                                >
                                    {consoleHeight < 10 ? <ChevronLeft size={14} className="rotate-90" /> : <ChevronLeft size={14} className="-rotate-90" />}
                                </button>
                                <button
                                    onClick={handleRunCode}
                                    disabled={isRunning}
                                    className="px-4 py-1.5 rounded-md bg-transparent border border-gray-700 text-gray-300 text-xs font-bold hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isRunning ? <span className="animate-spin">⟳</span> : <Play size={12} />} Run Code
                                </button>
                            </div>
                        </div>

                        {/* Console Content */}
                        <div className="flex-1 overflow-hidden flex bg-gray-900">
                            {/* TEST CASES TAB */}
                            {activeRightTab === 'testcases' && (
                                <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar bg-gray-900">
                                    <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                                        {customTestCases.map((tc, idx) => (
                                            <div key={tc.id} className="relative group">
                                                <button
                                                    onClick={() => setActiveTestCaseId(tc.id)}
                                                    className={`px-3 py-1.5 rounded text-xs font-medium border ${activeTestCaseId === tc.id ? 'bg-gray-800 border-gray-600 text-white' : 'bg-transparent border-gray-800 text-gray-500 hover:border-gray-700'
                                                        }`}
                                                >
                                                    Case {idx + 1}
                                                </button>
                                                <button
                                                    onClick={(e) => handleRemoveTestCase(tc.id, e)}
                                                    className="absolute -top-1.5 -right-1.5 bg-gray-700 text-gray-400 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ))}
                                        <button onClick={handleAddTestCase} className="px-2 py-1.5 rounded text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
                                            <Plus size={14} />
                                        </button>
                                    </div>

                                    {customTestCases.find(tc => tc.id === activeTestCaseId) && (
                                        <div className="space-y-3 animate-in fade-in duration-200">
                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Input</label>
                                                <textarea
                                                    value={typeof customTestCases.find(tc => tc.id === activeTestCaseId)?.input === 'object'
                                                        ? JSON.stringify(customTestCases.find(tc => tc.id === activeTestCaseId)?.input, null, 2)
                                                        : customTestCases.find(tc => tc.id === activeTestCaseId)?.input}
                                                    onChange={(e) => handleTestCaseChange(activeTestCaseId, 'input', e.target.value)}
                                                    className="w-full bg-gray-800 border-gray-700 rounded p-3 text-sm font-mono text-gray-200 outline-none focus:border-blue-500/50 transition-colors h-24 resize-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* RESULTS TAB */}
                            {activeRightTab === 'results' && (
                                <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar bg-gray-900">
                                    {!executionResults ? (
                                        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                                            <MonitorPlay size={32} className="mb-2 opacity-50" />
                                            <p className="text-sm">Run code to see results</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            {/* Summary */}
                                            <div className={`p-3 rounded-lg border ${executionResults.every(r => r.status === 'passed') ? 'bg-green-900/20 border-green-800' : (executionResults.some(r => r.status === 'error') ? 'bg-yellow-900/20 border-yellow-800' : 'bg-red-900/20 border-red-800')}`}>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className={`text-sm font-bold ${executionResults.every(r => r.status === 'passed') ? 'text-green-400' : (executionResults.some(r => r.status === 'error') ? 'text-yellow-400' : 'text-red-400')}`}>
                                                            {executionResults.every(r => r.status === 'passed') ? 'Accepted' : (executionResults.some(r => r.status === 'error') ? 'Compilation Error' : 'Wrong Answer')}
                                                        </h3>
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            {testResultsByQuestion[currentQuestionIndex]?.passed || 0} / {testResultsByQuestion[currentQuestionIndex]?.total || currentQuestion.testCases?.length || 0} total cases passed
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Details */}
                                            <div className="space-y-4">
                                                {executionResults.map((res, idx) => (
                                                    <div key={idx} className="group">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className={`text-xs font-bold uppercase flex items-center gap-2 ${res.status === 'passed' ? 'text-green-500' : 'text-red-500'}`}>
                                                                {res.status === 'passed' ? <Check size={14} /> : <X size={14} />} Case {idx + 1}
                                                            </span>
                                                            <span className="text-[10px] text-gray-600 font-mono">{res.runtime}</span>
                                                        </div>
                                                        <div className="bg-gray-800/50 rounded-lg p-3 space-y-2 border border-gray-800 group-hover:border-gray-700 transition-colors">
                                                            <div className="grid grid-cols-[60px_1fr] gap-2">
                                                                <span className="text-xs text-gray-500">Input:</span>
                                                                <code className="text-xs font-mono text-gray-300 bg-gray-900 px-1.5 py-0.5 rounded w-fit">
                                                                    {typeof res.input === 'object' ? JSON.stringify(res.input) : String(res.input)}
                                                                </code>
                                                            </div>
                                                            <div className="grid grid-cols-[60px_1fr] gap-2">
                                                                <span className="text-xs text-gray-500">Output:</span>
                                                                <code className={`text-xs font-mono px-1.5 py-0.5 rounded w-fit ${res.status === 'passed' ? 'text-green-300 bg-green-900/20' : 'text-red-300 bg-red-900/20'}`}>
                                                                    {typeof res.output === 'object' ? JSON.stringify(res.output) : String(res.output)}
                                                                </code>
                                                            </div>
                                                            {res.status !== 'passed' && (
                                                                <div className="grid grid-cols-[60px_1fr] gap-2">
                                                                    <span className="text-xs text-gray-500">Expected:</span>
                                                                    <code className="text-xs font-mono text-gray-300 bg-gray-900 px-1.5 py-0.5 rounded w-fit">
                                                                        {typeof res.expected === 'object' ? JSON.stringify(res.expected) : String(res.expected)}
                                                                    </code>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CandidateCodingAssessment;

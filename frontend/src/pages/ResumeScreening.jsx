import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
    Upload, FileText, Brain, Loader2, CheckCircle, AlertCircle,
    Filter, ChevronRight, X, Sparkles, ChevronDown, ChevronUp,
    Search, Play, Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import API_URL from '../apiConfig';

// --- Processing Overlay Component ---
const ProcessingStatus = ({ currentFile, stage }) => {
    const stages = [
        { id: 'parsing', label: 'Parsing Resume Structure', icon: FileText },
        { id: 'extracting', label: 'Extracting Skills & Experience', icon: Brain },
        { id: 'matching', label: 'Matching with Job Description', icon: Search },
        { id: 'scoring', label: 'Calculating Match Score', icon: Sparkles },
    ];

    const currentIdx = stages.findIndex(s => s.id === stage) || 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-blue-100 rounded-2xl p-6 shadow-xl mb-8 relative overflow-hidden"
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gray-100">
                <motion.div
                    className="h-full bg-blue-600"
                    initial={{ width: "0%" }}
                    animate={{ width: `${((currentIdx + 1) / 4) * 100}%` }}
                    transition={{ duration: 0.5 }}
                />
            </div>

            <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                    <Loader2 className="animate-spin" size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Analysing: {currentFile?.name}</h3>
                    <p className="text-sm text-gray-500">AI Intelligence Engine Active</p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stages.map((s, idx) => {
                    const isActive = idx === currentIdx;
                    const isDone = idx < currentIdx;
                    const Icon = s.icon;

                    return (
                        <div key={s.id} className={`flex flex-col items-center text-center gap-2 p-3 rounded-xl transition-colors ${isActive ? 'bg-blue-50/50' : 'opacity-50'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isActive ? 'bg-blue-600 text-white shadow-lg scale-110' : isDone ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                {isDone ? <CheckCircle size={16} /> : <Icon size={16} />}
                            </div>
                            <span className={`text-xs font-semibold ${isActive ? 'text-blue-700' : 'text-gray-500'}`}>{s.label}</span>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
};

// --- Result Card Component ---
const CandidateResultCard = ({ candidate, rank }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Safety check for analysis data
    const analysis = candidate.analysis || {};
    const missingSkills = analysis.missing_skills || [];
    const matchedSkills = analysis.key_skills_match || [];

    const getScoreColor = (score) => {
        if (score >= 80) return 'text-green-600 border-green-200 bg-green-50';
        if (score >= 60) return 'text-amber-600 border-amber-200 bg-amber-50';
        return 'text-red-600 border-red-200 bg-red-50';
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white border border-gray-200 rounded-xl p-0 hover:shadow-md transition-shadow overflow-hidden"
        >
            <div className={`p-5 flex flex-col md:flex-row items-start md:items-center gap-5 cursor-pointer ${isExpanded ? 'bg-gray-50/50' : ''}`} onClick={() => setIsExpanded(!isExpanded)}>
                {/* Rank Badge */}
                <div className="flex-shrink-0 flex flex-col items-center justify-center w-12 text-center">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rank</span>
                    <span className="text-2xl font-black text-gray-300">#{rank}</span>
                </div>

                {/* Candidate Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-gray-900 truncate">{candidate.name || "Unknown"}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${candidate.status === 'Failed' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                            {candidate.status}
                        </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1.5"><Brain size={14} className="text-blue-500" /> {matchedSkills.length} Matching Skills</span>
                        <span className="flex items-center gap-1.5"><AlertCircle size={14} className="text-amber-500" /> {missingSkills.length} Missing</span>
                    </div>
                </div>

                {/* Score */}
                <div className="flex items-center gap-4 flex-shrink-0">
                    <div className={`flex flex-col items-end`}>
                        <span className="text-xs font-semibold text-gray-500 uppercase">Match Score</span>
                        <div className={`text-2xl font-black ${getScoreColor(candidate.score).split(' ')[0]}`}>
                            {candidate.score || 0}%
                        </div>
                    </div>
                    <button className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>
            </div>

            {/* Expanded AI Summary */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-gray-100 bg-white px-5 py-6 space-y-4"
                    >
                        <div className="flex items-start gap-3">
                            <Sparkles className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                            <div className="space-y-2">
                                <h4 className="text-sm font-bold text-gray-900">AI Screening Summary</h4>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    {candidate.reasoning}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-8">
                            <div>
                                <h5 className="text-xs font-bold text-green-700 uppercase tracking-wide mb-2">Relevant Strengths</h5>
                                <div className="flex flex-wrap gap-2">
                                    {matchedSkills.slice(0, 5).map((s, i) => (
                                        <span key={i} className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs border border-green-100">{s}</span>
                                    ))}
                                    {matchedSkills.length > 5 && <span className="text-xs text-gray-400">+{matchedSkills.length - 5} more</span>}
                                </div>
                            </div>
                            <div>
                                <h5 className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">Potential Gaps</h5>
                                <div className="flex flex-wrap gap-2">
                                    {missingSkills.slice(0, 5).map((s, i) => (
                                        <span key={i} className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs border border-red-100">{s}</span>
                                    ))}
                                    {missingSkills.length === 0 && <span className="text-xs text-gray-400 italic">No major gaps identified.</span>}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// --- Main Page Component ---
const ResumeScreening = () => {
    const [jobDescription, setJobDescription] = useState('');
    const [files, setFiles] = useState([]);

    // Screening Settings
    const [shortlistCount, setShortlistCount] = useState(5);

    // Screening State
    const [isScreening, setIsScreening] = useState(false);
    const [currentFileIndex, setCurrentFileIndex] = useState(-1);
    const [processingStage, setProcessingStage] = useState('idle');

    const [processedCount, setProcessedCount] = useState(0);
    const [results, setResults] = useState([]);

    // Validation
    const isCountInvalid = files.length > 0 && shortlistCount > files.length;
    const isValidToStart = files.length > 0 && jobDescription.trim() && !isCountInvalid && shortlistCount > 0;

    // Drag & Drop
    const onDrop = useCallback((acceptedFiles) => {
        setFiles(prev => [...prev, ...acceptedFiles]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }
    });

    const startScreening = async () => {
        if (!isValidToStart) return;

        setIsScreening(true);
        setResults([]);
        setProcessedCount(0);
        setCurrentFileIndex(0);

        let allProcessedCandidates = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setCurrentFileIndex(i);

            setProcessingStage('parsing');
            await new Promise(r => setTimeout(r, 600));

            setProcessingStage('extracting');
            await new Promise(r => setTimeout(r, 600));

            setProcessingStage('matching');

            const formData = new FormData();
            formData.append('job_description', jobDescription);
            formData.append('files', file);

            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${API_URL}/api/resume/screen/`, {
                    method: 'POST',
                    headers: {
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: formData
                });

                if (response.status === 401) {
                    alert("Session expired. Please log in again.");
                    localStorage.removeItem('token');
                    window.location.href = '/portal/login';
                    setIsScreening(false);
                    return;
                }

                if (response.ok) {
                    setProcessingStage('scoring');
                    await new Promise(r => setTimeout(r, 400));

                    const data = await response.json();

                    if (data.results && data.results.length > 0) {
                        const res = data.results[0];
                        const mappedResult = {
                            id: `res-${Date.now()}-${i}`,
                            name: res.candidate?.name || file.name,
                            score: res.score || 0,
                            status: res.error ? 'Failed' : 'Screened',
                            analysis: res.analysis || {},
                            reasoning: res.reasoning || "Analysis complete.",
                            error: res.error
                        };

                        allProcessedCandidates.push(mappedResult);
                        allProcessedCandidates.sort((a, b) => b.score - a.score);
                        const topK = allProcessedCandidates.slice(0, shortlistCount);

                        setResults([...topK]);
                        setProcessedCount(prev => prev + 1);
                    }
                } else {
                    console.error("Failed to screen", file.name);
                    const errorMsg = await response.text();
                    console.error("Server Error Detail:", errorMsg);
                }
            } catch (err) {
                console.error("Network error for", file.name, err);
            }
        }

        setIsScreening(false);
        setProcessingStage('idle');
        setCurrentFileIndex(-1);
    };

    return (
        <div className="max-w-7xl mx-auto pb-10 px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">AI Resume Screening</h1>
                <p className="text-gray-500 mt-2">
                    Upload resumes to parse, evaluate, and rank candidates against your specific job criteria in real-time.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-180px)]">

                {/* LEFT COLUMN: Inputs & Upload (Sticky & Scrollable) */}
                <div className="lg:col-span-4 space-y-4 flex flex-col h-full overflow-hidden">
                    {/* JD Input */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex-shrink-0">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                                <FileText size={16} className="text-blue-600" /> Job Description
                            </h3>
                            <button onClick={() => setJobDescription('')} className="text-xs text-blue-600 hover:underline">Clear</button>
                        </div>
                        <textarea
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            placeholder={`Paste job description...`}
                            className="w-full h-32 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
                        />
                    </div>

                    {/* Upload Zone */}
                    <div className="bg-white border rounded-xl p-4 shadow-sm flex flex-col flex-1 min-h-0">
                        <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2 text-sm">
                            <Upload size={16} className="text-purple-600" /> Upload Resumes
                        </h3>

                        <div
                            {...getRootProps()}
                            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all flex-shrink-0 ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`}
                        >
                            <input {...getInputProps()} />
                            <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2">
                                <Upload size={16} />
                            </div>
                            <p className="text-xs font-bold text-gray-700">Click or drag files</p>
                        </div>

                        {/* File Queue - Internal Scroll */}
                        {files.length > 0 && (
                            <div className="mt-4 flex-1 min-h-0 flex flex-col">
                                <div className="flex justify-between text-xs text-gray-500 font-medium mb-2">
                                    <span>{files.length} files queued</span>
                                    <button onClick={() => setFiles([])} className="text-red-500 hover:underline">Remove All</button>
                                </div>
                                <div className="overflow-y-auto custom-scrollbar flex-1 space-y-1 pr-1">
                                    {files.map((file, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs border border-gray-100">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${results.length > idx ? 'bg-green-500' : idx === currentFileIndex ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
                                                <span className="truncate max-w-[150px]">{file.name}</span>
                                            </div>
                                            {isScreening && idx === currentFileIndex && <Loader2 size={10} className="animate-spin text-blue-500" />}
                                            {!isScreening && (
                                                <button onClick={() => setFiles(files.filter(f => f !== file))} className="text-gray-400 hover:text-red-500">
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: Results & Actions */}
                <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">

                    {/* Header with Actions (Sticky) */}
                    <div className={`bg-white border rounded-xl p-4 mb-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-500 ${files.length > 0 && !isScreening ? 'ring-2 ring-blue-500 ring-offset-2 scale-[1.01]' : 'border-gray-200'}`}>
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                Screening Results
                                {(processedCount > 0 || results.length > 0) && (
                                    <span className="text-xs font-normal text-gray-500 px-2 py-0.5 bg-gray-100 rounded-full border border-gray-200">
                                        Top {results.length} / {processedCount}
                                    </span>
                                )}
                            </h2>
                        </div>

                        {/* Top-Right Action Group */}
                        <div className="flex items-center gap-3">
                            {/* Shortlist Setting */}
                            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200" title="Top candidates to return">
                                <span className="text-xs font-bold text-gray-500">Top:</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={shortlistCount}
                                    onChange={(e) => setShortlistCount(parseInt(e.target.value) || 0)}
                                    className={`w-10 bg-transparent text-center text-sm font-bold focus:outline-none ${isCountInvalid ? 'text-red-600' : 'text-gray-900'}`}
                                />
                            </div>

                            <button
                                onClick={startScreening}
                                disabled={!isValidToStart || isScreening}
                                className={`px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all shadow-md whitespace-nowrap ${!isValidToStart || isScreening
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg hover:-translate-y-0.5'
                                    }`}
                            >
                                {isScreening ? (
                                    <><Loader2 size={16} className="animate-spin" /> Processing...</>
                                ) : (
                                    <>Start Screening <Play size={16} fill="currentColor" /></>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Validation Error Banner (If Invalid) */}
                    {isCountInvalid && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                            className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm text-red-700"
                        >
                            <AlertCircle size={16} />
                            <strong>Action Required:</strong> Candidate count ({shortlistCount}) cannot exceed uploaded resumes ({files.length}).
                        </motion.div>
                    )}

                    {/* Scrollable Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-4">
                        {/* 1. Active Processing Card */}
                        <AnimatePresence>
                            {isScreening && currentFileIndex >= 0 && (
                                <ProcessingStatus
                                    currentFile={files[currentFileIndex]}
                                    stage={processingStage}
                                />
                            )}
                        </AnimatePresence>

                        {/* 2. Results List */}
                        <div className="space-y-4">
                            {results.length === 0 && !isScreening && (
                                <div className="border-2 border-dashed border-gray-200 rounded-2xl h-full min-h-[300px] flex flex-col items-center justify-center text-gray-400 bg-gray-50/50">
                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-3">
                                        <Brain size={24} className="opacity-20" />
                                    </div>
                                    <p className="font-medium">Ready to Analyze</p>
                                    <p className="text-sm">Upload resumes → Click Start Screening</p>
                                </div>
                            )}

                            <AnimatePresence>
                                {results.map((candidate, idx) => (
                                    <CandidateResultCard key={candidate.id} candidate={candidate} rank={idx + 1} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResumeScreening;

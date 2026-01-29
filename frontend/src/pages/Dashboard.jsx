import React, { useState, useEffect } from 'react';
import { Layout, Users, FileText, CheckCircle, BrainCircuit, Activity } from 'lucide-react';
import CandidateTable from '../components/CandidateTable';
import { Link } from 'react-router-dom';
import API_URL from '../apiConfig';

const Dashboard = () => {
    const [stats, setStats] = useState({
        metrics: { active: 0, screened: 0, assessments: 0, offers: 0 }
    });
    const [allCandidates, setAllCandidates] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async (background = false) => {
        if (!background) setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` };

            // 1. Fetch Stats for Top Cards
            const statsRes = await fetch(`${API_URL}/api/resume/stats/`, { headers, cache: 'no-store' });
            if (statsRes.status === 401) {
                alert("Session expired. Please log in again.");
                localStorage.removeItem('token');
                window.location.href = '/portal/login';
                return;
            }
            if (statsRes.ok) {
                const data = await statsRes.json();
                setStats(data);
            }

            // 2. Fetch ALL Candidates for the Table
            const candidatesRes = await fetch(`${API_URL}/api/resume/candidates/`, { headers, cache: 'no-store' });
            if (candidatesRes.ok) {
                const data = await candidatesRes.json();
                setAllCandidates(data);
            }

        } catch (error) {
            console.error("Dashboard fetch error:", error);
        } finally {
            if (!background) setLoading(false);
        }
    };

    const handlePromote = async (candidateIds) => {
        if (!candidateIds || candidateIds.length === 0) return;

        if (!window.confirm(`Promote ${candidateIds.length} selected candidate(s) to their respective NEXT stages?`)) return;

        try {
            const res = await fetch(`${API_URL}/api/resume/candidates/bulk-update/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    candidate_ids: candidateIds,
                    stage: 'NEXT'
                })
            });

            if (res.ok) {
                alert('Candidates promoted successfully!');
                fetchData();
            } else {
                const errorData = await res.json();
                alert(`Failed to promote: ${errorData.detail || 'Unknown error'}`);
            }
        } catch (error) {
            console.error("Promotion failed:", error);
            alert('An error occurred during promotion.');
        }
    };

    useEffect(() => {
        fetchData(); // Initial load

        const interval = setInterval(() => fetchData(true), 5000); // Poll every 5s

        // Auto-refresh on focus
        const handleFocus = () => fetchData(true);
        window.addEventListener('focus', handleFocus);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    const statCards = [
        { title: 'Active Candidates', value: stats.metrics.active, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
        { title: 'Resume Screened', value: stats.metrics.screened, icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
        { title: 'In Assessments', value: stats.metrics.assessments, icon: BrainCircuit, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
        { title: 'Hired / Offers', value: stats.metrics.offers, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    ];

    return (
        <div className="space-y-8 max-w-[1600px] mx-auto pb-12 px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="border-b border-gray-200 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2 rounded-lg shadow-sm">
                            <Layout className="text-white" size={24} />
                        </div>
                        Hiring Control Panel
                    </h1>
                    <p className="text-gray-500 mt-2 text-sm font-medium">Real-time overview of your recruitment pipeline and candidate progress.</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span className="text-sm font-bold text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                        {loading ? 'System Active' : `Assessments Validated: ${stats.metrics.assessments}`}
                    </span>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {statCards.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <div key={index} className={`bg-white rounded-2xl p-6 border ${stat.border} shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group`}>
                            <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform scale-150 rotate-12`}>
                                <Icon size={64} className={stat.color} />
                            </div>
                            <div className="flex items-center gap-4 relative z-10">
                                <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} border border-white/50 shadow-sm`}>
                                    <Icon size={24} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">{stat.title}</p>
                                    <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{loading ? '-' : stat.value}</h3>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Main Content: Candidate Table */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Activity className="text-blue-600" size={20} />
                        Live Candidate Pipeline
                    </h2>
                    <Link to="/candidates" className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                        View Full List <Users size={16} />
                    </Link>
                </div>

                {/* Candidate Table with Enhanced Filtering */}
                <CandidateTable
                    candidates={allCandidates}
                    currentStage="Dashboard"
                    onRefresh={fetchData}
                    showRoleColumn={true}
                    showStageColumn={true}
                    enableStageFilter={true}
                    enableScoreFilter={true}
                    showAnalyticsAction={false}
                    showRecommendation={true}
                />
            </div>
        </div>
    );
};

export default Dashboard;

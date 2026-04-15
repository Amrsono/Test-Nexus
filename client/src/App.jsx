import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area 
} from 'recharts';
import { 
  Activity, CheckCircle2, AlertCircle, Clock, 
  Upload, Brain, Users, Bug, ArrowUpRight, TrendingDown, Settings, Plus, Terminal, Maximize2 
} from 'lucide-react';
import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:5000/api';
const socket = io('http://localhost:5000');

const App = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [stats, setStats] = useState({ total: 0, passed: 0, failed: 0, blocked: 0, pending: 0 });
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentLogs, setAgentLogs] = useState([]);
  const [unassignedCases, setUnassignedCases] = useState([]);
  const [testers, setTesters] = useState([]);
  const [selectedTesterId, setSelectedTesterId] = useState('');
  const [burndownData, setBurndownData] = useState([]);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [newTester, setNewTester] = useState({ name: '', email: '' });
  const [editingTester, setEditingTester] = useState(null);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [activeHeaders, setActiveHeaders] = useState([]);
  const [activeUploadFile, setActiveUploadFile] = useState(null);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [allTestCases, setAllTestCases] = useState([]);
  const [manualMap, setManualMap] = useState({
    externalId: '',
    summary: '',
    steps: '',
    expectedResult: '',
    priority: '',
    module: ''
  });

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  useEffect(() => {
    fetchProjects();
    fetchTesters();

    socket.on('agent:status', (data) => {
      setAgentLogs(prev => [...prev.slice(-4), data.message]); // Keep last 5 logs
    });

    return () => socket.off('agent:status');
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchStats();
      fetchInsights();
      fetchUnassigned();
      fetchAllTestCases();
      fetchBurndown();
    }
  }, [selectedProjectId]);

  const fetchTesters = async () => {
    try {
      const res = await axios.get(`${API_BASE}/users`);
      setTesters(res.data);
      if (res.data.length > 0 && !selectedTesterId) setSelectedTesterId(res.data[0].id);
    } catch (err) {
      console.error('Fetch testers failed', err);
    }
  };

  const handleAddTester = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/users`, newTester);
      setNewTester({ name: '', email: '' });
      fetchTesters();
    } catch (err) {
      console.error('Add tester failed', err);
    }
  };

  const handleUpdateTester = async (e) => {
    e.preventDefault();
    try {
      await axios.patch(`${API_BASE}/users/${editingTester.id}`, editingTester);
      setEditingTester(null);
      fetchTesters();
    } catch (err) {
      console.error('Update tester failed', err);
    }
  };

  const handleDeleteTester = async (id) => {
    if (!window.confirm('Are you sure? This will remove all assignments for this tester.')) return;
    try {
      await axios.delete(`${API_BASE}/users/${id}`);
      fetchTesters();
      fetchUnassigned();
      fetchStats();
    } catch (err) {
      console.error('Delete tester failed', err);
    }
  };

  const fetchUnassigned = async (projectIdOverride) => {
    const id = projectIdOverride || selectedProjectId;
    if (!id) return;
    try {
      const res = await axios.get(`${API_BASE}/test-cases/unassigned?projectId=${id}`);
      setUnassignedCases(res.data);
    } catch (err) {
      console.error('Fetch unassigned failed', err);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${API_BASE}/projects`);
      setProjects(res.data);
      if (res.data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(res.data[0].id);
      }
    } catch (err) {
      console.error('Projects error', err);
    }
  };

  const fetchStats = async (projectIdOverride) => {
    const id = projectIdOverride || selectedProjectId;
    if (!id) return;
    try {
      const res = await axios.get(`${API_BASE}/test-cases/stats?projectId=${id}`);
      setStats(res.data);
    } catch (err) {
      console.error('Stats error', err);
    }
  };

  const fetchInsights = async () => {
    try {
      const res = await axios.get(`${API_BASE}/insights?projectId=${selectedProjectId}`);
      setInsights(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Insights error', err);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('suiteName', 'Import ' + new Date().toLocaleDateString());
    formData.append('projectId', selectedProjectId);

    try {
      setLoading(true);
      setAgentLogs(['System: Initiating secure upload...']);
      const res = await axios.post(`${API_BASE}/upload`, formData);
      
      if (res.status === 202 && res.data.status === 'MAPPING_REQUIRED') {
        setActiveHeaders(res.data.headers);
        setActiveUploadFile(file);
        setIsMappingModalOpen(true);
        setAgentLogs(prev => [...prev, 'System: Switching to Manual Mapping...']);
        return;
      }

      const newProjectId = res.data.projectId;
      
      // Refresh projects and switch if a new one was discovered
      await fetchProjects();
      setSelectedProjectId(newProjectId);
      
      // Explicitly refresh data for the new/current project using the ID directly to avoid state race conditions
      await fetchStats(newProjectId);
      await fetchUnassigned(newProjectId);
      await fetchAllTestCases(newProjectId);
      await handleAnalyze();
      
      if (res.data.discoveredProject) {
        alert(`Project Discovered: ${res.data.discoveredProject}`);
      } else {
        alert('Test plan imported successfully!');
      }
    } catch (err) {
      console.error('Upload failed', err);
      alert('Failed to import test plan');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!activeUploadFile) return;

    const formData = new FormData();
    formData.append('file', activeUploadFile);
    formData.append('suiteName', 'Manual Import ' + new Date().toLocaleDateString());
    formData.append('projectId', selectedProjectId);
    formData.append('manualMapping', JSON.stringify(manualMap));

    try {
      setLoading(true);
      setIsMappingModalOpen(false);
      setAgentLogs(prev => [...prev, 'System: Processing manual extraction...']);
      
      const res = await axios.post(`${API_BASE}/upload`, formData);
      const newProjectId = res.data.projectId;

      await fetchProjects();
      setSelectedProjectId(newProjectId);
      await fetchStats(newProjectId);
      await fetchUnassigned(newProjectId);
      await fetchAllTestCases(newProjectId);
      await handleAnalyze();
      
      setAgentLogs(prev => [...prev, 'System: Manual Import Successful.']);
      alert('Test plan imported manually!');
    } catch (err) {
      console.error('Manual upload failed', err);
      alert('Failed to import test plan manually');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('logo', file);

    try {
      setLoading(true);
      await axios.patch(`${API_BASE}/projects/${selectedProjectId}`, formData);
      await fetchProjects();
      alert('Logo updated!');
    } catch (err) {
      console.error('Logo upload failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    try {
      await axios.post(`${API_BASE}/insights/analyze`, { projectId: selectedProjectId });
      await fetchInsights();
      await fetchUnassigned();
    } catch (err) {
      console.error('Analysis failed', err);
    }
  };

  const handleAssign = async (caseId) => {
    if (!selectedTesterId) return;
    try {
      await axios.post(`${API_BASE}/assignments/assign`, {
        testerId: selectedTesterId,
        testCaseIds: [caseId]
      });
      await fetchUnassigned();
      await fetchStats();
      await fetchTesters();
    } catch (err) {
      console.error('Assignment failed', err);
    }
  };

  const fetchAllTestCases = async (projectIdOverride) => {
    const id = projectIdOverride || selectedProjectId;
    if (!id) return;
    try {
      const res = await axios.get(`${API_BASE}/test-cases?projectId=${id}`);
      setAllTestCases(res.data);
    } catch (err) {
      console.error('Fetch all cases error', err);
    }
  };

  const fetchBurndown = async (projectIdOverride) => {
    const id = projectIdOverride || selectedProjectId;
    if (!id) return;
    try {
      const res = await axios.get(`${API_BASE}/test-cases/burndown?projectId=${id}`);
      setBurndownData(res.data);
    } catch (err) {
      console.error('Burndown error', err);
    }
  };

  const handleProjectDateUpdate = async (field, value) => {
    if (!selectedProjectId) return;
    try {
      const res = await axios.patch(`${API_BASE}/projects/${selectedProjectId}`, { [field]: value });
      setProjects(projects.map(p => p.id === selectedProjectId ? res.data : p));
      fetchBurndown();
    } catch (err) {
      console.error('Date update failed', err);
    }
  };

  const handleExportPPT = () => {
    if (!selectedProjectId) {
      alert("Please select a project first.");
      return;
    }

    // Standard download trigger via backend-generated binary with cache-buster
    window.open(`${API_BASE}/reports/project/${selectedProjectId}/ppt?t=${new Date().getTime()}`, '_blank');
  };
;

  const updateCaseStatus = async (caseId, status) => {
    try {
      await axios.patch(`${API_BASE}/test-cases/${caseId}/status`, { status });
      await fetchAllTestCases();
      await fetchStats();
      await fetchInsights();
      fetchBurndown();
    } catch (err) {
      console.error('Update status failed', err);
    }
  };

  const updateCaseAssignment = async (caseId, testerId) => {
    try {
      await axios.post(`${API_BASE}/assignments/assign`, {
        testerId: testerId || null,
        testCaseIds: [caseId]
      });
      await fetchAllTestCases();
      await fetchUnassigned();
      await fetchTesters();
      fetchBurndown();
    } catch (err) {
      console.error('Assignment update failed', err);
    }
  };


  const handleThemeChange = async (color) => {
    try {
      const res = await axios.patch(`${API_BASE}/projects/${selectedProjectId}`, { themeColor: color });
      setProjects(projects.map(p => p.id === selectedProjectId ? res.data : p));
    } catch (err) {
      console.error('Theme change failed', err);
    }
  };

  const isDark = selectedProject?.themeColor === '#1a1a2e' || selectedProject?.themeColor === '#020617';
  const textColor = isDark ? 'text-white' : 'text-slate-900';
  const subTextColor = isDark ? 'text-slate-400' : 'text-slate-500';
  const cardBg = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-100';

  const themes = [
    { name: 'Light', color: '#f8fafc' },
    { name: 'Burgundy', color: '#1a1a2e' },
    { name: 'Stealth', color: '#020617' }
  ];

  return (
    <div 
      className="min-h-screen p-6 md:p-10 font-sans transition-all duration-700 ease-in-out"
      style={{ backgroundColor: selectedProject?.themeColor || '#f8fafc' }}
    >
      <header className="flex flex-col gap-6 mb-10">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            {selectedProject?.logoUrl ? (
               <img src={selectedProject.logoUrl} alt="Project Logo" className="w-12 h-12 rounded-2xl object-cover shadow-md" />
            ) : (
              <div className={`w-12 h-12 ${isDark ? 'bg-white/10' : 'bg-white'} rounded-2xl flex items-center justify-center shadow-md`}>
                <Brain className="text-primary" />
              </div>
            )}
            <div>
              <h1 className={`text-3xl font-extrabold tracking-tight ${textColor}`}>
                {selectedProject?.name || 'TestNexus'}
              </h1>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor}`}>Start:</span>
                  <input 
                    type="date"
                    value={selectedProject?.startDate ? new Date(selectedProject.startDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => handleProjectDateUpdate('startDate', e.target.value)}
                    className={`bg-transparent border-none text-[10px] font-bold ${textColor} focus:ring-0 cursor-pointer p-0`}
                  />
                </div>
                <div className="flex items-center gap-2 border-l pl-4 border-slate-700">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor}`}>Go-Live:</span>
                  <input 
                    type="date"
                    value={selectedProject?.goLiveDate ? new Date(selectedProject.goLiveDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => handleProjectDateUpdate('goLiveDate', e.target.value)}
                    className={`bg-transparent border-none text-[10px] font-bold ${textColor} focus:ring-0 cursor-pointer p-0`}
                  />
                </div>
              </div>
           </div>
          </div>
          <div className="flex gap-4">
            <div className={`flex items-center gap-1 p-1 rounded-xl ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-100'} border`}>
              {themes.map(t => (
                <button
                  key={t.name}
                  onClick={() => handleThemeChange(t.color)}
                  className={`w-8 h-8 rounded-lg border transition-all ${selectedProject?.themeColor === t.color ? 'ring-2 ring-primary scale-90' : 'opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: t.color }}
                  title={t.name}
                />
              ))}
            </div>
            <button 
              onClick={handleExportPPT}
              className={`flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20`}
            >
              <Upload className="w-4 h-4 rotate-180" />
              Export Report
            </button>
            <label className={`flex items-center gap-2 px-5 py-2.5 ${isDark ? 'bg-white/10 text-white border-white/20' : 'bg-white text-slate-700 border-slate-200'} border rounded-xl font-semibold hover:opacity-80 transition-all shadow-sm cursor-pointer`}>
              <Plus size={18} />
              Logo
              <input type="file" className="hidden" onChange={handleLogoUpload} accept="image/*" />
            </label>
            <label className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 cursor-pointer">
              <Upload size={18} />
              Import
              <input type="file" className="hidden" onChange={handleUpload} accept=".xlsx,.xls,.csv" />
            </label>
          </div>
        </div>

        {/* Project Tabs */}
        <div className={`flex gap-2 p-1 ${isDark ? 'bg-black/20' : 'bg-white/20'} backdrop-blur-sm rounded-2xl border ${isDark ? 'border-white/10' : 'border-white/40'} w-fit`}>
          {projects.map(project => (
            <button
              key={project.id}
              onClick={() => setSelectedProjectId(project.id)}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                selectedProjectId === project.id 
                ? (isDark ? 'bg-primary text-white shadow-lg shadow-primary/40' : 'bg-white text-primary shadow-lg')
                : (isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:bg-white/40')
              }`}
            >
              {project.name}
            </button>
          ))}
        </div>
      </header>

      {loading && !selectedProjectId ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Top Hero: Executive Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard label="Total Cases" value={stats.total} icon={<Activity className="text-blue-500" />} change="+12%" isDark={isDark} />
              <MetricCard label="Passed" value={stats.passed} icon={<CheckCircle2 className="text-emerald-500" />} change="78%" trend="up" isDark={isDark} />
              <MetricCard label="Blocked" value={stats.blocked} icon={<AlertCircle className="text-amber-500" />} change="4 cases" trend="down" isDark={isDark} />
              <MetricCard label="Health Status" value={stats.total > 0 ? "Active" : "New"} icon={<TrendingDown className="text-indigo-500" />} status="LIVE" isDark={isDark} />
            </div>

            <div className={`${cardBg} p-8 rounded-3xl shadow-xl`}>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className={`text-xl font-bold ${textColor}`}>Execution Burndown</h3>
                  <p className={`text-sm ${subTextColor}`}>Actual vs. Ideal Progress</p>
                </div>
              </div>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={burndownData}>
                    <defs>
                      <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} minTickGap={60} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    />
                    <Area type="monotone" dataKey="actual" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorActual)" />
                    <Line type="monotone" dataKey="ideal" stroke="#e2e8f0" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className={`${cardBg} p-6 rounded-3xl shadow-lg`}>
                <div className="flex justify-between items-center mb-4">
                  <h4 className={`font-bold ${textColor} flex items-center gap-2`}>
                    <Users size={20} className={subTextColor} />
                    Workload Balance
                  </h4>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => {
                        fetchAllTestCases();
                        setIsTrackerOpen(true);
                      }}
                      className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-indigo-400' : 'text-indigo-600'} hover:opacity-70 transition-all`}
                    >
                      <Maximize2 size={12} />
                      Full Tracker
                    </button>
                    <button 
                      onClick={() => setIsTeamModalOpen(true)}
                      className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-primary' : 'text-slate-500'} hover:opacity-70 transition-all`}
                    >
                      Manage Team
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="max-h-[120px] overflow-y-auto pr-2 space-y-3 mb-6">
                    {testers.map(tester => (
                      <div key={tester.id} className="flex justify-between items-center text-sm">
                        <span className={`${subTextColor} font-medium`}>{tester.name}</span>
                        <div className={`w-1/2 ${isDark ? 'bg-white/10' : 'bg-slate-100'} h-2 rounded-full overflow-hidden`}>
                          <div className="bg-blue-500 h-full transition-all" style={{ width: `${Math.min(100, (tester.assignments?.length || 0) * 20)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={`border-t ${isDark ? 'border-white/10' : 'border-slate-100'} pt-4`}>
                    <div className="flex justify-between items-center mb-3">
                      <h5 className={`text-xs font-bold uppercase tracking-wider ${subTextColor}`}>Pending Pool</h5>
                      <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-bold rounded-full">{unassignedCases.length} Cases</span>
                    </div>
                    
                    {unassignedCases.length > 0 ? (
                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-2">
                        {unassignedCases.map(c => (
                          <div key={c.id} className={`${isDark ? 'bg-white/5' : 'bg-slate-50'} p-3 rounded-xl border ${isDark ? 'border-white/10' : 'border-slate-200'} flex justify-between items-center gap-4`}>
                            <div className="min-w-0">
                              <p className={`text-xs font-bold ${textColor} truncate`}>{c.summary}</p>
                              <p className={`text-[10px] ${subTextColor} uppercase`}>{c.priority}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <select 
                                value={selectedTesterId}
                                onChange={(e) => setSelectedTesterId(e.target.value)}
                                className={`text-[10px] font-bold p-1 rounded-lg border ${isDark ? 'bg-slate-900 border-white/20 text-white' : 'bg-white border-slate-300'}`}
                              >
                                {testers.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                              <button 
                                onClick={() => handleAssign(c.id)}
                                className="p-1.5 bg-primary text-white rounded-lg hover:bg-primary/80 transition-all"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`text-center py-6 border-2 border-dashed ${isDark ? 'border-white/5' : 'border-slate-100'} rounded-2xl`}>
                        <p className={`text-xs ${subTextColor} italic`}>All work currently assigned</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className={`${cardBg} p-6 rounded-3xl shadow-lg`}>
                <h4 className={`font-bold ${textColor} mb-4 flex items-center gap-2`}>
                  <Bug size={20} className={subTextColor} />
                  Major Blockers
                </h4>
                <div className="space-y-3">
                  <div className={`flex items-start gap-3 p-3 ${isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100'} rounded-2xl border`}>
                    <div className={`p-1.5 ${isDark ? 'bg-red-500/20' : 'bg-red-100'} rounded-lg text-red-600`}>
                      <AlertCircle size={16} />
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${isDark ? 'text-red-400' : 'text-red-900'} line-clamp-1`}>API Blocker - Priority 0</p>
                      <p className={`text-xs ${isDark ? 'text-red-400/70' : 'text-red-600'}`}>Affecting current sprint</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-2xl relative overflow-hidden h-fit">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Brain size={120} />
              </div>
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3 relative z-10 text-white">
                <Brain className="text-primary" />
                AI Advisor
              </h3>

              {agentLogs.length > 0 && (
                <div className="mb-8 relative z-10 bg-black/40 rounded-2xl p-4 border border-white/10 overflow-hidden group">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
                    <Terminal size={12} className="animate-pulse" />
                    Agent Live Status
                  </div>
                  <div className="space-y-2">
                    {agentLogs.map((log, i) => (
                      <div key={i} className={`text-xs font-mono transition-all duration-500 ${i === agentLogs.length - 1 ? 'text-white' : 'text-white/40'}`}>
                        <span className="text-primary mr-2">›</span>
                        {log}
                      </div>
                    ))}
                  </div>
                  <div className="absolute bottom-0 left-0 w-full h-1 bg-primary/20">
                    <div className="h-full bg-primary animate-progress-indefinite w-1/3" />
                  </div>
                </div>
              )}

              <div className="space-y-5 relative z-10">
                {insights.length > 0 ? insights.map((insight, idx) => (
                  <div key={idx} className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 hover:bg-white/20 transition-all group">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/60">{insight.type}</span>
                    </div>
                    <p className="text-sm font-medium leading-relaxed">
                      {insight.message}
                    </p>
                  </div>
                )) : (
                  <div className="text-slate-400 italic text-sm py-4">Generating daily insights for {selectedProject?.name}...</div>
                )}
              </div>
              <button 
                onClick={handleAnalyze}
                className="w-full mt-8 py-4 bg-white/10 border border-white/20 rounded-2xl font-bold text-sm hover:bg-white/20 transition-all text-white"
              >
                Refresh Strategy
              </button>
            </div>
          </aside>
        </div>
      )}
      
      {/* Team Management Modal */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'} border rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200`}>
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h3 className={`text-lg font-bold ${textColor}`}>Manage Team Members</h3>
              <button onClick={() => setIsTeamModalOpen(false)} className={subTextColor}>×</button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Add/Edit Form */}
              <form onSubmit={editingTester ? handleUpdateTester : handleAddTester} className="space-y-3">
                <input 
                  type="text" 
                  placeholder="Tester Name"
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} text-sm`}
                  value={editingTester ? editingTester.name : newTester.name}
                  onChange={(e) => editingTester ? setEditingTester({...editingTester, name: e.target.value}) : setNewTester({...newTester, name: e.target.value})}
                  required
                />
                <input 
                  type="email" 
                  placeholder="Email Address"
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} text-sm`}
                  value={editingTester ? editingTester.email : newTester.email}
                  onChange={(e) => editingTester ? setEditingTester({...editingTester, email: e.target.value}) : setNewTester({...newTester, email: e.target.value})}
                  required
                />
                <button type="submit" className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/80 transition-all">
                  {editingTester ? 'Update Member' : 'Add Team Member'}
                </button>
                {editingTester && (
                  <button type="button" onClick={() => setEditingTester(null)} className={`w-full py-2 ${subTextColor} text-xs font-bold uppercase`}>
                    Cancel Edit
                  </button>
                )}
              </form>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                <h4 className={`text-xs font-bold uppercase tracking-widest ${subTextColor}`}>Current Team</h4>
                {testers.map(t => (
                  <div key={t.id} className={`flex justify-between items-center p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-slate-50'} border ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <div>
                      <p className={`text-sm font-bold ${textColor}`}>{t.name}</p>
                      <p className={`text-[10px] ${subTextColor}`}>{t.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingTester(t)} className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-all">
                        <Settings size={14} />
                      </button>
                      <button onClick={() => handleDeleteTester(t.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                        <AlertCircle size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Manual Mapping Modal */}
      {isMappingModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <Brain className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Manual Mapping</h3>
                  <p className="text-sm text-slate-400">AI analysis failed. Please pick columns.</p>
                </div>
              </div>
            </div>
            
            <form onSubmit={handleManualSubmit} className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="grid gap-4">
                {[
                  { field: 'externalId', label: 'Test Case ID (#)', icon: <Activity className="w-4 h-4" /> },
                  { field: 'summary', label: 'Test Case Title', icon: <Plus className="w-4 h-4" /> },
                  { field: 'steps', label: 'Test Steps', icon: <Terminal className="w-4 h-4" /> },
                  { field: 'expectedResult', label: 'Expected Results', icon: <CheckCircle2 className="w-4 h-4" /> },
                  { field: 'priority', label: 'Priority Column', icon: <AlertCircle className="w-4 h-4" /> },
                  { field: 'module', label: 'Module/Release Tab', icon: <Activity className="w-4 h-4" /> },
                ].map(({ field, label, icon }) => (
                  <div key={field} className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 flex items-center gap-2">
                      {icon} {label}
                    </label>
                    <select
                      required={['externalId', 'summary'].includes(field)}
                      value={manualMap[field]}
                      onChange={(e) => setManualMap(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">Select Column...</option>
                      {activeHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </form>

            <div className="p-6 bg-slate-900/50 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsMappingModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleManualSubmit}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500 transition-all flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import Scenarios
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Global Execution Tracker Modal */}
      {isTrackerOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-12">
          <div className="bg-slate-900 border border-slate-800 w-full h-full max-w-7xl rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/20 rounded-2xl">
                  <Activity className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Global Execution Tracker</h2>
                  <p className="text-slate-400 text-sm">Managing {allTestCases.length} scenarios for {selectedProject?.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsTrackerOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
              >
                <Plus className="w-8 h-8 rotate-45" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-12">
              {Object.entries(
                allTestCases.reduce((acc, c) => {
                  const mod = c.module || 'Uncategorized';
                  if (!acc[mod]) acc[mod] = [];
                  acc[mod].push(c);
                  return acc;
                }, {})
              ).map(([module, cases]) => (
                <div key={module} className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-800" />
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 whitespace-nowrap bg-indigo-400/10 px-4 py-1.5 rounded-full border border-indigo-400/20">
                      {module}
                    </h3>
                    <div className="h-px flex-1 bg-slate-800" />
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {cases.map(tc => {
                      const assignee = tc.assignments?.[0]?.tester;
                      return (
                        <div 
                          key={tc.id} 
                          className="bg-slate-800/40 border border-slate-800 p-5 rounded-2xl hover:border-slate-700 transition-all group flex flex-col md:flex-row md:items-center gap-6"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-[10px] font-black text-slate-500 tracking-tighter uppercase whitespace-nowrap">
                                ID: {tc.externalId || 'N/A'}
                              </span>
                              <h4 className="text-white font-semibold truncate text-sm">
                                {tc.summary}
                              </h4>
                            </div>
                            <p className="text-[10px] text-slate-500 truncate uppercase tracking-widest">
                              Priority: {tc.priority}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-4">
                            {/* In-line Assignment */}
                            <div className="min-w-[140px]">
                              <select
                                value={assignee?.id || ''}
                                onChange={(e) => updateCaseAssignment(tc.id, e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-xl px-4 py-2 hover:border-indigo-500 transition-colors outline-none cursor-pointer"
                              >
                                <option value="">Unassigned</option>
                                {testers.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Status Controller */}
                            <div className="flex gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
                              {[
                                { status: 'PENDING', color: 'bg-slate-700 text-slate-300' },
                                { status: 'PASS', color: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' },
                                { status: 'FAIL', color: 'bg-red-500 text-white shadow-lg shadow-red-500/20' },
                                { status: 'BLOCKED', color: 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' }
                              ].map(s => (
                                <button
                                  key={s.status}
                                  onClick={() => updateCaseStatus(tc.id, s.status)}
                                  className={`px-3 py-1 text-[9px] font-black rounded-lg transition-all ${
                                    tc.status === s.status 
                                      ? s.color 
                                      : 'text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {s.status}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-8 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <div className="flex gap-8">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] uppercase font-bold">Total Scenarios</span>
                  <span className="text-white text-xl font-black">{allTestCases.length}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-emerald-500 text-[10px] uppercase font-bold">Passed</span>
                  <span className="text-emerald-400 text-xl font-black">
                    {allTestCases.filter(c => c.status === 'PASS').length}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setIsTrackerOpen(false)}
                className="px-10 py-3 bg-indigo-600 hover:bg-indigo-500 transition-all rounded-2xl text-white font-bold text-sm shadow-xl shadow-indigo-600/20"
              >
                Close Tracker
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ label, value, icon, change, status, trend, isDark }) => (
  <div className={`${isDark ? 'bg-white/5 border-white/10 shadow-black/20' : 'bg-white border-slate-100 shadow-slate-200/20'} p-6 rounded-3xl border shadow-xl hover:scale-[1.02] transition-transform duration-300`}>
    <div className="flex justify-between items-center mb-4">
      <div className={`p-3 ${isDark ? 'bg-white/10' : 'bg-slate-50'} rounded-2xl`}>
        {icon}
      </div>
      {status ? (
        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
          {status}
        </span>
      ) : (
        <span className={`text-xs font-bold ${trend === 'down' ? 'text-red-500' : 'text-emerald-500'}`}>
          {change}
        </span>
      )}
    </div>
    <h4 className={`${isDark ? 'text-slate-400' : 'text-slate-400'} text-sm font-medium mb-1`}>{label}</h4>
    <p className={`text-3xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'} tracking-tight`}>{value}</p>
  </div>
);

export default App;

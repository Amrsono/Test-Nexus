import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area 
} from 'recharts';
import { 
  Activity, CheckCircle2, AlertCircle, Clock, 
  Upload, Brain, Users, Bug, ArrowUpRight, TrendingDown, Settings, Plus, Terminal, Maximize2, Sparkles,
  ShoppingBag, Headphones, Smartphone, Home, Trash2, Monitor, MapPin, Layers
} from 'lucide-react';
import { io } from 'socket.io-client';

const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const API_BASE = isLocal ? 'http://localhost:5000/api' : '/api';
const socket = io(isLocal ? 'http://localhost:5000' : window.location.origin, {
  transports: ['websocket', 'polling']
});

const App = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [stats, setStats] = useState({ total: 0, passed: 0, failed: 0, blocked: 0, pending: 0 });
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentLogs, setAgentLogs] = useState([]);
  const [isEditScenarioModalOpen, setIsEditScenarioModalOpen] = useState(false);
  const [editingScenarioIndex, setEditingScenarioIndex] = useState(null);
  const [editingScenarioData, setEditingScenarioData] = useState(null);
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
  const [activeFilename, setActiveFilename] = useState('');
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [allTestCases, setAllTestCases] = useState([]);
  const [manualProjectName, setManualProjectName] = useState('');
  const [manualMap, setManualMap] = useState({
    externalId: '',
    summary: '',
    steps: '',
    expectedResult: '',
    priority: '',
    module: ''
  });

  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [newProjName, setNewProjName] = useState('');

  const [currentView, setCurrentView] = useState('dashboard'); // dashboard, lab
  const [labRequirements, setLabRequirements] = useState('');
  const [generatedScenarios, setGeneratedScenarios] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasLoadedDrafts, setHasLoadedDrafts] = useState(false);

  const [localTheme, setLocalTheme] = useState('#f8fafc');

  const [labConfig, setLabConfig] = useState({
    release: '',
    status: '',
    channels: [], // Retail, Call Center
    accountTypes: [], // HBB, Mobile
    journeyTypes: [], // New connection, Upgrade, Downgrade
    tcSteps: '',
    tcExpectedResults: '',
    priority: 'MEDIUM'
  });
  const [customJourneyType, setCustomJourneyType] = useState('');
  const [extraJourneys, setExtraJourneys] = useState([]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);


  useEffect(() => {
    if (selectedProject?.themeColor) {
      setLocalTheme(selectedProject.themeColor);
    }
  }, [selectedProject]);

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

  // Sync Drafts with LocalStorage for persistence across tabs/refresh
  useEffect(() => {
    const savedDrafts = localStorage.getItem('nexus_drafts');
    if (savedDrafts) {
      try {
        setGeneratedScenarios(JSON.parse(savedDrafts));
      } catch (e) {
        console.error('Failed to load drafts', e);
      }
    }
    
    const savedReqs = localStorage.getItem('nexus_lab_reqs');
    if (savedReqs) setLabRequirements(savedReqs);

    setHasLoadedDrafts(true);
  }, []);

  useEffect(() => {
    if (hasLoadedDrafts) {
      localStorage.setItem('nexus_drafts', JSON.stringify(generatedScenarios));
    }
  }, [generatedScenarios, hasLoadedDrafts]);

  useEffect(() => {
    if (hasLoadedDrafts) {
      localStorage.setItem('nexus_lab_reqs', labRequirements);
    }
  }, [labRequirements, hasLoadedDrafts]);

  const clearDrafts = () => {
    if (window.confirm('Are you sure you want to discard all current drafts?')) {
      setGeneratedScenarios([]);
      setLabRequirements('');
      localStorage.removeItem('nexus_drafts');
      localStorage.removeItem('nexus_lab_reqs');
    }
  };

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
      } else if (res.data.length === 0) {
        setLoading(false);
      }
    } catch (err) {
      console.error('Projects error', err);
      setLoading(false);
    }
  };

  const handleCreateProject = () => {
    setNewProjName('');
    setIsCreateProjectModalOpen(true);
  };

  const submitCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    try {
      setLoading(true);
      setIsCreateProjectModalOpen(false);
      const res = await axios.post(`${API_BASE}/projects`, { name: newProjName.trim(), themeColor: '#f8fafc' });
      await fetchProjects();
      setSelectedProjectId(res.data.id);
    } catch (err) {
      console.error('Create project failed', err);
      alert('Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleResetProject = async () => {
    if (!selectedProjectId) return;
    if (!window.confirm('Are you sure you want to MASTER RESET this project? This will delete ALL imported test plans, scenarios, assignments, defects, and insights for this project exclusively. The project name and logo will be preserved.')) return;

    try {
      setLoading(true);
      await axios.post(`${API_BASE}/projects/${selectedProjectId}/reset`);
      await fetchStats();
      await fetchInsights();
      await fetchUnassigned();
      await fetchAllTestCases();
      await fetchBurndown();
      alert('Project scenarios have been fully reset.');
    } catch (err) {
      console.error('Reset project failed', err);
      alert('Failed to reset project');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (id, name) => {
    if (!window.confirm(`Are you sure you want to completely DELETE the project "${name}" and all its data? This cannot be undone.`)) return;

    try {
      setLoading(true);
      await axios.delete(`${API_BASE}/projects/${id}`);
      
      const res = await axios.get(`${API_BASE}/projects`);
      setProjects(res.data);
      if (res.data.length > 0) {
        setSelectedProjectId(res.data[0].id);
      } else {
        setSelectedProjectId(null);
        setStats({ total: 0, passed: 0, failed: 0, blocked: 0, pending: 0 });
        setInsights([]);
        setUnassignedCases([]);
        setBurndownData([]);
      }
    } catch (err) {
      console.error('Delete project failed', err);
      alert('Failed to delete project');
    } finally {
      setLoading(false);
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
        // Pre-fill project name from filename (strip extension)
        const nameFromFile = file.name ? file.name.replace(/\.[^.]+$/, '') : 'New Project';
        setManualProjectName(nameFromFile);
        setActiveFilename(file.name);
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
    formData.append('manualProjectName', manualProjectName);

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
    if (!selectedProjectId) {
      alert("Please import a test plan first to establish a project context for your logo.");
      e.target.value = '';
      return;
    }
    
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('logo', file);

    try {
      setLoading(true);
      await axios.patch(`${API_BASE}/projects/${selectedProjectId}/logo`, formData);
      await fetchProjects();
      alert('Logo updated!');
    } catch (err) {
      console.error('Logo upload failed', err);
      alert('Logo upload failed. It might be too large.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackgroundUpload = async (e) => {
    if (!selectedProjectId) {
      alert("Please import a test plan first to establish a project context for your background.");
      e.target.value = '';
      return;
    }
    
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('background', file);

    try {
      setLoading(true);
      await axios.patch(`${API_BASE}/projects/${selectedProjectId}/background`, formData);
      await fetchProjects();
      alert('Background updated!');
    } catch (err) {
      console.error('Background upload failed', err);
      alert('Background upload failed. It might be too large.');
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

  const updateCaseStatus = async (caseId, status) => {
    // Enforcement: Journey will not be considered completed/passed unless all 4 validations are ticked
    if (status === 'PASS') {
      const tc = allTestCases.find(c => c.id === caseId);
      if (tc && (!tc.checkUi || !tc.checkOrderBuild || !tc.checkOrderCompletion || !tc.checkPcsMcpr)) {
        alert('Validation Blocked: You must manually tick all 4 validation points (UI, Order Build, Completion, PCS/MCPR) before passing this journey.');
        return;
      }
    }

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

  const updateCaseValidation = async (caseId, field, value) => {
    try {
      await axios.patch(`${API_BASE}/test-cases/${caseId}/validations`, { [field]: value });
      // Optimized state update to avoid full refresh for just a checkbox
      setAllTestCases(prev => prev.map(c => c.id === caseId ? { ...c, [field]: value } : c));
    } catch (err) {
      console.error('Validation update failed', err);
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

  const handleGenerateScenarios = async () => {
    if (!labRequirements.trim()) return;
    try {
      setIsGenerating(true);
      setAgentLogs(['System: Priming AI Drafting Lab...']);
      const res = await axios.post(`${API_BASE}/generator/generate`, {
        requirements: labRequirements,
        options: labConfig
      });
      setGeneratedScenarios(res.data);
      setAgentLogs(prev => [...prev, 'System: Scenarios drafted successfully.']);
    } catch (err) {
      console.error('Generation failed', err);
      const isQuota = err.response?.data?.error === 'AI_QUOTA_EXCEEDED' || err.message?.includes('429');
      
      if (isQuota) {
        setAgentLogs(prev => [...prev, 'System: AI is currently busy. Please wait 30s and try again.']);
        alert('AI Quota Exceeded: Gemini is processing too many requests right now. Please wait about 30-60 seconds before trying again.');
      } else {
        alert('Failed to generate scenarios. Please check your API key or requirements complexity.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportLabExcel = async () => {
    if (generatedScenarios.length === 0) return;
    try {
      const res = await axios.post(`${API_BASE}/generator/export`, { 
        scenarios: generatedScenarios,
        projectName: selectedProject?.name || 'Test_Nexus'
      }, { responseType: 'blob' });
      
      // Robust blob handling for browser compatibility
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const fileName = `${(selectedProject?.name || 'Test_Nexus').replace(/[^a-z0-9]/gi, '_')}_Draft.xlsx`;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Excel export failed', err);
      const msg = err.response?.data?.error || err.message || 'Unknown error';
      alert(`Failed to export Excel: ${msg}. Please check your connection and try again.`);
    }
  };

  const handleCommitScenarios = async () => {
    if (!selectedProjectId || generatedScenarios.length === 0) return;
    if (!window.confirm(`Save ${generatedScenarios.length} scenarios to ${selectedProject?.name || 'the project'}?`)) return;

    try {
      setLoading(true);
      // Create a default suite for AI generated cases if none exists or just use a generic name
      const suiteName = 'AI Generated - ' + new Date().toLocaleDateString();
      
      // We'll reuse the upload-style logic but for JSON
      await axios.post(`${API_BASE}/test-cases/bulk`, {
        projectId: selectedProjectId,
        suiteName,
        testCases: generatedScenarios
      });

      alert('Scenarios saved to project!');
      fetchStats();
      fetchAllTestCases();
    } catch (err) {
      console.error('Commit failed', err);
      const msg = err.response?.data?.error || err.message || 'Unknown error';
      alert(`Failed to save scenarios: ${msg}. Please check the console for details.`);
    } finally {
      setLoading(false);
    }
  };


  const handleThemeChange = async (color) => {
    setLocalTheme(color);
    if (!selectedProjectId) return;
    try {
      const res = await axios.patch(`${API_BASE}/projects/${selectedProjectId}`, { themeColor: color });
      setProjects(projects.map(p => p.id === selectedProjectId ? res.data : p));
    } catch (err) {
      console.error('Theme change failed', err);
    }
  };

  const handleDiscardScenario = (index) => {
    setGeneratedScenarios(prev => prev.filter((_, i) => i !== index));
  };

  const openEditScenario = (index) => {
    setEditingScenarioIndex(index);
    setEditingScenarioData({ ...generatedScenarios[index] });
    setIsEditScenarioModalOpen(true);
  };

  const handleSaveEditedScenario = (e) => {
    e.preventDefault();
    if (editingScenarioIndex === null || !editingScenarioData) return;
    
    const updated = [...generatedScenarios];
    updated[editingScenarioIndex] = editingScenarioData;
    setGeneratedScenarios(updated);
    setIsEditScenarioModalOpen(false);
    setEditingScenarioIndex(null);
    setEditingScenarioData(null);
  };

  // Scroll to results when scenarios are generated
  useEffect(() => {
    if (generatedScenarios.length > 0 && !isGenerating) {
      const resultsSection = document.getElementById('lab-results-applet');
      if (resultsSection) {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [generatedScenarios.length, isGenerating]);

  const isDark = localTheme === '#1a1a2e' || localTheme === '#020617';
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
      className="min-h-screen p-6 md:p-10 font-sans transition-all duration-700 ease-in-out bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ 
        backgroundColor: localTheme,
        backgroundImage: selectedProject?.backgroundUrl ? `url(${selectedProject.backgroundUrl})` : 'none'
      }}
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
                  className={`w-8 h-8 rounded-lg border transition-all ${localTheme === t.color ? 'ring-2 ring-primary scale-90' : 'opacity-60 hover:opacity-100'}`}
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
            <button 
              onClick={handleResetProject}
              className={`flex items-center gap-2 px-5 py-2.5 bg-red-600/10 text-red-500 border border-red-500/20 rounded-xl font-semibold hover:bg-red-600/20 transition-all shadow-sm`}
              title={`Master Reset: Delete all scenarios for ${selectedProject?.name || 'this project'}`}
            >
              <AlertCircle size={18} />
              Reset {selectedProject?.name ? `(${selectedProject.name})` : ''}
            </button>
            <label className={`flex items-center gap-2 px-5 py-2.5 ${isDark ? 'bg-white/10 text-white border-white/20' : 'bg-white text-slate-700 border-slate-200'} border rounded-xl font-semibold hover:opacity-80 transition-all shadow-sm cursor-pointer`}>
              <Plus size={18} />
              Background
              <input type="file" className="hidden" onChange={handleBackgroundUpload} accept="image/*" />
            </label>
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
            <div key={project.id} className="relative group flex items-center">
              <button
                onClick={() => setSelectedProjectId(project.id)}
                className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  selectedProjectId === project.id 
                  ? (isDark ? 'bg-primary text-white shadow-lg shadow-primary/40' : 'bg-white text-primary shadow-lg')
                  : (isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:bg-white/40')
                }`}
              >
                {project.name}
              </button>
              {selectedProjectId === project.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(project.id, project.name);
                  }}
                  className={`absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110 z-10`}
                  title="Close Project"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={handleCreateProject}
            className={`px-4 py-2.5 rounded-xl font-bold flex items-center justify-center transition-all ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:bg-slate-200'} border border-dashed border-slate-400/50`}
            title="Create New Project"
          >
            <Plus size={18} />
          </button>
        </div>
        {/* View Switcher */}
        <div className={`flex gap-6 mt-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <button 
            onClick={() => setCurrentView('dashboard')}
            className={`pb-4 px-2 text-sm font-bold transition-all relative ${
              currentView === 'dashboard' 
              ? (isDark ? 'text-primary' : 'text-primary') 
              : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')
            }`}
          >
            Dashboard
            {currentView === 'dashboard' && <div className="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full" />}
          </button>
          <button 
            onClick={() => setCurrentView('lab')}
            className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 ${
              currentView === 'lab' 
              ? (isDark ? 'text-primary' : 'text-primary') 
              : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')
            }`}
          >
            <Brain size={16} />
            Scenario Lab
            {currentView === 'lab' && <div className="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full" />}
          </button>
        </div>
      </header>
      {loading && !selectedProjectId ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {currentView === 'dashboard' ? (
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
                                  className={`text-[11px] font-bold px-4 py-2 rounded-xl border cursor-pointer transition-all ${isDark ? 'bg-slate-900 border-white/20 text-white hover:border-primary/50' : 'bg-white border-slate-200 text-slate-900 hover:border-primary/50'} focus:ring-2 focus:ring-primary/20 outline-none min-w-[120px] h-9`}
                                >
                                  <option value="">Assign Tester...</option>
                                  {testers.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                                <button 
                                  onClick={() => handleAssign(c.id)}
                                  className="h-9 w-9 flex items-center justify-center bg-primary text-white rounded-xl hover:bg-primary/80 transition-all shadow-lg shadow-primary/20"
                                >
                                  <Plus size={16} />
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
                    {allTestCases.filter(c => c.status === 'BLOCKED' || c.priority === 'CRITICAL' && c.status === 'FAIL').length > 0 ? (
                      allTestCases
                        .filter(c => c.status === 'BLOCKED' || (c.priority === 'CRITICAL' && c.status === 'FAIL'))
                        .slice(0, 5) // Show top 5
                        .map(blocker => (
                          <div key={blocker.id} className={`flex items-start gap-3 p-3 ${isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100'} rounded-2xl border animate-in fade-in slide-in-from-right-2 duration-300`}>
                            <div className={`p-1.5 ${isDark ? 'bg-red-500/20' : 'bg-red-100'} rounded-lg text-red-600`}>
                              <AlertCircle size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className={`text-sm font-bold ${isDark ? 'text-red-400' : 'text-red-900'} truncate`}>{blocker.summary}</p>
                              <p className={`text-[10px] ${isDark ? 'text-red-400/70' : 'text-red-600'} uppercase font-bold`}>
                                {blocker.status === 'BLOCKED' ? 'STATUS: BLOCKED' : `PRIORITY: ${blocker.priority}`}
                              </p>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className={`p-6 border-2 border-dashed ${isDark ? 'border-white/5' : 'border-slate-100'} rounded-2xl text-center`}>
                        <p className={`text-xs ${subTextColor} italic`}>No major blockers detected. System healthy.</p>
                      </div>
                    )}
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
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Configuration Sidebar */}
              <div className="lg:col-span-1 space-y-6">
                <div className={`${cardBg} p-6 rounded-3xl shadow-xl space-y-6`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Settings size={18} className="text-primary" />
                    <h3 className={`font-bold ${textColor}`}>Drafting Scope</h3>
                  </div>

                  {/* Release & Status */}
                  <div className="space-y-4">
                    <div>
                      <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor} mb-2 block`}>Release</label>
                      <input 
                        type="text" 
                        value={labConfig.release}
                        onChange={(e) => setLabConfig({...labConfig, release: e.target.value})}
                        placeholder="e.g. R24.4"
                        className={`w-full p-3 rounded-xl border text-sm ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                      />
                    </div>
                  </div>

                  {/* Channel Selection */}
                  <div className="space-y-3">
                    <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor} block`}>Channel</label>
                    <div className="flex flex-wrap gap-2">
                      {['Retail', 'Call Center'].map(channel => (
                        <button
                          key={channel}
                          onClick={() => {
                            const newChannels = labConfig.channels.includes(channel)
                              ? labConfig.channels.filter(c => c !== channel)
                              : [...labConfig.channels, channel];
                            setLabConfig({...labConfig, channels: newChannels});
                          }}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                            labConfig.channels.includes(channel)
                            ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105'
                            : (isDark ? 'bg-white/5 border-white/10 text-slate-400' : 'bg-white border-slate-200 text-slate-600')
                          }`}
                        >
                          {channel}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Account Type Selection */}
                  <div className="space-y-3">
                    <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor} block`}>Account Type</label>
                    <div className="flex flex-wrap gap-2">
                      {['HBB', 'Mobile'].map(type => (
                        <button
                          key={type}
                          onClick={() => {
                            const newTypes = labConfig.accountTypes.includes(type)
                              ? labConfig.accountTypes.filter(t => t !== type)
                              : [...labConfig.accountTypes, type];
                            setLabConfig({...labConfig, accountTypes: newTypes});
                          }}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                            labConfig.accountTypes.includes(type)
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-105'
                            : (isDark ? 'bg-white/5 border-white/10 text-slate-400' : 'bg-white border-slate-200 text-slate-600')
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Journey Type Selection */}
                  <div className="space-y-3">
                    <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor} block`}>Journey Type</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['New connection', 'Upgrade', 'Downgrade', ...extraJourneys].map(j => (
                        <button
                          key={j}
                          onClick={() => {
                            const newJourneys = labConfig.journeyTypes.includes(j)
                              ? labConfig.journeyTypes.filter(jt => jt !== j)
                              : [...labConfig.journeyTypes, j];
                            setLabConfig({...labConfig, journeyTypes: newJourneys});
                          }}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all flex items-center gap-2 ${
                            labConfig.journeyTypes.includes(j)
                            ? 'bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-600/20 scale-105'
                            : (isDark ? 'bg-white/5 border-white/10 text-slate-400' : 'bg-white border-slate-200 text-slate-600')
                          }`}
                        >
                          {j}
                          {extraJourneys.includes(j) && (
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                setExtraJourneys(prev => prev.filter(ej => ej !== j));
                                setLabConfig(prev => ({...prev, journeyTypes: prev.journeyTypes.filter(jt => jt !== j)}));
                              }}
                              className="hover:scale-125 transition-transform opacity-60 hover:opacity-100"
                            >
                              ✕
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    {/* Manual Journey Type */}
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={customJourneyType}
                        onChange={(e) => setCustomJourneyType(e.target.value)}
                        placeholder="Add custom..."
                        className={`flex-1 p-2 rounded-lg border text-[11px] ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                      />
                      <button 
                        onClick={() => {
                          const val = customJourneyType.trim();
                          if (!val || extraJourneys.includes(val) || ['New connection', 'Upgrade', 'Downgrade'].includes(val)) {
                            setCustomJourneyType('');
                            return;
                          }
                          setExtraJourneys(prev => [...prev, val]);
                          setLabConfig(prev => ({...prev, journeyTypes: [...prev.journeyTypes, val]}));
                          setCustomJourneyType('');
                        }}
                        className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Test Case Metadata */}
                  <div className="space-y-4 pt-4 border-t border-white/10">
                    <div>
                      <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor} mb-2 block`}>Priority</label>
                      <select 
                        value={labConfig.priority}
                        onChange={(e) => setLabConfig({...labConfig, priority: e.target.value})}
                        className={`w-full p-3 rounded-xl border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                      >
                        <option value="HIGH">HIGH</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="LOW">LOW</option>
                      </select>
                    </div>

                    {/* Matrix Preview */}
                    {(labConfig.channels.length > 1 || labConfig.accountTypes.length > 1 || labConfig.journeyTypes.length > 1) && (
                      <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl animate-in fade-in zoom-in duration-300">
                        <div className="flex items-center gap-2 mb-2">
                          <Activity size={14} className="text-primary" />
                          <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Combinatorial Matrix</span>
                        </div>
                        <p className={`text-[11px] leading-relaxed ${subTextColor}`}>
                          AI will draft scenarios for every combination:
                          <br />
                          <strong className="text-primary">
                            {Math.max(1, labConfig.channels.length)} Channels × {Math.max(1, labConfig.accountTypes.length)} Account Types × {Math.max(1, labConfig.journeyTypes.length)} Journeys
                            = {Math.max(1, labConfig.channels.length) * Math.max(1, labConfig.accountTypes.length) * Math.max(1, labConfig.journeyTypes.length)} Distinct Scope Blends
                          </strong>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Main Requirements Area */}
              <div className="lg:col-span-3 space-y-8">
                <div className={`${cardBg} p-8 rounded-3xl shadow-xl relative overflow-hidden h-full flex flex-col`}>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-4 bg-primary/10 rounded-2xl text-primary">
                      <Brain size={32} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className={`text-2xl font-black ${textColor}`}>AI Scenario Drafting Lab</h2>
                        {selectedProject && (
                          <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-bold rounded-full border border-primary/20">
                            Target: {selectedProject.name}
                          </span>
                        )}
                      </div>
                      <p className={subTextColor}>Describe your feature or paste requirements to generate structured test plans.</p>
                    </div>
                  </div>

                  <div className="space-y-4 flex-1 flex flex-col">
                    <textarea 
                      value={labRequirements}
                      onChange={(e) => setLabRequirements(e.target.value)}
                      placeholder="Enter feature description, user stories, or technical requirements here..."
                      className={`w-full flex-1 p-6 rounded-2xl border transition-all ${
                        isDark ? 'bg-white/5 border-white/10 text-white focus:border-primary/50' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-primary'
                      } resize-none outline-none text-sm font-medium leading-relaxed min-h-[300px]`}
                    />
                    
                    <div className="flex justify-between items-center">
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor}`}>
                        {labRequirements.length} characters entered
                      </p>
                    <div className="flex flex-col items-end gap-2">
                        {(!labRequirements.trim() || labConfig.channels.length === 0 || labConfig.accountTypes.length === 0 || labConfig.journeyTypes.length === 0) && (
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-amber-500/70' : 'text-amber-600/70'} animate-pulse`}>
                            {!labRequirements.trim() ? 'Draft your requirements first' : 'Select at least one option for Channel, Account, and Journey'}
                          </span>
                        )}
                        <button 
                          onClick={handleGenerateScenarios}
                          disabled={isGenerating || !labRequirements.trim() || labConfig.channels.length === 0 || labConfig.accountTypes.length === 0 || labConfig.journeyTypes.length === 0}
                          className={`relative overflow-hidden flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-2xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/30 disabled:opacity-50 disabled:grayscale disabled:hover:scale-100 ${!isGenerating && !isGenerating && labRequirements.trim() && labConfig.channels.length > 0 && labConfig.accountTypes.length > 0 && labConfig.journeyTypes.length > 0 && 'animate-ai-pulse'}`}
                        >
                          {isGenerating && <div className="absolute inset-0 shimmer-bg opacity-30" />}
                          {isGenerating ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Analyzing Requirements...
                            </>
                          ) : (
                            <>
                              <Sparkles size={18} className="animate-pulse" />
                              Generate Test Plan
                            </>
                          )}
                        </button>
                    </div>
                    </div>
                  </div>

                  {/* Background Decoration */}
                  <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                    <Brain size={300} />
                  </div>
                </div>
              </div>
            </div>

            {(isGenerating || agentLogs.length > 0) && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isGenerating ? 'bg-primary/20 animate-pulse' : 'bg-slate-800'}`}>
                      <Terminal size={18} className="text-primary" />
                    </div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-widest">Agent Live Status</h4>
                  </div>
                  {isGenerating && (
                    <div className="flex gap-1">
                      <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                      <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                    </div>
                  )}
                </div>
                
                <div className="space-y-2 font-mono">
                  {agentLogs.slice(-4).map((log, i) => (
                    <div key={i} className={`text-xs flex gap-3 transition-opacity duration-300 ${i === agentLogs.slice(-4).length - 1 ? 'text-white' : 'text-slate-500'}`}>
                      <span className="text-primary opacity-50 select-none">[{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                      <span className="flex-1">{log}</span>
                    </div>
                  ))}
                </div>

                {isGenerating && (
                  <div className="absolute bottom-0 left-0 w-full h-1 bg-primary/10 overflow-hidden">
                    <div className="h-full bg-primary animate-progress-indefinite w-1/3" />
                  </div>
                )}
              </div>
            )}

            {generatedScenarios.length > 0 && (
              <div id="lab-results-applet" className="space-y-8 pt-12 border-t border-white/5 animate-in fade-in slide-in-from-bottom-12 duration-1000">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                        <CheckCircle2 size={24} />
                      </div>
                      <h3 className={`text-2xl font-black ${textColor}`}>Drafting Results</h3>
                    </div>
                    <p className={subTextColor}>We've prepared {generatedScenarios.length} scenarios covering your selected scope matrix.</p>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <button 
                      onClick={clearDrafts}
                      className={`flex items-center gap-2 px-6 py-3 border rounded-2xl font-bold transition-all hover:scale-105 ${isDark ? 'border-rose-500/30 text-rose-500 hover:bg-rose-500/10' : 'border-rose-200 text-rose-600 hover:bg-rose-50 shadow-sm'}`}
                    >
                      <Trash2 size={18} />
                      Discard All Journeys
                    </button>
                    <button 
                      onClick={handleExportLabExcel}
                      className={`flex items-center gap-2 px-6 py-3 ${isDark ? 'bg-white/10 text-white border-white/20' : 'bg-white text-slate-700 border-slate-200'} border rounded-2xl font-bold hover:scale-105 transition-all shadow-lg`}
                    >
                      <Upload size={18} className="rotate-180" />
                      Export to Excel
                    </button>
                    <button 
                      onClick={handleCommitScenarios}
                      className="flex items-center gap-2 px-7 py-3 bg-emerald-600 text-white rounded-2xl font-extrabold hover:bg-emerald-500 hover:scale-105 transition-all shadow-xl shadow-emerald-600/30"
                    >
                      <CheckCircle2 size={18} />
                      Commit to Project
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                  {generatedScenarios.map((s, i) => {
                    const isRetail = s.summary?.toLowerCase().includes('retail') || s.module?.toLowerCase().includes('retail');
                    const isCallCenter = s.summary?.toLowerCase().includes('call center') || s.module?.toLowerCase().includes('call center');
                    const isHBB = s.summary?.toLowerCase().includes('hbb') || s.module?.toLowerCase().includes('hbb');
                    const isMobile = s.summary?.toLowerCase().includes('mobile') || s.module?.toLowerCase().includes('mobile');

                    return (
                      <div key={i} className={`group relative ${cardBg} p-8 rounded-[2rem] shadow-xl hover:shadow-2xl transition-all border overflow-hidden animate-in fade-in zoom-in duration-500`} style={{ animationDelay: `${i * 100}ms` }}>
                         <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.08] transition-all rotate-12 group-hover:rotate-0">
                           {isHBB ? <Home size={120} /> : isMobile ? <Smartphone size={120} /> : <Layers size={120} />}
                         </div>

                         <div className="relative z-10 flex flex-col h-full">
                            <div className="flex justify-between items-start mb-6">
                              <div className="flex gap-2">
                                {isRetail && <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg" title="Retail"><ShoppingBag size={14} /></div>}
                                {isCallCenter && <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg" title="Call Center"><Headphones size={14} /></div>}
                                {isHBB && <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg" title="HBB"><Home size={14} /></div>}
                                {isMobile && <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg" title="Mobile"><Smartphone size={14} /></div>}
                              </div>
                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                <button 
                                  onClick={() => openEditScenario(i)}
                                  className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                  title="Refine Scenario"
                                >
                                  <Settings size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDiscardScenario(i)}
                                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                  title="Discard Journey"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>

                            <div className="mb-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-2 inline-block ${
                                s.priority === 'HIGH' ? 'bg-rose-500/20 text-rose-500' : 
                                s.priority === 'MEDIUM' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'
                              }`}>
                                {s.priority}
                              </span>
                              <h4 className={`text-lg font-bold leading-tight ${textColor} mb-2`}>{s.summary}</h4>
                              <p className={`text-xs font-semibold ${isDark ? 'text-primary/70' : 'text-primary'}`}>{s.module}</p>
                            </div>

                            <div className="flex-1 space-y-4 mb-6">
                              <div>
                                <h5 className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor} mb-2 flex items-center gap-2`}>
                                  <Activity size={12} /> Test Steps
                                </h5>
                                <div className={`text-xs leading-relaxed space-y-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                  {s.steps?.split('\n').map((step, idx) => (
                                    <div key={idx} className="flex gap-2">
                                      <span className="text-primary font-bold opacity-50">{idx + 1}.</span>
                                      <span className="flex-1">{step.replace(/^\d+\.\s*/, '')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <h5 className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor} mb-2 flex items-center gap-2`}>
                                  <CheckCircle2 size={12} /> Expected Result
                                </h5>
                                <p className={`text-xs leading-relaxed ${isDark ? 'text-emerald-400/80' : 'text-emerald-600'}`}>{s.expectedResult}</p>
                              </div>

                              {/* New Validation Highlights Section */}
                              <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/5' : 'border-slate-100'} space-y-3`}>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className={`p-2.5 rounded-xl ${isDark ? 'bg-primary/5' : 'bg-slate-50'} border ${isDark ? 'border-primary/10' : 'border-slate-100'}`}>
                                    <span className={`text-[9px] font-black uppercase tracking-tighter ${subTextColor} block mb-1`}>Order Build</span>
                                    <p className={`text-[10px] leading-tight font-bold ${textColor} truncate`}>{s.orderBuild || 'N/A'}</p>
                                  </div>
                                  <div className={`p-2.5 rounded-xl ${isDark ? 'bg-emerald-500/5' : 'bg-emerald-50'} border ${isDark ? 'border-emerald-500/10' : 'border-emerald-100'}`}>
                                    <span className={`text-[9px] font-black uppercase tracking-tighter text-emerald-500/70 block mb-1`}>Status Sync</span>
                                    <p className={`text-[10px] leading-tight font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'} truncate`}>{s.orderCompletion || 'N/A'}</p>
                                  </div>
                                  <div className={`p-2.5 rounded-xl ${isDark ? 'bg-indigo-500/5' : 'bg-indigo-50'} border ${isDark ? 'border-indigo-500/10' : 'border-indigo-100'}`}>
                                    <span className={`text-[9px] font-black uppercase tracking-tighter text-indigo-500/70 block mb-1`}>T&C / Comms</span>
                                    <p className={`text-[10px] leading-tight font-bold ${isDark ? 'text-indigo-400' : 'text-indigo-700'} truncate`}>{s.tcAssurance || 'N/A'}</p>
                                  </div>
                                  <div className={`p-2.5 rounded-xl ${isDark ? 'bg-amber-500/5' : 'bg-amber-50'} border ${isDark ? 'border-amber-500/10' : 'border-amber-100'}`}>
                                    <span className={`text-[9px] font-black uppercase tracking-tighter text-amber-500/70 block mb-1`}>Billing</span>
                                    <p className={`text-[10px] leading-tight font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'} truncate`}>{s.billing || 'N/A'}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                         </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
          )}

      
      {/* New Project Modal */}
      {isCreateProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'} border rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200`}>
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h3 className={`text-lg font-bold ${textColor}`}>New Project</h3>
              <button onClick={() => setIsCreateProjectModalOpen(false)} className={subTextColor}>×</button>
            </div>
            <form onSubmit={submitCreateProject} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor}`}>Project Name</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="e.g. Q2 Quality Assurance"
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} text-sm focus:border-primary outline-none transition-all`}
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  required
                />
              </div>
              <button 
                type="submit" 
                className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/80 transition-all shadow-lg shadow-primary/20"
              >
                Create Project
              </button>
            </form>
          </div>
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
                {/* Project Name - always shown so user can set/override it */}
                <div className="space-y-1.5 pb-2 border-b border-slate-700">
                  <label className="text-xs font-medium text-indigo-400 flex items-center gap-2">
                    <Brain className="w-4 h-4" /> Project Name
                  </label>
                  <input
                    type="text"
                    required
                    value={manualProjectName}
                    onChange={(e) => setManualProjectName(e.target.value)}
                    placeholder="e.g. My Test Project"
                    className="w-full bg-slate-800 border border-indigo-500/50 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-500"
                  />
                  <p className="text-[10px] text-slate-500">A new project tab will be created with this name.</p>
                </div>
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

      {/* Edit Scenario Modal */}
      {isEditScenarioModalOpen && editingScenarioData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'} border rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200`}>
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h3 className={`text-xl font-black ${textColor}`}>Refine Test Journey</h3>
              <button onClick={() => setIsEditScenarioModalOpen(false)} className={subTextColor}>×</button>
            </div>
            <form onSubmit={handleSaveEditedScenario} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor}`}>Scenario Summary</label>
                  <input 
                    type="text" 
                    className={`w-full p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} text-sm`}
                    value={editingScenarioData.summary}
                    onChange={(e) => setEditingScenarioData({...editingScenarioData, summary: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor}`}>Module / Release</label>
                  <input 
                    type="text" 
                    className={`w-full p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} text-sm`}
                    value={editingScenarioData.module}
                    onChange={(e) => setEditingScenarioData({...editingScenarioData, module: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor}`}>Priority</label>
                  <select 
                    className={`w-full p-3 rounded-xl border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'} text-sm`}
                    value={editingScenarioData.priority}
                    onChange={(e) => setEditingScenarioData({...editingScenarioData, priority: e.target.value})}
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor}`}>Test Steps</label>
                <textarea 
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} text-sm h-32 resize-none`}
                  value={editingScenarioData.steps}
                  onChange={(e) => setEditingScenarioData({...editingScenarioData, steps: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor}`}>Expected Result</label>
                <textarea 
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} text-sm h-20 resize-none`}
                  value={editingScenarioData.expectedResult}
                  onChange={(e) => setEditingScenarioData({...editingScenarioData, expectedResult: e.target.value})}
                  required
                />
              </div>
              <div className="pt-4 flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setIsEditScenarioModalOpen(false)}
                  className={`flex-1 py-3 border rounded-xl font-bold ${isDark ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-600'} hover:bg-slate-50 transition-all`}
                >
                  Discard Changes
                </button>
                <button type="submit" className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/80 transition-all shadow-lg shadow-primary/20">
                  Update Journey
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>

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
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 gap-4">
                {allTestCases.length > 0 ? (
                  allTestCases.map(tc => {
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
                          <p className="text-[10px] text-slate-500 truncate uppercase tracking-widest mb-4">
                            Priority: {tc.priority}
                          </p>

                          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                            {[
                              { field: 'checkUi', label: 'UI Valid' },
                              { field: 'checkOrderBuild', label: 'Order Build' },
                              { field: 'checkOrderCompletion', label: 'Completion' },
                              { field: 'checkPcsMcpr', label: 'PCS & MCPR' }
                            ].map(val => (
                              <button
                                key={val.field}
                                onClick={() => updateCaseValidation(tc.id, val.field, !tc[val.field])}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all text-left ${
                                  tc[val.field] 
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                                  : 'bg-slate-800/50 border-slate-700/50 text-slate-500 hover:border-slate-600'
                                }`}
                              >
                                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                                  tc[val.field] ? 'bg-emerald-500 border-emerald-500' : 'bg-transparent border-slate-600'
                                }`}>
                                  {tc[val.field] && <CheckCircle2 size={10} className="text-white" />}
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-tighter">{val.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
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
                  })
                ) : (
                  <div className="p-20 text-center text-slate-500 italic">No scenarios found for this project.</div>
                )}
              </div>
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
                className="px-8 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20"
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

const MetricCard = ({ label, value, icon, change, trend = 'up', isDark, status }) => (
  <div className={`${isDark ? 'bg-slate-800/50 border-white/10' : 'bg-white border-slate-200'} p-6 rounded-3xl border shadow-lg transition-all hover:scale-[1.02]`}>
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
        {icon}
      </div>
      {change && (
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${trend === 'up' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
          {change}
        </span>
      )}
      {status && (
        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-primary/10 text-primary uppercase tracking-widest">
          {status}
        </span>
      )}
    </div>
    <p className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'} mb-1`}>{label}</p>
    <h4 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</h4>
  </div>
);

export default App;

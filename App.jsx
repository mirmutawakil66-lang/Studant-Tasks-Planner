import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  CheckCircle, 
  Circle, 
  AlertCircle, 
  ArrowUp, 
  ArrowDown, 
  AlignLeft,
  MoreHorizontal,
  X,
  Sparkles,
  Loader2,
  Calendar as CalendarIcon,
  Clock,
  Bell,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp,
  query,
  orderBy 
} from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Gemini Helper ---
const callGemini = async (prompt, systemPrompt = "") => {
  const apiKey = ""; // Injected by environment
  const fullSystemPrompt = "You are a helpful task management assistant. " + systemPrompt;
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: fullSystemPrompt }] },
          generationConfig: { 
            responseMimeType: "application/json" 
          }
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) return null;
    
    return JSON.parse(textResponse);
  } catch (error) {
    console.error("Gemini API Failed:", error);
    return null;
  }
};

// --- Helpers ---
const formatDate = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: 'numeric' 
  }).format(date);
};

const isOverdue = (isoString) => {
  if (!isoString) return false;
  return new Date(isoString) < new Date();
};

const isDueToday = (isoString) => {
  if (!isoString) return false;
  const date = new Date(isoString);
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
};

// --- Components ---

const PriorityBadge = ({ priority, onClick }) => {
  const styles = {
    high: "bg-red-100 text-red-700 border-red-200 hover:bg-red-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200",
    low: "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200"
  };

  const labels = { high: "High", medium: "Medium", low: "Low" };

  return (
    <button 
      onClick={onClick}
      className={`text-xs font-semibold px-2 py-1 rounded-full border transition-colors ${styles[priority]}`}
    >
      {labels[priority]}
    </button>
  );
};

const TaskItem = ({ task, onUpdate, onDelete, onBreakdown }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [isBreakingDown, setIsBreakingDown] = useState(false);

  const toggleStatus = () => {
    onUpdate(task.id, { completed: !task.completed });
  };

  const cyclePriority = () => {
    const priorities = ['low', 'medium', 'high'];
    const currentIndex = priorities.indexOf(task.priority || 'medium');
    const nextPriority = priorities[(currentIndex + 1) % priorities.length];
    onUpdate(task.id, { priority: nextPriority });
  };

  const handleSaveEdit = () => {
    if (editText.trim()) {
      onUpdate(task.id, { text: editText.trim() });
    }
    setIsEditing(false);
  };

  const handleBreakdown = async () => {
    setIsBreakingDown(true);
    await onBreakdown(task);
    setIsBreakingDown(false);
  };

  const overdue = !task.completed && isOverdue(task.dueDate);
  const today = !task.completed && isDueToday(task.dueDate);

  return (
    <div className={`group flex items-start gap-3 p-3 bg-white border rounded-xl shadow-sm hover:shadow-md transition-all ${task.completed ? 'opacity-60 border-slate-100' : overdue ? 'border-red-200 bg-red-50/30' : 'border-slate-100'}`}>
      <button 
        onClick={toggleStatus}
        className={`flex-shrink-0 mt-0.5 transition-colors ${task.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-400'}`}
      >
        {task.completed ? <CheckCircle size={22} className="fill-current" /> : <Circle size={22} />}
      </button>

      <div className="flex-grow min-w-0">
        <div className="flex flex-wrap gap-2 mb-1">
          {overdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
              <AlertCircle size={10} /> Overdue
            </span>
          )}
          {today && (
             <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
              <Bell size={10} /> Due Today
            </span>
          )}
          {task.dueDate && !overdue && !today && (
             <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              <CalendarIcon size={10} /> {formatDate(task.dueDate)}
            </span>
          )}
        </div>

        {isEditing ? (
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full text-slate-700 border-b border-blue-500 focus:outline-none bg-transparent py-1"
              autoFocus
              onBlur={handleSaveEdit}
            />
          </form>
        ) : (
          <p 
            onClick={() => setIsEditing(true)}
            className={`text-slate-700 truncate cursor-text ${task.completed ? 'line-through text-slate-400' : ''}`}
          >
            {task.text}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity self-start">
        <button
          onClick={handleBreakdown}
          disabled={isBreakingDown || task.completed}
          title="Magic Breakdown"
          className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30"
        >
          {isBreakingDown ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        </button>

        <PriorityBadge priority={task.priority || 'medium'} onClick={cyclePriority} />
        
        <button 
          onClick={() => onDelete(task.id)}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

const CalendarWidget = ({ tasks, onSelectDate, selectedDate }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const getDayContent = (day) => {
    const dateStr = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString();
    const dayTasks = tasks.filter(t => {
      if (!t.dueDate) return false;
      return new Date(t.dueDate).toDateString() === dateStr;
    });
    return dayTasks;
  };

  const isSelected = (day) => {
    if (!selectedDate) return false;
    return selectedDate.getDate() === day && 
           selectedDate.getMonth() === currentMonth.getMonth() &&
           selectedDate.getFullYear() === currentMonth.getFullYear();
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-700">
          {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded-lg"><ChevronLeft size={20} /></button>
          <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded-lg"><ChevronRight size={20} /></button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
          <div key={d} className="text-xs font-bold text-slate-400">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-10"></div>
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayTasks = getDayContent(day);
          const hasHigh = dayTasks.some(t => t.priority === 'high');
          const hasTasks = dayTasks.length > 0;
          
          return (
            <button
              key={day}
              onClick={() => {
                const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                onSelectDate(selectedDate && selectedDate.toDateString() === newDate.toDateString() ? null : newDate);
              }}
              className={`h-10 rounded-lg flex flex-col items-center justify-center relative transition-colors
                ${isSelected(day) ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-700'}
              `}
            >
              <span className="text-sm font-medium">{day}</span>
              <div className="flex gap-0.5 mt-0.5">
                 {hasTasks && (
                   <div className={`w-1 h-1 rounded-full ${isSelected(day) ? 'bg-indigo-300' : hasHigh ? 'bg-red-400' : 'bg-slate-400'}`}></div>
                 )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const BrainDump = ({ onSubmit, onSmartSubmit, onClose }) => {
  const [text, setText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmit(text);
    setText("");
    onClose();
  };

  const handleSmartSubmit = async () => {
    if (!text.trim()) return;
    setIsAnalyzing(true);
    await onSmartSubmit(text);
    setIsAnalyzing(false);
    setText("");
    onClose();
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-100 mb-8 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-500" />
            Brain Dump Mode
          </h3>
          <p className="text-sm text-indigo-600 mt-1">
            Paste your messy list. Use "Smart Sort" to auto-detect priorities and due dates (e.g., "Essay due Friday").
          </p>
        </div>
        <button onClick={onClose} className="text-indigo-400 hover:text-indigo-700">
          <X size={20} />
        </button>
      </div>
      
      <form onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="- Math homework due tomorrow&#10;- Buy milk (URGENT)&#10;- Study for History on Friday at 4pm..."
          className="w-full h-32 p-4 rounded-xl border border-indigo-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all resize-none text-slate-700 bg-white placeholder:text-slate-400"
        />
        <div className="flex justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={handleSmartSubmit}
            disabled={!text.trim() || isAnalyzing}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Smart Sort & Date Detect
          </button>
          <button 
            type="submit"
            disabled={!text.trim() || isAnalyzing}
            className="bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Simple Process
          </button>
        </div>
      </form>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBrainDump, setShowBrainDump] = useState(false);
  const [quickInput, setQuickInput] = useState("");
  const [quickDate, setQuickDate] = useState("");
  const [view, setView] = useState("all");
  const [time, setTime] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Auth Setup
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching
  useEffect(() => {
    if (!user) return;

    const collectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'tasks');
    const q = query(collectionRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(loadedTasks);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching tasks:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Operations
  const addTask = async (text, priority = 'medium', dueDate = null) => {
    if (!user || !text.trim()) return;
    
    const collectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'tasks');
    await addDoc(collectionRef, {
      text: text.trim(),
      completed: false,
      priority,
      dueDate: dueDate || null,
      createdAt: serverTimestamp()
    });
  };

  const handleBrainDump = async (rawText) => {
    const lines = rawText.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        const cleanText = line.replace(/^[-*•]\s*/, '');
        await addTask(cleanText);
      }
    }
  };

  const handleSmartBrainDump = async (rawText) => {
    const now = new Date().toISOString();
    const systemPrompt = `Current Date/Time: ${now}. Extract tasks. Identify priority (high/medium/low). Identify due dates/times and convert to ISO format string. Return JSON: [{ "text": string, "priority": string, "dueDate": string | null }]`;
    const prompt = `Analyze and extract tasks from: \n"${rawText}"`;
    
    const result = await callGemini(prompt, systemPrompt);
    
    if (result && Array.isArray(result)) {
      for (const item of result.reverse()) {
        await addTask(item.text, item.priority, item.dueDate);
      }
    } else {
      handleBrainDump(rawText);
    }
  };

  const handleTaskBreakdown = async (task) => {
    const systemPrompt = "Break down the given task into 3-5 smaller, actionable subtasks. Return JSON: [\"subtask 1\", \"subtask 2\"]";
    const prompt = `Break down this task: "${task.text}"`;
    
    const subtasks = await callGemini(prompt, systemPrompt);
    
    if (subtasks && Array.isArray(subtasks)) {
      for (const subText of subtasks.reverse()) {
        await addTask(`↳ ${subText}`, task.priority, task.dueDate);
      }
    }
  };

  const updateTask = async (id, data) => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', id);
    await updateDoc(docRef, data);
  };

  const deleteTask = async (id) => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', id);
    await deleteDoc(docRef);
  };

  // 4. Organization Logic
  const organizedTasks = useMemo(() => {
    let filtered = tasks;
    
    // View Filters
    if (view === 'active') filtered = tasks.filter(t => !t.completed);
    if (view === 'completed') filtered = tasks.filter(t => t.completed);
    if (view === 'calendar' && selectedCalendarDate) {
      filtered = tasks.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate).toDateString() === selectedCalendarDate.toDateString();
      });
    }

    const high = filtered.filter(t => t.priority === 'high' && !t.completed);
    const medium = filtered.filter(t => t.priority === 'medium' && !t.completed);
    const low = filtered.filter(t => t.priority === 'low' && !t.completed);
    const done = filtered.filter(t => t.completed);

    return { high, medium, low, done };
  }, [tasks, view, selectedCalendarDate]);

  const stats = {
    total: tasks.length,
    done: tasks.filter(t => t.completed).length,
  };

  const progress = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        
        {/* Header Section with Clock */}
        <header className="mb-10">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-1">
                Student<span className="text-indigo-600">Planner</span>
              </h1>
              <p className="text-slate-500 font-medium">
                Manage your tasks and time efficiently.
              </p>
            </div>
            
            <div className="flex flex-col items-end">
              <div className="text-3xl font-mono font-bold text-slate-800 tracking-wider">
                {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-sm font-medium text-slate-500">
                {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="bg-white px-4 py-3 rounded-xl shadow-sm border border-slate-100 flex items-center gap-3 w-full sm:w-auto">
            <div className="h-2 flex-grow sm:w-48 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm font-bold text-slate-700 whitespace-nowrap">{progress}% Done</span>
          </div>
        </header>

        {/* Input Area */}
        {!showBrainDump && view !== 'calendar' && (
          <div className="mb-8 relative z-10">
            <form 
              onSubmit={(e) => { 
                e.preventDefault(); 
                addTask(quickInput, 'medium', quickDate || null); 
                setQuickInput(""); 
                setQuickDate("");
              }}
              className="relative shadow-lg rounded-2xl bg-white flex flex-col sm:flex-row overflow-hidden border border-slate-100"
            >
              <input 
                type="text" 
                placeholder="What needs to be done?" 
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                className="flex-grow p-4 text-lg border-0 focus:ring-0 text-slate-700 placeholder:text-slate-400 focus:bg-slate-50 transition-colors"
              />
              
              <div className="flex items-center gap-2 p-2 bg-slate-50 border-t sm:border-t-0 sm:border-l border-slate-100">
                <input 
                  type="datetime-local" 
                  value={quickDate}
                  onChange={(e) => setQuickDate(e.target.value)}
                  className="p-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:border-indigo-300 w-full sm:w-auto"
                />
                
                <button 
                  type="button"
                  onClick={() => setShowBrainDump(true)}
                  className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors flex-shrink-0"
                  title="Brain Dump / Import"
                >
                  <Sparkles size={20} />
                </button>
                <button 
                  type="submit" 
                  disabled={!quickInput.trim()}
                  className="bg-slate-900 hover:bg-slate-800 text-white p-2 px-3 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <Plus size={20} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Brain Dump Component */}
        {showBrainDump && (
          <BrainDump 
            onSubmit={handleBrainDump} 
            onSmartSubmit={handleSmartBrainDump}
            onClose={() => setShowBrainDump(false)} 
          />
        )}

        {/* Navigation / Filters */}
        <div className="flex items-center justify-between mb-6 overflow-x-auto pb-2">
          <div className="flex gap-2">
            {['all', 'active', 'completed', 'calendar'].map((f) => (
              <button
                key={f}
                onClick={() => setView(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize whitespace-nowrap flex items-center gap-1.5 ${
                  view === f 
                    ? 'bg-slate-900 text-white shadow-md' 
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {f === 'calendar' && <CalendarIcon size={14} />}
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar View */}
        {view === 'calendar' && (
          <div>
            <CalendarWidget 
              tasks={tasks} 
              onSelectDate={setSelectedCalendarDate} 
              selectedDate={selectedCalendarDate} 
            />
            {selectedCalendarDate && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                  Tasks for {selectedCalendarDate.toLocaleDateString()}
                </span>
                <button 
                  onClick={() => setSelectedCalendarDate(null)} 
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Clear Date Filter
                </button>
              </div>
            )}
          </div>
        )}

        {/* Task Lists Grouped by Priority */}
        <div className="space-y-6">
          
          {/* Empty State */}
          {tasks.length === 0 && !showBrainDump && view !== 'calendar' && (
            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlignLeft size={32} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">It's quiet here</h3>
              <p className="text-slate-500 max-w-xs mx-auto mb-6">
                Type a task above or use the Sparkle icon for AI Brain Dump.
              </p>
            </div>
          )}

          {/* Empty Calendar State */}
          {view === 'calendar' && selectedCalendarDate && organizedTasks.high.length === 0 && organizedTasks.medium.length === 0 && organizedTasks.low.length === 0 && organizedTasks.done.length === 0 && (
             <div className="text-center py-12 text-slate-400">
               <p>No tasks for this date.</p>
             </div>
          )}

          {/* High Priority */}
          {organizedTasks.high.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2 px-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                High Priority
              </h2>
              <div className="space-y-2">
                {organizedTasks.high.map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onUpdate={updateTask} 
                    onDelete={deleteTask}
                    onBreakdown={handleTaskBreakdown}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Medium Priority */}
          {organizedTasks.medium.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2 px-1">
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                Medium Priority
              </h2>
              <div className="space-y-2">
                {organizedTasks.medium.map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onUpdate={updateTask} 
                    onDelete={deleteTask}
                    onBreakdown={handleTaskBreakdown}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Low Priority */}
          {organizedTasks.low.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2 px-1">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                Low Priority
              </h2>
              <div className="space-y-2">
                {organizedTasks.low.map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onUpdate={updateTask} 
                    onDelete={deleteTask}
                    onBreakdown={handleTaskBreakdown}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Completed */}
          {organizedTasks.done.length > 0 && (view === 'all' || view === 'completed' || view === 'calendar') && (
            <section className="pt-6 border-t border-slate-100 mt-6">
               <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2 px-1">
                <CheckCircle size={14} />
                Completed
              </h2>
              <div className="space-y-2">
                {organizedTasks.done.map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onUpdate={updateTask} 
                    onDelete={deleteTask}
                    onBreakdown={handleTaskBreakdown}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
        
      </div>
    </div>
  );
}

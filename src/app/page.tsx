"use client";

import { useState, useEffect, useRef } from "react";
import { loginWithGoogle, logout } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { getTodayEvents } from "@/lib/calendar";
import { getUserTasks, addTask, updateTaskStatus, deleteTask, Task } from "@/lib/tasks";
import { Mic, Flame, CalendarClock, Users, Archive, CheckCircle2, MessageSquare, Edit2, Trash2, CalendarDays, Volume2, VolumeX, Loader2 } from "lucide-react";

let globalAudioCtx: any = null;
let hasWelcomed = false;
let hasUnlockedAudio = false;

const initAudioContext = () => {
  if (typeof window !== 'undefined') {
    if (!globalAudioCtx) {
      globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume();
    }
    // Jouer un son silencieux pour forcer le déverrouillage sur iOS Safari
    try {
      const buffer = globalAudioCtx.createBuffer(1, 1, 22050);
      const source = globalAudioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(globalAudioCtx.destination);
      source.start(0);
    } catch(e) {}

    // Déverrouillage de la balise HTMLAudioElement globale
    const audioEl = document.getElementById('voice-player') as HTMLAudioElement;
    if (audioEl) {
       // Si on presse le micro, on coupe la parole de l'IA immédiatement
       if (!audioEl.paused) {
           audioEl.pause();
           audioEl.currentTime = 0;
       }
       if (!hasUnlockedAudio) {
           audioEl.play().catch(()=>{});
           hasUnlockedAudio = true;
       }
    }
  }
};

const playBeep = () => {
  if (!globalAudioCtx) return;
  try {
    const oscillator = globalAudioCtx.createOscillator();
    const gainNode = globalAudioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, globalAudioCtx.currentTime); // Note A5
    
    gainNode.gain.setValueAtTime(0.1, globalAudioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, globalAudioCtx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(globalAudioCtx.destination);
    
    oscillator.start();
    oscillator.stop(globalAudioCtx.currentTime + 0.1);
  } catch(e) {
    console.error("Erreur beep", e);
  }
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Nouvel état pour l'ajout manuel
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskUrgent, setNewTaskUrgent] = useState(false);
  const [newTaskImportant, setNewTaskImportant] = useState(false);

  // États pour la voix et l'IA
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>("");
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  // États pour les accordéons
  const [openSections, setOpenSections] = useState({
    urgentImportant: true,
    important: true,
    urgent: false,
    backlog: false,
    done: false
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchEvents();
        loadTasks(currentUser.uid);
      } else {
        setEvents([]);
        setTasks([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const todayEvents = await getTodayEvents();
      setEvents(todayEvents);
    } catch (error: any) {
      console.warn(error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cet événement de votre agenda Google ?")) return;
    try {
      const { deleteEventFromCalendar } = await import("@/lib/calendar");
      await deleteEventFromCalendar(eventId);
      fetchEvents(); // Recharger les événements
    } catch (error) {
      console.error(error);
      alert("Erreur lors de la suppression de l'événement.");
    }
  };

  const loadTasks = async (uid: string) => {
    setLoadingTasks(true);
    try {
      const userTasks = await getUserTasks(uid);
      setTasks(userTasks);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleLogin = async () => {
    await loginWithGoogle();
    fetchEvents();
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTaskTitle.trim()) return;
    try {
      await addTask({
        title: newTaskTitle.trim(),
        status: 'todo',
        priority: 'normal',
        isUrgent: newTaskUrgent,
        isImportant: newTaskImportant,
        category: 'perso',
        userId: user.uid
      });
      setNewTaskTitle("");
      setNewTaskUrgent(false);
      setNewTaskImportant(false);
      loadTasks(user.uid);
    } catch (error) {
      console.error(error);
      alert("Erreur lors de l'ajout.");
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    if (!task.id) return;
    try {
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      await updateTaskStatus(task.id, newStatus);
      setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
      
      if (newStatus === 'done') {
        const confetti = (await import("canvas-confetti")).default;
        confetti({
          particleCount: 150,
          spread: 90,
          origin: { y: 0.6 },
          colors: ['#2563EB', '#10B981', '#8B5CF6', '#F59E0B'],
          zIndex: 99999
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const toggleCategory = async (task: Task) => {
    if (!task.id) return;
    const newCat = task.category === 'pro' ? 'perso' : 'pro';
    try {
      const { updateTaskDetails } = await import("@/lib/tasks");
      await updateTaskDetails(task.id, { category: newCat });
      setTasks(tasks.map(t => t.id === task.id ? { ...t, category: newCat } : t));
    } catch(e) {
      console.error(e);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const audioChunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await handleAudioUpload(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error("Erreur d'accès au micro:", error);
      alert("Impossible d'accéder au microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handlePointerDown = async (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    // Si on est déjà en train de traiter ou enregistrer, on ne fait rien de plus
    if (isProcessing || isRecording) return;
    
    initAudioContext(); // Déverrouillage indispensable pour iOS Safari
    playBeep(); // Feedback sonore immédiat
    
    if (!hasWelcomed) {
      hasWelcomed = true;
      setIsProcessing(true);
      setProcessingStep("Accueil vocal...");
      await playAudioResponse("Bonjour Pascal, comment puis-je t'aider ?");
      setIsProcessing(false);
      setProcessingStep("");
    }
    startRecording();
  };

  const handlePointerUp = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    if (isRecording) {
      stopRecording();
    }
  };

  // Lecture de la réponse vocale standardisée avec attente de la fin
  const playAudioResponse = async (text: string): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        const res = await fetch("/api/tts", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({text}) 
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audioEl = document.getElementById('voice-player') as HTMLAudioElement;
        
        if (audioEl) {
          audioEl.src = url;
          audioEl.play().catch(e => {
              console.error("Erreur de lecture audio :", e);
              resolve();
          });
          audioEl.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
        } else {
          const audio = new Audio(url);
          audio.play().catch(e => {
              console.error("Erreur de lecture audio :", e);
              resolve();
          });
          audio.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
        }
      } catch (e) {
        console.error("Erreur de lecture TTS :", e);
        resolve();
      }
    });
  };



  const handleAudioUpload = async (audioBlob: Blob) => {
    setIsProcessing(true);
    
    try {
      // 1. Transcription avec Whisper
      setProcessingStep("Transcription vocale...");
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");

      const transcribeRes = await fetch("/api/transcribe", { method: "POST", body: formData });
      const transcribeData = await transcribeRes.json();
      
      if (!transcribeData.text) {
        throw new Error("Erreur de transcription");
      }

      // 2. Analyse avec GPT-4o-mini
      setProcessingStep("Analyse intelligente...");
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcribeData.text, tasks })
      });
      const analyzeData = await analyzeRes.json();

      // Gestion de la réponse de type "dialogue"
      if (analyzeData.intent === "query_tasks") {
        if (isVoiceEnabled && analyzeData.responseMessage) {
           playAudioResponse(analyzeData.responseMessage);
        }
        return; // Pas de création de tâche
      }

      if (!analyzeData.title) {
        throw new Error("L'IA n'a pas pu extraire la tâche");
      }

      // 3. Sauvegarde dans Firebase
      if (user) {
        setProcessingStep("Sauvegarde...");
        
        const newTaskData: Omit<Task, 'id' | 'createdAt'> = {
          title: analyzeData.title,
          isUrgent: analyzeData.isUrgent || false,
          isImportant: analyzeData.isImportant || false,
          status: 'todo',
          priority: 'normal',
          category: analyzeData.category || 'perso',
          userId: user.uid
        };
        
        if (analyzeData.dueDate) {
          newTaskData.dueDate = analyzeData.dueDate;
        }

        await addTask(newTaskData);

        let createdEvent = false;
        if (analyzeData.isEvent && analyzeData.eventStartTime && analyzeData.eventEndTime) {
          try {
             const { addEventToCalendar } = await import("@/lib/calendar");
             await addEventToCalendar(analyzeData.title, analyzeData.eventStartTime, analyzeData.eventEndTime);
             createdEvent = true;
             fetchEvents();
          } catch(e) { console.error("Erreur ajout calendrier", e); }
        }

        loadTasks(user.uid);

        // Déclencher la réponse vocale
        let groupName = "Plus tard";
        if (newTaskData.isUrgent && newTaskData.isImportant) groupName = "À faire aujourd'hui";
        else if (newTaskData.isImportant) groupName = "À planifier";
        else if (newTaskData.isUrgent) groupName = "À déléguer";
        
        let phrase = `C'est noté. J'ai ajouté ${newTaskData.title} dans la section ${groupName}.`;
        if (createdEvent) {
           phrase = `C'est noté. J'ai programmé l'événement ${newTaskData.title} dans votre calendrier Google avec des rappels.`;
        }
        
        if (isVoiceEnabled) {
          playAudioResponse(phrase);
        }
      }
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Une erreur est survenue");
    } finally {
      setIsProcessing(false);
      setProcessingStep("");
    }
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return "Toute la journée";
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Groupement des tâches
  const todoTasks = tasks.filter(t => t.status !== 'done');
  const doneTasks = tasks.filter(t => t.status === 'done');

  const urgentImportant = todoTasks.filter(t => t.isUrgent && t.isImportant);
  const importantNotUrgent = todoTasks.filter(t => !t.isUrgent && t.isImportant);
  const urgentNotImportant = todoTasks.filter(t => t.isUrgent && !t.isImportant);
  const backlog = todoTasks.filter(t => !t.isUrgent && !t.isImportant);

  // États pour l'édition d'une tâche
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const editTitleRef = useRef("");
  const editCommentRef = useRef("");
  const [editUrgent, setEditUrgent] = useState(false);
  const [editImportant, setEditImportant] = useState(false);

  const startEditing = (task: Task) => {
    editTitleRef.current = task.title;
    editCommentRef.current = task.comment || "";
    setEditUrgent(task.isUrgent || false);
    setEditImportant(task.isImportant || false);
    setEditingTaskId(task.id || null);
  };

  const saveEditing = async (taskId: string) => {
    try {
      const { updateTaskDetails } = await import("@/lib/tasks");
      const title = editTitleRef.current;
      const comment = editCommentRef.current;
      await updateTaskDetails(taskId, {
        title,
        isUrgent: editUrgent,
        isImportant: editImportant,
        comment
      });
      setTasks(tasks.map(t => t.id === taskId ? { ...t, title, isUrgent: editUrgent, isImportant: editImportant, comment } : t));
      setEditingTaskId(null);
    } catch (error) {
      console.error(error);
      alert("Erreur lors de la modification");
    }
  };

  const toggleComment = (taskId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const renderTask = (task: Task) => (
    <div key={task.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.8rem', marginBottom: '0.5rem' }}>
      
      {editingTaskId === task.id ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input 
            type="text" 
            defaultValue={editTitleRef.current} 
            onChange={(e) => { editTitleRef.current = e.target.value; }} 
            className="input-field" 
          />
          <textarea 
            autoFocus
            defaultValue={editCommentRef.current} 
            onChange={(e) => { editCommentRef.current = e.target.value; }} 
            className="input-field" 
            placeholder="Commentaire (laisser vide pour supprimer)..."
            style={{ minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.9rem", color: "var(--text-muted)", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "1rem" }}>
                <input type="checkbox" checked={editUrgent} onChange={e => setEditUrgent(e.target.checked)} style={{ width: '24px', height: '24px' }} /> Urgent
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "1rem" }}>
                <input type="checkbox" checked={editImportant} onChange={e => setEditImportant(e.target.checked)} style={{ width: '24px', height: '24px' }} /> Important
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={() => setEditingTaskId(null)} className="btn btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>Annuler</button>
              <button onClick={() => {if(task.id) saveEditing(task.id)}} className="btn btn-primary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>Ok</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <input 
              type="checkbox" 
              checked={task.status === 'done'} 
              onChange={() => toggleTaskStatus(task)}
              style={{ width: '28px', height: '28px', marginTop: '0.3rem', accentColor: 'var(--primary-color)', cursor: 'pointer', flexShrink: 0 }}
            />
            <div style={{ flex: 1, textDecoration: task.status === 'done' ? 'line-through' : 'none', color: task.status === 'done' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 500, lineHeight: '1.4' }}>
                {task.title}
                <span 
                  onClick={(e) => { e.stopPropagation(); toggleCategory(task); }}
                  style={{
                    marginLeft: '8px', 
                    fontSize: '0.75rem', 
                    padding: '2px 8px', 
                    borderRadius: '12px', 
                    backgroundColor: task.category === 'pro' ? '#ff9500' : '#34c759', 
                    color: '#fff',
                    cursor: 'pointer',
                    verticalAlign: 'middle',
                    fontWeight: 'bold',
                    display: 'inline-block'
                  }}
                >
                  {task.category === 'pro' ? 'PRO' : 'PERSO'}
                </span>
              </div>
              {task.dueDate && <div style={{ fontSize: '0.9rem', color: 'var(--primary-color)', marginTop: '0.2rem' }}>🗓 {task.dueDate}</div>}
            </div>
            <div style={{ display: 'flex', gap: '0.2rem' }}>
              <button 
                onClick={() => {
                  if (task.comment) {
                    toggleComment(task.id!);
                  } else {
                    startEditing(task);
                  }
                }}
                title={task.comment ? "Voir le commentaire" : "Ajouter un commentaire"}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: task.comment ? 'var(--primary-color)' : 'var(--text-secondary)', 
                  cursor: 'pointer', 
                  padding: '0.5rem',
                  filter: task.comment ? 'drop-shadow(0 0 8px rgba(37, 99, 235, 0.4))' : 'none'
                }}>
                <MessageSquare size={20} />
              </button>
              <button onClick={() => startEditing(task)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem' }}>
                <Edit2 size={20} />
              </button>
              <button onClick={() => {if(task.id) deleteTask(task.id).then(()=>loadTasks(user?.uid || ''))}} style={{ background: 'none', border: 'none', color: '#ff3b30', cursor: 'pointer', padding: '0.5rem' }}>
                <Trash2 size={20} />
              </button>
            </div>
          </div>
          {task.comment && expandedComments.has(task.id!) && (
            <div 
              onClick={() => startEditing(task)}
              title="Cliquez pour modifier"
              style={{ cursor: 'text', marginTop: '0.5rem', marginLeft: '3.2rem', padding: '0.8rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.95rem', color: 'var(--text-secondary)', fontStyle: 'italic', whiteSpace: 'pre-wrap', animation: 'fadeIn 0.2s ease' }}
            >
              {task.comment}
            </div>
          )}
        </>
      )}
    </div>
  );

  const Section = ({ title, tasksArray, isOpen, toggleKey, color, icon }: any) => (
    <div className="glass-panel" style={{ marginBottom: '1rem', overflow: 'hidden' }}>
      <button 
        onClick={() => toggleSection(toggleKey)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontWeight: 600, fontSize: '1.1rem' }}>
          <span style={{ color, display: 'flex', alignItems: 'center' }}>{icon}</span>
          {title} <span style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 'normal' }}>({tasksArray.length})</span>
        </div>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.3s' }}>▼</span>
      </button>
      {isOpen && (
        <div style={{ padding: '0 1rem 1rem 1rem' }}>
          {tasksArray.length === 0 ? (
             <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, paddingLeft: '2rem' }}>Rien pour le moment.</p>
          ) : (
             tasksArray.map(renderTask)
          )}
        </div>
      )}
    </div>
  );

  return (
    <main className="container">
      <audio id="voice-player" style={{ display: 'none' }} />
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: 0 }}>Task Manager</h1>
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button onClick={logout} className="btn btn-secondary" style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}>Déconnexion</button>
          </div>
        ) : (
          <button onClick={handleLogin} className="btn btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}>Connexion Google</button>
        )}
      </header>

      {user && (
        <>
          <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", margin: "3rem 0" }}>
            <button 
              className={`mic-button ${isRecording ? "recording" : ""}`} 
              aria-label="Dictate task"
              onPointerDown={(e) => handlePointerDown(e)}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onContextMenu={(e) => e.preventDefault()}
              disabled={isProcessing}
              style={{
                userSelect: 'none',
                WebkitUserSelect: 'none' as any,
                ...(isRecording ? {
                  animation: "pulse 1.5s infinite",
                  backgroundColor: "#ff3b30",
                  boxShadow: "0 0 20px rgba(255, 59, 48, 0.5)"
                } : {})
              }}
            >
              {isProcessing ? <Loader2 className="animate-spin" size={36} /> : <Mic size={36} />}
            </button>

            <button 
              onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.8rem',
                padding: '0.6rem 1.2rem',
                marginTop: '1rem',
                borderRadius: '30px',
                fontSize: '1.1rem',
                fontWeight: '600',
                backgroundColor: 'transparent',
                color: isVoiceEnabled ? '#30d158' : '#ff453a',
                border: `2px solid ${isVoiceEnabled ? '#30d158' : '#ff453a'}`,
                boxShadow: isVoiceEnabled ? '0 0 15px rgba(48, 209, 88, 0.2)' : '0 0 15px rgba(255, 69, 58, 0.2)',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              {isVoiceEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
              {isVoiceEnabled ? 'Toggle ON' : 'Toggle OFF'}
            </button>

            <div style={{ height: "1.5rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              {!isRecording && !isProcessing && "Maintenez appuyé pour parler..."}
              {isRecording && "Relâchez le micro pour envoyer"}
              {isProcessing && processingStep}
            </div>
          </section>

          {/* MATRICE D'EISENHOWER */}
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "1rem" }}>Mes Tâches</h2>
            <Section title="À faire aujourd'hui" tasksArray={urgentImportant} isOpen={openSections.urgentImportant} toggleKey="urgentImportant" color="#ff453a" icon={<Flame size={22} />} />
            <Section title="À planifier" tasksArray={importantNotUrgent} isOpen={openSections.important} toggleKey="important" color="#ffd60a" icon={<CalendarClock size={22} />} />
            <Section title="À déléguer / Gérer" tasksArray={urgentNotImportant} isOpen={openSections.urgent} toggleKey="urgent" color="#0a84ff" icon={<Users size={22} />} />
            <Section title="Plus tard / Backlog" tasksArray={backlog} isOpen={openSections.backlog} toggleKey="backlog" color="#8e8e93" icon={<Archive size={22} />} />
            <Section title="Terminées" tasksArray={doneTasks} isOpen={openSections.done} toggleKey="done" color="#30d158" icon={<CheckCircle2 size={22} />} />
          </section>

          {/* AJOUT MANUEL */}
          <section className="glass-panel" style={{ padding: "1rem", marginBottom: "2rem" }}>
            <form onSubmit={handleAddTask} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input 
                  type="text" 
                  value={newTaskTitle} 
                  onChange={(e) => setNewTaskTitle(e.target.value)} 
                  placeholder="Ajouter manuellement..." 
                  className="input-field" 
                />
                <button type="submit" className="btn btn-primary" style={{ width: "45px", padding: 0 }}>+</button>
              </div>
              <div style={{ display: "flex", gap: "1.5rem", fontSize: "1rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={newTaskUrgent} onChange={e => setNewTaskUrgent(e.target.checked)} style={{ width: '24px', height: '24px' }} /> Urgent
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={newTaskImportant} onChange={e => setNewTaskImportant(e.target.checked)} style={{ width: '24px', height: '24px' }} /> Important
                </label>
              </div>
            </form>
          </section>

          {/* SECTION CALENDRIER */}
          <section className="glass-panel" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.4rem", margin: 0 }}>Agenda d'aujourd'hui</h2>
              <a 
                href="https://calendar.google.com/calendar/r" 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ padding: "0.5rem 1rem", fontSize: "0.9rem", textDecoration: "none", display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <CalendarDays size={18} /> Ouvrir Google Calendar
              </a>
            </div>
            
            {loadingEvents ? (
              <p className="text-muted" style={{ textAlign: "center" }}>Chargement de l'agenda...</p>
            ) : events.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {events.map((event) => (
                  <li key={event.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem 0", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{event.summary}</div>
                      <div style={{ color: "var(--primary-color)", fontSize: "0.9rem", marginTop: "0.2rem" }}>
                        {event.start?.dateTime ? formatTime(event.start.dateTime) : "Journée"}
                      </div>
                    </div>
                    <button onClick={() => handleDeleteEvent(event.id)} style={{ background: 'none', border: 'none', color: '#ff3b30', cursor: 'pointer', fontSize: '1.5rem', marginLeft: '0.5rem', padding: '0.5rem' }}>✕</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted" style={{ textAlign: "center" }}>Aucun événement prévu aujourd'hui ! 🎉</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}


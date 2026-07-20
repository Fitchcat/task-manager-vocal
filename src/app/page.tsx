"use client";

import { useState, useEffect } from "react";
import { loginWithGoogle, logout } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { getTodayEvents } from "@/lib/calendar";
import { getUserTasks, addTask, updateTaskStatus, deleteTask, Task } from "@/lib/tasks";

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
    } catch (error) {
      console.error(error);
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

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Lecture de la réponse vocale avec un effet de réverbération "J.A.R.V.I.S"
  const playAudioResponse = async (text: string) => {
    try {
      const res = await fetch("/api/tts", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({text}) 
      });
      const arrayBuffer = await res.arrayBuffer();
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
      
      const source = audioCtx.createBufferSource();
      source.buffer = decodedData;
      
      // Génération d'une réverbération synthétique
      const convolver = audioCtx.createConvolver();
      const rate = audioCtx.sampleRate;
      const length = rate * 1.5; // 1.5 secondes de réverb
      const impulse = audioCtx.createBuffer(2, length, rate);
      for (let i = 0; i < 2; i++) {
        const channel = impulse.getChannelData(i);
        for (let j = 0; j < length; j++) {
          channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, 3.0);
        }
      }
      convolver.buffer = impulse;

      const dryGain = audioCtx.createGain();
      const wetGain = audioCtx.createGain();
      dryGain.gain.value = 0.8;  // Son direct
      wetGain.gain.value = 0.25; // Effet de résonance
      
      source.connect(dryGain);
      source.connect(convolver);
      convolver.connect(wetGain);
      
      dryGain.connect(audioCtx.destination);
      wetGain.connect(audioCtx.destination);
      
      source.start(0);
    } catch (e) {
      console.error("Erreur de lecture TTS :", e);
    }
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
        body: JSON.stringify({ text: transcribeData.text })
      });
      const analyzeData = await analyzeRes.json();

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
          userId: user.uid
        };
        
        // Firebase déteste 'undefined', donc on ne l'ajoute que si la date existe vraiment
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
             fetchEvents(); // Recharger les événements
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
           phrase = `C'est noté. J'ai programmé l'événement ${newTaskData.title} dans votre calendrier Google avec des rappels, et je l'ai ajouté à vos tâches.`;
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
  const [editTitle, setEditTitle] = useState("");
  const [editUrgent, setEditUrgent] = useState(false);
  const [editImportant, setEditImportant] = useState(false);

  const startEditing = (task: Task) => {
    setEditingTaskId(task.id || null);
    setEditTitle(task.title);
    setEditUrgent(task.isUrgent || false);
    setEditImportant(task.isImportant || false);
  };

  const saveEditing = async (taskId: string) => {
    try {
      // Import updateTaskDetails dynamicly or ensure it's available
      const { updateTaskDetails } = await import("@/lib/tasks");
      await updateTaskDetails(taskId, {
        title: editTitle,
        isUrgent: editUrgent,
        isImportant: editImportant
      });
      // Mettre à jour l'état local
      setTasks(tasks.map(t => t.id === taskId ? { ...t, title: editTitle, isUrgent: editUrgent, isImportant: editImportant } : t));
      setEditingTaskId(null);
    } catch (error) {
      console.error(error);
      alert("Erreur lors de la modification");
    }
  };

  const renderTask = (task: Task) => (
    <div key={task.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.8rem', background: 'var(--surface-color)', borderRadius: '12px', marginBottom: '0.5rem' }}>
      
      {editingTaskId === task.id ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input 
            type="text" 
            value={editTitle} 
            onChange={(e) => setEditTitle(e.target.value)} 
            className="input-field" 
          />
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.9rem", color: "var(--text-muted)", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input type="checkbox" checked={editUrgent} onChange={e => setEditUrgent(e.target.checked)} /> Urgent
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input type="checkbox" checked={editImportant} onChange={e => setEditImportant(e.target.checked)} /> Important
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={() => setEditingTaskId(null)} className="btn btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>Annuler</button>
              <button onClick={() => {if(task.id) saveEditing(task.id)}} className="btn btn-primary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>Ok</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <input 
            type="checkbox" 
            checked={task.status === 'done'} 
            onChange={() => toggleTaskStatus(task)}
            style={{ width: '20px', height: '20px', accentColor: 'var(--primary-color)', cursor: 'pointer', flexShrink: 0 }}
          />
          <div style={{ flex: 1, textDecoration: task.status === 'done' ? 'line-through' : 'none', color: task.status === 'done' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
            <div style={{ fontSize: '1rem', fontWeight: 500 }}>{task.title}</div>
            {task.dueDate && <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', marginTop: '0.2rem' }}>🗓 {task.dueDate}</div>}
          </div>
          <button onClick={() => startEditing(task)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem' }}>✏️</button>
          <button onClick={() => {if(task.id) deleteTask(task.id).then(()=>loadTasks(user?.uid || ''))}} style={{ background: 'none', border: 'none', color: '#ff3b30', cursor: 'pointer', fontSize: '1.2rem', marginLeft: '0.5rem' }}>✕</button>
        </div>
      )}
    </div>
  );

  const Section = ({ title, tasksArray, isOpen, toggleKey, color, icon }: any) => (
    <div style={{ marginBottom: '1rem', background: 'var(--surface-color)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      <button 
        onClick={() => toggleSection(toggleKey)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
          <span style={{ color }}>{icon}</span>
          {title} <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'normal' }}>({tasksArray.length})</span>
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
              onClick={toggleRecording}
              disabled={isProcessing}
              style={isRecording ? {
                animation: "pulse 1.5s infinite",
                backgroundColor: "#ff3b30",
                boxShadow: "0 0 20px rgba(255, 59, 48, 0.5)"
              } : {}}
            >
              {isProcessing ? "⏳" : <div className="text-4xl">🎤</div>}
            </button>

            <button 
              onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
              className="flex items-center gap-2 px-4 py-2 mt-2 rounded-full bg-gray-800/50 text-sm text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all border border-gray-700/50"
            >
              {isVoiceEnabled ? '🔊 Réponse vocale : ON' : '🔇 Réponse vocale : OFF'}
            </button>

            <div style={{ height: "1.5rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              {isRecording && "Écoute en cours... Cliquez pour arrêter."}
              {isProcessing && processingStep}
            </div>
          </section>

          {/* MATRICE D'EISENHOWER */}
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Mes Tâches</h2>
            <Section title="À faire aujourd'hui" tasksArray={urgentImportant} isOpen={openSections.urgentImportant} toggleKey="urgentImportant" color="#ff3b30" icon="🔴" />
            <Section title="À planifier" tasksArray={importantNotUrgent} isOpen={openSections.important} toggleKey="important" color="#ffd60a" icon="🟡" />
            <Section title="À déléguer / Gérer" tasksArray={urgentNotImportant} isOpen={openSections.urgent} toggleKey="urgent" color="#0a84ff" icon="🔵" />
            <Section title="Plus tard / Backlog" tasksArray={backlog} isOpen={openSections.backlog} toggleKey="backlog" color="#8e8e93" icon="⚪️" />
            <Section title="Terminées" tasksArray={doneTasks} isOpen={openSections.done} toggleKey="done" color="#34c759" icon="✅" />
          </section>

          {/* AJOUT MANUEL */}
          <section style={{ background: "var(--surface-color)", padding: "1rem", borderRadius: "16px", marginBottom: "2rem" }}>
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
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={newTaskUrgent} onChange={e => setNewTaskUrgent(e.target.checked)} /> Urgent
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={newTaskImportant} onChange={e => setNewTaskImportant(e.target.checked)} /> Important
                </label>
              </div>
            </form>
          </section>

          {/* SECTION CALENDRIER (toujours présente pour l'info) */}
          <section style={{ background: "var(--surface-color)", padding: "1.5rem", borderRadius: "20px", marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Agenda d'aujourd'hui</h2>
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
                    <button onClick={() => handleDeleteEvent(event.id)} style={{ background: 'none', border: 'none', color: '#ff3b30', cursor: 'pointer', fontSize: '1.2rem', marginLeft: '0.5rem', padding: '0.5rem' }}>✕</button>
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

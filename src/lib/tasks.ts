import { db } from './firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';

export type TaskStatus = 'todo' | 'waiting' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface Task {
  id?: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  userId: string;
  createdAt: Date;
  isUrgent?: boolean;
  isImportant?: boolean;
  dueDate?: string;
  category?: 'perso' | 'pro';
  comment?: string;
}

// Récupérer toutes les tâches d'un utilisateur
export const getUserTasks = async (userId: string): Promise<Task[]> => {
  try {
    // On enlève orderBy de la requête Firestore pour éviter d'avoir à créer un index composite manuellement.
    const q = query(
      collection(db, "tasks"),
      where("userId", "==", userId)
    );
    
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        title: data.title,
        status: data.status,
        priority: data.priority,
        userId: data.userId,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
        isUrgent: data.isUrgent || false,
        isImportant: data.isImportant || false,
        dueDate: data.dueDate,
        category: data.category || 'perso',
        comment: data.comment || ''
      } as Task;
    });

    // Tri manuel par date de création (du plus récent au plus ancien)
    return tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (error) {
    console.error("Erreur lors de la récupération des tâches :", error);
    throw error;
  }
};

// Ajouter une nouvelle tâche
export const addTask = async (taskData: Omit<Task, 'id' | 'createdAt'>): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, "tasks"), {
      ...taskData,
      createdAt: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    console.error("Erreur lors de l'ajout de la tâche :", error);
    throw error;
  }
};

// Mettre à jour le statut d'une tâche
export const updateTaskStatus = async (taskId: string, newStatus: TaskStatus): Promise<void> => {
  try {
    const taskRef = doc(db, "tasks", taskId);
    await updateDoc(taskRef, {
      status: newStatus
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la tâche :", error);
    throw error;
  }
};

// Mettre à jour les détails complets d'une tâche (titre, urgence, importance)
export const updateTaskDetails = async (id: string, updates: Partial<Task>) => {
  const taskRef = doc(db, 'tasks', id);
  await updateDoc(taskRef, updates);
};

// Supprimer une tâche
export const deleteTask = async (taskId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "tasks", taskId));
  } catch (error) {
    console.error("Erreur lors de la suppression de la tâche :", error);
    throw error;
  }
};

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { text, tasks = [] } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Aucun texte fourni' }, { status: 400 });
    }

    const tasksContext = tasks.length > 0 
      ? `\nVoici la liste actuelle des tâches de l'utilisateur (au format JSON) :\n${JSON.stringify(tasks.map((t:any) => ({ id: t.id, title: t.title, status: t.status, category: t.category, isUrgent: t.isUrgent, isImportant: t.isImportant })), null, 2)}`
      : `\nL'utilisateur n'a aucune tâche pour le moment.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant vocal expert en productivité (méthode GTD).
Aujourd'hui, nous sommes le ${new Date().toISOString()}.
${tasksContext}

Analyse la transcription vocale de l'utilisateur. Tu dois déterminer son intention principale :
1. "create_task" : S'il dicte quelque chose à faire (ex: "Penser à acheter du pain").
2. "query_tasks" : S'il te pose une question sur son agenda ou ses tâches existantes (ex: "Quelles sont mes tâches urgentes pro ?").

Tu dois répondre UNIQUEMENT en JSON avec la structure suivante :
{
  "intent": "create_task" OU "query_tasks",
  
  // SI intent == "create_task", remplis ces champs :
  "title": "Résumé concis de la tâche (ou null)",
  "isUrgent": true/false (selon l'urgence),
  "isImportant": true/false (selon l'impact),
  "dueDate": "Texte court de l'échéance (ex: 'Ce soir') ou null",
  "category": "perso" ou "pro" (déduis-le du contexte, si incertain mets "perso"),
  "isEvent": true/false (true SEULEMENT s'il s'agit d'un rendez-vous ou d'une tâche planifiée à un jour ET une heure précise, ex: "Médecin à 19h"),
  "eventStartTime": "Date au format ISO 8601 (ex: '2026-07-20T19:00:00Z') ou null si isEvent est false",
  "eventEndTime": "Date au format ISO 8601 (généralement 1h après startTime) ou null",

  // SI intent == "query_tasks", remplis ce champ :
  "responseMessage": "Ta réponse vocale naturelle à la question de l'utilisateur, en tutoyant, claire et concise. (ou null)"
}`
        },
        {
          role: 'user',
          content: `Analyse cette transcription vocale : "${text}"`
        }
      ]
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Erreur d'analyse IA :", error);
    return NextResponse.json({ error: error.message || "L'analyse a échoué" }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Aucun texte fourni' }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant expert en productivité (méthode GTD).
Aujourd'hui, nous sommes le ${new Date().toISOString()}.
Analyse la transcription vocale et extrais les informations.
Tu dois répondre UNIQUEMENT en JSON avec la structure suivante :
{
  "title": "Résumé concis de la tâche",
  "isUrgent": true/false (selon l'urgence),
  "isImportant": true/false (selon l'impact),
  "dueDate": "Texte court de l'échéance (ex: 'Ce soir') ou null",
  "category": "perso" ou "pro" (déduis-le du contexte, si incertain mets "perso"),
  "isEvent": true/false (true SEULEMENT s'il s'agit d'un rendez-vous ou d'une tâche planifiée à un jour ET une heure précise, ex: "Médecin à 19h"),
  "eventStartTime": "Date au format ISO 8601 (ex: '2026-07-20T19:00:00Z') ou null si isEvent est false",
  "eventEndTime": "Date au format ISO 8601 (généralement 1h après startTime) ou null"
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

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier audio fourni' }, { status: 400 });
    }

    const response = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'fr', // On force le français pour de meilleurs résultats
    });

    return NextResponse.json({ text: response.text });
  } catch (error: any) {
    console.error('Erreur de transcription :', error);
    return NextResponse.json({ error: error.message || 'La transcription a échoué' }, { status: 500 });
  }
}

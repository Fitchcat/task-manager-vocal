export const getTodayEvents = async () => {
  const token = localStorage.getItem('google_calendar_token');
  if (!token) {
    console.warn("Aucun token Google Calendar trouvé");
    return [];
  }

  // Définir la plage horaire (aujourd'hui)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay.toISOString()}&timeMax=${endOfDay.toISOString()}&orderBy=startTime&singleEvents=true`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Token expiré ou invalide. Veuillez vous reconnecter.");
      }
      console.warn(`Erreur API Calendar: ${response.status}. L'API n'est peut-être pas activée ou les droits n'ont pas été donnés.`);
      return []; // On ne fait pas crasher l'application, on renvoie juste aucun événement
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("Erreur lors de la récupération du calendrier :", error);
    return []; // On empêche le crash global de l'application
  }
};

export const addEventToCalendar = async (summary: string, startTime: string, endTime: string) => {
  const token = localStorage.getItem('google_calendar_token');
  if (!token) throw new Error("Aucun token Google Calendar");

  const event = {
    summary,
    start: {
      dateTime: startTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    end: {
      dateTime: endTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 10 }
      ]
    }
  };

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Erreur Calendar: ${err.error?.message || response.statusText}`);
  }
  return await response.json();
};

export const deleteEventFromCalendar = async (eventId: string) => {
  const token = localStorage.getItem('google_calendar_token');
  if (!token) throw new Error("Aucun token Google Calendar");

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    let err;
    try {
      err = await response.json();
    } catch(e) {}
    throw new Error(`Erreur Calendar Delete: ${err?.error?.message || response.statusText}`);
  }
  return true;
};

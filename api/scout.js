/**
 * Vercel serverless function — generates AI scouting report using Google Gemini Flash.
 *
 * Required Vercel environment variable:
 *   GEMINI_API_KEY  — free key from aistudio.google.com → "Get API key"
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const { playerName, stats = {}, career = {}, ratings = {} } = req.body || {};
  if (!playerName) {
    return res.status(400).json({ error: 'playerName is required' });
  }

  const fmt = (n) => n != null ? n : 0;
  const fmtAvg = (s) => {
    if (!s.ab) return '.000';
    const val = s.avg ?? (s.hits / s.ab);
    return '.' + String(Math.round(val * 1000)).padStart(3, '0');
  };

  const ratingLines = Object.entries(ratings)
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k}: ${v}/10`)
    .join('\n');

  const prompt = `You are a youth baseball coach writing a scouting report for an 8U/10U rec-league player. Keep the tone encouraging and constructive — this is for youth development, not professional scouting.

Player: ${playerName}

Current Season Stats:
  AVG: ${fmtAvg(stats)}  |  AB: ${fmt(stats.ab)}  |  H: ${fmt(stats.hits)}
  HR: ${fmt(stats.hr)}  |  RBI: ${fmt(stats.rbi)}  |  R: ${fmt(stats.runs)}
  BB: ${fmt(stats.bb)}  |  K: ${fmt(stats.k)}

Career Stats:
  AVG: ${fmtAvg(career)}  |  AB: ${fmt(career.ab)}  |  H: ${fmt(career.hits)}
  HR: ${fmt(career.hr)}  |  RBI: ${fmt(career.rbi)}

Coach Ratings (1–10):
${ratingLines || '  (no ratings yet)'}

Write a 3–4 sentence scouting report. Lead with a clear strength, mention one area of focus, and close with an encouraging statement about their development. Be specific to the stats and ratings provided. Do not use bullet points — write in paragraph form.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 350, temperature: 0.7 },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: data.error?.message || 'Gemini API error' });
    }

    const report = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!report) return res.status(502).json({ error: 'Empty response from Gemini' });

    res.status(200).json({ report });
  } catch {
    res.status(500).json({ error: 'Failed to generate report' });
  }
}

// Temporary diagnostic — lists available Gemini models for this API key
export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  const data = await r.json();
  const names = (data.models || []).map(m => m.name);
  res.status(200).json({ models: names });
}

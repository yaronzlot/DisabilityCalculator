exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { step, description, topics, content } = JSON.parse(event.body || '{}');

  let prompt, maxTokens;

  if (step === 'identify') {
    prompt = `המטופל מתאר: "${description}"

מהרשימה הבאה, בחר את הנושאים הרלוונטיים (כולל סיבוכים נגזרים):
${topics.join(', ')}

החזר JSON בלבד: {"topics": ["נושא 1", "נושא 2"]}`;
    maxTokens = 200;

  } else if (step === 'analyze') {
    prompt = `אתה מומחה לספר המבחנים של ביטוח לאומי בישראל.
להלן הסעיפים הרלוונטיים מספר המבחנים:
${content}

המטופל מתאר: "${description}"

חשוב:
1. מצא את כל הסעיפים הרלוונטיים כולל נגזרים (כריתת לבלב → גם סעיף לבלב וגם סעיף סוכרת).
2. לכל סעיף — הצג את כל רמות האחוז האפשריות.
3. סמן את הרמה המומלצת לפי המצב המתואר.
4. ציין עד 5 בדיקות ומסמכים שהוועדה הרפואית בוחנת לפי סעיף זה.

החזר JSON בלבד (ללא backticks):
{
  "findings": [
    {
      "section": "מספר סעיף",
      "name": "שם הפגימה",
      "levels": [{"label": "תיאור", "percentage": מספר}],
      "recommended_percentage": מספר,
      "description": "הסבר קצר",
      "note": "הערה אם יש",
      "documents": ["בדיקה 1"],
      "documents_tip": "טיפ"
    }
  ],
  "total": מספר,
  "calculation": "הסבר",
  "summary": "סיכום"
}`;
    maxTokens = 4000;

  } else {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid step' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) return { statusCode: response.status, body: JSON.stringify({ error: data.error?.message }) };

    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

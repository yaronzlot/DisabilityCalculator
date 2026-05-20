const PDF_URL = 'https://raw.githubusercontent.com/yaronzlot/DisabilityCalculator/main/DisabilityTestBook.PDF';

async function fetchPdfAsBase64() {
  const response = await fetch(PDF_URL);
  if (!response.ok) {
    throw new Error(`לא הצלחתי להוריד את ה-PDF: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

async function callGemini(apiKey, pdfBase64, description) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: pdfBase64
              }
            },
            {
              text: `אתה מומחה בתקנות הביטוח הלאומי הישראלי וספר המבחנים לקביעת נכות.
המסמך המצורף הוא ספר המבחנים הרשמי של ביטוח לאומי.

המצב הרפואי שתואר:
"${description}"

המשימה שלך:
1. מצא את כל הסעיפים הרלוונטיים בספר המבחנים
2. לכל סעיף — ציין את מספר הסעיף, שמו, ואחוזי הנכות המתאימים למצב שתואר
3. הסבר מדוע בחרת בדרגה הספציפית
4. חשב את הנכות הכוללת לפי שיטת "הכושר המופחת" (לא סכום רגיל)

ענה אך ורק בפורמט JSON הבא, ללא טקסט נוסף:
{
  "findings": [
    {
      "section": "מספר הסעיף",
      "name": "שם הפגימה",
      "percentage": 25,
      "description": "הסבר קצר מדוע נקבע האחוז הזה",
      "note": "הערות נוספות אם רלוונטי"
    }
  ],
  "total": 35,
  "calculation": "הסבר איך חושב הסכום הכולל",
  "summary": "סיכום כולל של המצב לפי ספר המבחנים"
}`
            }
          ]
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
      })
    }
  );

  if (response.status === 429) {
    return { rateLimited: true };
  }

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `שגיאה מ-Gemini API: ${response.status}`);
  }

  return response.json();
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'מפתח API לא מוגדר בשרת' }) };
  }

  let description;
  try {
    const body = JSON.parse(event.body);
    description = body.description;
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'בקשה לא תקינה' }) };
  }

  if (!description) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'חסר תיאור רפואי' }) };
  }

  try {
    // Download PDF from GitHub
    const pdfBase64 = await fetchPdfAsBase64();

    // Send to Gemini with PDF
    const data = await callGemini(apiKey, pdfBase64, description);

    if (data.rateLimited) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ error: 'RATE_LIMIT', retryAfter: 60 })
      };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return { statusCode: 200, headers, body: JSON.stringify(parsed) };
    } catch {
      return { statusCode: 200, headers, body: JSON.stringify({ raw: text }) };
    }

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'שגיאה פנימית' })
    };
  }
};

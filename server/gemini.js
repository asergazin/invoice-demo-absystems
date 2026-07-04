import { GoogleGenAI, Type } from '@google/genai';

export async function extractDocumentData(fileBase64, mimeType, userPrompt = '') {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const systemInstruction = `You are a professional accountant assistant for "A&B Systems Construction Company".
Extract data from invoices (Счет на оплату) into JSON.

FIELDS TO EXTRACT:
- "№": Invoice number.
- "Контрагент": Vendor/Seller name.
- "БИН/ИИН": 12-digit vendor ID.
- "Сметная стоимость": Estimate cost if mentioned.
- "Номер договора": Contract number.
- "Сумма по договору": Total amount according to contract.
- "Сумма к оплате": Final payable amount.
- "Сумма НДС": VAT amount.
- "Сумма без НДС": Amount excluding VAT.
- "Примечание": Description, starts with invoice number and date when visible.
- "Комментарии ФД": Any internal comments or approvals visible.
- "Товары": List of items with No, Name, Qty, Price, Sum.

Output valid JSON according to schema. Output only the JSON.`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      registry: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            '№': { type: Type.STRING },
            'Контрагент': { type: Type.STRING },
            'БИН/ИИН': { type: Type.STRING },
            'Сметная стоимость': { type: Type.STRING },
            'Номер договора': { type: Type.STRING },
            'Сумма по договору': { type: Type.STRING },
            'Сумма к оплате': { type: Type.STRING },
            'Сумма НДС': { type: Type.STRING },
            'Сумма без НДС': { type: Type.STRING },
            'Примечание': { type: Type.STRING },
            'Комментарии ФД': { type: Type.STRING },
            'Товары': {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  '№ Товара': { type: Type.STRING },
                  'Наименование': { type: Type.STRING },
                  'Кол-во товара': { type: Type.STRING },
                  'Цена товара': { type: Type.STRING },
                  'Сумма товара': { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    },
    required: ['registry'],
  };

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: [
      {
        parts: [
          { text: userPrompt || 'Extract invoice details carefully.' },
          { inlineData: { data: fileBase64, mimeType } },
        ],
      },
    ],
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Empty Gemini response');
  return JSON.parse(text.trim());
}

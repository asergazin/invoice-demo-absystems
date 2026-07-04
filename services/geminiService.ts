export const extractDocumentData = async (
  fileBase64: string,
  mimeType: string,
  userPrompt: string = '',
  mode: 'general' | 'registry' = 'general',
) => {
  const response = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64, mimeType, userPrompt, mode }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Extraction failed: ${response.status}`);
  }

  return response.json();
};

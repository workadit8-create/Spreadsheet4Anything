export type HybridBackendConfig = {
  url: string;
  apiKey: string;
  spreadsheetId: string;
};

export function getHybridBackendConfig(): HybridBackendConfig {
  const url = process.env.HYBRID_BACKEND_URL?.trim();
  const apiKey = process.env.HYBRID_BACKEND_API_KEY?.trim();
  const spreadsheetId = process.env.HYBRID_DATABASE_SHEET_ID?.trim();

  if (!url || !apiKey || !spreadsheetId) {
    throw new Error(
      "Env HYBRID_BACKEND_URL, HYBRID_BACKEND_API_KEY, HYBRID_DATABASE_SHEET_ID belum diisi (.env.local)"
    );
  }

  return { url, apiKey, spreadsheetId };
}

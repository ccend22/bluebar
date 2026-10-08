// Albanian → English for the online menu, through DeepL. Best effort: no key, a slow or
// failing DeepL, and the menu simply keeps showing the Albanian text.
export function deeplTranslator(key, fetchImpl = fetch) {
  if (!key) return null;
  // Free-plan keys end in ":fx" and use their own endpoint.
  const endpoint = key.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
  return async (texts) => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texts, source_lang: "SQ", target_lang: "EN-GB" }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`DeepL ${response.status}`);
    return (await response.json()).translations.map((t) => t.text);
  };
}

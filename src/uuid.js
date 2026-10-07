// crypto.randomUUID exists only on HTTPS and localhost; a phone opening the app over the
// venue's Wi-Fi by IP (http://192.168…) has getRandomValues but not randomUUID.
if (typeof crypto !== "undefined" && !crypto.randomUUID)
  crypto.randomUUID = () =>
    "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
    );

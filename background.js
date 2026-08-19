const ALLOWED_DOMAINS = ["hubspot.com"];

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  const isAllowed = ALLOWED_DOMAINS.some((domain) => tab.url.includes(domain));
  if (!isAllowed) return;

  // Garante que o content script está presente antes de mandar o comando,
  // em vez de só tentar injetar como reação a uma falha de mensagem. Isso
  // evita casos em que o clique no ícone não abria o widget (ex: aba
  // recarregada muito recentemente, ou o service worker "acordando" com
  // atraso). O content.js já se protege contra reinjeção duplicada.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (e) {
    // Ignora: normalmente significa que o script já está rodando na página.
  }

  chrome.tabs.sendMessage(tab.id, { action: "toggle_widget" }).catch(() => {});
});

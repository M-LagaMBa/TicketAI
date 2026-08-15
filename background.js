const ALLOWED_DOMAINS = ["hubspot.com"];

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url) return;

  const isAllowed = ALLOWED_DOMAINS.some((domain) => tab.url.includes(domain));
  if (!isAllowed) return;

  chrome.tabs.sendMessage(tab.id, { action: "toggle_widget" }).catch(() => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        files: ["content.js"]
      },
      () => {
        chrome.tabs.sendMessage(tab.id, { action: "toggle_widget" });
      }
    );
  });
});

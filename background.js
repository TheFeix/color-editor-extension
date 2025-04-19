// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTabId") {
    sendResponse({ tabId: sender.tab.id });
  }
  return true; // 保持通道开放
});

let currentTabId = null;

// 监听标签切换
chrome.tabs.onActivated.addListener(({ tabId }) => {
  currentTabId = tabId;
  // 通知content-script重新采集数据
  chrome.tabs.sendMessage(tabId, { action: "refreshData" });
});

// 监听标签关闭
chrome.tabs.onRemoved.addListener((tabId) => {
  // 清理对应页面的数据
  chrome.storage.local.remove(`elementData_${tabId}`);
});
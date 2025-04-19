// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTabId") {
    try {
      if (!sender.tab?.id) throw new Error("无效的标签页");
      sendResponse({ tabId: sender.tab.id });
    } catch (error) {
      console.error("获取Tab ID失败:", error);
      sendResponse({ tabId: `fallback_${Date.now()}` });
    }
    return true;
  }
  return false;
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
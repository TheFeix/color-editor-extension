// 添加数据更新监听
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === "refreshData") {
    collectAttributes();
  }
  if (request.action === "updateStyle") {
    try {
      document.querySelectorAll(request.selector).forEach((element) => {
        element.style[request.property] = request.value;
      });
    } catch (error) {
      console.error("无效选择器:", request.selector, error);
      // 回退到类名选择器
      const fallbackSelector = `.${CSS.escape(request.selector)}`;
      document.querySelectorAll(fallbackSelector).forEach((element) => {
        element.style[request.property] = request.value;
      });
    }
    collectAttributes();
  }
  return true;
});


function getFullComputedStyle(element) {
  const style = window.getComputedStyle(element);
  return Array.from(style).reduce((obj, prop) => {
    obj[prop] = style.getPropertyValue(prop);
    return obj;
  }, {});
}

// let currentTabId;
let currentTabId = chrome.devtools?.inspectedWindow?.tabId; // 备用方案
// 在setTimeout前锁定当前tabId
const tabIdToStore = currentTabId;

async function initializeTabId() {
  return new Promise((resolve) => {
    // 如果已有有效ID直接返回
    if (currentTabId && currentTabId !== "undefined") {
      return resolve();
    }

    // 优先尝试从chrome.tabs获取
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        currentTabId = tabs[0].id;
        return resolve();
      }

      // 备用方案
      chrome.runtime.sendMessage({ action: "getTabId" }, (response) => {
        currentTabId =
          response?.tabId || Math.random().toString(36).slice(2, 9);
        resolve();
      });
    });
  });
}

chrome.runtime.sendMessage({ action: "getTabId" }, (response) => {
  currentTabId = response.tabId;
});
async function collectAttributes() {
  if (!currentTabId) {
    console.warn("无法获取tabId，使用备用方案");
    currentTabId = Math.random().toString(36).slice(2, 9);
  }
  await initializeTabId();
  const results = [];

  // 在元素遍历前统一获取所有样式
  const allElements = document.querySelectorAll("*");
  allElements.forEach((element) => {
    // 过滤不可见元素
    if (element.offsetParent === null) return;
    // <<遍历元素,获取标签内的属性值,返回对象.例:{class: 'text', data-v-b8a8bcb0: ''}>>
    const attributes = Array.from(element.attributes).reduce((obj, attr) => {
      obj[attr.name] = attr.value;
      return obj;
    }, {});

    // 新增计算样式获取
    const computedStyle = window.getComputedStyle(element);
    const styleDetails = {
      backgroundColor: computedStyle.backgroundColor,
      color: computedStyle.color,
      fontSize: computedStyle.fontSize,
      fontFamily: computedStyle.fontFamily,
      // 可添加其他需要关注的样式属性
    };
    // console.log("getFullCS", getFullComputedStyle(computedStyle));
    results.push({
      tag: element.tagName,
      attributes: attributes,
      computedStyle: styleDetails, // 新增样式字段
      text: element.textContent?.trim().slice(0, 50) || "无文本内容", // 截取前50字符
    });
  });

  // 添加去重逻辑
  const uniqueResults = results.filter(
    (v, i, a) => a.findIndex((t) => t.tag === v.tag && t.text === v.text) === i
  );
  // console.log("results: ", results);
  console.log("uniqueResults: ", uniqueResults);
  setTimeout(async () => {
    // 确保使用最新的currentTabId
    const targetTabId = currentTabId || Math.random().toString(36).slice(2, 9);

    try {
      await chrome.storage.local.set({
        [`elementData_${targetTabId}`]: uniqueResults,
      });
      console.log(`数据已存储到标签页${targetTabId}`);
      // chrome.runtime.sendMessage({ action: "dataUpdated" });
    } catch (error) {
      console.error("存储失败:", error);
    }
  }, 300);
}

// 执行采集
collectAttributes();

let updateTimer;
// 使用MutationObserver监控新增元素
const observer = new MutationObserver((mutations) => {
  clearInterval(updateTimer);
  updateTimer = setTimeout(() => {
    collectAttributes(); // 重新采集数据
    chrome.runtime.sendMessage({ action: "dataUpdated" });
  }, 300);
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === 1) {
        // 元素节点
        console.log("新增元素属性:", node.attributes);
      }
    });
    // 动态样式监听
    if (mutation.type === "attributes" && mutation.attributeName === "style") {
      console.log("样式修改:", window.getComputedStyle(mutation.target));
    }
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

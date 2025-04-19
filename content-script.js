// 添加数据更新监听
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "refreshData") {
    collectAttributes();
  }
  // if (request.action === "updateStyle") {
  //   try {
  //     document.querySelectorAll(request.selector).forEach((element) => {
  //       element.style[request.property] = request.value;
  //     });
  //   } catch (error) {
  //     console.error("无效选择器:", request.selector, error);
  //     // 回退到类名选择器
  //     const fallbackSelector = `.${CSS.escape(request.selector)}`;
  //     document.querySelectorAll(fallbackSelector).forEach((element) => {
  //       element.style[request.property] = request.value;
  //     });
  //   }
  //   collectAttributes();
  // }
  // 修改样式更新逻辑
  if (request.action === "updateStyle") {
    observer.disconnect();
    try {
      document.querySelectorAll(request.selector).forEach((element) => {
        element.style.setProperty(request.property, request.value, "important");
      });
    } catch (error) {
      console.error("样式更新失败:", error);
    }
    // 优化后的重新采集逻辑
    // setTimeout(() => {
    //   collectAttributes().then(() => {
    //     chrome.runtime.sendMessage({ action: "dataUpdated" });
    //   });
    // }, 200);
    // 延迟确保样式应用完成
    setTimeout(async () => {
      await collectAttributes();
      // 重新开始监听
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
      chrome.runtime.sendMessage({ action: "dataUpdated" });
    }, 100); // 调整延迟时间为100ms
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

let currentTabId;
// 在setTimeout前锁定当前tabId
const tabIdToStore = currentTabId;

async function initializeTabId() {
  // return new Promise((resolve) => {
  //   // 如果已有有效ID直接返回
  //   if (currentTabId && currentTabId !== "undefined") {
  //     return resolve();
  //   }

  //   // 优先尝试从chrome.tabs获取
  //   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  //     if (tabs[0]?.id) {
  //       currentTabId = tabs[0].id;
  //       return resolve();
  //     }

  //     // 备用方案
  //     chrome.runtime.sendMessage({ action: "getTabId" }, (response) => {
  //       currentTabId =
  //         response?.tabId || Math.random().toString(36).slice(2, 9);
  //       resolve();
  //     });
  //   });
  // });
  return new Promise((resolve) => {
    // 优先从runtime消息获取
    chrome.runtime.sendMessage({ action: "getTabId" }, (response) => {
      if (response?.tabId) {
        currentTabId = response.tabId;
        return resolve();
      }

      // 备用方案：使用chrome.tabs API
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          currentTabId = tabs[0].id;
          resolve();
        } else {
          // 最终回退方案
          currentTabId = `fallback_${Date.now()}`;
          resolve();
        }
      });
    });
  });
}

chrome.runtime.sendMessage({ action: "getTabId" }, (response) => {
  currentTabId = response.tabId;
});
async function collectAttributes() {
  await initializeTabId();
  if (!currentTabId) {
    console.warn("无法获取tabId，使用备用方案");
    currentTabId = Math.random().toString(36).slice(2, 9);
  }
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
    // results.push({
    //   tag: element.tagName,
    //   attributes: attributes,
    //   computedStyle: styleDetails, // 新增样式字段
    //   text: element.textContent?.trim().slice(0, 50) || "无文本内容", // 截取前50字符
    // });
    // 修改collectAttributes函数中的results.push部分
    results.push({
      tag: element.tagName.toLowerCase(),
      attributes: attributes,
      computedStyle: styleDetails,
      text: element.textContent?.trim().slice(0, 50) || "无文本内容",
      // 新增唯一标识符
      uid: `${element.tagName}-${Array.from(element.attributes)
        .map((attr) => `${attr.name}=${attr.value}`)
        .join("-")}`,
    });
  });

  // 添加去重逻辑
  const uniqueResults = results.filter(
    (v, i, a) => a.findIndex((t) => t.tag === v.tag && t.text === v.text) === i
  );
  // console.log("results: ", results);
  console.log("uniqueResults: ", uniqueResults);

  // 确保存储的是有效数组
  if (!Array.isArray(uniqueResults)) {
    console.error("Invalid data format:", uniqueResults);
    return;
  }

  // 确保使用最新的currentTabId
  const targetTabId = currentTabId || Math.random().toString(36).slice(2, 9);

  try {
    await chrome.storage.local.set({
      [`elementData_${targetTabId}`]: uniqueResults,
    });
    // chrome.runtime.sendMessage({ action: "dataUpdated" }
    // chrome.runtime.sendMessage({ action: "dataUpdated" });
  } catch (error) {
    console.error("存储失败:", error);
  }
}

// 执行采集
collectAttributes();

let updateTimer;
// 使用MuIntervalbserver监控新增元素
const observer = new MutationObserver((mutations) => {
  clearTimeout(updateTimer);
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

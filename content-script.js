// 添加数据更新监听
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // if (request.action === "getData") {
  //   chrome.storage.local.get("elementData", (data) => {
  //     sendResponse(data.elementData);
  //   });
  //   return true; // 保持异步通道打开
  // }

  if (request.action === "refreshData") {
    collectAttributes();
  }
  if (request.action === "updateStyle") {
    document.querySelectorAll(request.selector).forEach((element) => {
      element.style[request.property] = request.value;
    });
    collectAttributes(); // 重新收集更新后的数据
  }
  return true;

});

// document.body.style.backgroundColor = "lightblue";

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

// 使用Promise封装获取tabId
function initializeTabId() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getTabId" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        console.warn("无法获取tabId，使用备用方案");
        currentTabId = Math.random().toString(36).slice(2, 9); // 生成唯一ID
      } else {
        currentTabId = response.tabId;
      }
      resolve();
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
  // const computedStyles = Array.from(allElements).map((el) =>
  //   window.getComputedStyle(el)
  // );
  // console.log("allElements: ", allElements);
  // console.log("computedStyles: ", computedStyles);

  // document.querySelectorAll("*").forEach((element) => {
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
      // fullComputedStyle: getFullComputedStyle(element),
      text: element.textContent?.trim().slice(0, 50) || "无文本内容", // 截取前50字符
    });
  });

  // 添加去重逻辑
  const uniqueResults = results.filter(
    (v, i, a) => a.findIndex((t) => t.tag === v.tag && t.text === v.text) === i
  );
  // console.log("results: ", results);
  console.log("uniqueResults: ", uniqueResults);
  // 发送数据到存储
  // chrome.storage.local.set({ elementData: uniqueResults }, () => {
  //   console.log("数据已存储");
  // });
  setTimeout(() => {
    chrome.storage.local.set(
      {
        // [`elementData_${currentTabId}`]: uniqueResults,
        [`elementData_${tabIdToStore}`]: uniqueResults,
      },
      () => {
        console.log(`数据已存储到标签页${tabIdToStore}`);
        chrome.runtime.sendMessage({ action: "dataUpdated" });
      }
    );
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

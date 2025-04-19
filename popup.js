let currentTabId = null;

// popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // if (message.action === "dataUpdated") {
  //   // 从存储获取最新数据
  //   // chrome.storage.local.get("elementData", (data) => {
  //   //   console.log("数据已更新data: ", data);
  //   //   renderElements(data);
  //   // });
  //   // 修改为直接访问存储键值
  //   chrome.storage.local.get(null, (allData) => {
  //     const tabData = allData[`elementData_${currentTabId}`] || [];
  //     renderElements(tabData);
  //   });
  // }
  if (message.action === "dataUpdated") {
    // 动态获取当前标签页ID
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      currentTabId = tab?.id || currentTabId;
      chrome.storage.local.get(null, (allData) => {
        const tabData = allData[`elementData_${currentTabId}`] || [];
        renderElements(tabData);
      });
    });
  }
  return true;
});

// async function getCurrentTabData() {
// const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
// return new Promise((resolve) => {
//   chrome.storage.local.get(`elementData_${tab.id}`, (data) => {
//     resolve(data[`elementData_${tab.id}`] || []);
//   });
// });
// }
// 修改getCurrentTabData函数
async function getCurrentTabData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return new Promise((resolve) => {
    chrome.storage.local.get(`elementData_${tab.id}`, (data) => {
      // 确保始终返回数组
      const result = Array.isArray(data[`elementData_${tab.id}`])
        ? data[`elementData_${tab.id}`]
        : [];
      resolve(result);
    });
  });
}

// 修改所有数据获取逻辑
document.addEventListener("DOMContentLoaded", async () => {
  // const data = await getCurrentTabData();
  // console.log("data: ", data);
  // renderElements(data);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id; // 存储当前标签页ID

  const data = await getCurrentTabData();
  console.log("data: ", data);
  renderElements(data);
});

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === "dataUpdated") {
    const data = await getCurrentTabData();
    console.log("updated-data: ", data);
    renderElements(data);
  }
});

// 新增样式分组函数
function groupByComputedStyle(data) {
  // 添加数组验证
  if (!Array.isArray(data)) {
    console.error("Invalid data format:", data);
    return [];
  }
  const styleGroups = new Map();

  data.forEach((item) => {
    const styleKey = [
      item.computedStyle.backgroundColor,
      item.computedStyle.color,
      item.computedStyle.fontSize,
      item.computedStyle.fontFamily,
    ].join("|");

    if (!styleGroups.has(styleKey)) {
      styleGroups.set(styleKey, {
        style: { ...item.computedStyle },
        elements: {
          tags: new Set(),
          texts: new Set(),
          uids: new Set(),
        },
      });
    }

    const group = styleGroups.get(styleKey);
    group.elements.tags.add(item.tag);
    group.elements.texts.add(item.text);
    group.elements.uids.add(item.uid);
  });

  return Array.from(styleGroups.values());
}

// 修改renderElements函数
function renderElements(data) {
  const container = document.querySelector("div");
  const styleGroups = groupByComputedStyle(data);

  container.innerHTML = `
    <div class="style-groups">
      ${styleGroups
        .map(
          (group) => `
        <div class="style-group">
          <div class="style-preview" style="
            background: ${group.style.backgroundColor};
            color: ${group.style.color};
            font-size: ${group.style.fontSize};
            font-family: ${group.style.fontFamily}
          ">
            ${Array.from(group.elements.texts).join(" ")}
          </div>
          
          <div class="style-controls">
            <div class="control-item">
              <label>背景色</label>
              <input type="color" 
                     data-prop="backgroundColor" 
                     value="${rgbToHex(group.style.backgroundColor)}">
            </div>
            
            <div class="control-item">
              <label>文字色</label>
              <input type="color" 
                     data-prop="color" 
                     value="${rgbToHex(group.style.color)}">
            </div>
            
            <div class="control-item">
              <label>字号(px)</label>
              <input type="number" 
                     data-prop="fontSize" 
                     value="${parseInt(group.style.fontSize)}"
                     min="8" max="72">
            </div>
            
            <div class="control-item">
              <label>字体</label>
              <select data-prop="fontFamily">
                ${getFontOptions(group.style.fontFamily)}
              </select>
            </div>
          </div>
          
          <div class="element-info">
            <div class="tags">标签: ${Array.from(group.elements.tags).join(
              ", "
            )}</div>
            <div class="texts">样例文本: "${Array.from(group.elements.texts)
              .slice(0, 3)
              .join('", "')}"</div>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  // 添加事件监听
  container.querySelectorAll("input, select").forEach((control) => {
    control.addEventListener("change", handleStyleChange);
  });
}

// 新增字体选项生成函数
function getFontOptions(currentFont) {
  const fonts = [
    "Arial",
    "Helvetica",
    "Verdana",
    "Times New Roman",
    "SimSun",
    "Microsoft YaHei",
    "JetBrains Mono",
    "HarmonyOS Sans SC",
  ];
  return fonts
    .map(
      (font) => `
    <option value="${font}" ${currentFont.includes(font) ? "selected" : ""}>
      ${font}
    </option>
  `
    )
    .join("");
}

// 添加颜色转换函数
function rgbToHex(rgb) {
  if (!rgb) return "#000000";

  // 处理不同格式的RGB值
  const values = rgb.match(/\d+/g) || [0, 0, 0];
  const hex = values
    .slice(0, 3) // 忽略透明度
    .map((x) => parseInt(x).toString(16).padStart(2, "0"))
    .join("");

  return `#${hex}`.toUpperCase();
}

async function handleStyleChange(e) {
  const control = e.target;
  const group = control.closest(".style-group");
  const selector = generateSelector(group);
  const prop = control.dataset.prop;
  const value =
    control.type === "number" ? `${control.value}px` : control.value;

  // 更新预览
  group.querySelector(".style-preview").style[prop] = value;

  // 发送到页面
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // chrome.tabs.sendMessage(tab.id, {
  //   action: "updateStyle",
  //   selector: selector,
  //   property: prop,
  //   value: value,
  // });
  try {
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "updateStyle",
          selector: selector,
          property: prop,
          value: value,
        },
        resolve
      );
    });
  } catch (error) {
    console.error("消息发送失败:", error);
  }
}

// 新增选择器生成函数
function generateSelector(group) {
  const uids = Array.from(group.querySelectorAll("[data-uid]"))
    .map((el) => `[data-uid="${el.dataset.uid}"]`)
    .join(",");
  return uids || "body";
}
// 添加颜色转换函数
function rgbToHex(rgb) {
  if (!rgb) return "#000000";

  // 处理不同格式的RGB值
  const values = rgb.match(/\d+/g) || [0, 0, 0];
  const hex = values
    .slice(0, 3) // 忽略透明度
    .map((x) => parseInt(x).toString(16).padStart(2, "0"))
    .join("");

  return `#${hex}`.toUpperCase();
}

// popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "dataUpdated") {
    // 从存储获取最新数据
    chrome.storage.local.get("elementData", (data) => {
      console.log("数据已更新data: ", data);
      renderElements(data.elementData);
    });
  }
  return true;
});

async function getCurrentTabData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return new Promise((resolve) => {
    chrome.storage.local.get(`elementData_${tab.id}`, (data) => {
      resolve(data[`elementData_${tab.id}`] || []);
    });
  });
}

// 修改所有数据获取逻辑
document.addEventListener("DOMContentLoaded", async () => {
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

function renderElements(data) {
  const container = document.querySelector("div");

  // 分类处理（新增分组逻辑）
  const categories = data.reduce(
    (acc, el) => {
      const key = el.attributes.id
        ? "id"
        : el.attributes.class
        ? "class"
        : el.attributes.style
        ? "style"
        : "other";
      acc[key].push(el);
      return acc;
    },
    { style: [], class: [], id: [], other: [] }
  );
  // console.log("categories: ", categories);

  // 生成分类HTML（修改后的结构）
  container.innerHTML = `
    <input type="text" class="search-box" placeholder="搜索属性或文本...">
    ${createCategorySection(
      "Class定义",
      groupElements(categories.class, "class"),
      "class"
    )}
    ${createCategorySection("ID元素", groupElements(categories.id, "id"), "id")}
    ${createCategorySection(
      "内联样式",
      groupElements(categories.style, "style"),
      "style"
    )}
    ${createCategorySection("其他元素", categories.other, "other")}
  `;
  // 实现实时过滤
  // 将事件监听移到此处（确保元素已存在）
  container.querySelector(".search-box").addEventListener("input", (e) => {
    const keyword = e.target.value.toLowerCase();
    document.querySelectorAll(".group-card").forEach((card) => {
      const matches = card.textContent.toLowerCase().includes(keyword);
      card.style.display = matches ? "block" : "none";
    });
  });

  // 修改点击事件监听逻辑
  container.addEventListener("click", (e) => {
    if (e.target.closest(".group-header")) {
      const header = e.target.closest(".group-header");
      const textList = header.nextElementSibling;

      // 更精确的初始状态判断
      const isCollapsed =
        !textList.style.maxHeight ||
        textList.style.maxHeight === "0px" ||
        parseFloat(getComputedStyle(textList).maxHeight) < 10;

      header.setAttribute("aria-expanded", isCollapsed);
      textList.style.maxHeight = isCollapsed
        ? `${textList.scrollHeight}px`
        : "0";
    }
  });

  // 在renderElements函数末尾添加
  container.addEventListener("change", (e) => {
    if (e.target.classList.contains("color-editor")) {
      const originalSelector = e.target.dataset.selector;
      const newColor = e.target.value;

      // 验证选择器有效性
      try {
        document.querySelector(originalSelector);
      } catch (error) {
        console.warn("无效选择器，使用备用方案:", originalSelector);
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateStyle",
          selector: originalSelector,
          property: "backgroundColor",
          value: newColor,
        });
      });
    }
  });
}

// 新增分组函数
function groupElements(elements, type) {
  const groups = new Map();

  elements.forEach((el) => {
    const key = el.attributes[type] || "未命名";
    console.log("key: ", key);
    // console.log("!groups.has(key): ", !groups.has(key));
    if (!groups.has(key)) {
      groups.set(key, {
        attribute: key,
        computedStyle: el.computedStyle,
        tag: el.tag,
        texts: new Set(), // 使用Set自动去重
      });
    }
    if (el.text) groups.get(key).texts.add(el.text);
  });

  // console.log("groups.values: ", groups.values());
  return Array.from(groups.values());
}

// 修改后的分类区块生成函数
function createCategorySection(title, items, type) {
  // console.log("title: ", title);
  // console.log("items: ", items);
  // console.log("type: ", type);
  if (items.length === 0) return "";

  return `
    <section class="category-section">
      <h3 class="category-title">${title} (${items.length})</h3>
      <div class="category-content">
        ${
          type === "other"
            ? items.map((el) => createSingleCard(el)).join("")
            : items.map((item) => createGroupCard(item, type)).join("")
        }
      </div>
    </section>
  `;
}

// 新增分组卡片生成函数
function createGroupCard(item, type) {
  // console.log("createGroupCard-item: ", item);
  // console.log("createGroupCard-type: ", type);
  return `
    <div class="group-card">
      <div class="group-header">
        <span class="type-tag">${type}:</span>
        <span class="attribute-value">${item.attribute}</span>
      </div>
      <div class="text-list">
        ${Array.from(item.texts)
          .map(
            (text) => `
          <div class="text-item" style="color: ${item.computedStyle.color}">${text}</div>
        `
          )
          .join("")}
      </div>

      <div class="style-info">
        <div class="color-box" style="background:${
          item.computedStyle.backgroundColor
        }"></div>
        <span>${item.computedStyle.color.replace("rgb", "RGB")}</span>
      </div>
      <div class="font-info"style="font-size: ${
        item.computedStyle.fontSize
      };font-family: ${item.computedStyle.fontFamily}.replace(/\"/g,'')">
        <span>${item.computedStyle.fontSize}</span>
        <span>${item.computedStyle.fontFamily.replace(/\"/g, "")}</span>
      </div>
    </div>
  `;
}

// 保留原有单元素卡片函数
function createSingleCard(item) {
  // console.log("item: ", item);
  return `
    <div class="group-card">
      <div class="element-header">
        <span class="tag">${item.tag}</span>
        ${
          item.attributes.id
            ? `<span class="id-tag">#${item.attributes.id}</span>`
            : ""
        }
      </div>
      ${
        item.text !== "无文本内容"
          ? `
        <div class="text-preview" style="color: ${item.computedStyle.color}">${item.text}</div>
      `
          : `
        <div class="empty-text">该元素无文本内容</div>
      `
      }
      
      <div class="style-info">
        <div class="color-box" style="background:${
          item.computedStyle.backgroundColor
        }"></div>
        <span>${item.computedStyle.color.replace("rgb", "RGB")}</span>
      </div>
      <div class="font-info" style="font-size: ${
        item.computedStyle.fontSize
      };font-family: ${item.computedStyle.fontFamily}.replace(/\"/g,'')">
        <span>${item.computedStyle.fontSize}</span>
        <span>${item.computedStyle.fontFamily.replace(/\"/g, "")}</span>
      </div>
    </div>
  `;
}

// 修改createGroupCard函数中的颜色展示部分
function createGroupCard(item, type) {
  return `
    <div class="group-card">
      <div class="style-info">
        <input type="color" 
               class="color-editor" 
               value="${rgbToHex(item.computedStyle.backgroundColor)}"
               data-selector="${getSelector(type, item.attribute)}">
        <span>${item.computedStyle.color}</span>
      </div>
    </div>
  `;
}

// 新增颜色转换函数
function rgbToHex(rgb) {
  if (!rgb) return "#000000";
  const values = rgb.match(/\d+/g) || [0, 0, 0];
  return (
    "#" +
    values
      .slice(0, 3)
      .map((x) => parseInt(x).toString(16).padStart(2, "0"))
      .join("")
  );
}

// 修改getSelector函数
function getSelector(type, value) {
  const sanitizeValue = (val) => {
    // 移除可能破坏选择器的特殊字符
    return CSS.escape(val.replace(/['"`]/g, "").split(";")[0].trim());
  };

  switch (type) {
    case "class":
      return `.${sanitizeValue(value)}`;
    case "id":
      return `#${sanitizeValue(value)}`;
    case "style":
      // 使用精确匹配单个样式属性
      const [prop, val] = value.split(":").map((s) => s.trim());
      return `[style*="${CSS.escape(prop)}: ${CSS.escape(val)}"]`;
    default:
      return "";
  }
}

# Chrome 扩展 AI 英语学习助手：架构设计与执行流程文档

本文档详细梳理基于 **Manifest V3** 的 Chrome 浏览器扩展（AI 英语学习与划词助手）的整体架构设计、配置文件解析以及各核心脚本的执行流程。

---

## 一、 项目架构与核心模块

本项目采用经典的前后端分离与事件驱动架构：

* **`manifest.json`**：扩展的全局配置文件与权限声明。
* **`content.js`**：内容脚本，负责监听网页划词并跨域操作。
* **`background.js`**：后台服务（Service Worker），负责与 DeepSeek API 交互、数据清洗和状态调度。
* **`sidepanel.html` / 渲染脚本**：侧边栏 UI 界面，负责展示解析结果、事件委托及语音朗读。

---

## 二、 核心配置文件解析 (`manifest.json`)

```json
{
  "manifest_version": 3,
  "name": "Rust Wasm Extension",
  "version": "1.0",
  "permissions": [
    "sidePanel",
    "activeTab",
    "scripting",
    "storage"
  ],
  "action": {
    "default_title": "点击打开侧边栏"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "all_frames": true
    }
  ]
}
```

* **`manifest_version: 3`**：采用最新的 Manifest V3 标准。
* **`permissions`**：申请了侧边栏 (`sidePanel`)、活动标签页 (`activeTab`)、动态脚本注入 (`scripting`) 及本地存储 (`storage`) 权限。
* **`background.service_worker`**：指定 `background.js` 为后台常驻（按需唤醒）服务核心。
* **`content_scripts`**：通过 `all_frames: true` 确保内容脚本能注入到页面内所有的跨域 `iframe` 中，突破同源限制。

---

## 三、 脚本执行流程详解

整个扩展的运行流程可以划分为以下四个核心阶段：

### 1. 初始化加载阶段
* 当浏览器启动或加载扩展时，`manifest.json` 生效。
* `background.js` 作为 Service Worker 注册并在后台等待事件唤醒。
* `content.js` 被自动注入到所有匹配的网页和子框架中。

### 2. 网页划词与捕捉阶段 (`content.js`)
* 用户在任意网页（或跨域 iframe 内）划取英文单词或句子。
* `content.js` 持续监听用户的交互，捕获选中的文本。
* 通过 `chrome.runtime.sendMessage` 将划取的文本内容发送给后台。

### 3. 后台 AI 处理与调度阶段 (`background.js`)
后台收到文本后，执行 `callDeepSeekAgent(userInput)` 核心异步流程：
* **模式判断**：通过文本长度与空格包含情况，判断是“单单词”还是“长句子/段落”。
* **AI 请求**：动态切换对应的 System Prompt，通过 `fetch` 请求 DeepSeek API。
* **数据清洗与排版**：对大模型返回的原始文本进行正则清洗、间距压缩、排版美化，拼装成带有一套精美内联样式的 HTML 片段。
* **持久化与广播**：
  * 将生成的 HTML 缓存至 `chrome.storage.local`（键名为 `lastTranslationResult`）。
  * 通过 `chrome.runtime.sendMessage` 向前端广播 `TRANSLATION_READY` 消息。

### 4. 前端交互与渲染阶段 (`sidepanel` 脚本)
侧边栏打开或接收到通知时，前端脚本按以下逻辑执行：
* **入口触发**：执行主函数 `main()`。
* **初始化缓存恢复**：通过 `chrome.storage.local.get` 主动读取最近一次的翻译结果，避免侧边栏打开时出现空白。
* **实时消息监听**：注册 `chrome.runtime.onMessage` 监听器。一旦收到后台的 `TRANSLATION_READY` 消息，立即更新 DOM：
  ```javascript
  textElement.innerHTML = message.resultHtml;
  ```
* **事件委托与交互激活**：
  * 利用事件委托监听容器内的 `.speak-btn` 点击事件。
  * 当用户点击“🔊 朗读”时，调用浏览器的 `window.speechSynthesis` 进行语音合成。

---

## 四、 核心技术亮点

* **事件驱动模型**：前端与后台均采用非阻塞的异步事件监听机制，确保高并发和低资源消耗。
* **优雅的降级与恢复**：通过 `chrome.storage.local` 实现状态持久化，无论用户何时打开侧边栏都能无缝恢复历史视图。
* **跨域 DOM 穿透**：借助 `all_frames: true` 配置，使得扩展在复杂的网页结构（如嵌套跨域 iframe）中依然能够自如工作。
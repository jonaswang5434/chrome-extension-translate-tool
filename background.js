// 设置点击扩展图标时打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 1. 监听侧边栏与后台建立长连接
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "side-panel-conn") {
        sidePanelPort = port;
        console.log("侧边栏已连接（开启）");

        // 当侧边栏被关闭时，这个监听器会瞬间触发
        port.onDisconnect.addListener(() => {
            sidePanelPort = null;
            console.log("侧边栏已断开（关闭）");
        });
    }
});

// 监听来自网页 (content.js) 的划词消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "USER_SELECTED_TEXT") {
        
        // 【核心大招】每次划词时，实时问浏览器：“现在到底有没有打开侧边栏？”
        // 这样无论 Service Worker 睡了多久、醒来几回，都能精准查到，绝不会假死！
        chrome.runtime.getContexts({
            contextTypes: ['SIDE_PANEL']
        }).then(contexts => {
            // 如果 contexts 数组为空，说明侧边栏没开，直接安全拦截（0 Token 消耗）
            if (!contexts || contexts.length === 0) {
                return;
            }

            // 侧边栏确实开着，才执行 DeepSeek AI 分析
            const selectedText = message.text;
            console.log("侧边栏处于开启状态，成功处理划词:", selectedText);
            callDeepSeekAgent(selectedText);
        }).catch(() => {
            // 容错处理
        });

        sendResponse({ ok: true });
    }
    return true; // 保持异步消息通道开启
});

function getStoredApiKey() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['deepseek_api_key'], (result) => {
            resolve(result.deepseek_api_key || "");
        });
    });
}

async function callDeepSeekAgent(userInput) {
    const apiKey = await getStoredApiKey();
    if (!apiKey) {
        console.error("未设置 DeepSeek API Key，请先在插件选项页配置。");
        return;
    }
    try {
        const isSingleWord = !userInput.trim().includes(' ') && userInput.trim().length < 30;

        let systemPrompt = "";
        if (isSingleWord) {
            systemPrompt = `你是一个专业的英语学习与翻译助手。用户划取的是一个【单词】。请严格按照以下格式返回，多义词请分别列出，注意不要输出多余空行：
音标：[标准音标]

词根词缀：[如有请列出，无则写“无”]

翻译：[简明综合中文翻译]

[词性. 详细中文释义1]
常见搭配：[常见词组及中文含义，如无则写“无”]
e.g. [英文例句] - [中文翻译]

[词性. 详细中文释义2]
常见搭配：[常见词组及中文含义，如无则写“无”]
e.g. [英文例句] - [中文翻译]`;

        } else {
            systemPrompt = `你是一个专业的高质量翻译助手。用户划取的是一个【句子或段落】。请严格按照以下格式返回：

翻译：[首先给出准确、流畅、地道的中文整体翻译]

重点词汇解析：
[音标1] 单词1: 中文含义
[音标2] 单词2: 中文含义
（注：如果没有生词或不常见单词，请完全省略“重点词汇解析：”整块内容，仅输出翻译）`;
        }

        const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `请处理：${userInput}` }
                ]
            })
        });

        const data = await response.json();
        const rawText = data.choices[0].message.content;

        let translation = "暂无翻译";
        let phonetic = "";
        let analysis = "";

        if (isSingleWord) {
            // 提取音标
            const phonMatch = rawText.match(/音标[：:]\s*(.*?)(?=\n|$)/);
            if (phonMatch) phonetic = phonMatch[1].trim();

            // 提取综合翻译
            const transMatch = rawText.match(/翻译[：:]\s*(.*?)(?=\n\n|\n[a-zA-Z\u4e00-\u9fa5]+\.|$)/s);
            if (transMatch) translation = transMatch[1].trim();

            // 提取并清洗详细解析文本
            let detailText = rawText;
            detailText = detailText.replace(/音标[：:].*?\n/g, '').replace(/翻译[：:].*?\n/g, '').trim();

            if (detailText) {
                analysis = detailText
                    // 清理连续 3 个以上的换行，压缩空白间距
                    .replace(/\n{3,}/g, '\n\n')
                    // 高亮词根词缀
                    .replace(/(词根词缀[：:]\s*.*)/g, '<div style="margin-bottom: 8px; color: #2b6cb0; font-weight: 600; border-bottom: 1px dashed #e2e8f0; padding-bottom: 4px;">$1</div>')
                    // 样式化常见搭配
                    .replace(/(常见搭配[：:]\s*.*)/g, '<div style="margin-top: 4px; padding-left: 4px; color: #4a5568;">$1</div>')
                    // 高亮例句，将英文和中文同排放置
                    .replace(/(e\.g\.\s*.*)/gi, '<div style="margin-top: 4px; margin-bottom: 8px; padding-left: 4px; color: #2b6cb0; font-size: 13px; line-height: 1.4;">$1</div>')
                    .replace(/\n/g, '<br>');
            }
        } else {
            // 长句/段落模式解析
            const parts = rawText.split(/重点词汇解析[：:]?/);
            
            // 提取整句翻译
            translation = parts[0].replace(/翻译[：:]\s*/, '').trim();

            // 提取重点词汇，每行格式：[音标] 单词: 中文含义
            if (parts.length > 1 && parts[1].trim()) {
                const wordsList = parts[1].trim().split('\n').filter(line => line.trim() !== '');
                analysis = wordsList.map(line => {
                    return `<div style="padding: 3px 0; color: #4a5568; font-size: 13px;">${line.trim()}</div>`;
                }).join('');
            }
        }

        const safeText = userInput
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        // 构造卡片式 HTML 输出
        const htmlContent = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #2d3748; padding: 12px;">
                <!-- 顶部：原文与朗读按钮 -->
                <div style="display: flex; align-items: center; justify-content: space-between; background: #f7fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 10px;">
                    <div>
                        <span style="font-size: 11px; color: #718096; display: block; margin-bottom: 2px;">原文</span>
                        <span style="font-size: ${isSingleWord ? '16px' : '14px'}; font-weight: 700; color: #1a202c; word-break: break-all;">${userInput}</span>
                        ${phonetic ? `<span style="margin-left: 8px; font-size: 13px; color: #4a5568;">${phonetic}</span>` : ''}
                    </div>
                    <button class="speak-btn" data-text="${safeText}" 
                            style="cursor: pointer; background: #3182ce; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: 8px;" 
                            title="点击朗读">
                        🔊 朗读
                    </button>
                </div>

                <!-- 中部：翻译区块 -->
                <div style="margin-bottom: ${analysis ? '10px' : '0'}; padding: 8px 12px; background: #ebf8ff; border-left: 4px solid #3182ce; border-radius: 0 8px 8px 0;">
                    <div style="font-size: 11px; font-weight: 600; color: #2b6cb0; margin-bottom: 2px;">中文翻译</div>
                    <div style="font-size: 14px; font-weight: 600; color: #2c5282; white-space: pre-wrap;">${translation}</div>
                </div>

                <!-- 底部：详细解析区块（单词多义解析 或 长句重点词汇） -->
                ${analysis ? `
                <div style="padding: 10px 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <div style="font-size: 11px; font-weight: 600; color: #718096; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">${isSingleWord ? '详细解析' : '重点词汇解析'}</div>
                    <div style="color: #4a5568; font-size: 13px;">${analysis}</div>
                </div>
                ` : ''}
            </div>
        `;

        chrome.storage.local.set({ lastTranslationResult: htmlContent });

        chrome.runtime.sendMessage({
            type: "TRANSLATION_READY",
            resultHtml: htmlContent
        }).catch(() => {});

    } catch (err) {
        console.error("后台调用 DeepSeek 失败:", err);
    }
}
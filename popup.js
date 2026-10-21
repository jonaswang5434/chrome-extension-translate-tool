// 独立的朗读执行函数
function playAudio(text) {
    if (!text) {
        console.warn("没有需要朗读的文本");
        return;
    }

    if (!('speechSynthesis' in window)) {
        alert("当前浏览器不支持语音合成功能");
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;

    utterance.onerror = (event) => {
        console.error("语音朗读出错:", event);
    };

    window.speechSynthesis.speak(utterance);
    console.log("正在朗读:", text);
}
// 1. 在侧边栏页面加载时立刻与后台建立长连接（用于后台判定侧边栏开闭状态）
chrome.runtime.connect({ name: "side-panel-conn" });

async function main() {
    const textElement = document.getElementById('output');
    const queryForm = document.getElementById('vocabulary-query-form');
    const startDateInput = document.getElementById('vocabulary-start-date');
    const queryResults = document.getElementById('vocabulary-query-results');

    // 核心：使用事件委托（Event Delegation），监听整个侧边栏容器内对朗读按钮的点击
    if (textElement) {
        textElement.addEventListener('click', (event) => {
            const btn = event.target.closest('.speak-btn');
            if (btn) playAudio(btn.getAttribute('data-text'));
        });
    }

    queryForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        queryResults.textContent = "Loading vocabulary...";

        const create_date = new Date(`${startDateInput.value}T00:00:00`).toISOString();
        const queryUrl = new URL("http://127.0.0.1:8000/vocabulary");
        queryUrl.searchParams.set("create_date", create_date);

        try {
            const response = await fetch(queryUrl);
            if (!response.ok) {
                throw new Error(`API request failed: HTTP ${response.status}`);
            }

            const entries = await response.json();
            if (!Array.isArray(entries)) {
                throw new Error("The API returned an invalid response.");
            }

            queryResults.replaceChildren();
            if (entries.length === 0) {
                queryResults.textContent = "No vocabulary found from this date.";
                return;
            }

            for (const entry of entries) {
                const card = document.createElement('article');
                card.style.cssText = "padding: 8px; margin-bottom: 8px; border: 1px solid #e2e8f0; border-radius: 6px;";

                const word = document.createElement('strong');
                word.textContent = entry.vocabulary;
                card.append(word);

                const createdAt = document.createElement('small');
                createdAt.textContent = ` — ${new Date(entry.create_date).toLocaleString()}`;
                card.append(createdAt);

                const explanation = document.createElement('p');
                explanation.textContent = entry.explanation || "No explanation saved.";
                explanation.style.cssText = "margin: 6px 0 0; white-space: pre-wrap;";
                card.append(explanation);

                queryResults.append(card);
            }
        } catch (error) {
            console.error("Vocabulary query failed:", error);
            queryResults.textContent = `Could not load vocabulary: ${error.message}`;
        }
    });

    // 打开侧边栏时加载缓存的翻译结果
    chrome.storage.local.get(['lastTranslationResult'], (data) => {
        if (data.lastTranslationResult) {
            textElement.innerHTML = data.lastTranslationResult;
        } else {
            textElement.textContent = "✨ 就绪：请在网页上划词...";
        }
    });

    // 实时监听后台推送的新翻译结果
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "TRANSLATION_READY") {
            textElement.innerHTML = message.resultHtml;
        }
    });
}

main();
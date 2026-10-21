
// ==================== 语音朗读模块 ====================

// 免费词典 API，无需 API Key
const DICTIONARY_API =
    "https://api.dictionaryapi.dev/api/v2/entries/en/";

// 缓存单词对应的音频地址或 null（未找到音频）
const pronunciationCache = new Map();

// 当前正在播放的音频
let currentAudio = null;

// 用于防止较早的请求覆盖较新的播放操作
let playbackId = 0;


/**
 * 从词典 API 获取单词发音音频。
 * 优先美式英语音频，其次使用其他可用音频。
 */
async function getDictionaryAudio(word) {
    const key = word.trim().toLowerCase();

    if (!key) {
        return null;
    }

    if (pronunciationCache.has(key)) {
        return pronunciationCache.get(key);
    }

    try {
        const response = await fetch(
            DICTIONARY_API + encodeURIComponent(key)
        );

        if (!response.ok) {
            pronunciationCache.set(key, null);
            return null;
        }

        const entries = await response.json();

        if (!Array.isArray(entries)) {
            pronunciationCache.set(key, null);
            return null;
        }

        const phonetics = entries.flatMap(
            entry => entry.phonetics || []
        );

        // 过滤掉空音频地址
        const audioItems = phonetics
            .filter(item => typeof item.audio === "string" && item.audio.trim())
            .map(item => ({
                ...item,
                audio: item.audio.startsWith("//")
                    ? "https:" + item.audio
                    : item.audio
            }))
            .filter(item => /^https:\/\//i.test(item.audio));

        // 优先匹配常见的美式英语音频命名
        const usAudio = audioItems.find(item =>
            /(?:^|[-_])us(?:[-_.]|$)/i.test(
                new URL(item.audio).pathname
            )
        );

        // 没有明确的美式音频时，使用词典提供的其他音频
        const selected = usAudio || audioItems[0] || null;
        const audioUrl = selected ? selected.audio : null;

        pronunciationCache.set(key, audioUrl);

        return audioUrl;

    } catch (error) {
        console.warn("词典音频查询失败:", word, error);

        // 网络异常不缓存，允许下次重新查询
        return null;
    }
}


/**
 * 备用方案：使用浏览器语音合成。
 */
function speakWithBrowser(text) {
    return new Promise((resolve, reject) => {
        if (!("speechSynthesis" in window)) {
            reject(new Error("浏览器不支持语音合成"));
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 0.9;

        utterance.onend = () => resolve();

        utterance.onerror = event => {
            reject(new Error(event.error || "语音合成失败"));
        };

        window.speechSynthesis.speak(utterance);
    });
}


/**
 * 停止当前播放。
 */
function stopCurrentAudio() {
    window.speechSynthesis.cancel();

    if (currentAudio) {
        currentAudio.pause();
        currentAudio.removeAttribute("src");
        currentAudio.load();
        currentAudio = null;
    }
}


/**
 * 朗读入口：
 * 1. 优先播放词典原声音频
 * 2. 失败时回退到浏览器语音合成
 */
async function playAudio(text) {
    if (!text || !text.trim()) {
        console.warn("没有需要朗读的文本");
        return;
    }

    const word = text.trim();
    const thisPlaybackId = ++playbackId;

    stopCurrentAudio();

    try {
        const audioUrl = await getDictionaryAudio(word);

        // 如果用户在等待期间点击了其他朗读按钮，放弃旧请求
        if (thisPlaybackId !== playbackId) {
            return;
        }

        if (audioUrl) {
            const audio = new Audio(audioUrl);
            currentAudio = audio;
            audio.playbackRate = 1.0;
            audio.preload = "auto";

            try {
                await audio.play();
                console.log("正在播放词典音频:", word);
                return;
            } catch (error) {
                console.warn(
                    "词典音频播放失败，尝试浏览器语音:",
                    error
                );

                if (thisPlaybackId !== playbackId) {
                    return;
                }

                if (currentAudio === audio) {
                    currentAudio = null;
                }
            }
        }

        // 没有词典音频或音频播放失败时使用浏览器语音
        if (thisPlaybackId === playbackId) {
            await speakWithBrowser(word);
            console.log("正在使用浏览器语音:", word);
        }

    } catch (error) {
        if (thisPlaybackId === playbackId) {
            console.error("朗读失败:", error);
        }
    }
}


// ==================== 侧边栏初始化 ====================

// 建立与后台的长连接
chrome.runtime.connect({
    name: "side-panel-conn"
});


async function main() {
    const textElement = document.getElementById("output");
    const queryForm = document.getElementById("vocabulary-query-form");
    const startDateInput = document.getElementById("vocabulary-start-date");
    const queryResults = document.getElementById("vocabulary-query-results");

    if (!textElement || !queryForm || !startDateInput || !queryResults) {
        console.error("页面缺少必要的 HTML 元素，请检查侧边栏 HTML 文件。");
        return;
    }


    // ==================== 朗读按钮事件委托 ====================

    document.addEventListener("click", event => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button = event.target.closest(".speak-btn");

        if (!button) {
            return;
        }

        event.preventDefault();

        const text = button.getAttribute("data-text");
        playAudio(text);
    });


    // ==================== 按日期查询词汇 ====================

    queryForm.addEventListener("submit", async event => {
        event.preventDefault();

        queryResults.textContent = "Loading vocabulary...";

        try {
            if (!startDateInput.value) {
                queryResults.textContent = "Please select a date.";
                return;
            }

            const createDate = new Date(
                `${startDateInput.value}T00:00:00`
            ).toISOString();

            const queryUrl = new URL(
                "http://127.0.0.1:8000/vocabulary"
            );

            queryUrl.searchParams.set("create_date", createDate);

            const response = await fetch(queryUrl);

            if (!response.ok) {
                throw new Error(
                    `API request failed: HTTP ${response.status}`
                );
            }

            const entries = await response.json();

            if (!Array.isArray(entries)) {
                throw new Error("The API returned an invalid response.");
            }

            queryResults.replaceChildren();

            if (entries.length === 0) {
                queryResults.textContent =
                    "No vocabulary found from this date.";
                return;
            }

            for (const entry of entries) {
                const card = document.createElement("article");

                card.style.cssText = `
                    padding: 8px;
                    margin-bottom: 8px;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                `;

                // 单词与朗读按钮
                const header = document.createElement("div");

                header.style.cssText = `
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 8px;
                `;

                const word = document.createElement("strong");
                word.textContent = entry.vocabulary || "";
                header.appendChild(word);

                const speakButton = document.createElement("button");

                speakButton.type = "button";
                speakButton.className = "speak-btn";
                speakButton.textContent = "🔊 Read aloud";
                speakButton.setAttribute(
                    "data-text",
                    entry.vocabulary || ""
                );

                speakButton.style.cssText = `
                    padding: 4px 8px;
                    border: 1px solid #cbd5e1;
                    border-radius: 4px;
                    background: #f8fafc;
                    cursor: pointer;
                    font-size: 12px;
                `;

                header.appendChild(speakButton);
                card.appendChild(header);

                // 创建时间
                const createdAt = document.createElement("small");

                createdAt.textContent =
                    `Created: ${new Date(entry.create_date).toLocaleString()}`;

                createdAt.style.cssText = `
                    display: block;
                    margin-top: 4px;
                    color: #64748b;
                `;

                card.appendChild(createdAt);

                // 解释
                const explanation = document.createElement("p");

                explanation.textContent =
                    entry.explanation || "No explanation saved.";

                explanation.style.cssText = `
                    margin: 6px 0 0;
                    white-space: pre-wrap;
                `;

                card.appendChild(explanation);

                queryResults.appendChild(card);
            }

        } catch (error) {
            console.error("Vocabulary query failed:", error);

            queryResults.textContent =
                `Could not load vocabulary: ${error.message}`;
        }
    });


    // ==================== 加载缓存的翻译结果 ====================

    chrome.storage.local.get(
        ["lastTranslationResult"],
        data => {
            if (data.lastTranslationResult) {
                textElement.innerHTML = data.lastTranslationResult;
            } else {
                textElement.textContent =
                    "✨ 就绪：请在网页上划词...";
            }
        }
    );


    // ==================== 接收后台翻译消息 ====================

    chrome.runtime.onMessage.addListener(message => {
        if (message.type === "TRANSLATION_READY") {
            textElement.innerHTML = message.resultHtml;
        }
    });
}


main();

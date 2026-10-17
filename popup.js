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

async function main() {
    const textElement = document.getElementById('output');

    // 核心：使用事件委托（Event Delegation），监听整个侧边栏容器内对朗读按钮的点击
    textElement.addEventListener('click', (event) => {
        const btn = event.target.closest('.speak-btn');
        if (btn) {
            const textToSpeak = btn.getAttribute('data-text');
            playAudio(textToSpeak);
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
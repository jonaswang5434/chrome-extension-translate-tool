// content.js - 划词监听脚本

let timer = null;

document.addEventListener('mouseup', () => {
    clearTimeout(timer);

    // 200ms 防抖：避免用户快速拖选时频繁触发
    timer = setTimeout(() => {
        // 1. 【严密防范】如果 chrome、chrome.runtime 或 sendMessage 方法不存在，说明扩展上下文已被销毁，静默退出
        if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
            return;
        }

        const selectedText = window.getSelection()?.toString().trim();

        if (selectedText && selectedText.length > 0) {
            try {
                // 2. 双重 Try-Catch 机制，兜底极罕见的突发断连
                const sendMessagePromise = chrome.runtime.sendMessage({
                    type: "USER_SELECTED_TEXT",
                    text: selectedText
                });

                if (sendMessagePromise && typeof sendMessagePromise.catch === 'function') {
                    sendMessagePromise.catch(() => {
                        // 静默处理侧边栏关闭时的正常断开
                    });
                }
            } catch (e) {
                // 静默捕获 Extension context invalidated 等任何上下文失效异常
            }
        }
    }, 200);
});
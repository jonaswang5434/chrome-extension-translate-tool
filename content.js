// content.js - 划词监听脚本

let timer = null;

document.addEventListener('mouseup', () => {
    clearTimeout(timer);

    // 200ms 防抖：避免用户快速拖选时频繁触发
    timer = setTimeout(() => {
        // 1. 上下文安全检查：如果插件被刷新，静默退出
        if (!chrome.runtime?.id) {
            return;
        }

        const selectedText = window.getSelection()?.toString().trim();

        if (selectedText && selectedText.length > 0) {
            try {
                // 2. 单向通知后台，不做 Promise / Response 回调处理，彻底消除 console 报错
                chrome.runtime.sendMessage({
                    type: "USER_SELECTED_TEXT",
                    text: selectedText
                }).catch(() => {
                    // 彻底静默：侧边栏未打开或断连时均不弹报错
                });
            } catch (e) {
                // 捕获 Extension context invalidated 等异常
            }
        }
    }, 200);
});
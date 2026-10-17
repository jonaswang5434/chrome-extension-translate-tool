// 监听网页上的鼠标松开事件（适合处理划词或点击选中）
document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection()?.toString().trim();

    // 如果选中了内容
    if (selectedText) {
        console.log("捕获到网页文字:", selectedText);

        // The service worker stores the selection so it is available when the panel opens.
        chrome.runtime.sendMessage({
            type: "SEND_TEXT_TO_RUST",
            text: selectedText
        }).then((response) => {
            if (!response?.ok) {
                console.error("无法保存网页选中文字:", response?.error);
            }
        }).catch((error) => {
            console.error("发送选中文字失败:", error);
        });
    }
});
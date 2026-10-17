// options.js

document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const toggleBtn = document.getElementById('toggleVisibleBtn');
    const saveBtn = document.getElementById('saveBtn');
    const statusMsg = document.getElementById('statusMsg');

    // 1. 页面加载时自动回显已保存的 API Key
    chrome.storage.sync.get(['deepseek_api_key'], (data) => {
        if (data.deepseek_api_key) {
            apiKeyInput.value = data.deepseek_api_key;
        }
    });

    // 2. 点击按钮：切换密文 / 明文显示
    toggleBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleBtn.textContent = '🙈 隐藏';
        } else {
            apiKeyInput.type = 'password';
            toggleBtn.textContent = '👁️ 显示';
        }
    });

    // 3. 点击按钮：保存 API Key 到 chrome.storage.sync
    saveBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            alert("请输入有效 API Key！");
            return;
        }

        chrome.storage.sync.set({ deepseek_api_key: key }, () => {
            statusMsg.textContent = '✅ 保存成功！';
            setTimeout(() => {
                statusMsg.textContent = '';
            }, 2000);
        });
    });
});
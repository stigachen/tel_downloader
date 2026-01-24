// 添加到文件开头
function initI18n() {
    // 翻译所有带有 data-i18n 属性的元素
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = chrome.i18n.getMessage(key);
        if (translation) {
            if (element.tagName === 'INPUT' && element.type === 'placeholder') {
                element.placeholder = translation;
            } else if (element.tagName === 'OPTION') {
                element.text = translation;
            } else {
                element.textContent = translation;
            }
        }
    });
}

// 加载视频列表
async function loadVideoList() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url.includes('web.telegram.org')) {
        const videoList = document.getElementById('video-list');
        videoList.innerHTML = `<div class="empty-message">${chrome.i18n.getMessage("useTelegramWeb")}</div>`;
        return;
    }

    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: "getVideos" });
        // console.log('Response from content script:', response);

        if (!response) {
            const videoList = document.getElementById('video-list');
            videoList.innerHTML = '<div class="empty-message">无法与页面通信，请刷新页面后重试</div>';
            return;
        }

        if (!response.videos || response.videos.length === 0) {
            const videoList = document.getElementById('video-list');
            videoList.innerHTML = '<div class="empty-message">未找到视频。请确保：\n1. 群聊中有视频消息\n2. 视频已加载完成\n3. 视频在当前可见区域内</div>';
            return;
        }

        displayVideos(response.videos, tab.id);
    } catch (error) {
        console.error('Error:', error);
        const videoList = document.getElementById('video-list');
        videoList.innerHTML = '<div class="empty-message">获取视频失败：' + error.message + '</div>';
    }
}

// 添加重试函数
async function tryConnectToContentScript(tab, maxRetries = 3, delay = 500) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            // console.log(`Attempt ${i + 1} to connect to content script`);
            const response = await chrome.tabs.sendMessage(tab.id, { action: "ping" });
            if (response && response.pong) {
                // console.log('Successfully connected to content script');
                return true;
            }
        } catch (error) {
            // console.log(`Attempt ${i + 1} failed:`, error);
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    return false;
}

// 添加一个调试函数
function debugLog(...args) {
    // 同时输出到 popup 的控制台和主窗口的控制台
    console.log(...args);
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "debugLog",
                message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
            });
        }
    });
}

// 更新下载进度
async function updateDownloadProgress() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            throw new Error('No active tab found');
        }

        if (!tab.url.includes('web.telegram.org')) {
            const downloadList = document.getElementById('download-list');
            downloadList.innerHTML = `<div class="empty-message">${chrome.i18n.getMessage("useTelegramWeb")}</div>`;
            return;
        }

        // 尝试连接到 content script
        const connected = await tryConnectToContentScript(tab);
        if (!connected) {
            throw new Error('Could not establish connection. Receiving end does not exist.');
        }

        // 检查下载列表元素
        const downloadList = document.getElementById('download-list');
        if (!downloadList) {
            throw new Error('Download list element not found');
        }

        const response = await chrome.tabs.sendMessage(tab.id, { action: "getDownloadStates" });
        downloadList.innerHTML = '';

        if (!response) {
            downloadList.innerHTML = `<div class="empty-message">${chrome.i18n.getMessage("communicationError")}</div>`;
            return;
        }

        if (!response.states || response.states.length === 0) {
            downloadList.innerHTML = `<div class="empty-message">${chrome.i18n.getMessage("noDownloads")}</div>`;
            return;
        }

        // 打印接收到的状态信息
        // console.log('Received download states in popup:', {
        //     hasResponse: !!response,
        //     states: response?.states?.map(state => ({
        //         fileName: state.fileName,
        //         progress: state.progress,
        //         hasThumbnail: !!state.thumbnail,
        //         thumbnailUrl: state.thumbnail
        //     }))
        // });

        response.states.forEach(state => {
            const item = document.createElement('div');
            item.className = 'download-item';

            // 使用固定的视频图标和文件名
            const thumbnail = document.createElement('div');
            thumbnail.className = 'download-thumbnail';
            thumbnail.innerHTML = `
                <div style="
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background-color: #f0f0f0;
                    border-radius: 4px;
                    gap: 4px;
                ">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#666">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                    </svg>
                    <div style="
                        font-size: 10px;
                        color: #666;
                        max-width: 90%;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        text-align: center;
                    ">${state.fileName}</div>
                </div>
            `;

            const info = document.createElement('div');
            info.className = 'download-info';

            const progressBar = document.createElement('div');
            progressBar.className = 'download-progress';
            progressBar.innerHTML = `<div class="progress-bar" style="width: ${state.progress}%"></div>`;

            const status = document.createElement('div');
            status.className = 'download-status';

            if (state.status === 'error') {
                // 创建状态和重试按钮的容器
                const statusContainer = document.createElement('div');
                statusContainer.style.display = 'flex';
                statusContainer.style.justifyContent = 'space-between';
                statusContainer.style.alignItems = 'center';

                // 错误状态文本
                const errorText = document.createElement('span');
                errorText.textContent = chrome.i18n.getMessage("downloadFailed");
                errorText.style.color = '#ff4444';

                // 重试按钮
                const retryButton = document.createElement('button');
                retryButton.textContent = chrome.i18n.getMessage("retry");
                retryButton.style.cssText = `
                    background: #2196F3;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 4px 8px;
                    font-size: 12px;
                    cursor: pointer;
                    margin-left: 8px;
                `;

                // 添加重试功能
                retryButton.onclick = async () => {
                    try {
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (!tab) return;

                        retryButton.disabled = true;
                        retryButton.style.opacity = '0.7';
                        retryButton.textContent = chrome.i18n.getMessage("retrying");

                        await chrome.tabs.sendMessage(tab.id, {
                            action: "downloadVideo",
                            url: state.videoSrc
                        });

                        setTimeout(() => {
                            retryButton.disabled = false;
                            retryButton.style.opacity = '1';
                            retryButton.textContent = chrome.i18n.getMessage("retry");
                        }, 1000);
                    } catch (error) {
                        console.error('Retry failed:', error);
                        retryButton.disabled = false;
                        retryButton.style.opacity = '1';
                        retryButton.textContent = chrome.i18n.getMessage("retry");
                    }
                };

                statusContainer.appendChild(errorText);
                statusContainer.appendChild(retryButton);
                status.appendChild(statusContainer);
            } else if (state.status === 'starting') {
                status.textContent = chrome.i18n.getMessage("preparingDownload");
            } else {
                // 恢复显示进度百分比
                const progressText = `${state.progress.toFixed(1)}% - `;
                const timeText = chrome.i18n.getMessage("estimatedTimeRemaining", [state.timeRemaining || chrome.i18n.getMessage("calculating")]);
                status.textContent = progressText + timeText;
            }

            info.appendChild(progressBar);
            info.appendChild(status);

            item.appendChild(thumbnail);
            item.appendChild(info);
            downloadList.appendChild(item);
        });
    } catch (error) {
        console.error('Error updating download progress:', error);
        const downloadList = document.getElementById('download-list');
        if (downloadList) {
            downloadList.innerHTML = `<div class="empty-message">${chrome.i18n.getMessage("updateError", [error.message])}</div>`;
        }
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', function () {
    // 初始化国际化
    initI18n();

    // 加载视频列表
    // loadVideoList();

    // 初始化下载进度
    updateDownloadProgress();

    // 添加 tab 切换功能
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            // 切换按钮状态
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // 切换面板
            document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
            document.getElementById(button.dataset.tab).classList.add('active');

            // 如果切换到下载进度页，立即更新进度
            if (button.dataset.tab === 'downloads') {
                updateDownloadProgress();
            }
        });
    });

    // 定期更新下载进度
    setInterval(function () {
        if (document.querySelector('[data-tab="downloads"]').classList.contains('active')) {
            updateDownloadProgress();
        }
    }, 1000);
});

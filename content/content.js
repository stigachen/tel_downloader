// 版本检测功能（仅用于日志）
function detectTelegramVersion() {
    // const path = window.location.pathname;
    // console.log('Current path:', path);

    // if (path.includes('/k') || path === '/k' || path.startsWith('/k/')) {
    //     console.log('Running on Telegram Web K version');
    //     return 'k';
    // } else if (path.includes('/a') || path === '/a' || path.startsWith('/a/')) {
    //     console.log('Running on Telegram Web A version');
    //     return 'a';
    // }

    // console.log('Running on Telegram Web (version unknown, using universal selectors)');
    return 'unknown';
}

// 检测当前版本（仅用于日志）
const currentVersion = detectTelegramVersion();


// 添加下载按钮的样式
const style = document.createElement('style');
style.textContent = `
    .telegram-video-download-btn {
        position: absolute;
        right: 10px;
        bottom: 10px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border: none;
        border-radius: 4px;
        padding: 5px 10px;
        cursor: pointer;
        z-index: 99999;
        display: none;
        font-size: 12px;
        font-family: Arial, sans-serif;
        min-width: 120px;
        text-align: center;
        white-space: nowrap;
        pointer-events: auto;
    }
    .telegram-video-download-btn.downloading {
        background: rgba(0, 0, 0, 0.8);
        cursor: default;
    }
    .telegram-video-download-btn .progress {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 2px;
        background: #2196F3;
        transition: width 0.3s;
    }
    *:hover > .telegram-video-download-btn {
        display: block;
    }
    .telegram-video-download-btn:not(.downloading):hover {
        background: rgba(0, 0, 0, 0.9);
    }
`;
document.head.appendChild(style);

// 注入下载函数脚本
const downloadScript = document.createElement('script');
downloadScript.src = chrome.runtime.getURL('content/web_telegram_inject_for_download.js');
(document.head || document.documentElement).appendChild(downloadScript);

// 注入下载助手脚本
const helperScript = document.createElement('script');
helperScript.src = chrome.runtime.getURL('content/telegram_download_helper.js');
(document.head || document.documentElement).appendChild(helperScript);

// 添加下载状态检查函数
function updateButtonState(btn, videoSrc) {
    // 从window.downloadStates获取状态
    const state = window.downloadStates?.get(videoSrc);
    if (!state) return;

    // 更新按钮状态
    btn.disabled = state.inProgress;
    btn.classList.toggle('downloading', state.inProgress);

    // 更新进度条
    let progress = btn.querySelector('.progress');
    if (state.inProgress && !progress) {
        progress = document.createElement('div');
        progress.className = 'progress';
        btn.appendChild(progress);
    }

    if (progress) {
        progress.style.width = `${state.progress}%`;
    }

    // 更新按钮文本
    if (state.status === 'error') {
        btn.textContent = chrome.i18n.getMessage("downloadFailed");
        btn.disabled = false;
        btn.classList.remove('downloading');
        progress?.remove();
    } else if (state.status === 'completed') {
        btn.textContent = chrome.i18n.getMessage("downloadVideo");
        btn.disabled = false;
        btn.classList.remove('downloading');
        progress?.remove();
    } else if (state.inProgress) {
        if (state.status === 'starting') {
            btn.textContent = chrome.i18n.getMessage("preparingDownload");
        } else {
            btn.textContent = chrome.i18n.getMessage("downloadInProgress", [
                state.progress.toFixed(1),
                state.timeRemaining
            ]);
        }
    }

    // 添加队列状态的处理
    if (state.status === 'queued') {
        btn.textContent = chrome.i18n.getMessage("downloadQueued");
        btn.disabled = true;
        btn.classList.add('downloading');
        if (progress) {
            progress.style.width = '0%';
        }
    }
}

// 修改事件监听器
window.addEventListener('message', (event) => {
    if (event.data.type === 'DOWNLOAD_STATE_UPDATE') {
        const btn = document.querySelector(`button[data-video-src="${event.data.videoSrc}"]`);
        if (btn) {
            updateButtonState(btn, event.data.videoSrc);
        }
    }
});

// 监听下载进度消息
window.addEventListener('message', (event) => {
    if (event.data.type === 'DOWNLOAD_PROGRESS') {
        const btn = document.querySelector(`button[data-video-src="${event.data.videoSrc}"]`);
        // console.log('Received progress update:', {
        //     videoSrc: event.data.videoSrc,
        //     progress: event.data.progress,
        //     buttonFound: !!btn,
        //     eventData: event.data
        // });

        if (!btn) return;

        // 确保进度条存在
        let progress = btn.querySelector('.progress');
        if (!progress && event.data.progress > 0) {
            progress = document.createElement('div');
            progress.className = 'progress';
            btn.appendChild(progress);
        }

        // 更新进度条和文本
        if (progress) {
            progress.style.width = `${event.data.progress}%`;
        }

        // 更新按钮状态和文本
        if (event.data.error) {
            btn.textContent = chrome.i18n.getMessage("downloadFailed");
            btn.disabled = false;
            btn.classList.remove('downloading');
            progress?.remove();
        } else if (event.data.completed) {
            btn.textContent = chrome.i18n.getMessage("downloadVideo");
            btn.disabled = false;
            btn.classList.remove('downloading');
            progress?.remove();
        } else {
            btn.classList.add('downloading');
            btn.disabled = true;
            if (event.data.progress === 0) {
                btn.textContent = chrome.i18n.getMessage("preparingDownload");
            } else {
                btn.textContent = chrome.i18n.getMessage("downloadInProgress", [
                    event.data.progress.toFixed(1),
                    event.data.timeRemaining
                ]);
            }
        }
    }
});

// 添加一个Map来存储视频URL和其对应的缩略图URL
const videoThumbnails = new Map();

// 修改 addDownloadButton 函数
function addDownloadButton(videoElement) {
    // 确保视频元素有效，支持两种URL格式
    if (!videoElement || !videoElement.src ||
        (!videoElement.src.includes('stream') && !videoElement.src.includes('/progressive/document'))) {
        return;
    }

    // 获取视频的包装元素
    const wrapper = videoElement.parentElement;
    if (!wrapper) return;

    // 检查是否已经添加过下载按钮
    if (wrapper.querySelector('.telegram-video-download-btn')) return;

    // 获取消息容器和缩略图（两个版本都使用相同的选择器）
    const messageContainer = videoElement.closest('.Message') || videoElement.closest('[data-message-id]');

    if (messageContainer) {
        const thumbnailImg = messageContainer.querySelector('img.thumbnail') ||
            messageContainer.querySelector('img.media-photo') ||
            messageContainer.querySelector('img[class*="preview"]');

        if (thumbnailImg?.src) {
            // 通过消息传递缩略图信息
            window.postMessage({
                type: 'STORE_THUMBNAIL',
                videoSrc: videoElement.src,
                thumbnailSrc: thumbnailImg.src
            }, '*');
        }
    }


    // 确保包装元素有相对定位
    if (getComputedStyle(wrapper).position === 'static') {
        wrapper.style.position = 'relative';
    }

    // 创建下载按钮
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'telegram-video-download-btn';
    downloadBtn.dataset.videoSrc = videoElement.src;

    // 创建进度条元素（预先创建但不显示）
    const progress = document.createElement('div');
    progress.className = 'progress';
    downloadBtn.appendChild(progress);

    // 获取当前下载状态
    const currentState = window.downloadStates?.get(videoElement.src);
    // console.log('Initial download state:', {
    //     videoSrc: videoElement.src,
    //     state: currentState,
    //     hasDownloadStates: !!window.downloadStates,
    //     statesSize: window.downloadStates?.size
    // });

    // 根据当前状态初始化按钮
    if (currentState) {
        // 直接使用现有状态的进度和文本
        if (currentState.inProgress) {
            // console.log('Applying in-progress state:', currentState);
            downloadBtn.classList.add('downloading');
            downloadBtn.disabled = true;
            progress.style.width = `${currentState.progress}%`;

            // 使用国际化消息
            downloadBtn.textContent = currentState.progress > 0
                ? chrome.i18n.getMessage("downloadInProgress", [
                    currentState.progress.toFixed(1),
                    currentState.timeRemaining
                ])
                : chrome.i18n.getMessage("preparingDownload");
        } else if (currentState.status === 'error') {
            // console.log('Applying error state:', currentState);
            downloadBtn.textContent = chrome.i18n.getMessage("downloadFailed");
            progress.style.width = '0%';
        } else if (currentState.status === 'completed') {
            // console.log('Applying completed state:', currentState);
            downloadBtn.textContent = chrome.i18n.getMessage("downloadVideo");
            progress.style.width = '0%';
        } else {
            // console.log('Applying default state');
            downloadBtn.textContent = chrome.i18n.getMessage("downloadVideo");
            progress.style.width = '0%';
        }
    } else {
        // console.log('No existing state, applying default');
        downloadBtn.textContent = chrome.i18n.getMessage("downloadVideo");
        progress.style.width = '0%';
    }

    downloadBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            // 检查当前状态
            const state = window.downloadStates?.get(videoElement.src);
            if (state && state.inProgress) {
                // console.log('Download already in progress');
                return;
            }

            // 打印缩略图信息
            // console.log('Starting download with thumbnail:', {
            //     videoSrc: videoElement.src,
            //     thumbnailUrl: videoThumbnails.get(videoElement.src),
            //     thumbnailMapSize: videoThumbnails.size
            // });

            // 触发下载，传递更多视频信息
            window.postMessage({
                type: 'DOWNLOAD_VIDEO',
                videoSrc: videoElement.src,
                videoInfo: {
                    currentTime: videoElement.currentTime,
                    duration: videoElement.duration,
                    videoWidth: videoElement.videoWidth,
                    videoHeight: videoElement.videoHeight,
                    readyState: videoElement.readyState,
                    networkState: videoElement.networkState,
                    crossOrigin: videoElement.crossOrigin,
                    currentSrc: videoElement.currentSrc
                }
            }, '*');

            // 打开 popup 窗口
            chrome.runtime.sendMessage({ action: "openPopup" });

        } catch (error) {
            console.error('Download error:', error);
            downloadBtn.disabled = false;
            downloadBtn.textContent = '下载失败，点击重试';
            downloadBtn.classList.remove('downloading');
            downloadBtn.querySelector('.progress')?.remove();
        }
    };

    // 添加按钮到包装元素
    wrapper.appendChild(downloadBtn);
}

// 定期检查新的视频元素
function checkForNewVideos() {
    // 使用更广泛的选择器，兼容两个版本
    const videos = document.querySelectorAll('video');
    // 过滤出包含stream或progressive/document的视频
    const streamVideos = Array.from(videos).filter(video => {
        return video.src && (video.src.includes('stream') ||
            video.src.includes('/progressive/document') ||
            video.src.includes('blob:'));
    });
    streamVideos.forEach(addDownloadButton);
}

// 初始检查
setTimeout(checkForNewVideos, 1000);

// 设置定期检查
setInterval(checkForNewVideos, 2000);

// 使用 MutationObserver 监听 DOM 变化
const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;

    mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
            shouldCheck = true;
        }
    });

    if (shouldCheck) {
        checkForNewVideos();
    }
});

// 开始观察 DOM 变化
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// 添加状态存储
let contentScriptDownloadStates = new Map();

// 监听来自 telegram_download_helper.js 的状态更新
window.addEventListener('message', (event) => {
    if (event.data.type === 'DOWNLOAD_STATES_UPDATE') {
        contentScriptDownloadStates = new Map(
            event.data.states.map(({ url, state }) => [url, state])
        );
    }
});

// 添加一个变量来跟踪上一次的状态
let lastStateString = '';

// 修改状态获取逻辑
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getVideos") {
        const videos = findTelegramVideos();
        sendResponse({ videos: videos });
    } else if (request.action === "downloadVideo") {
        try {
            const videoUrl = request.url;
            // console.log('Starting download with URL:', videoUrl);
            window.postMessage({
                type: 'DOWNLOAD_VIDEO',
                videoSrc: videoUrl
            }, '*');
            sendResponse({ success: true });
        } catch (error) {
            console.error('Error in downloadVideo:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
    } else if (request.action === "getDownloadStates") {
        const states = Array.from(contentScriptDownloadStates.entries())
            .map(([videoSrc, state]) => {
                try {
                    let fileName = 'video.mp4';

                    // 检查是k版本还是a版本的URL格式
                    if (videoSrc.includes('stream/')) {
                        // k版本：从URL中解析JSON数据
                        const fileInfoStr = decodeURIComponent(videoSrc.split('stream/')[1]);
                        const fileInfo = JSON.parse(fileInfoStr);
                        fileName = fileInfo.fileName || 'video.mp4';
                    } else if (videoSrc.includes('/progressive/document')) {
                        // a版本：从document ID生成文件名
                        const match = videoSrc.match(/progressive\/document(\d+)/);
                        if (match) {
                            fileName = `video_${match[1]}.mp4`;
                        }
                    }

                    return {
                        fileName: fileName,
                        progress: state.progress || 0,
                        timeRemaining: state.timeRemaining || '计算中',
                        inProgress: !!state.inProgress,
                        status: state.status || 'unknown',
                        videoSrc: videoSrc,
                        ...state
                    };
                } catch (error) {
                    return null;
                }
            })
            .filter(state => state && (state.inProgress || state.status === 'error'));

        sendResponse({ states });
        return true;
    } else if (request.action === "ping") {
        // console.log('Received ping from popup');
        sendResponse({ pong: true });
        return true;
        return true;
    } else if (request.action === "debugLog") {
        // console.log('[Popup Debug]', request.message);
        return true;
    }
    return true;
});

function findTelegramVideos() {
    const videos = [];

    // 查找所有视频元素（使用更广泛的搜索）
    const allVideos = document.querySelectorAll('video');
    const videoElements = Array.from(allVideos).filter(video => {
        return video.src && (video.src.includes('stream') ||
            video.src.includes('/progressive/document') ||
            video.src.includes('blob:'));
    });


    videoElements.forEach((video, index) => {
        const videoUrl = video.src;
        if (!videoUrl || (!videoUrl.includes('stream') &&
            !videoUrl.includes('/progressive/document') &&
            !videoUrl.includes('blob:'))) return;

        // 获取视频缩略图
        let thumbnail = '';
        // 查找消息容器（两个版本都使用相同的选择器）
        const messageContainer = video.closest('.Message') || video.closest('[data-message-id]');

        if (messageContainer) {
            const thumbnailImg = messageContainer.querySelector('img.thumbnail') ||
                messageContainer.querySelector('img.media-photo') ||
                messageContainer.querySelector('img[class*="preview"]');

            if (thumbnailImg) {
                thumbnail = thumbnailImg.src;
            } else {
                // 如果没有找到缩略图，尝试从视频第一帧获取
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    thumbnail = canvas.toDataURL('image/jpeg', 0.5);
                } catch (e) {
                    // console.log('Failed to get video thumbnail:', e);
                }
            }
        }

        // 获取消息ID（重用之前找到的容器）
        const messageId = messageContainer?.dataset?.messageId ||
            messageContainer?.getAttribute('data-message-id') ||
            messageContainer?.id ||
            `msg_${Date.now()}_${videos.length}`;

        videos.push({
            id: videos.length,
            url: videoUrl,
            messageId: messageId,
            timestamp: new Date().getTime(),
            thumbnail: thumbnail
        });
    });

    return videos;
}

// 修改 monitorDownloadStates 函数
function monitorDownloadStates() {
    // 监控 window.downloadStates 的变化
    let lastStatesSize = 0;
    setInterval(() => {
        const currentSize = window.downloadStates?.size || 0;
        if (currentSize !== lastStatesSize) {
            // 只记录状态变化，不打印详细信息
            lastStatesSize = currentSize;
        }
    }, 1000);
}

// 在初始化时启动监控
monitorDownloadStates();

// 添加翻译消息处理
window.addEventListener('message', (event) => {
    if (event.data.type === 'GET_TRANSLATION') {
        const translation = chrome.i18n.getMessage(event.data.key, event.data.params);
        window.postMessage({
            type: 'TRANSLATION_RESPONSE',
            key: event.data.key,
            translation: translation
        }, '*');
    }
}); 

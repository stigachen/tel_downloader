// 添加翻译缓存和响应监听
const translationCache = new Map();

window.addEventListener('message', (event) => {
    if (event.data.type === 'TRANSLATION_RESPONSE') {
        translationCache.set(event.data.key, event.data.translation);
    }
});

function getI18nMessage(key, params = []) {
    // 先检查缓存
    if (translationCache.has(key)) {
        return translationCache.get(key);
    }
    
    // 发送翻译请求
    window.postMessage({
        type: 'GET_TRANSLATION',
        key: key,
        params: params
    }, '*');
    
    // 使用默认的中文，确保功能不会中断
    const defaultMessages = {
        timeSeconds: (count) => `${count}秒`,
        timeMinutes: (count) => `${count}分钟`,
        timeHoursMinutes: (hours, minutes) => `${hours}小时${minutes}分钟`,
        calculating: () => '计算中',
        waiting: () => '等待中'
    };
    
    return defaultMessages[key]?.(...params) || '';
}

window.initTelegramDownloader = function() {
    // 全局下载状态管理
    if (!window.downloadStates) {
        window.downloadStates = new Map();
    }

    // 添加缩略图存储
    if (!window.videoThumbnails) {
        window.videoThumbnails = new Map();
    }

    // 添加状态广播
    function broadcastDownloadStates() {
        const states = Array.from(window.downloadStates || new Map()).map(([key, value]) => ({
            url: key,
            state: value,
            thumbnail: window.videoThumbnails.get(key) || ''  // 在这里添加缩略图
        }));
        window.postMessage({
            type: 'DOWNLOAD_STATES_UPDATE',
            states: states
        }, '*');
    }

    // 修改并发下载控制
    const MAX_CONCURRENT_DOWNLOADS = Number.POSITIVE_INFINITY;
    const activeDownloads = new Set();
    
    // 简化的检查函数
    function canStartNewDownload() {
        return activeDownloads.size < MAX_CONCURRENT_DOWNLOADS;
    }

    // 修改 updateDownloadState 函数
    function updateDownloadState(videoSrc, state) {
        const previousState = window.downloadStates.get(videoSrc);
        const newState = {
            ...state,
            lastUpdated: Date.now(),
            progress: state.status === 'error' ? 0 : (state.progress || previousState?.progress || 0),
            inProgress: state.status === 'error' ? false : (state.inProgress ?? previousState?.inProgress),
            needRestarted: state.needRestarted !== undefined ? state.needRestarted : previousState?.needRestarted
        };

        window.downloadStates.set(videoSrc, newState);
        
        // 广播状态更新
        broadcastDownloadStates();

        // 注释掉状态更新时的缩略图信息日志
        // console.log('Updating download state with thumbnail:', {
        //     videoSrc,
        //     thumbnail: window.videoThumbnails?.get(videoSrc),
        //     hasVideoThumbnails: !!window.videoThumbnails,
        //     thumbnailMapSize: window.videoThumbnails?.size
        // });

        // 发送进度消息
        window.postMessage({
            type: 'DOWNLOAD_PROGRESS',
            videoSrc: videoSrc,
            progress: newState.progress,
            timeRemaining: newState.timeRemaining || getI18nMessage('calculating'),
            error: newState.status === 'error',
            completed: newState.status === 'completed',
            thumbnail: window.videoThumbnails?.get(videoSrc) || ''
        }, '*');
    }

    // 实际下载视频的函数
    async function downloadInChunks(url, headers, totalSize, chunkSize = 1024 * 1024 * 5) {
        // 添加下载开始的日志
        console.log('Starting chunk download:', {
            url,
            totalSize,
            chunkSize,
            timestamp: Date.now()
        });

        const chunks = [];
        let downloaded = 0;
        const startTime = Date.now();
        let lastUpdate = startTime;
        let speedArray = [];
        
        while (downloaded < totalSize) {
            // 检查是否被重新放回等待队列(伪暂停), 如果是, 则直接返回   
            const existingState = window.downloadStates.get(url);
            if (existingState && existingState.needRestarted) {
                updateDownloadState(url, {
                    status: 'queued',
                    progress: 0,
                    timeRemaining: getI18nMessage('waiting'),
                    inProgress: true,
                    needRestarted: false
                });
                return new Blob([]);
            }

            const end = Math.min(downloaded + chunkSize - 1, totalSize - 1);
            const rangeHeaders = new Headers(headers);
            rangeHeaders.set('Range', `bytes=${downloaded}-${end}`);

            // console.log('Requesting range:', `bytes=${downloaded}-${end}`);
            // console.log('Request headers:', Object.fromEntries(rangeHeaders.entries()));

            const response = await fetch(url, {
                method: 'GET',
                headers: rangeHeaders,
                credentials: 'include',
                mode: 'cors'
            });

            // console.log('Response status:', response.status);
            // console.log('Response headers:', Object.fromEntries(response.headers.entries()));

            if (!response.ok && response.status !== 206) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const chunk = await response.blob();
            // console.log('Received chunk size:', chunk.size);
            chunks.push(chunk);

            // 计算下载速度和剩余时间
            const now = Date.now();
            const timeDiff = now - lastUpdate;
            if (timeDiff > 0) {
                const speed = chunk.size / timeDiff;
                speedArray.push(speed);
                if (speedArray.length > 10) {
                    speedArray.shift();
                }
            }
            lastUpdate = now;

            downloaded += chunk.size;
            const progress = (downloaded / totalSize) * 100;

            // 计算平均下载速度和剩余时间
            const avgSpeed = speedArray.reduce((a, b) => a + b, 0) / speedArray.length;
            const remaining = (totalSize - downloaded) / avgSpeed;
            
            let timeStr = '';
            if (remaining < 60000) {
                timeStr = getI18nMessage('timeSeconds', [Math.ceil(remaining / 1000)]);
            } else if (remaining < 3600000) {
                timeStr = getI18nMessage('timeMinutes', [Math.ceil(remaining / 60000)]);
            } else {
                const hours = Math.floor(remaining / 3600000);
                const minutes = Math.ceil((remaining % 3600000) / 60000);
                timeStr = getI18nMessage('timeHoursMinutes', [hours, minutes]);
            }

            // 更新下载状态
            updateDownloadState(url, {
                status: 'downloading',
                progress: progress,
                timeRemaining: timeStr,
                inProgress: true,
                totalSize: totalSize,
                downloadedSize: downloaded
            });

            // 发送进度消息
            window.postMessage({
                type: 'DOWNLOAD_PROGRESS',
                progress: progress,
                timeRemaining: timeStr,
                videoSrc: url
            }, '*');

            // console.log('Downloading chunk:', {
            //     chunkNumber: chunks.length + 1,
            //     startByte: downloaded,
            //     endByte: end,
            //     totalProgress: (downloaded / totalSize) * 100,
            //     timestamp: Date.now()
            // });
        }

        // 确定MIME类型
        let mimeType = 'video/mp4'; // 默认类型
        if (chunks.length > 0 && chunks[0].type) {
            mimeType = chunks[0].type;
        }
        
        return new Blob(chunks, { type: mimeType });
    }

    // 添加下载队列
    const downloadQueue = [];

    // 检查并开始下一个下载
    async function processNextDownload() {
        if (downloadQueue.length === 0 || !canStartNewDownload()) {
            return;
        }

        const nextVideoSrc = downloadQueue.shift();
        console.log('Processing next download:', nextVideoSrc);
        await window.downloadTelegramVideo(nextVideoSrc);
    }

    // 调度视频下载的主入口函数
    window.downloadTelegramVideo = async function(videoSrc) {
        try {
            // 检查是否已经在下载
            const existingState = window.downloadStates.get(videoSrc);
            console.log('Existing state:', existingState);
            // if (existingState && existingState.inProgress) {
            if (existingState && existingState.inProgress && existingState.status !== 'queued' && existingState.status !== 'error') {
                console.log('Download already in progress');
                return true;
            }

            // 检查并发下载数量
            if (!canStartNewDownload()) {
                console.log('Too many concurrent downloads, waiting...');
                downloadQueue.push(videoSrc);  // 添加到队列
                updateDownloadState(videoSrc, {
                    status: 'queued',
                    progress: 0,
                    timeRemaining: getI18nMessage('waiting'),
                    inProgress: true
                });
                return true;
            }

            // 添加到活动下载列表
            activeDownloads.add(videoSrc);

            // 解析视频信息
            console.log('Starting download process for:', videoSrc);
            
            let videoData = {};
            let fileName = 'video.mp4';
            
            // 检查是k版本还是a版本的URL格式
            const streamMatch = videoSrc.match(/stream\/(.*)/);
            const progressiveMatch = videoSrc.match(/progressive\/document(\d+)/);
            
            if (streamMatch) {
                // k版本：从URL中解析JSON数据
                const jsonStr = decodeURIComponent(streamMatch[1]);
                videoData = JSON.parse(jsonStr);
                fileName = videoData.fileName || 'video.mp4';
                console.log('Parsed k version video data:', videoData);
            } else if (progressiveMatch) {
                // a版本：从document ID生成文件名
                const docId = progressiveMatch[1];
                fileName = `video_${docId}.mp4`;
                videoData = { 
                    fileName: fileName,
                    documentId: docId,
                    isAVersion: true
                };
                console.log('Parsed a version video data:', videoData);
            } else {
                throw new Error('Invalid video URL format');
            }

            // 构建新的请求头，根据版本设置正确的Referer
            const referer = videoData.isAVersion ? 'https://web.telegram.org/a/' : 'https://web.telegram.org/k/';
            
            const headers = new Headers({
                'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
                'Accept-Encoding': 'identity',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': referer,
                'Origin': 'https://web.telegram.org',
                'Sec-Fetch-Dest': 'video',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': navigator.userAgent
            });

            try {
                // 更新初始状态
                updateDownloadState(videoSrc, {
                    status: 'starting',
                    progress: 0,
                    timeRemaining: '计算中',
                    inProgress: true
                });

                // 检查是否为a版本，如果是则使用tel_download_video函数
                if (videoData.isAVersion) {
                    console.log('Processing a version video - using tel_download_video function');
                    
                    // 更新状态为准备中
                    updateDownloadState(videoSrc, {
                        status: 'starting',
                        progress: 0,
                        timeRemaining: '开始下载...',
                        inProgress: true
                    });

                    try {
                        // 创建唯一的下载ID用于监听进度
                        const downloadId = `download_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                        
                        // 监听下载进度事件
                        const progressHandler = (event) => {
                            const progress = parseInt(event.detail.progress);
                            console.log(`Download progress: ${progress}%`);
                            
                            updateDownloadState(videoSrc, {
                                status: 'downloading',
                                progress: progress,
                                timeRemaining: progress < 100 ? '下载中...' : '即将完成',
                                inProgress: progress < 100
                            });

                            // 发送进度消息
                            window.postMessage({
                                type: 'DOWNLOAD_PROGRESS',
                                progress: progress,
                                completed: progress >= 100,
                                videoSrc: videoSrc
                            }, '*');

                            // 如果下载完成，移除事件监听器
                            if (progress >= 100) {
                                document.removeEventListener(downloadId + '_video_download_progress', progressHandler);
                                
                                // 更新最终状态
                                updateDownloadState(videoSrc, {
                                    status: 'completed',
                                    progress: 100,
                                    timeRemaining: '',
                                    inProgress: false
                                });
                            }
                        };

                        // 添加进度监听器
                        document.addEventListener(downloadId + '_video_download_progress', progressHandler);
                        
                        // 调用tel_download_video函数
                        if (typeof tel_download_video === 'function') {
                            tel_download_video(videoSrc, downloadId);
                        } else {
                            throw new Error('tel_download_video function not available');
                        }

                        return true;

                    } catch (error) {
                        console.error('A version download error:', error);
                        
                        // 更新状态为错误
                        updateDownloadState(videoSrc, {
                            status: 'error',
                            progress: 0,
                            timeRemaining: '下载失败',
                            inProgress: false
                        });

                        window.postMessage({
                            type: 'DOWNLOAD_PROGRESS',
                            progress: 0,
                            error: true,
                            videoSrc: videoSrc
                        }, '*');

                        throw error;
                    }
                }

                // 对于k版本，继续使用原来的方法
                // k版本的videoData应该包含文件大小信息
                const fileSize = videoData.size;
                if (!fileSize) {
                    throw new Error('K version video data missing size information');
                }

                // 下载视频
                const blob = await downloadInChunks(videoSrc, headers, fileSize);
                if (blob.size === 0) {
                    return true;
                }

                // 创建下载链接 + 触发浏览器下载行为
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);

                // 更新完成状态
                updateDownloadState(videoSrc, {
                    status: 'completed',
                    progress: 100,
                    timeRemaining: '',
                    inProgress: false,
                    totalSize: videoData.size,
                    downloadedSize: videoData.size
                });

                // 下载完成后处理下一个任务
                activeDownloads.delete(videoSrc);
                processNextDownload();  // 处理队列中的下一个任务
                return true;
            } catch (error) {
                console.error('Download error:', error);
                updateDownloadState(videoSrc, {
                    status: 'error',
                    progress: 0,
                    timeRemaining: '',
                    inProgress: false,
                    error: error.message
                });
                // 发生错误时也处理下一个任务
                activeDownloads.delete(videoSrc);
                processNextDownload();  // 处理队列中的下一个任务
                throw error;
            }
        } catch (error) {
            console.error('Error downloading video:', error);
            return false;
        }
    };

    window.addEventListener('message', async (event) => {
        if (event.data.type === 'DOWNLOAD_VIDEO') {
            await window.downloadTelegramVideo(event.data.videoSrc);
        }
    });

    // 添加缩略图存储监听
    window.addEventListener('message', (event) => {
        if (event.data.type === 'STORE_THUMBNAIL') {
            window.videoThumbnails.set(event.data.videoSrc, event.data.thumbnailSrc);
            console.log('Stored thumbnail:', {
                videoSrc: event.data.videoSrc,
                thumbnailSrc: event.data.thumbnailSrc,
                mapSize: window.videoThumbnails.size
            });
            // 立即广播更新，确保 popup 能获取到最新的缩略图
            broadcastDownloadStates();
        }
    });

};

initTelegramDownloader(); 

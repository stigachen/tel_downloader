chrome.runtime.onInstalled.addListener(() => {
  // console.log('Telegram Video Downloader 已安装');
});

// 处理下载错误
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.error) {
    console.error('Download failed:', delta.error.current);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openPopup") {
    // 打开扩展的 popup 窗口
    chrome.action.openPopup();
  }
}); 
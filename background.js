// 监听安装事件
chrome.runtime.onInstalled.addListener(() => {
  chrome.commands.getAll().then(commands => {
  });
});

// 注入content script
async function injectContentScript(tabId) {
  try {
    // 先注入CSS
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['modal.css']
    });
    
    // 再注入JavaScript
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content-script.js']
    });
    
    // 等待一小段时间确保脚本加载完成
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return true;
  } catch (error) {
    return false;
  }
}

// 发送消息到标签页
async function sendMessageToTab(tabId, message) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response;
  } catch (error) {
    throw error;
  }
}

// 处理命令
async function handleCommand(tabId) {
  try {
    // 先尝试发送消息
    await sendMessageToTab(tabId, { action: 'show-folder-selector' });
  } catch (error) {
    // 注入content script
    const injected = await injectContentScript(tabId);
    if (!injected) {
      throw new Error('Failed to inject content script');
    }
    
    // 重新发送消息
    try {
      await sendMessageToTab(tabId, { action: 'show-folder-selector' });
    } catch (error) {
      throw error;
    }
  }
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get-bookmarks') {
    chrome.bookmarks.getTree().then(sendResponse);
    return true;
  } else if (request.action === 'save-bookmark') {
    chrome.tabs.query({active: true, currentWindow: true}).then(([tab]) => {
      chrome.bookmarks.create({
        parentId: request.parentId,
        title: tab.title,
        url: tab.url
      }).then(() => {
        sendResponse({ success: true });
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon48.png',
          title: 'bookmark saved',
          message: 'success'
        });
      });
    });
    return true;
  } else if (request.action === 'create-folder') {
    chrome.bookmarks.create({
      parentId: request.parentId,
      title: request.title
    }).then(sendResponse);
    return true;
  } else if (request.action === 'move-bookmark') {
    chrome.bookmarks.move(request.id, {parentId: request.parentId})
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('Error moving bookmark:', error);
        sendResponse({ error: error.message });
      });
    return true;
  } else if (request.action === 'delete-bookmark') {
    chrome.bookmarks.remove(request.id)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('Error deleting bookmark:', error);
        sendResponse({ error: error.message });
      });
    return true;
  } else if (request.action === 'get-current-bookmark') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url) {
        sendResponse({ error: 'No active tab found or tab has no URL' });
        return;
      }

      chrome.bookmarks.search({ url: currentTab.url }, (results) => {
        if (results.length > 0) {
          sendResponse(results[0]);
        } else {
          sendResponse({ error: 'No bookmark found for the current URL' });
        }
      });
    });
    return true;
  }
});

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save-bookmark") {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
        return;
      }
      await handleCommand(tab.id);
    } catch (error) {
    }
  }else if (command === "delete-bookmark") {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
        return;
      }
      const results = await chrome.bookmarks.search({ url: tab.url });
      if (results.length > 0) {
        await chrome.bookmarks.remove(results[0].id);
      } else {
      }
    } catch (error) {
    }
  }
});

// 监听扩展图标点击
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked for tab:', tab.id);
  if (!tab.url || tab.url.startsWith('chrome://')) {
    return;
  }
  try {
    await handleCommand(tab.id);
  } catch (error) {
  }
}); 
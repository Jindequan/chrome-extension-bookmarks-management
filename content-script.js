// 确保content script只加载一次
if (!window.bookmarkManagerInitialized) {
  window.bookmarkManagerInitialized = true;
  
  let selectedItems = new Set();  // 存储选中的项目ID

  // 监听来自background的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'show-folder-selector') {
      showFolderSelector();
      sendResponse({ success: true });
      return true;
    }
  });

  // 显示文件夹选择器
  async function showFolderSelector() {
    // 创建遮罩层和模态框
    const overlay = document.createElement('div');
    overlay.className = 'bookmark-modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'bookmark-modal';
    
    // 创建基本结构
    modal.innerHTML = `
      <div class="container">
        <h2>
          <span>Select Location</span>
        </h2>
        <div id="folder-tree"></div>
        <div class="actions">
          <div class="left-actions">
            <button id="delete">Delete</button>
            <button id="new-folder">New Folder</button>
          </div>
          <button id="save">Save</button>
        </div>
      </div>
    `;

    // 添加调整宽度的拖动条
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    modal.appendChild(resizeHandle);
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 初始化文件夹树
    const folderTree = modal.querySelector('#folder-tree');
    try {
      const tree = await chrome.runtime.sendMessage({ action: 'get-bookmarks' });
      renderFolders(tree[0].children, folderTree);
    } catch (error) {
      console.error('Error loading bookmarks:', error);
    }

    // 获取按钮引用
    const deleteButton = modal.querySelector('#delete');
    const newFolderButton = modal.querySelector('#new-folder');
    const saveButton = modal.querySelector('#save');

    // 修改删除按钮事件
    deleteButton.addEventListener('click', async () => {
      if (selectedItems.size === 0) {
        alert('No items selected to delete.');
        return;
      }
    
      if (confirm(`Are you sure you want to delete ${selectedItems.size} selected item(s)?`)) {
        try {
          for (const id of selectedItems) {
            await chrome.runtime.sendMessage({
              action: 'delete-bookmark',
              id: id
            });
            // 直接从DOM中移除元素
            const item = document.querySelector(`[data-id="${id}"]`);
            if (item) {
              const childContainer = item.nextElementSibling;
              if (childContainer && childContainer.classList.contains('child-container')) {
                childContainer.remove();
              }
              item.remove();
            }
          }
          selectedItems.clear();
        } catch (error) {
          console.error('Error deleting bookmarks:', error);
        }
      }
    });

    // 修改新建文件夹按钮事件
    newFolderButton.addEventListener('click', async () => {
      if (selectedItems.size !== 1) {
        alert('Please select exactly one item to create a new folder.');
        return;
      }
    
      const folderName = prompt('Enter folder name:');

      if (folderName) {
        try {
          // 获取选中的项目
          const selectedId = Array.from(selectedItems)[0];
          const selectedItem = document.querySelector(`[data-id="${selectedId}"]`);
    
          if (!selectedItem) return;
    
          let parentId, index;
    
          if (selectedItem.nextElementSibling && 
              selectedItem.nextElementSibling.classList.contains('child-container')) {
            // 如果选中的是文件夹，在其内部创建
            parentId = selectedId;
            index = 0;  // 放在文件夹的第一个位置
          } else {
            // 如果选中的是书签或没有子容器的文件夹，在其后面创建
            const parent = selectedItem.parentElement;
            parentId = parent.classList.contains('child-container') 
              ? parent.previousElementSibling.dataset.id 
              : parent.dataset.id;
            index = Array.from(parent.children).indexOf(selectedItem) + 1;
          }
    
          await chrome.runtime.sendMessage({
            action: 'create-folder',
            parentId: parentId,
            title: folderName,
            index: index
          });
    
          // 重新加载文件夹树
          
          const folderTree = document.querySelector('#folder-tree');
          const tree = await chrome.runtime.sendMessage({ action: 'get-bookmarks' });
          renderFolders(tree[0].children, folderTree);
        } catch (error) {
          console.error('Error creating folder:', error);
        }
      }
    });

// 修改保存按钮事件
saveButton.addEventListener('click', async () => {
  if (selectedItems.size !== 1) {
    alert('Please select exactly one folder to save.');
    return;
  }

  const selectedId = Array.from(selectedItems)[0];
  const selectedItem = document.querySelector(`[data-id="${selectedId}"]`);

  if (!selectedItem || !selectedItem.nextElementSibling || 
      !selectedItem.nextElementSibling.classList.contains('child-container')) {
    alert('Please select a valid folder to save.');
    return;
  }

  // 执行保存操作
  try {
    const currentBookmark = await chrome.runtime.sendMessage({ action: 'get-current-bookmark' });
    const bookmarkExists = currentBookmark && currentBookmark.id;

    if (bookmarkExists) {
      // 移动书签到选中的位置
      await chrome.runtime.sendMessage({
        action: 'move-bookmark',
        id: currentBookmark.id,
        parentId: selectedId
      });
    } else {
      // 保存书签到选中的位置
      await chrome.runtime.sendMessage({
        action: 'save-bookmark',
        parentId: selectedId
      });
    }

    // 重新加载文件夹树
    const folderTree = document.querySelector('#folder-tree');
    const tree = await chrome.runtime.sendMessage({ action: 'get-bookmarks' });
    renderFolders(tree[0].children, folderTree);
  } catch (error) {
    console.error('Error saving or moving bookmark:', error);
  }
});

    // 关闭事件
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
      }
    });

    // 处理宽度调整
    let isResizing = false;
    let startX;
    let startWidth;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = modal.offsetWidth;
      modal.classList.add('resizing');
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const width = startWidth - (e.clientX - startX);
      if (width >= 300 && width <= 800) {
        modal.style.width = width + 'px';
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        modal.classList.remove('resizing');
        chrome.storage.sync.set({ bookmarkModalWidth: modal.offsetWidth });
      }
    });

    // 加载保存的宽度设置
    try {
      const { bookmarkModalWidth } = await chrome.storage.sync.get('bookmarkModalWidth');
      if (bookmarkModalWidth) {
        modal.style.width = bookmarkModalWidth + 'px';
      }
    } catch (error) {
      console.error('Error loading modal width:', error);
    }
  }

  // 渲染文件夹树
  function renderFolders(folders, container, level = 0) {
    return new Promise((resolve) => {
      // 从storage获取展开状态
      chrome.storage.local.get('expandedFolders', ({ expandedFolders = {} }) => {
        folders.forEach(folder => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'bookmark-item';
          itemDiv.dataset.id = folder.id;
          itemDiv.dataset.level = level;
          
          // 设置拖拽属性
          itemDiv.setAttribute('draggable', 'true');
          
          // 创建图标容器
          const icon = document.createElement('span');
          icon.className = 'folder-icon';
          
          if (folder.children) {
            icon.innerHTML = '&#9658;';
            itemDiv.appendChild(icon);
          } else {
            // 如果是书签而不是文件夹，添加favicon
            const favicon = document.createElement('img');
            favicon.className = 'favicon';
            try {
              const url = new URL(folder.url);
              favicon.src = `https://www.google.com/s2/favicons?domain=${url.hostname}`;
            } catch (error) {
              favicon.src = 'images/icon16.png';
            }
            favicon.onerror = () => {
              favicon.src = 'images/icon16.png';
            };
            itemDiv.appendChild(favicon);
          }

          const titleSpan = document.createElement('span');
          titleSpan.className = 'item-title';
          titleSpan.textContent = folder.title;
          itemDiv.appendChild(titleSpan);

          // 添加拖拽事件监听器
          itemDiv.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            itemDiv.classList.add('dragging');
            e.dataTransfer.setData('text/plain', folder.id);
            e.dataTransfer.effectAllowed = 'move';
            // 添加延迟以确保样式已应用
            setTimeout(() => itemDiv.classList.add('dragging'), 0);
          });

          itemDiv.addEventListener('dragend', () => {
            itemDiv.classList.remove('dragging');
            document.querySelectorAll('.drag-over').forEach(el => {
              el.classList.remove('drag-over');
            });
            document.querySelectorAll('.drag-indicator').forEach(el => el.remove());
          });

          itemDiv.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const draggingItem = document.querySelector('.dragging');
            if (!draggingItem || draggingItem === itemDiv) return;

            const rect = itemDiv.getBoundingClientRect();
            const mouseY = e.clientY;
            const relativeY = mouseY - rect.top;
            const height = rect.height;
            
            // 移除所有现有的指示器
            document.querySelectorAll('.drag-indicator').forEach(el => el.remove());
            document.querySelectorAll('.drag-over').forEach(el => {
              el.classList.remove('drag-over');
            });

            if (folder.children && relativeY > height * 0.25 && relativeY < height * 0.75) {
              // 拖到文件夹上
              itemDiv.classList.add('drag-over');
            } else {
              // 创建拖动位置指示器
              const indicator = document.createElement('div');
              indicator.className = `drag-indicator ${relativeY < height / 2 ? 'above' : 'below'}`;
              itemDiv.appendChild(indicator);
            }
          });

          itemDiv.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const draggedId = e.dataTransfer.getData('text/plain');
            if (!draggedId || draggedId === folder.id) return;

            try {
              const rect = itemDiv.getBoundingClientRect();
              const mouseY = e.clientY;
              const relativeY = mouseY - rect.top;
              const height = rect.height;

              // 获取拖拽的元素和目标元素的信息
              const draggingItem = document.querySelector(`[data-id="${draggedId}"]`);
              if (!draggingItem) return;

              // 获取源和目标的容器信息
              const sourceContainer = draggingItem.parentElement;
              const targetContainer = itemDiv.parentElement;
              
              // 获取目标父文件夹ID
              const targetParentId = targetContainer.classList.contains('child-container')
                ? targetContainer.previousElementSibling.dataset.id
                : '1';

              if (folder.children && relativeY > height * 0.25 && relativeY < height * 0.75) {
                // 移动到文件夹中
                await chrome.runtime.sendMessage({
                  action: 'move-bookmark',
                  id: draggedId,
                  destination: {
                    parentId: folder.id,
                    index: 0
                  }
                });
               
                // 获取目标文件夹的子容器
                const targetChildContainer = itemDiv.nextElementSibling;
                if (targetChildContainer && targetChildContainer.classList.contains('child-container')) {
                  // 确保子容器是展开的
                  if (!targetChildContainer.classList.contains('expanded')) {
                    targetChildContainer.classList.add('expanded');
                    icon.innerHTML = '&#9660;';
                    
                    // 更新展开状态
                    chrome.storage.local.get('expandedFolders', ({ expandedFolders = {} }) => {
                      expandedFolders[folder.id] = true;
                      chrome.storage.local.set({ expandedFolders });
                    });
                  }
                  
                  // 移动拖动项及其子容器到目标文件夹
                  const draggedChildContainer = draggingItem.nextElementSibling;
                  targetChildContainer.insertBefore(draggingItem, targetChildContainer.firstChild);
                  if (draggedChildContainer && draggedChildContainer.classList.contains('child-container')) {
                    targetChildContainer.insertBefore(draggedChildContainer, draggingItem.nextSibling);
                  }
                }
              } else {
                // 获取目标容器中的所有项目
                const siblings = Array.from(targetContainer.children);
                // 计算实际的书签索引
                let index = 0;
                let foundTarget = false;
                
                // 遍历所有兄弟节点计算索引
                for (const sibling of siblings) {
                  if (sibling === itemDiv) {
                    foundTarget = true;
                    if (relativeY > height / 2) {
                      // 如果鼠标在下半部分，将放在目标后面
                      index++;
                    }
                    continue;
                  }
                  
                  if (sibling === draggingItem) {
                    // 跳过被拖动的项目
                    continue;
                  }
                  
                  if (sibling.classList.contains('bookmark-item')) {
                    if (!foundTarget) {
                      // 在目标之前计数
                      index++;
                    }
                    // 如果是向下移动，只计算紧邻的下一个项目
                    else if (foundTarget && relativeY > height / 2) {
                      index++;
                      break;  // 找到紧邻的下一个项目后就停止
                    }
                  }
                }
                
                await chrome.runtime.sendMessage({
                  action: 'move-bookmark',
                  id: draggedId,
                  destination: {
                    parentId: targetParentId,
                    index: index
                  }
                });
              }

              // 直接更新DOM，而不是重新渲染整个树
              if (sourceContainer === targetContainer) {
                // 同一容器内移动，直接调整DOM位置
                if (relativeY > height / 2) {
                  itemDiv.after(draggingItem);
                } else {
                  itemDiv.before(draggingItem);
                }
              } else {
                // 跨容器移动，移动到新位置
                if (folder.children) {
                  // 移动到文件夹中
                  const childContainer = itemDiv.nextElementSibling;
                  childContainer.insertBefore(draggingItem, childContainer.firstChild);
                } else {
                  // 移动到项目前后
                  if (relativeY > height / 2) {
                    itemDiv.after(draggingItem);
                  } else {
                    itemDiv.before(draggingItem);
                  }
                }
                
                // 如果有子容器，也需要移动
                const draggedChildContainer = draggingItem.nextElementSibling;
                if (draggedChildContainer && draggedChildContainer.classList.contains('child-container')) {
                  draggingItem.after(draggedChildContainer);
                }
              }

            } catch (error) {
              console.error('Error moving bookmark:', error);
            }
          });

          // 点击事件
          itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            if (folder.children) {
              const childContainer = itemDiv.nextElementSibling;
              childContainer.classList.toggle('expanded');
              icon.classList.toggle('expanded');
              icon.innerHTML = childContainer.classList.contains('expanded') ? '&#9660;' : '&#9658;';
              
              // 保存展开状态到storage
              chrome.storage.local.get('expandedFolders', ({ expandedFolders = {} }) => {
                if (childContainer.classList.contains('expanded')) {
                  expandedFolders[folder.id] = true;
                } else {
                  delete expandedFolders[folder.id];
                }
                chrome.storage.local.set({ expandedFolders });
              });
            }

            // 处理选中状态
            if (e.ctrlKey || e.metaKey) {
              // 多选
              if (selectedItems.has(folder.id)) {
                selectedItems.delete(folder.id);
                itemDiv.classList.remove('selected');
              } else {
                selectedItems.add(folder.id);
                itemDiv.classList.add('selected');
              }
            } else {
              // 单选
              selectedItems.clear();
              document.querySelectorAll('.selected').forEach(el => {
                el.classList.remove('selected');
              });
              selectedItems.add(folder.id);
              itemDiv.classList.add('selected');
            }
          });

          container.appendChild(itemDiv);

          if (folder.children) {
            const childContainer = document.createElement('div');
            childContainer.className = 'child-container';
            if (expandedFolders[folder.id]) {
              childContainer.classList.add('expanded');
              icon.innerHTML = '&#9660;';
            }
            container.appendChild(childContainer);
            renderFolders(folder.children, childContainer, level + 1).then(() => {
              if (folder === folders[folders.length - 1]) {
                resolve();
              }
            });
          } else if (folder === folders[folders.length - 1]) {
            resolve();
          }
        });
        if (folders.length === 0) {
          resolve();
        }
      });
    });
  }
}
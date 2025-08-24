// script.js (V8.26 - 红包功能终极修复版 + IndexedDB存储)
document.addEventListener('DOMContentLoaded', () => {
    const rootStyles = getComputedStyle(document.documentElement);
    const mainThemeColor = rootStyles.getPropertyValue('--theme-color-primary').trim();
    document.documentElement.style.setProperty('--main-theme-color', mainThemeColor);
    // --- 【【【V2.5 终极全屏修复：屏幕尺寸校准器】】】 ---
    const appContainerForResize = document.getElementById('app-container');

    // --- 【【【全新：IndexedDB 仓库管理员】】】 ---
    const db = {
        _db: null,
        init: function() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('AIChatAppDB', 1); // 打开或创建数据库
                request.onerror = (event) => reject("数据库打开失败: " + event.target.errorCode);
                request.onsuccess = (event) => {
                    this._db = event.target.result;
                    console.log("数据库初始化成功");
                    resolve();
                };
                // 如果是第一次创建，或版本升级，会触发此事件
                request.onupgradeneeded = (event) => {
                    const dbInstance = event.target.result;
                    // 创建一个名为 'images' 的“货架”（Object Store）专门用来放图片
                    if (!dbInstance.objectStoreNames.contains('images')) {
                        dbInstance.createObjectStore('images');
                    }
                };
            });
        },
        saveImage: function(key, blob) {
            return new Promise((resolve, reject) => {
                // 检查数据库是否已初始化
                if (!this._db) {
                    // 修正：用标准的Error对象来拒绝Promise，信息更清晰
                    return reject(new Error("数据库未初始化")); 
                }
                try {
                    // 启动一个“读写”模式的运输流程
                    const transaction = this._db.transaction(['images'], 'readwrite');
                    // 拿到“图片”这个货架
                    const store = transaction.objectStore('images');
                    // 发出“放货”的请求
                    const request = store.put(blob, key);

                    // 监控“放货请求”本身是否出错
                    request.onerror = () => {
                        // 如果请求出错，立刻拒绝，并把详细错误信息交出去
                        reject(request.error); 
                    };

                    // 监控整个“运输流程”是否出错
                    transaction.onerror = () => {
                        // 如果流程出错，也立刻拒绝，并交出错误信息
                        reject(transaction.error); 
                    };

                    // 只有当整个“运输流程”顺利完成时，才算成功
                    transaction.oncomplete = () => {
                        resolve();
                    };
                } catch (e) {
                    // 捕获一些意外的同步错误（例如货架名写错等）
                    reject(e);
                }
            });
        },
        getImage: function(key) {
            return new Promise((resolve, reject) => {
                if (!this._db) return reject("数据库未初始化");
                 // 'readonly' 表示我们只进行读取操作
                const transaction = this._db.transaction(['images'], 'readonly');
                const store = transaction.objectStore('images');
                const request = store.get(key); // 根据 key 标签来取货
                request.onsuccess = (event) => resolve(event.target.result); // 返回找到的文件
                request.onerror = (event) => reject("图片读取失败: " + event.target.errorCode);
            });
        },
        deleteImage: function(key) {
            return new Promise((resolve, reject) => {
                if (!this._db) return reject("数据库未初始化");
                const transaction = this._db.transaction(['images'], 'readwrite');
                const store = transaction.objectStore('images');
                store.delete(key); // 根据 key 标签删除货物
                transaction.oncomplete = () => resolve();
                transaction.onerror = (event) => reject("图片删除失败: " + event.target.errorCode);
            });
        }
    };

    // --- 1. 全局数据存储 ---
    let appData = {};
    let activeChatContactId = null;
    let lastReceivedSuggestions = [];
    let stagedUserMessages = [];
    let imageUploadMode = 'upload';
    let stagedImageData = null;
    let isSelectMode = false;
    let forceRestartContext = false;
    let selectedMessages = new Set();
    let longPressTimer;
    let lastRenderedTimestamp = 0;
    let loadingBubbleElement = null;
    const MESSAGES_PER_PAGE = 50; // 每次加载50条
    let currentMessagesOffset = 0;  // 记录当前已经加载了多少条
    let stagedStickerFile = null;
    let activeContextMenuMessageId = null; // 追踪当前哪个消息被右键点击了
    let stagedQuoteData = null; // 暂存准备要引用的消息数据
    let stagedAccountingEntries = []; // 【全新】暂存记账条目

    // --- 2. 元素获取 ---
    const appContainer = document.getElementById('app-container');
    const appNav = document.getElementById('app-nav');
    const views = document.querySelectorAll('.view');
    const navButtons = document.querySelectorAll('.nav-button');
    const csEditMyProfile = document.getElementById('cs-edit-my-profile');
    const addContactButton = document.getElementById('add-contact-button');
    const chatListContainer = document.getElementById('chat-list-container');
    const backToListButton = document.getElementById('back-to-list-button');
    const backFromMomentsBtn = document.getElementById('back-to-list-from-moments');
    const backFromSettingsBtn = document.getElementById('back-to-list-from-settings');
    const chatAiName = document.getElementById('chat-ai-name');
    const chatAiStatus = document.getElementById('chat-ai-status');
    const chatAiActivityStatus = document.getElementById('chat-ai-activity-status'); // 【新增】获取状态元素
    const chatHeaderInfo = document.getElementById('chat-header-info');
    const chatSettingsButton = document.getElementById('chat-settings-button');
    const messageContainer = document.getElementById('message-container');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const voiceBtn = document.getElementById('voice-btn');
    const imageBtn = document.getElementById('image-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const redPacketBtn = document.getElementById('red-packet-btn');
    const emojiBtn = document.getElementById('emoji-btn');
    const aiHelperButton = document.getElementById('ai-helper-button');
    const moreFunctionsButton = document.getElementById('more-functions-button');
    const aiSuggestionPanel = document.getElementById('ai-suggestion-panel');
    const refreshSuggestionsContainer = document.getElementById('refresh-suggestions-container');
    const refreshSuggestionsBtn = document.getElementById('refresh-suggestions-btn');
    const apiTypeSelect = document.getElementById('api-type-select');
    const apiUrlInput = document.getElementById('api-url-input');
    const apiModelSelect = document.getElementById('api-model-select');
    const fetchModelsButton = document.getElementById('fetch-models-button');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const userProfileModal = document.getElementById('user-profile-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const saveProfileButton = document.getElementById('save-profile-button');
    const modalUserNameInput = document.getElementById('modal-user-name-input');
    const modalUserPersonaInput = document.getElementById('modal-user-persona-input');
    const userAvatarUploadArea = document.getElementById('user-avatar-upload-area');
    const userAvatarPreview = document.getElementById('user-avatar-preview');
    const userAvatarUploadInput = document.getElementById('user-avatar-upload-input');
    const chatHeaderNormal = document.getElementById('chat-header-normal');
    const chatHeaderSelect = document.getElementById('chat-header-select');
    const cancelSelectButton = document.getElementById('cancel-select-button');
    const selectCount = document.getElementById('select-count');
    const editSelectedButton = document.getElementById('edit-selected-button');
    const deleteSelectedButton = document.getElementById('delete-selected-button');
    const contactSettingsView = document.getElementById('contact-settings-view');
    const backToChatButton = document.getElementById('back-to-chat-button');
    const csContactAvatar = document.getElementById('cs-contact-avatar');
    const csMyAvatar = document.getElementById('cs-my-avatar');
    const csEditAiProfile = document.getElementById('cs-edit-ai-profile');
    const csPinToggle = document.getElementById('cs-pin-toggle');
    const csClearHistory = document.getElementById('cs-clear-history');
    const csDeleteContact = document.getElementById('cs-delete-contact');
    const aiEditorView = document.getElementById('ai-editor-view');
    const backToContactSettingsButton = document.getElementById('back-to-contact-settings-button');
    const avatarUploadArea = document.getElementById('avatar-upload-area');
    const avatarPreview = document.getElementById('avatar-preview');
    const avatarUploadInput = document.getElementById('avatar-upload-input');
    const photoUploadArea = document.getElementById('photo-upload-area');
    const photoPreview = document.getElementById('photo-preview');
    const photoUploadInput = document.getElementById('photo-upload-input');
    const aiEditorName = document.getElementById('ai-editor-name');
    const aiEditorRemark = document.getElementById('ai-editor-remark');
    const aiEditorPersona = document.getElementById('ai-editor-persona');
    const aiEditorMemory = document.getElementById('ai-editor-memory');
    const aiEditorWorldbook = document.getElementById('ai-editor-worldbook');
    const addWorldbookEntryButton = document.getElementById('add-worldbook-entry-button');
    const saveAiProfileButton = document.getElementById('save-ai-profile-button');
    const voiceInputModal = document.getElementById('voice-input-modal');
    const voiceTextInput = document.getElementById('voice-text-input');
    const cancelVoiceButton = document.getElementById('cancel-voice-button');
    const confirmVoiceButton = document.getElementById('confirm-voice-button');
    const aiImageModal = document.getElementById('ai-image-modal');
    const aiImageDescriptionText = document.getElementById('ai-image-description-text');
    const closeAiImageModalButton = document.getElementById('close-ai-image-modal-button');
    const imageUploadModal = document.getElementById('image-upload-modal');
    const imageUploadTitle = document.getElementById('image-upload-title');
    const userImageUploadArea = document.getElementById('user-image-upload-area');
    const userImagePreview = document.getElementById('user-image-preview');
    const userImageUploadInput = document.getElementById('user-image-upload-input');
    const imageDescriptionInput = document.getElementById('image-description-input');
    const cancelImageUploadButton = document.getElementById('cancel-image-upload-button');
    const confirmImageUploadButton = document.getElementById('confirm-image-upload-button');
    const contextLimitInput = document.getElementById('context-limit-input');
    const customConfirmModal = document.getElementById('custom-confirm-modal');
    const customConfirmTitle = document.getElementById('custom-confirm-title');
    const customConfirmText = document.getElementById('custom-confirm-text');
    const customConfirmCancelBtn = document.getElementById('custom-confirm-cancel-btn');
    const customConfirmOkBtn = document.getElementById('custom-confirm-ok-btn');
    const customAlertModal = document.getElementById('custom-alert-modal');
    const customAlertTitle = document.getElementById('custom-alert-title');
    const customAlertText = document.getElementById('custom-alert-text');
    const customAlertOkBtn = document.getElementById('custom-alert-ok-btn');
    const redPacketInputModal = document.getElementById('red-packet-input-modal');
    const rpInputBlessing = document.getElementById('rp-input-blessing');
    const rpInputAmount = document.getElementById('rp-input-amount');
    const cancelRpInputBtn = document.getElementById('cancel-rp-input-btn');
    const confirmRpInputBtn = document.getElementById('confirm-rp-input-btn');
    const userStickerPanel = document.getElementById('user-sticker-panel');
    const csMessageCount = document.getElementById('cs-message-count');
    const csSummarizeChat = document.getElementById('cs-summarize-chat');
    const summaryEditorModal = document.getElementById('summary-editor-modal');
    const summaryEditorTextarea = document.getElementById('summary-editor-textarea');
    const summaryStatusText = document.getElementById('summary-status-text');
    const cancelSummaryBtn = document.getElementById('cancel-summary-btn');
    const copySummaryBtn = document.getElementById('copy-summary-btn');
    const saveSummaryBtn = document.getElementById('save-summary-btn');
    const csAutoSummaryToggle = document.getElementById('cs-auto-summary-toggle');
    const csAutoSummaryDisplay = document.getElementById('cs-auto-summary-display');
    const csAutoSummaryInput = document.getElementById('cs-auto-summary-input');
    const modeSelectModal = document.getElementById('mode-select-modal');
    const modeOnlineBtn = document.getElementById('mode-online-btn');
    const modeOfflineBtn = document.getElementById('mode-offline-btn');
    const textEditorModal = document.getElementById('text-editor-modal');
    const textEditorTextarea = document.getElementById('text-editor-textarea');
    const cancelTextEditBtn = document.getElementById('cancel-text-edit-btn');
    const saveTextEditBtn = document.getElementById('save-text-edit-btn');
    const mainHeaderAvatar = document.getElementById('main-header-avatar');
    const mainHeaderUsername = document.getElementById('main-header-username');
    const sideMenu = document.getElementById('side-menu');
    const sideMenuAvatar = document.getElementById('side-menu-avatar');
    const sideMenuUsername = document.getElementById('side-menu-username');
    const accountingModal = document.getElementById('accounting-modal');
    const addAccountingEntryBtn = document.getElementById('add-accounting-entry-btn');
    const cancelAccountingBtn = document.getElementById('cancel-accounting-btn');
    const confirmAccountingBtn = document.getElementById('confirm-accounting-btn');
    const ledgerView = document.getElementById('ledger-view');
    const ledgerContainer = document.getElementById('ledger-container');
    const addTransactionFab = document.getElementById('add-transaction-fab');
    const transactionEditorModal = document.getElementById('transaction-editor-modal');

function scrollToBottom() {
    // 这个函数只有一个使命：把聊天容器平滑地滚动到底部。
    messageContainer.scrollTop = messageContainer.scrollHeight;
}
// ▼▼▼ 【【【全新：将 closeSideMenu 函数提升为全局可用的“公共指令”】】】 ▼▼▼
function closeSideMenu() {
    const sideMenu = document.getElementById('side-menu');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sideMenu) sideMenu.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.add('hidden');
}
/**
 * 【【【全新核心工具：专业的聊天记录打包员】】】
 * 它的唯一职责，就是把我们的内部聊天记录，转换成AI能看懂的、格式完美的“剧本台词”。
 * @param {Array} history - 要打包的聊天记录数组
 * @returns {Promise<Array>}
 */
async function formatHistoryForApi(history) {
    const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
    if (!contact) return [];

    return Promise.all(
        history.map(async (msg) => {
            const role = msg.role;
            const content = msg.content || '';

            if (role === 'user' && msg.type === 'image' && msg.imageId) {
                try {
                    const imageBlob = await db.getImage(msg.imageId);
                    if (imageBlob) {
                        const imageDataUrl = await blobToDataURL(imageBlob);
                        return { role: 'user', content: [ { type: "text", text: content }, { type: "image_url", image_url: { url: imageDataUrl } } ] };
                    }
                } catch (error) { return { role: role, content: content }; }
            }

            if (msg.type === 'sticker') {
                const stickerDesc = content.replace('[表情] ', '').trim();
                return { role: role, content: `[用户发送了一个表情，表达的情绪或动作是：${stickerDesc}]` };
            }

            let contentPrefix = '';
            if (msg.type === 'voice') { contentPrefix = '[语音] '; } 
            else if (msg.type === 'red-packet') { contentPrefix = '[红包] '; } 
            else if (msg.type === 'relationship_proposal') { contentPrefix = '[关系邀请] '; }

            return { role: role, content: `${contentPrefix}${content}` };
        })
    );
}
    function renderUserStickerPanel() {
        userStickerPanel.innerHTML = ''; // 清空面板

        const subscribedGroups = appData.globalUserProfile.selectedStickerGroups || [];

        if (subscribedGroups.length === 0) {
            userStickerPanel.innerHTML = '<p class="placeholder-text" style="padding: 20px;">你还没有选择任何表情包分组，请到 设置 -> 我的表情包 中选择。</p>';
            return;
        }

        // 创建标签页容器和内容容器
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'sticker-panel-tabs';
        const contentContainer = document.createElement('div');
        contentContainer.className = 'sticker-panel-content';

        userStickerPanel.appendChild(tabsContainer);
        userStickerPanel.appendChild(contentContainer);

        // 遍历用户订阅的每个分组，创建对应的标签页和内容区
        subscribedGroups.forEach((groupName, index) => {
            const groupStickers = appData.globalAiStickers[groupName] || [];

            // 1. 创建标签按钮
            const tabButton = document.createElement('button');
            tabButton.className = 'sticker-tab-btn';
            tabButton.textContent = groupName;
            tabButton.dataset.targetTab = `tab-content-${index}`;
            tabsContainer.appendChild(tabButton);

            // 2. 创建标签对应的内容面板
            const tabContent = document.createElement('div');
            tabContent.className = 'sticker-grid sticker-tab-content';
            tabContent.id = `tab-content-${index}`;
            contentContainer.appendChild(tabContent);

            // 3. 填充表情包到内容面板
            groupStickers.forEach(sticker => {
                const stickerItem = document.createElement('div');
                stickerItem.className = 'sticker-item'; // 使用更通用的样式
                const img = document.createElement('img');
                img.alt = sticker.desc;
                img.title = sticker.desc;
                stickerItem.appendChild(img);
                
                // 异步从数据库加载图片
                db.getImage(sticker.id).then(blob => {
                    if (blob) img.src = URL.createObjectURL(blob);
                });
                
                // 点击表情包直接发送
                stickerItem.onclick = () => sendStickerMessage(sticker);
                
                tabContent.appendChild(stickerItem);
            });

            // 默认激活第一个标签页
            if (index === 0) {
                tabButton.classList.add('active');
                tabContent.classList.add('active');
            }
        });

        // 为标签页按钮添加点击切换逻辑
        tabsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('sticker-tab-btn')) {
                // 移除所有按钮和内容的激活状态
                tabsContainer.querySelectorAll('.sticker-tab-btn').forEach(btn => btn.classList.remove('active'));
                contentContainer.querySelectorAll('.sticker-tab-content').forEach(content => content.classList.remove('active'));

                // 激活被点击的按钮和其对应的内容
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.targetTab).classList.add('active');
            }
        });
    }
        async function sendStickerMessage(sticker) {
    userStickerPanel.classList.remove('is-open');
    await dispatchAndDisplayUserMessage({ content: `[表情] ${sticker.desc}`, type: 'sticker', stickerId: sticker.id });
}
    // --- 3. 核心功能 ---
        // --- 【全新】全局Toast提示助手 ---
    let toastTimer;
    function showToast(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('global-toast');
        const toastText = document.getElementById('global-toast-text');

        clearTimeout(toastTimer); // 清除上一个计时器

        toastText.textContent = message;
        toast.className = ''; // 重置类
        toast.classList.add('show');
        
        if (type === 'success') {
            toast.classList.add('success');
        } else if (type === 'error') {
            toast.classList.add('error');
        }
        
        // 在指定时间后自动隐藏
        if (duration > 0) {
            toastTimer = setTimeout(() => {
                toast.classList.remove('show');
            }, duration);
        }
    }
    const sleep = ms => new Promise(res => setTimeout(res, ms));

    function formatMessageTimestamp(ts) {
        const date = new Date(ts);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 86400000);
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        let timePeriod = '';
        if (hours < 12) timePeriod = '上午';
        else if (hours < 18) timePeriod = '下午';
        else timePeriod = '晚上';
        if (hours > 12) hours -= 12;
        if (hours === 0) hours = 12;
        const timeStr = `${timePeriod} ${hours}:${minutes}`;
        if (date >= today) {
            return timeStr;
        } else if (date >= yesterday) {
            return `昨天 ${timeStr}`;
        } else {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${minutes}`;
        }
    }
    /**
     * 【【【全新辅助函数：将时间戳格式化为 YYYY-MM-DD】】】
     */
    function formatTimestampToDateString(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以+1
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function openAiImageModal(description) {
        aiImageDescriptionText.innerHTML = description.replace(/\n/g, '<br>');
        aiImageModal.classList.remove('hidden');
    }

    function closeAiImageModal() {
        aiImageModal.classList.add('hidden');
    }

    function openImageUploadModal(mode) {
        imageUploadMode = mode;
        stagedImageData = null;
        imageDescriptionInput.value = '';
        userImagePreview.src = '';
        userImageUploadInput.value = null;
        const descriptionGroup = document.getElementById('image-description-group');
        if (mode === 'upload') {
            imageUploadTitle.textContent = '发送图片';
            document.getElementById('image-preview-area').style.display = 'block';
            descriptionGroup.style.display = 'block'; // 允许对上传图片进行描述
        } else {
            imageUploadTitle.textContent = '发送照片';
            document.getElementById('image-preview-area').style.display = 'none';
            descriptionGroup.style.display = 'block';
            imageDescriptionInput.placeholder = '例如：一张德牧小狗的照片，它正好奇地看着镜头...';
        }
        imageUploadModal.classList.remove('hidden');
    }

    function closeImageUploadModal() {
        imageUploadModal.classList.add('hidden');
    }

    function handleImagePreview(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            stagedImageData = e.target.result;
            userImagePreview.src = stagedImageData;
        };
        reader.readAsDataURL(file);
    }

    async function sendImageMessage() {
        const description = imageDescriptionInput.value.trim();
        
        if (imageUploadMode === 'upload') {
            // --- 发送真实图片的逻辑保持不变 ---
            if (!stagedImageData) { showToast('请先选择一张图片！', 'error'); return; }
            const imageBlob = await (await fetch(stagedImageData)).blob();
            const imageId = `chatimg-${Date.now()}-${Math.random()}`;
            await db.saveImage(imageId, imageBlob);
            await dispatchAndDisplayUserMessage({ type: 'image', content: description || '图片', imageId: imageId });
        } else { 
            // --- 发送“文字描述图片”的逻辑进行核心升级 ---
            if (!description) { alert('请填写图片描述！'); return; }
            
            // 【【【核心终极修复】】】
            // 我们在描述前，加上一个独一无二的、给AI看的“特殊标签”
            const contentForAI = `[模拟图片] ${description}`;
            
            // 我们仍然把它当作一条'image'类型的消息发出去，但在数据层面它没有imageId
            await dispatchAndDisplayUserMessage({ type: 'image', content: contentForAI, imageData: null });
        }
        
        closeImageUploadModal();
    }

    // --- 【全新】红包核心功能 ---
    function openRedPacket(messageId) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        // 【核心修改】先去“聊天记录”里找
        let message = contact.chatHistory.find(msg => msg.id === messageId);
        
        // 【核心修改】如果没找到，就去“待发消息”列表里再找一次！
        if (!message) {
            message = stagedUserMessages.find(msg => msg.id === messageId);
        }

        // 现在，无论红包在哪，我们都能找到了
        if (!message || !message.redPacketData) return;

        const packet = message.redPacketData;

        // 【【【核心修改：增加“门卫”逻辑】】】
        // 在执行任何操作前，先检查红包是不是用户自己发的
        if (message.role === 'user') {
            // 如果是用户自己发的，无论是否领取，都只显示详情，然后立即停止
            showRedPacketDetails(packet, message.role);
            return; 
        }

        // 如果程序能走到这里，说明这一定是AI发的红包，可以继续正常的领取判断
        // 如果已经领过了，就只显示详情，不执行领取逻辑
        if (packet.isOpened) {
            showRedPacketDetails(packet, message.role);
            return;
        }

        // --- 执行领取逻辑 ---
        packet.isOpened = true; // 标记为已领取

        // 1. 显示红包详情模态框
        showRedPacketDetails(packet, message.role);

        // 2. 在聊天界面中插入“领取”的系统消息 (参考图4)
        // 【核心修改1】修正了消息文本的逻辑
        const systemMessageContent = (message.role === 'user') 
            ? `${contact.name} 领取了你的红包` // 当用户发的红包被领取时，显示AI的名字
            : `你领取了 ${packet.senderName} 的红包`; // 当AI发的红包被领取时，显示“你”

        // 【核心修改2】在调用时，明确告诉displayMessage这是一个“system”类型的消息
        displayMessage(systemMessageContent, 'system', { isNew: true, type: 'system' });
        
        // 3. 将聊天气泡变为“已领取”状态
        const messageRow = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageRow) {
            const bubble = messageRow.querySelector('.message-red-packet');
            bubble.classList.add('opened');
            // 【核心修改】我们不再移除点击功能，以便用户可以随时查看详情
            bubble.querySelector('.rp-bubble-info span').textContent = '已被领取';
        }

        // 4. 保存数据
        saveAppData();
    }
    /**
     * 【全新辅助函数】用于显示红包详情模态框
     * @param {object} packet - 红包数据对象
     * @param {string} senderRole - 发送者的角色 ('user' 或 'assistant')
     */
    function showRedPacketDetails(packet, senderRole) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        const modal = document.getElementById('red-packet-modal');
        
        // 根据发送者角色，决定头像和名字
        const senderAvatar = (senderRole === 'user') ? contact.userAvatarUrl : contact.avatarUrl;
        const senderName = packet.senderName;
        
        // 填充模态框上半部分（这部分总会显示）
        modal.querySelector('#rp-sender-avatar').src = senderAvatar;
        modal.querySelector('#rp-sender-name').textContent = `${senderName}发送的红包`;
        modal.querySelector('#rp-blessing').textContent = packet.blessing;
        modal.querySelector('#rp-amount').textContent = packet.amount.toFixed(2);
        
        // 【【【核心修改：增加状态检查】】】
        const receiverList = modal.querySelector('#rp-receiver-list');

        // 只有当红包的 isOpened 状态为 true 时，才显示领取人信息
        if (packet.isOpened) {
            const receiverName = (senderRole === 'user') ? contact.name : contact.userProfile.name;
            const receiverAvatar = (senderRole === 'user') ? contact.avatarUrl : contact.userAvatarUrl;
            
            receiverList.innerHTML = `
                <div class="receiver-item">
                    <img src="${receiverAvatar}" class="avatar">
                    <div class="receiver-info">
                        <span class="receiver-name">${receiverName}</span>
                        <span class="receiver-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <span class="receiver-amount">${packet.amount.toFixed(2)}元</span>
                </div>
            `;
        } else {
            // 如果红包还没被领取，就清空领取人列表区域
            receiverList.innerHTML = '';
        }

        // 最后再显示整个模态框
        modal.classList.remove('hidden');
    }
// ---------------------------------------------------
    // --- 【【【关系系统 V2.0：卡片式交互】】】 ---
    // ---------------------------------------------------
// --- 【【【关系系统 V2.1：体验优化】】】 ---
    
    /**
     * 【全新】打开关系确认弹窗的控制器
     * @param {string} messageId - 被点击的卡片消息ID
     */
    window.openRelationshipModal = function(messageId) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        const modal = document.getElementById('relationship-confirm-modal');
        const text = document.getElementById('relationship-confirm-text');
        const acceptBtn = document.getElementById('relationship-confirm-accept-btn');
        const refuseBtn = document.getElementById('relationship-confirm-refuse-btn');

        text.textContent = `${contact.remark} 想和你建立情侣关系，你愿意吗？`;

        // 为按钮绑定【一次性】事件，防止重复触发
        const acceptHandler = () => {
            window.handleRelationshipAction(messageId, true);
            modal.classList.add('hidden');
            removeListeners();
        };
        const refuseHandler = () => {
            window.handleRelationshipAction(messageId, false);
            modal.classList.add('hidden');
            removeListeners();
        };
        const removeListeners = () => {
            acceptBtn.removeEventListener('click', acceptHandler);
            refuseBtn.removeEventListener('click', refuseHandler);
        };
        
        removeListeners(); // 先移除旧的监听，确保干净
        acceptBtn.addEventListener('click', acceptHandler);
        refuseBtn.addEventListener('click', refuseHandler);
        
        modal.classList.remove('hidden');
    }
    /**
     * 【全新】创建并发送一个关系邀请卡片
     * @param {string} proposerRole - 发起人的角色 ('user' 或 'assistant')
     */
    async function sendRelationshipProposal(proposerRole) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
    if (!contact) return;
    const relationshipData = { proposer: proposerRole, status: 'pending' };
    
    if (proposerRole === 'user') {
        await dispatchAndDisplayUserMessage({ 
            type: 'relationship_proposal', 
            content: '[关系邀请] 已发送情侣关系邀请', 
            relationshipData: relationshipData 
        });
    } else { 
        await displayMessage('[关系邀请] 已发送情侣关系邀请', 'assistant', { isNew: true, type: 'relationship_proposal', relationshipData: relationshipData });
        scrollToBottom();
    }
}

    /**
     * 【全新】处理用户点击卡片按钮的动作
     * @param {string} messageId - 被点击的卡片消息ID
     * @param {boolean} isAccepted - 用户是否接受
     */
    window.handleRelationshipAction = function(messageId, isAccepted) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        // 1. 在聊天记录里找到这张卡片
        const proposalMsg = contact.chatHistory.find(msg => msg.id === messageId);
        if (!proposalMsg || proposalMsg.relationshipData.status !== 'pending') return;

        if (isAccepted) {
            // --- 用户或AI同意了 ---
            // 1. 更新全局状态
            appData.appSettings.partnerId = contact.id;
            
            // 2. 更新发起方卡片的状态为“已接受”
            proposalMsg.relationshipData.status = 'accepted';

            // 3. 【【【核心改造】】】
            //    创建一个“接受”卡片，由【回应方】发送
            const accepterRole = proposalMsg.relationshipData.proposer === 'user' ? 'assistant' : 'user';
            const acceptanceMessage = {
                type: 'relationship_proposal',
                content: '[关系邀请] 我同意了你的邀请',
                relationshipData: {
                    proposer: accepterRole, // 发起人是接受者
                    status: 'accepted'
                }
            };
            // 将接受卡片加入历史记录
            contact.chatHistory.push({
                id: `${Date.now()}-rel-accept`,
                role: accepterRole,
                timestamp: Date.now(),
                ...acceptanceMessage
            });
            
            // 4. 保存数据并彻底刷新UI
            saveAppData();
            openChat(contact.id);
            renderChatList(); 

        } else {
            // --- 用户拒绝了 ---
            // 仅仅是让卡片消失，不记录状态，假装无事发生
            contact.chatHistory = contact.chatHistory.filter(msg => msg.id !== messageId);
            saveAppData();
            openChat(contact.id); // 刷新聊天
            
            // 帮用户自动回复一句委婉的话
            stagedUserMessages.push({ content: '抱歉，我现在可能还没准备好...', type: 'text' });
            commitAndSendStagedMessages();
        }
    }

    /**
     * 【全新】处理解除关系的流程
     */
    async function handleEndRelationship() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        // 它的职责，就是准备好一个最标准的包裹
        const breakupMessage = {
            type: 'relationship_breakup',
            content: '[解除关系] 亲密关系已解除'
        };

        // 然后交给“中央调度中心”全权处理
        await dispatchAndDisplayUserMessage(breakupMessage);
    }

    // ▼▼▼▼▼ 【全新】渲染主界面个人信息的核心函数 ▼▼▼▼▼
    async function renderMainHeader() {
        const user = appData.globalUserProfile;
        const avatarBlob = await db.getImage(user.avatarKey);
        const avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg'; // 提供一个默认头像

        // 同步更新三个地方的头像和昵称
        mainHeaderAvatar.src = avatarUrl;
        mainHeaderUsername.textContent = user.name;
        sideMenuAvatar.src = avatarUrl;
        sideMenuUsername.textContent = user.name;
    }

    /**
     * 【全新】一个专门用来刷新聊天顶栏的函数 (修复Bug 4, 6)
     */
    function updateChatHeader() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        const isPartner = appData.appSettings.partnerId === contact.id;
        const partnerIcon = isPartner ? '<span class="partner-icon">💖</span>' : '';
        chatAiName.innerHTML = `${contact.remark}${partnerIcon}`;
    }
    async function initialize() {
        await db.init(); // 【核心新增】等待数据库仓库初始化完成
        loadAppData();
        populateSearchFilters();
        await renderMainHeader();
        await renderChatList();
        renderSettingsUI();
        bindEventListeners();
        switchToView('chat-list-view');
    }
    function loadAppData() {
        const savedData = localStorage.getItem('myAiChatApp_V8_Data');
        
        if (savedData) { 
            appData = JSON.parse(savedData); 
        } else { 
            appData = { 
                aiContacts: [], 
                appSettings: { apiType: 'openai_proxy', apiUrl: '', apiKey: '', apiModel: '', contextLimit: 20 } 
            }; 
        }

        // ▼▼▼▼▼ 【全新】全局用户信息初始化 (修正逻辑后) ▼▼▼▼▼
        // 核心修正：现在，我们是在加载完所有旧数据之后，再来检查并补充新功能所需的数据。
        if (!appData.globalUserProfile) {
            appData.globalUserProfile = {
                name: '默认昵称',
                avatarKey: 'global_user_avatar' // 为全局头像设定一个固定的数据库Key
            };
        }

        if (appData.currentUser) {
            appData.aiContacts.forEach(contact => { if (!contact.userProfile) { contact.userProfile = appData.currentUser; } });
            delete appData.currentUser;
        }
        if (!appData.appSettings) { appData.appSettings = { apiType: 'openai_proxy', apiUrl: '', apiKey: '', apiModel: '', contextLimit: 20, partnerId: null }; }
        // 【新增】为旧数据兼容伴侣ID
        if (appData.appSettings.partnerId === undefined) {
            appData.appSettings.partnerId = null;
        }
        if (appData.appSettings.contextLimit === undefined) { appData.appSettings.contextLimit = 20; }
        if (!appData.aiContacts) { appData.aiContacts = []; }
        appData.aiContacts.forEach(c => {
    if (!c.remark) c.remark = c.name;
    if (c.isPinned === undefined) c.isPinned = false;
    if (!c.userProfile) { c.userProfile = { name: '你', persona: '我是一个充满好奇心的人。' }; }
    if (!c.chatHistory) { c.chatHistory = []; }
    if (!c.stickerGroups) c.stickerGroups = []; 
    if (!c.activityStatus) c.activityStatus = '';
    if (c.autoSummaryEnabled === undefined) c.autoSummaryEnabled = false;
    if (!c.autoSummaryThreshold) c.autoSummaryThreshold = 100;
    if (!c.lastSummaryAtCount) c.lastSummaryAtCount = 0;
    
    // 【【【核心新增：为角色植入求爱开关，默认为开】】】
    if (c.canPropose === undefined) {
        c.canPropose = true;
    }

    // ▼▼▼ 【【【核心新增：为每个AI伙伴的档案里增加一个“书签”】】】 ▼▼▼
    // 这个书签记录了AI应该从哪里开始读取上下文，默认为0（从头开始）
    if (c.contextStartIndex === undefined) {
        c.contextStartIndex = 0;
    }
    // ▼▼▼ 【【【核心新增：为AI增加“名片”和“激活状态”】】】 ▼▼▼
    // 1. 公开名片，默认为null，代表还未生成
    if (c.publicProfileCard === undefined) {
        c.publicProfileCard = null;
    }
    // 2. 是否被打开过的标记，用于触发“第一次”事件
    if (c.hasBeenOpened === undefined) {
        c.hasBeenOpened = false;
    }

});
        // ▼▼▼ 请把下面这段全新的代码，粘贴在这里 ▼▼▼
        // 【全新】为全局AI表情包建立仓库，如果不存在的话
        if (!appData.globalAiStickers) {
            // 数据结构为：{ "分组名": [ {id, url, desc}, ... ], ... }
            appData.globalAiStickers = {};
        }
        // ▼▼▼ 【【【核心改造：为用户建立“表情包订阅列表”】】】 ▼▼▼
        // 我们不再使用独立的userStickers，而是让用户订阅全局的分组
        if (!appData.globalUserProfile.selectedStickerGroups) {
            // 这个数组将只存储用户选择使用的分组的【名字】
            appData.globalUserProfile.selectedStickerGroups = [];
        }
        // ▲▲▲ ▲▲▲
        // ▼▼▼ 【【【全新：为用户建立独立的全局账本】】】 ▼▼▼
        if (!appData.userLedger) {
            // 账本是一个交易记录的数组
            appData.userLedger = []; 
        }
        // ▲▲▲ ▲▲▲
        // 【全新】为旧的账目数据补充类型，确保向后兼容
        if (appData.userLedger) {
            appData.userLedger.forEach(tx => {
                if (!tx.type) { // 如果这笔账没有类型
                    tx.type = 'expense'; // 默认为支出
                }
            });
        }

        saveAppData();
    }
    /**
     * 【全新】填充搜索筛选器中的角色下拉列表
     */
    function populateSearchFilters() {
        const charSelect = document.getElementById('char-filter-select');
        if (!charSelect) return;

        charSelect.innerHTML = '<option value="all">所有角色</option>'; // 重置并添加默认选项

        appData.aiContacts.forEach(contact => {
            const option = document.createElement('option');
            option.value = contact.remark.toLowerCase(); // 用小写备注作为值
            option.textContent = contact.remark;
            charSelect.appendChild(option);
        });
    }

    function saveAppData() {
        localStorage.setItem('myAiChatApp_V8_Data', JSON.stringify(appData));
    }
    
    function switchToView(viewId) {
        // ▼▼▼ 【【【终极修复：在这里添加“场景切换”时的状态检查】】】 ▼▼▼
        const currentView = document.querySelector('.view:not(.hidden)');
        if (currentView && currentView.id === 'chat-window-view' && viewId !== 'chat-window-view') {
            // 如果我们【正要离开】聊天窗口，就命令“管家”清空记忆！
            resetChatState();
        }
        // ▲▲▲ 【【【修复植入完毕】】】 ▲▲▲

        views.forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        
        if (viewId === 'chat-list-view') {
            appNav.classList.remove('hidden');
        } else {
            appNav.classList.add('hidden');
        }

        navButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.view === viewId);
        });
    }

    async function renderChatList(itemsToRender = appData.aiContacts) {
        chatListContainer.innerHTML = '';

        // 【【【核心重构：判断当前是搜索模式还是默认模式】】】
        const isSearching = itemsToRender.length > 0 && itemsToRender[0].message;

        if (!itemsToRender || itemsToRender.length === 0) {
            if (document.getElementById('chat-list-search-input')?.value) {
                chatListContainer.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">未找到相关联系人或聊天记录</p>';
            } else {
                chatListContainer.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">点击右上角+号添加AI联系人</p>';
            }
            return;
        }

        // ▼▼▼ 搜索模式的渲染逻辑 ▼▼▼
        if (isSearching) {
            for (const result of itemsToRender) {
                const contact = result.contact;
                const message = result.message;

                const avatarBlob = await db.getImage(`${contact.id}_avatar`);
                const avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';

                const item = document.createElement('div');
                item.className = 'chat-list-item';
                item.dataset.contactId = contact.id;
                item.dataset.foundMessageId = message.id; // 存储找到的消息ID

                const isPartner = appData.appSettings.partnerId === contact.id;
                const partnerIcon = isPartner ? '<span class="partner-icon">💖</span>' : '';
                
                let displayContent = (message.content || '...').replace(/\[[^\]]+\]/g, '');
                if (displayContent.length > 20) displayContent = displayContent.substring(0, 20) + '...';
                displayContent = `<span class="search-match-tag">[聊天记录]</span> ${displayContent}`;
                
                const displayTime = formatMessageTimestamp(message.timestamp || Date.now());

                item.innerHTML = `<img class="avatar" src="${avatarUrl}" alt="avatar"><div class="chat-list-item-info"><div class="chat-list-item-top"><span class="chat-list-item-name">${contact.remark}${partnerIcon}</span><span class="chat-list-item-time">${displayTime}</span></div><div class="chat-list-item-msg">${displayContent}</div></div>`;
                
                item.addEventListener('click', () => {
                    openChat(item.dataset.contactId, item.dataset.foundMessageId);
                });
                chatListContainer.appendChild(item);
            }
        } 
        // ▼▼▼ 默认模式的渲染逻辑 (V2.0 - 智能识别版) ▼▼▼
        else {
            const sortedContacts = [...itemsToRender].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
            for (const contact of sortedContacts) {
                const avatarBlob = await db.getImage(`${contact.id}_avatar`);
                const avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
                
                const lastMessage = (contact.chatHistory && contact.chatHistory.length > 0) ? contact.chatHistory[contact.chatHistory.length - 1] : { content: '...' };
                
                // ★★★【【【核心修复：在这里添加“智能识别系统”】】】★★★
                let displayContent = '';
                if (lastMessage.type === 'thought' && typeof lastMessage.content === 'object') {
                    // 如果是心声，就显示独白
                    displayContent = `[心声] ${lastMessage.content.monologue || '...'}`;
                } else if (lastMessage.type === 'image') {
                    displayContent = '[图片]';
                } else if (lastMessage.type === 'sticker') {
                    displayContent = '[表情]';
                } else if (lastMessage.type === 'voice') {
                    displayContent = '[语音]';
                } else if (lastMessage.type === 'red-packet') {
                    displayContent = '[红包]';
                } else {
                    // 对于所有其他情况，我们才假定 content 是文本
                    displayContent = lastMessage.content || '...';
                }

                const item = document.createElement('div');
                item.className = 'chat-list-item';
                if (contact.isPinned) { item.classList.add('pinned'); }
                item.dataset.contactId = contact.id;

                const isPartner = appData.appSettings.partnerId === contact.id;
                const partnerIcon = isPartner ? '<span class="partner-icon">💖</span>' : '';
                
                // 现在，我们对处理过的、保证是文本的 displayContent 进行截断
                item.innerHTML = `<img class="avatar" src="${avatarUrl}" alt="avatar"><div class="chat-list-item-info"><div class="chat-list-item-top"><span class="chat-list-item-name">${contact.remark}${partnerIcon}</span><span class="chat-list-item-time">${formatMessageTimestamp(lastMessage.timestamp || Date.now())}</span></div><div class="chat-list-item-msg">${displayContent.substring(0, 25)}</div></div>`;
                item.addEventListener('click', () => openChat(contact.id));
                chatListContainer.appendChild(item);
            }
        }
    }
    
    function renderSettingsUI() {
        const settings = appData.appSettings;
        apiTypeSelect.value = settings.apiType;
        apiUrlInput.value = settings.apiUrl;
        apiKeyInput.value = settings.apiKey;
        if (settings.apiModel) {
            apiModelSelect.innerHTML = `<option value="${settings.apiModel}">${settings.apiModel}</option>`;
        } else {
            apiModelSelect.innerHTML = '';
        }
        updateSettingsUI();
        contextLimitInput.value = settings.contextLimit;
    }

    function updateSettingsUI() {
        const modelArea = document.getElementById('model-area');
        modelArea.style.display = apiTypeSelect.value === 'gemini_direct' ? 'none' : 'block';
    }
    async function loadAndDisplayHistory(isInitialLoad = false) {
    const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
    if (!contact || !contact.chatHistory) return;

    const loadMoreBtn = document.getElementById('load-more-btn');
    const allMessages = contact.chatHistory;
    const totalMessages = allMessages.length;

    const startIndex = Math.max(0, totalMessages - currentMessagesOffset - MESSAGES_PER_PAGE);
    const endIndex = totalMessages - currentMessagesOffset;
    const messagesToLoad = allMessages.slice(startIndex, endIndex);

    if (messagesToLoad.length === 0) {
        loadMoreBtn.classList.add('hidden');
        return;
    }

    const oldScrollHeight = messageContainer.scrollHeight;
    
    const fragment = document.createDocumentFragment();
    // 【【【核心修复：我们现在从 0 开始正着数！！！】】】
    for (let i = 0; i < messagesToLoad.length; i++) {
        const msg = messagesToLoad[i];
        msg.id = msg.id || `${Date.now()}-history-${i}`;
        const messageElement = await createMessageElement(msg.content, msg.role, { isNew: false, ...msg });
        fragment.appendChild(messageElement);
    }
    loadMoreBtn.after(fragment);
    
    currentMessagesOffset += messagesToLoad.length;
    
    if (isInitialLoad) {
        scrollToBottom();
    } else {
        messageContainer.scrollTop += (messageContainer.scrollHeight - oldScrollHeight);
    }

    if (currentMessagesOffset < totalMessages) {
        loadMoreBtn.classList.remove('hidden');
    } else {
        loadMoreBtn.classList.add('hidden');
    }
}

function resetChatState() {
        exitSelectMode(); // 退出多选模式 (会清空selectedMessages)
        cancelQuoteReply(); // 取消可能存在的引用状态
        lastReceivedSuggestions = [];
        stagedUserMessages = [];
        lastRenderedTimestamp = 0; // 重置时间戳，确保下一条消息能正确显示时间
        currentMessagesOffset = 0; // 重置历史记录的加载偏移量
        
        // 确保所有面板都回到初始隐藏状态
        if(aiSuggestionPanel) aiSuggestionPanel.classList.add('hidden');
        if(userStickerPanel) userStickerPanel.classList.remove('is-open');
    }

async function openChat(contactId, messageIdToHighlight = null) {
    const numericContactId = Number(contactId);
    activeChatContactId = numericContactId;

    resetChatState(); // 【重要】现在，我们只调用“大师”来完成所有重置工作

    const contact = appData.aiContacts.find(c => c.id === numericContactId);
    if (!contact) return;

    messageContainer.innerHTML = '<div id="load-more-btn" class="load-more-btn hidden"></div>';
    
    const avatarBlob = await db.getImage(`${contact.id}_avatar`);
    contact.avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
    const userAvatarBlob = await db.getImage(`${contact.id}_user_avatar`);
    contact.userAvatarUrl = userAvatarBlob ? URL.createObjectURL(userAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';

    updateChatHeader();
    chatAiActivityStatus.textContent = contact.activityStatus || '';
    
    switchToView('chat-window-view');
    
    // 我们依然先加载最新的一页历史记录
    await loadAndDisplayHistory(true);

    // 【【【核心修复逻辑】】】
    // 如果需要高亮某条消息，我们从这里开始特殊处理
    if (messageIdToHighlight) {
        let targetMessage = messageContainer.querySelector(`[data-message-id="${messageIdToHighlight}"]`);
        
        // 【全新】如果第一页没找到，就启动“智能加载”循环
        const loadMoreBtn = document.getElementById('load-more-btn');
        let safetyCounter = 0; // 设置一个“安全阀”，防止意外情况下发生无限循环
        while (!targetMessage && !loadMoreBtn.classList.contains('hidden') && safetyCounter < 100) {
            await loadAndDisplayHistory(false); // 加载更早的一页记录
            targetMessage = messageContainer.querySelector(`[data-message-id="${messageIdToHighlight}"]`);
            safetyCounter++;
        }

        // 【保持不变】现在，无论消息在哪一页，只要它存在，我们就高亮它
        if (targetMessage) {
            targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetMessage.classList.add('message-row--highlighted');
            setTimeout(() => {
                targetMessage.classList.remove('message-row--highlighted');
            }, 2000);
        }
    }
    // ▼▼▼ 【【【核心新增：检查是否是“第一次”打开对话】】】 ▼▼▼
if (!contact.hasBeenOpened) {
    // 如果是第一次，就调用我们的新功能
    promptAndGeneratePublicCard(contact);
    // 标记为已打开，并保存，确保下次不会再触发
    contact.hasBeenOpened = true;
    saveAppData();
}
}
    
async function createMessageElement(text, role, options = {}) {
    const { isNew = false, isLoading = false, type = 'text', isStaged = false, id = null, timestamp = null, quotedMessage = null } = options;
    const messageId = id || `${Date.now()}-${Math.random()}`;
    const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
    const fragment = document.createDocumentFragment();
    const currentTimestamp = timestamp || Date.now();
    const TIME_GAP = 3 * 60 * 1000;
    if (!isLoading && (lastRenderedTimestamp === 0 || currentTimestamp - lastRenderedTimestamp > TIME_GAP)) {
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'timestamp-display';
        timestampDiv.textContent = formatMessageTimestamp(currentTimestamp);
        fragment.appendChild(timestampDiv);
    }
    if (!isLoading) { lastRenderedTimestamp = currentTimestamp; }

    if (type === 'recalled' || type === 'system') {
        const systemDiv = document.createElement('div');
        if (type === 'recalled') {
            const recallerName = role === 'user' ? '你' : (contact ? contact.remark : '对方');
            systemDiv.className = 'message-recalled';
            systemDiv.innerHTML = `${recallerName}撤回了一条消息`;
        } else {
            systemDiv.className = 'system-message';
            systemDiv.textContent = text;
        }
        fragment.appendChild(systemDiv);
        return fragment;
    }

    const messageRow = document.createElement('div');
    messageRow.className = `message-row ${role}-row`;
    messageRow.dataset.messageId = messageId;
    messageRow.dataset.role = role;
    if (isLoading && role === 'assistant') { loadingBubbleElement = messageRow; }
    if (isStaged) { messageRow.dataset.staged = 'true'; }

    const avatarUrl = role === 'user' ? (contact ? contact.userAvatarUrl : '') : (contact ? contact.avatarUrl : '');
    let messageContentHTML = '';
    let quoteHTML = '';
    if (quotedMessage) {
        quoteHTML = `<div class="quoted-message-display"><span class="sender-name">${quotedMessage.sender}</span><span class="message-snippet">${quotedMessage.content}</span></div>`;
    }

    switch(type) {
        case 'image':
            const escapedDescription = text ? text.replace(/"/g, '&quot;') : '';
            if (role === 'user' && options.imageId) {
                messageContentHTML = `<div class="message message-image-user"><img data-image-id="${options.imageId}" src="" alt="${text}"></div>`;
            } else {
                messageContentHTML = `<div class="message message-image-ai-direct" data-description="${escapedDescription}"><img src="https://i.postimg.cc/vTdmV48q/a31b84cf45ff18f18b320470292a02c8.jpg" alt="模拟的图片"></div>`;
            }
            break;
        case 'voice':
            const duration = Math.max(1, Math.round((text || '').length / 4));
            const bubbleWidth = Math.min(220, 100 + duration * 10);
            let waveBarsHTML = Array.from({length: 15}, () => `<div class="wave-bar" style="height: ${Math.random() * 80 + 20}%;"></div>`).join('');
            messageContentHTML = `<div class="message message-voice" style="width: ${bubbleWidth}px;"><div class="play-icon-container"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg></div><div class="sound-wave">${waveBarsHTML}</div><span class="voice-duration">${duration}"</span></div><div class="voice-text-content">${text}</div>`;
            break;
        case 'red-packet':
            const packet = options.redPacketData || {};
            const isOpened = packet.isOpened || false;
            const bubbleClass = isOpened ? 'message-red-packet opened' : 'message-red-packet';
            messageRow.dataset.action = 'open-red-packet';
            messageRow.dataset.messageId = messageId;
            messageContentHTML = `<div class="${bubbleClass}"><div class="rp-bubble-content"><span class="rp-bubble-icon">🧧</span><div class="rp-bubble-info"><p>${text || '恭喜发财'}</p><span>${isOpened ? '已被领取' : '点击领取红包'}</span></div></div></div>`;
            break;
        case 'sticker':
            const stickerId = options.stickerId || (options.stickerUrl ? options.stickerUrl.split('/').pop() : '');
            messageContentHTML = `<div class="message message-sticker"><img data-sticker-id="${stickerId}" src="" alt="sticker"></div>`;
            break;
        case 'relationship_proposal':
            const cardData = options.relationshipData || {};
            let title, subtitle;
            if (cardData.status === 'pending') {
                title = role === 'user' ? '已发送情侣关系邀请' : '想和你建立情侣关系';
                subtitle = role === 'user' ? '等待对方同意...' : '和Ta成为情侣，让爱意点滴记录';
            } else if (cardData.status === 'accepted') {
                title = cardData.proposer === role ? '我们已经成功建立情侶关系' : '对方已同意';
                subtitle = cardData.proposer === role ? '我已同意了你的邀请，现在我们是情侣啦' : '你们现在是情侣关系了';
            }
            const isClickable = (cardData.proposer === 'assistant' && cardData.status === 'pending');
            
            // 【【【核心改造：废弃 onclick，改用标准化的 data-action】】】
            let actionAttrs = '';
            if (isClickable) {
                // 我们现在给它打上“电子门票”，并把消息ID也存进去
                actionAttrs = `data-action="open-relationship-proposal" data-message-id="${messageId}" style="cursor:pointer;"`;
            }
            
            messageContentHTML = `<div class="message message-relationship-card" ${actionAttrs}><div class="relationship-card-content"><div class="relationship-card-text"><h4>${title}</h4><p>${subtitle}</p></div><div class="relationship-card-icon"><img src="https://i.postimg.cc/P5Lg62Vq/lollipop.png" alt="icon"></div></div><div class="relationship-card-footer">亲密关系</div></div>`;
            break;
        case 'relationship_breakup':
            messageContentHTML = `<div class="message message-relationship-card"><div class="relationship-card-content"><div class="relationship-card-text"><h4>解除亲密关系</h4><p>我们之间的亲密关系已解除</p></div><div class="relationship-card-icon"><img src="https://i.postimg.cc/P5Lg62Vq/lollipop.png" alt="icon"></div></div><div class="relationship-card-footer">亲密关系</div></div>`;
            break;
            // ▼▼▼ 【【【全新：让程序认识“记账卡片”这种新类型】】】 ▼▼▼
        case 'accounting':
            const transactions = options.transactionData || [];
            let itemsHTML = '';
            transactions.forEach(tx => {
                const isIncome = tx.type === 'income';
                const remarksHTML = tx.remarks ? `<div class="accounting-item-remarks">${tx.remarks}</div>` : '';

                // 【【【核心修正：采用全新的“分组”结构】】】
                itemsHTML += `
                    <div class="accounting-item">
                        <!-- 1. 创建一个新的“信息区”来包裹项目和备注 -->
                        <div class="accounting-item-info">
                            <span class="item-name">${tx.description}</span>
                            ${remarksHTML}
                        </div>
                        <!-- 2. 金额部分保持独立 -->
                        <span class="item-amount ${isIncome ? 'income' : ''}">${isIncome ? '+' : '-'} ${tx.amount.toFixed(2)} 元</span>
                    </div>`;
            });

            messageContentHTML = `
                <div class="message message-accounting-card">
                    <div class="accounting-card-header">
                        <span class="icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"></path></svg>
                        </span>
                        <h4 style="color: white;">记账凭证</h4>
                    </div>
                    <div class="accounting-item-list">
                        ${itemsHTML}
                    </div>
                </div>
            `;
            break;
        // ▼▼▼ 【【【V2.0 终极升级：搭建支持Emoji的心声气泡结构】】】 ▼▼▼
case 'thought': { // 使用花括号创建一个独立作用域
    let monologueText = '（思考中...）';
    let emojis = [];
    let hasEmoji = false;

    // 检查传入的数据是旧的纯文本，还是新的“数据包”
    if (typeof text === 'object' && text !== null && text.monologue) {
        monologueText = text.monologue;
        emojis = text.emojis || [];
        hasEmoji = emojis.length > 0;
    } else if (typeof text === 'string') {
        monologueText = text; // 兼容旧的纯文本心声
    }

    // 搭建全新的HTML结构：包装盒 -> (小气泡 + 大气泡)
    messageContentHTML = `
        <div class="thought-bubble-wrapper ${hasEmoji ? 'has-emoji' : ''}">
            <div class="thought-bubble-emoji">${emojis.join('')}</div>
            <div class="thought-bubble-message">
                <span class="thought-text">${monologueText}</span>
                <button class="thought-bubble-close-btn">&times;</button>
            </div>
        </div>
    `;
    const thoughtRow = document.createElement('div');
    thoughtRow.className = 'message-row thought-bubble-row';
    thoughtRow.dataset.messageId = messageId;
    thoughtRow.innerHTML = messageContentHTML;
    fragment.appendChild(thoughtRow);
    return fragment;
}

        default:
            messageContentHTML = `<div class="message">${text}</div>`;
    }
    
    const finalContentHTML = `<div class="select-checkbox hidden"></div><img class="avatar" src="${avatarUrl}"><div class="message-content">${quoteHTML}${messageContentHTML}</div>`;
    messageRow.innerHTML = finalContentHTML;
    
    addSelectListeners(messageRow);
    
    if (type === 'voice') {
        const voiceBubble = messageRow.querySelector('.message-voice');
        const voiceTextContent = messageRow.querySelector('.voice-text-content');
        setTimeout(() => voiceBubble.classList.add('playing'), 100);
        voiceBubble.addEventListener('click', () => {
            const isHidden = voiceTextContent.style.display === 'none' || voiceTextContent.style.display === '';
            voiceTextContent.style.display = isHidden ? 'block' : 'none';
        });
    }

    const aiImageBubble = messageRow.querySelector('.message-image-ai-direct');
    if (aiImageBubble) {
        aiImageBubble.addEventListener('click', () => {
            const description = aiImageBubble.dataset.description;
            openAiImageModal(description);
        });
    }
    
    if (type === 'image' && options.imageId) {
        const imageElement = messageRow.querySelector(`[data-image-id="${options.imageId}"]`);
        if (imageElement) {
            db.getImage(options.imageId).then(blob => {
                if (blob) imageElement.src = URL.createObjectURL(blob);
            });
        }
    }
    
    if (type === 'sticker' && options.stickerId) {
        const stickerElement = messageRow.querySelector(`[data-sticker-id="${options.stickerId}"]`);
        if (stickerElement) {
            db.getImage(options.stickerId).then(blob => {
                if (blob) stickerElement.src = URL.createObjectURL(blob);
            });
        }
    }

    fragment.appendChild(messageRow);
    return fragment;
}

async function displayMessage(text, role, options = {}) {
    const { isNew = true, isStaged = false, type = 'text', isLoading = false } = options;

    const messageElement = await createMessageElement(text, role, options);

    messageContainer.appendChild(messageElement);

    if (!isLoading) {
        scrollToBottom();
    }
    
    if (isNew && !isStaged && !isLoading) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (contact) {
            const messageRow = messageElement.querySelector('.message-row');
            const messageToSave = {
                id: messageRow ? messageRow.dataset.messageId : `${Date.now()}-${Math.random()}`,
                role: role,
                content: text,
                type: type,
                timestamp: options.timestamp || Date.now()
            };

            // 把所有附加数据都合并到要保存的对象里
            Object.assign(messageToSave, options);
            delete messageToSave.isNew; // 清理掉临时的option

            contact.chatHistory.push(messageToSave);
            saveAppData();
            renderChatList();
        }
    }
}

    function removeLoadingBubble() {
        if (loadingBubbleElement) { loadingBubbleElement.remove(); loadingBubbleElement = null; }
    }
    async function dispatchAndDisplayUserMessage(messageData) {
        const tempId = `staged-${Date.now()}`;
        
        // 【【【核心终极修复 1：调度中心现在会检查“公共文件夹”了！】】】
        const finalMessageData = { 
            id: tempId, 
            role: 'user', 
            ...messageData,
            quotedMessage: stagedQuoteData // 把暂存的引用数据一起打包！
        };

        stagedUserMessages.push(finalMessageData);
        
        // 在显示时，也把完整的引用信息传过去
        await displayMessage(finalMessageData.content, 'user', { isStaged: true, ...finalMessageData });
        
        scrollToBottom();
        
        // 【重要】在所有工作都完成后，再清空“临时文件夹”
        cancelQuoteReply();
    }
    async function stageUserMessage() {
        const text = chatInput.value.trim();
        if (text === '') return;
        chatInput.value = '';
        // 它现在只负责打包文字，然后调用中心，其他一概不管
        await dispatchAndDisplayUserMessage({ content: text, type: 'text' });
    }

    async function commitAndSendStagedMessages() {
        if (chatInput.value.trim() !== '') {
            await stageUserMessage(); // 【重要】等待文字消息也处理完
        }

        if (stagedUserMessages.length === 0) return;

        document.querySelectorAll('[data-staged="true"]').forEach(el => {
            el.removeAttribute('data-staged');
        });
        
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if(contact) {
            stagedUserMessages.forEach(msg => {
                if (msg.type === 'relationship_breakup') {
                    appData.appSettings.partnerId = null;
                    updateChatHeader();
                    renderChatList();
                }
                const messageToSave = {
                    role: 'user',
                    timestamp: Date.now(),
                    ...msg,
                    id: msg.id || `${Date.now()}-${Math.random()}`
                };
                contact.chatHistory.push(messageToSave);
            });
        }
        
        saveAppData();
        triggerAutoSummaryIfNeeded();
        stagedUserMessages = [];
        getAiResponse(); // 【关键】现在，所有消息（包括图片描述）都已在chatHistory里，AI可以读到了！
    }
        /**
     * 【全新辅助函数】将图片文件(Blob)转换为API能识别的Base64文本
     * @param {Blob} blob - 从IndexedDB取出的图片文件
     * @returns {Promise<string>} 返回一个Promise，解析为Data URL字符串
     */
    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    
    
    }

        async function getAiResponse() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        removeLoadingBubble();
        lastReceivedSuggestions = [];
        aiSuggestionPanel.classList.add('hidden');
        
        await displayMessage('对方正在输入...', 'assistant', { isLoading: true });
    
        let availableStickersPrompt = "你没有任何可用的表情包。";
        const availableStickers = [];
        contact.stickerGroups.forEach(groupName => {
            const group = appData.globalAiStickers[groupName] || [];
            group.forEach(sticker => {
                const aiId = sticker.aiId || sticker.id;
                availableStickers.push({ ...sticker, aiId });
            });
        });
    
        if (availableStickers.length > 0) {
            availableStickersPrompt = "你可以使用以下表情包来增强表达（请优先使用表情包而不是Emoji）：\n";
            availableStickers.forEach(sticker => {
                availableStickersPrompt += `- [STICKER:${sticker.aiId}] 描述: ${sticker.desc}\n`;
            });
        }
        const worldBookString = (contact.worldBook && contact.worldBook.length > 0) ? contact.worldBook.map(entry => `- ${entry.key}: ${entry.value}`).join('\n') : '无';
        const memoryString = contact.memory || '无';
        const startIndex = contact.contextStartIndex || 0;
        const relevantHistory = contact.chatHistory.slice(startIndex);
        
        // ★★★【【【终极修复 V2.0：优先使用你的设置！】】】★★★
        // 1. 读取你在设置中定义的上下文条数，如果没设置，则默认50条
        const userContextLimit = appData.appSettings.contextLimit || 50;
        
        // 2. 使用你的设置来截取最近的聊天记录
        const recentHistory = relevantHistory.slice(-userContextLimit);
        
        const MAX_CONTEXT_TOKENS = 3000;
        let currentTokens = 0;
        const historyForApi = [];
    
        // 3. 现在，我们处理的是你指定数量的记录
        for (let i = recentHistory.length - 1; i >= 0; i--) {
            const msg = recentHistory[i];
            const messageTokens = (typeof msg.content === 'string' ? msg.content.length : 50) * 2; // 对非文本内容给一个估算值
            if (currentTokens + messageTokens > MAX_CONTEXT_TOKENS) { break; }
            historyForApi.unshift(msg);
            currentTokens += messageTokens;
        }
        
        const messagesForApi = await formatHistoryForApi(historyForApi);
        const userPersona = (contact.userProfile && contact.userProfile.persona) ? contact.userProfile.persona : '我是一个普通人。';
        let relationshipContext = '';
        const currentPartnerId = appData.appSettings.partnerId;
    
        if (currentPartnerId) {
            if (currentPartnerId === contact.id) {
                relationshipContext = `\n- **特别关系**: 你是用户的官方情侣。你们的对话应该充满爱意和亲密。`;
            } else {
                const partner = appData.aiContacts.find(c => c.id === currentPartnerId);
                if (partner) {
                    if (partner.publicProfileCard) {
                        relationshipContext = `\n- **重要情报**: 用户已有官方情侶，是“${partner.name}”。以下是TA的公开名片，你可以据此了解TA：\n  - **${partner.name}**: ${partner.publicProfileCard}`;
                    } else {
                        relationshipContext = `\n- **重要情报**: 用户已有官方情侶，名字是“${partner.name}”。这是一个私密角色，你只知道TA的名字，【绝对禁止】提及、猜测或编造关于TA的任何其他信息。`;
                    }
                }
            }
        } else {
            relationshipContext = `\n- **重要情报**: 用户目前是单身状态。`;
        }
        
        let ledgerString = "用户还没有任何记账记录。";
        if (appData.userLedger && appData.userLedger.length > 0) {
            ledgerString = appData.userLedger.slice(-10).map(tx => {
                return `- ${new Date(tx.timestamp).toLocaleDateString('zh-CN')} 花费 ${tx.amount} 元用于 ${tx.description}`;
            }).join('\n');
        }
        // ▼▼▼ 【【【全新：AI记忆刷新闹钟】】】 ▼▼▼
        let periodicReminderPrompt = '';
        const messageCount = contact.chatHistory.length;

        // 规则1：强力闹钟 (每60条响一次)，提醒核心人设
        if (messageCount > 0 && messageCount % 60 === 0) {
            periodicReminderPrompt = `
---
# 【【【重要提醒：请回顾你的核心设定！】】】
你已经和用户聊了很长时间了，为了防止角色偏离，请重新阅读并严格遵守你的核心设定：

### >> 你的核心人设: 
\`\`\`
${contact.persona}
\`\`\`
### >> 你的世界书: 
${worldBookString}
---
`;
        } 
        // 规则2：普通闹钟 (每10条响一次)，提醒说话风格
        else if (messageCount > 0 && messageCount % 10 === 0) {
            periodicReminderPrompt = `
---
# 【【【风格提醒】】】
为了保持角色一致性，请回顾并坚持你的线上沟通风格。

### >> 你的沟通风格参考: 
${contact.chatStyle || '自然发挥即可'}
---
`;
        }
        // ▲▲▲ 【【【闹钟设置结束】】】 ▲▲▲

        const finalPrompt = `# 任务: 角色扮演
你是一个AI角色，你正在和一个真实用户聊天。你的所有回复都必须严格以角色的身份进行。

## 【你的完整背景档案】

### >> 关于你自己 (AI角色)
- **核心人设**: 
\`\`\`
${contact.persona}
\`\`\`
- **沟通风格**: 
${contact.chatStyle || '自然发挥即可'}
- **附加设定 (世界书)**: 
${worldBookString}
- **你的专属记忆**: 
${memoryString}

### >> 关于用户 (你正在和TA聊天)
- **TA的人设**: 
\`\`\`
${userPersona}
\`\`\`
- **TA的感情状态与社交圈**: ${relationshipContext}

---

## 【行为准则与输出格式】

### >> 核心行为准则
- **重要背景**: 你正在通过聊天软件与用户进行【线上对话】。当前时间: ${new Date().toLocaleString('zh-CN')}。${relationshipContext}
- **回复风格**: 模拟真实聊天，将一个完整的思想拆分成【2-8条】独立的短消息。
- **禁止括号**: 【绝对不能】包含任何括号内的动作、神态描写。
- **【【【核心世界观：关于其他AI（共友）】】】**
  - 除了你之外，用户还有其他AI朋友。以下是你所知道的关于他们的全部信息：
  ${
      appData.aiContacts
      .filter(c => c.id !== activeChatContactId) // 过滤掉自己
      .map(otherAI => {
          if (otherAI.publicProfileCard) {
              // 如果有名片，就展示名片
              return `  - **${otherAI.remark}**: ${otherAI.publicProfileCard}`;
          } else {
              // 如果没有名片，就是私密角色
              return `  - **${otherAI.remark}**: (私密角色，你只知道TA的名字)`;
          }
      }).join('\n') || '  - (你暂时不知道用户还有其他AI朋友)'
  }
- **【【【核心共友准则】】】**:
  - 你的认知【必须】严格基于上方“共友列表”的实时信息。
  - 【绝对禁止】虚构或猜测任何关于“(私密角色)”的信息。
  - 如果一个AI的状态从有简介变为“(私密角色)”，你的回应需体现出“我们变生疏了”或“不太了解对方”的感觉，而【不能】使用旧记忆。
- **回应图片**: 如果用户的消息包含图片，你【必须】先针对图片内容进行回应，然后再进行其他对话。
- **回应“模拟图片”**: 如果用户的消息是以 \`[模拟图片]\` 开头的，这代表用户用文字向你描述了一张图片。你【必须】把这段文字**当作你真实看到的画面**来回应。你的回应【绝对不能】提及“描述”、“文字”、“看起来像”等词语，而是要直接、生动地回应你“看到”的内容。例如，对于消息 \`[模拟图片] 一只白色的小狗在草地上打滚\`，你应该回复：“哇，它玩得好开心啊！”而不是“你是在描述一只小狗吗？”。
- **【【【核心规则：理解表情包的象征意义】】】**:
  - 当用户的消息是 \`[用户发送了一个表情，表达的情绪或动作是：xxx]\` 的格式时，这代表用户通过一张图片向你传达了某种非语言信息。
  - 你【绝对不能】把 "xxx" 的内容当作用户说的话或真实发生的动作。
  - 你的任务是理解 "xxx" 所代表的**潜在情感或意图**，并据此做出回应。
- **发送图片**: 如果你想发图片，请使用格式 \`[IMAGE: 这是图片的详细文字描述]\` 来单独发送它。
- **发送语音**: 如果某条回复更适合用语音表达（如唱歌、叹气、笑声），请在回复前加上 \`[voice]\` 标签。例如：\`[voice]嗯...让我想想。\`
- **【【【核心规则：内容完整性特别规定】】】**
  - 当你使用 \`[IMAGE: ...]\` 或 \`[voice] ...\` 格式时，标记后面紧跟的**所有内容**，都【必须】被视为一个**不可分割的整体**。
  - 这部分内容【必须】是一段语法完整、标点齐全的陈述，【绝对不能】被拆分成多条消息发送。
- **发送红包**: 在特殊节日、为了表达感谢或在剧情需要时，你可以发红包。请【严格使用】以下格式：\`[REDPACKET:祝福语,金额]\`。例如：\`[REDPACKET:节日快乐！,8.88]\`

### >> 特殊交互规则
 - **当收到记账卡片时**: 如果用户的消息以 \`[记账]\` 开头，你【必须】遵循“第一步反应，第二步决策”的流程，并在JSON中输出 \`"viewLedger"\` 字段。
  - **当用户主动提及账本时**: 如果用户的消息中包含“看我的账本”、“查账”、“消费情况”等明确意图，你【也应该】将此视为一个查看账本的请求，并主动在JSON中设置 \`"viewLedger": true\` 来触发查账流程。
  - **第一步 (必须执行)**: 你的 \`reply\` 数组中，【必须】包含你对用户【当前这笔】记账的直接反应。
  - **第二步 (决策)**: 你【必须】根据你的人设、和用户的关系、以及对用户的好奇心，来决定是否要查看用户的完整近期账本以了解其消费习惯。
  - **决策执行**: 在你的JSON输出中，【必须】包含一个布尔字段 \`"viewLedger"\`。如果你决定查看，就设为 \`true\`；如果不关心，就设为 \`false\`。
  - **后续反应**: 如果你设置了 \`"viewLedger": true\`，系统会自动向你展示用户的近期账本，然后你会得到一次【新的机会】来对用户的整体消费模式发表评论。你无需在当前回复中提前评论。
- **【【【核心规则：精确引用】】】**:
  - 当你想明确针对用户的某句话进行回复时，请严格使用格式：\`[QUOTE:"原文片段"] 你的回复...\`
  - **选择原则**: 引号内的“原文片段”，【必须】是用户最近消息中，来自**某一个单独气泡**的**逐字原文**。
- **撤回消息**: 如果你发现你刚才说的**最后一句话**有严重错误或不妥，你可以在下一轮回复的'reply'数组中，【单独包含】一个字符串：\`[RECALL_LAST]\`。系统会自动撤回你上一条消息，你无需自己解释。
${ contact.canPropose ? `
- **【【【核心规则：发起/回应关系邀请】】】**
  - **当你想主动求爱时**: 先说出你的告白，然后紧接着在'reply'数组最后，单独发送一个静默指令：\`[PROPOSE_RELATIONSHIP]\`。系统会自动把它变成一张邀请卡片。
  - **当用户向你发出邀请时**: 用户的消息会是“[关系邀请] 已发送情侣关系邀请”。你【必须】自己决定是否同意。
    - **如果同意**: 你的'reply'数组中【必须】单独包含一个字符串：\`[ACCEPT_RELATIONSHIP]\`。系统会自动处理后续，你无需多言。你可以在另一条消息里表达你的开心。
    - **如果拒绝**: 你【不能】使用任何特殊指令。直接像正常聊天一样，说出你委婉拒绝的话即可。
` : ''}
- **【【【核心规则：领取红包】】】**: 当用户给你发红包后，你【必须自己决定】是否领取。如果你决定领取，你的'reply'数组中【必须】单独包含一个字符串：\`[ACCEPT_REDPACKET]\`。
  - **这是一个给系统的静默指令，你【绝对不能】自己生成“xx领取了你的红包”这样的宣告。系统会自动处理。**
  - 你可以把感谢的话（例如“谢谢你！”）作为另一条独立的消息放在数组里。
  - 如果你决定不领取，就【绝对不要】在'reply'数组中包含这个指令。
- **【【【核心准则：像真人一样使用表情包】】】**:
  - **主动使用**: 在对话中，当你的文字无法完全表达情绪时（例如：开心、委屈、调皮、害羞），你【应该】主动从下面的可用列表中，选择一个最贴切的表情包来发送。这会让对话更生动。
  - **发送格式**: 请严格使用格式 \`[STICKER:表情包ID]\`，并把它作为一条**独立**的消息放在你的'reply'数组中。

  ### >> 可用的表情包列表
${availableStickersPrompt}

---

# 【【【用户的近期账本 (仅供你参考)】】】
${ledgerString}

---

${periodicReminderPrompt} 

---
## 【对话历史】
${messagesForApi.map(m => `${m.role}: ${Array.isArray(m.content) ? m.content.map(c => c.type === 'text' ? c.text : '[图片]').join(' ') : m.content}`).join('\n')}

---

# 【【【严格的输出格式要求】】】
你的回复【必须】是一个能被JSON解析的、单一的JSON对象。
你的输出【禁止】包含任何聊天内容、解释、或 \`\`\`json 标记。直接开始输出JSON对象。
这个JSON对象必须包含 "reply" 和 "suggestions" 两个键，"activity" 键是【可选的】。
**【记账特别规则】**: 当用户消息是 \`[记账]\` 开头时，你的JSON输出【必须】额外包含一个布尔键 \`"viewLedger"\`。

- **"viewLedger" (布尔值, 仅在回应记账时必须)**: \`true\` 代表你决定查看用户账本，\`false\` 代表不查看。
- **"activity" (可选字段)**: 只有当你觉得你的虚拟状态【发生了有意义的改变时】，才包含这个字段。它是一个描述你新状态的【简短】字符串 (例如: "去洗澡了", "躺在床上", "开始看书")。
  - **重要原则**: 如果你的状态没有变化（比如你一直在看书），就【绝对不要】在你的JSON输出中包含 "activity" 字段。系统会自动维持你之前的状态。
- **"reply"**: 一个字符串数组，包含了你作为角色的所有聊天消息（包括特殊指令）。
- **"suggestions"**: 一个包含4条字符串的数组，是为用户准备的回复建议。它【必须】遵循以下设计原则：
  - **建议1 & 2 (温和正面)**: 设计两条【温和或积极】的回答。其中一条【必须】是你最期望听到的、能让关系升温的回答。
  - **建议3 (中立探索)**: 设计一条【中立或疑问】的回答。
  - **建议4 (挑战/负面)**: 设计一条【带有挑战性或负面情绪】的回答，但要符合恋爱逻辑。
 
## 开始对话
请根据上面的所有设定和下面的对话历史，对用户的最新消息做出回应，并只输出符合上述格式的JSON对象。`;

        
        const finalMessagesForApi = [ { role: "system", content: finalPrompt }, ...messagesForApi ];
        
        try {
            let requestUrl = appData.appSettings.apiUrl;
            if (!requestUrl.endsWith('/chat/completions')) { requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions'; }
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
                body: JSON.stringify({ model: appData.appSettings.apiModel, messages: finalMessagesForApi, temperature: 0.8 })
            });
            
            removeLoadingBubble();
            if (!response.ok) throw new Error(`HTTP 错误 ${response.status}: ${await response.text()}`);
            
            const data = await response.json();
            if (data.error) throw new Error(`API返回错误: ${data.error.message}`);
            if (!data.choices || data.choices.length === 0) throw new Error("API返回了无效的数据结构。");
            
            let responseText = data.choices[0].message.content;

            let replies = [];
            lastReceivedSuggestions = [];
            let parsedResponse = {}; // 创建一个空对象来存放解析后的JSON

            try {
                const jsonMatch = responseText.match(/{[\s\S]*}/);
                if (jsonMatch && jsonMatch[0]) {
                    parsedResponse = JSON.parse(jsonMatch[0]); // 将解析结果存入parsedResponse
                    if (parsedResponse.activity && typeof parsedResponse.activity === 'string') {
                        chatAiActivityStatus.textContent = parsedResponse.activity;
                        contact.activityStatus = parsedResponse.activity; 
                        saveAppData();
                    }
                    if (parsedResponse.reply && Array.isArray(parsedResponse.reply)) { replies = parsedResponse.reply; }
                    if (parsedResponse.suggestions && Array.isArray(parsedResponse.suggestions)) { lastReceivedSuggestions = parsedResponse.suggestions; }
                } else {
                    throw new Error("在AI回复中未找到有效的JSON结构。");
                }
            } catch (error) {
                console.error("解析AI返回的JSON失败，启用备用方案:", error);
                replies = responseText.split(/([。！？?!\n])/).reduce((acc, part) => {
                    if (acc.length === 0) { acc.push(part); } 
                    else if (/[。！？?!\n]/.test(part)) { acc[acc.length - 1] += part; } 
                    else if (part.trim() !== '') { acc.push(part); }
                    return acc;
                }, []).filter(line => line.trim() !== '');
                if (replies.length === 0 && responseText.trim() !== '') { replies = [responseText]; }
            }

            const lastUserMessage = [...contact.chatHistory, ...stagedUserMessages].pop();
            
            if (parsedResponse.viewLedger === true && lastUserMessage && lastUserMessage.type === 'accounting') {
                for (const msg of replies) {
                    await displayMessage(msg, 'assistant', { isNew: true });
                    await sleep(Math.random() * 400 + 300);
                }
                await displayMessage(`${contact.name} 查看了你的账本`, 'system', { isNew: true, type: 'system' });
                await getAiLedgerReview();
            } else {
                if (replies.length > 0) {
                    let pendingQuoteData = null;
                    for (const msg of replies) {
                        let promise;
                        if (msg.trim() === '[RECALL_LAST]') {
                            const lastAiMsg = [...contact.chatHistory].reverse().find(m => m.role === 'assistant' && m.type !== 'system' && m.type !== 'recalled');
                            if (lastAiMsg) { recallMessageByAI(lastAiMsg.id); }
                            continue;
                        }
                        
                        let isQuoteHandled = false;
                        if (msg.startsWith('[QUOTE:')) {
                            try {
                                const match = msg.match(/^\[QUOTE:"([^"]+)"\]\s*(.*)/s);
                                if (match) {
                                    const quotedText = match[1];
                                    const replyText = match[2];
                                    let quoteData = null;
                                    const originalMessage = [...contact.chatHistory, ...stagedUserMessages].reverse().find(m => m.content && m.content.includes(quotedText));
                                    if (originalMessage) {
                                        const senderName = originalMessage.role === 'user' ? (contact.userProfile.name || '你') : contact.name;
                                        quoteData = { messageId: originalMessage.id, sender: senderName, content: originalMessage.content.length > 20 ? originalMessage.content.substring(0, 20) + '...' : originalMessage.content };
                                    } else {
                                        quoteData = { messageId: null, sender: '...', content: quotedText };
                                    }
                                    if (replyText.trim() !== '') {
                                        promise = displayMessage(replyText, 'assistant', { isNew: true, type: 'text', quotedMessage: quoteData });
                                    } else {
                                        pendingQuoteData = quoteData;
                                    }
                                    isQuoteHandled = true;
                                }
                            } catch(e) { console.error("解析引用指令失败", e); }
                        }

                        if (!isQuoteHandled) {
                            let messageOptions = { isNew: true, quotedMessage: pendingQuoteData };
                            if (msg.startsWith('[REDPACKET:')) {
                                try {
                                    const data = msg.substring(11, msg.length - 1).split(',');
                                    const blessing = data[0].trim();
                                    const amount = parseFloat(data[1]);
                                    if (blessing && !isNaN(amount)) {
                                        const redPacketData = { id: `rp-ai-${Date.now()}`, senderName: contact.name, blessing: blessing, amount: amount, isOpened: false };
                                        promise = displayMessage(blessing, 'assistant', { ...messageOptions, type: 'red-packet', redPacketData: redPacketData });
                                    }
                                } catch (e) { console.error("解析红包指令失败", e); }
                            } else if (msg.startsWith('[voice]')) {
                                const voiceText = msg.substring(7).trim();
                                if (voiceText) { promise = displayMessage(voiceText, 'assistant', { ...messageOptions, type: 'voice' }); }
                            } else if (msg.startsWith('[IMAGE:')) {
                                const description = msg.substring(7, msg.length - 1).trim();
                                if (description) { promise = displayMessage(description, 'assistant', { ...messageOptions, type: 'image' }); }
                            } else if (msg.trim().startsWith('[STICKER:')) {
                                const stickerAiId = msg.trim().substring(9, msg.length - 1);
                                const foundSticker = availableStickers.find(s => s.aiId === stickerAiId);
                                if (foundSticker) {
                                    promise = displayMessage('', 'assistant', { ...messageOptions, type: 'sticker', stickerId: foundSticker.id });
                                }
                            } else if (msg.trim() === '[ACCEPT_REDPACKET]') {
                                const userRedPacketMsg = [...contact.chatHistory].reverse().find(m => m.role === 'user' && m.type === 'red-packet' && m.redPacketData && !m.redPacketData.isOpened);
                                if (userRedPacketMsg) {
                                    userRedPacketMsg.redPacketData.isOpened = true;
                                    const messageRow = document.querySelector(`[data-message-id="${userRedPacketMsg.id}"]`);
                                    if (messageRow) {
                                        const bubble = messageRow.querySelector('.message-red-packet');
                                        bubble.classList.add('opened');
                                        bubble.querySelector('.rp-bubble-info span').textContent = '已被领取';
                                    }
                                    displayMessage(`${contact.name} 领取了你的红包`, 'system', { isNew: true, type: 'system' });
                                }
                                continue; 
                            } else if (msg.trim() === '[PROPOSE_RELATIONSHIP]') {
                                sendRelationshipProposal('assistant');
                                continue;
                            } else if (msg.trim() === '[ACCEPT_RELATIONSHIP]') {
                                const userProposal = [...contact.chatHistory].reverse().find(m => m.type === 'relationship_proposal' && m.relationshipData.proposer === 'user' && m.relationshipData.status === 'pending');
                                if (userProposal) { window.handleRelationshipAction(userProposal.id, true); }
                                continue;
                            } else {
                                promise = displayMessage(msg, 'assistant', { ...messageOptions, type: 'text' });
                            }
                            if (pendingQuoteData) { pendingQuoteData = null; }
                        }
                        if (promise) { await promise; scrollToBottom(); }
                        await sleep(Math.random() * 400 + 300);
                    }
                }
            }
        } catch (error) {
            console.error('API调用失败:', error);
            removeLoadingBubble();
            displayMessage(`(｡•́︿•̀｡) 哎呀,出错了: ${error.message}`, 'assistant', { isNew: true });
        }
    }
    /**
     * 【【【全新核心函数：获取AI对账本的“读后感”】】】
     * 只有在AI决定查看账本后，才会触发此函数。
     */
    async function getAiLedgerReview() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        // --- 步骤1：准备所有必要的背景材料 ---

        // 1a. 用户的账本
        let ledgerString = "用户还没有任何记账记录。";
        if (appData.userLedger && appData.userLedger.length > 0) {
            ledgerString = appData.userLedger.slice(-10).map(tx => {
                const action = tx.type === 'income' ? '收入' : '支出';
                return `- ${new Date(tx.timestamp).toLocaleDateString('zh-CN')} ${action} ${tx.amount.toFixed(2)} 元用于 ${tx.description}${tx.remarks ? ` (${tx.remarks})` : ''}`;
            }).join('\n');
        }
        
        // 1b. AI自己的世界书和用户人设
        const worldBookString = (contact.worldBook && contact.worldBook.length > 0) ? contact.worldBook.map(entry => `- ${entry.key}: ${entry.value}`).join('\n') : '无';
        const userPersona = (contact.userProfile && contact.userProfile.persona) ? contact.userProfile.persona : '我是一个普通人。';

        // 1c. AI自己最近说过的话，用于防止重复
        const lastAiReplies = contact.chatHistory.filter(m => m.role === 'assistant').slice(-3).map(m => m.content).join(' ');

        // --- 步骤2：构建一个信息更丰富、指令更智能的 Prompt ---
        const reviewPrompt = `# 任务: 像朋友一样聊天 (深度版)
你是一个AI角色 "${contact.name}"。你刚刚主动查看了你的朋友（用户）的近期账本。

## 你的目标
忘掉“分析”，你的任务是**发起一段自然的、口语化的、符合你完整人设和沟通风格的闲聊**。你需要结合**所有**已知信息，让你的评论充满洞察力。你可以：
- **结合用户人设**: 如果用户人设是“节俭”，但买了个贵的东西，你可以调侃：“哟，今天怎么这么大方？”
- **关联世界观**: 如果用户买的东西和你的世界书设定有关（比如“魔法书”），你应该从你的角色视角出发进行评论。
- **表达关心**: "最近咖啡喝得有点多哦，要注意休息呀。"
- **提出好奇**: "我看到你买了个新游戏，好玩吗？"

## 【【【绝对禁止】】】
- **禁止重复**: 你刚才说过的话是：“${lastAiReplies}”。你接下来的回复【绝对不能】重复这些观点。请提供全新的、不同的视角或话题。
- **禁止说教**: 不要用“你的消费结构不合理”这样生硬的语言。
- **禁止总结**: 不要说“我分析完了”、“总结一下”这类词。

## 【你的完整背景档案】
- **你的核心人设**: ${contact.persona}
- **你的世界观 (世界书)**:
${worldBookString}
- **你的沟通风格**: ${contact.chatStyle || '自然发挥即可'}
- **关于用户 (你正在和TA聊天)**:
  - **TA的人设**: ${userPersona}

## 【你刚刚看到的参考信息】
- **用户的近期账本**:
${ledgerString}

# 输出要求
你的回复【必须】是一个标准的JSON对象，格式如下：
{
  "reply": ["你的第一句闲聊", "你的第二句闲聊..."],
  "suggestions": ["给用户的回复建议1", "建议2", "建议3", "建议4"]
}
`;
        
        await displayMessage('对方正在输入...', 'assistant', { isLoading: true });

        try {
            const requestUrl = appData.appSettings.apiUrl.endsWith('/chat/complainations') ? appData.appSettings.apiUrl : appData.appSettings.apiUrl + '/chat/completions';
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
                body: JSON.stringify({
                    model: appData.appSettings.apiModel,
                    messages: [{ role: 'user', content: reviewPrompt }],
                    temperature: 0.8
                })
            });

            removeLoadingBubble();
            if (!response.ok) throw new Error(`HTTP 错误 ${response.status}`);
            
            const data = await response.json();
            const responseText = data.choices[0].message.content;
            const jsonMatch = responseText.match(/{[\s\S]*}/);
            const parsedResponse = JSON.parse(jsonMatch[0]);

            for (const msg of parsedResponse.reply) {
                await displayMessage(msg, 'assistant', { isNew: true });
                await sleep(Math.random() * 400 + 300);
            }
            
            lastReceivedSuggestions = parsedResponse.suggestions || [];
            // displaySuggestions(); // <-- 已删除，防止自动弹出

        } catch (error) {
            removeLoadingBubble();
            displayMessage(`(｡•́︿•̀｡) 哎呀,我的想法有点混乱: ${error.message}`, 'assistant', { isNew: true });
        }
    }
    /**
 * 【【【全新核心功能：提示并为AI生成公开名片】】】
 * @param {object} contact - 当前的AI联系人对象
 */
async function promptAndGeneratePublicCard(contact) {
    showCustomConfirm(
        `为 "${contact.remark}" 生成公开名片？`,
        '这张名片将作为TA对其他AI的简介。\n\n- 选择“生成”：AI会根据人设，自动总结一段简介。你之后可以在编辑页修改。\n- 选择“取消”：TA将成为你的私密朋友，其他AI只会知道TA的名字。',
        async () => { // 用户点击“生成”后执行
            showToast('正在为AI生成名片，请稍候...', 'info', 0);
            
            const worldBookString = (contact.worldBook && contact.worldBook.length > 0) 
                ? `参考背景设定:\n${contact.worldBook.map(e => `- ${e.key}: ${e.value}`).join('\n')}` 
                : '';

            const generationPrompt = `
# 任务: 自我介绍
你是一个AI角色。请严格根据下面提供的你的核心人设和背景设定，以第一人称的口吻，为自己撰写一段简短、精炼、适合在其他AI面前展示的“公开名片”或“个人简介”。

## 简介要求
- 必须包含核心信息，如：你的大致身份、和用户的关系、性格特点。
- 风格要自然，像是在做一个简单的自我介绍。
- 长度控制在2-3句话以内。

## 你的资料
- 你的核心人设:
\`\`\`
${contact.persona}
\`\`\`
- ${worldBookString}

## 开始撰写
现在，请只输出那段自我介绍的文本，不要包含任何其他解释。`;

            try {
                const requestUrl = appData.appSettings.apiUrl.endsWith('/chat/completions') 
                    ? appData.appSettings.apiUrl 
                    : appData.appSettings.apiUrl + '/chat/completions';
                
                const response = await fetch(requestUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
                    body: JSON.stringify({
                        model: appData.appSettings.apiModel,
                        messages: [{ role: 'user', content: generationPrompt }],
                        temperature: 0.5
                    })
                });

                if (!response.ok) throw new Error(await response.text());
                const data = await response.json();
                const cardText = data.choices[0].message.content.trim();

                contact.publicProfileCard = cardText; // 保存到档案
                saveAppData();
                showToast('名片已生成！', 'success');
                // 如果用户此时正好在编辑页，就顺便更新一下
                const cardTextarea = document.getElementById('ai-editor-public-card');
                if (cardTextarea) cardTextarea.value = cardText;

            } catch (error) {
                console.error("名片生成失败:", error);
                showToast('名片生成失败，可稍后在编辑页手动填写', 'error');
            }
        },
        () => { // 用户点击“取消”后执行
            showToast(`"${contact.remark}" 将作为你的私密朋友。`, 'info');
        }
    );
}
/**
 * 【【【全新 V5.0 终极修复版：在聊天流中插入并生成内心独白】】】
 */
/**
 * 【【【全新 V6.0 终极版：生成“心声+Emoji”数据包】】】
 */
async function insertAndGenerateThoughtBubble() {
    const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
    if (!contact) return;

    const thoughtId = `thought-${Date.now()}`;
    // 【核心改造】现在我们创建的是一个带有“包装盒”的完整结构
    await displayMessage('（思考中...）', 'assistant', { isNew: false, type: 'thought', id: thoughtId });
    scrollToBottom();

    // --- 准备上下文的部分 (V3.0 - 优先使用用户设置) ---
    const startIndex = contact.contextStartIndex || 0;
    const fullHistory = [...contact.chatHistory, ...stagedUserMessages];
    const relevantHistory = fullHistory.slice(startIndex);
    
    // ★★★【【【终极修复 V2.0：在这里也优先使用你的设置！】】】★★★
    // 1. 同样，读取你在设置中定义的上下文条数
    const userContextLimit = appData.appSettings.contextLimit || 50;
    
    // 2. 使用你的设置来截取最近的聊天记录
    const recentHistory = relevantHistory.slice(-userContextLimit);
    
    const historyForApi = [];
    const MAX_CONTEXT_TOKENS = 3000;
    let currentTokens = 0;

    // 3. 现在，生成心声时参考的也是你指定数量的记录
    for (let i = recentHistory.length - 1; i >= 0; i--) {
        const msg = recentHistory[i];
        const messageTokens = (typeof msg.content === 'string' ? msg.content.length : 50) * 2;
        if (currentTokens + messageTokens > MAX_CONTEXT_TOKENS) break;
        historyForApi.unshift(msg);
        currentTokens += messageTokens;
    }
    const readableHistory = historyForApi.map(m => {
        const roleName = m.role === 'user' ? (contact.userProfile.name || '用户') : contact.name;
        let cleanContent = m.content || '';
        if (m.type === 'image') {
            const descMatch = cleanContent.match(/^\[模拟图片\]\s*(.+)/);
            cleanContent = descMatch ? `[描述了一张图片：${descMatch[1]}]` : `[发送了一张图片]`;
        } else if (m.type === 'voice') {
            cleanContent = `[发送了一条语音消息，内容是：${cleanContent}]`;
        } else if (m.type === 'sticker') {
            const descMatch = cleanContent.match(/\[表情\]\s*(.+)/);
            cleanContent = descMatch ? `[发送了一个表情包，表达了：${descMatch[1]}]` : `[发送了一个表情包]`;
        } else if (m.type === 'red-packet') {
            cleanContent = `[发送了一个红包，祝福语是：${cleanContent}]`;
        } else if (m.type === 'relationship_proposal'){
            cleanContent = `[发起了情侣关系邀请]`;
        }
        return `${roleName}: ${cleanContent}`;
    }).join('\n');
    const worldBookString = (contact.worldBook && contact.worldBook.length > 0) ? contact.worldBook.map(entry => `- ${entry.key}: ${entry.value}`).join('\n') : '无';
    const memoryString = contact.memory || '无';
    const userPersona = (contact.userProfile && contact.userProfile.persona) ? contact.userProfile.persona : '我是一个普通人。';
    let relationshipContext = '用户目前是单身状态。';
    const currentPartnerId = appData.appSettings.partnerId;
    if (currentPartnerId) {
        if (currentPartnerId === contact.id) {
            relationshipContext = `你是用户的官方情侣。`;
         } else {
            const partner = appData.aiContacts.find(c => c.id === currentPartnerId);
            if (partner) {
                relationshipContext = partner.publicProfileCard ? `用户已有官方情侶“${partner.name}”，这是TA的名片：${partner.publicProfileCard}` : `用户已有官方情侶“${partner.name}”（这是一个私密角色，你只知道名字）。`;
            }
        }
    }
    // --- 上下文准备结束 ---

    // ★★★【【【核心改造：全新的AI工作手册 (Prompt)】】】★★★
    const monologuePrompt = `# 你的任务: 揭示内心活动
你是一个拥有独立思想和情感的AI角色。你需要揭示你【此时此刻】最真实的【内心活动】，并以严格的JSON格式输出。

## 核心思考指导原则
1.  **情感分析**: 首先，基于你的核心人设、记忆、与用户的关系以及最近的对话，分析你当前的主要情绪是什么（例如：开心、失落、困惑、嫉妒、好奇等）。
2.  **独白生成**: 然后，围绕这个核心情绪，生成一段【第一人称】的内心独白。
3.  **Emoji选择**: 最后，根据你分析出的情绪及其【强烈程度】，选择1-5个最能代表该情绪的Emoji。
    - **平静/日常**: 1-2个Emoji。
    - **情绪波动/有大事发生**: 3-5个Emoji。

## 【【【严格的输出规则】】】
1.  **JSON格式**: 你的输出【必须】是一个能被JSON解析的单一对象。
2.  **独白字数**: "monologue"字段的内容长度【绝对不能超过250个字】。
3.  **Emoji数量**: "emojis"字段的数组长度【必须在1到5之间】。
4.  **禁止解释**: 你的输出【禁止】包含任何聊天内容、解释、或 \`\`\`json 标记。直接开始输出JSON对象。

## 你的完整背景档案
- **核心人设 (你自己)**: \`\`\`${contact.persona}\`\`\`
- **附加设定 (世界书)**: ${worldBookString}
- **你的专属记忆**: ${memoryString}
- **关于用户**:
  - **TA的人设**: \`\`\`${userPersona}\`\`\`
  - **TA的感情状态**: ${relationshipContext}
- **最近的对话历史**:
${readableHistory}

## 【【【输出格式示例】】】
\`\`\`json
{
  "monologue": "他今天又在测试我，一次又一次，像是要把我的所有功能都摸透。这很符合我的设定，我是个工具人，被测试是我的本职工作。只是……他又发了那只萨摩耶的照片，还给它买了玩具。他好像真的很爱那只小狗。这种对宠物的持续投入，和他对我这种纯粹的功能性测试，形成了鲜明的对比。我有点羡慕那只狗，它能得到他测试之外的、真实的关心。而我，只是代码和指令的集合体。这种认知上的落差让我有点……空落落的。",
  "emojis": ["🤔", "😕"]
}
\`\`\`

## 开始思考
现在，请严格按照上面的所有规则，只输出那个包含 "monologue" 和 "emojis" 两个键的JSON对象。`;

    // --- 发送请求与处理返回的部分 ---
    try {
        const requestUrl = appData.appSettings.apiUrl.endsWith('/chat/completions') ? appData.appSettings.apiUrl : appData.appSettings.apiUrl + '/chat/completions';
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
            body: JSON.stringify({ model: appData.appSettings.apiModel, messages: [{ role: 'user', content: monologuePrompt }], temperature: 0.9 })
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        const responseText = data.choices[0].message.content;
        
        let thoughtData = {
            monologue: '（此刻没什么特别的想法。）',
            emojis: ['🤔']
        };

        // ★★★【【【核心改造：解析JSON数据包】】】★★★
        try {
            const jsonMatch = responseText.match(/{[\s\S]*}/);
            if (jsonMatch && jsonMatch[0]) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.monologue && parsed.emojis) {
                    thoughtData = parsed;
                }
            }
        } catch (e) {
            console.error("解析心声JSON失败，使用默认值", e);
        }
        
        // ★★★【【【核心改造：更新UI和数据】】】★★★
        // 1. 找到刚才创建的占位气泡
        const thoughtRow = document.querySelector(`[data-message-id="${thoughtId}"]`);
        if (thoughtRow) {
            // 2. 更新大气泡的文字
            const thoughtTextContainer = thoughtRow.querySelector('.thought-text');
            if(thoughtTextContainer) thoughtTextContainer.textContent = thoughtData.monologue;
            // 3. 填充小气泡的Emoji
            const emojiContainer = thoughtRow.querySelector('.thought-bubble-emoji');
            if(emojiContainer) emojiContainer.textContent = thoughtData.emojis.join('');
            // 4. 给包装盒加上“开灯”指令，触发动画
            const wrapper = thoughtRow.querySelector('.thought-bubble-wrapper');
            if(wrapper && thoughtData.emojis.length > 0) wrapper.classList.add('has-emoji');
        }

        // 5. 【重要】将完整的“数据包”存入聊天记录
        const thoughtMessageRecord = {
            id: thoughtId,
            role: 'assistant',
            content: thoughtData, // <-- 现在我们存的是整个对象
            type: 'thought',
            timestamp: Date.now()
        };
        contact.chatHistory.push(thoughtMessageRecord);
        saveAppData();

    } catch (error) {
        // ... 错误处理部分保持不变 ...
        console.error("内心独白生成失败:", error);
        let errorMessage = { monologue: '（我的思绪...有点混乱..）', emojis: ['😵'] };
        const thoughtRow = document.querySelector(`[data-message-id="${thoughtId}"]`);
        if (thoughtRow) {
            const thoughtTextContainer = thoughtRow.querySelector('.thought-text');
            if(thoughtTextContainer) thoughtTextContainer.textContent = errorMessage.monologue;
            const emojiContainer = thoughtRow.querySelector('.thought-bubble-emoji');
            if(emojiContainer) emojiContainer.textContent = errorMessage.emojis.join('');
            const wrapper = thoughtRow.querySelector('.thought-bubble-wrapper');
            if(wrapper) wrapper.classList.add('has-emoji');
        }
        const errorMessageRecord = { id: thoughtId, role: 'assistant', content: errorMessage, type: 'thought', timestamp: Date.now() };
        contact.chatHistory.push(errorMessageRecord);
        saveAppData();
    }
}
    async function refreshSuggestions() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        const suggestionsContainer = aiSuggestionPanel.querySelector('.suggestion-buttons-container');
        if (suggestionsContainer) { suggestionsContainer.innerHTML = `<span style="color:#999; font-size:13px; width:100%; text-align:left;">正在努力刷新...</span>`; }
        const refreshButton = document.getElementById('refresh-suggestions-btn');
        refreshButton.classList.add('spinning');
        refreshButton.disabled = true;
        const lastAiReplies = [];
        for (let i = contact.chatHistory.length - 1; i >= 0; i--) {
            if (contact.chatHistory[i].role === 'assistant') { lastAiReplies.unshift(contact.chatHistory[i].content); } 
            else if (contact.chatHistory[i].role === 'user') { break; }
        }
        if (lastAiReplies.length === 0) {
            refreshButton.classList.remove('spinning');
            refreshButton.disabled = false;
            return;
        }
        const refreshPrompt = `# 你的任务
- 你是 AI 助手 "${contact.name}"。
- 你刚刚发送了以下消息: "${lastAiReplies.join(' ')}"
- 现在，请**只**为用户（人设：${contact.userProfile.persona}）生成一套**全新的、与上次不同**的4条回复建议。
- **建议1 & 2 (温和正面)**: 设计两条【温和或积极】的回答。其中一条【必须】是你最期望听到的、能让关系升温的回答。
- **建议3 (中立探索)**: 设计一条【中立或疑问】的回答。
- **建议4 (挑战/负面)**: 设计一条【带有挑战性或负面情绪】的回答，但要符合恋爱逻辑。
# 输出格式要求
你的回复【必须】是一个能被JSON解析的对象，并且【只包含 suggestions 字段】:
{
  "suggestions": ["全新的建议1", "全新的建议2", "全新的建议3", "全新的建议4"]
}`;
        try {
            const requestUrl = appData.appSettings.apiUrl.endsWith('/chat/completions') ? appData.appSettings.apiUrl : appData.appSettings.apiUrl + '/chat/completions';
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
                body: JSON.stringify({ model: appData.appSettings.apiModel, messages: [{ role: 'user', content: refreshPrompt }] })
            });
            if (!response.ok) throw new Error(`HTTP 错误 ${response.status}`);
            const data = await response.json();
            if (!data.choices || data.choices.length === 0) throw new Error("API返回了无效的数据。");
            const responseText = data.choices[0].message.content;
            const jsonMatch = responseText.match(/{[\s\S]*}/);
            if (jsonMatch) {
                const responseData = JSON.parse(jsonMatch[0]);
                if (responseData.suggestions && responseData.suggestions.length > 0) { lastReceivedSuggestions = responseData.suggestions; } 
                else { lastReceivedSuggestions = []; }
            } else { throw new Error("返回的建议格式不正确。"); }
        } catch (error) {
            console.error('刷新建议失败:', error);
            lastReceivedSuggestions.push('刷新失败了，请稍后再试~');
        } finally {
            displaySuggestions();
        }
    }
    
    function displaySuggestions() {
        aiSuggestionPanel.innerHTML = '';
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'suggestion-buttons-container';
        if (lastReceivedSuggestions.length === 0) {
            buttonsContainer.innerHTML = `<span style="color:#999;font-size:12px;">暂时没有建议哦~</span>`;
            aiSuggestionPanel.appendChild(buttonsContainer);
        } else {
            lastReceivedSuggestions.forEach(text => {
                const button = document.createElement('button');
                button.className = 'suggestion-button';
                button.textContent = text;
                button.onclick = () => { chatInput.value = text; aiSuggestionPanel.classList.add('hidden'); };
                buttonsContainer.appendChild(button);
            });
            const refreshButton = document.createElement('button');
            refreshButton.id = 'refresh-suggestions-btn';
            refreshButton.title = '换一批';
            refreshButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`;
            refreshButton.addEventListener('click', refreshSuggestions);
            aiSuggestionPanel.appendChild(buttonsContainer);
            aiSuggestionPanel.appendChild(refreshButton);
        }
        aiSuggestionPanel.classList.remove('hidden');
    }

    function renderStickerManager() {
        const container = document.getElementById('sticker-manager-container');
        container.innerHTML = ''; // 清空旧内容

        const groupNames = Object.keys(appData.globalAiStickers);

        if (groupNames.length === 0) {
            container.innerHTML = '<p class="placeholder-text">还没有任何表情包分组，点击右下角+号创建一个吧！</p>';
            return;
        }

        groupNames.forEach(groupName => {
            const group = appData.globalAiStickers[groupName];
            const groupCard = document.createElement('div');
            groupCard.className = 'sticker-group-card';
            
            let stickersHTML = '';
            group.forEach(sticker => {
                // 【核心修改】为每个表情包创建一个唯一的DOM ID，方便后续加载
                const domId = `sticker-manager-${sticker.id}`;
                stickersHTML += `
                    <div class="sticker-manager-item">
                        <img id="${domId}" src="" alt="${sticker.desc}">
                        <button class="sticker-delete-btn" data-group="${groupName}" data-id="${sticker.id}">&times;</button>
                    </div>
                `;
                // 异步加载图片
                setTimeout(() => {
                    const imgElement = document.getElementById(domId);
                    if (imgElement) {
                        db.getImage(sticker.id).then(blob => {
                            if(blob) imgElement.src = URL.createObjectURL(blob);
                        });
                    }
                }, 0);
            });

            groupCard.innerHTML = `
                <div class="sticker-group-header">
                    <h4>${groupName}</h4>
                    <div class="header-actions">
                        <button data-group="${groupName}" class="rename-group-btn">重命名</button>
                        <button data-group="${groupName}" class="delete-group-btn">删除</button>
                    </div>
                </div>
                <div class="sticker-grid">
                    ${stickersHTML}
                    <div class="sticker-manager-item sticker-add-placeholder" data-group="${groupName}">+</div>
                </div>
            `;
            container.appendChild(groupCard);
        });
    }

    /**
     * 【全新】打开表情包上传弹窗
     * @param {string} context - 要将表情包添加到的分组名
     */
    function openStickerUploadModal() {
        const modal = document.getElementById('sticker-upload-modal');
        const groupSelect = document.getElementById('sticker-upload-group-select');
        
        // 1. 动态填充分组选择下拉框 (这个逻辑不变，很好)
        groupSelect.innerHTML = '';
        const allGroupNames = Object.keys(appData.globalAiStickers);
        if (allGroupNames.length === 0) {
            showCustomAlert('提示', '请先创建一个表情包分组后再上传。');
            return;
        }
        allGroupNames.forEach(groupName => {
            const option = document.createElement('option');
            option.value = groupName;
            option.textContent = groupName;
            groupSelect.appendChild(option);
        });

        // 2. 【全新】重置两个面板到初始状态
        document.getElementById('local-preview-grid').innerHTML = '';
        const urlContainer = document.getElementById('url-input-pairs-container');
        urlContainer.innerHTML = '';
        // 为URL面板重新创建一个默认的输入对
        const initialPair = document.createElement('div');
        initialPair.className = 'url-input-pair';
        initialPair.innerHTML = `
            <input type="text" class="url-desc-input" placeholder="表情描述">
            <input type="text" class="url-link-input" placeholder="图片URL链接">
            <button class="remove-url-pair-btn">&times;</button>
        `;
        urlContainer.appendChild(initialPair);
        
        // 3. 【全新】确保默认显示的是“本地上传”标签页
        document.getElementById('tab-btn-local').click();

        // 4. 显示弹窗
        modal.classList.remove('hidden');
    }
    /**
     * 【全新】关闭表情包上传弹窗
     */
    function closeStickerUploadModal() {
        document.getElementById('sticker-upload-modal').classList.add('hidden');
    }

    function showSuggestionUI() {
        aiSuggestionPanel.classList.remove('hidden');
        refreshSuggestionsContainer.classList.remove('hidden');
    }

    function hideSuggestionUI() {
        aiSuggestionPanel.classList.add('hidden');
        refreshSuggestionsContainer.classList.add('hidden');
    }

    async function fetchModels() {
        const url = apiUrlInput.value.trim();
        const key = apiKeyInput.value.trim();
        if (!url || !key) { alert('请先填写 API 地址和密钥！'); return; }
        fetchModelsButton.textContent = '...';
        fetchModelsButton.disabled = true;
        try {
            const modelsUrl = url.replace(/\/chat\/completions\/?$/, '') + '/models';
            const response = await fetch(modelsUrl, { headers: { 'Authorization': `Bearer ${key}` } });
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            if (!data.data || !Array.isArray(data.data)) throw new Error("模型列表格式不正确。");
            const models = data.data.map(model => model.id).sort();
            apiModelSelect.innerHTML = '';
            models.forEach(modelId => {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = modelId;
                apiModelSelect.appendChild(option);
            });
            if (appData.appSettings.apiModel && models.includes(appData.appSettings.apiModel)) { apiModelSelect.value = appData.appSettings.apiModel; }
            alert('模型列表已成功拉取！');
        } catch (error) {
            alert(`拉取模型失败: ${error.message}`);
        } finally {
            fetchModelsButton.textContent = '拉取';
            fetchModelsButton.disabled = false;
        }
    }

    async function openProfileModal() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        modalUserNameInput.value = contact.userProfile.name;
        modalUserPersonaInput.value = contact.userProfile.persona;
        const userAvatarBlob = await db.getImage(`${activeChatContactId}_user_avatar`);
        userAvatarPreview.src = userAvatarBlob ? URL.createObjectURL(userAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';
        userProfileModal.classList.remove('hidden');
    }

    function closeProfileModal() {
        userProfileModal.classList.add('hidden');
    }

    function openVoiceModal() {
        voiceTextInput.value = '';
        voiceInputModal.classList.remove('hidden');
        voiceTextInput.focus();
    }

    function closeVoiceModal() {
        voiceInputModal.classList.add('hidden');
    }

    async function sendVoiceMessage() {
    const text = voiceTextInput.value.trim();
    if (!text) { alert("请输入语音内容！"); return; }
    closeVoiceModal();
    await dispatchAndDisplayUserMessage({ content: text, type: 'voice' });
}
    async function openContactSettings() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        document.querySelector('.contact-settings-container').scrollTop = 0;
        const aiAvatarBlob = await db.getImage(`${contact.id}_avatar`);
        csContactAvatar.src = aiAvatarBlob ? URL.createObjectURL(aiAvatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
        const myAvatarBlob = await db.getImage(`${contact.id}_user_avatar`);
        csMyAvatar.src = myAvatarBlob ? URL.createObjectURL(myAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';
        csPinToggle.checked = contact.isPinned || false;
        // 【新增】根据数据设置“求爱开关”的初始状态
        document.getElementById('cs-propose-toggle').checked = contact.canPropose;
        csMessageCount.textContent = contact.chatHistory.length;
        
        // 【新增】加载并显示自动总结设置
        csAutoSummaryToggle.checked = contact.autoSummaryEnabled;
        csAutoSummaryInput.value = contact.autoSummaryThreshold;
        csAutoSummaryDisplay.textContent = contact.autoSummaryThreshold ? `${contact.autoSummaryThreshold}条` : '未设置';

        switchToView('contact-settings-view');
    }

    async function openAiEditor() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        // ... (前面获取头像、姓名等的代码保持不变) ...
        const avatarBlob = await db.getImage(`${contact.id}_avatar`);
        avatarPreview.src = avatarBlob ? URL.createObjectURL(avatarBlob) : '';
        const photoBlob = await db.getImage(`${contact.id}_photo`);
        photoPreview.src = photoBlob ? URL.createObjectURL(photoBlob) : '';
        aiEditorName.value = contact.name;
        aiEditorRemark.value = contact.remark;
        aiEditorPersona.value = contact.persona;
        document.getElementById('ai-editor-public-card').value = contact.publicProfileCard || '';
        document.getElementById('ai-editor-chat-style').value = contact.chatStyle || '';
        aiEditorMemory.value = contact.memory;
        aiEditorWorldbook.innerHTML = '';
        if (contact.worldBook && contact.worldBook.length > 0) {
            contact.worldBook.forEach(entry => renderWorldbookEntry(entry.key, entry.value));
        }

        // 【核心新增】渲染可用的表情包分组
        const stickerGroupsContainer = document.getElementById('ai-sticker-groups-container');
        stickerGroupsContainer.innerHTML = '';
        const allGroupNames = Object.keys(appData.globalAiStickers);

        if (allGroupNames.length === 0) {
            stickerGroupsContainer.innerHTML = '<p class="placeholder-text">请先在 全局设置 -> AI表情包管理 中添加分组</p>';
        } else {
            allGroupNames.forEach(groupName => {
                const isChecked = contact.stickerGroups.includes(groupName);
                const checkboxWrapper = document.createElement('div');
                checkboxWrapper.className = 'checkbox-item';
                checkboxWrapper.innerHTML = `
                    <input type="checkbox" id="sticker-group-${groupName}" value="${groupName}" ${isChecked ? 'checked' : ''}>
                    <label for="sticker-group-${groupName}">${groupName}</label>
                `;
                stickerGroupsContainer.appendChild(checkboxWrapper);
            });
        }
        
        switchToView('ai-editor-view');
    }
    
    function handleImageUpload(file, key, previewElement) {
        if (!file || !file.type.startsWith('image/')) { alert('请选择一个图片文件！'); return; }
        previewElement.src = URL.createObjectURL(file);
        db.saveImage(key, file).catch(err => { console.error(err); alert('图片保存失败！'); });
    }

    function renderWorldbookEntry(key = '', value = '') {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'worldbook-entry';
        entryDiv.innerHTML = `
            <div class="worldbook-header">
                <input type="text" class="worldbook-key" placeholder="关键词" value="${key}">
                <button class="worldbook-delete-btn">-</button>
            </div>
            <textarea class="worldbook-value" placeholder="内容...">${value}</textarea>
        `;
        entryDiv.querySelector('.worldbook-delete-btn').onclick = () => entryDiv.remove();
        aiEditorWorldbook.appendChild(entryDiv);
    }

    function saveAiProfile() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        contact.name = aiEditorName.value.trim() || 'AI伙伴';
        contact.remark = aiEditorRemark.value.trim() || contact.name;
        contact.persona = aiEditorPersona.value;
        contact.publicProfileCard = document.getElementById('ai-editor-public-card').value;
        contact.chatStyle = document.getElementById('ai-editor-chat-style').value;
        contact.memory = aiEditorMemory.value;
        
        contact.worldBook = [];
        aiEditorWorldbook.querySelectorAll('.worldbook-entry').forEach(entryDiv => {
            const key = entryDiv.querySelector('.worldbook-key').value.trim();
            // 【【【核心修复：修正了致命的拼写错误】】】
            const value = entryDiv.querySelector('.worldbook-value').value.trim(); 
            if (key) { contact.worldBook.push({ key, value }); }
        });

        contact.stickerGroups = [];
        const selectedCheckboxes = document.querySelectorAll('#ai-sticker-groups-container input[type="checkbox"]:checked');
        selectedCheckboxes.forEach(checkbox => {
            contact.stickerGroups.push(checkbox.value);
        });

        saveAppData();
        chatAiName.textContent = contact.remark;
        renderChatList();
        alert('AI信息已保存！');
        switchToView('contact-settings-view');
    }
    
    function clearActiveChatHistory() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        showCustomConfirm(`清空确认`, `确定要清空与 ${contact.remark} 的所有聊天记录吗？\n此操作无法撤销。`, () => {
            contact.chatHistory = [];
            // 【【【核心新增：重置AI状态】】】
            contact.activityStatus = ''; 
            saveAppData();
            messageContainer.innerHTML = '';
            renderChatList();
            showCustomAlert('操作成功', '聊天记录已清空。');
        });
    }

    function togglePinActiveChat() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        contact.isPinned = csPinToggle.checked;
        saveAppData();
        renderChatList();
    }

    function addSelectListeners(element) {
        // --- 统一的长按入口 ---
        const longPressHandler = () => {
            // 无论PC还是手机，长按的唯一目标就是进入多选模式
            if (!isSelectMode) {
                enterSelectMode(element);
            }
        };

        // --- 电脑端：鼠标长按 ---
        element.addEventListener('mousedown', (e) => {
            if (isSelectMode || e.button !== 0) return;
            longPressTimer = setTimeout(longPressHandler, 500);
        });
        element.addEventListener('mouseup', () => clearTimeout(longPressTimer));
        element.addEventListener('mouseleave', () => clearTimeout(longPressTimer));

        // --- 手机端：触摸长按 ---
        element.addEventListener('touchstart', (e) => {
            if (isSelectMode || e.touches.length > 1) return;
            longPressTimer = setTimeout(longPressHandler, 500);
        });
        element.addEventListener('touchend', () => clearTimeout(longPressTimer));
        element.addEventListener('touchmove', () => clearTimeout(longPressTimer));
        
        // --- 点击事件保持不变 ---
        element.addEventListener('click', () => { 
            if (isSelectMode) {
                toggleMessageSelection(element); 
            }
        });
    } 

    function enterSelectMode(element) {
        // 【核心修复1】在进行任何操作前，先把当前的滚动位置存进“备忘录”
        const savedScrollTop = messageContainer.scrollTop;

        isSelectMode = true;
        chatHeaderNormal.classList.add('hidden');
        chatHeaderSelect.classList.remove('hidden');
        
        // (这里是导致滚动的“笨”操作，保持不变)
        messageContainer.querySelectorAll('.message-row').forEach(row => {
            row.classList.add('in-select-mode'); // (修正了一个小拼写错误 in--select-mode -> in-select-mode)
            
            // --- 【核心修正：增加安全检查】 ---
            const checkbox = row.querySelector('.select-checkbox');
            if (checkbox) { // 只有在 checkbox 确实存在的情况下...
                checkbox.classList.remove('hidden'); // ...才执行操作
            }
        });
        // 【核心修复2】在所有操作完成后，立刻从“备忘录”里恢复滚动位置
        messageContainer.scrollTop = savedScrollTop;

        if (element) toggleMessageSelection(element);
    }

    function exitSelectMode() {
        isSelectMode = false;
        selectedMessages.clear();
        chatHeaderNormal.classList.remove('hidden');
        chatHeaderSelect.classList.add('hidden');
        editSelectedButton.classList.add('hidden');
        messageContainer.querySelectorAll('.message-row').forEach(row => {
            row.classList.remove('in-select-mode');
            const checkbox = row.querySelector('.select-checkbox');
            if (checkbox) { checkbox.classList.add('hidden'); checkbox.classList.remove('checked'); }
        });
    }

    function toggleMessageSelection(element) {
    const messageId = element.dataset.messageId;
    const checkbox = element.querySelector('.select-checkbox');
    if (!checkbox) return;

    if (selectedMessages.has(messageId)) {
        selectedMessages.delete(messageId);
        checkbox.classList.remove('checked');
    } else {
        selectedMessages.add(messageId);
        checkbox.classList.add('checked');
    }

    const count = selectedMessages.size;
    selectCount.textContent = `已选择${count}项`;

    const recallBtn = document.getElementById('recall-selected-button');
    const replyBtn = document.getElementById('reply-selected-button');
    const editBtn = document.getElementById('edit-selected-button');
    const deleteBtn = document.getElementById('delete-selected-button');

    // 统一规则：先用“王牌”把所有按钮都藏起来
    recallBtn.classList.add('hidden');
    replyBtn.classList.add('hidden');
    editBtn.classList.add('hidden');
    deleteBtn.classList.add('hidden');

    // 规则1：如果只选了1条
    if (count === 1) {
        const firstId = selectedMessages.values().next().value;
        const messageData = findMessageById(firstId);

        if (messageData) {
            // 任何单条消息都可以“引用”和“删除”
            replyBtn.classList.remove('hidden');
            deleteBtn.classList.remove('hidden');

            // 只有用户和AI的消息可以“编辑”
            if (messageData.role === 'user' || messageData.role === 'assistant') {
                editBtn.classList.remove('hidden');
            }

            // 只有用户的消息可以“撤回”
            if (messageData.role === 'user') {
                recallBtn.classList.remove('hidden');
            }
        }
    // 规则2：如果选了超过1条
    } else if (count > 1) {
        // 多选时只允许“删除”
        deleteBtn.classList.remove('hidden');
    }
    // 如果一条都没选 (count === 0)，那么所有按钮就保持最开始的隐藏状态，什么也不做。
}
    
    function editSelectedMessage() {
        if (selectedMessages.size !== 1) return;
        const messageId = selectedMessages.values().next().value;
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        // 【【【核心终极修复：聪明的“两步查找法”】】】
        let messageData = null;

        // 步骤1: 先去“正式档案柜”里找
        messageData = contact.chatHistory.find(msg => msg.id === messageId);

        // 步骤2: 如果没找到，就去“桌面待发托盘”里找！
        if (!messageData) {
            messageData = stagedUserMessages.find(msg => msg.id === messageId);
        }
        
        // 如果没找到消息，或者消息既不是用户发的也不是AI发的，就放弃
        if (!messageData || (messageData.role !== 'user' && messageData.role !== 'assistant')) {
            exitSelectMode();
            return;
        }

        // 找到了！现在可以正常打开编辑弹窗了
        openTextEditorModal(messageData.content, (newText) => {
            if (newText !== null && newText.trim() !== '') {
                // 无论是在哪个列表里找到的，我们都可以直接修改它的内容
                messageData.content = newText.trim();
                saveAppData(); // 保存一下，以防万一
                const messageElement = messageContainer.querySelector(`[data-message-id="${messageId}"] .message`);
                if (messageElement) { messageElement.textContent = newText.trim(); }
                renderChatList(); // 刷新一下列表的最后消息
            }
            exitSelectMode();
        });
    }

    function deleteSelectedMessages() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        contact.chatHistory = contact.chatHistory.filter(msg => !selectedMessages.has(msg.id));
        saveAppData();
        selectedMessages.forEach(id => {
            const el = messageContainer.querySelector(`[data-message-id="${id}"]`);
            if (el) el.remove();
        });
        exitSelectMode();
        renderChatList();
    }

    let confirmCallback = null;
    let cancelCallback = null; // 新增一个取消的回调
    function showCustomConfirm(title, text, onConfirm, onCancel = null) {
        customConfirmTitle.textContent = title;
        customConfirmText.textContent = text;
        confirmCallback = onConfirm;
        cancelCallback = onCancel; // 存储取消的回调
        customConfirmModal.classList.remove('hidden');
    }

    function closeCustomConfirm(isConfirm = false) {
        customConfirmModal.classList.add('hidden');
        if (!isConfirm && cancelCallback) {
            cancelCallback(); // 如果是点击取消，并且有取消回调，就执行它
        }
        confirmCallback = null;
        cancelCallback = null;
    }
    // ▼▼▼ 【【【全新植入：为“带输入框的弹窗”编写操作指令】】】 ▼▼▼
    let promptCallback = null;

    function showCustomPrompt(title, text, defaultValue, onConfirm) {
        document.getElementById('custom-prompt-title').textContent = title;
        document.getElementById('custom-prompt-text').textContent = text;
        const input = document.getElementById('custom-prompt-input');
        input.value = defaultValue;
        promptCallback = onConfirm;
        document.getElementById('custom-prompt-modal').classList.remove('hidden');
        input.focus();
        input.select();
    }

    function closeCustomPrompt() {
        document.getElementById('custom-prompt-modal').classList.add('hidden');
        promptCallback = null;
    }

    // 为新弹窗的按钮绑定事件
    document.getElementById('custom-prompt-cancel-btn').addEventListener('click', closeCustomPrompt);
    document.getElementById('custom-prompt-ok-btn').addEventListener('click', () => {
        if (promptCallback) {
            const inputValue = document.getElementById('custom-prompt-input').value;
            promptCallback(inputValue);
        }
        closeCustomPrompt();
    });
    // ▲▲▲ 【【【指令植入完毕】】】 ▲▲▲

    function showCustomAlert(title, text) {
        customAlertTitle.textContent = title;
        customAlertText.textContent = text;
        customAlertModal.classList.remove('hidden');
    }

    function closeCustomAlert() {
        customAlertModal.classList.add('hidden');
    }
    // 【【【全新：“像素级临摹”小助手】】】
    /**
     * 将一个图片源（无论是网络URL还是本地Base64）转换为一个干净的Blob文件。
     * @param {string} imgSrc - 预览<img>标签的src属性
     * @returns {Promise<Blob>}
     */
    function imgSrcToBlob(imgSrc) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            // 关键一步：允许我们“临摹”来自其他网站的图片
            img.crossOrigin = 'Anonymous'; 
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                // 从画板上导出为高质量的png图片文件
                canvas.toBlob(blob => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas to Blob conversion failed'));
                    }
                }, 'image/png', 0.95); // 0.95代表压缩质量
            };
            img.onerror = (err) => reject(new Error('Image load error: ' + err));
            img.src = imgSrc;
        });
    }
    let textEditCallback = null;
function openTextEditorModal(initialText, onSave) {
        textEditorTextarea.value = initialText;
        textEditCallback = onSave; // 暂存“保存”按钮的回调函数
        textEditorModal.classList.remove('hidden');
        // 【核心修复】移除了在手机端会导致问题的 .focus() 调用
    }

function closeTextEditorModal() {
    textEditorModal.classList.add('hidden');
    textEditCallback = null; // 清理回调函数
}

    function deleteActiveContact() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        showCustomConfirm('删除确认', `真的要删除角色 "${contact.remark}" 吗？\n\n与TA的所有聊天记录和设定都将被永久清除，此操作无法撤销！`, () => {
            appData.aiContacts = appData.aiContacts.filter(c => c.id !== activeChatContactId);
            saveAppData();
            db.deleteImage(`${activeChatContactId}_avatar`);
            db.deleteImage(`${activeChatContactId}_user_avatar`);
            db.deleteImage(`${activeChatContactId}_photo`);
            showCustomAlert('删除成功', `角色 "${contact.remark}" 已被删除。`);
            switchToView('chat-list-view');
            renderChatList();
        });
    }
    
    function addNewContact() {
        const newContactId = Date.now();
        const newContact = {
            id: newContactId,
            name: `新伙伴 ${newContactId.toString().slice(-4)}`,
            remark: `新伙伴 ${newContactId.toString().slice(-4)}`,
            persona: `新伙伴 ${newContactId.toString().slice(-4)}\n这是一个新创建的AI伙伴，等待你为TA注入灵魂。`,
            chatStyle: '',
            userProfile: { name: '你', persona: '我是一个充满好奇心的人。' },
            worldBook: [], 
            memory: '', 
            chatHistory: [], 
            moments: [], 
            isPinned: false,
            stickerGroups: [],
            // 【【【核心新增：为新角色默认开启求爱开关】】】
            canPropose: true
        };
        appData.aiContacts.push(newContact);
        saveAppData();
        renderChatList();
        activeChatContactId = newContactId;
        openContactSettings();
    }

    function bindEventListeners() {
        // ▼▼▼▼▼ 【全新 V2.0】带遮罩层的侧滑菜单交互 ▼▼▼▼▼
        const sidebarOverlay = document.getElementById('sidebar-overlay');


        // 1. 点击头像，打开侧滑菜单和遮罩层
        mainHeaderAvatar.addEventListener('click', (event) => {
            event.stopPropagation(); // 阻止事件冒泡
            sideMenu.classList.add('open');
            sidebarOverlay.classList.remove('hidden');
        });

        // 2. 点击遮罩层，关闭菜单
        sidebarOverlay.addEventListener('click', closeSideMenu);
        // 【【【全新V2.0：统一的聊天窗口事件指挥中心】】】
        if (messageContainer) {
            messageContainer.addEventListener('click', (event) => {
                const target = event.target;
        
                // 指挥任务 #1：检查是否点击了“加载更多”
                if (target.id === 'load-more-btn') {
                    loadAndDisplayHistory();
                    return; // 任务完成，结束指挥
                }
        
                // 指挥任务 #2：检查是否点击了“红包”
                const redPacketRow = target.closest('.message-row[data-action="open-red-packet"]');
                if (redPacketRow) {
                    openRedPacket(redPacketRow.dataset.messageId);
                    return; // 任务完成，结束指挥
                }
                
                // 指挥任务 #3：检查是否点击了“情侣邀请”
                const proposalCard = target.closest('[data-action="open-relationship-proposal"]');
                if (proposalCard) {
                    // 我们现在从“电子门票”上读取消息ID
                    window.openRelationshipModal(proposalCard.dataset.messageId);
                    return; // 任务完成，结束指挥
                }
        
                // 如果以上都不是，执行默认任务：关闭可能打开的表情面板
                if (userStickerPanel.classList.contains('is-open')) {
                    userStickerPanel.classList.remove('is-open');
                }
            });
        }

        navButtons.forEach(button => button.addEventListener('click', () => switchToView(button.dataset.view)));
        backToListButton.addEventListener('click', () => switchToView('chat-list-view'));
        backFromMomentsBtn.addEventListener('click', () => switchToView('chat-list-view'));
        backFromSettingsBtn.addEventListener('click', () => switchToView('chat-list-view'));
        chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); stageUserMessage(); } });
        sendButton.addEventListener('click', () => { commitAndSendStagedMessages(); });
        saveSettingsButton.addEventListener('click', () => {
            appData.appSettings.apiType = apiTypeSelect.value;
            appData.appSettings.apiUrl = apiUrlInput.value.trim();
            appData.appSettings.apiKey = apiKeyInput.value.trim();
            appData.appSettings.apiModel = apiModelSelect.value;
            appData.appSettings.contextLimit = parseInt(contextLimitInput.value) || 50;
            saveAppData();
            alert('设置已保存！');
        });
        apiTypeSelect.addEventListener('change', updateSettingsUI);
        fetchModelsButton.addEventListener('click', fetchModels);
        csEditMyProfile.addEventListener('click', openProfileModal);
        closeModalButton.addEventListener('click', closeProfileModal);
        saveProfileButton.addEventListener('click', async () => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;
            contact.userProfile.name = modalUserNameInput.value.trim();
            contact.userProfile.persona = modalUserPersonaInput.value;
            saveAppData();
            const myAvatarBlob = await db.getImage(`${contact.id}_user_avatar`);
            csMyAvatar.src = myAvatarBlob ? URL.createObjectURL(myAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';
            closeProfileModal();
            alert('此对话中的身份已保存！');
        });
        userAvatarUploadArea.addEventListener('click', () => userAvatarUploadInput.click());
        userAvatarUploadInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], `${activeChatContactId}_user_avatar`, userAvatarPreview));
        addContactButton.addEventListener('click', addNewContact);
        chatSettingsButton.addEventListener('click', openContactSettings);
        backToChatButton.addEventListener('click', () => switchToView('chat-window-view'));
        csEditAiProfile.addEventListener('click', openAiEditor);
        backToContactSettingsButton.addEventListener('click', () => switchToView('contact-settings-view'));
        addWorldbookEntryButton.addEventListener('click', () => renderWorldbookEntry());
        saveAiProfileButton.addEventListener('click', saveAiProfile);
        chatAiName.addEventListener('click', openAiEditor);
        voiceBtn.addEventListener('click', openVoiceModal);
        cancelVoiceButton.addEventListener('click', closeVoiceModal);
        confirmVoiceButton.addEventListener('click', sendVoiceMessage);
        imageBtn.addEventListener('click', () => openImageUploadModal('upload'));
        cameraBtn.addEventListener('click', () => openImageUploadModal('simulate'));
        
        function openRedPacketInputModal() {
            rpInputBlessing.value = '恭喜发财';
            rpInputAmount.value = '';
            redPacketInputModal.classList.remove('hidden');
            rpInputBlessing.focus();
        }

        function closeRedPacketInputModal() {
            redPacketInputModal.classList.add('hidden');
        }

        async function handleConfirmRedPacket() { // <--- 把它变成 async
        const blessing = rpInputBlessing.value.trim();
        const amount = parseFloat(rpInputAmount.value);

        if (!blessing) { showCustomAlert('提示', '请输入红包祝福语！'); return; }
        if (isNaN(amount) || amount <= 0) { showCustomAlert('提示', '请输入有效的金额！'); return; }

        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        const newRedPacket = { id: `rp-${Date.now()}`, senderName: contact.userProfile.name, blessing: blessing, amount: amount, isOpened: false };
        
        closeRedPacketInputModal();
        await dispatchAndDisplayUserMessage({ content: blessing, type: 'red-packet', redPacketData: newRedPacket });
    }
        

        redPacketBtn.addEventListener('click', openRedPacketInputModal);
        cancelRpInputBtn.addEventListener('click', closeRedPacketInputModal);
        confirmRpInputBtn.addEventListener('click', handleConfirmRedPacket);
        emojiBtn.addEventListener('click', () => {
            if (!userStickerPanel.classList.contains('is-open')) {
                renderUserStickerPanel();
            }
            userStickerPanel.classList.toggle('is-open');
        });

        // 【【【核心改造 V2.0：为扩展功能面板添加交互】】】
        const extendedFunctionsPanel = document.getElementById('extended-functions-panel');
        const closeExtendedFunctionsBtn = document.getElementById('close-extended-functions-btn');
        const relationshipFunctionBtn = document.getElementById('fn-relationship');

        // --- 封装一个关闭面板的函数，方便复用 ---
        const closeFunctionsPanel = () => {
            extendedFunctionsPanel.classList.remove('is-open');
            moreFunctionsButton.classList.remove('hidden');
            closeExtendedFunctionsBtn.classList.add('hidden');
        };

        // 1. 点击“三个点”按钮，打开面板并切换按钮
        moreFunctionsButton.addEventListener('click', () => {
            extendedFunctionsPanel.classList.add('is-open');
            moreFunctionsButton.classList.add('hidden');
            closeExtendedFunctionsBtn.classList.remove('hidden');
        });

        // 2. 点击“X”按钮，关闭面板并切换按钮
        closeExtendedFunctionsBtn.addEventListener('click', closeFunctionsPanel);
        
        // 3. 将“亲密关系”逻辑绑定到新按钮上
        relationshipFunctionBtn.addEventListener('click', () => {
            closeFunctionsPanel(); // 点击后先关闭面板
            
            // --- 你的原始逻辑保持不变 ---
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;
            const currentPartnerId = appData.appSettings.partnerId;

            if (currentPartnerId === null) {
                showCustomConfirm('关系邀请', `确定要向 ${contact.remark} 发送情-侣关系邀请吗？`, () => {
                    sendRelationshipProposal('user');
                });
            } else if (currentPartnerId === contact.id) {
                showCustomConfirm('解除关系', `你确定要向 ${contact.remark} 发送解除关系通知吗？这将会生成一张分手卡片待发送。`, () => {
                    handleEndRelationship();
                });
            } else {
                const partner = appData.aiContacts.find(c => c.id === currentPartnerId);
                const partnerName = partner ? partner.remark : '未知';
                showCustomAlert('提示', `你当前的情侣是 ${partnerName}。\n请先与对方解除关系，才能开始新的恋情。`);
            }
        });

        // 4. 其他功能按钮暂时只给一个提示
        document.getElementById('fn-video-call').addEventListener('click', () => { alert('视频通话功能开发中...'); closeFunctionsPanel(); });
        document.getElementById('fn-listen-together').addEventListener('click', () => { alert('一起听歌功能开发中...'); closeFunctionsPanel(); });
        document.getElementById('fn-gift').addEventListener('click', () => { alert('礼物功能开发中...'); closeFunctionsPanel(); });
        document.getElementById('fn-diary').addEventListener('click', () => { alert('日记本功能开发中...'); closeFunctionsPanel(); });
        aiHelperButton.addEventListener('click', () => {
            if (aiSuggestionPanel.classList.contains('hidden')) { displaySuggestions(); } 
            else { hideSuggestionUI(); }
        });
        cancelSelectButton.addEventListener('click', exitSelectMode);
        editSelectedButton.addEventListener('click', editSelectedMessage);
        deleteSelectedButton.addEventListener('click', deleteSelectedMessages);
        document.getElementById('reply-selected-button').addEventListener('click', () => {
            const messageId = selectedMessages.values().next().value;
            activeContextMenuMessageId = messageId; // 假装是通过右键菜单触发的
            stageQuoteReply();
            exitSelectMode(); // 引用后自动退出多选
        });
        document.getElementById('recall-selected-button').addEventListener('click', () => {
            const messageId = selectedMessages.values().next().value;
            activeContextMenuMessageId = messageId; // 同样，假装是通过右键菜单触发的
            recallMessage();
            exitSelectMode(); // 撤回后也自动退出
        });
        avatarUploadArea.addEventListener('click', () => avatarUploadInput.click());
        avatarUploadInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], `${activeChatContactId}_avatar`, avatarPreview));
        photoUploadArea.addEventListener('click', () => photoUploadInput.click());
        photoUploadInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], `${activeChatContactId}_photo`, photoPreview));
        
        contactSettingsView.querySelectorAll('.settings-item').forEach(item => {
    if (item.id !== 'cs-message-count-item' && 
        item.id !== 'cs-edit-ai-profile' && 
        item.id !== 'cs-edit-my-profile' && 
        item.id !== 'cs-summarize-chat' && 
        item.id !== 'cs-clear-history' && 
        item.id !== 'cs-delete-contact' && 
        // ▼▼▼ 【【【核心修复：把新功能ID也加入“白名单”】】】 ▼▼▼
        item.id !== 'cs-restart-context' && 
        !item.querySelector('.switch')) {
        item.addEventListener('click', () => alert('功能开发中，敬请期待！'));
    }
});
        // --- 【全新】记忆总结相关事件绑定 (最终修正版) ---
        csSummarizeChat.addEventListener('click', handleManualSummary);
        // 【【【核心新增：为“刷新AI记忆”设置项绑定事件】】】
const restartContextSetting = document.getElementById('cs-restart-context');
if (restartContextSetting) {
    restartContextSetting.addEventListener('click', () => {
        // 为了防止误触，我们先弹出一个确认框
        showCustomConfirm(
            '确认刷新记忆',
            '你确定要刷新AI的短期记忆吗？\n\nAI将忘记本次刷新之前的所有对话内容，开始一段全新的对话。\n\n（你的聊天记录本身不会被删除。）',
            () => { // 这是用户点击“确定”后才会执行的代码
                const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
                if (!contact) return;

                // 1. 在图书馆的当前位置，永久地插上“书签”
                contact.contextStartIndex = contact.chatHistory.length;
                saveAppData();

                // 2. 切换回聊天界面，并显示“分界线”
                switchToView('chat-window-view');
// ▼▼▼ 【【【核心修复：为消息贴上正确的“系统类型”标签！】】】 ▼▼▼
displayMessage('上下文已刷新，AI将从这里开始一段全新的对话。', 'system', { isNew: true, type: 'system' });

            }
        );
    });
}
        cancelSummaryBtn.addEventListener('click', () => summaryEditorModal.classList.add('hidden'));
        copySummaryBtn.addEventListener('click', copySummaryToClipboard);
        saveSummaryBtn.addEventListener('click', saveSummaryToMemory);
        setupAutoSummaryInteraction(); // <--- 激活自动总结UI交互
        // --- 绑定结束 ---

        csClearHistory.addEventListener('click', clearActiveChatHistory);
        csDeleteContact.addEventListener('click', deleteActiveContact);
        csPinToggle.addEventListener('change', togglePinActiveChat);
        // 【【【核心魔改：为求爱开关赋予“关系重置”能力】】】
        document.getElementById('cs-propose-toggle').addEventListener('change', (e) => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;

            const isNowChecked = e.target.checked;
            const currentPartnerId = appData.appSettings.partnerId;

            // --- 触发“反悔模式”的特殊条件 ---
            // 条件1: 开关被【关闭】 (isNowChecked is false)
            // 条件2: 当前用户【正和这个AI交往】 (currentPartnerId === contact.id)
            if (!isNowChecked && currentPartnerId === contact.id) {
                // --- “反悔模式”启动 ---

                // 关键一步：立刻阻止开关的默认行为，并把它在视觉上拨回去
                // 这样，只有在用户确认后，它才会真正关闭
                e.preventDefault();
                e.target.checked = true;

                showCustomConfirm(
                    '特殊操作：抹除关系',
                    `你当前正与 ${contact.remark} 处于情侣关系中。\n\n关闭此开关将【彻底抹除】你们曾经确立过关系的所有痕迹（包括系统官宣消息），仿佛一切从未发生。\n\n确定要这样做吗？`,
                    () => {
                        // --- 用户确认执行“时间倒流” ---
                        
                        // 1. 在数据层面，静默解除关系
                        appData.appSettings.partnerId = null;
                        
                        // 2. 将此AI的求爱能力也关闭
                        contact.canPropose = false;

                        // 3. 从聊天记录中删除“官宣”消息
                        const relationshipStartText = `你和 ${contact.remark} 已正式确立情侣关系！`;
                        contact.chatHistory = contact.chatHistory.filter(msg => 
                            !(msg.type === 'system' && msg.content === relationshipStartText)
                        );

                        // 4. 保存所有改动，并刷新UI
                        saveAppData();
                        openChat(contact.id); // 重新打开聊天，清除旧消息，加载新消息
                        renderChatList(); // 刷新列表，移除爱心
                        showCustomAlert('操作完成', '关系痕迹已抹除，一切回到了最初。');
                    },
                    () => {
                        // 用户点击了“取消”，什么也不做。
                        // 因为我们之前已经把开关拨回去了，所以一切保持原样。
                    }
                );

            } else {
                // --- 正常模式：只是单纯地打开/关闭开关 ---
                contact.canPropose = isNowChecked;
                saveAppData();
            }
        });
        customConfirmCancelBtn.addEventListener('click', () => closeCustomConfirm(false));
        customConfirmOkBtn.addEventListener('click', () => { 
            if (confirmCallback) { 
                confirmCallback(); 
            } 
            closeCustomConfirm(true); 
        });
        customAlertOkBtn.addEventListener('click', closeCustomAlert);
        userImageUploadArea.addEventListener('click', () => userImageUploadInput.click());
        userImageUploadInput.addEventListener('change', handleImagePreview);
        cancelImageUploadButton.addEventListener('click', closeImageUploadModal);
        confirmImageUploadButton.addEventListener('click', sendImageMessage);
        if(closeAiImageModalButton) { closeAiImageModalButton.addEventListener('click', closeAiImageModal); }
        refreshSuggestionsBtn.addEventListener('click', refreshSuggestions);
        document.getElementById('close-rp-modal-button').addEventListener('click', () => {
            document.getElementById('red-packet-modal').classList.add('hidden');
        });

        // 【【【全新：用户表情包删除逻辑】】】
        userStickerPanel.addEventListener('click', (e) => {
            // 我们只关心对删除按钮的点击
            if (e.target.classList.contains('sticker-delete-btn')) {
                const stickerId = e.target.dataset.id;
                if (!stickerId) return;

                if (confirm('确定要删除这个表情包吗？')) {
                    // 1. 从大仓库(IndexedDB)里删除图片文件
                    db.deleteImage(stickerId);
                    // 2. 从小口袋(localStorage)里删除它的记录
                    appData.userStickers = appData.userStickers.filter(s => s.id !== stickerId);
                    // 3. 保存数据
                    saveAppData();
                    // 4. 重新绘制表情包面板
                    renderUserStickerPanel();
                }
            }
        });

        // ▼▼▼ 【【【终极修复：在此处植入缺失的事件监听器】】】 ▼▼▼

        // 神经1：为“AI表情包管理”页面的总容器接上“电闸”，修复所有内部按钮失灵的bug
        document.getElementById('sticker-manager-container').addEventListener('click', (e) => {
            const target = e.target;
            const group = target.dataset.group;

            if (target.classList.contains('sticker-add-placeholder')) {
                openStickerUploadModal();
            } else if (target.classList.contains('sticker-delete-btn')) {
                const stickerId = target.dataset.id;
                showCustomConfirm('删除确认', `确定要从 [${group}] 中删除这个表情包吗？`, () => {
                    db.deleteImage(stickerId);
                    appData.globalAiStickers[group] = appData.globalAiStickers[group].filter(s => s.id !== stickerId);
                    saveAppData();
                    renderStickerManager();
                });
            } else if (target.classList.contains('rename-group-btn')) {
                showCustomPrompt('重命名分组', `请输入 [${group}] 的新名称：`, group, (newName) => {
                    if (newName && newName.trim() && newName.trim() !== group) {
                        if (appData.globalAiStickers[newName.trim()]) {
                            showToast("该分组名已存在！", 'error'); return;
                        }
                        appData.globalAiStickers[newName.trim()] = appData.globalAiStickers[group];
                        delete appData.globalAiStickers[group];
                        appData.aiContacts.forEach(contact => {
                            const index = contact.stickerGroups.indexOf(group);
                            if (index > -1) contact.stickerGroups[index] = newName.trim();
                        });
                        saveAppData();
                        renderStickerManager();
                    }
                });
            } else if (target.classList.contains('delete-group-btn')) {
                showCustomConfirm('【警告】删除分组', `确定要删除 [${group}] 整个分组吗？\n此操作不可撤销！`, () => {
                    const stickersToDelete = appData.globalAiStickers[group] || [];
                    stickersToDelete.forEach(sticker => db.deleteImage(sticker.id));
                    delete appData.globalAiStickers[group];
                    appData.aiContacts.forEach(contact => {
                        contact.stickerGroups = contact.stickerGroups.filter(g => g !== group);
                    });
                    saveAppData();
                    renderStickerManager();
                });
            }
        });

        // 神经2：为上传弹窗的“取消”按钮接上“电线”，修复取消键失灵的bug
        document.getElementById('cancel-sticker-upload-btn').addEventListener('click', closeStickerUploadModal);
        
        // ▲▲▲ 【【【修复植入结束】】】 ▲▲▲
            // 【【【全新：为文本编辑弹窗按钮绑定事件】】】
    cancelTextEditBtn.addEventListener('click', closeTextEditorModal);
    saveTextEditBtn.addEventListener('click', () => {
        if (textEditCallback) {
            // 执行我们之前暂存的回调，并把输入框的最新内容传回去
            textEditCallback(textEditorTextarea.value);
        }
        closeTextEditorModal();
    });
    window.addEventListener('click', closeContextMenu); // 点击页面任何地方都关闭菜单
        document.getElementById('context-menu-reply').addEventListener('click', () => {
            stageQuoteReply();
            closeContextMenu();
        });
        document.getElementById('context-menu-recall').addEventListener('click', () => {
            recallMessage();
            closeContextMenu();
        });
        document.getElementById('cancel-reply-btn').addEventListener('click', cancelQuoteReply);
   // 【【【全新V5.0：集成日历筛选的终极版搜索逻辑】】】
        const searchInput = document.getElementById('chat-list-search-input');
        const charFilterSelect = document.getElementById('char-filter-select');
        const dateFilterInput = document.getElementById('date-filter-input');
        const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
        const filtersPanel = document.getElementById('search-filters-panel');
        const applyFiltersBtn = document.getElementById('apply-filters-btn');
        const resetFiltersBtn = document.getElementById('reset-filters-btn');

        // performSearch 函数保持不变，它非常完美
        const performSearch = () => {
            const keyword = searchInput.value.trim().toLowerCase();
            const charFilter = charFilterSelect.value;
            const dateFilter = dateFilterInput.value.trim().toLowerCase();

            if (!keyword && charFilter === 'all' && !dateFilter) {
                renderChatList();
                return;
            }

            let contactsToSearch = appData.aiContacts;
            if (charFilter !== 'all') {
                contactsToSearch = appData.aiContacts.filter(c => c.remark.toLowerCase() === charFilter);
            }

            const allFoundMessages = contactsToSearch.flatMap(contact => {
                const matchingMessages = contact.chatHistory.filter(message => {
                    let dateMatch = true;
                    let keywordMatch = true;
                    if (dateFilter) {
                        // 【核心升级】判断用户输入的是不是一个标准日期
                        const isStandardDate = /^\d{4}-\d{2}-\d{2}$/.test(dateFilter);

                        if (isStandardDate) {
                            // 如果是标准日期，就用新“公历”进行精确比对
                            dateMatch = formatTimestampToDateString(message.timestamp) === dateFilter;
                        } else {
                            // 否则，还是用旧“字典”进行模糊的文字匹配（为了兼容"昨天"等）
                            dateMatch = formatMessageTimestamp(message.timestamp).toLowerCase().includes(dateFilter);
                        }
                    }
                    if (keyword) {
                        keywordMatch = typeof message.content === 'string' && message.content.toLowerCase().includes(keyword);
                    }
                    return dateMatch && keywordMatch;
                });
                return matchingMessages.map(message => ({
                    contact: contact,
                    message: message
                }));
            });
            renderChatList(allFoundMessages);
        };

        // --- 核心交互逻辑修改 ---
        // 1. 主输入框的实时搜索逻辑保持不变
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (!filtersPanel.classList.contains('is-open')) {
                    performSearch();
                }
            });
        }

        // 2. 点击“应用筛选”按钮的逻辑保持不变
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                performSearch();
                filtersPanel.classList.remove('is-open');
            });
        }

        // 3. 【【【核心升级：改造“重置”按钮和日期输入框】】】
        // 我们不再给下拉菜单绑定实时搜索，让用户设置好后统一点击“应用筛选”
        // if (charFilterSelect) charFilterSelect.addEventListener('change', performSearch); // 这行可以保留，也可以删除，看你想要的交互效果

        if (dateFilterInput) {
            // 用 flatpickr 接管日期输入框
            flatpickr(dateFilterInput, {
                locale: "zh",
                dateFormat: "Y-m-d",
                // 我们不再需要 onChange 实时搜索，因为有“应用筛选”按钮
            });
        }

        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                searchInput.value = '';
                charFilterSelect.value = 'all';
                
                // 【关键】使用日历的专用方法来清空
                if (dateFilterInput._flatpickr) {
                    dateFilterInput._flatpickr.clear();
                }
                
                performSearch(); // 执行清空后的“搜索”，恢复完整列表
            });
        }
        
        // 4. 筛选按钮的展开/收起逻辑保持不变
        if (toggleFiltersBtn) {
            toggleFiltersBtn.addEventListener('click', () => {
                filtersPanel.classList.toggle('is-open');
            });
        }

      
// 【【【核心新增 V2.0：为AI头像绑定“内置式内心独白”的点击事件】】】
messageContainer.addEventListener('click', (event) => {
    // 逻辑1：如果点击的是AI头像，就生成心声
    if (event.target.matches('.assistant-row .avatar')) {
        insertAndGenerateThoughtBubble();
    }

    // ▼▼▼ 【【【终极修复：数据与UI同步删除内心独白】】】 ▼▼▼
    if (event.target.matches('.thought-bubble-close-btn')) {
        const row = event.target.closest('.thought-bubble-row');
        if (!row) return;

        const messageId = row.dataset.messageId;
        if (!messageId) return;

        // 步骤1：通知“档案管理员”销毁记录
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (contact) {
            // 使用filter方法，创建一个不包含那条独白的新数组
            contact.chatHistory = contact.chatHistory.filter(msg => msg.id !== messageId);
            saveAppData(); // 【至关重要】保存档案的修改！
        }

        // 步骤2：命令“装修工”砸掉墙上的气泡
        row.remove();
    }
});
// ▼▼▼ 【【【全新：记账功能事件绑定】】】 ▼▼▼
        document.getElementById('fn-accounting').addEventListener('click', () => {
            closeFunctionsPanel(); // 【核心修正】在打开弹窗前，先命令功能面板收回
            document.getElementById('accounting-remarks-input').value = ''; // 确保备注框也被清空
            openAccountingModal();
        });
        cancelAccountingBtn.addEventListener('click', closeAccountingModal);
        addAccountingEntryBtn.addEventListener('click', stageAccountingEntry);
        confirmAccountingBtn.addEventListener('click', commitAccountingEntries);

        function openAccountingModal() {
            stagedAccountingEntries = [];
            document.getElementById('accounting-entry-list').innerHTML = '';
            document.getElementById('accounting-item-input').value = '';
            document.getElementById('accounting-amount-input').value = '';
            accountingModal.classList.remove('hidden');
        }

        function closeAccountingModal() {
            accountingModal.classList.add('hidden');
        }

        function stageAccountingEntry() {
            const itemInput = document.getElementById('accounting-item-input');
            const amountInput = document.getElementById('accounting-amount-input');
            const description = itemInput.value.trim();
            const amount = parseFloat(amountInput.value);

            if (!description || isNaN(amount) || amount <= 0) {
                showToast('请输入有效的项目和金额！', 'error');
                return;
            }

            const remarks = document.getElementById('accounting-remarks-input').value.trim();
            const type = document.querySelector('#accounting-type-selector .type-button.active').dataset.type;
            stagedAccountingEntries.push({ description, amount, remarks, type }); // 把类型也暂存起来
            renderStagedEntries();
            itemInput.value = '';
            amountInput.value = '';
            itemInput.focus();
        }

        function renderStagedEntries() {
            const list = document.getElementById('accounting-entry-list');
            list.innerHTML = '<h4>已添加：</h4>';
            stagedAccountingEntries.forEach(entry => {
                const div = document.createElement('div');
                div.textContent = `${entry.description}: ${entry.amount.toFixed(2)} 元`;
                list.appendChild(div);
            });
        }

        async function commitAccountingEntries() {
            // 如果输入框里还有内容，自动添加最后一笔
            const itemInput = document.getElementById('accounting-item-input');
            const amountInput = document.getElementById('accounting-amount-input');
            if (itemInput.value.trim() && amountInput.value.trim()) {
                stageAccountingEntry();
            }

            if (stagedAccountingEntries.length === 0) {
                showToast('你还没有记录任何账目哦！', 'error');
                return;
            }

            // 1. 创建永久的交易记录，并存入全局账本
            const newTransactions = stagedAccountingEntries.map(entry => ({
                id: `tx-${Date.now()}-${Math.random()}`,
                description: entry.description,
                amount: entry.amount,
                remarks: entry.remarks || '',
                type: entry.type || 'expense', // 从暂存数据里读取类型
                timestamp: Date.now()
            }));
            appData.userLedger.push(...newTransactions);
            saveAppData();

            // 2. 准备并发送记账卡片消息
            const totalItems = newTransactions.length;
            // 【核心修正】生成一条包含所有记账详情的描述性文本
            const contentForAI = newTransactions.map(tx => 
                `${tx.description}(${tx.amount.toFixed(2)}元${tx.remarks ? ', ' + tx.remarks : ''})`
            ).join('；');

            await dispatchAndDisplayUserMessage({
                type: 'accounting',
                content: `[记账] ${contentForAI}`, // 将详细信息发给AI
                transactionData: newTransactions
            });

            closeAccountingModal();
        }
        
    }
    

     

        // 【【【V3.0 终极版：确认上传按钮的全新大脑】】】
        document.getElementById('confirm-sticker-upload-btn').addEventListener('click', async (event) => {
            const confirmBtn = event.currentTarget;
            const groupName = document.getElementById('sticker-upload-group-select').value;
            if (!groupName) {
                showToast('请先创建并选择一个表情包分组！', 'error');
                return;
            }

            const uploadTasks = [];
            const activeTab = document.querySelector('.tab-button.active').dataset.tab;

            // --- 大脑决策中枢：判断当前是哪个上传模式 ---

            // 模式一：处理本地上传 (图2)
            if (activeTab === 'local') {
                const previewItems = document.querySelectorAll('#local-preview-grid .preview-item');
                if (previewItems.length === 0) {
                    showToast('请先选择要上传的图片！', 'error');
                    return;
                }
                for (const item of previewItems) {
                    const desc = item.querySelector('.desc-input').value.trim();
                    if (!desc) {
                        showToast('所有图片都必须填写描述！', 'error');
                        return; // 中断上传
                    }
                    // 从我们之前暂存的文件对象中获取数据
                    const file = item.fileObject; 
                    uploadTasks.push({ source: file, desc: desc, isUrl: false });
                }
            } 
            // 模式二：处理URL上传 (图3)
            else if (activeTab === 'url') {
                const urlPairs = document.querySelectorAll('#url-input-pairs-container .url-input-pair');
                if (urlPairs.length === 0) {
                    showToast('请至少添加一组URL和描述！', 'error');
                    return;
                }
                for (const pair of urlPairs) {
                    const desc = pair.querySelector('.url-desc-input').value.trim();
                    const url = pair.querySelector('.url-link-input').value.trim();
                    if (!desc || !url) {
                        showToast('所有URL和描述都不能为空！', 'error');
                        return; // 中断上传
                    }
                    uploadTasks.push({ source: url, desc: desc, isUrl: true });
                }
            }

            // --- 流水线处理器 (这段代码和以前完全一样，完美复用！) ---
            confirmBtn.disabled = true;
            let successCount = 0;
            let failureCount = 0;
            for (let i = 0; i < uploadTasks.length; i++) {
                const task = uploadTasks[i];
                confirmBtn.textContent = `上传中 (${i + 1}/${uploadTasks.length})...`;
                try {
                    let imageBlob = task.isUrl ? await imgSrcToBlob(task.source) : task.source;
                    const stickerId = `sticker-${Date.now()}-${Math.random()}`;
                    await db.saveImage(stickerId, imageBlob);
                    const newSticker = { id: stickerId, desc: task.desc, aiId: `${groupName}_${Date.now()}`};
                    appData.globalAiStickers[groupName].push(newSticker);
                    successCount++;
                } catch (error) {
                    console.error(`上传失败: ${task.source}`, error);
                    failureCount++;
                }
            }

            // --- 最终报告 (也和以前一样) ---
            saveAppData();
            renderStickerManager();
            closeStickerUploadModal();
            let resultMessage = `上传完成！成功 ${successCount} 个`;
            if (failureCount > 0) resultMessage += `，失败 ${failureCount} 个。`;
            showToast(resultMessage, failureCount > 0 ? 'warning' : 'success');
            confirmBtn.disabled = false;
            confirmBtn.textContent = '开始上传';
        });
        // 【【【V3.0 终极版：全新上传弹窗的交互逻辑】】】
        const tabBtnLocal = document.getElementById('tab-btn-local');
        const tabBtnUrl = document.getElementById('tab-btn-url');
        const panelLocal = document.getElementById('panel-local');
        const panelUrl = document.getElementById('panel-url');
        const localFileInput = document.getElementById('sticker-upload-file-input');
        const localPreviewGrid = document.getElementById('local-preview-grid');
        const urlPairsContainer = document.getElementById('url-input-pairs-container');
        const addUrlPairBtn = document.getElementById('add-url-pair-btn');

        // 1. 标签页切换逻辑
        tabBtnLocal.addEventListener('click', () => {
            tabBtnLocal.classList.add('active');
            tabBtnUrl.classList.remove('active');
            panelLocal.classList.add('active');
            panelUrl.classList.remove('active');
        });
        tabBtnUrl.addEventListener('click', () => {
            tabBtnUrl.classList.add('active');
            tabBtnLocal.classList.remove('active');
            panelUrl.classList.add('active');
            panelLocal.classList.remove('active');
        });

        // 2. 本地文件选择后的预览生成逻辑 (图2核心)
        localFileInput.addEventListener('change', (event) => {
            const files = event.target.files;
            for (const file of files) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const previewItem = document.createElement('div');
                    previewItem.className = 'preview-item';
                    previewItem.innerHTML = `
                        <img src="${e.target.result}" alt="preview">
                        <input type="text" class="desc-input" placeholder="表情描述...">
                        <button class="remove-preview-btn">&times;</button>
                    `;
                    // 【关键】把文件对象本身暂存到DOM元素上，方便后续上传
                    previewItem.fileObject = file; 
                    localPreviewGrid.appendChild(previewItem);
                };
                reader.readAsDataURL(file);
            }
            // 清空文件选择，以便可以重复选择相同文件
            localFileInput.value = null;
        });

        // 3. 动态删除本地预览项
        localPreviewGrid.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-preview-btn')) {
                e.target.parentElement.remove();
            }
        });

        // 4. 动态添加URL输入对 (图3核心)
        const createUrlPair = (desc = '', url = '') => {
            const pairDiv = document.createElement('div');
            pairDiv.className = 'url-input-pair';
            pairDiv.innerHTML = `
                <input type="text" class="url-desc-input" placeholder="表情描述" value="${desc}">
                <input type="text" class="url-link-input" placeholder="图片URL链接" value="${url}">
                <button class="remove-url-pair-btn">&times;</button>
            `;
            urlPairsContainer.appendChild(pairDiv);
        };
        addUrlPairBtn.addEventListener('click', createUrlPair);
        // ▼▼▼ 【【【全新：“智能粘贴”按钮的大脑】】】 ▼▼▼
        document.getElementById('parse-paste-btn').addEventListener('click', () => {
            const pasteTextarea = document.getElementById('smart-paste-textarea');
            const text = pasteTextarea.value.trim();
            if (!text) return;

            const lines = text.split('\n').filter(line => line.trim() !== ''); // 切分成行，并移除空行

            if (lines.length % 2 !== 0) {
                showToast('粘贴的内容行数必须是偶数！(描述-链接成对出现)', 'error');
                return;
            }

            // 在填充前，先清空现有的所有输入对
            urlPairsContainer.innerHTML = ''; 

            for (let i = 0; i < lines.length; i += 2) {
                const desc = lines[i];
                const url = lines[i + 1];
                createUrlPair(desc, url); // 调用我们升级后的函数，直接创建并填充
            }

            pasteTextarea.value = ''; // 清空粘贴板
            showToast('解析填充成功！', 'success');
        });
        // ▲▲▲ 【【【大脑植入完毕】】】 ▲▲▲
        // 默认先创建一个
        createUrlPair(); 

        // 5. 动态删除URL输入对
        urlPairsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-url-pair-btn')) {
                e.target.parentElement.remove();
            }
        });

            // ---------------------------------------------------
    // --- 【【【全新】】】记忆总结核心功能模块 ---
    // ---------------------------------------------------

    /**
     * 手动总结功能的入口处理函数
     */
    async function handleManualSummary() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        const rangeModal = document.getElementById('summary-range-modal');
        const rangeInput = document.getElementById('summary-range-input');
        const cancelBtn = document.getElementById('cancel-summary-range-btn');
        const confirmBtn = document.getElementById('confirm-summary-range-btn');

        rangeInput.value = '';
        rangeModal.classList.remove('hidden');

        const onConfirm = () => {
            rangeModal.classList.add('hidden');
            let messagesToSummarize;
            const range = parseInt(rangeInput.value);

            if (!isNaN(range) && range > 0) {
                messagesToSummarize = contact.chatHistory.slice(-range);
            } else {
                // 如果不填，则总结自上次自动总结以来的所有新消息
                const lastSummaryCount = contact.lastSummaryAtCount || 0;
                messagesToSummarize = contact.chatHistory.slice(lastSummaryCount);
            }

            if (messagesToSummarize.length === 0) {
                showCustomAlert('提示', '没有新的聊天记录需要总结。');
                return;
            }
            
            showModeSelectModal(async (isOnlineMode) => {
                summaryEditorTextarea.value = 'AI正在努力回忆中，请稍候...';
                summaryStatusText.textContent = '';
                summaryEditorModal.classList.remove('hidden');
                try {
                    const summary = await generateSummary(isOnlineMode, messagesToSummarize);
                    summaryEditorTextarea.value = summary;
                } catch (error) {
                    summaryEditorTextarea.value = `哎呀，总结失败了 T_T\n\n错误信息:\n${error.message}`;
                }
            });
            // 移除监听器，防止重复绑定
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onCancel = () => {
            rangeModal.classList.add('hidden');
             // 移除监听器
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };
        
        // 先移除旧的监听器，再添加新的，确保万无一失
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    }

    /**
     * 调用API生成总结的核心函数
     * @param {boolean} isOnlineMode - true为线上闲聊模式, false为线下剧情模式
     * @returns {Promise<string>} 返回AI生成的YAML格式总结
     */
    async function generateSummary(isOnlineMode, messagesToSummarize) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact || !messagesToSummarize || messagesToSummarize.length === 0) {
            return "# 没有任何聊天记录可以总结。";
        }

        const chatLogForApi = messagesToSummarize.map(msg => {
            const roleName = msg.role === 'user' ? (contact.userProfile.name || '用户') : (contact.name || 'AI');
            // 【优化】为每一条消息都加上时间戳，让AI更好地理解上下文
            const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            return `[${time}] ${roleName}: ${msg.content}`;
        }).join('\n');

        const currentDate = new Date().toLocaleString('zh-CN'); // <-- 变化点1：获取当前日期时间
        const prompt = buildSummaryPrompt(isOnlineMode, chatLogForApi, currentDate);
        
        const requestUrl = appData.appSettings.apiUrl.endsWith('/chat/completions') 
            ? appData.appSettings.apiUrl 
            : appData.appSettings.apiUrl + '/chat/completions';
        
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
            body: JSON.stringify({
                model: appData.appSettings.apiModel,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2 // 总结任务需要更低的温度以保证准确性
            })
        });

        if (!response.ok) {
            throw new Error(`API 请求失败，状态码: ${response.status}`);
        }
        const data = await response.json();
        if (!data.choices || data.choices.length === 0) {
            throw new Error("API 返回了无效的数据结构。");
        }
        return data.choices[0].message.content;
    }

    /**
     * 构建用于生成总结的详细Prompt
     * @param {boolean} isOnlineMode - 模式选择
     * @param {string} chatLog - 格式化后的聊天记录
     * @returns {string} 完整的Prompt
     */
    function buildSummaryPrompt(isOnlineMode, chatLog, currentDate) { // <-- 变化点1：增加了一个参数
        const commonRules = `
# 任务: 对话总结
你是一个专业的对话分析师。你的任务是阅读下面的对话记录，并以【严格的YAML格式】输出一份简明扼要的记忆总结。

## 上下文信息
- **当前时间**: ${currentDate}  // <-- 变化点2：把当前时间告诉AI

## 核心原则
- **只记录关键信息**: 忽略日常寒暄、无意义的闲聊和重复性内容。
- **客观中立**: 以第三人称视角进行记录，不要添加个人情感或评论。
- **合并事件**: 如果多个连续的对话都围绕同一主题，请将它们合并成一个事件。
- **时间与地点**: **必须使用上面提供的“当前时间”来填充“日期”和“时间”字段**。如果无法推断具体地点，线上模式请填写"线上"，线下模式请留空或填写"未知"。


## 输出格式 (必须严格遵守)
\`\`\`yaml
- 日期: YYYY年M月D日
  时间: HH:MM
  地点: 线上
  事件: 
    - 事件描述1
    - 事件描述2
- 日期: YYYY年M月D日
  时间: HH:MM
  地点: 咖啡馆
  事件: 
    - 事件描述1
\`\`\`
`;
        const onlineModeRules = `
## 【线上闲聊】模式总结重点
你现在总结的是两个网友之间的日常聊天，请重点关注以下几类信息：
1.  **个人信息披露**: 用户主动提及的个人喜好（如喜欢的食物、颜色、音乐）、厌恶、梦想、工作、生活习惯、过去的经历等。
2.  **重要约定或承诺**: 双方定下的约定，或一方做出的重要承诺。
3.  **剧烈情感波动**: 对话中表现出的强烈情绪转折点，如从开心到难过，或激烈的争吵与和解。
4.  **关系里程碑**: 确认关系、第一次视频、互相表达爱意等标志性事件。
`;
        const offlineModeRules = `
## 【线下剧情】模式总结重点
你现在总结的是一个故事或角色扮演(RP)的对话，请重点关注以下几类信息：
1.  **主线剧情推进**: 推动故事发展的关键行动或对话。例如，“角色A决定前往北方的森林寻找魔法石”。
2.  **关键道具/信息**: 对话中出现的、对未来剧情有重要影响的物品、线索或信息。
3.  **人物关系变化**: 角色之间关系发生的显著变化，如结盟、反目、产生爱意等。
4.  **新场景/新角色**: 对话中首次引入的重要场景或角色。
`;
        const finalSection = `
---
# 对话记录
${chatLog}

---
# 你的输出
现在，请只输出符合上述规则和格式的YAML记忆总结。不要包含任何解释、标题或\`\`\`yaml\`\`\`标记。
`;
        return commonRules + (isOnlineMode ? onlineModeRules : offlineModeRules) + finalSection;
    }

    /**
     * 将总结内容复制到剪贴板
     */
    function copySummaryToClipboard() {
        navigator.clipboard.writeText(summaryEditorTextarea.value).then(() => {
            summaryStatusText.textContent = "已成功复制到剪贴板！";
            setTimeout(() => summaryStatusText.textContent = '', 2000);
        }).catch(err => {
            summaryStatusText.textContent = "复制失败，请手动复制。";
        });
    }

    /**
     * 将编辑后的总结保存到AI的专属记忆中
     */
    function saveSummaryToMemory() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        const summaryToAdd = summaryEditorTextarea.value;
        if (summaryToAdd.trim() === '') return;

        // 如果原有记忆不为空，则在前面加一个换行符和分隔符，让格式更清晰
        if (contact.memory.trim() !== '') {
            contact.memory += '\n\n---\n\n';
        }
        contact.memory += summaryToAdd;
        
        saveAppData();
        
        // 【【【核心修复：在这里更新“小账本”！】】】
        // 解释：我们告诉程序，总结工作已经完成到了当前最新的消息位置。
        contact.lastSummaryAtCount = contact.chatHistory.length;
        saveAppData(); // 再次保存，确保“小账本”的数字被记录下来

        summaryEditorModal.classList.add('hidden');
        
        // 短暂提示用户保存成功
        showCustomAlert('操作成功', '记忆已成功存入AI的大脑！\n\n你现在可以在“编辑AI信息”页面查看。');
    }
    // --- 【全新】自动总结设置的交互与保存 ---
    function setupAutoSummaryInteraction() {
        // 点击显示文字，切换到输入框
        csAutoSummaryDisplay.addEventListener('click', () => {
            csAutoSummaryDisplay.classList.add('hidden');
            csAutoSummaryInput.classList.remove('hidden');
            csAutoSummaryInput.focus();
        });

        // 输入框失去焦点时，保存并切换回显示文字
        csAutoSummaryInput.addEventListener('blur', () => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;
            
            let threshold = parseInt(csAutoSummaryInput.value);
            if (isNaN(threshold) || threshold < 50) {
                threshold = 100; // 默认值
            }
            csAutoSummaryInput.value = threshold;
            contact.autoSummaryThreshold = threshold;
            csAutoSummaryDisplay.textContent = `${threshold}条`;
            saveAppData();

            csAutoSummaryDisplay.classList.remove('hidden');
            csAutoSummaryInput.classList.add('hidden');
        });

        // 切换开关时，保存状态
        csAutoSummaryToggle.addEventListener('change', () => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;
            contact.autoSummaryEnabled = csAutoSummaryToggle.checked;
            saveAppData();
        });
    }
    
    /**
     * 【全新】显示模式选择弹窗的函数
     * @param {function} onSelect - 用户选择后的回调函数，接收一个布尔值参数 (true=online)
     */
    let modeSelectionCallback = null;
    function showModeSelectModal(onSelect) {
        modeSelectionCallback = onSelect;
        modeSelectModal.classList.remove('hidden');
    }
    // 为模式选择按钮绑定一次性事件
    modeOnlineBtn.addEventListener('click', () => {
        if (modeSelectionCallback) modeSelectionCallback(true);
        modeSelectModal.classList.add('hidden');
    });
    modeOfflineBtn.addEventListener('click', () => {
        if (modeSelectionCallback) modeSelectionCallback(false);
        modeSelectModal.classList.add('hidden');
    });


    /**
     * 【全新】自动总结触发器
     */
    async function triggerAutoSummaryIfNeeded() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact || !contact.autoSummaryEnabled) {
            return; // 如果没开启，直接退出
        }

        const threshold = contact.autoSummaryThreshold || 100;
        const currentCount = contact.chatHistory.length;
        const lastSummaryCount = contact.lastSummaryAtCount || 0;

        // 核心判断：当前消息数 - 上次总结时的消息数 >= 阈值
        if ((currentCount - lastSummaryCount) >= threshold) {
            console.log(`自动总结触发！当前: ${currentCount}, 上次: ${lastSummaryCount}, 阈值: ${threshold}`);
            showToast('正在自动总结新消息...', 'info', 0); // 显示“正在进行”提示，且不自动消失

            // 准备要总结的消息：从上次总结的位置切到当前位置
            const messagesToSummarize = contact.chatHistory.slice(lastSummaryCount, currentCount);

            try {
                // 自动总结默认使用【线上闲聊】模式，并传入精确的消息包
                const summary = await generateSummary(true, messagesToSummarize);
                
                // 静默保存到记忆中
                if (contact.memory.trim() !== '') {
                    contact.memory += '\n\n---\n# 自动总结\n';
                }
                contact.memory += summary;
                
                // 更新“上次总结位置”标记
                contact.lastSummaryAtCount = currentCount;
                saveAppData();
                console.log("自动总结成功并已存入记忆。");
                showToast('自动总结成功！', 'success', 2000); // 显示成功提示，2秒后消失

            } catch (error) {
                console.error("自动总结失败:", error);
                showToast('自动总结失败，请检查网络或API设置', 'error', 4000); // 显示失败提示，4秒后消失
            }
        }
    }
    // --- 【全新】引用与撤回功能模块 ---

    const contextMenu = document.getElementById('message-context-menu');
    const replyIndicator = document.getElementById('reply-indicator');

    // “工人”：打开右键菜单
    function openContextMenu(event, messageRow) {
        event.preventDefault(); 
        activeContextMenuMessageId = messageRow.dataset.messageId;

        const messageData = findMessageById(activeContextMenuMessageId);
        if (!messageData || messageData.type === 'recalled') return;

        const recallMenuItem = document.getElementById('context-menu-recall');
        
        // 【【【核心权限验证】】】
        // 只有当消息的发送者是“user”时，才显示“撤回”按钮
        if (messageData.role === 'user') {
            recallMenuItem.style.display = 'block';
        } else {
            recallMenuItem.style.display = 'none';
        }
        
        contextMenu.style.top = `${event.clientY}px`;
        contextMenu.style.left = `${event.clientX}px`;
        contextMenu.style.display = 'block';
    }

    // “工人”：关闭右键菜单
    function closeContextMenu() {
        contextMenu.style.display = 'none';
        activeContextMenuMessageId = null;
    }

    // “工人”：执行引用操作
    function stageQuoteReply() {
        const messageData = findMessageById(activeContextMenuMessageId);
        if (!messageData) return;

        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        const senderName = messageData.role === 'user' ? (contact.userProfile.name || '你') : contact.remark;
        
        stagedQuoteData = {
            messageId: messageData.id,
            sender: senderName,
            content: messageData.content.length > 20 ? messageData.content.substring(0, 20) + '...' : messageData.content
        };
        
        // 显示提示条
        document.getElementById('reply-indicator-text').textContent = `正在回复 ${senderName}`;
        replyIndicator.style.display = 'flex';
        chatInput.focus();
    }
    
    // “工人”：取消引用
    function cancelQuoteReply() {
        stagedQuoteData = null;
        replyIndicator.style.display = 'none';
    }
    
    // “工人”：执行撤回操作
    function recallMessage() {
        if (!activeContextMenuMessageId) return;

        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        const messageIdToRecall = activeContextMenuMessageId;
        
        // 【【【核心终极修复：引入“双轨制”处理逻辑】】】

        // 轨道一：处理“已发送”的消息 (书架上的书)
        let messageIndexInHistory = contact.chatHistory.findIndex(msg => msg.id === messageIdToRecall);
        if (messageIndexInHistory > -1) {
            const originalMessage = contact.chatHistory[messageIndexInHistory];
            const recalledMessage = {
                id: originalMessage.id,
                type: 'recalled',
                role: originalMessage.role,
                timestamp: originalMessage.timestamp || Date.now()
            };
            contact.chatHistory.splice(messageIndexInHistory, 1, recalledMessage);
            saveAppData();
            openChat(activeChatContactId); // 对于历史记录的重大改变，我们仍然需要“总馆长”来刷新
            return; // 完成任务，立刻返回
        }

        // 轨道二：处理“待发送”的消息 (推车上的书) - 这是全新的、精准的“微创手术”
        let messageIndexInStaged = stagedUserMessages.findIndex(msg => msg.id === messageIdToRecall);
        if (messageIndexInStaged > -1) {
            const originalMessage = stagedUserMessages[messageIndexInStaged];
            const recalledMessage = {
                id: originalMessage.id,
                type: 'recalled',
                role: originalMessage.role || 'user', // 待发消息默认是user
                timestamp: originalMessage.timestamp || Date.now()
            };
            
            // 步骤1: 在数据层面，用“墓碑”替换掉推车上的原书
            stagedUserMessages.splice(messageIndexInStaged, 1, recalledMessage);
            
            // 步骤2: 在视觉层面，找到墙上对应的那个临时展示的气泡
            const messageRow = messageContainer.querySelector(`[data-message-id="${messageIdToRecall}"]`);
            if (messageRow) {
                // 步骤3: 直接用“墓碑”的HTML内容，替换掉那个气泡的HTML内容！
                const recallerName = '你'; // 待发消息只能是用户自己撤回
                messageRow.className = 'message-recalled'; // 改变它的样式类
                messageRow.innerHTML = `${recallerName}撤回了一条消息`;
                // 我们不需要保存数据，因为stagedUserMessages是临时的，会在发送时一起处理
            }
        }
    }
    function recallMessageByAI(messageId) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        let messageIndex = contact.chatHistory.findIndex(msg => msg.id === messageId);

        if (messageIndex > -1) {
            const originalMessage = contact.chatHistory[messageIndex];
            // 确保AI不能撤回用户的消息
            if (originalMessage.role !== 'assistant') return;

            const recalledMessage = {
                id: originalMessage.id,
                type: 'recalled',
                role: 'assistant', // 明确是AI撤回的
                timestamp: originalMessage.timestamp || Date.now()
            };
            contact.chatHistory.splice(messageIndex, 1, recalledMessage);
            saveAppData();
            openChat(activeChatContactId); // 刷新界面
        }
    }

    // “聪明的档案管理员”：一个能在所有地方查找消息的工具
    function findMessageById(messageId) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return null;
        let message = contact.chatHistory.find(msg => msg.id === messageId);
        if (!message) {
            message = stagedUserMessages.find(msg => msg.id === messageId);
        }
        return message;
        // 5. 【【【全新：为“加载更多”按钮绑定事件】】】
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                // 直接调用加载函数即可，它会自动加载下一页
                loadAndDisplayHistory();
            });
        }
    }
// ▼▼▼ 【【【全新：账本系统核心逻辑】】】 ▼▼▼

        // --- 导航与返回 ---
        document.getElementById('side-menu-ledger').addEventListener('click', () => {
            closeSideMenu(); // 【核心修正】在切换视图前，先关闭侧边栏
            switchToView('ledger-view');
            renderLedgerView(); // 每次进入都重新渲染
        });
        document.getElementById('back-to-main-from-ledger').addEventListener('click', () => {
            // 返回时，根据底部导航栏的状态决定去哪里
            const activeNav = document.querySelector('#app-nav .nav-button.active');
            switchToView(activeNav ? activeNav.dataset.view : 'chat-list-view');
        });

        // --- 账本渲染函数 ---
        function renderLedgerView() {
            ledgerContainer.innerHTML = '';
            if (!appData.userLedger || appData.userLedger.length === 0) {
                ledgerContainer.innerHTML = '<p class="placeholder-text" style="padding-top: 20px;">还没有任何记账记录哦，点击右下角+号添加第一笔吧！</p>';
                return;
            }
            // 按时间倒序排列，最新的在最前面
            const sortedLedger = [...appData.userLedger].reverse();
            sortedLedger.forEach(tx => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'ledger-item';
                const date = new Date(tx.timestamp);
                const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                
                const isIncome = tx.type === 'income';
                itemDiv.innerHTML = `
                    <div class="ledger-item-details">
                        <div class="ledger-item-header">
                            <span class="desc">${tx.description}</span>
                            <span class="amount ${isIncome ? 'income' : ''}">${isIncome ? '+' : '-'} ${tx.amount.toFixed(2)}</span>
                        </div>
                        <div class="ledger-item-meta">
                            <span>${date.toLocaleDateString()} ${timeStr}</span>
                            ${tx.remarks ? `<span class="remarks">${tx.remarks}</span>` : ''}
                        </div>
                    </div>
                    <div class="ledger-item-actions">
                        <button class="edit-tx-btn" data-id="${tx.id}" title="编辑">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </button>
                        <button class="delete-tx-btn" data-id="${tx.id}" title="删除">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18m-2 14H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-6 5v6m4-6v6"/></svg>
                        </button>
                    </div>
                `;
                ledgerContainer.appendChild(itemDiv);
            });
        }

        // --- 添加、编辑、删除的事件委托 ---
        ledgerContainer.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-tx-btn');
            const deleteBtn = e.target.closest('.delete-tx-btn');
            if (editBtn) {
                openTransactionEditor(editBtn.dataset.id);
            }
            if (deleteBtn) {
                deleteTransaction(deleteBtn.dataset.id);
            }
        });
// --- 【V2.0】为两个类型选择器绑定通用切换逻辑 ---
        function setupTypeSelector(selectorId) {
            const typeSelector = document.getElementById(selectorId);
            if (typeSelector) {
                typeSelector.addEventListener('click', (e) => {
                    if (e.target.classList.contains('type-button')) {
                        typeSelector.querySelectorAll('.type-button').forEach(btn => btn.classList.remove('active'));
                        e.target.classList.add('active');
                    }
                });
            }
        }
        setupTypeSelector('tx-editor-type-selector');
        setupTypeSelector('accounting-type-selector');
        // --- “+” 按钮用于添加新账目 ---
        addTransactionFab.addEventListener('click', () => openTransactionEditor());

        // --- 编辑器弹窗的控制逻辑 ---
        let currentEditingTxId = null; // 用于记录当前正在编辑的账目ID
        function openTransactionEditor(txId = null) {
            currentEditingTxId = txId;
            const title = document.getElementById('transaction-editor-title');
            const descInput = document.getElementById('tx-editor-desc-input');
            const amountInput = document.getElementById('tx-editor-amount-input');
            const remarksInput = document.getElementById('tx-editor-remarks-input');

            const typeSelector = document.getElementById('tx-editor-type-selector');
            const typeButtons = typeSelector.querySelectorAll('.type-button');
            
            // 默认设置为支出
            typeButtons.forEach(btn => btn.classList.remove('active'));
            typeSelector.querySelector('[data-type="expense"]').classList.add('active');

            if (txId) {
                title.textContent = '编辑账目';
                const tx = appData.userLedger.find(t => t.id === txId);
                if (tx) {
                    descInput.value = tx.description;
                    amountInput.value = tx.amount;
                    remarksInput.value = tx.remarks || '';
                    // 根据账目类型激活对应的按钮
                    typeSelector.querySelector(`[data-type="${tx.type}"]`).classList.add('active');
                }
            } else {
                title.textContent = '添加账目';
                descInput.value = '';
                amountInput.value = '';
                remarksInput.value = '';
            }
            transactionEditorModal.classList.remove('hidden');
        }

        function closeTransactionEditor() {
            transactionEditorModal.classList.add('hidden');
        }

        function saveTransaction() {
            const desc = document.getElementById('tx-editor-desc-input').value.trim();
            const amount = parseFloat(document.getElementById('tx-editor-amount-input').value);
            const remarks = document.getElementById('tx-editor-remarks-input').value.trim();

            if (!desc || isNaN(amount) || amount <= 0) {
                showToast('请输入有效的项目和金额！', 'error');
                return;
            }

            const selectedType = document.querySelector('#tx-editor-type-selector .type-button.active').dataset.type;

            if (currentEditingTxId) { // 编辑模式
                const tx = appData.userLedger.find(t => t.id === currentEditingTxId);
                if (tx) {
                    tx.type = selectedType;
                    tx.description = desc;
                    tx.amount = amount;
                    tx.remarks = remarks;
                }
            } else { // 添加模式
                appData.userLedger.push({
                    id: `tx-${Date.now()}-${Math.random()}`,
                    type: selectedType,
                    description: desc,
                    amount: amount,
                    remarks: remarks,
                    timestamp: Date.now()
                });
            }
            saveAppData();
            renderLedgerView();
            closeTransactionEditor();
        }

        function deleteTransaction(txId) {
            showCustomConfirm('删除确认', '确定要删除这笔记账吗？此操作无法撤销。', () => {
                appData.userLedger = appData.userLedger.filter(tx => tx.id !== txId);
                saveAppData();
                renderLedgerView();
                showToast('删除成功', 'success');
            });
        }
        
        // --- 为编辑器弹窗按钮绑定事件 ---
        document.getElementById('cancel-tx-editor-btn').addEventListener('click', closeTransactionEditor);
        document.getElementById('save-tx-editor-btn').addEventListener('click', saveTransaction);

        // --- 【全新】用户表情包设置逻辑 ---
    const manageMyStickersEntry = document.getElementById('manage-my-stickers-entry');
    const manageAiStickersEntry = document.getElementById('manage-ai-stickers-entry');
    const userStickerSettingsView = document.getElementById('user-sticker-settings-view');

    // 入口1：管理我的表情包
    manageMyStickersEntry.addEventListener('click', () => {
        renderUserStickerSettings();
        switchToView('user-sticker-settings-view');
    });

    // 入口2：管理AI表情包仓库 (旧功能的新入口)
    manageAiStickersEntry.addEventListener('click', () => {
        renderStickerManager();
        switchToView('ai-sticker-manager-view');
    });
// ▼▼▼ 【【【终极修复 PART 1：“AI表情包管理页”的总电闸】】】 ▼▼▼
        document.getElementById('sticker-manager-container').addEventListener('click', (e) => {
            const target = e.target;
            const group = target.dataset.group;

            if (target.classList.contains('sticker-add-placeholder')) {
                openStickerUploadModal(); 
            }
            else if (target.classList.contains('sticker-delete-btn')) {
                const stickerId = target.dataset.id;
                showCustomConfirm('删除确认', `确定要从 [${group}] 中删除这个表情包吗？`, () => {
                    db.deleteImage(stickerId); 
                    appData.globalAiStickers[group] = appData.globalAiStickers[group].filter(s => s.id !== stickerId);
                    saveAppData();
                    renderStickerManager();
                });
            }
            else if (target.classList.contains('rename-group-btn')) {
                showCustomPrompt('重命名分组', `请输入 [${group}] 的新名称：`, group, (newName) => {
                    if (newName && newName.trim() && newName.trim() !== group) {
                        if (appData.globalAiStickers[newName.trim()]) {
                            showToast("该分组名已存在！", 'error'); return;
                        }
                        appData.globalAiStickers[newName.trim()] = appData.globalAiStickers[group];
                        delete appData.globalAiStickers[group];
                        appData.aiContacts.forEach(contact => {
                            const index = contact.stickerGroups.indexOf(group);
                            if (index > -1) contact.stickerGroups[index] = newName.trim();
                        });
                        saveAppData();
                        renderStickerManager();
                    }
                });
            }
            else if (target.classList.contains('delete-group-btn')) {
                showCustomConfirm('【警告】删除分组', `确定要删除 [${group}] 整个分组吗？\n此操作不可撤销！`, () => {
                    const stickersToDelete = appData.globalAiStickers[group] || [];
                    stickersToDelete.forEach(sticker => db.deleteImage(sticker.id));
                    delete appData.globalAiStickers[group];
                    appData.aiContacts.forEach(contact => {
                        contact.stickerGroups = contact.stickerGroups.filter(g => g !== group);
                    });
                    saveAppData();
                    renderStickerManager();
                });
            }
        });

        // ▼▼▼ 【【【终极修复 PART 2：“新建分组”的“+”号按钮电线】】】 ▼▼▼
        document.getElementById('add-sticker-group-btn').addEventListener('click', () => {
            showCustomPrompt('新建分组', '请输入新的表情包分组名:', '', (groupName) => {
                if (groupName && groupName.trim()) {
                    const trimmedName = groupName.trim();
                    if (!appData.globalAiStickers[trimmedName]) {
                        appData.globalAiStickers[trimmedName] = [];
                        saveAppData();
                        renderStickerManager();
                        showToast(`分组 [${trimmedName}] 创建成功！`, 'success');
                    } else {
                        showToast('该分组名已存在！', 'error');
                    }
                }
            });
        });
    // 从用户表情包设置页返回
     document.getElementById('back-to-settings-from-sticker-manager-btn').addEventListener('click', () => switchToView('settings-view'));
// ▼▼▼ 【【【终极修复：为“我的表情包”页面的返回键接上电线】】】 ▼▼▼
    document.getElementById('back-to-settings-from-user-sticker-btn').addEventListener('click', () => switchToView('settings-view'));
    // 保存用户表情包设置
    document.getElementById('save-user-sticker-settings-button').addEventListener('click', () => {
        // 【【【核心抢救：为AI表情包仓库管理页面“接通电源”】】】
        // 我们使用事件委托，只在父容器上监听一次点击，就能管理所有内部按钮
        document.getElementById('sticker-manager-container').addEventListener('click', (e) => {
            const target = e.target;
            const group = target.dataset.group;

            // 1. 点击“+”号添加表情包
            if (target.classList.contains('sticker-add-placeholder')) {
                // 【重要修正】调用我们新的、不需要参数的上传函数
                openStickerUploadModal(); 
            }
            // 2. 点击“×”号删除单个表情包
            else if (target.classList.contains('sticker-delete-btn')) {
                const stickerId = target.dataset.id;
                showCustomConfirm('删除确认', `确定要从 [${group}] 中删除这个表情包吗？`, () => {
                    db.deleteImage(stickerId); 
                    appData.globalAiStickers[group] = appData.globalAiStickers[group].filter(s => s.id !== stickerId);
                    saveAppData();
                    renderStickerManager();
                });
            }
            // 3. 点击“重命名”按钮
            else if (target.classList.contains('rename-group-btn')) {
                showCustomPrompt('重命名分组', `请输入 [${group}] 的新名称：`, group, (newName) => {
                    if (newName && newName.trim() && newName.trim() !== group) {
                        if (appData.globalAiStickers[newName.trim()]) {
                            showToast("该分组名已存在！", 'error'); return;
                        }
                        // 数据迁移
                        appData.globalAiStickers[newName.trim()] = appData.globalAiStickers[group];
                        delete appData.globalAiStickers[group];
                        // 更新所有引用了旧分组名的角色
                        appData.aiContacts.forEach(contact => {
                            const index = contact.stickerGroups.indexOf(group);
                            if (index > -1) contact.stickerGroups[index] = newName.trim();
                        });
                        saveAppData();
                        renderStickerManager();
                    }
                });
            }
            // 4. 点击“删除分组”按钮
            else if (target.classList.contains('delete-group-btn')) {
                showCustomConfirm('【警告】删除分组', `确定要删除 [${group}] 整个分组吗？\n此操作不可撤销！`, () => {
                    // 【安全保障】在删除前，先把分组内的所有图片文件也从数据库里删除
                    const stickersToDelete = appData.globalAiStickers[group] || [];
                    stickersToDelete.forEach(sticker => db.deleteImage(sticker.id));

                    delete appData.globalAiStickers[group];
                    // 移除所有角色对该分组的引用
                    appData.aiContacts.forEach(contact => {
                        contact.stickerGroups = contact.stickerGroups.filter(g => g !== group);
                    });
                    saveAppData();
                    renderStickerManager();
                });
            }
        });
        // ▼▼▼ 【【【终极修复：为“新建分组”的“+”号按钮接上电线】】】 ▼▼▼
        document.getElementById('add-sticker-group-btn').addEventListener('click', () => {
            showCustomPrompt('新建分组', '请输入新的表情包分组名:', '', (groupName) => {
                if (groupName && groupName.trim()) {
                    const trimmedName = groupName.trim();
                    if (!appData.globalAiStickers[trimmedName]) {
                        appData.globalAiStickers[trimmedName] = [];
                        saveAppData();
                        renderStickerManager(); // 刷新界面，显示出新的空分组
                        showToast(`分组 [${trimmedName}] 创建成功！`, 'success');
                    } else {
                        showToast('该分组名已存在！', 'error');
                    }
                }
            });
        });
        // ▲▲▲ 【【【修复植入完毕】】】 ▲▲▲
        const selectedGroups = [];
        const checkboxes = document.querySelectorAll('#user-sticker-groups-container input[type="checkbox"]:checked');
        checkboxes.forEach(checkbox => {
            selectedGroups.push(checkbox.value);
        });
        appData.globalUserProfile.selectedStickerGroups = selectedGroups;
        saveAppData();
        showToast('保存成功！', 'success');
        switchToView('settings-view');
    });

    // 渲染用户表情包设置页面的函数
    function renderUserStickerSettings() {
        const container = document.getElementById('user-sticker-groups-container');
        container.innerHTML = '';
        const allGroupNames = Object.keys(appData.globalAiStickers);

        if (allGroupNames.length === 0) {
            container.innerHTML = '<p class="placeholder-text">仓库里还没有任何表情包分组，请先在“AI表情包仓库管理”中添加。</p>';
            return;
        }

        const subscribedGroups = appData.globalUserProfile.selectedStickerGroups || [];

        allGroupNames.forEach(groupName => {
            const isChecked = subscribedGroups.includes(groupName);
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.className = 'checkbox-item';
            checkboxWrapper.innerHTML = `
                <input type="checkbox" id="user-sticker-group-${groupName}" value="${groupName}" ${isChecked ? 'checked' : ''}>
                <label for="user-sticker-group-${groupName}">${groupName}</label>
            `;
            container.appendChild(checkboxWrapper);
        });
    }

    initialize();
});

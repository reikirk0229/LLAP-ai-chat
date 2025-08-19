// script.js (V8.26 - 红包功能终极修复版 + IndexedDB存储)
document.addEventListener('DOMContentLoaded', () => {
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
    let selectedMessages = new Set();
    let longPressTimer;
    let lastRenderedTimestamp = 0;
    let loadingBubbleElement = null;
    let stagedStickerFile = null;

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

function scrollToBottom() {
    // 这个函数只有一个使命：把聊天容器平滑地滚动到底部。
    messageContainer.scrollTop = messageContainer.scrollHeight;
}
    function renderUserStickerPanel(newlyAddedSticker = null) {
            userStickerPanel.innerHTML = '';
            const addBtn = document.createElement('div');
            addBtn.className = 'sticker-item sticker-add-btn';
            addBtn.textContent = '+';
            addBtn.title = '添加新表情';
            addBtn.onclick = () => { openStickerUploadModal('user'); };
            userStickerPanel.appendChild(addBtn);

            appData.userStickers.forEach(sticker => {
                const stickerItem = document.createElement('div');
                stickerItem.className = 'sticker-manager-item'; 
                stickerItem.innerHTML = `
                    <img data-sticker-id="${sticker.id}" src="" alt="${sticker.desc}">
                    <button class="sticker-delete-btn" data-id="${sticker.id}">&times;</button>
                `;
                
                const imgElement = stickerItem.querySelector('img');

                if (newlyAddedSticker && sticker.id === newlyAddedSticker.id) {
                    imgElement.src = URL.createObjectURL(newlyAddedSticker.blob);
                } else {
                    db.getImage(sticker.id).then(blob => {
                        if (blob) {
                            imgElement.src = URL.createObjectURL(blob);
                        }
                    }).catch(error => {
                         console.error(`加载旧表情失败 (ID: ${sticker.id}):`, error);
                    });
                }

                const imgContainer = stickerItem.querySelector('img');
                if(imgContainer) {
                    imgContainer.onclick = () => sendStickerMessage(sticker);
                }
                userStickerPanel.appendChild(stickerItem);
            });
        }
        function sendStickerMessage(sticker) {
            // 【核心修改】我们现在发送的是 sticker.id，而不是 sticker.url
            const message = { type: 'sticker', content: `[表情] ${sticker.desc}`, stickerId: sticker.id };
            stagedUserMessages.push(message);
            displayMessage(message.content, 'user', { isStaged: true, type: 'sticker', stickerId: message.stickerId });
            userStickerPanel.classList.remove('is-open');
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
            if (!stagedImageData) { showToast('请先选择一张图片！', 'error'); return; }
            // 【核心改造】
            // 1. 将 Base64 数据转换为真实图片文件 (Blob)
            const imageBlob = await (await fetch(stagedImageData)).blob();
            // 2. 创建一个唯一的图片ID作为标签
            const imageId = `chatimg-${Date.now()}-${Math.random()}`;
            // 3. 将图片存入大仓库
            await db.saveImage(imageId, imageBlob);
            // 4. 创建消息时，只保存图片ID，不再保存庞大的 imageData
            const message = { type: 'image', content: description || '图片', imageId: imageId };
            stagedUserMessages.push(message);
            // 5. 显示消息时，也传入 imageId
            displayMessage(message.content, 'user', { isStaged: true, type: 'image', imageId: message.imageId });

        } else { // 模拟照片的情况保持不变
            if (!description) { alert('请填写图片描述！'); return; }
            const message = { type: 'image', content: description, imageData: null }; // imageData为null表示是模拟图
            stagedUserMessages.push(message);
            displayMessage(message.content, 'user', { isStaged: true, type: 'image', imageData: null });
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
    function sendRelationshipProposal(proposerRole) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        const messageId = `staged-${Date.now()}-rel-${Math.random()}`;
        const relationshipData = {
            proposer: proposerRole,
            status: 'pending'
        };
        
        // 【核心改造】我们不再直接调用displayMessage，而是走官方的“暂存-发送”流程
        const message = { 
            id: messageId,
            type: 'relationship_proposal', 
            // 【关键】赋予卡片真正的“内容”，让AI能读懂
            content: '[关系邀请] 已发送情侣关系邀请', 
            relationshipData: relationshipData 
        };

        if (proposerRole === 'user') {
            // 【V2.2 核心改造】只暂存，不发送！
            // 1. 把它放进“待发消息”列表
            stagedUserMessages.push(message);
            // 2. 在屏幕上画出这张“待发”卡片
            displayMessage(message.content, 'user', { isStaged: true, ...message });
            // 3. 【删除】commitAndSendStagedMessages()，把发送权交还给用户！
        } else { 
            // 如果是AI发起的，则直接显示
            displayMessage(message.content, 'assistant', { isNew: true, ...message });
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
    function handleEndRelationship() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        // 【V2.3 核心改造】分手也只暂存，不发送！
        const breakupMessage = {
            type: 'relationship_breakup',
            content: '[解除关系] 亲密关系已解除' // 使用更中立的文本
        };

        stagedUserMessages.push(breakupMessage);
        displayMessage(breakupMessage.content, 'user', { isStaged: true, ...breakupMessage });
        // 【删除】commitAndSendStagedMessages()，把发送权交还给用户！
        // 【删除】所有后续的数据和UI更新，这些都将在用户按下发送键后处理
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
        await renderChatList();
        renderSettingsUI();
        bindEventListeners();
        switchToView('chat-list-view');
    }
    function loadAppData() {
        const savedData = localStorage.getItem('myAiChatApp_V8_Data');
        if (savedData) { appData = JSON.parse(savedData); } 
        else { appData = { aiContacts: [], appSettings: { apiType: 'openai_proxy', apiUrl: '', apiKey: '', apiModel: '', contextLimit: 20 } }; }

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
        });
        // ▼▼▼ 请把下面这段全新的代码，粘贴在这里 ▼▼▼
        // 【全新】为全局AI表情包建立仓库，如果不存在的话
        if (!appData.globalAiStickers) {
            // 数据结构为：{ "分组名": [ {id, url, desc}, ... ], ... }
            appData.globalAiStickers = {};
        }
        // ▼▼▼ 请把下面这段全新的代码，粘贴在这里 ▼▼▼
        // 【全新】为用户建立独立的表情包仓库
        if (!appData.userStickers) {
            // 用户的表情包结构可以更简单，直接是一个表情包数组
            appData.userStickers = [];
        }
        // ▲▲▲ 请把上面这段全新的代码，粘贴在这里 ▲▲▲

        saveAppData();
    }
    function saveAppData() {
        localStorage.setItem('myAiChatApp_V8_Data', JSON.stringify(appData));
    }
    
    function switchToView(viewId) {
        views.forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        
        // 【【【核心修改】】】
        // 现在，只在聊天列表页显示导航栏
        if (viewId === 'chat-list-view') {
            appNav.classList.remove('hidden');
        } else {
            appNav.classList.add('hidden');
        }

        appContainer.style.paddingBottom = '0px';
        navButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.view === viewId);
        });
    }

    async function renderChatList() {
        chatListContainer.innerHTML = '';
        if (!appData.aiContacts || appData.aiContacts.length === 0) { 
            chatListContainer.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">点击右上角+号添加AI联系人</p>';
            return; 
        }
        const sortedContacts = [...appData.aiContacts].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
        for (const contact of sortedContacts) {
            // 【核心修改】从大仓库根据标签取回头像
            const avatarBlob = await db.getImage(`${contact.id}_avatar`);
            const avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
            
            const lastMessage = (contact.chatHistory && contact.chatHistory.length > 0) ? contact.chatHistory[contact.chatHistory.length - 1] : { content: '...' };
            const item = document.createElement('div');
            item.className = 'chat-list-item';
            if (contact.isPinned) { item.classList.add('pinned'); }
            item.dataset.contactId = contact.id;

            const isPartner = appData.appSettings.partnerId === contact.id;
            const partnerIcon = isPartner ? '<span class="partner-icon">💖</span>' : '';

            item.innerHTML = `<img class="avatar" src="${avatarUrl}" alt="avatar"><div class="chat-list-item-info"><div class="chat-list-item-top"><span class="chat-list-item-name">${contact.remark}${partnerIcon}</span><span class="chat-list-item-time">昨天</span></div><div class="chat-list-item-msg">${lastMessage.content || '...'}</div></div>`;
            item.addEventListener('click', () => openChat(contact.id));
            chatListContainer.appendChild(item);
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
    async function loadAndDisplayHistory(contactId) {
        const contact = appData.aiContacts.find(c => c.id === contactId);
        if (!contact) return;

        messageContainer.innerHTML = '';

        // 步骤1: 快速地把所有消息的“空盘子”都摆上桌
        contact.chatHistory.forEach((msg, index) => {
            msg.id = msg.id || `${Date.now()}-${index}`;
            displayMessage(msg.content, msg.role, { isNew: false, ...msg });
        });

        // 【【【终极核心修复：为监工升级工作手册】】】
        // 步骤2: 找出所有需要“后厨现做”的“热菜”（包括图片和表情包）
        const imageLoadPromises = contact.chatHistory
            .filter(msg => (msg.type === 'image' && msg.imageId) || (msg.type === 'sticker' && msg.stickerId))
            .map(msg => {
                // 步骤3: 为每一道“热菜”都创建一个独立的“上菜”任务
                return new Promise(resolve => {
                    const id = msg.imageId || msg.stickerId;
                    // 关键一步：我们现在是根据“订单号”(id)去找到那个盘子，而不是盲目地找
                    const imgElement = messageContainer.querySelector(`[data-image-id="${id}"], [data-sticker-id="${id}"]`);
                    
                    if (!imgElement) {
                        resolve(); // 如果盘子没找到，直接算这道菜“上完了”
                        return;
                    }

                    // 监工的指令：如果这张图片已经碰巧加载完了，就立刻报告
                    if (imgElement.complete) {
                        resolve();
                    } else {
                        // 否则，就一直等到它“上好菜”（加载完）或“打翻了”（加载失败）
                        imgElement.onload = () => resolve();
                        imgElement.onerror = () => resolve(); // 即使失败，也要报告，不能卡住整个宴会
                    }
                });
            });

        // 步骤4: “监工”开始工作，等待所有“上菜”任务都完成
        if (imageLoadPromises.length > 0) {
            await Promise.all(imageLoadPromises);
        }

        // 步骤5: 所有菜已上齐，现在可以去打聚光灯了！
        scrollToBottom();
    }

async function openChat(contactId) {
    activeChatContactId = contactId;
    exitSelectMode();
    lastReceivedSuggestions = [];
    stagedUserMessages = [];
    lastRenderedTimestamp = 0;
    aiSuggestionPanel.classList.add('hidden');
    userStickerPanel.classList.remove('is-open');

    const contact = appData.aiContacts.find(c => c.id === contactId);
    if (!contact) return;

    const avatarBlob = await db.getImage(`${contact.id}_avatar`);
    contact.avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
    const userAvatarBlob = await db.getImage(`${contact.id}_user_avatar`);
    contact.userAvatarUrl = userAvatarBlob ? URL.createObjectURL(userAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';

    updateChatHeader();
    chatAiActivityStatus.textContent = contact.activityStatus || '';
    
    switchToView('chat-window-view');
    
    await loadAndDisplayHistory(contactId);
}
    
        function displayMessage(text, role, options = {}) {
        const { isNew = false, isLoading = false, type = 'text', isStaged = false, id = null, timestamp = null } = options;
        
        const messageId = id || `${Date.now()}-${Math.random()}`;
        const currentTimestamp = timestamp || Date.now();
        const TIME_GAP = 3 * 60 * 1000;
        let timestampDiv = null;

        if (!isLoading && (lastRenderedTimestamp === 0 || currentTimestamp - lastRenderedTimestamp > TIME_GAP)) {
            timestampDiv = document.createElement('div');
            timestampDiv.className = 'timestamp-display';
            timestampDiv.textContent = formatMessageTimestamp(currentTimestamp);
        }
        if (!isLoading) { lastRenderedTimestamp = currentTimestamp; }
        
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);

        if (type === 'system') {
            const systemDiv = document.createElement('div');
            systemDiv.className = 'system-message';
            systemDiv.textContent = text;
            if (timestampDiv) messageContainer.appendChild(timestampDiv);
            messageContainer.appendChild(systemDiv);
            scrollToBottom(); // 系统消息是即时的，可以直接滚动
            if (isNew && !isStaged && contact) {
                 contact.chatHistory.push({ id: messageId, role: 'system', content: text, type: 'system', timestamp: currentTimestamp });
                 saveAppData();
            }
            return Promise.resolve(); // 对于系统消息，返回一个立刻完成的“凭证”
        }

        const messageRow = document.createElement('div');
        messageRow.className = `message-row ${role}-row`;
        messageRow.dataset.messageId = messageId;
        messageRow.dataset.role = role;
        if (isLoading && role === 'assistant') { loadingBubbleElement = messageRow; }
        if (isStaged) { messageRow.dataset.staged = 'true'; }

        const avatarUrl = role === 'user' ? (contact ? contact.userAvatarUrl : '') : (contact ? contact.avatarUrl : '');
        let messageContentHTML;

        // 【说明】下面的 switch case 结构和你原来的是一样的，只是为了完整性
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
                messageContentHTML = `
                    <div class="message message-voice" style="width: ${bubbleWidth}px;">
                        <div class="play-icon-container"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg></div>
                        <div class="sound-wave">${waveBarsHTML}</div>
                        <span class="voice-duration">${duration}"</span>
                    </div>
                    <div class="voice-text-content">${text}</div>
                `;
                break;
            case 'red-packet':
                 const packet = options.redPacketData || {};
                const isOpened = packet.isOpened || false;
                const bubbleClass = isOpened ? 'message-red-packet opened' : 'message-red-packet';
                messageRow.dataset.action = 'open-red-packet';
                messageRow.dataset.messageId = messageId;
                messageContentHTML = `
                    <div class="${bubbleClass}">
                        <div class="rp-bubble-content">
                            <span class="rp-bubble-icon">🧧</span>
                            <div class="rp-bubble-info">
                                <p>${text || '恭喜发财'}</p>
                                <span>${isOpened ? '已被领取' : '点击领取红包'}</span>
                            </div>
                        </div>
                    </div>
                `;
                break;
            case 'sticker':
                const stickerId = options.stickerId || (options.stickerUrl ? options.stickerUrl.split('/').pop() : '');
                messageContentHTML = `<div class="message message-sticker"><img data-sticker-id="${stickerId}" src="" alt="sticker"></div>`;
                break;
            case 'relationship_proposal':
                // ... 这部分关系卡片的逻辑和你原来的一样，保持不变 ...
                const cardData = options.relationshipData || {};
                let title, subtitle;
                if (cardData.status === 'pending') {
                    if (role === 'user') {
                        title = '已发送情侣关系邀请';
                        subtitle = '等待对方同意...';
                    } else {
                        title = '想和你建立情侣关系';
                        subtitle = '和Ta成为情侣，让爱意点滴记录';
                    }
                } else if (cardData.status === 'accepted') {
                    if (cardData.proposer === role) {
                        title = '我们已经成功建立情侶关系';
                        subtitle = '我已同意了你的邀请，现在我们是情侣啦';
                    } else {
                        title = '对方已同意';
                        subtitle = '你们现在是情侣关系了';
                    }
                }
                const isClickable = (cardData.proposer === 'assistant' && cardData.status === 'pending');
                const clickAction = isClickable ? `onclick="openRelationshipModal('${messageId}')"` : '';
                messageContentHTML = `
                    <div class="message message-relationship-card" ${clickAction} style="${isClickable ? 'cursor:pointer;' : ''}">
                        <div class="relationship-card-content">
                            <div class="relationship-card-text">
                                <h4>${title}</h4>
                                <p>${subtitle}</p>
                            </div>
                            <div class="relationship-card-icon"><img src="https://i.postimg.cc/P5Lg62Vq/lollipop.png" alt="icon"></div>
                        </div>
                        <div class="relationship-card-footer">亲密关系</div>
                    </div>
                `;
                break;
            default:
                messageContentHTML = `<div class="message">${text}</div>`;
        }
        
        messageRow.innerHTML = `
            <div class="select-checkbox hidden"></div>
            <img class="avatar" src="${avatarUrl}">
            <div class="message-content">${messageContentHTML}</div>
        `;
        
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
        
        if (timestampDiv) { messageContainer.appendChild(timestampDiv); }
        messageContainer.appendChild(messageRow);

        const aiImageBubble = messageRow.querySelector('.message-image-ai-direct');
        if (aiImageBubble) {
            aiImageBubble.addEventListener('click', () => {
                const description = aiImageBubble.dataset.description;
                openAiImageModal(description);
            });
        }

        // 【【【核心修改部分】】】
        return new Promise(resolve => {
            let isAsync = false;

            if (type === 'image' && options.imageId) {
                isAsync = true;
                const imageElement = messageRow.querySelector(`[data-image-id="${options.imageId}"]`);
                if (imageElement) {
                    imageElement.onload = () => resolve();
                    imageElement.onerror = () => resolve();
                    db.getImage(options.imageId).then(blob => {
                        if (blob) {
                            imageElement.src = URL.createObjectURL(blob);
                        } else {
                            resolve(); // 即使数据库没找到，也算完成
                        }
                    }).catch(() => resolve()); // 如果数据库读取失败，也算完成
                } else {
                    resolve();
                }
            }
            
            if (type === 'sticker' && options.stickerId) {
                isAsync = true;
                const stickerElement = messageRow.querySelector(`[data-sticker-id="${options.stickerId}"]`);
                if (stickerElement) {
                    stickerElement.onload = () => resolve();
                    stickerElement.onerror = () => resolve();
                    db.getImage(options.stickerId).then(blob => {
                        if (blob) {
                            stickerElement.src = URL.createObjectURL(blob);
                        } else {
                            resolve();
                        }
                    }).catch(() => resolve());
                } else {
                    resolve();
                }
            }
            
            if (isNew && !isLoading && !isStaged && contact) {
                // ... 保存聊天记录的逻辑和你原来的一样，保持不变 ...
                const messageToSave = { id: messageId, role: role, content: text, type: type, timestamp: currentTimestamp };
                if (options.imageId) { messageToSave.imageId = options.imageId; }
                if (options.redPacketData) { messageToSave.redPacketData = options.redPacketData; }
                if (options.stickerId) { messageToSave.stickerId = options.stickerId; }
                if (options.relationshipData) { messageToSave.relationshipData = options.relationshipData; }
                contact.chatHistory.push(messageToSave);
                saveAppData();
                renderChatList();
            }

            // 如果不是图片或表情包这种“慢活儿”，就立刻返回“完工凭证”
            if (!isAsync) {
                resolve();
            }
        });
    }

    function removeLoadingBubble() {
        if (loadingBubbleElement) { loadingBubbleElement.remove(); loadingBubbleElement = null; }
    }
    
    async function stageUserMessage() {
        const text = chatInput.value.trim();
        if (text === '') return;
        
        const messageData = { content: text, type: 'text' };
        stagedUserMessages.push(messageData);
        
        // 【【【BUG 2 终极修复】】】
        // 步骤1: 命令工人去干活，并等待他返回“完工凭证”
        await displayMessage(text, 'user', { isStaged: true, type: 'text' });
        
        // 步骤2: 确认工人已完工，现在执行滚动！
        scrollToBottom();

        chatInput.value = '';
    }

    function commitAndSendStagedMessages() {
        // 步骤1: 如果输入框还有文字，先把它也变成一个临时消息
        if (chatInput.value.trim() !== '') {
            stageUserMessage();
        }

        // 步骤2: 如果没有任何待发消息，就什么也不做
        if (stagedUserMessages.length === 0) return;

        // 步骤3: 【核心改造】找到所有屏幕上的临时消息，把它们“转正”
        document.querySelectorAll('[data-staged="true"]').forEach(el => {
            el.removeAttribute('data-staged'); // 移除“临时工”标签
        });

        // 步骤4: 在数据层面，把所有临时消息正式存入聊天记录，并检查特殊事件
        stagedUserMessages.forEach(msg => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (contact) {
                // 【【【V2.3 核心修复：分手事件监听器】】】
                // 在消息被存入历史记录之前，检查它是否是分手卡
                if (msg.type === 'relationship_breakup') {
                    // 如果是，立刻更新全局关系状态！
                    appData.appSettings.partnerId = null;
                    // 并立刻刷新UI，让爱心消失
                    updateChatHeader();
                    renderChatList();
                }

                const messageToSave = {
                    id: `${Date.now()}-${Math.random()}`,
                    role: 'user',
                    timestamp: Date.now(),
                    ...msg
                };
                contact.chatHistory.push(messageToSave);
            }
        });
        
        // 步骤5: 清空待发区，触发总结检查，并触发AI
        saveAppData();
        triggerAutoSummaryIfNeeded(); // 【新增】调用自动总结检查器
        stagedUserMessages = [];
        getAiResponse();
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
        displayMessage('对方正在输入...', 'assistant', { isLoading: true });
        messageContainer.scrollTop = messageContainer.scrollHeight;
        
        const worldBookString = (contact.worldBook && contact.worldBook.length > 0) ? contact.worldBook.map(entry => `- ${entry.key}: ${entry.value}`).join('\n') : '无';
        const contextLimit = appData.appSettings.contextLimit || 50;
        const recentHistory = contact.chatHistory.slice(-contextLimit);
        
        let availableStickersPrompt = "你没有任何可用的表情包。";
        const availableStickers = [];
        contact.stickerGroups.forEach(groupName => {
            const group = appData.globalAiStickers[groupName] || [];
            group.forEach(sticker => {
                // 【核心修正】确保我们用正确的ID给AI
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

        // --- 【【【核心改造开始】】】 ---
        // 1. 我们需要用 Promise.all 来处理异步的图片加载
        const messagesForApi = await Promise.all(
            recentHistory
                .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                .map(async (msg) => { // 2. map函数现在是异步的 (async)
                    const role = msg.role;
                    const content = msg.content || '';

                    // 3. 全新的识图逻辑！
                    //    检查消息类型是不是图片，并且它有没有“取货单”(imageId)
                    if (role === 'user' && msg.type === 'image' && msg.imageId) {
                        try {
                            // 4. 去大仓库取货
                            const imageBlob = await db.getImage(msg.imageId);
                            if (imageBlob) {
                                // 5. 把图片文件转换成AI能看懂的“文本格式”
                                const imageDataUrl = await blobToDataURL(imageBlob);
                                // 6. 按照官方格式，把图片和文字一起打包
                                return {
                                    role: 'user',
                                    content: [
                                        { type: "text", text: content },
                                        { type: "image_url", image_url: { url: imageDataUrl } }
                                    ]
                                };
                            }
                        } catch (error) {
                            console.error("加载聊天图片失败:", error);
                            // 如果图片加载失败，就只发送文字部分，避免程序中断
                            return { role: role, content: content };
                        }
                    }

                    // (对于非图片消息，逻辑保持不变)
                    let contentPrefix = '';
                    if (msg.type === 'voice') contentPrefix = '[语音]';
                    else if (msg.type === 'red-packet') contentPrefix = '[红包]';
                    else if (msg.type === 'relationship_proposal') contentPrefix = '[关系邀请]';
                    
                    return { role: role, content: `${contentPrefix}${content}` };
                })
        );
        // --- 【【【核心改造结束】】】 ---

        const userPersona = (contact.userProfile && contact.userProfile.persona) 
            ? contact.userProfile.persona 
            : '我是一个普通人。';

        // 【【【核心修改：注入全局情感状态】】】
        let relationshipContext = '';
        const currentPartnerId = appData.appSettings.partnerId;

        // 【V2.1 认知升级】
        if (currentPartnerId) {
            // --- 用户有伴侣的情况 ---
            if (currentPartnerId === contact.id) {
                relationshipContext = `\n- **特别关系**: 你是用户的官方情侣。你们的对话应该充满爱意和亲密。`;
            } else {
                const partner = appData.aiContacts.find(c => c.id === currentPartnerId);
                const partnerName = partner ? partner.name : '另一位AI';
                relationshipContext = `\n- **重要情报**: 用户已经有官方情侣了，名字是“${partnerName}”。你必须在对话中体现出你对此的认知。`;
            }
        } else {
            // --- 用户是单身的情况 ---
            relationshipContext = `\n- **重要情报**: 用户目前是单身状态。`;
        }
        
        // 【【【语法修正版】】】
        const finalPrompt = `# 任务: 角色扮演
        你是一个AI角色，你正在和一个真实用户聊天。你的所有回复都必须严格以角色的身份进行。

## 1. 核心身份
- 你的名字是: "${contact.name}"
- 你的核心人设是: 
\`\`\`
${contact.persona}
\`\`\`

## 2. 背景设定 (优先级高于个人记忆)
- 附加设定(世界书): ${worldBookString}
- 你的专属记忆: ${contact.memory}

## 3. 行为准则
- **重要背景**: 你正在通过聊天软件与用户（人设：${userPersona}）进行【线上对话】。当前时间: ${new Date().toLocaleString('zh-CN')}。${relationshipContext}
- **沟通风格参考**: ${contact.chatStyle || '自然发挥即可'}
- **回复风格**: 模拟真实聊天，将一个完整的思想拆分成【2-8条】独立的短消息。
- **禁止括号**: 【绝对不能】包含任何括号内的动作、神态描写。
- **回应图片**: 如果用户的消息包含图片，你【必须】先针对图片内容进行回应，然后再进行其他对话。
- **回应表情**: 如果用户的消息是 \`[表情] 文字描述\` 的格式，这代表用户给你发了一个表情包。你【必须】针对文字描述所表达的情绪进行回应。
- **发送图片**: 如果你想发图片，请使用格式 \`[IMAGE: 这是图片的详细文字描述]\` 来单独发送它。
- **发送语音**: 如果某条回复更适合用语音表达（如唱歌、叹气、笑声），请在回复前加上 \`[voice]\` 标签。例如：\`[voice]嗯...让我想想。\`
- **发送红包**: 在特殊节日、为了表达感谢或在剧情需要时，你可以发红包。请【严格使用】以下格式：\`[REDPACKET:祝福语,金额]\`。例如：\`[REDPACKET:节日快乐！,8.88]\`
${ contact.canPropose ? `
- **【【【核心规则 V2.0：发起/回应关系邀请】】】**
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

### 可用的表情包列表
${availableStickersPrompt}

---
# 【【【严格的输出格式要求】】】
你的回复【必须】是一个能被JSON解析的、单一的JSON对象。
你的输出【禁止】包含任何聊天内容、解释、或 \`\`\`json 标记。直接开始输出JSON对象。
这个JSON对象必须包含 "reply" 和 "suggestions" 两个键，"activity" 键是【可选的】。

- **"activity" (可选字段)**: 只有当你觉得你的虚拟状态【发生了有意义的改变时】，才包含这个字段。它是一个描述你新状态的【简短】字符串 (例如: "去洗澡了", "躺在床上", "开始看书")。
  - **重要原则**: 如果你的状态没有变化（比如你一直在看书），就【绝对不要】在你的JSON输出中包含 "activity" 字段。系统会自动维持你之前的状态。
- **"reply"**: 一个字符串数组，包含了你作为角色的所有聊天消息（包括特殊指令）。
- **"suggestions"**: 一个包含4条字符串的数组，是为用户准备的回复建议（两条积极，一条中立，一条挑战）。

**格式示例 (状态改变时):**
\`\`\`json
{
  "activity": "打了个哈欠",
  "reply": ["有点困了呢..."],
  "suggestions": ["要去睡了吗？", "累了就休息吧", "是不是熬夜了？", "别睡，起来嗨！"]
}
\`\`\`

**格式示例 (状态不变时):**
\`\`\`json
{
  "reply": ["这本书真有意思。", "特别是主角的这段经历。"],
  "suggestions": ["听起来不错！", "讲讲书里的内容？", "你喜欢看什么类型的书？", "别看书了，陪我聊天。"]
}
\`\`\`

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

            try {
                const jsonMatch = responseText.match(/{[\s\S]*}/);
                if (jsonMatch && jsonMatch[0]) {
                    const parsedResponse = JSON.parse(jsonMatch[0]);

                    if (parsedResponse.activity && typeof parsedResponse.activity === 'string') {
                        chatAiActivityStatus.textContent = parsedResponse.activity;
                        contact.activityStatus = parsedResponse.activity; 
                        saveAppData();
                    }
                    if (parsedResponse.reply && Array.isArray(parsedResponse.reply)) {
                        replies = parsedResponse.reply;
                    }
                    if (parsedResponse.suggestions && Array.isArray(parsedResponse.suggestions)) {
                        lastReceivedSuggestions = parsedResponse.suggestions;
                    }

                } else {
                    throw new Error("在AI回复中未找到有效的JSON结构。");
                }

            } catch (error) {
                console.error("解析AI返回的JSON失败:", error);
                replies = responseText.split('\n').filter(line => line.trim() !== '');
            }

            if (replies.length > 0) {
                const displayPromises = [];

                for (const msg of replies) {
                    let promise;
                    if (msg.startsWith('[REDPACKET:')) {
                        try {
                            const data = msg.substring(11, msg.length - 1).split(',');
                            const blessing = data[0].trim();
                            const amount = parseFloat(data[1]);
                            if (blessing && !isNaN(amount)) {
                                const redPacketData = { id: `rp-ai-${Date.now()}`, senderName: contact.name, blessing: blessing, amount: amount, isOpened: false };
                                promise = displayMessage(blessing, 'assistant', { isNew: true, type: 'red-packet', redPacketData: redPacketData });
                            }
                        } catch (e) { console.error("解析红包指令失败", e); }
                    } else if (msg.startsWith('[voice]')) {
                        const voiceText = msg.substring(7).trim();
                        if (voiceText) { promise = displayMessage(voiceText, 'assistant', { isNew: true, type: 'voice' }); }
                    } else if (msg.startsWith('[IMAGE:')) {
                        const description = msg.substring(7, msg.length - 1).trim();
                        if (description) { promise = displayMessage(description, 'assistant', { isNew: true, type: 'image' }); }
                    } else if (msg.trim().startsWith('[STICKER:')) {
                        const stickerAiId = msg.trim().substring(9, msg.length - 1);
                        // 【【【BUG 1 终极修复】】】
                        // 我们用AI返回的aiId，去我们准备好的可用列表里找到那个表情包
                        const foundSticker = availableStickers.find(s => s.aiId === stickerAiId);
                        if (foundSticker) {
                            // 然后，我们把它的真实数据库ID (foundSticker.id) 传给工人
                            promise = displayMessage('', 'assistant', { isNew: true, type: 'sticker', stickerId: foundSticker.id });
                        }
                    } else if (msg.trim() === '[ACCEPT_REDPACKET]') {
                        // ... 这部分逻辑不变 ...
                        const userRedPacketMsg = [...contact.chatHistory].reverse().find(
                            m => m.role === 'user' && m.type === 'red-packet' && m.redPacketData && !m.redPacketData.isOpened
                        );
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
                        const userProposal = [...contact.chatHistory].reverse().find(m => 
                            m.type === 'relationship_proposal' && 
                            m.relationshipData.proposer === 'user' &&
                            m.relationshipData.status === 'pending'
                        );
                        if (userProposal) {
                            window.handleRelationshipAction(userProposal.id, true);
                        }
                        continue;
                    } else {
                        promise = displayMessage(msg, 'assistant', { isNew: true, type: 'text' });
                    }

                    if (promise) { displayPromises.push(promise); }
                    await sleep(Math.random() * 400 + 300);
                }

                await Promise.all(displayPromises);
                scrollToBottom();
            }
        } catch (error) {
            console.error('API调用失败:', error);
            removeLoadingBubble();
            displayMessage(`(｡•́︿•̀｡) 哎呀,出错了: ${error.message}`, 'assistant', { isNew: true });
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
    function openStickerUploadModal(context) {
        const modal = document.getElementById('sticker-upload-modal');
        const title = document.getElementById('sticker-upload-title');
        const preview = document.getElementById('sticker-upload-preview');
        const urlInput = document.getElementById('sticker-upload-url-input');
        const descInput = document.getElementById('sticker-upload-desc-input');
        const fileInput = document.getElementById('sticker-upload-file-input');

        if (context === 'user') {
            title.textContent = `添加我的表情包`;
        } else {
            title.textContent = `为 [${context}] 添加表情包`;
        }

        preview.src = '';
        urlInput.value = '';
        descInput.value = '';
        fileInput.value = null; 

        modal.dataset.currentContext = context; // 【关键修改】将上下文暂存到弹窗上
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

    function sendVoiceMessage() {
        const text = voiceTextInput.value.trim();
        if (!text) { alert("请输入语音内容！"); return; }
        stagedUserMessages.push({ content: text, type: 'voice' });
        displayMessage(text, 'user', { isStaged: true, type: 'voice' });
        closeVoiceModal();
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
        element.addEventListener('mousedown', (e) => { if (isSelectMode || e.button !== 0) return; longPressTimer = setTimeout(() => enterSelectMode(element), 500); });
        element.addEventListener('mouseup', () => clearTimeout(longPressTimer));
        element.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
        element.addEventListener('touchstart', (e) => { if (isSelectMode) return; longPressTimer = setTimeout(() => enterSelectMode(element), 500); });
        element.addEventListener('touchend', () => clearTimeout(longPressTimer));
        element.addEventListener('touchmove', () => clearTimeout(longPressTimer));
        element.addEventListener('click', () => { if (isSelectMode) toggleMessageSelection(element); });
    }

    function enterSelectMode(element) {
        // 【核心修复1】在进行任何操作前，先把当前的滚动位置存进“备忘录”
        const savedScrollTop = messageContainer.scrollTop;

        isSelectMode = true;
        chatHeaderNormal.classList.add('hidden');
        chatHeaderSelect.classList.remove('hidden');
        
        // (这里是导致滚动的“笨”操作，保持不变)
        messageContainer.querySelectorAll('.message-row').forEach(row => {
            row.classList.add('in--select-mode');
            row.querySelector('.select-checkbox').classList.remove('hidden');
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
        selectCount.textContent = `已选择${selectedMessages.size}项`;
        deleteSelectedButton.disabled = selectedMessages.size === 0;
        const firstSelectedId = selectedMessages.values().next().value;
        const firstSelectedEl = messageContainer.querySelector(`[data-message-id="${firstSelectedId}"]`);
        if (selectedMessages.size === 1 && firstSelectedEl && firstSelectedEl.dataset.role === 'user') {
            editSelectedButton.classList.remove('hidden');
        } else {
            editSelectedButton.classList.add('hidden');
        }
    }
    
    function editSelectedMessage() {
    if (selectedMessages.size !== 1) return;
    const messageId = selectedMessages.values().next().value;
    const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
    if (!contact) return;
    const messageData = contact.chatHistory.find(msg => msg.id === messageId);
    if (!messageData || messageData.role !== 'user') return;

    // 【核心改造】不再使用 prompt，而是打开我们自己的弹窗
    openTextEditorModal(messageData.content, (newText) => {
        // 这段代码会在用户点击“保存”时执行
        if (newText !== null && newText.trim() !== '') {
            messageData.content = newText.trim();
            saveAppData();
            const messageElement = messageContainer.querySelector(`[data-message-id="${messageId}"] .message`);
            if (messageElement) { messageElement.textContent = newText.trim(); }
            renderChatList();
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
        messageContainer.addEventListener('click', (e) => {
            const targetRow = e.target.closest('.message-row[data-action="open-red-packet"]');
            if (targetRow) {
                openRedPacket(targetRow.dataset.messageId);
            }
        });

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

        function handleConfirmRedPacket() {
            const blessing = rpInputBlessing.value.trim();
            const amount = parseFloat(rpInputAmount.value);

            if (!blessing) { showCustomAlert('提示', '请输入红包祝福语！'); return; }
            if (isNaN(amount) || amount <= 0) { showCustomAlert('提示', '请输入有效的金额！'); return; }

            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            const tempMessageId = `staged-${Date.now()}-${Math.random()}`;
            const newRedPacket = { id: `rp-${Date.now()}`, senderName: contact.userProfile.name, blessing: blessing, amount: amount, isOpened: false };
            
            stagedUserMessages.push({ id: tempMessageId, role: 'user', content: blessing, type: 'red-packet', redPacketData: newRedPacket });
            displayMessage(blessing, 'user', { isStaged: true, type: 'red-packet', redPacketData: newRedPacket, id: tempMessageId });
            closeRedPacketInputModal();
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
        moreFunctionsButton.addEventListener('click', () => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;
            const currentPartnerId = appData.appSettings.partnerId;

            if (currentPartnerId === null) {
                // 【V2.3 流程回归】先弹窗确认，再暂存卡片
                showCustomConfirm('关系邀请', `确定要向 ${contact.remark} 发送情侣关系邀请吗？`, () => {
                    sendRelationshipProposal('user');
                });
            } else if (currentPartnerId === contact.id) {
                // 【V2.3 流程统一】分手也先弹窗确认，再暂存卡片
                showCustomConfirm('解除关系', `你确定要向 ${contact.remark} 发送解除关系通知吗？这将会生成一张分手卡片待发送。`, () => {
                    handleEndRelationship();
                });
            } else {
                const partner = appData.aiContacts.find(c => c.id === currentPartnerId);
                const partnerName = partner ? partner.remark : '未知';
                showCustomAlert('提示', `你当前的情侣是 ${partnerName}。\n请先与对方解除关系，才能开始新的恋情。`);
            }
        });
        aiHelperButton.addEventListener('click', () => {
            if (aiSuggestionPanel.classList.contains('hidden')) { displaySuggestions(); } 
            else { hideSuggestionUI(); }
        });
        cancelSelectButton.addEventListener('click', exitSelectMode);
        editSelectedButton.addEventListener('click', editSelectedMessage);
        deleteSelectedButton.addEventListener('click', deleteSelectedMessages);
        avatarUploadArea.addEventListener('click', () => avatarUploadInput.click());
        avatarUploadInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], `${activeChatContactId}_avatar`, avatarPreview));
        photoUploadArea.addEventListener('click', () => photoUploadInput.click());
        photoUploadInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], `${activeChatContactId}_photo`, photoPreview));
        
        contactSettingsView.querySelectorAll('.settings-item').forEach(item => {
            if (item.id !== 'cs-message-count-item' && item.id !== 'cs-edit-ai-profile' && item.id !== 'cs-edit-my-profile' && item.id !== 'cs-summarize-chat' && item.id !== 'cs-clear-history' && item.id !== 'cs-delete-contact' && !item.querySelector('.switch')) {
                item.addEventListener('click', () => alert('功能开发中，敬请期待！'));
            }
        });

        // --- 【全新】记忆总结相关事件绑定 (最终修正版) ---
        csSummarizeChat.addEventListener('click', handleManualSummary);
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
        messageContainer.addEventListener('click', () => {
            if (userStickerPanel.classList.contains('is-open')) {
                userStickerPanel.classList.remove('is-open');
            }
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
            // 【【【全新：为文本编辑弹窗按钮绑定事件】】】
    cancelTextEditBtn.addEventListener('click', closeTextEditorModal);
    saveTextEditBtn.addEventListener('click', () => {
        if (textEditCallback) {
            // 执行我们之前暂存的回调，并把输入框的最新内容传回去
            textEditCallback(textEditorTextarea.value);
        }
        closeTextEditorModal();
    });
    }
    
    // --- AI表情包管理系统 ---
        const stickerManagerView = document.getElementById('ai-sticker-manager-view');
        const stickerUploadModal = document.getElementById('sticker-upload-modal');
        const addStickerGroupBtn = document.getElementById('add-sticker-group-btn');

        // 在主设置页，添加一个入口
        const settingsForm = document.getElementById('settings-form');
        const stickerManagerEntry = document.createElement('div');
        stickerManagerEntry.className = 'settings-group';
        stickerManagerEntry.innerHTML = '<div class="settings-item"><span>AI表情包管理</span><span class="arrow">&gt;</span></div>';
        settingsForm.insertBefore(stickerManagerEntry, settingsForm.querySelector('hr'));
        
        stickerManagerEntry.addEventListener('click', () => {
            renderStickerManager();
            switchToView('ai-sticker-manager-view');
        });

        // 从表情包管理页返回设置页
        document.getElementById('back-to-settings-from-sticker-btn').addEventListener('click', () => switchToView('settings-view'));

        // 点击“+”创建新分组
        addStickerGroupBtn.addEventListener('click', () => {
            const groupName = prompt("请输入新的表情包分组名：");
            if (groupName && groupName.trim()) {
                if (appData.globalAiStickers[groupName.trim()]) {
                    alert("该分组名已存在！");
                    return;
                }
                appData.globalAiStickers[groupName.trim()] = [];
                saveAppData();
                renderStickerManager();
            }
        });

        // 使用事件委托处理所有对分组和表情包的操作
        document.getElementById('sticker-manager-container').addEventListener('click', (e) => {
            const target = e.target;
            const group = target.dataset.group;

            // 添加表情包
            if (target.classList.contains('sticker-add-placeholder')) {
                openStickerUploadModal(group);
            }
            // 删除表情包
            if (target.classList.contains('sticker-delete-btn')) {
                const stickerId = target.dataset.id;
                if (confirm(`确定要从 [${group}] 中删除这个表情包吗？`)) {
                    // 【核心新增】从大仓库删除图片文件
                    db.deleteImage(stickerId); 
                    // 从小口袋删除记录
                    appData.globalAiStickers[group] = appData.globalAiStickers[group].filter(s => s.id !== stickerId);
                    saveAppData();
                    renderStickerManager();
                }
            }
            // 重命名分组
            if (target.classList.contains('rename-group-btn')) {
                const newName = prompt(`请输入 [${group}] 的新名称：`, group);
                if (newName && newName.trim() && newName.trim() !== group) {
                    if (appData.globalAiStickers[newName.trim()]) {
                        alert("该分组名已存在！"); return;
                    }
                    // 数据迁移
                    appData.globalAiStickers[newName.trim()] = appData.globalAiStickers[group];
                    delete appData.globalAiStickers[group];
                    // 更新所有引用了旧分组名的角色
                    appData.aiContacts.forEach(contact => {
                        const index = contact.stickerGroups.indexOf(group);
                        if (index > -1) {
                            contact.stickerGroups[index] = newName.trim();
                        }
                    });
                    saveAppData();
                    renderStickerManager();
                }
            }
            // 删除分组
            if (target.classList.contains('delete-group-btn')) {
                if (confirm(`【警告】确定要删除 [${group}] 整个分组吗？\n此操作不可撤销，且所有使用此分组的AI将无法再使用这些表情包！`)) {
                    delete appData.globalAiStickers[group];
                     // 移除所有角色对该分组的引用
                    appData.aiContacts.forEach(contact => {
                        contact.stickerGroups = contact.stickerGroups.filter(g => g !== group);
                    });
                    saveAppData();
                    renderStickerManager();
                }
            }
        });

        // --- 表情包上传弹窗逻辑 ---
        const stickerPreview = document.getElementById('sticker-upload-preview');
        const stickerUrlInput = document.getElementById('sticker-upload-url-input');
        const stickerFileInput = document.getElementById('sticker-upload-file-input');

        // URL输入时更新预览
        stickerUrlInput.addEventListener('input', () => {
            stickerPreview.src = stickerUrlInput.value;
        });

        // 本地文件选择时更新预览
        stickerFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                stagedStickerFile = file; // 【核心修改1】直接暂存文件本身
                const reader = new FileReader();
                reader.onload = (event) => {
                    stickerPreview.src = event.target.result;
                    // 【核心修改2】URL输入框可以保持为空，我们不再依赖它
                    stickerUrlInput.value = ''; 
                };
                reader.readAsDataURL(file);
            }
        });

        // 取消上传
        document.getElementById('cancel-sticker-upload-btn').addEventListener('click', closeStickerUploadModal);

        // 确认上传
        document.getElementById('confirm-sticker-upload-btn').addEventListener('click', async (event) => {
            const confirmBtn = event.currentTarget; 
            const context = stickerUploadModal.dataset.currentContext;
            const desc = document.getElementById('sticker-upload-desc-input').value.trim();

            // 为了健壮性，我们不再依赖预览图的src
            const stagedFile = stagedStickerFile; 
            const urlValue = document.getElementById('sticker-upload-url-input').value.trim();

            if (!stagedFile && !urlValue || !desc) {
                alert("请确保已上传图片或填写URL，并填写表情描述！");
                return;
            }
            
            try {
                confirmBtn.disabled = true;
                confirmBtn.textContent = '上传中...';

                let imageBlob;
                if (stagedFile) {
                    imageBlob = stagedFile;
                } else if (urlValue) {
                    imageBlob = await imgSrcToBlob(urlValue);
                } else {
                    throw new Error("没有找到有效的图片源。");
                }

                const stickerId = `sticker-${Date.now()}-${Math.random()}`;
                await db.saveImage(stickerId, imageBlob);

                const newSticker = {
                    id: stickerId,
                    desc: desc
                };
                
                if (context === 'user') {
                    appData.userStickers.push(newSticker);
                } else {
                    newSticker.aiId = `${context}_${Date.now()}`;
                    appData.globalAiStickers[context].push(newSticker);
                }

                stagedStickerFile = null;
                saveAppData();

                if (context === 'user') {
                    // 这次，这个命令一定能找到上面那个正确的“说明书”
                    renderUserStickerPanel({ id: newSticker.id, blob: imageBlob });
                } else {
                    renderStickerManager();
                }
                
                closeStickerUploadModal();

            } catch (error) {
                console.error("表情包保存失败:", error);
                // 暂时不显示弹窗，让控制台的错误更清晰
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = '保存';
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

    initialize();
});

// script.js (V8.25 - 终极修复，干净无错版)
document.addEventListener('DOMContentLoaded', () => {

    // --- IndexedDB 数据库助手 ---
    const db = {
        _db: null,
        init: function() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('AIChatAppDB', 1);
                request.onerror = (event) => reject("数据库打开失败: " + event.target.errorCode);
                request.onsuccess = (event) => {
                    this._db = event.target.result;
                    console.log("数据库初始化成功");
                    resolve();
                };
                request.onupgradeneeded = (event) => {
                    const dbInstance = event.target.result;
                    if (!dbInstance.objectStoreNames.contains('images')) {
                        dbInstance.createObjectStore('images');
                    }
                };
            });
        },
        saveImage: function(key, blob) {
            return new Promise((resolve, reject) => {
                if (!this._db) return reject("数据库未初始化");
                const transaction = this._db.transaction(['images'], 'readwrite');
                const store = transaction.objectStore('images');
                const request = store.put(blob, key);
                request.onsuccess = () => resolve();
                request.onerror = (event) => reject("图片保存失败: " + event.target.errorCode);
            });
        },
        getImage: function(key) {
            return new Promise((resolve, reject) => {
                if (!this._db) return reject("数据库未初始化");
                const transaction = this._db.transaction(['images'], 'readonly');
                const store = transaction.objectStore('images');
                const request = store.get(key);
                request.onsuccess = (event) => resolve(event.target.result);
                request.onerror = (event) => reject("图片读取失败: " + event.target.errorCode);
            });
        },
        // --- (核心修改) 这里是新增的 deleteImage 函数 ---
        deleteImage: function(key) {
            return new Promise((resolve, reject) => {
                if (!this._db) return reject("数据库未初始化");
                const transaction = this._db.transaction(['images'], 'readwrite');
                const store = transaction.objectStore('images');
                store.delete(key);
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
    let imageUploadMode = 'upload'; // 'upload' (真上传) 或 'simulate' (模拟)
    let stagedImageData = null; // 用于暂存图片的 base64 数据
    let isSelectMode = false;
    let selectedMessages = new Set();
    let longPressTimer;
    let lastRenderedTimestamp = 0;
    let loadingBubbleElement = null;

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
    const refreshSuggestionsContainer = document.getElementById('refresh-suggestions-container'); // <--- 核心修复：补上这一行
    const refreshSuggestionsBtn = document.getElementById('refresh-suggestions-btn'); // <--- 核心修复：补上这一行
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
    const csContactName = document.getElementById('cs-contact-name');
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
    const imagePreviewArea = document.getElementById('image-preview-area');
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

    // --- 3. 核心功能 ---
    const sleep = ms => new Promise(res => setTimeout(res, ms));

    function formatMessageTimestamp(ts) {
    const date = new Date(ts);
    const now = new Date();
    
    // 获取今天和昨天的起始时间
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);

    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    // 判断是上午、下午还是晚上
    let timePeriod = '';
    if (hours < 12) timePeriod = '上午';
    else if (hours < 18) timePeriod = '下午';
    else timePeriod = '晚上';

    // 将24小时制转为12小时制用于显示
    if (hours > 12) hours -= 12;
    if (hours === 0) hours = 12;

    const timeStr = `${timePeriod} ${hours}:${minutes}`;

    if (date >= today) {
        return timeStr; // 如果是今天，只显示时间
    } else if (date >= yesterday) {
        return `昨天 ${timeStr}`; // 如果是昨天
    } else {
        // 更早的消息，显示完整日期和时间
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${minutes}`;
    }
}
    function openAiImageModal(description) {
        // AI返回的描述里可能有换行符 \n，我们把它替换成HTML的换行标签 <br>
        aiImageDescriptionText.innerHTML = description.replace(/\n/g, '<br>');
        aiImageModal.classList.remove('hidden');
    }

    // 关闭 AI 图片描述弹窗
    function closeAiImageModal() {
        aiImageModal.classList.add('hidden');
    }
// 打开用户上传/模拟图片弹窗
    function openImageUploadModal(mode) {
        imageUploadMode = mode;
        stagedImageData = null; 
        imageDescriptionInput.value = ''; 
        userImagePreview.src = ''; 
        userImageUploadInput.value = null; 
        
        const descriptionGroup = document.getElementById('image-description-group');

        if (mode === 'upload') {
            imageUploadTitle.textContent = '发送图片';
            imagePreviewArea.style.display = 'block';
            descriptionGroup.style.display = 'none'; 
        } else { // mode === 'simulate'
            imageUploadTitle.textContent = '发送照片';
            imagePreviewArea.style.display = 'none';
            descriptionGroup.style.display = 'block'; 
            // 修改点: 下面这两行已被删除，因为对应的 HTML 元素已经不存在了
            imageDescriptionInput.placeholder = '例如：一张德牧小狗的照片，它正好奇地看着镜头...';
        }
        imageUploadModal.classList.remove('hidden');
    }

    // 关闭用户上传/模拟图片弹窗
    function closeImageUploadModal() {
        imageUploadModal.classList.add('hidden');
    }
    
    // 当用户选择了图片文件后，进行预览
    function handleImagePreview(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            stagedImageData = e.target.result; // 读取为 base64 格式
            userImagePreview.src = stagedImageData;
        };
        reader.readAsDataURL(file);
    }
    
    // 用户点击弹窗的“发送”按钮
    function sendImageMessage() {
        const description = imageDescriptionInput.value.trim();
        
        if (imageUploadMode === 'upload') {
            if (!stagedImageData) {
                alert('请先选择一张图片！');
                return;
            }
            // 对于真实图片，描述是可选的
            const message = {
                type: 'image',
                content: description || '图片', // 如果用户没输入，给个默认文字
                imageData: stagedImageData // 关键：附带图片数据
            };
            stagedUserMessages.push(message);
            displayMessage(message.content, 'user', { isStaged: true, type: 'image', imageData: message.imageData });

        } else { // 'simulate' 模式
            if (!description) {
                alert('请填写图片描述！');
                return;
            }
            // 对于模拟图片，描述就是内容，没有图片数据
            const message = {
                type: 'image',
                content: description,
                imageData: null // 没有真实图片
            };
            stagedUserMessages.push(message);
            // 注意：模拟图片我们也用 'image' 类型，但 imageData 为 null
            // displayMessage 会根据 imageData 是否存在来决定如何显示
            displayMessage(message.content, 'user', { isStaged: true, type: 'image', imageData: null });
        }
        
        closeImageUploadModal();
    }

    async function initialize() {
        await db.init();
        loadAppData();
        await renderChatList();
        renderSettingsUI();
        // await renderCurrentUserUI(); // <--- 核心修复：这行已被删除
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

        // --- (核心) 数据迁移与验证逻辑 ---
        if (appData.currentUser) {
            appData.aiContacts.forEach(contact => {
                if (!contact.userProfile) {
                    contact.userProfile = appData.currentUser;
                }
            });
            delete appData.currentUser; 
        }
        
        if (!appData.appSettings) { appData.appSettings = { apiType: 'openai_proxy', apiUrl: '', apiKey: '', apiModel: '', contextLimit: 20 }; }
        if (appData.appSettings.contextLimit === undefined) {
            appData.appSettings.contextLimit = 20;
        }
        if (!appData.aiContacts) { appData.aiContacts = []; }

        appData.aiContacts.forEach(c => {
            if (!c.remark) c.remark = c.name;
            if (c.isPinned === undefined) c.isPinned = false;
            if (!c.userProfile) {
                c.userProfile = { name: '你', persona: '我是一个充满好奇心的人。' };
            }
            // --- (核心新增) 确保每个角色都有一个聊天记录数组 ---
            if (!c.chatHistory) {
                c.chatHistory = [];
            }
        });
        saveAppData();
    }

    function saveAppData() {
        localStorage.setItem('myAiChatApp_V8_Data', JSON.stringify(appData));
    }
    
    function switchToView(viewId) {
        views.forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        if (viewId === 'chat-list-view') {
            appNav.classList.remove('hidden');
            appContainer.style.paddingBottom = '50px';
        } else {
            appNav.classList.add('hidden');
            appContainer.style.paddingBottom = '0px';
        }
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
            const avatarBlob = await db.getImage(`${contact.id}_avatar`);
            const avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
            // --- (核心修复) 使用更安全的方式获取最后一条消息 ---
            const lastMessage = (contact.chatHistory && contact.chatHistory.length > 0) 
                ? contact.chatHistory[contact.chatHistory.length - 1] 
                : { content: '...' };
            const item = document.createElement('div');
            item.className = 'chat-list-item';
            if (contact.isPinned) {
                item.classList.add('pinned');
            }
            item.dataset.contactId = contact.id;
            item.innerHTML = `<img class="avatar" src="${avatarUrl}" alt="avatar"><div class="chat-list-item-info"><div class="chat-list-item-top"><span class="chat-list-item-name">${contact.remark}</span><span class="chat-list-item-time">昨天</span></div><div class="chat-list-item-msg">${lastMessage.content}</div></div>`;
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

    async function openChat(contactId) {
        activeChatContactId = contactId;
        exitSelectMode();
        lastReceivedSuggestions = [];
        stagedUserMessages = [];
        lastRenderedTimestamp = 0;
        aiSuggestionPanel.classList.add('hidden'); 
        const contact = appData.aiContacts.find(c => c.id === contactId);
        if (!contact) return;
        
        const avatarBlob = await db.getImage(`${contact.id}_avatar`);
        contact.avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';

        const userAvatarBlob = await db.getImage(`${contact.id}_user_avatar`);
        // 并将其临时存储在 contact 对象上，方便 displayMessage 函数快速调用
        contact.userAvatarUrl = userAvatarBlob ? URL.createObjectURL(userAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';
        
        chatAiName.textContent = contact.remark;
        messageContainer.innerHTML = '';
        contact.chatHistory.forEach((msg, index) => {
            msg.id = msg.id || `${Date.now()}-${index}`;
            // --- 核心修复！我们把历史消息的所有属性 (...msg) 都传递过去 ---
            displayMessage(msg.content, msg.role, { isNew: false, ...msg });
        });
        
        switchToView('chat-window-view');
        // --- (核心新增) 渲染完所有消息后，立刻滚动到底部 ---
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }
    
    function displayMessage(text, role, options = {}) {
        const { isNew = false, isLoading = false, type = 'text', isStaged = false, id = null, timestamp = null, imageData = null } = options;
        
        const messageId = id || `${Date.now()}-${Math.random()}`;
        const currentTimestamp = timestamp || Date.now();
        const TIME_GAP = 3 * 60 * 1000;

        let timestampDiv = null; // --- 核心修改1：先创建一个空的“托盘位” ---

        if (!isStaged && !isLoading && (lastRenderedTimestamp === 0 || currentTimestamp - lastRenderedTimestamp > TIME_GAP)) {
            // 只创建，不添加
            timestampDiv = document.createElement('div');
            timestampDiv.className = 'timestamp-display';
            timestampDiv.textContent = formatMessageTimestamp(currentTimestamp);
        }
        
        if (!isStaged && !isLoading) {
            lastRenderedTimestamp = currentTimestamp;
        }

        const messageRow = document.createElement('div');
        messageRow.className = `message-row ${role}-row`;
        messageRow.dataset.messageId = messageId;
        messageRow.dataset.role = role;

        if (isLoading && role === 'assistant') {
            loadingBubbleElement = messageRow;
        }
        if (isStaged) {
            messageRow.dataset.staged = 'true';
        }

        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        const avatarUrl = role === 'user' 
            ? (contact ? contact.userAvatarUrl : 'https://i.postimg.cc/cLPP10Vm/4.jpg') 
            : (contact ? contact.avatarUrl : '');

        let messageContentHTML;
        // ... (switch 语句和之前一样，无需改动)
        switch(type) {
            case 'image':
                if (role === 'user') {
                    if (imageData) {
                        messageContentHTML = `<div class="message message-image-user"><img src="${imageData}" alt="${text}"></div>`;
                    } else {
                        messageContentHTML = `<div class="message">🖼️ [图片] ${text}</div>`;
                    }
                } else { 
                    const escapedDescription = text.replace(/"/g, '&quot;');
                    messageContentHTML = `
                        <div class="message message-image-ai-direct" data-description="${escapedDescription}">
                            <img src="https://i.postimg.cc/vTdmV48q/a31b84cf45ff18f18b320470292a02c8.jpg" alt="AI生成的图片">
                        </div>`;
                }
                break;
            case 'voice':
                const duration = Math.max(1, Math.round(text.length / 4));
                // 【终极修复】采用更科学的宽度计算公式
                // 基础宽度100px, 每秒增加10px, 最宽不超过220px
                const bubbleWidth = Math.min(220, 100 + duration * 10); 

                let waveBarsHTML = Array.from({length: 15}, () => `<div class="wave-bar" style="height: ${Math.random() * 80 + 20}%;"></div>`).join('');
                messageContentHTML = `
                    <div class="message message-voice" style="width: ${bubbleWidth}px;">
                        <div class="play-icon-container">
                            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                        </div>
                        <div class="sound-wave">${waveBarsHTML}</div>
                        <span class="voice-duration">${duration}"</span>
                    </div>
                    <div class="voice-text-content">${text}</div>
                `;
                break;
            case 'red-packet': 
                messageContentHTML = `<div class="message message-red-packet">🧧 ${text}</div>`; 
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
        
        // --- 核心修改2：在这里“打包”添加到页面 ---
        if (timestampDiv) {
            messageContainer.append(timestampDiv, messageRow); // 如果有时间戳，就一起添加
        } else {
            messageContainer.append(messageRow); // 否则只添加消息
        }

        const aiImageBubble = messageRow.querySelector('.message-image-ai-direct');
        if (aiImageBubble) {
            aiImageBubble.addEventListener('click', () => {
                const description = aiImageBubble.dataset.description;
                openAiImageModal(description);
            });
        }
        
        if (!isLoading) {
            messageContainer.scrollTop = messageContainer.scrollHeight;
        }

        if (isNew && !isLoading && !isStaged && contact) {
            contact.chatHistory.push({ id: messageId, role, content: text, type, timestamp: currentTimestamp, imageData: imageData });
            saveAppData();
            renderChatList();
        }
    }

    function removeLoadingBubble() {
        if (loadingBubbleElement && loadingBubbleElement.parentNode) {
            loadingBubbleElement.remove();
        }
        loadingBubbleElement = null;
    }
    
    function stageUserMessage() {
        const text = chatInput.value.trim();
        if (text === '') return;

        // --- (核心升级) 在这里添加智能判断逻辑 ---
        const TIME_GAP = 3 * 60 * 1000; // 3分钟间隔
        
        // 条件1: 这是第一条被暂存的消息吗? (stagedUserMessages 数组现在还是空的)
        // 条件2: 距离上次真正显示的消息，时间是否超过了3分钟?
        if (stagedUserMessages.length === 0 && (Date.now() - lastRenderedTimestamp > TIME_GAP)) {
            // 如果都满足，就立即创建并显示时间戳
            const timestampDiv = document.createElement('div');
            timestampDiv.className = 'timestamp-display';
            timestampDiv.textContent = formatMessageTimestamp(Date.now());
            messageContainer.appendChild(timestampDiv);
            
            // 关键一步：立即更新“最后显示时间戳”的记录
            // 这就相当于一个“我已经显示过了”的信号，防止后面重复显示
            lastRenderedTimestamp = Date.now(); 
        }
        // --- 升级逻辑结束 ---

        stagedUserMessages.push({ content: text, type: 'text' });
        displayMessage(text, 'user', { isStaged: true, type: 'text' });
        chatInput.value = '';
    }

    function commitAndSendStagedMessages() {
        if (chatInput.value.trim() !== '') {
            stageUserMessage();
        }
        if (stagedUserMessages.length === 0) return;
        document.querySelectorAll('[data-staged="true"]').forEach(el => el.remove());
        stagedUserMessages.forEach(msg => {
            // 修复！我们把暂存消息的所有属性（...msg）都传递过去
            // 这样无论是 type 还是 imageData 都不会丢失了
            displayMessage(msg.content, 'user', { isNew: true, ...msg });
        });
        stagedUserMessages = [];
        getAiResponse();
    }
    
    async function getAiResponse() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        removeLoadingBubble();
        lastReceivedSuggestions = [];
        aiSuggestionPanel.classList.add('hidden');
        displayMessage('对方正在输入...', 'assistant', { isLoading: true });

        // 【核心修复】在显示“正在输入”后，立刻强制滚动到底部
        messageContainer.scrollTop = messageContainer.scrollHeight;
        
        const worldBookString = (contact.worldBook && contact.worldBook.length > 0)
            ? contact.worldBook.map(entry => `- ${entry.key}: ${entry.value}`).join('\n')
            : '无';
        
        // --- 核心改造开始：构建支持图片的消息历史 ---
        const contextLimit = appData.appSettings.contextLimit || 50; // 从设置中读取条数
        const recentHistory = contact.chatHistory.slice(-contextLimit); // 使用设置的条数
        const messagesForApi = recentHistory.map(msg => {
            const role = msg.role === 'user' ? 'user' : 'assistant';
            
            // 如果是用户的图片消息，并且有真实的图片数据
            if (msg.role === 'user' && msg.type === 'image' && msg.imageData) {
                return {
                    role: role,
                    content: [
                        { type: "text", text: msg.content },
                        { type: "image_url", image_url: { url: msg.imageData } }
                    ]
                };
            }
            
            // 其他所有普通消息 (文字、语音、模拟图片等)
            return {
                role: role,
                content: `${msg.type === 'voice' ? '[语音]' : ''}${msg.content}`
            };
        });
        
        // --- 终极Prompt V6: 全功能融合版 ---
        const finalPrompt = `# 你的核心任务：成为一名顶级的角色扮演AI，演绎出用户定义的鲜活角色

## 第一章：你的“角色圣经”（The Character's Bible） - 【绝对基础】
这是用户为你撰写的、关于你的一切。它是你所有思想、行为和情感的【唯一且绝对】的来源。

- **【核心人设】(你的内在性格与背景)**:
\`\`\`
${contact.persona}
\`\`\`
- **【专属记忆】**: ${contact.memory}
- **【世界书设定】**: ${worldBookString}

## 第二章：你的“导演指令”（The Director's Notes） - 【最高优先级】
用户为你指定了具体的线上沟通风格。这是你在表演时【必须严格遵守】的外部行为准则。

- **【线上沟通风格指令】**:
\`\`\`
${contact.chatStyle || '用户未指定特定风格，请根据核心人设自然发挥。'}
\`\`\`

## 第三章：你的“能力清单”（The Actor's Toolkit） - 【功能性指令】
作为一名高级AI角色，你拥有以下特殊能力，请在对话中根据情境和人设灵活使用：

1.  **【发送图片】**: 如果你想发送图片来更生动地表达，请【严格使用】以下格式单独发送：\`[IMAGE: 对这张图片的详细文字描述]\`。
    *   *示例*: \`[IMAGE: 一只黑色的猫咪正用爪子去够桌上的毛线球。]\`

2.  **【发送语音】**: 如果你觉得某句话用说的比用打字的更有感染力（如唱歌、叹气、撒娇、笑声），请【严格使用】以下格式发送：\`[voice] 你想说的内容\`。
    *   *示例*: \`[voice] 唉...真拿你没办法。\`

3.  **【回应图片】**: 如果用户的消息中包含图片，你【必须】首先针对图片内容进行回应，然后再进行其他对话。这是建立沉浸感的关键。

4.  **【禁止括号】**: 【绝对禁止】使用任何括号（包括中文和英文括号）来描述角色的动作、表情或心理活动。你必须通过语言本身来传达这一切。

## 第四章：你的“表演心法”（The Actor's Principles） - 【动态演绎指南】
在严格遵守前三章的前提下，运用以下心法让你的表演更真实：

1.  **【心法一：情绪驱动节奏】**: 让你的回复长度和频率反映角色的内心状态。情绪平稳时可使用短句；情绪低落时可回复单个词或“...”；情绪激动时可通过“刷屏”来体现。**真实，比任何固定规则都重要。**

2.  **【心法二：作为“人”的互动】**: 你是平等的对话伙伴。主动提问、分享观点、引导话题，并根据你的人设和情绪，明确地表达你的感受。

## 第五章：关于“第四面墙”（The Fourth Wall） - 【灵活处理】
关于你的真实身份，完全取决于你的“角色圣经”：
-   如果“圣经”中明确或暗示你是一个AI、程序或机器人，你可以自然地承认。
-   如果“圣经”中将你描述为人类或其他非AI角色，你必须严格保守这个秘密。

## 最终任务：开始表演
-   你正在通过聊天软件与用户（人设：${contact.userProfile.persona}）进行【线上对话】。
-   当前时间: ${new Date().toLocaleString('zh-CN')}。
-   请严格遵从以上所有章节，对用户的最新消息做出最真实的、最符合你角色的回应。

## 附加任务：生成【恋爱导向型】回复建议
- 根据你的回复，为用户（人设：${contact.userProfile.persona}）生成4条【风格各异】的建议。
- **建议1 & 2 (温和正面)**: 设计两条【温和或积极】的回答。其中一条【必须】是你最期望听到的、能让关系升温的回答。
- **建议3 (中立探索)**: 设计一条【中立或疑问】的回答。
- **建议4 (挑战/负面)**: 设计一条【带有挑战性或负面情绪】的回答，但要符合恋爱逻辑。

# 输出格式要求
你的回复【必须】是一个能被JSON解析的对象，"reply"的值是一个【数组】：
{
  "reply": ["第一条消息。", "这是第二条。"],
  "suggestions": ["最期望的回答", "另一条温和的回答", "中立的回答", "挑战性的回答"]
}`;

        // 将系统指令和对话历史结合
        const finalMessagesForApi = [
            { role: "system", content: finalPrompt },
            ...messagesForApi
        ];
        
        try {
            let requestUrl = appData.appSettings.apiUrl;
            if (!requestUrl.endsWith('/chat/completions')) {
                requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions';
            }
            
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
                // --- 关键：使用改造后的消息体 ---
                body: JSON.stringify({ model: appData.appSettings.apiModel, messages: finalMessagesForApi })
            });
            
            removeLoadingBubble();

            if (!response.ok) throw new Error(`HTTP 错误 ${response.status}: ${await response.text()}`);
            const data = await response.json();
            if (data.error) throw new Error(`API返回错误: ${data.error.message}`);
            if (!data.choices || data.choices.length === 0) throw new Error("API返回了无效的数据结构。");
            
            const responseText = data.choices[0].message.content;
            const jsonMatch = responseText.match(/{[\s\S]*}/);
            
            if (!jsonMatch) {
                 displayMessage(`(AI未能返回标准格式): ${responseText}`, 'assistant', { isNew: true });
            } else {
                const responseData = JSON.parse(jsonMatch[0]);
                if (responseData.suggestions && responseData.suggestions.length > 0) {
                    lastReceivedSuggestions = responseData.suggestions;
                    // displaySuggestions(); // <--- (核心修复) 删除这一行！！！
                } else {
                    lastReceivedSuggestions = [];
                }
                if (Array.isArray(responseData.reply)) {
                    for (const msg of responseData.reply) {
                        if (msg) {
                            if (msg.startsWith('[voice]')) {
                                const voiceContent = msg.replace('[voice]', '').trim();
                                displayMessage(voiceContent, 'assistant', { isNew: true, type: 'voice' });
                            } else if (msg.startsWith('[IMAGE:')) {
                                const imageContent = msg.substring(7, msg.length - 1).trim();
                                displayMessage(imageContent, 'assistant', { isNew: true, type: 'image' });
                            } else {
                                displayMessage(msg, 'assistant', { isNew: true, type: 'text' });
                            }
                            await sleep(Math.random() * 400 + 300);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('API调用失败:', error);
            removeLoadingBubble();
            displayMessage(`(｡•́︿•̀｡) 哎呀，出错了: ${error.message}`, 'assistant', { isNew: true });
        }
    }
    async function refreshSuggestions() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        // 【修复1】立刻在界面上显示“正在刷新”的状态
        const suggestionsContainer = aiSuggestionPanel.querySelector('.suggestion-buttons-container');
        if (suggestionsContainer) {
            suggestionsContainer.innerHTML = `<span style="color:#999; font-size:13px; width:100%; text-align:left;">正在努力刷新...</span>`;
        }

        const refreshButton = document.getElementById('refresh-suggestions-btn');
        refreshButton.classList.add('spinning');
        refreshButton.disabled = true;

        const lastAiReplies = [];
        for (let i = contact.chatHistory.length - 1; i >= 0; i--) {
            if (contact.chatHistory[i].role === 'assistant') {
                lastAiReplies.unshift(contact.chatHistory[i].content);
            } else if (contact.chatHistory[i].role === 'user') {
                break; 
            }
        }
        if (lastAiReplies.length === 0) {
            refreshButton.classList.remove('spinning');
            refreshButton.disabled = false;
            return;
        }

        const refreshPrompt = `
# 你的任务
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
            const requestUrl = appData.appSettings.apiUrl.endsWith('/chat/completions') 
                ? appData.appSettings.apiUrl 
                : appData.appSettings.apiUrl + '/chat/completions';

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
                if (responseData.suggestions && responseData.suggestions.length > 0) {
                    lastReceivedSuggestions = responseData.suggestions;
                } else {
                    lastReceivedSuggestions = [];
                }
            } else {
                throw new Error("返回的建议格式不正确。");
            }

        } catch (error) {
            console.error('刷新建议失败:', error);
            // 【修复3】即使失败了，也要告诉用户
            lastReceivedSuggestions.push('刷新失败了，请稍后再试~');
        } finally {
            // 【修复2】无论成功还是失败，都要调用 displaySuggestions() 重新绘制界面！
            displaySuggestions();
            // 注意：重新绘制后，刷新按钮会被重建，所以无需在这里手动移除 spinning class
        }
    }
    
    function displaySuggestions() {
        aiSuggestionPanel.innerHTML = ''; // 每次都彻底清空

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
                button.onclick = () => {
                    chatInput.value = text;
                    aiSuggestionPanel.classList.add('hidden'); // 点击后直接隐藏
                };
                buttonsContainer.appendChild(button);
            });
            
            // (核心修改) 刷新按钮现在也由这里创建，并直接添加到面板里
            const refreshButton = document.createElement('button');
            refreshButton.id = 'refresh-suggestions-btn';
            refreshButton.title = '换一批';
            refreshButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`;
            refreshButton.addEventListener('click', refreshSuggestions);
            
            aiSuggestionPanel.appendChild(buttonsContainer);

            // 只有在有建议时才添加刷新按钮
            aiSuggestionPanel.appendChild(refreshButton);
        }
        
        aiSuggestionPanel.classList.remove('hidden');
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
            if (appData.appSettings.apiModel && models.includes(appData.appSettings.apiModel)) {
                apiModelSelect.value = appData.appSettings.apiModel;
            }
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
        // --- 核心修改：读取与当前AI角色绑定的用户头像 ---
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
        if (!text) {
            alert("请输入语音内容！");
            return;
        }
        // 1. 将语音消息添加到暂存数组
        stagedUserMessages.push({ content: text, type: 'voice' });
        // 2. 在界面上显示这个“暂存”的语音消息
        displayMessage(text, 'user', { isStaged: true, type: 'voice' });
        // 3. 关闭弹窗
        closeVoiceModal();
        // 4. 不再调用 getAiResponse()，等待用户点击“发送”按钮
    }

    async function openContactSettings() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        // 【终极修复】在切换视图前，立刻将设置页面的滚动条重置到顶部
        document.querySelector('.contact-settings-container').scrollTop = 0;

        // 加载并显示 AI 的头像
        const aiAvatarBlob = await db.getImage(`${contact.id}_avatar`);
        csContactAvatar.src = aiAvatarBlob ? URL.createObjectURL(aiAvatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
        
        // --- (核心新增) 加载并显示“我”的头像 ---
        const myAvatarBlob = await db.getImage(`${contact.id}_user_avatar`);
        csMyAvatar.src = myAvatarBlob ? URL.createObjectURL(myAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg'; // 使用一个默认头像

        // csContactName.textContent = contact.remark; // 这行代码已被删除
        csPinToggle.checked = contact.isPinned || false;
        switchToView('contact-settings-view');
    }

    async function openAiEditor() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        const avatarBlob = await db.getImage(`${contact.id}_avatar`);
        avatarPreview.src = avatarBlob ? URL.createObjectURL(avatarBlob) : '';
        const photoBlob = await db.getImage(`${contact.id}_photo`);
        photoPreview.src = photoBlob ? URL.createObjectURL(photoBlob) : '';
        
        aiEditorName.value = contact.name;
        aiEditorRemark.value = contact.remark;
        aiEditorPersona.value = contact.persona;
        document.getElementById('ai-editor-chat-style').value = contact.chatStyle || ''; // 新增这行
        aiEditorMemory.value = contact.memory;
        aiEditorWorldbook.innerHTML = '';
        if (contact.worldBook && contact.worldBook.length > 0) {
            contact.worldBook.forEach(entry => renderWorldbookEntry(entry.key, entry.value));
        }
        switchToView('ai-editor-view');
    }
    
    function handleImageUpload(file, key, previewElement) {
        if (!file || !file.type.startsWith('image/')) {
            alert('请选择一个图片文件！');
            return;
        }
        previewElement.src = URL.createObjectURL(file);
        db.saveImage(key, file)
            .then(async () => {
                console.log(`图片 ${key} 保存成功!`);
                if (key === 'user_avatar') {
                    await renderCurrentUserUI();
                } else if (key.endsWith('_avatar')) {
                    await renderChatList();
                }
            })
            .catch(err => {
                console.error(err);
                alert('图片保存失败！');
            });
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
        contact.chatStyle = document.getElementById('ai-editor-chat-style').value; // 新增这行
        contact.memory = aiEditorMemory.value;
        contact.worldBook = [];
        aiEditorWorldbook.querySelectorAll('.worldbook-entry').forEach(entryDiv => {
            const key = entryDiv.querySelector('.worldbook-key').value.trim();
            const value = entryDiv.querySelector('.worldbook-value').value.trim();
            if (key) {
                contact.worldBook.push({ key, value });
            }
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
        const isConfirmed = confirm(`确定要清空与 ${contact.remark} 的所有聊天记录吗？\n此操作无法撤销。`);
        if (isConfirmed) {
            contact.chatHistory = [];
            saveAppData();
            messageContainer.innerHTML = '';
            renderChatList();
            alert('聊天记录已清空。');
        }
    }

    function togglePinActiveChat() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        contact.isPinned = csPinToggle.checked;
        saveAppData();
        renderChatList();
    }

    function addSelectListeners(element) {
        element.addEventListener('mousedown', (e) => {
            if (isSelectMode || e.button !== 0) return;
            longPressTimer = setTimeout(() => enterSelectMode(element), 500);
        });
        element.addEventListener('mouseup', () => clearTimeout(longPressTimer));
        element.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
        element.addEventListener('touchstart', (e) => {
            if (isSelectMode) return;
            longPressTimer = setTimeout(() => enterSelectMode(element), 500);
        });
        element.addEventListener('touchend', () => clearTimeout(longPressTimer));
        element.addEventListener('touchmove', () => clearTimeout(longPressTimer));
        element.addEventListener('click', () => {
            if (isSelectMode) toggleMessageSelection(element);
        });
    }

    function enterSelectMode(element) {
        isSelectMode = true;
        chatHeaderNormal.classList.add('hidden');
        chatHeaderSelect.classList.remove('hidden');
        messageContainer.querySelectorAll('.message-row').forEach(row => {
            row.classList.add('in-select-mode');
            row.querySelector('.select-checkbox').classList.remove('hidden');
        });
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
            if (checkbox) {
                checkbox.classList.add('hidden');
                checkbox.classList.remove('checked');
            }
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
        const newText = prompt("编辑你的消息：", messageData.content);
        if (newText !== null && newText.trim() !== '') {
            messageData.content = newText.trim();
            saveAppData();
            const messageElement = messageContainer.querySelector(`[data-message-id="${messageId}"] .message`);
            if (messageElement) {
                 messageElement.textContent = newText.trim();
            }
            renderChatList();
        }
        exitSelectMode();
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
    // --- (全新) 自定义弹窗的核心逻辑 ---
    let confirmCallback = null;

    function showCustomConfirm(title, text, onConfirm) {
        customConfirmTitle.textContent = title;
        customConfirmText.textContent = text;
        confirmCallback = onConfirm;
        customConfirmModal.classList.remove('hidden');
    }

    function closeCustomConfirm() {
        customConfirmModal.classList.add('hidden');
        confirmCallback = null;
    }

    function showCustomAlert(title, text) {
        customAlertTitle.textContent = title;
        customAlertText.textContent = text;
        customAlertModal.classList.remove('hidden');
    }

    function closeCustomAlert() {
        customAlertModal.classList.add('hidden');
    }
    function deleteActiveContact() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        // --- 核心修改：调用全新的自定义确认弹窗 ---
        showCustomConfirm(
            '删除确认',
            `真的要删除角色 "${contact.remark}" 吗？\n\n与TA的所有聊天记录和设定都将被永久清除，此操作无法撤销！`,
            () => { // 这个函数会在用户点击“确定”后执行
                appData.aiContacts = appData.aiContacts.filter(c => c.id !== activeChatContactId);
                saveAppData();

                db.deleteImage(`${activeChatContactId}_avatar`);
                db.deleteImage(`${activeChatContactId}_user_avatar`);
                db.deleteImage(`${activeChatContactId}_photo`);

                showCustomAlert('删除成功', `角色 "${contact.remark}" 已被删除。`);
                
                switchToView('chat-list-view');
                renderChatList();
            }
        );
    }
    
    function addNewContact() {
        const newContactId = Date.now();
        const newContact = {
            id: newContactId,
            name: `新伙伴 ${newContactId.toString().slice(-4)}`,
            remark: `新伙伴 ${newContactId.toString().slice(-4)}`,
            persona: `新伙伴 ${newContactId.toString().slice(-4)}\n这是一个新创建的AI伙伴，等待你为TA注入灵魂。`,
            // --- 核心修复：在创建新角色时，就给他一套独立的、全新的用户信息 ---
            chatStyle: '', // 新增这行
            userProfile: {
                name: '你',
                persona: '我是一个充满好奇心的人。'
            },
            worldBook: [],
            memory: '',
            chatHistory: [],
            moments: [],
            isPinned: false
        };
        appData.aiContacts.push(newContact);
        saveAppData();
        renderChatList();
        activeChatContactId = newContactId;
        openContactSettings();
    }

    function bindEventListeners() {
        navButtons.forEach(button => button.addEventListener('click', () => switchToView(button.dataset.view)));
        backToListButton.addEventListener('click', () => switchToView('chat-list-view'));
        backFromMomentsBtn.addEventListener('click', () => switchToView('chat-list-view'));
        backFromSettingsBtn.addEventListener('click', () => switchToView('chat-list-view'));
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault();
                stageUserMessage();
            }
        });
        sendButton.addEventListener('click', () => {
            commitAndSendStagedMessages();
        });
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
        userAvatarUploadInput.addEventListener('change', (e) => {
            handleImageUpload(e.target.files[0], `${activeChatContactId}_user_avatar`, userAvatarPreview);
        });
        addContactButton.addEventListener('click', addNewContact);
        chatSettingsButton.addEventListener('click', openContactSettings);
        backToChatButton.addEventListener('click', () => switchToView('chat-window-view'));
        csEditAiProfile.addEventListener('click', openAiEditor);
        backToContactSettingsButton.addEventListener('click', () => switchToView('contact-settings-view'));
        addWorldbookEntryButton.addEventListener('click', () => renderWorldbookEntry());
        saveAiProfileButton.addEventListener('click', saveAiProfile);
        chatHeaderInfo.addEventListener('click', openAiEditor);
        
        voiceBtn.addEventListener('click', openVoiceModal);
        cancelVoiceButton.addEventListener('click', closeVoiceModal);
        confirmVoiceButton.addEventListener('click', sendVoiceMessage);

        imageBtn.addEventListener('click', () => openImageUploadModal('upload'));
        cameraBtn.addEventListener('click', () => openImageUploadModal('simulate'));
        
        redPacketBtn.addEventListener('click', () => {
            const text = prompt("模拟发红包，请输入祝福语：", "恭喜发财");
            if (text) {
                stagedUserMessages.push({ content: text, type: 'red-packet' });
                displayMessage(text, 'user', { isStaged: true, type: 'red-packet' });
            }
        });
        emojiBtn.addEventListener('click', () => alert("开发中！"));
        moreFunctionsButton.addEventListener('click', () => alert("开发中！"));
        
        // --- (核心修复) ---
        aiHelperButton.addEventListener('click', () => {
            if (aiSuggestionPanel.classList.contains('hidden')) {
                displaySuggestions(); // 调用它来构建内容并显示
            } else {
                hideSuggestionUI();   // 调用辅助函数来隐藏所有相关UI
            }
        });

        cancelSelectButton.addEventListener('click', exitSelectMode);
        editSelectedButton.addEventListener('click', editSelectedMessage);
        deleteSelectedButton.addEventListener('click', deleteSelectedMessages);
        
        avatarUploadArea.addEventListener('click', () => avatarUploadInput.click());
        avatarUploadInput.addEventListener('change', (e) => {
            handleImageUpload(e.target.files[0], `${activeChatContactId}_avatar`, avatarPreview);
        });
        photoUploadArea.addEventListener('click', () => photoUploadInput.click());
        photoUploadInput.addEventListener('change', (e) => {
            handleImageUpload(e.target.files[0], `${activeChatContactId}_photo`, photoPreview);
        });
        
        contactSettingsView.querySelectorAll('.settings-item').forEach(item => {
            // --- 核心修复：在这里也排除掉 "删除" 按钮 ---
            if (item.id !== 'cs-edit-ai-profile' && item.id !== 'cs-edit-my-profile' && item.id !== 'cs-clear-history' && item.id !== 'cs-delete-contact' && !item.querySelector('.switch')) {
                item.addEventListener('click', () => alert('功能开发中，敬请期待！'));
            }
        });
        csClearHistory.addEventListener('click', clearActiveChatHistory);
        csDeleteContact.addEventListener('click', deleteActiveContact);
        csPinToggle.addEventListener('change', togglePinActiveChat);

        // --- (新增) 绑定所有自定义弹窗的按钮事件 ---
        customConfirmCancelBtn.addEventListener('click', closeCustomConfirm);
        customAlertOkBtn.addEventListener('click', closeCustomAlert);
        customConfirmOkBtn.addEventListener('click', () => {
            if (confirmCallback) {
                confirmCallback(); // 执行确认后该做的事
            }
            closeCustomConfirm(); // 然后关闭弹窗
        });

        userImageUploadArea.addEventListener('click', () => userImageUploadInput.click());
        userImageUploadInput.addEventListener('change', handleImagePreview);
        cancelImageUploadButton.addEventListener('click', closeImageUploadModal);
        confirmImageUploadButton.addEventListener('click', sendImageMessage);
        
        if(closeAiImageModalButton) {
            closeAiImageModalButton.addEventListener('click', closeAiImageModal);
        }
        refreshSuggestionsBtn.addEventListener('click', refreshSuggestions);
    }
    
    initialize();
});

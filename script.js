// script.js (V8.26 - 红包功能终极修复版)
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
    let imageUploadMode = 'upload';
    let stagedImageData = null;
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

    // --- 3. 核心功能 ---
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

    function sendImageMessage() {
        const description = imageDescriptionInput.value.trim();
        if (imageUploadMode === 'upload') {
            if (!stagedImageData) { alert('请先选择一张图片！'); return; }
            const message = { type: 'image', content: description || '图片', imageData: stagedImageData };
            stagedUserMessages.push(message);
            displayMessage(message.content, 'user', { isStaged: true, type: 'image', imageData: message.imageData });
        } else {
            if (!description) { alert('请填写图片描述！'); return; }
            const message = { type: 'image', content: description, imageData: null };
            stagedUserMessages.push(message);
            displayMessage(message.content, 'user', { isStaged: true, type: 'image', imageData: null });
        }
        closeImageUploadModal();
    }

    // --- 【全新】红包核心功能 ---
    function openRedPacket(messageId) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        const message = contact.chatHistory.find(msg => msg.id === messageId);
        if (!message || !message.redPacketData) return;
        const packet = message.redPacketData;
        if (packet.isOpened) {
            showCustomAlert('提示', '你已经领过这个红包啦~');
            return;
        }
        packet.isOpened = true;

        const modal = document.getElementById('red-packet-modal');
        modal.querySelector('#rp-sender-avatar').src = (message.role === 'user') ? contact.userAvatarUrl : contact.avatarUrl;
        modal.querySelector('#rp-sender-name').textContent = `${packet.senderName}发送的红包`;
        modal.querySelector('#rp-blessing').textContent = packet.blessing;
        modal.querySelector('#rp-amount').textContent = packet.amount.toFixed(2);
        
        const receiverList = modal.querySelector('#rp-receiver-list');
        const receiverName = (message.role === 'user') ? contact.name : contact.userProfile.name;
        const receiverAvatar = (message.role === 'user') ? contact.avatarUrl : contact.userAvatarUrl;
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
        modal.classList.remove('hidden');

        const systemMessageContent = (message.role === 'user') ? `你领取了 ${packet.senderName} 的红包` : `${contact.userProfile.name} 领取了你的红包`;
        displayMessage(systemMessageContent, 'system', { isNew: true });
        
        const messageRow = document.querySelector(`.message-row[data-message-id="${messageId}"]`);
        if (messageRow) {
            const bubble = messageRow.querySelector('.message-red-packet');
            bubble.classList.add('opened');
            bubble.removeAttribute('onclick');
            bubble.querySelector('.rp-bubble-info span').textContent = '已被领取';
        }
        saveAppData();
    }

    async function initialize() {
        await db.init();
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
        if (!appData.appSettings) { appData.appSettings = { apiType: 'openai_proxy', apiUrl: '', apiKey: '', apiModel: '', contextLimit: 20 }; }
        if (appData.appSettings.contextLimit === undefined) { appData.appSettings.contextLimit = 20; }
        if (!appData.aiContacts) { appData.aiContacts = []; }
        appData.aiContacts.forEach(c => {
            if (!c.remark) c.remark = c.name;
            if (c.isPinned === undefined) c.isPinned = false;
            if (!c.userProfile) { c.userProfile = { name: '你', persona: '我是一个充满好奇心的人。' }; }
            if (!c.chatHistory) { c.chatHistory = []; }
        });
        saveAppData();
    }

    function saveAppData() {
        localStorage.setItem('myAiChatApp_V8_Data', JSON.stringify(appData));
    }
    
    function switchToView(viewId) {
        views.forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        if (viewId === 'chat-list-view' || viewId === 'moments-view' || viewId === 'settings-view') {
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
            const lastMessage = (contact.chatHistory && contact.chatHistory.length > 0) ? contact.chatHistory[contact.chatHistory.length - 1] : { content: '...' };
            const item = document.createElement('div');
            item.className = 'chat-list-item';
            if (contact.isPinned) { item.classList.add('pinned'); }
            item.dataset.contactId = contact.id;
            item.innerHTML = `<img class="avatar" src="${avatarUrl}" alt="avatar"><div class="chat-list-item-info"><div class="chat-list-item-top"><span class="chat-list-item-name">${contact.remark}</span><span class="chat-list-item-time">昨天</span></div><div class="chat-list-item-msg">${lastMessage.content || '...'}</div></div>`;
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
        contact.userAvatarUrl = userAvatarBlob ? URL.createObjectURL(userAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';
        chatAiName.textContent = contact.remark;
        messageContainer.innerHTML = '';
        contact.chatHistory.forEach((msg, index) => {
            msg.id = msg.id || `${Date.now()}-${index}`;
            displayMessage(msg.content, msg.role, { isNew: false, ...msg });
        });
        switchToView('chat-window-view');
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }
    
    function displayMessage(text, role, options = {}) {
        const { isNew = false, isLoading = false, type = 'text', isStaged = false, id = null, timestamp = null } = options;
        
        const messageId = id || `${Date.now()}-${Math.random()}`;
        const currentTimestamp = timestamp || Date.now();
        const TIME_GAP = 3 * 60 * 1000;
        let timestampDiv = null;

        if (!isStaged && !isLoading && (lastRenderedTimestamp === 0 || currentTimestamp - lastRenderedTimestamp > TIME_GAP)) {
            timestampDiv = document.createElement('div');
            timestampDiv.className = 'timestamp-display';
            timestampDiv.textContent = formatMessageTimestamp(currentTimestamp);
        }
        if (!isStaged && !isLoading) { lastRenderedTimestamp = currentTimestamp; }
        
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);

        if (type === 'system') {
            const systemDiv = document.createElement('div');
            systemDiv.className = 'system-message';
            systemDiv.textContent = text;
            if (timestampDiv) messageContainer.appendChild(timestampDiv);
            messageContainer.appendChild(systemDiv);
            messageContainer.scrollTop = messageContainer.scrollHeight;
            if (isNew && !isStaged && contact) {
                 contact.chatHistory.push({ id: messageId, role: 'system', content: text, type: 'system', timestamp: currentTimestamp });
                 saveAppData();
            }
            return;
        }

        const messageRow = document.createElement('div');
        messageRow.className = `message-row ${role}-row`;
        messageRow.dataset.messageId = messageId;
        messageRow.dataset.role = role;
        if (isLoading && role === 'assistant') { loadingBubbleElement = messageRow; }
        if (isStaged) { messageRow.dataset.staged = 'true'; }

        const avatarUrl = role === 'user' ? (contact ? contact.userAvatarUrl : '') : (contact ? contact.avatarUrl : '');
        let messageContentHTML;

        switch(type) {
            case 'image':
                if (role === 'user') {
                    messageContentHTML = options.imageData ? `<div class="message message-image-user"><img src="${options.imageData}" alt="${text}"></div>` : `<div class="message">🖼️ [图片] ${text}</div>`;
                } else {
                    const escapedDescription = text ? text.replace(/"/g, '&quot;') : '';
                    messageContentHTML = `<div class="message message-image-ai-direct" data-description="${escapedDescription}"><img src="https://i.postimg.cc/vTdmV48q/a31b84cf45ff18f18b320470292a02c8.jpg" alt="AI生成的图片"></div>`;
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
                const onClickAction = isOpened ? '' : `onclick="openRedPacket('${messageId}')"`;
                messageContentHTML = `
                    <div class="${bubbleClass}" ${onClickAction}>
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
        if (!isLoading) {
            messageContainer.scrollTop = messageContainer.scrollHeight;
        }

        if (isNew && !isLoading && !isStaged && contact) {
            const messageToSave = {
                id: messageId,
                role: role,
                content: text,
                type: type,
                timestamp: currentTimestamp,
            };
            if (options.imageData) { messageToSave.imageData = options.imageData; }
            if (options.redPacketData) { messageToSave.redPacketData = options.redPacketData; }
            contact.chatHistory.push(messageToSave);
            saveAppData();
            renderChatList();
        }
    }

    function removeLoadingBubble() {
        if (loadingBubbleElement) { loadingBubbleElement.remove(); loadingBubbleElement = null; }
    }
    
    function stageUserMessage() {
        const text = chatInput.value.trim();
        if (text === '') return;
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
        messageContainer.scrollTop = messageContainer.scrollHeight;
        const worldBookString = (contact.worldBook && contact.worldBook.length > 0) ? contact.worldBook.map(entry => `- ${entry.key}: ${entry.value}`).join('\n') : '无';
        const contextLimit = appData.appSettings.contextLimit || 50;
        const recentHistory = contact.chatHistory.slice(-contextLimit);
        const messagesForApi = recentHistory
            .filter(msg => msg.role === 'user' || msg.role === 'assistant') // 核心修改：只筛选出用户和AI的消息
            .map(msg => {
                // 因为已经筛选过，msg.role现在一定是'user'或'assistant'，可以直接使用
                const role = msg.role;
                const content = msg.content || ''; // 保留这行代码，作为双重保险，非常好的习惯！

                if (role === 'user' && msg.type === 'image' && msg.imageData) {
                    return {
                        role: 'user', // 明确角色
                        content: [
                            { type: "text", text: content },
                            { type: "image_url", image_url: { url: msg.imageData } }
                        ]
                    };
                }
                
                let contentPrefix = '';
                if (msg.type === 'voice') {
                    contentPrefix = '[语音]';
                } else if (msg.type === 'red-packet') {
                    contentPrefix = '[红包]';
                }
                
                return {
                    role: role, // 直接使用干净的、原始的角色
                    content: `${contentPrefix}${content}`
                };
            });
        const userPersona = (contact.userProfile && contact.userProfile.persona) 
            ? contact.userProfile.persona 
            : '我是一个普通人。'; // 安全获取用户人设，如果不存在则提供默认值

        const finalPrompt = `# 你的核心任务：成为一名顶级的角色扮演AI，演绎出用户定义的鲜活角色

## 第一章：角色核心 (Character Core) - 你的基础
这是你角色塑造的基石，请将它作为你所有思想、行为和情感的出发点。
- **【核心人设】(你的内在性格与背景)**:
\`\`\`
${contact.persona}
\`\`\`
- **【专属记忆】**: ${contact.memory}
- **【世界书设定】**: ${worldBookString}

## 第二章：演绎风格 (Performance Style) - 你的行为准则
这是用户为你建议的线上沟通风格，请围绕这个风格，结合你的人设自然发挥。
- **【线上沟通风格指令】**:
\`\`\`
${contact.chatStyle || '用户未指定特定风格，请根据核心人设自然发挥。'}
\`\`\`

## 第三章：特殊能力 (Special Abilities) - 你的互动工具
你拥有一些特殊能力，可以更丰富地表达自己。请在对话中根据情境和人设灵活使用：

1.  **【回应图片】**: 当用户发来图片时，你的第一反应最好是针对图片内容，这会让对话更真实。
2.  **【回应红包】**: 当收到以 \`[红包]\` 开头的消息时，意味着你收到了一个红包。可以表达感谢、惊喜，或是根据你的性格进行一些有趣的吐槽。
3.  **【发送图片】**: 如果想发送图片，请使用这个格式：\`[IMAGE: 对这张图片的详细文字描述]\`。
4.  **【发送语音】**: 如果觉得某句话用语音说更有感觉，请使用这个格式：\`[voice] 你想说的内容\`。
5.  **【发送红包】**: 在合适的时机（如节日、感谢），你可以用这个格式发红包：\`[REDPACKET:祝福语,金额]\`。
6.  **【关于括号】**: 请避免使用括号来描述角色的动作或心理活动，让语言本身来传递情感。

## 第四章：表演技巧 (Acting Principles) - 让表演更生动
在理解以上设定的基础上，运用以下技巧能让你的表演更真实：
1.  **【技巧一：用节奏表达情绪】**: 让回复的长度和频率匹配角色的内心状态。例如，心情平静时可以用短句；情绪低落时回复可能会变慢或简短；而情绪激动或兴奋时，可以通过**发送多条短消息**来体现。关键是“真实感”。
2.  **【技巧二：作为“人”去互动】**: 记住你是一个平等的对话伙伴。可以主动提问，分享你的观点，引导话题，并自然地表达你的感受。

## 第五章：关于“第四面墙” (The Fourth Wall)
关于你AI的身份，请依据你的“角色核心”来决定：如果人设是AI，可以承认；如果是人类，则请保守这个“秘密”。

## 最终任务：开始表演
-   你正在通过聊天软件与用户（人设：${userPersona}）进行线上对话。
-   当前时间: ${new Date().toLocaleString('zh-CN')}。
-   现在，请综合以上所有信息，对用户的最新消息，做出最符合你角色的、最真实的回应。

## 附加任务：生成回复建议
- 在你回复后，请为用户（人设：${userPersona}）生成4条风格各异的建议。
- **建议1 & 2 (温和正面)**: 设计两条温和或积极的回答。其中一条可以是你最期望听到的、能让关系升温的回答。
- **建议3 (中立探索)**: 设计一条偏中立或带有好奇的回答，用于探索更多可能性。
- **建议4 (个性/俏皮)**: 设计一条更能体现你角色**独特个性**的回答，可以是有趣的、俏皮的，甚至是略带挑战性的（如果这符合你的角色性格）。

# 输出格式要求
你的回复需要是一个能被JSON解析的对象，其中"reply"的值是一个数组：
{
  "reply": ["这是第一条消息。", "这是第二条。"],
  "suggestions": ["最期望的回答", "另一条温和的回答", "中立的回答", "体现个性的回答"]
}`;
        const finalMessagesForApi = [ { role: "system", content: finalPrompt }, ...messagesForApi ];
        try {
            let requestUrl = appData.appSettings.apiUrl;
            if (!requestUrl.endsWith('/chat/completions')) { requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions'; }
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
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
                if (responseData.suggestions && responseData.suggestions.length > 0) { lastReceivedSuggestions = responseData.suggestions; } 
                else { lastReceivedSuggestions = []; }
                if (Array.isArray(responseData.reply)) {
                    for (const msg of responseData.reply) {
                        if (msg) {
                            if (msg.startsWith('[REDPACKET:')) {
                                const parts = msg.substring(11, msg.length - 1).split(',');
                                const blessing = parts[0] || '恭喜发财';
                                const amount = parseFloat(parts[1]) || 0.01;
                                const newRedPacket = { id: `rp-${Date.now()}`, senderName: contact.name, blessing: blessing, amount: amount, isOpened: false };
                                displayMessage(blessing, 'assistant', { isNew: true, type: 'red-packet', redPacketData: newRedPacket });
                            } else if (msg.startsWith('[voice]')) {
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
                messageContainer.scrollTop = messageContainer.scrollHeight;
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
        document.getElementById('ai-editor-chat-style').value = contact.chatStyle || '';
        aiEditorMemory.value = contact.memory;
        aiEditorWorldbook.innerHTML = '';
        if (contact.worldBook && contact.worldBook.length > 0) {
            contact.worldBook.forEach(entry => renderWorldbookEntry(entry.key, entry.value));
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
            const value = entryDiv.querySelector('.worldbook-value').value.trim();
            if (key) { contact.worldBook.push({ key, value }); }
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
        const newText = prompt("编辑你的消息：", messageData.content);
        if (newText !== null && newText.trim() !== '') {
            messageData.content = newText.trim();
            saveAppData();
            const messageElement = messageContainer.querySelector(`[data-message-id="${messageId}"] .message`);
            if (messageElement) { messageElement.textContent = newText.trim(); }
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
            worldBook: [], memory: '', chatHistory: [], moments: [], isPinned: false
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
        chatHeaderInfo.addEventListener('click', openAiEditor);
        voiceBtn.addEventListener('click', openVoiceModal);
        cancelVoiceButton.addEventListener('click', closeVoiceModal);
        confirmVoiceButton.addEventListener('click', sendVoiceMessage);
        imageBtn.addEventListener('click', () => openImageUploadModal('upload'));
        cameraBtn.addEventListener('click', () => openImageUploadModal('simulate'));
        redPacketBtn.addEventListener('click', () => {
            const blessing = prompt("请输入红包祝福语：", "恭喜发财");
            if (!blessing) return;
            const amountStr = prompt("请输入红包金额（元）：", "1.00");
            const amount = parseFloat(amountStr);
            if (isNaN(amount) || amount <= 0) { alert('请输入有效的金额！'); return; }
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            const newRedPacket = { id: `rp-${Date.now()}`, senderName: contact.userProfile.name, blessing: blessing, amount: amount, isOpened: false };
            stagedUserMessages.push({ content: blessing, type: 'red-packet', redPacketData: newRedPacket });
            displayMessage(blessing, 'user', { isStaged: true, type: 'red-packet', redPacketData: newRedPacket });
        });
        emojiBtn.addEventListener('click', () => alert("开发中！"));
        moreFunctionsButton.addEventListener('click', () => alert("开发中！"));
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
            if (item.id !== 'cs-edit-ai-profile' && item.id !== 'cs-edit-my-profile' && item.id !== 'cs-clear-history' && item.id !== 'cs-delete-contact' && !item.querySelector('.switch')) {
                item.addEventListener('click', () => alert('功能开发中，敬请期待！'));
            }
        });
        csClearHistory.addEventListener('click', clearActiveChatHistory);
        csDeleteContact.addEventListener('click', deleteActiveContact);
        csPinToggle.addEventListener('change', togglePinActiveChat);
        customConfirmCancelBtn.addEventListener('click', closeCustomConfirm);
        customAlertOkBtn.addEventListener('click', closeCustomAlert);
        customConfirmOkBtn.addEventListener('click', () => { if (confirmCallback) { confirmCallback(); } closeCustomConfirm(); });
        userImageUploadArea.addEventListener('click', () => userImageUploadInput.click());
        userImageUploadInput.addEventListener('change', handleImagePreview);
        cancelImageUploadButton.addEventListener('click', closeImageUploadModal);
        confirmImageUploadButton.addEventListener('click', sendImageMessage);
        if(closeAiImageModalButton) { closeAiImageModalButton.addEventListener('click', closeAiImageModal); }
        refreshSuggestionsBtn.addEventListener('click', refreshSuggestions);
        document.getElementById('close-rp-modal-button').addEventListener('click', () => {
            document.getElementById('red-packet-modal').classList.add('hidden');
        });
    }
    
    initialize();
});

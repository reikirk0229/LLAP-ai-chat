// script.js (V8.18 - 视觉与体验优化)
document.addEventListener('DOMContentLoaded', () => {

    // --- 【全新】 IndexedDB 数据库助手 ---
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
        }
    };

    // --- 1. 全局数据存储 ---
    let appData = {};
    let activeChatContactId = null;
    let lastReceivedSuggestions = [];
    let stagedUserMessages = [];
    let isSelectMode = false;
    let selectedMessages = new Set();
    let longPressTimer;
    let loadingBubbleElement = null;

    // --- 2. 元素获取 ---
    const appContainer = document.getElementById('app-container');
    const appNav = document.getElementById('app-nav');
    const views = document.querySelectorAll('.view');
    const navButtons = document.querySelectorAll('.nav-button');
    const currentUserAvatar = document.getElementById('current-user-avatar');
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
    const csEditAiProfile = document.getElementById('cs-edit-ai-profile');
    const csPinToggle = document.getElementById('cs-pin-toggle');
    const csClearHistory = document.getElementById('cs-clear-history');
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


    // --- 3. 核心功能 ---
    const sleep = ms => new Promise(res => setTimeout(res, ms));

    async function initialize() {
        await db.init();
        loadAppData();
        await renderChatList();
        renderSettingsUI();
        await renderCurrentUserUI();
        bindEventListeners();
        switchToView('chat-list-view');
    }
    
    function loadAppData() {
        const savedData = localStorage.getItem('myAiChatApp_V8_Data');
        if (savedData) { appData = JSON.parse(savedData); } 
        else {
             appData = {
                currentUser: { name: '你', persona: '我是一个充满好奇心的人。' },
                aiContacts: [{ 
                    id: Date.now(), 
                    name: 'AI伙伴', // 真实姓名
                    remark: 'AI伙伴', // 备注名
                    persona: 'AI伙伴\n你是一个乐于助人的AI。', 
                    worldBook: [], 
                    memory: '', 
                    chatHistory: [], 
                    moments: [] 
                }],
                appSettings: { apiType: 'openai_proxy', apiUrl: '', apiKey: '', apiModel: '' }
            };
        }
                appData.aiContacts.forEach(c => {
            if (!c.remark) c.remark = c.name;
        });
        if (!appData.appSettings.apiType) { appData.appSettings.apiType = 'openai_proxy'; }
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
        for (const contact of appData.aiContacts) {
            const avatarBlob = await db.getImage(`${contact.id}_avatar`);
            const avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
            const lastMessage = contact.chatHistory[contact.chatHistory.length - 1] || { content: '...' };
            const item = document.createElement('div');
            item.className = 'chat-list-item';
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
    }

    function updateSettingsUI() {
        const modelArea = document.getElementById('model-area');
        modelArea.style.display = apiTypeSelect.value === 'gemini_direct' ? 'none' : 'block';
    }

    async function renderCurrentUserUI() {
        const userAvatarBlob = await db.getImage('user_avatar');
        const userAvatarUrl = userAvatarBlob ? URL.createObjectURL(userAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';
        currentUserAvatar.src = userAvatarUrl;
    }

    async function openChat(contactId) {
        activeChatContactId = contactId;
        exitSelectMode();
        lastReceivedSuggestions = [];
        stagedUserMessages = [];
        aiSuggestionPanel.classList.add('hidden'); 
        const contact = appData.aiContacts.find(c => c.id === contactId);
        if (!contact) return;
        
        const avatarBlob = await db.getImage(`${contact.id}_avatar`);
        contact.avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';

        const userAvatarBlob = await db.getImage('user_avatar');
        appData.currentUser.avatarUrl = userAvatarBlob ? URL.createObjectURL(userAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';
        
        chatAiName.textContent = contact.remark;
        messageContainer.innerHTML = '';
        contact.chatHistory.forEach((msg, index) => {
            msg.id = msg.id || `${Date.now()}-${index}`;
            displayMessage(msg.content, msg.role, { isNew: false, isLoading: true, type: msg.type || 'text', id: msg.id });
        });
        
        switchToView('chat-window-view');
    }
    
    function displayMessage(text, role, options = {}) {
        const { isNew = false, isLoading = false, type = 'text', isStaged = false, id = null } = options;
        
        const messageId = id || `${Date.now()}-${Math.random()}`;

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
        const avatarUrl = role === 'user' ? appData.currentUser.avatarUrl : (contact ? contact.avatarUrl : '');

        let messageHTML;
        switch(type) {
            case 'voice': messageHTML = `<div class="message message-voice">🔊 ${text}</div>`; break;
            case 'image': messageHTML = `<div class="message message-image">🖼️ [图片] ${text}</div>`; break;
            case 'red-packet': messageHTML = `<div class="message message-red-packet">🧧 ${text}</div>`; break;
            default: messageHTML = `<div class="message">${text}</div>`;
        }
        
        messageRow.innerHTML = `
            <div class="select-checkbox hidden"></div>
            <img class="avatar" src="${avatarUrl}">
            <div class="message-content">${messageHTML}</div>
        `;
        
        addSelectListeners(messageRow);
        messageContainer.appendChild(messageRow);
        messageContainer.scrollTop = messageContainer.scrollHeight;

        if (isNew && !isLoading && !isStaged && contact) {
            contact.chatHistory.push({ id: messageId, role, content: text, type });
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
            displayMessage(msg.content, 'user', { isNew: true, type: msg.type });
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
        
        const worldBookString = (contact.worldBook && contact.worldBook.length > 0)
            ? contact.worldBook.map(entry => `- ${entry.key}: ${entry.value}`).join('\n')
            : '无';
        
        const recentHistory = contact.chatHistory.slice(-20);

        const finalPrompt = `# 你的双重任务
## 任务1: 扮演AI助手
- 你的名字是"${contact.name}"，人设(包括记忆)是：${contact.persona}\n\n${contact.memory}
- **重要背景**: 你正在通过聊天软件与用户【线上对话】。当前时间: ${new Date().toLocaleString('zh-CN')}。
- **行为准则1**: 你的回复必须模拟真实聊天，将一个完整的思想拆分成【一句或多句】独立的短消息。
- **行为准则2**: 【绝对不能】包含任何括号内的动作、神态描写。
- 附加设定(世界书)：${worldBookString}
- 请根据对话历史，回应用户。

## 任务2: 生成【恋爱导向型】回复建议
- 根据你的回复，为用户（人设：${appData.currentUser.persona}）生成4条【风格各异】的建议。
- **建议1 & 2 (温和正面)**: 设计两条【温和或积极】的回答。其中一条【必须】是你最期望听到的、能让关系升温的回答。
- **建议3 (中立探索)**: 设计一条【中立或疑问】的回答。
- **建议4 (挑战/负面)**: 设计一条【带有挑战性或负面情绪】的回答，但要符合恋爱逻辑。

# 对话历史
${recentHistory.map(msg => `${msg.role === 'user' ? '用户' : contact.name}: ${msg.content}`).join('\n')}

# 输出格式要求
你的回复【必须】是一个能被JSON解析的对象，"reply"的值是一个【数组】：
{
  "reply": ["第一条消息。", "这是第二条。"],
  "suggestions": ["最期望的回答", "另一条温和的回答", "中立的回答", "挑战性的回答"]
}`;

        try {
            let requestUrl = appData.appSettings.apiUrl;
            if (!requestUrl.endsWith('/chat/completions')) {
                requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions';
            }
            
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
                body: JSON.stringify({ model: appData.appSettings.apiModel, messages: [{ role: 'user', content: finalPrompt }] })
            });
            
            if (!response.ok) throw new Error(`HTTP 错误 ${response.status}: ${await response.text()}`);
            const data = await response.json();
            if (data.error) throw new Error(`API返回错误: ${data.error.message}`);
            if (!data.choices || data.choices.length === 0) throw new Error("API返回了无效的数据结构。");
            
            const responseText = data.choices[0].message.content;
            const jsonMatch = responseText.match(/{[\s\S]*}/);
            
            removeLoadingBubble();

            if (!jsonMatch) {
                 displayMessage(`(AI未能返回标准格式): ${responseText}`, 'assistant', { isNew: true });
            } else {
                const responseData = JSON.parse(jsonMatch[0]);
                if (responseData.suggestions && responseData.suggestions.length > 0) {
                    lastReceivedSuggestions = responseData.suggestions;
                }
                if (Array.isArray(responseData.reply)) {
                    for (const msg of responseData.reply) {
                        if (msg) displayMessage(msg, 'assistant', { isNew: true });
                        await sleep(Math.random() * 400 + 300);
                    }
                } else if (responseData.reply) {
                    displayMessage(responseData.reply, 'assistant', { isNew: true });
                }
            }
        } catch (error) {
            console.error('API调用失败:', error);
            removeLoadingBubble();
            displayMessage(`(｡•́︿•̀｡) 哎呀，出错了: ${error.message}`, 'assistant', { isNew: true });
        }
    }
    
    function displaySuggestions() {
        aiSuggestionPanel.innerHTML = '';
        if (lastReceivedSuggestions.length === 0) {
            aiSuggestionPanel.innerHTML = `<span style="color:#999;font-size:12px;">暂时没有建议哦~</span>`;
        } else {
            lastReceivedSuggestions.forEach(text => {
                const button = document.createElement('button');
                button.className = 'suggestion-button';
                button.textContent = text;
                button.onclick = () => {
                    chatInput.value = text;
                    aiSuggestionPanel.classList.add('hidden');
                };
                aiSuggestionPanel.appendChild(button);
            });
        }
        aiSuggestionPanel.classList.remove('hidden');
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
        modalUserNameInput.value = appData.currentUser.name;
        modalUserPersonaInput.value = appData.currentUser.persona;
        const userAvatarBlob = await db.getImage('user_avatar');
        userAvatarPreview.src = userAvatarBlob ? URL.createObjectURL(userAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';
        userProfileModal.classList.remove('hidden');
    }

    function closeProfileModal() {
        userProfileModal.classList.add('hidden');
    }

    async function openContactSettings() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        const avatarBlob = await db.getImage(`${contact.id}_avatar`);
        csContactAvatar.src = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
        csContactName.textContent = contact.remark;
        csPinToggle.checked = contact.isPinned || false;
        switchToView('contact-settings-view');
    }

    async function openAiEditor() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        aiEditorName.value = contact.name;
        aiEditorRemark.value = contact.remark;
        aiEditorPersona.value = contact.persona;
        aiEditorMemory.value = contact.memory;
        
        const avatarBlob = await db.getImage(`${contact.id}_avatar`);
        avatarPreview.src = avatarBlob ? URL.createObjectURL(avatarBlob) : '';
        const photoBlob = await db.getImage(`${contact.id}_photo`);
        photoPreview.src = photoBlob ? URL.createObjectURL(photoBlob) : '';

        aiEditorPersona.value = contact.persona;
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
        contact.memory = aiEditorMemory.value;
        contact.persona = aiEditorPersona.value;
        contact.name = contact.persona.split('\n')[0].trim() || 'AI伙伴';
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
            saveAppData();
            alert('设置已保存！');
        });
        apiTypeSelect.addEventListener('change', updateSettingsUI);
        fetchModelsButton.addEventListener('click', fetchModels);
        currentUserAvatar.addEventListener('click', openProfileModal);
        closeModalButton.addEventListener('click', closeProfileModal);
        saveProfileButton.addEventListener('click', () => {
            appData.currentUser.name = modalUserNameInput.value.trim();
            appData.currentUser.persona = modalUserPersonaInput.value;
            saveAppData();
            renderCurrentUserUI();
            closeProfileModal();
            alert('用户信息已保存！');
        });
        userAvatarUploadArea.addEventListener('click', () => userAvatarUploadInput.click());
        userAvatarUploadInput.addEventListener('change', (e) => {
            handleImageUpload(e.target.files[0], 'user_avatar', userAvatarPreview);
        });
        addContactButton.addEventListener('click', () => alert('“添加联系人”功能将在后续版本中实现！'));
        chatSettingsButton.addEventListener('click', openContactSettings);
        backToChatButton.addEventListener('click', () => switchToView('chat-window-view'));
        csEditAiProfile.addEventListener('click', openAiEditor);
        backToContactSettingsButton.addEventListener('click', () => switchToView('contact-settings-view'));
        addWorldbookEntryButton.addEventListener('click', () => renderWorldbookEntry());
        saveAiProfileButton.addEventListener('click', saveAiProfile);
        chatHeaderInfo.addEventListener('click', openAiEditor);
        voiceBtn.addEventListener('click', () => {
            const text = prompt("模拟语音输入：");
            if (text) displayMessage(text, 'user', { isNew: true, type: 'voice' });
        });
        imageBtn.addEventListener('click', () => {
            const text = prompt("模拟发送图片URL或描述：");
            if (text) displayMessage(text, 'user', { isNew: true, type: 'image' });
        });
        cameraBtn.addEventListener('click', () => {
            const text = prompt("模拟拍照发送，请描述内容：");
            if (text) displayMessage(text, 'user', { isNew: true, type: 'image' });
        });
        redPacketBtn.addEventListener('click', () => {
            const text = prompt("模拟发红包，请输入祝福语：", "恭喜发财");
            if (text) displayMessage(text, 'user', { isNew: true, type: 'red-packet' });
        });
        emojiBtn.addEventListener('click', () => alert("开发中！"));
        moreFunctionsButton.addEventListener('click', () => alert("开发中！"));
        aiHelperButton.addEventListener('click', () => {
            if (aiSuggestionPanel.classList.contains('hidden')) {
                displaySuggestions();
            } else {
                aiSuggestionPanel.classList.add('hidden');
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
            if (item.id !== 'cs-edit-ai-profile' && item.id !== 'cs-clear-history' && !item.querySelector('.switch')) {
                item.addEventListener('click', () => alert('功能开发中，敬请期待！'));
            }
        });
        csClearHistory.addEventListener('click', () => {
            alert('“清空聊天记录”功能开发中...');
        });
        csPinToggle.parentElement.addEventListener('click', (e) => {
            e.stopPropagation(); 
            csPinToggle.checked = !csPinToggle.checked;
            alert('“设为置顶”功能开发中...');
        });
    }
    
    initialize();
});

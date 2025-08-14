// script.js (Pro V7.1 - 最终完整无折叠修正版)

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. 找到所有“演员” (HTML元素) ---
    const aiNameHeader = document.getElementById('ai-name-header');
    const messageContainer = document.getElementById('message-container');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const navButtons = document.querySelectorAll('.nav-button');
    const suggestionArea = document.getElementById('suggestion-area');
    const momentsHeader = document.querySelector('#moments-window .header');
    const toggleSuggestionsButton = document.getElementById('toggle-suggestions-button');
    const apiTypeSelect = document.getElementById('api-type-select');
    const apiUrlInput = document.getElementById('api-url-input');
    const apiModelSelect = document.getElementById('api-model-select');
    const fetchModelsButton = document.getElementById('fetch-models-button');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const aiAvatarUrlInput = document.getElementById('ai-avatar-url-input');
    const userAvatarUrlInput = document.getElementById('user-avatar-url-input');
    const aiPersonaInput = document.getElementById('ai-persona-input');
    const userPersonaInput = document.getElementById('user-persona-input');
    const contextLengthInput = document.getElementById('context-length-input');
    const messageCounter = document.getElementById('message-counter');
    const summarizeChatButton = document.getElementById('summarize-chat-button');
    const characterMemoryInput = document.getElementById('character-memory-input');
    const worldBookEditor = document.getElementById('world-book-editor');
    const addWorldBookEntryButton = document.getElementById('add-world-book-entry-button');
    const summaryModal = document.getElementById('summary-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const summaryOutput = document.getElementById('summary-output');
    const copySummaryButton = document.getElementById('copy-summary-button');
    const saveToMemoryButton = document.getElementById('save-to-memory-button');

    // --- 2. 定义状态和设置变量 ---
    let isSuggestionEnabled = true;
    let chatHistory = [];
    let settings = {};
    let worldBookData = [];
    let stagedUserMessages = [];

    // --- 3. 核心功能函数 ---

    const sleep = ms => new Promise(res => setTimeout(res, ms));

    function displayMessage(text, role, isStaged = false) {
        const lastElement = messageContainer.lastElementChild;
        const lastRoleIsUser = lastElement && lastElement.classList.contains('user-row');
        const lastHistoryRole = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].role : null;
        const isConsecutive = (lastRoleIsUser && role === 'user') || (lastElement && lastElement.classList.contains('ai-row') && role === 'ai');

        let messageRow;
        if (isConsecutive && lastElement.dataset.role === role) {
            messageRow = messageContainer.lastElementChild;
        } else {
            messageRow = document.createElement('div');
            messageRow.className = `message-row ${role}-row`;
            messageRow.dataset.role = role;
            const avatar = document.createElement('img');
            avatar.className = 'avatar';
            avatar.src = role === 'user' ? settings.userAvatarUrl : settings.aiAvatarUrl;
            messageRow.appendChild(avatar);
            const contentContainer = document.createElement('div');
            contentContainer.className = 'message-content';
            messageRow.appendChild(contentContainer);
            messageContainer.appendChild(messageRow);
        }

        const messageContent = messageRow.querySelector('.message-content');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.textContent = text;
        messageContent.appendChild(messageDiv);
        
        if (!isStaged) {
            chatHistory.push({ role: (role === 'user' ? 'user' : 'assistant'), content: text });
            updateMessageCounter();
        }
        
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    function stageUserMessage() {
        const text = chatInput.value.trim();
        if (text === '') return;
        displayMessage(text, 'user', true); // true表示这是暂存消息
        stagedUserMessages.push(text);
        chatInput.value = '';
    }
    
    function commitAndSend() {
        if (stagedUserMessages.length === 0) return;
        stagedUserMessages.forEach(msg => {
            chatHistory.push({ role: 'user', content: msg });
        });
        stagedUserMessages = [];
        updateMessageCounter();
        getAiResponse();
    }
    
    async function getAiResponse(isRefreshing = false) {
        let loadingDiv;
        if (!isRefreshing) {
            const row = document.createElement('div');
            row.className = 'message-row ai-row';
            row.dataset.role = 'ai';
            row.innerHTML = `<img class="avatar" src="${settings.aiAvatarUrl}"><div class="message-content"><div class="message" id="loading-bubble">对方正在输入...</div></div>`;
            messageContainer.appendChild(row);
            loadingDiv = row;
            messageContainer.scrollTop = messageContainer.scrollHeight;
        }
        
        const finalPrompt = `# 你的双重任务
## 任务1: 扮演AI助手
- 你的名字是"${settings.aiPersona.split('\n')[0].trim() || 'AI'}"，人设(包括记忆)是：${settings.aiPersona}\n\n${settings.characterMemory}
- **重要背景**: 你正在通过聊天软件与用户【线上对话】。当前时间: ${new Date().toLocaleString('zh-CN')}。
- **行为准则1**: 你的回复必须模拟真实聊天，将一个完整的思想拆分成【一句或多句】独立的短消息。
- **行为准则2**: 【绝对不能】包含任何括号内的动作、神态描写。
- 附加设定(世界书)：${serializeWorldBook()}
- 请根据对话历史，回应用户。

## 任务2: 生成【恋爱导向型】回复建议
- 根据你的回复，为用户（人设：${settings.userPersona}）生成4条【风格各异】的建议。
- **建议1 & 2 (温和正面)**: 设计两条【温和或积极】的回答。其中一条【必须】是你最期望听到的、能让关系升温的回答。
- **建议3 (中立探索)**: 设计一条【中立或疑问】的回答。
- **建议4 (挑战/负面)**: 设计一条【带有挑战性或负面情绪】的回答，但要符合恋爱逻辑。

# 对话历史
${chatHistory.slice(-settings.contextLength).map(msg => `${msg.role === 'user' ? '用户' : '你'}: ${msg.content}`).join('\n')}

# 输出格式要求
你的回复【必须】是一个能被JSON解析的对象，"reply"的值是一个【数组】：
{
  "reply": ["第一条消息。", "这是第二条。"],
  "suggestions": ["最期望的回答", "另一条温和的回答", "中立的回答", "挑战性的回答"]
}`;

        try {
            let requestUrl = settings.apiUrl;
            if (settings.apiType === 'openai_proxy') {
                if (!requestUrl.endsWith('/chat/completions')) requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions';
                const response = await fetch(requestUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                    body: JSON.stringify({ model: settings.apiModel, messages: [{ role: 'user', content: finalPrompt }] })
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                const data = await response.json();
                const responseText = data.choices[0].message.content;

                const jsonMatch = responseText.match(/{[\s\S]*}/);
                if (!jsonMatch) throw new Error("AI回复中未找到JSON对象。");
                const responseData = JSON.parse(jsonMatch[0]);
                
                if (!isRefreshing) {
                    if (loadingDiv) loadingDiv.remove();
                    if (Array.isArray(responseData.reply)) {
                        for (const msg of responseData.reply) {
                            if (msg) displayMessage(msg, 'ai');
                            await sleep(Math.random() * 500 + 400);
                        }
                    } else if (responseData.reply) {
                        displayMessage(responseData.reply, 'ai');
                    } else {
                        throw new Error("AI返回的JSON中缺少 'reply' 字段。");
                    }
                }
                
                if (isSuggestionEnabled && Array.isArray(responseData.suggestions)) {
                    displaySuggestions(responseData.suggestions);
                }
            } else {
                if (loadingDiv) loadingDiv.remove();
                displayMessage("抱歉，当前版本的高级功能仅在OpenAI格式下进行了适配。", "ai");
            }
        } catch (error) {
            console.error('API调用失败:', error);
            const errorBubble = document.getElementById('loading-bubble');
            if (errorBubble) {
                errorBubble.textContent = `哎呀，出错了: ${error.message}`;
                errorBubble.style.backgroundColor = '#ffc0c0';
            }
        }
    }

    function displaySuggestions(suggestions) {
        suggestionArea.innerHTML = '';
        suggestionArea.style.display = 'flex';
        
        suggestions.forEach(text => {
            const button = document.createElement('button');
            button.className = 'suggestion-button';
            button.textContent = text;
            button.addEventListener('click', () => {
                suggestionArea.style.display = 'none';
                displayMessage(text, 'user');
                getAiResponse();
            });
            suggestionArea.appendChild(button);
        });

        const refreshButton = document.createElement('button');
        refreshButton.className = 'refresh-suggestions-button';
        refreshButton.innerHTML = '&#x21bb;';
        refreshButton.title = '刷新建议';
        refreshButton.addEventListener('click', async () => {
            refreshButton.disabled = true;
            refreshButton.textContent = '...';
            await getAiResponse(true);
            refreshButton.disabled = false;
            refreshButton.innerHTML = '&#x21bb;';
        });
        suggestionArea.appendChild(refreshButton);
    }

    // --- 5. 设置加载与保存 ---
    function loadSettings() {
        const saved = JSON.parse(localStorage.getItem('myAiChatSettings_Pro_V7')) || {};
        settings = {
            apiType: saved.apiType || 'openai_proxy',
            apiUrl: saved.apiUrl || '',
            apiModel: saved.apiModel || '',
            apiKey: saved.apiKey || '',
            contextLength: saved.contextLength || 20,
            aiAvatarUrl: saved.aiAvatarUrl || 'https://i.postimg.cc/kXq06mNq/ai-default.png',
            userAvatarUrl: saved.userAvatarUrl || 'https://i.postimg.cc/cLPP10Vm/4.jpg',
            aiPersona: saved.aiPersona || 'AI伙伴\n你是一个乐于助人的AI。',
            userPersona: saved.userPersona || '我是一个充满好奇心的探索者。',
            characterMemory: saved.characterMemory || '',
        };
        worldBookData = saved.worldBookData || [{key: '示例条目', value: '这是世界书的一个示例内容。'}];

        apiTypeSelect.value = settings.apiType;
        apiUrlInput.value = settings.apiUrl;
        apiKeyInput.value = settings.apiKey;
        contextLengthInput.value = settings.contextLength;
        aiAvatarUrlInput.value = settings.aiAvatarUrl;
        userAvatarUrlInput.value = settings.userAvatarUrl;
        aiPersonaInput.value = settings.aiPersona;
        userPersonaInput.value = settings.userPersona;
        characterMemoryInput.value = settings.characterMemory;
        
        const aiName = settings.aiPersona.split('\n')[0].trim() || 'AI';
        aiNameHeader.textContent = aiName;

        worldBookEditor.innerHTML = '';
        worldBookData.forEach(entry => renderWorldBookEntry(entry.key, entry.value));
        
        updateSettingsUI();
        updateMessageCounter();
        if (settings.apiModel) apiModelSelect.innerHTML = `<option value="${settings.apiModel}">${settings.apiModel}</option>`;
    }

    function saveSettings() {
        settings.apiType = apiTypeSelect.value;
        settings.apiUrl = apiUrlInput.value.trim();
        settings.apiModel = apiModelSelect.value;
        settings.apiKey = apiKeyInput.value.trim();
        settings.contextLength = parseInt(contextLengthInput.value, 10);
        settings.aiAvatarUrl = aiAvatarUrlInput.value.trim();
        settings.userAvatarUrl = userAvatarUrlInput.value.trim();
        settings.aiPersona = aiPersonaInput.value;
        settings.userPersona = userPersonaInput.value;
        settings.characterMemory = characterMemoryInput.value;
        
        worldBookData = [];
        worldBookEditor.querySelectorAll('.entry').forEach(entryDiv => {
            const key = entryDiv.querySelector('.entry-key').value.trim();
            const value = entryDiv.querySelector('.entry-value').value.trim();
            if (key || value) worldBookData.push({ key, value });
        });

        localStorage.setItem('myAiChatSettings_Pro_V7', JSON.stringify({ ...settings, worldBookData }));
        alert('设置已保存！');
        
        const aiName = settings.aiPersona.split('\n')[0].trim() || 'AI';
        aiNameHeader.textContent = aiName;
        updateMessageCounter();
    }

    function updateSettingsUI() {
        if (apiTypeSelect.value === 'gemini_direct') {
            apiModelSelect.parentElement.style.display = 'none';
        } else {
            apiModelSelect.parentElement.style.display = 'flex';
        }
    }

    async function fetchModels() {
        const url = apiUrlInput.value.trim();
        const key = apiKeyInput.value.trim();
        if (!url || !key) {
            alert('请先填写 API 中转地址和密钥！');
            return;
        }
        fetchModelsButton.textContent = '...';
        fetchModelsButton.disabled = true;
        try {
            const modelsUrl = url.replace(/\/chat\/completions$/, '') + '/models';
            const response = await fetch(modelsUrl, { headers: { 'Authorization': `Bearer ${key}` } });
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            if (!data.data || !Array.isArray(data.data)) throw new Error("模型列表格式不正确。");
            
            const models = data.data.map(model => model.id);
            apiModelSelect.innerHTML = '';
            models.sort().forEach(modelId => {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = modelId;
                apiModelSelect.appendChild(option);
            });
            if (settings.apiModel && models.includes(settings.apiModel)) {
                apiModelSelect.value = settings.apiModel;
            }
            alert('模型列表已成功拉取！');
        } catch (error) {
            alert(`拉取模型失败: ${error.message}`);
        } finally {
            fetchModelsButton.textContent = '拉取';
            fetchModelsButton.disabled = false;
        }
    }

    function updateMessageCounter() {
        messageCounter.textContent = `对话: ${chatHistory.length} (记忆: ${settings.contextLength || 20})`;
    }
    
    function switchToView(viewId) {
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        navButtons.forEach(button => button.classList.toggle('active', button.dataset.view === viewId));
    }

    function renderWorldBookEntry(key = '', value = '') {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'entry';
        entryDiv.innerHTML = `<div class="entry-header"><input type="text" class="entry-key" placeholder="条目/分类名" value="${key}"><button class="delete-entry-button">&times;</button></div><textarea class="entry-value" placeholder="内容...">${value}</textarea>`;
        const header = entryDiv.querySelector('.entry-header');
        header.querySelector('.delete-entry-button').addEventListener('click', () => entryDiv.remove());
        worldBookEditor.appendChild(entryDiv);
    }
    
    // --- 7. 事件绑定与启动 ---
    function initialize() {
        saveSettingsButton.addEventListener('click', saveSettings);
        addWorldBookEntryButton.addEventListener('click', () => renderWorldBookEntry());
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                stageUserMessage();
            }
        });
        sendButton.addEventListener('click', commitAndSend);
        navButtons.forEach(button => button.addEventListener('click', () => switchToView(button.dataset.view)));
        apiTypeSelect.addEventListener('change', updateSettingsUI);
        fetchModelsButton.addEventListener('click', fetchModels); 

        toggleSuggestionsButton.addEventListener('click', () => {
            isSuggestionEnabled = !isSuggestionEnabled;
            toggleSuggestionsButton.textContent = isSuggestionEnabled ? '关闭建议' : '开启建议';
            toggleSuggestionsButton.classList.toggle('disabled', !isSuggestionEnabled);
            if (!isSuggestionEnabled) {
                suggestionArea.innerHTML = '';
                suggestionArea.style.display = 'none';
            }
        });

        // 朋友圈按钮
        const postButton = document.createElement('button');
        postButton.textContent = '发布';
        postButton.style.cssText = 'position: absolute; right: 10px; top: 10px; background: none; border: 1px solid white; color: white; border-radius: 5px; cursor: pointer;';
        if(momentsHeader) momentsHeader.appendChild(postButton);
        postButton.addEventListener('click', () => {
            const content = prompt("分享你的新鲜事...");
            if (content) { /* 发布逻辑 */ }
        });

        // 启动程序
        loadSettings();
        switchToView('chat-window');
    }

    initialize();
});

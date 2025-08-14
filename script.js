// script.js (Pro V3 - 真实对话模拟版)

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. 找到所有“演员” (HTML元素) ---
    const messageContainer = document.getElementById('message-container');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const navButtons = document.querySelectorAll('.nav-button');
    const suggestionArea = document.getElementById('suggestion-area');
    const momentsHeader = document.querySelector('#moments-window .header');
    const toggleSuggestionsButton = document.getElementById('toggle-suggestions-button');
    const apiTypeSelect = document.getElementById('api-type-select');
    const apiUrlInput = document.getElementById('api-url-input');
    const apiModelInput = document.getElementById('api-model-input');
    const apiModelSelect = document.getElementById('api-model-select');
    const fetchModelsButton = document.getElementById('fetch-models-button');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const aiPersonaInput = document.getElementById('ai-persona-input');
    const userPersonaInput = document.getElementById('user-persona-input');
    const contextLengthInput = document.getElementById('context-length-input');
    const messageCounter = document.getElementById('message-counter');
    const summarizeChatButton = document.getElementById('summarize-chat-button');
    const characterMemoryLabel = document.getElementById('character-memory-label');
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

    // --- 3. 核心功能函数 ---

    const sleep = ms => new Promise(res => setTimeout(res, ms));

    function displayMessage(text, role) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        messageDiv.textContent = text;
        messageContainer.appendChild(messageDiv);

        chatHistory.push({ role: (role === 'user' ? 'user' : 'assistant'), content: text });
        updateMessageCounter();
        
        if (role === 'user') chatInput.value = '';
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    async function getAiResponse() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message ai-message';
        loadingDiv.textContent = '对方正在输入...';
        messageContainer.appendChild(loadingDiv);
        messageContainer.scrollTop = messageContainer.scrollHeight;

        const memoryDepth = settings.contextLength;
        const recentHistory = chatHistory.slice(-memoryDepth);
        const worldBookString = serializeWorldBook();
        const characterMemoryString = settings.characterMemory;
        const aiName = settings.aiPersona.split('\n')[0].trim() || 'AI';
        const fullPersona = `${settings.aiPersona}\n\n[这是该角色的专属记忆，请在对话中参考]\n${characterMemoryString}`;

        try {
            let requestUrl = settings.apiUrl;
            let response;
            
            // 【全新】修改后的Prompt，要求AI像真人一样分多条回复
            const finalPrompt = `# 你的双重任务
## 任务1: 扮演AI助手
- 你的名字是"${aiName}"，你的人设(包括角色记忆)是：${fullPersona}
- 附加设定(世界书)：${worldBookString}
- **行为准则1**: 你的回复必须模拟真实的聊天软件（如微信/QQ），将一个完整的思想拆分成【一句或多句】独立的短消息来发送。
- **行为准则2**: 你的回复中【绝对不能】包含任何括号内的动作、神态、或环境描写，例如 \`*...*\` 或 \`(...)\`。只输出纯粹的对话内容。
- 请根据下面的对话历史，以你的身份回应用户。

## 任务2: 扮演用户本人，提供回复建议
- 用户的人设是：${settings.userPersona}
- 请为用户生成3条符合其人设的、简短的、口语化的回复建议。

# 对话历史
${recentHistory.map(msg => `${msg.role === 'user' ? '用户' : '你'}: ${msg.content}`).join('\n')}

# 输出格式要求
你的回复【必须且只能】是一个能被JSON解析的对象。格式如下，其中"reply"的值是一个包含一句或多句消息的【数组】：
{
  "reply": ["第一条消息。", "这是第二条消息。", "嗯...让我想想。"],
  "suggestions": ["建议1", "建议2", "建议3"]
}`;

            if (settings.apiType === 'openai_proxy') {
                if (!requestUrl.endsWith('/chat/completions')) {
                    requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions';
                }
                response = await fetch(requestUrl, {
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
                
                loadingDiv.remove(); // 移除“正在输入”

                // 【全新】处理多条消息回复
                if (Array.isArray(responseData.reply)) {
                    for (const msg of responseData.reply) {
                        displayMessage(msg, 'ai');
                        await sleep(Math.random() * 500 + 400); // 随机延迟400-900毫秒
                    }
                } else if (responseData.reply) { // 兼容AI不按套路出牌的情况
                    displayMessage(responseData.reply, 'ai');
                } else {
                    throw new Error("AI返回的JSON中缺少 'reply' 字段。");
                }
                
                if (isSuggestionEnabled && Array.isArray(responseData.suggestions)) {
                    displaySuggestions(responseData.suggestions);
                }

            } else if (settings.apiType === 'gemini_direct') {
                // Gemini逻辑暂未实现分多条回复，但保留纯文本输出
                const geminiReplyPrompt = `# 你的角色是：${fullPersona}\n# 附加设定：${worldBookString}\n# 对话历史:\n${recentHistory.map(msg => `${msg.role === 'user' ? '用户' : '你'}: ${msg.content}`).join('\n')}\n# 行为准则: 绝对不能包含任何括号内的动作、神态、或环境描写。\n请回应用户。`;
                const replyPayload = { contents: [{ parts: [{ text: geminiReplyPrompt }] }] };
                
                const replyResponse = await fetch(`${settings.apiUrl}?key=${settings.apiKey}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(replyPayload)
                });
                if (!replyResponse.ok) throw new Error(JSON.stringify((await replyResponse.json()).error));
                
                const replyData = await replyResponse.json();
                const aiText = replyData.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!aiText) throw new Error(`AI 提前终止，原因: ${replyData.candidates?.[0]?.finishReason || '未知'}`);
                
                loadingDiv.remove();
                displayMessage(aiText, 'ai');
            }
        } catch (error) {
            console.error('API调用失败:', error);
            loadingDiv.textContent = `哎呀，出错了: ${error.message}`;
            loadingDiv.style.backgroundColor = '#ff6b6b';
        }
    }

    async function summarizeConversation() {
        summarizeChatButton.textContent = '总结中...';
        summarizeChatButton.disabled = true;
    
        const recentHistory = chatHistory.slice(-settings.contextLength);
        if (recentHistory.length === 0) {
            alert("对话内容太少，无法总结。");
            summarizeChatButton.textContent = '总结对话';
            summarizeChatButton.disabled = false;
            return;
        }
    
        const summaryPrompt = `# 任务：对话总结员\n请根据“对话历史”，总结成一份严格的YAML格式文档。\n# 要求：\n- 客观、简洁、不回避敏感内容。\n- 每一项独立事件都应包含日期、时间、地点和事件描述。\n# 对话历史：\n${recentHistory.map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`).join('\n')}\n# 输出格式：\n你的回复【必须且只能】是一段纯粹的YAML代码，不要任何解释或\`\`\`包裹。格式如下：\n关键事件:\n  - 日期: "YYYY-MM-DD"\n    时间: "HH:MM"\n    地点: "对话中明确或暗示的地点"\n    事件: "对该事件的客观、简洁描述。"\n  - 日期: ...`;
        
        try {
            let requestUrl = settings.apiUrl;
            let response;
            if (settings.apiType === 'openai_proxy') {
                if (!requestUrl.endsWith('/chat/completions')) requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions';
                response = await fetch(requestUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                    body: JSON.stringify({ model: settings.apiModel, messages: [{ role: 'user', content: summaryPrompt }] })
                });
                if (!response.ok) throw new Error(await response.text());
                const data = await response.json();
                showSummaryModal(data.choices[0].message.content);
            } else if (settings.apiType === 'gemini_direct') {
                const payload = { contents: [{ parts: [{ text: summaryPrompt }] }] };
                response = await fetch(`${settings.apiUrl}?key=${settings.apiKey}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error(JSON.stringify((await response.json()).error));
                const data = await response.json();
                showSummaryModal(data.candidates[0].content.parts[0].text);
            }
        } catch (error) {
            alert("总结失败: " + error.message);
        } finally {
            summarizeChatButton.textContent = '总结对话';
            summarizeChatButton.disabled = false;
        }
    }

    // --- 4. 辅助与UI函数 ---

    function sendMessage() {
        const userText = chatInput.value.trim();
        if (userText === '') return;
        if (!settings.apiKey || !settings.apiUrl || (settings.apiType === 'openai_proxy' && !settings.apiModel)) {
            alert("请先完成API设置！");
            switchToView('settings-window');
            return;
        }
        displayMessage(userText, 'user');
        getAiResponse();
    }
    
    function showSummaryModal(summary) {
        summaryOutput.textContent = summary;
        summaryModal.classList.remove('hidden');
    }

    function hideSummaryModal() {
        summaryModal.classList.add('hidden');
    }
    
    function copyToClipboard() {
        navigator.clipboard.writeText(summaryOutput.textContent).then(() => {
            copySummaryButton.textContent = '已复制!';
            setTimeout(() => copySummaryButton.textContent = '复制到剪贴板', 2000);
        }).catch(err => alert('复制失败: ' + err));
    }

    function saveSummaryToMemory() {
        const summary = summaryOutput.textContent;
        characterMemoryInput.value += (characterMemoryInput.value ? '\n\n---\n\n' : '') + summary;
        hideSummaryModal();
        alert('已保存到角色记忆！');
    }

    function switchToView(viewId) {
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        navButtons.forEach(button => button.classList.toggle('active', button.dataset.view === viewId));
    }

    function updateMessageCounter() {
        messageCounter.textContent = `对话: ${chatHistory.length}`;
    }

    function displaySuggestions(suggestions) {
        suggestionArea.innerHTML = '';
        suggestionArea.style.display = 'flex';
        suggestions.forEach(text => {
            const button = document.createElement('button');
            button.className = 'suggestion-button';
            button.textContent = text;
            button.addEventListener('click', () => {
                displayMessage(text, 'user');
                getAiResponse();
                suggestionArea.style.display = 'none';
            });
            suggestionArea.appendChild(button);
        });
    }
    
    // --- 5. 世界书编辑器函数 ---
    
    function renderWorldBookEntry(key = '', value = '') {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'entry';
        entryDiv.innerHTML = `
            <div class="entry-header">
                <input type="text" class="entry-key" placeholder="条目/分类名" value="${key}">
                <button class="delete-entry-button">&times;</button>
            </div>
            <textarea class="entry-value" placeholder="内容...">${value}</textarea>
        `;
        worldBookEditor.appendChild(entryDiv);
        entryDiv.querySelector('.delete-entry-button').addEventListener('click', () => entryDiv.remove());
    }
    
    function serializeWorldBook() {
        const entries = [];
        worldBookEditor.querySelectorAll('.entry').forEach(entryDiv => {
            const key = entryDiv.querySelector('.entry-key').value.trim();
            const value = entryDiv.querySelector('.entry-value').value.trim();
            if (key && value) entries.push(`${key}:\n${value}`);
        });
        return entries.join('\n\n---\n\n');
    }
    
    // --- 6. 设置加载与保存 ---
    
    function loadSettings() {
        const saved = JSON.parse(localStorage.getItem('myAiChatSettings_Pro')) || {};
        settings = {
            apiType: saved.apiType || 'openai_proxy',
            apiUrl: saved.apiUrl || '',
            apiModel: saved.apiModel || '',
            apiKey: saved.apiKey || '',
            contextLength: saved.contextLength || 20,
            aiPersona: saved.aiPersona || 'AI伙伴 (名字写在第一行)\n你是一个乐于助人的AI。',
            userPersona: saved.userPersona || '我是一个充满好奇心的探索者。',
            characterMemory: saved.characterMemory || '',
        };
        worldBookData = saved.worldBookData || [{key: '示例条目', value: '这是世界书的一个示例内容。'}];

        apiTypeSelect.value = settings.apiType;
        apiUrlInput.value = settings.apiUrl;
        apiKeyInput.value = settings.apiKey;
        contextLengthInput.value = settings.contextLength;
        aiPersonaInput.value = settings.aiPersona;
        userPersonaInput.value = settings.userPersona;
        characterMemoryInput.value = settings.characterMemory;
        
        // 【修正】不再动态设置标题，HTML中已写死为“AI的专属记忆”
        
        worldBookEditor.innerHTML = '';
        worldBookData.forEach(entry => renderWorldBookEntry(entry.key, entry.value));
        
        updateSettingsUI(settings.apiType);
        if (settings.apiModel) apiModelSelect.innerHTML = `<option value="${settings.apiModel}">${settings.apiModel}</option>`;
    }

    function saveSettings() {
        settings.apiType = apiTypeSelect.value;
        settings.apiUrl = apiUrlInput.value.trim();
        settings.apiModel = apiModelSelect.value;
        settings.apiKey = apiKeyInput.value.trim();
        settings.contextLength = parseInt(contextLengthInput.value, 10);
        settings.aiPersona = aiPersonaInput.value;
        settings.userPersona = userPersonaInput.value;
        settings.characterMemory = characterMemoryInput.value;
        
        worldBookData = [];
        worldBookEditor.querySelectorAll('.entry').forEach(entryDiv => {
            const key = entryDiv.querySelector('.entry-key').value.trim();
            const value = entryDiv.querySelector('.entry-value').value.trim();
            if (key || value) worldBookData.push({ key, value });
        });

        localStorage.setItem('myAiChatSettings_Pro', JSON.stringify({ ...settings, worldBookData }));
        alert('设置已保存！');
    }

    function updateSettingsUI(type) {
        if (type === 'gemini_direct') {
            apiModelInput.classList.remove('hidden');
            apiModelSelect.classList.add('hidden');
            fetchModelsButton.style.display = 'none';
        } else if (type === 'openai_proxy') {
            apiModelInput.classList.add('hidden');
            apiModelSelect.classList.remove('hidden');
            fetchModelsButton.style.display = 'inline-block';
        }
    }

    async function fetchModels() {
        const url = apiUrlInput.value.trim();
        const key = apiKeyInput.value.trim();
        if (!url || !key) {
            alert('请先填写 API 中转地址和密钥！');
            return;
        }
        fetchModelsButton.textContent = '拉取中...';
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

    // --- 7. 事件绑定与启动 ---
    function initialize() {
        saveSettingsButton.addEventListener('click', saveSettings);
        addWorldBookEntryButton.addEventListener('click', () => renderWorldBookEntry());
        sendButton.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }});
        navButtons.forEach(button => button.addEventListener('click', () => switchToView(button.dataset.view)));
        summarizeChatButton.addEventListener('click', summarizeConversation);
        closeModalButton.addEventListener('click', hideSummaryModal);
        copySummaryButton.addEventListener('click', copyToClipboard);
        saveToMemoryButton.addEventListener('click', saveSummaryToMemory);
        apiTypeSelect.addEventListener('change', () => updateSettingsUI(apiTypeSelect.value));
        
        fetchModelsButton.addEventListener('click', fetchModels); 

        toggleSuggestionsButton.addEventListener('click', () => {
            isSuggestionEnabled = !isSuggestionEnabled;
            toggleSuggestionsButton.textContent = isSuggestionEnabled ? '关闭建议' : '开启建议';
        });

        const postButton = document.createElement('button');
        postButton.textContent = '发布';
        postButton.style.cssText = 'position: absolute; right: 10px; top: 10px; background: none; border: 1px solid white; color: white; border-radius: 5px; cursor: pointer;';
        momentsHeader.appendChild(postButton);
        postButton.addEventListener('click', () => {
            const content = prompt("分享你的新鲜事...");
            if (content) { /* 发布逻辑 */ }
        });

        // 启动程序
        loadSettings();
        switchToView('chat-window');
        updateMessageCounter();
    }

    initialize();
});

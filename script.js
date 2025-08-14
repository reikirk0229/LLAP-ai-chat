// script.js (最终发布版 - 集成所有功能)

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. 找到所有演员 ---
    const messageContainer = document.getElementById('message-container');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const navButtons = document.querySelectorAll('.nav-button');
    const suggestionArea = document.getElementById('suggestion-area');
    const postsContainer = document.getElementById('posts-container');
    const momentsHeader = document.querySelector('#moments-window .header');
    const toggleSuggestionsButton = document.getElementById('toggle-suggestions-button');
    
    // 设置页面的演员
    const apiTypeSelect = document.getElementById('api-type-select');
    const apiUrlInput = document.getElementById('api-url-input');
    const apiModelInput = document.getElementById('api-model-input');
    const apiModelSelect = document.getElementById('api-model-select');
    const fetchModelsButton = document.getElementById('fetch-models-button');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const aiPersonaInput = document.getElementById('ai-persona-input');
    const userPersonaInput = document.getElementById('user-persona-input');
    const worldBookInput = document.getElementById('world-book-input');
    
    // 【新功能演员】
    const contextLengthInput = document.getElementById('context-length-input');
    const messageCounter = document.getElementById('message-counter');
    const summarizeChatButton = document.getElementById('summarize-chat-button');


    // --- 2. 定义状态和设置变量 ---
    let isSuggestionEnabled = true;
    let chatHistory = [];
    let settings = {};
    let messageCount = 0; // 【新功能】对话计数


    // --- 3. UI更新与功能函数 ---
    function updateSettingsUI(type) {
        if (type === 'gemini_direct') {
            apiUrlInput.placeholder = '例如: https://generativelanguage.googleapis.com/...';
            apiModelInput.classList.remove('hidden');
            apiModelSelect.classList.add('hidden');
            fetchModelsButton.style.display = 'none';
            apiModelInput.placeholder = '模型名通常已在URL中，此项可留空';
        } else if (type === 'openai_proxy') {
            apiUrlInput.placeholder = '例如: https://api.proxy.com/v1';
            apiModelInput.classList.add('hidden');
            apiModelSelect.classList.remove('hidden');
            fetchModelsButton.style.display = 'inline-block';
        }
    }

    function updateMessageCounter() {
        messageCounter.textContent = `对话：${chatHistory.length}`;
    }


    // --- 4. 加载和保存函数 ---
    function loadSettings() {
        const savedSettings = JSON.parse(localStorage.getItem('myAiChatSettings')) || {};
        settings = {
            apiType: savedSettings.apiType || 'gemini_direct',
            apiUrl: savedSettings.apiUrl || '',
            apiModel: savedSettings.apiModel || '',
            apiKey: savedSettings.apiKey || '',
            contextLength: savedSettings.contextLength || 10, // 读取记忆条数
            aiPersona: savedSettings.aiPersona || '你是一个名叫"小梦"的AI助手，性格活泼可爱，喜欢用表情符号。',
            userPersona: savedSettings.userPersona || '我是一个性格有点内向、说话温柔、喜欢思考的大学生。',
            worldBook: savedSettings.worldBook || ''
        };
        
        apiTypeSelect.value = settings.apiType;
        apiUrlInput.value = settings.apiUrl;
        apiKeyInput.value = settings.apiKey;
        contextLengthInput.value = settings.contextLength; // 更新UI
        aiPersonaInput.value = settings.aiPersona;
        userPersonaInput.value = settings.userPersona;
        worldBookInput.value = settings.worldBook;

        updateSettingsUI(settings.apiType);

        if (settings.apiType === 'openai_proxy') {
             if (settings.apiModel) {
                apiModelSelect.innerHTML = `<option value="${settings.apiModel}">${settings.apiModel}</option>`;
                apiModelSelect.value = settings.apiModel;
            } else {
                apiModelSelect.innerHTML = `<option value="">-- 请先拉取模型 --</option>`;
            }
        } else {
            apiModelInput.value = settings.apiModel;
        }
    }

    function saveSettings() {
        const currentType = apiTypeSelect.value;
        settings = {
            apiType: currentType,
            apiUrl: apiUrlInput.value.trim(),
            apiModel: currentType === 'openai_proxy' ? apiModelSelect.value : apiModelInput.value.trim(),
            apiKey: apiKeyInput.value.trim(),
            contextLength: parseInt(contextLengthInput.value, 10), // 保存记忆条数
            aiPersona: aiPersonaInput.value.trim(),
            userPersona: userPersonaInput.value.trim(),
            worldBook: worldBookInput.value.trim()
        };
        localStorage.setItem('myAiChatSettings', JSON.stringify(settings));
        alert('设置已保存！');
    }


    // --- 5. 绑定所有事件 ---
    apiTypeSelect.addEventListener('change', () => updateSettingsUI(apiTypeSelect.value));
    saveSettingsButton.addEventListener('click', saveSettings);
    fetchModelsButton.addEventListener('click', fetchModels);
    sendButton.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }});
    navButtons.forEach(button => button.addEventListener('click', () => switchToView(button.dataset.view)));
    summarizeChatButton.addEventListener('click', summarizeConversation); // 【新功能】绑定总结按钮

    // 朋友圈发布按钮 (动态创建)
    const postButton = document.createElement('button');
    postButton.textContent = '发布';
    postButton.style.position = 'absolute';
    postButton.style.right = '10px';
    postButton.style.top = '10px';
    postButton.style.background = 'none';
    postButton.style.border = '1px solid white';
    postButton.style.color = 'white';
    postButton.style.borderRadius = '5px';
    postButton.style.cursor = 'pointer';
    momentsHeader.appendChild(postButton);
    postButton.addEventListener('click', createNewPost);

    if (toggleSuggestionsButton) {
        toggleSuggestionsButton.addEventListener('click', () => {
            isSuggestionEnabled = !isSuggestionEnabled;
            toggleSuggestionsButton.textContent = isSuggestionEnabled ? '关闭建议' : '开启建议';
            toggleSuggestionsButton.classList.toggle('disabled', !isSuggestionEnabled);
            if (!isSuggestionEnabled) {
                suggestionArea.innerHTML = '';
                suggestionArea.style.display = 'none';
            }
        });
    }

    // --- 6. 定义核心功能函数 ---
    function sendMessage() {
        if (!settings.apiKey || !settings.apiUrl) {
            alert("请先在'设置'页面填写 API 地址和密钥！");
            switchToView('settings-window');
            return;
        }
        if (settings.apiType === 'openai_proxy' && !settings.apiModel) {
            alert("请为 OpenAI/中转站 类型选择一个模型！");
            return;
        }
        const userText = chatInput.value.trim();
        if (userText === '') return;
        suggestionArea.innerHTML = '';
        suggestionArea.style.display = 'none';
        displayUserMessage(userText);
        getAiResponse(userText); 
    }

    function displayUserMessage(text, isSuggestion = false) {
        const userMessageDiv = document.createElement('div');
        userMessageDiv.className = 'message user-message';
        userMessageDiv.textContent = text;
        messageContainer.appendChild(userMessageDiv);
        chatHistory.push({ role: 'user', content: text });
        updateMessageCounter();
        chatInput.value = '';
        messageContainer.scrollTop = messageContainer.scrollHeight;
        if (isSuggestion) { getAiResponse(text); }
    }

    function switchToView(viewId) {
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        navButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.view === viewId);
        });
    }

    function createNewPost() {
        const postContent = prompt("分享你的新鲜事...");
        if (postContent && postContent.trim() !== '') {
            const postDiv = document.createElement('div');
            postDiv.className = 'post';
            postDiv.innerHTML = `<div class="post-header"><img class="post-avatar" src="https://i.postimg.cc/cLPP10Vm/4.jpg" alt="my-avatar"><span class="post-author">我</span></div><div class="post-content">${postContent}</div>`;
            postsContainer.prepend(postDiv);
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
                suggestionArea.innerHTML = '';
                suggestionArea.style.display = 'none';
                displayUserMessage(text, true);
            });
            suggestionArea.appendChild(button);
        });
    }

    // --- 7. 动态拉取模型列表 ---
    async function fetchModels() {
        // ... 此函数保持不变 ...
        const type = apiTypeSelect.value;
        if (type !== 'openai_proxy') {
            alert("Gemini 直连模式不需要在线拉取模型。");
            return;
        }
        const url = apiUrlInput.value.trim();
        const key = apiKeyInput.value.trim();
        if (!url || !key) {
            alert('请先填写 API 中转地址和密钥！');
            return;
        }
        fetchModelsButton.textContent = '拉取中...';
        fetchModelsButton.disabled = true;

        const modelsUrl = url.replace(/\/chat\/completions$/, '') + '/models';

        try {
            const response = await fetch(modelsUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${key}` }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || `HTTP 错误，状态码: ${response.status}`);
            }
            const data = await response.json();
            
            if (!data.data || !Array.isArray(data.data)) {
                throw new Error("中转站返回的模型列表格式不正确。");
            }
            const models = data.data.map(model => model.id);
            
            apiModelSelect.innerHTML = '';
            if (models.length > 0) {
                models.sort().forEach(modelId => {
                    const option = document.createElement('option');
                    option.value = modelId;
                    option.textContent = modelId;
                    apiModelSelect.appendChild(option);
                });
                if (settings.apiModel && models.includes(settings.apiModel)) {
                    apiModelSelect.value = settings.apiModel;
                }
            } else {
                apiModelSelect.innerHTML = '<option value="">未找到可用模型</option>';
            }
            alert('模型列表已成功拉取！');
        } catch (error) {
            alert(`拉取模型失败: ${error.message}`);
            apiModelSelect.innerHTML = '<option value="">拉取失败</option>';
        } finally {
            fetchModelsButton.textContent = '拉取';
            fetchModelsButton.disabled = false;
        }
    }

    // --- 8. 【王牌功能】一键总结对话 ---
    async function summarizeConversation() {
        summarizeChatButton.textContent = '总结中...';
        summarizeChatButton.disabled = true;
    
        const memoryDepth = settings.contextLength * 2;
        const recentHistory = chatHistory.slice(-memoryDepth);
    
        if (recentHistory.length === 0) {
            alert("对话内容太少，无法总结。");
            summarizeChatButton.textContent = '总结对话';
            summarizeChatButton.disabled = false;
            return;
        }
    
        const summaryPrompt = `
# 你的任务：对话总结员
你是一个专业的对话记录分析师。请根据下面提供的“对话历史”，将其内容总结成一份严格的YAML格式文档。

# 总结要求：
- **客观陈述**：仅陈述事实，不添加任何主观评价、情感或修饰性词语。
- **简洁清晰**：使用最简练的语言。
- **保留关键信息**：必须保留所有关键事件、重要细节和用户的明确意图。
- **突出转折点**：如果对话中有明显的态度、话题或关系转变，必须在内容中体现出来。
- **不回避敏感内容**：对话中任何冲突、分歧或敏感话题都必须如实记录。

# 对话历史：
${recentHistory.map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`).join('\n')}

# 输出格式：
你的回复【必须且只能】是一段纯粹的YAML代码，不需要任何解释，也不要使用 \`\`\`yaml\`\`\` 包裹。格式如下：

event_time: "${new Date().toLocaleString('zh-CN')}"
location: "线上聊天"
key_content: |
  - [事件点1] 用户首先...
  - [事件点2] AI回应...
  - [转折点] 用户的话题/情绪发生转变...
  - [事件点3] 双方达成了关于...的共识或分歧。
`;
        
        let summaryText = '总结失败，请检查控制台。';
        try {
            let requestUrl = settings.apiUrl;
            let response;
    
            if (settings.apiType === 'openai_proxy') {
                if (!requestUrl.endsWith('/chat/completions')) {
                    requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions';
                }
                response = await fetch(requestUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                    body: JSON.stringify({ model: settings.apiModel, messages: [{ role: 'user', content: summaryPrompt }] })
                });
                if (!response.ok) throw new Error(await response.text());
                const data = await response.json();
                summaryText = data.choices[0].message.content;
    
            } else if (settings.apiType === 'gemini_direct') {
                response = await fetch(`${settings.apiUrl}?key=${settings.apiKey}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ contents: [{ parts: [{ text: summaryPrompt }] }] })
                });
                if (!response.ok) throw new Error(JSON.stringify(await response.json()));
                const data = await response.json();
                summaryText = data.candidates[0].content.parts[0].text;
            }
    
            const userChoice = prompt("对话总结 (YAML格式):\n\n" + summaryText + "\n\n你可以直接复制上面的文本。\n如果想将此总结追加到“世界书”，请点击“确定”。", "点击确定保存到世界书");
    
            if (userChoice !== null) {
                worldBookInput.value += `\n\n# --- 对话总结于 ${new Date().toLocaleString('zh-CN')} ---\n` + summaryText;
                alert("已追加到“设置”页面的“附加设定(世界书)”中！");
            }
    
        } catch (error) {
            console.error("总结失败:", error);
            alert("总结失败，错误信息: " + error.message);
        } finally {
            summarizeChatButton.textContent = '总结对话';
            summarizeChatButton.disabled = false;
        }
    }
    

    // --- 9. 最终的、兼容的AI请求函数 ---
    async function getAiResponse() {
        // 使用有限记忆，只截取最近的N条对话
        const memoryDepth = settings.contextLength * 2;
        const recentHistory = chatHistory.slice(-memoryDepth);
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message ai-message';
        loadingDiv.textContent = '对方正在输入...';
        messageContainer.appendChild(loadingDiv);
        messageContainer.scrollTop = messageContainer.scrollHeight;

        let requestUrl = settings.apiUrl;
        let requestOptions = {};
        
        try {
            if (settings.apiType === 'openai_proxy') {
                // 智能补全URL
                if (!requestUrl.endsWith('/chat/completions')) {
                    requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions';
                }
                const finalPrompt = `
# 你的双重任务
你现在需要同时完成两个任务。
## 任务1: 扮演AI助手
- 你的名字是"小梦"，人设是：${settings.aiPersona}
- 附加设定(世界书)：${settings.worldBook}
- 请根据下面的对话历史，以"小梦"的身份，对用户的最后一句话做出回应。
## 任务2: 扮演用户本人，提供回复建议
- 用户的人设是：${settings.userPersona}
- 请你站在用户的角度，根据"小梦"即将给出的回复，为用户生成3条符合用户人设的、简短的、口语化的回复建议。
# 对话历史
${recentHistory.map(msg => `${msg.role === 'user' ? '用户' : '小梦'}: ${msg.content}`).join('\n')}
# 输出格式要求
你的回复【必须且只能】是一个单一的、能被JSON解析的对象，格式如下：
{ "reply": "...", "suggestions": ["...", "...", "..."] }
`;
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                    body: JSON.stringify({
                        model: settings.apiModel,
                        messages: [{ role: 'user', content: finalPrompt }]
                    })
                };
                const response = await fetch(requestUrl, requestOptions);
                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`HTTP 错误: ${response.status}. 响应: ${errorBody}`);
                }
                const data = await response.json();
                const responseText = data.choices[0].message.content;

                try {
                    const jsonMatch = responseText.match(/{[\s\S]*}/);
                    if (!jsonMatch) throw new Error("AI回复中未找到JSON对象。");
                    
                    const responseData = JSON.parse(jsonMatch[0]);
                    const aiText = responseData.reply;
                    const suggestions = responseData.suggestions;

                    if (!aiText) throw new Error("AI返回的JSON中缺少 'reply' 字段。");

                    loadingDiv.textContent = aiText;
                    chatHistory.push({ role: 'assistant', content: aiText });
                    if (isSuggestionEnabled && Array.isArray(suggestions)) {
                        displaySuggestions(suggestions);
                    }
                } catch (parseError) {
                    console.error('JSON解析或处理失败:', parseError);
                    loadingDiv.textContent = responseText;
                    chatHistory.push({ role: 'assistant', content: responseText });
                }
            } 
            else if (settings.apiType === 'gemini_direct') {
                const geminiReplyPrompt = `
# 你的角色是：${settings.aiPersona}
# 你的附加设定是：${settings.worldBook}
# 以下是对话历史:
${recentHistory.map(msg => `${msg.role === 'user' ? '用户' : '你'}: ${msg.content}`).join('\n')}
请根据以上信息，对用户的最后一句话做出回应。
`;
                const replyPayload = { contents: [{ parts: [{ text: geminiReplyPrompt }] }] };
                const replyResponse = await fetch(`${settings.apiUrl}?key=${settings.apiKey}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(replyPayload)
                });
                const replyData = await replyResponse.json();
                if (!replyResponse.ok) throw new Error(JSON.stringify(replyData.error || replyData));
                
                let aiText;
                if (replyData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    aiText = replyData.candidates[0].content.parts[0].text;
                } else {
                    const finishReason = replyData.candidates?.[0]?.finishReason;
                    throw new Error(`AI 提前终止，原因: ${finishReason || '未知'}`);
                }
                
                loadingDiv.textContent = aiText;
                chatHistory.push({ role: 'assistant', content: aiText });

                if (isSuggestionEnabled) {
                    const suggestionPrompt = `
# 你的角色: 扮演用户本人。
# 用户的人设: ${settings.userPersona}
# 对话情景: AI助手刚刚对你说了下面这句话： "${aiText}"
# 你的任务: 请根据你的人设，生成3条简短、口语化、且风格不同的回复。
# 输出格式要求: 你的回复【必须且只能】是一个JSON数组，里面包含三个字符串。例如： ["好的，谢谢你呀！", "嗯嗯，让我想想...", "是这样吗？"]
`;
                    const suggestionPayload = {
                        contents: [{ parts: [{ text: suggestionPrompt }] }],
                        generationConfig: { responseMimeType: "application/json" }
                    };
                    const suggestionResponse = await fetch(`${settings.apiUrl}?key=${settings.apiKey}`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(suggestionPayload)
                    });
                    const suggestionData = await suggestionResponse.json();
                    if (suggestionData.candidates?.[0]) {
                        const suggestionsText = suggestionData.candidates[0].content.parts[0].text;
                        const suggestions = JSON.parse(suggestionsText);
                        if (Array.isArray(suggestions)) {
                            displaySuggestions(suggestions);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('API调用失败:', error);
            loadingDiv.textContent = `哎呀，出错了: ${error.message}`;
            loadingDiv.style.backgroundColor = '#ff6b6b';
            chatHistory.push({ role: 'assistant', content: loadingDiv.textContent });
        } finally {
            messageContainer.scrollTop = messageContainer.scrollHeight;
            updateMessageCounter();
        }
    }

    // --- 10. 程序启动 ---
    loadSettings();
    switchToView('chat-window');
    updateMessageCounter(); // 初始加载时也更新一下计数器
});

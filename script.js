// script.js (最终修复版，增加了对Gemini空回复的安全检查)

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
    const apiModelInput = document.getElementById('api-model-input'); // 输入框
    const apiModelSelect = document.getElementById('api-model-select'); // 下拉菜单
    const fetchModelsButton = document.getElementById('fetch-models-button');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const aiPersonaInput = document.getElementById('ai-persona-input');
    const userPersonaInput = document.getElementById('user-persona-input');
    const worldBookInput = document.getElementById('world-book-input');

    // --- 2. 定义状态和设置变量 ---
    let isSuggestionEnabled = true;
    let chatHistory = [];
    let settings = {};

    // --- 3. UI更新函数 ---
    function updateSettingsUI(type) {
        if (type === 'gemini_direct') {
            apiUrlInput.placeholder = '例如: https://generativelanguage.googleapis.com/...';
            apiModelInput.classList.remove('hidden');
            apiModelSelect.classList.add('hidden');
            fetchModelsButton.style.display = 'none'; // 直接隐藏
            apiModelInput.placeholder = '模型名通常已在URL中，此项可留空';
        } else if (type === 'openai_proxy') {
            apiUrlInput.placeholder = '例如: https://api.proxy.com/v1/chat/completions';
            apiModelInput.classList.add('hidden');
            apiModelSelect.classList.remove('hidden');
            fetchModelsButton.style.display = 'inline-block'; // 显示
        }
    }

    // --- 4. 加载和保存函数 ---
    function loadSettings() {
        const savedSettings = JSON.parse(localStorage.getItem('myAiChatSettings')) || {};
        settings = {
            apiType: savedSettings.apiType || 'gemini_direct',
            apiUrl: savedSettings.apiUrl || '',
            apiModel: savedSettings.apiModel || '',
            apiKey: savedSettings.apiKey || '',
            aiPersona: savedSettings.aiPersona || '你是一个名叫"小梦"的AI助手，性格活泼可爱，喜欢用表情符号。',
            userPersona: savedSettings.userPersona || '我是一个性格有点内向、说话温柔、喜欢思考的大学生。',
            worldBook: savedSettings.worldBook || ''
        };
        
        apiTypeSelect.value = settings.apiType;
        apiUrlInput.value = settings.apiUrl;
        apiKeyInput.value = settings.apiKey;
        aiPersonaInput.value = settings.aiPersona;
        userPersonaInput.value = settings.userPersona;
        worldBookInput.value = settings.worldBook;

        updateSettingsUI(settings.apiType); // 根据加载的类型更新UI

        if (settings.apiType === 'openai_proxy') {
             if (settings.apiModel) {
                apiModelSelect.innerHTML = `<option value="${settings.apiModel}">${settings.apiModel}</option>`;
            } else {
                apiModelSelect.innerHTML = `<option value="">-- 请先拉取模型 --</option>`;
            }
        } else {
            apiModelInput.value = settings.apiModel; // Gemini 模式加载到输入框
        }
    }

    function saveSettings() {
        const currentType = apiTypeSelect.value;
        settings = {
            apiType: currentType,
            apiUrl: apiUrlInput.value.trim(),
            apiModel: currentType === 'openai_proxy' ? apiModelSelect.value : apiModelInput.value.trim(),
            apiKey: apiKeyInput.value.trim(),
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
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }});
    navButtons.forEach(button => button.addEventListener('click', () => switchToView(button.dataset.view)));

    const postButton = document.createElement('button');
    postButton.textContent = '发布';
    postButton.style.position = 'absolute'; postButton.style.right = '10px'; postButton.style.top = '10px'; postButton.style.background = 'none'; postButton.style.border = '1px solid white'; postButton.style.color = 'white'; postButton.style.borderRadius = '5px'; postButton.style.cursor = 'pointer';
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

    // --- 6. 定义功能函数 ---
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
        const url = apiUrlInput.value.trim();
        const key = apiKeyInput.value.trim();
        if (!url || !key) {
            alert('请先填写 API 地址和密钥！');
            return;
        }
        fetchModelsButton.textContent = '拉取中...';
        fetchModelsButton.disabled = true;

        const requestUrl = url.replace(/\/chat\/completions$/, '') + '/models';
        const requestOptions = { method: 'GET', headers: { 'Authorization': `Bearer ${key}` } };

        try {
            const response = await fetch(requestUrl, requestOptions);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || JSON.stringify(errorData));
            }
            const data = await response.json();
            const models = data.data.map(model => model.id);
            
            apiModelSelect.innerHTML = '';
            if (models.length > 0) {
                models.forEach(modelId => {
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
        } finally {
            fetchModelsButton.textContent = '拉取';
            fetchModelsButton.disabled = false;
        }
    }

    // --- 8. 通用AI请求函数 ---
    async function getAiResponse(userText) {
        chatHistory.push({ role: 'user', content: userText });
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message ai-message';
        loadingDiv.textContent = '对方正在输入...';
        messageContainer.appendChild(loadingDiv);
        messageContainer.scrollTop = messageContainer.scrollHeight;

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
            ${chatHistory.map(msg => `${msg.role === 'user' ? '用户' : '小梦'}: ${msg.content}`).join('\n')}
            # 输出格式要求
            你的回复【必须且只能】是一个单一的、能被JSON解析的对象，格式如下：
            {
              "reply": "（这里是小梦的回复内容）",
              "suggestions": [
                "（这是第一条建议）",
                "（这是第二条建议）",
                "（这是第三条建议）"
              ]
            }
        `;

        let requestUrl = settings.apiUrl;
        let requestOptions = {};
        
        try {
            if (settings.apiType === 'openai_proxy') {
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                    body: JSON.stringify({
                        model: settings.apiModel,
                        messages: [{ role: 'user', content: finalPrompt }],
                        response_format: { type: "json_object" }
                    })
                };
            } 
            else if (settings.apiType === 'gemini_direct') {
                requestUrl = `${settings.apiUrl}?key=${settings.apiKey}`;
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: finalPrompt }] }],
                        generationConfig: { responseMimeType: "application/json" }
                    })
                };
            }

            const response = await fetch(requestUrl, requestOptions);
            const data = await response.json();

            if (!response.ok) { 
                throw new Error(JSON.stringify(data.error || data)); 
            }

            let responseText = '';
            if (settings.apiType === 'openai_proxy') {
                if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
                    responseText = data.choices[0].message.content;
                } else {
                    throw new Error("OpenAI 返回了空的或无效的数据结构。");
                }
            } 
            else if (settings.apiType === 'gemini_direct') {
                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) {
                    responseText = data.candidates[0].content.parts[0].text;
                } else {
                    const finishReason = data.candidates?.[0]?.finishReason;
                    if (finishReason) {
                        throw new Error(`AI 提前终止了回复，原因: ${finishReason} (通常是安全设置拦截)`);
                    }
                    throw new Error("Gemini 返回了空的或无效的数据结构。");
                }
            }
            
            const responseData = JSON.parse(responseText);
            const aiText = responseData.reply;
            const suggestions = responseData.suggestions;

            chatHistory.push({ role: 'assistant', content: aiText });
            loadingDiv.textContent = aiText;

            if (isSuggestionEnabled && Array.isArray(suggestions)) {
                displaySuggestions(suggestions);
                messageContainer.scrollTop = messageContainer.scrollHeight;
            }

        } catch (error) {
            console.error('API调用失败:', error);
            loadingDiv.textContent = `哎呀，出错了: ${error.message}`;
            loadingDiv.style.backgroundColor = '#ff6b6b';
        } finally {
            messageContainer.scrollTop = messageContainer.scrollHeight;
        }
    }

    // --- 9. 程序启动 ---
    loadSettings();
    switchToView('chat-window');
});
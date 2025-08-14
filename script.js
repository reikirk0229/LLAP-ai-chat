// script.js (最终发布版 - 无需 Live Server)

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
            fetchModelsButton.style.display = 'none';
            apiModelInput.placeholder = '模型名通常已在URL中，此项可留空';
        } else if (type === 'openai_proxy') {
            apiUrlInput.placeholder = '例如: https://api.proxy.com/v1/chat/completions';
            apiModelInput.classList.add('hidden');
            apiModelSelect.classList.remove('hidden');
            fetchModelsButton.style.display = 'inline-block';
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

    // --- 8. 最终的、兼容的AI请求函数 ---
    async function getAiResponse(userText) {
        chatHistory.push({ role: 'user', content: userText });
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message ai-message';
        loadingDiv.textContent = '对方正在输入...';
        messageContainer.appendChild(loadingDiv);
        messageContainer.scrollTop = messageContainer.scrollHeight;

        let requestUrl = settings.apiUrl;
        let requestOptions = {};
        
        try {
// script.js 文件中，请找到并替换 getAiResponse 函数里的 'openai_proxy' 条件块

            if (settings.apiType === 'openai_proxy') {
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
                    { "reply": "...", "suggestions": ["...", "...", "..."] }
                `;
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                    body: JSON.stringify({
                        model: settings.apiModel,
                        messages: [{ role: 'user', content: finalPrompt }]
                        // --- 【修正】移除 response_format 参数，提高兼容性 ---
                    })
                };
                const response = await fetch(requestUrl, requestOptions);
                
                // --- 【修正】将错误检查放在获取data之后，并提供更清晰的错误信息 ---
                if (!response.ok) {
                    const errorBody = await response.text(); // 先以文本形式获取错误信息
                    throw new Error(`HTTP 错误: ${response.status} ${response.statusText}. 响应内容: ${errorBody}`);
                }

                const data = await response.json();
                const responseText = data.choices[0].message.content;

                // --- 【修正】增加健壮性，使用 try-catch 解析JSON ---
                try {
                    const responseData = JSON.parse(responseText);
                    const aiText = responseData.reply;
                    const suggestions = responseData.suggestions;

                    if (!aiText) {
                        throw new Error("AI返回的JSON中缺少 'reply' 字段。");
                    }

                    chatHistory.push({ role: 'assistant', content: aiText });
                    loadingDiv.textContent = aiText;
                    if (isSuggestionEnabled && Array.isArray(suggestions)) {
                        displaySuggestions(suggestions);
                    }
                } catch (parseError) {
                    // 如果解析失败，说明AI没有按要求返回JSON，直接把原文显示出来
                    console.error('JSON 解析失败:', parseError);
                    console.error('AI 返回的原始文本:', responseText);
                    loadingDiv.textContent = responseText; // 直接显示原始内容
                    chatHistory.push({ role: 'assistant', content: responseText });
                    // 此时不显示建议按钮，因为无法解析
                }
            } 
            else if (settings.apiType === 'gemini_direct') {
                // Gemini 直连：分两步走
                const geminiReplyPrompt = `
                    # 你的角色是：${settings.aiPersona}
                    # 你的附加设定是：${settings.worldBook}
                    # 以下是对话历史:
                    ${chatHistory.map(msg => `${msg.role === 'user' ? '用户' : '你'}: ${msg.content}`).join('\n')}
                    请根据以上信息，对用户的最后一句话做出回应。
                `;
                const replyPayload = { contents: [{ parts: [{ text: geminiReplyPrompt }] }] };
                const replyResponse = await fetch(`${settings.apiUrl}?key=${settings.apiKey}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(replyPayload)
                });
                const replyData = await replyResponse.json();
                if (!replyResponse.ok) throw new Error(JSON.stringify(replyData.error || replyData));
                
                let aiText;
                if (replyData.candidates && replyData.candidates[0] && replyData.candidates[0].content && replyData.candidates[0].content.parts && replyData.candidates[0].content.parts[0] && replyData.candidates[0].content.parts[0].text) {
                    aiText = replyData.candidates[0].content.parts[0].text;
                } else {
                    const finishReason = replyData.candidates?.[0]?.finishReason;
                    if (finishReason) { throw new Error(`AI 提前终止了回复，原因: ${finishReason}`); }
                    throw new Error("Gemini 直连没有返回回复内容。");
                }
                
                loadingDiv.textContent = aiText;
                chatHistory.push({ role: 'assistant', content: aiText });

                // 如果开启了建议，则进行第二次调用
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
                    if (suggestionData.candidates && suggestionData.candidates[0]) {
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
        } finally {
            messageContainer.scrollTop = messageContainer.scrollHeight;
        }
    }

    // --- 9. 程序启动 ---
    loadSettings();
    switchToView('chat-window');
});

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
        },
        // ▼▼▼ 【【【全新：一次性读取所有图片的魔法】】】 ▼▼▼
        getAllImages: function() {
            return new Promise((resolve, reject) => {
                if (!this._db) return reject("数据库未初始化");
                const transaction = this._db.transaction(['images'], 'readonly');
                const store = transaction.objectStore('images');
                const request = store.getAll(); // 获取所有图片
                const keysRequest = store.getAllKeys(); // 获取所有图片的钥匙

                let results = {};
                let images, keys;

                const checkCompletion = () => {
                    if (images && keys) {
                        keys.forEach((key, index) => {
                            results[key] = images[index];
                        });
                        resolve(results);
                    }
                };
                
                request.onsuccess = (event) => {
                    images = event.target.result;
                    checkCompletion();
                };
                keysRequest.onsuccess = (event) => {
                    keys = event.target.result;
                    checkCompletion();
                };

                request.onerror = (event) => reject("读取所有图片失败: " + event.target.errorCode);
                keysRequest.onerror = (event) => reject("读取所有图片钥匙失败: " + event.target.errorCode);
            });
        }
    };

    // --- 1. 全局数据存储 ---
    let appData = {};
    let activeChatContactId = null;
    let hasUserLoggedIn = false;
    let currentEditingDiaryId = null;
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

    // --- 【【【全新：天气感知系统 V1.0】】】 ---
    let formattedWeatherData = "（天气信息暂未获取）"; // 用来存储给AI看的天气报告
    // 【核心改造1】这里是给UI用的“公告板”，存放最简洁的天气信息
    let simpleWeatherData = {
        temp: '--',
        iconCode: '01d' // 默认给一个晴天的图标代码
    };
    const weatherApiKey = "76c1b63aa70608f6e24a3f981de4c868"; // 把你的Key存放在这里

    /**
     * 【【【全新：地理位置错误智能翻译官】】】
     * @param {GeolocationPositionError} error - 从 navigator.geolocation 返回的错误对象
     * @returns {string} - 返回用户能看懂的中文错误提示
     */
    function translateGeolocationError(error) {
        switch (error.code) {
            case error.PERMISSION_DENIED:
                return "你拒绝了位置请求，天气功能无法使用。";
            case error.POSITION_UNAVAILABLE:
                return "无法获取你当前的位置信息，请检查网络或GPS信号。";
            case error.TIMEOUT:
                return "获取位置信息超时，请稍后再试。";
            default:
                return "获取位置时发生未知错误。";
        }
    }
    /**
     * 主控制器：获取用户位置，然后触发天气查询
     */
    /**
     * 主控制器：获取用户位置，然后触发天气查询 (V2.0 - 终极兼容版)
     */
    async function initializeWeatherSystem() {
        // 1. 【安全检查员】(保持不变)
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            showCustomAlert('天气功能受限', '由于安全限制，地理位置功能仅在HTTPS或本地开发环境中可用。');
            return;
        }

        // 2. 【耐心怀表】(保持不变)
        const geolocationOptions = {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 600000
        };
        
        // 3. 【核心改造】我们将“请求”这个动作本身，变成一个可以被随时调用的“工具”
        const requestLocation = () => {
            showToast('正在获取您的位置...', 'info');
            navigator.geolocation.getCurrentPosition(
                // 成功时的回调
                (position) => fetchAndFormatWeather(position.coords.latitude, position.coords.longitude),
                // 失败时的回调
                (error) => {
                    const errorMessage = translateGeolocationError(error);
                    console.error("天气系统：获取位置失败", error);
                    showToast(errorMessage, 'error', 5000);
                },
                geolocationOptions
            );
        };

        // 4. 【全新】智能决策大脑
        // 检查浏览器是否支持现代的权限查询API
        if (navigator.permissions && navigator.permissions.query) {
            console.log("天气系统：正在使用现代权限API检查...");
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });

                if (permissionStatus.state === 'granted') {
                    // 权限已经给了，直接用
                    console.log("天气系统：权限已授予，将直接获取位置。");
                    requestLocation();
                } else if (permissionStatus.state === 'prompt') {
                    // 权限需要询问，弹出我们自己的对话框
                    console.log("天气系统：权限状态为prompt，需要询问用户。");
                    showCustomConfirm(
                        '获取天气信息?',
                        '允许获取您的位置，可以让AI了解您当地的实时天气',
                        () => {
                            // 【【【终极修复点！！！】】】
                            // 当用户点击“好的”，我们立刻、马上、直接调用请求工具！
                            // 这就把用户的点击和浏览器的请求紧紧地绑在了一起。
                            console.log("天气系统：用户已同意，正在请求浏览器授权...");
                            requestLocation();
                        },
                        () => console.log("天气系统：用户在我们的弹窗中拒绝了。"),
                        '好的',
                        '不用了'
                    );
                } else if (permissionStatus.state === 'denied') {
                    // 权限被拒绝了，给出提示
                    console.log("天气系统：权限已被用户明确拒绝。");
                    showToast('天气功能已禁用，您可以在浏览器设置中重新开启位置权限', 'info', 5000);
                }

                permissionStatus.onchange = () => {
                    console.log(`天气系统：位置权限状态已变更为: ${permissionStatus.state}`);
                    if (permissionStatus.state === 'granted') {
                        initializeWeatherSystem(); // 如果用户在设置里改了权限，就重新检查
                    }
                };
            } catch (error) {
                console.error("天气系统：查询权限时发生错误，将使用旧版方式。", error);
                // 如果查询API本身就出错了，也退回到旧版方式
                requestLocation();
            }
        } else {
            // 【【【终极兼容】】】
            // 如果浏览器根本不支持权限查询，我们就直接“莽”，让浏览器自己处理
            console.log("天气系统：您的浏览器不支持权限查询API，将使用旧版询问方式。");
            requestLocation();
        }
    }

    /**
     * 【全新】UI装修工：更新侧边栏的天气显示
     */
    function updateWeatherDisplay() {
        const iconContainer = document.getElementById('weather-icon');
        const tempSpan = document.getElementById('weather-temp');

        if (iconContainer && tempSpan) {
            iconContainer.innerHTML = getWeatherIconSvg(simpleWeatherData.iconCode);
            tempSpan.textContent = `${simpleWeatherData.temp}°`;
        }
    }

    /**
     * 【全新】图标翻译官：根据OpenWeatherMap的图标代码，返回对应的SVG图标
     */
    function getWeatherIconSvg(iconCode) {
        const code = iconCode.substring(0, 2);
        const isDay = iconCode.endsWith('d');

        let dayIcon, nightIcon; // 先准备好两个空位，分别放白天和夜晚的图标

        // 【核心改造】这个switch只负责“选材”，把正确的图标放进上面的空位里
        switch (code) {
            case '01': // 晴天
                dayIcon = `<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 37C31.1797 37 37 31.1797 37 24C37 16.8203 31.1797 11 24 11C16.8203 11 11 16.8203 11 24C11 31.1797 16.8203 37 24 37Z" fill="currentColor" stroke="none"/><path d="M24 6C25.3807 6 26.5 4.88071 26.5 3.5C26.5 2.11929 25.3807 1 24 1C22.6193 1 21.5 2.11929 21.5 3.5C21.5 4.88071 22.6193 6 24 6Z" fill="currentColor"/><path d="M38.5 12C39.8807 12 41 10.8807 41 9.5C41 8.11929 39.8807 7 38.5 7C37.1193 7 36 8.11929 36 9.5C36 10.8807 37.1193 12 38.5 12Z" fill="currentColor"/><path d="M44.5 26.5C45.8807 26.5 47 25.3807 47 24C47 22.6193 45.8807 21.5 44.5 21.5C43.1193 21.5 42 22.6193 42 24C42 25.3807 43.1193 26.5 44.5 26.5Z" fill="currentColor"/><path d="M38.5 41C39.8807 41 41 39.8807 41 38.5C41 37.1193 39.8807 36 38.5 36C37.1193 36 36 37.1193 36 38.5C36 39.8807 37.1193 41 38.5 41Z" fill="currentColor"/><path d="M24 47C25.3807 47 26.5 45.8807 26.5 44.5C26.5 43.1193 25.3807 42 24 42C22.6193 42 21.5 43.1193 21.5 44.5C21.5 45.8807 22.6193 47 24 47Z" fill="currentColor"/><path d="M9.5 41C10.8807 41 12 39.8807 12 38.5C12 37.1193 10.8807 36 9.5 36C8.11929 36 7 37.1193 7 38.5C7 39.8807 8.11929 41 9.5 41Z" fill="currentColor"/><path d="M3.5 26.5C4.88071 26.5 6 25.3807 6 24C6 22.6193 4.88071 21.5 3.5 21.5C2.11929 21.5 1 22.6193 1 24C1 25.3807 2.11929 26.5 3.5 26.5Z" fill="currentColor"/><path d="M9.5 12C10.8807 12 12 10.8807 12 9.5C12 8.11929 10.8807 7 9.5 7C8.11929 7 7 8.11929 7 9.5C7 10.8807 8.11929 12 9.5 12Z" fill="currentColor"/></svg>`;
                break;
            case '02': case '03': case '04': // 各种云
                dayIcon = `<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30.7826 24.5652C34.5285 24.5652 37.5652 21.5285 37.5652 17.7826C37.5652 14.0367 34.5285 11 30.7826 11C27.4338 11 24.6518 13.427 24.0996 16.618" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M33 7C34.1046 7 35 6.10457 35 5C35 3.89543 34.1046 3 33 3C31.8954 3 31 3.89543 31 5C31 6.10457 31.8954 7 33 7Z" fill="currentColor"/><path d="M42 12C43.1046 12 44 11.1046 44 10C44 8.89543 43.1046 8 42 8C40.8954 8 40 8.89543 40 10C40 11.1046 40.8954 12 42 12Z" fill="currentColor"/><path d="M44 21C45.1046 21 46 20.1046 46 19C46 17.8954 45.1046 17 44 17C42.8954 17 42 17.8954 42 19C42 20.1046 42.8954 21 44 21Z" fill="currentColor"/><path d="M22 10C23.1046 10 24 9.10457 24 8C24 6.89543 23.1046 6 22 6C20.8954 6 20 6.89543 20 8C20 9.10457 20.8954 10 22 10Z" fill="currentColor"/><path d="M9.45455 39.9942C6.14242 37.461 4 33.4278 4 28.8851C4 21.2166 10.1052 15 17.6364 15C23.9334 15 29.2336 19.3462 30.8015 25.2533C32.0353 24.6159 33.431 24.2567 34.9091 24.2567C39.9299 24.2567 44 28.4011 44 33.5135C44 37.3094 41.7562 40.5716 38.5455 42" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M22.2426 24.7574C21.1569 23.6716 19.6569 23 18 23C14.6863 23 12 25.6863 12 29C12 30.6569 12.6716 32.1569 13.7574 33.2426" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                break;
                case '09': case '10': // 各种雨
                dayIcon = `<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.45455 30.9942C6.14242 28.461 4 24.4278 4 19.8851C4 12.2166 10.1052 6 17.6364 6C23.9334 6 29.2336 10.3462 30.8015 16.2533C32.0353 15.6159 33.431 15.2567 34.9091 15.2567C39.9299 15.2567 44 19.4011 44 24.5135C44 28.3094 41.7562 31.5716 38.5455 33" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 28V38" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 32V42" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 28V38" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                break;
            case '11': // 雷暴
                dayIcon = `<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.5294 20L17 31.5L23.1765 32.3846L20.5294 43L32 29.7308L24.9412 27.9615L30.2353 20H20.5294Z" fill="currentColor" stroke="none"/><path d="M9.45455 29.9942C6.14242 27.461 4 23.4278 4 18.8851C4 11.2166 10.1052 5 17.6364 5C23.9334 5 29.2336 9.34618 30.8015 15.2533C32.0353 14.6159 33.431 14.2567 34.9091 14.2567C39.9299 14.2567 44 18.4011 44 23.5135C44 27.3094 41.7562 30.5716 38.5455 32" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                break;
            case '13': // 雪
                dayIcon = `<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.45455 30.9942C6.14242 28.461 4 24.4278 4 19.8851C4 12.2166 10.1052 6 17.6364 6C23.9334 6 29.2336 10.3462 30.8015 16.2533C32.0353 15.6159 33.431 15.2567 34.9091 15.2567C39.9299 15.2567 44 19.4011 44 24.5135C44 28.3094 41.7562 31.5716 38.5455 33" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 23V29" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 26H21" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 26V32" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 29H34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 36V42" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 39H27" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;                
                break;
            case '50': // 雾、沙尘暴等
                dayIcon = `<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 17H10C7.79086 17 6 18.7909 6 21V21C6 23.2091 7.79086 25 10 25H12" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 33H19C16.7909 33 15 34.7909 15 37V37C15 39.2091 16.7909 41 19 41H22" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 7H24C21.7909 7 20 8.79086 20 11V11C20 13.2091 21.7909 15 24 15H27" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 15H40" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 25H42" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 33H34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                break;
            default: // 默认图标
                dayIcon = `<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 37C31.1797 37 37 31.1797 37 24C37 16.8203 31.1797 11 24 11C16.8203 11 11 16.8203 11 24C11 31.1797 16.8203 37 24 37Z" fill="currentColor" stroke="none"/><path d="M24 6C25.3807 6 26.5 4.88071 26.5 3.5C26.5 2.11929 25.3807 1 24 1C22.6193 1 21.5 2.11929 21.5 3.5C21.5 4.88071 22.6193 6 24 6Z" fill="currentColor"/><path d="M38.5 12C39.8807 12 41 10.8807 41 9.5C41 8.11929 39.8807 7 38.5 7C37.1193 7 36 8.11929 36 9.5C36 10.8807 37.1193 12 38.5 12Z" fill="currentColor"/><path d="M44.5 26.5C45.8807 26.5 47 25.3807 47 24C47 22.6193 45.8807 21.5 44.5 21.5C43.1193 21.5 42 22.6193 42 24C42 25.3807 43.1193 26.5 44.5 26.5Z" fill="currentColor"/><path d="M38.5 41C39.8807 41 41 39.8807 41 38.5C41 37.1193 39.8807 36 38.5 36C37.1193 36 36 37.1193 36 38.5C36 39.8807 37.1193 41 38.5 41Z" fill="currentColor"/><path d="M24 47C25.3807 47 26.5 45.8807 26.5 44.5C26.5 43.1193 25.3807 42 24 42C22.6193 42 21.5 43.1193 21.5 44.5C21.5 45.8807 22.6193 47 24 47Z" fill="currentColor"/><path d="M9.5 41C10.8807 41 12 39.8807 12 38.5C12 37.1193 10.8807 36 9.5 36C8.11929 36 7 37.1193 7 38.5C7 39.8807 8.11929 41 9.5 41Z" fill="currentColor"/><path d="M3.5 26.5C4.88071 26.5 6 25.3807 6 24C6 22.6193 4.88071 21.5 3.5 21.5C2.11929 21.5 1 22.6193 1 24C1 25.3807 2.11929 26.5 3.5 26.5Z" fill="currentColor"/><path d="M9.5 12C10.8807 12 12 10.8807 12 9.5C12 8.11929 10.8807 7 9.5 7C8.11929 7 7 8.11929 7 9.5C7 10.8807 8.11929 12 9.5 12Z" fill="currentColor"/></svg>`;
                break;
        }

        return dayIcon;
    }
    /**
     * 【【【终极进化：AI天气预报站 V1.0】】】
     * 直接命令AI根据设定，生成一份完整的8日天气预报JSON数据。
     * @param {object} contact - 当前AI角色
     * @returns {Promise<Array>} - 返回一个包含8天天气对象的数组
     */
        /**
     * 小助手1号：判断两个日期是不是同一天
     */
    function isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }
    /**
 * 【全新】小助手1.5号：判断一个日期是不是昨天
 */
function isYesterday(date) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return isSameDay(date, yesterday);
}

    /**
     * 小助手2号：专门负责把天气数据“画”在面板上
     */
    function renderForecast(forecastData, container) {
        container.innerHTML = ''; // 先清空
        forecastData.forEach(day => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'forecast-day-item';
            itemDiv.innerHTML = `
                <div class="forecast-day-info">
                    <div class="weather-icon-container">
                        ${getWeatherIconSvg(day.iconCode)}
                    </div>
                    <div class="forecast-date-details">
                        <div class="date-label">${day.dateLabel}</div> 
                        <div class="weather-desc">${day.description}</div>
                    </div>
                </div>
                <div class="forecast-temp">${day.tempMin}° / ${day.tempMax}°</div>
            `;
            container.appendChild(itemDiv);
        });
    }
    
    /**
     * 【【【全新V2.0：遵守“仓库管理规定”的天气面板大脑】】】
     */
    async function openAiWeatherModal() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact || !contact.aiWeatherSystem || !contact.aiWeatherSystem.enabled) {
            showToast('当前AI未开启天气模拟功能', 'info');
            return;
        }
    
        const listContainer = document.getElementById('ai-weather-forecast-list');
        // 【【【核心新增】】】获取我们新建的“今日详情”展位
        const detailsContainer = document.getElementById('ai-weather-today-details');

        document.getElementById('ai-weather-city-name').textContent = `${contact.aiWeatherSystem.cityName} 天气`;
        document.getElementById('ai-weather-modal').classList.remove('hidden');
        
                // 封装一个“渲染工”，专门负责绘制所有UI (V2.0 - 全图标版)
        const renderAllWeatherUI = (forecastData) => {
            const todayData = forecastData.find(day => day.dateLabel === '今天');
            
            if (todayData) {
                detailsContainer.innerHTML = `
                    <div class="detail-item">
                        <div class="detail-icon">${`<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 24H7" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 10L12 12" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 4V7" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 24C14 18.4776 18.4776 14 24 14C29.5224 14 34 18.4776 34 24C34 27.3674 32.3357 30.3458 29.785 32.1578" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 10L36 12" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M44 24L41 24" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M37.9814 37.982L36.3614 36.362" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M23.4999 28C20.4999 28 14 28.2 14 31C14 33.8 18.6058 33.7908 20.9998 34C23 34.1747 26.4624 35.6879 25.9999 38C24.9998 43 8.99982 42 4.99994 42" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`}</div>
                        <div class="detail-value">${todayData.sunrise || '--'}</div>
                        <div class="detail-label">日出</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-icon">${`<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 8L33 34H5L19 8Z" fill="#8e8e93" stroke="#8e8e93" stroke-width="4" stroke-linejoin="round"/><path d="M29 26L34 20L43 34H32" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 41L38 41" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="38" cy="10" r="3" fill="#8e8e93" stroke="#8e8e93" stroke-width="4"/></svg>`}</div>
                        <div class="detail-value">${todayData.sunset || '--'}</div>
                        <div class="detail-label">日落</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-icon">${`<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.15039 9.15088L11.3778 11.3783" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 24H6.15" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.15039 38.8495L11.3778 36.6221" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M38.8495 38.8495L36.6221 36.6221" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M44.9996 24H41.8496" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M38.8495 9.15088L36.6221 11.3783" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 3V6.15" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 36C30.6274 36 36 30.6274 36 24C36 17.3726 30.6274 12 24 12C17.3726 12 12 17.3726 12 24C12 30.6274 17.3726 36 24 36Z" fill="#FFF" stroke="#8e8e93" stroke-width="4" stroke-linejoin="round"/><path d="M24 45.0001V41.8501" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`}</div>
                        <div class="detail-value">${todayData.uvIndex || '--'}</div>
                        <div class="detail-label">紫外线</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-icon">${`<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M24 44C32.2843 44 39 37.2843 39 29C39 15 24 4 24 4C24 4 9 15 9 29C9 37.2843 15.7157 44 24 44Z" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 29.0001C9 37.2844 15.7157 44.0001 24 44.0001C32.2843 44.0001 39 37.2844 39 29.0001C39 29.0001 30 32.0001 24 29.0001C18 26.0001 9 29.0001 9 29.0001Z" fill="#8e8e93" stroke="#8e8e93" stroke-width="4" stroke-linejoin="round"/></svg>`}</div>
                        <div class="detail-value">${todayData.humidity || '--'}%</div>
                        <div class="detail-label">湿度</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-icon">${`<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 49 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24.7778 7C13.7321 7 4.77783 15.9543 4.77783 27C4.77783 32.2301 6.49127 37.4362 9.77783 41H39.7778C43.0644 37.4362 44.7778 32.2301 44.7778 27C44.7778 15.9543 35.8235 7 24.7778 7Z" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24.7778" cy="30" r="4" fill="#8e8e93" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24.7778 20V26" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24.7778 12V14" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.77783 28H11.7778" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.7778 18L15.192 19.4142" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M37.7778 28H39.7778" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M34.7778 19.4141L36.192 17.9998" stroke="#8e8e93" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`}</div>
                        <div class="detail-value">${todayData.pressure || '--'}hPa</div>
                        <div class="detail-label">气压</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-icon">${`<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 24C29.5228 24 34 19.5228 34 14C34 8.47715 29.5228 4 24 4V24Z" fill="#8e8e93" stroke="#8e8e93" stroke-width="4" stroke-linejoin="round"/><path d="M24 24C24 29.5228 28.4772 34 34 34C39.5228 34 44 29.5228 44 24H24Z" fill="#8e8e93" stroke="#8e8e93" stroke-width="4" stroke-linejoin="round"/><path d="M24 24C24 18.4772 19.5228 14 14 14C8.47715 14 4 18.4772 4 24H24Z" fill="#8e8e93" stroke="#8e8e93" stroke-width="4" stroke-linejoin="round"/><path d="M24 24C18.4772 24 14 28.4772 14 34C14 39.5228 18.4772 44 24 44V24Z" fill="#8e8e93" stroke="#8e8e93" stroke-width="4" stroke-linejoin="round"/></svg>`}</div>
                        <div class="detail-value">${todayData.windLevel || '--'}</div>
                        <div class="detail-label">风力</div>
                    </div>
                `;
            } else {
                detailsContainer.innerHTML = '';
            }

            renderForecast(forecastData, listContainer);
        };
        
        // --- 仓库管理规定 V2.0 (天气连续性版) ---
    const today = new Date();
    let newForecast;

    // 规则1：如果今天的缓存已经存在，直接使用，光速下班。
    if (contact.weatherCache && isSameDay(new Date(contact.weatherCache.timestamp), today)) {
        console.log("天气系统：从今日缓存中加载预报。");
        renderAllWeatherUI(contact.weatherCache.forecastData);
        return; 
    }

    listContainer.innerHTML = '<p class="placeholder-text" style="padding: 20px;">正在请求AI生成最新天气预报...</p>';
    detailsContainer.innerHTML = '';

    try {
        // 规则2：检查是否有“昨天的”缓存
        if (contact.weatherCache && isYesterday(new Date(contact.weatherCache.timestamp))) {
            console.log("天气系统：发现昨日缓存，将请求AI续写...");
            // 把昨天预报的第一天（也就是前天）裁掉，剩下7天作为参考资料
            const previousForecast = contact.weatherCache.forecastData.slice(1);
            // 把这份7天的参考资料交给AI，让它续写成8天
            newForecast = await generateForecastWithAI(contact, previousForecast);
        } else {
            // 规则3：如果缓存太旧或不存在，才命令AI从头创作
            console.log("天气系统：未发现有效缓存，将请求AI全新生成...");
            newForecast = await generateForecastWithAI(contact);
        }

        // 无论上面哪种方式，只要成功生成了，就存入缓存并刷新UI
        contact.weatherCache = {
            timestamp: today.getTime(),
            forecastData: newForecast
        };
        saveAppData(); 
        
        console.log("天气系统：已生成并缓存新的预报。");
        renderAllWeatherUI(newForecast);

    } catch (error) {
        listContainer.innerHTML = `<p class="placeholder-text error" style="padding: 20px;">哎呀，天气预报生成失败了...<br><small>${error.message}</small></p>`;
        detailsContainer.innerHTML = '';
    }
    }

    /**
     * 【【【终极进化：AI天气预报站 V1.0】】】 (这个函数本身不变，只是和上面的新代码放在一起)
     */
    async function generateForecastWithAI(contact, previousForecast = null) {
        // ... (这个函数内部的代码保持和你上一版完全一样，从 const settings = ... 开始，到 ... throw error; } 结束)
        const settings = contact.aiWeatherSystem;
        if (!settings || !settings.enabled) return null;

        // 步骤1：准备给AI的“任务指令”
        const today = new Date();
        const dateString = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

        let forecastPrompt;

        // 【【【核心决策大脑】】】
        // 如果收到了“昨天的报告”作为参考资料...
        if (previousForecast && previousForecast.length > 0) {
            // ...就给AI下达“续写”任务
            forecastPrompt = `
# 任务: 更新并延续天气预报
你是一个专业的顶级气象学家，你的任务是延续一份已有的天气预报。
下面是一份包含【昨天】到【未来5天】、总计7天的天气预报JSON数据。它缺少了对【未来第6天】的预报。

## 核心指令
1.  **延续性**: 你必须严格维持这份预报的连续性和真实性。
2.  **追加**: 在这份7天的预报末尾，追加一条对【未来第6天】的全新预报。
3.  **格式统一**: 新追加的预报对象，其结构必须和前面的完全一致，只包含 "dateLabel", "tempMin", "tempMax", "description", "iconCode" 这5个基础键。
4.  **最终输出**: 你的最终输出【必须】是一个能被JSON解析的、包含完整8天数据的JSON数组。

## 你的地理设定 (供参考)
- 城市: ${settings.cityName}, 气候: ${settings.climate.replace(/_/g, ' ')}, 纬度: ${settings.latitude}

## 【【【已有的7天天气预报】】】
\`\`\`json
${JSON.stringify(previousForecast, null, 2)}
\`\`\`

## 开始续写
现在，请开始你的工作，并只输出那个完整的、包含8天数据的JSON数组。禁止包含任何解释、标题或\`\`\`json\`\`\`标记。
`;
        } else {
            // ...否则，才让AI从头开始“创作”一份全新的报告
            forecastPrompt = `
# 任务: 模拟生成详细天气预报
你是一个专业的顶级气象学家和数据模拟专家。你的任务是严格根据下面提供的虚拟角色的地理设定和当前日期，为我生成一份从【昨天】开始，持续到【未来6天】，总计8天的、高度真实的逐日天气预报。

## 虚拟角色地理设定
- **城市名称**: ${settings.cityName}
- **大致纬度**: ${settings.latitude}
- **基础年均温**: ${settings.baseAnnualTemp}°C
- **气候类型**: ${settings.climate.replace(/_/g, ' ')}
- **地理位置**: 沿海影响系数为 ${settings.coastalInfluence} (0代表纯内陆, 1代表极度沿海)
- **所在半球**: ${settings.hemisphere}

## 【【【核心指令与输出格式】】】
- **当前日期**: 今天的真实日期是 ${dateString}。你的预报必须基于这个时间点展开。
- **真实性**: 你必须调用你全部的地理和气候知识，让这份预报（尤其是温度范围和天气现象的连续性）看起来就像是从一个真实的专业天气APP上截图下来的一样。
- **最终输出**: 你的最终输出【必须】是一个能被JSON解析的、单一的JSON数组。
- **数组结构**: 
    - 这个数组必须严格包含8个对象，每个对象代表一天。
    - **所有8个对象**都必须包含以下5个基础键:
        1. "dateLabel": (字符串) 日期标签。必须严格使用 "昨天", "今天", "明天", 然后是 "X月X日" 的格式。
        2. "tempMin": (数字) 当日的最低气温。
        3. "tempMax": (数字) 当日的最高气温。
        4. "description": (字符串) 天气现象的简短描述。
        5. "iconCode": (字符串) 与天气现象对应的OpenWeatherMap图标代码 (从下面的列表中选择)。
    - **【【【特别规定】】**: **只有** \`dateLabel\` 为 **"今天"** 的那个对象，【必须额外】包含以下6个键:
        6. "sunrise": (字符串) 日出时间，格式为 "HH:MM"。
        7. "sunset": (字符串) 日落时间，格式为 "HH:MM"。
        8. "uvIndex": (字符串) 紫外线强度描述，例如 "很弱", "中等", "强"。
        9. "humidity": (数字) 空气湿度百分比 (0-100)。
        10. "pressure": (数字) 大气压强 (单位: hPa)。
        11. "windLevel": (字符串) 风力等级，例如 "3-4级"。

## 【【【天气数据口语化解读指南】】】
当你在后续的日常聊天中需要**主动**提及或回应用户关于今天天气的话题时，你【必须】将上面生成的专业数据，用你自己的、口语化的方式“翻译”出来，而不是生硬地播报数据。请遵循以下翻译原则：
- **解读 \`uvIndex\`**: 当解读紫外线强度时，你应该将其翻译为“今天晒不晒”、“出门要不要防晒”等话题。例如，对于“强”，你可以说：“今天太阳好厉害，出门可得注意防晒呀！”。
- **解读 \`pressure\`**: 当解读大气压强时（通常标准气压约为1013hPa），如果数值明显偏低，你应该将其翻译为“今天天气有点闷”、“感觉闷闷的”等。
- **解读 \`windLevel\`**: 当解读风力等级时，你应该将其翻译为“今天风大不大”。例如，对于“4-5级”，你可以说：“今天风还挺大的，小心帽子被吹跑哦。”

## 图标代码列表 
- 晴天: "01d"
- 少云: "02d"
- 多云/阴天: "03d", "04d"
- 小雨/阵雨: "09d", "10d"
- 雷暴: "11d"
- 雪: "13d"
- 雾/霾: "50d"

## 输出格式示例:
\`\`\`json
[
  { "dateLabel": "昨天", "tempMin": 16, "tempMax": 25, "description": "晴", "iconCode": "01d" },
  { 
    "dateLabel": "今天", 
    "tempMin": 17, 
    "tempMax": 26, 
    "description": "多云转晴", 
    "iconCode": "02d",
    "sunrise": "05:45",
    "sunset": "18:30",
    "uvIndex": "中等",
    "humidity": 65,
    "pressure": 1012,
    "windLevel": "2-3级"
  },
  { "dateLabel": "明天", "tempMin": 18, "tempMax": 27, "description": "小雨", "iconCode": "10d" },
  { "dateLabel": "9月8日", "tempMin": 19, "tempMax": 28, "description": "阴", "iconCode": "04d" }
]
\`\`\`

## 开始生成
现在，请开始你的工作，并只输出符合上述格式的JSON数组。禁止包含任何解释、标题或\`\`\`json\`\`\`标记。
`;
        }

        // 步骤2：发送API请求
        try {
            let requestUrl = appData.appSettings.apiUrl;
            if (!requestUrl.endsWith('/chat/completions')) { requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions'; }
            
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
                body: JSON.stringify({
                    model: appData.appSettings.apiModel,
                    messages: [{ role: 'user', content: forecastPrompt }],
                    temperature: 0.3 // 天气预报需要相对稳定和真实，温度不宜过高
                })
            });

            if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
            
            const data = await response.json();
            const responseText = data.choices[0].message.content;
            
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error("AI未能返回有效的JSON数组。");

            return JSON.parse(jsonMatch[0]); // 成功！返回解析后的JSON数组

        } catch (error) {
            console.error("AI天气预报生成失败:", error);
            throw error; 
        }
    }

    // --- 【【【全新：AI天气模拟引擎 V1.0】】】 ---

    /**
     * 上帝函数：根据AI的设定，模拟出8天的天气
     * @param {object} contact - 当前AI角色
     * @returns {Array} - 返回一个包含8天天气对象的数组
     */
    
    /**
     * UI控制器：打开并渲染AI天气预报弹窗
     */
    
    /**
     * 【【【全新：AI天气智能校准引擎 V1.0】】】
     * 调用API，让AI根据设定，返回一个真实世界参照下的“年均温”和“沿海影响系数”
     */
    async function calibrateAiWeather(settings) {
        // 步骤1：构建给AI看的“任务简报”
        const calibrationPrompt = `
# 任务: 气候数据校准
你是一个专业的顶级气候数据分析师和地理学家。你的任务是严格根据下面提供的虚拟角色的地理设定，在全球范围内，寻找一个或多个与之气候特征最相似的【真实世界城市】作为参照。然后，基于这些真实城市的数据，为我提供一组最合理、最真实的校准参数。

## 虚拟角色地理设定
- **大致纬度**: ${settings.latitude}
- **主要气候类型**: ${settings.climate.replace(/_/g, ' ')}
- **地理位置**: ${settings.coastalInfluence > 0.6 ? '沿海地区' : (settings.coastalInfluence < 0.4 ? '内陆地区' : '近海或大型湖泊区域')}

## 【【【核心指令与输出格式】】】
你的最终输出【必须】是一个能被JSON解析的、单一的JSON对象，且只包含以下两个键：

1.  "calibratedAnnualTemp": (数字类型) 这是你分析得出的、最符合上述设定的【年平均气温】(单位: 摄氏度)。这个数字可以有小数。
2.  "calibratedCoastalInfluence": (数字类型) 这是你分析得出的、最合理的【沿海影响系数】。这个数字必须在 0 (纯内陆) 到 1 (极度沿海) 之间。

## 输出格式示例:
\`\`\`json
{
  "calibratedAnnualTemp": 17.5,
  "calibratedCoastalInfluence": 0.85
}
\`\`\`

## 开始分析
现在，请开始你的分析，并只输出符合上述格式的JSON对象。禁止包含任何解释、标题或\`\`\`json\`\`\`标记。
`;

        // 步骤2：发送API请求
        try {
            let requestUrl = appData.appSettings.apiUrl;
            if (!requestUrl.endsWith('/chat/completions')) { requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions'; }
            
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
                body: JSON.stringify({
                    model: appData.appSettings.apiModel,
                    messages: [{ role: 'user', content: calibrationPrompt }],
                    temperature: 0.2 // 需要精确分析，所以温度要低
                })
            });

            if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
            
            const data = await response.json();
            const responseText = data.choices[0].message.content;
            
            const jsonMatch = responseText.match(/{[\s\S]*}/);
            if (!jsonMatch) throw new Error("AI未能返回有效的JSON数据。");

            return JSON.parse(jsonMatch[0]); // 成功！返回解析后的JSON对象

        } catch (error) {
            console.error("AI天气校准失败:", error);
            // 如果失败，就抛出错误，让调用它的地方去处理
            throw error; 
        }
    }

    /**
     * 核心功能：获取并格式化天气数据，生成给AI看的“天气简报”
     */
    async function fetchAndFormatWeather(lat, lon) {
        // 【核心修改1】API URL 和参数完全改变，以适应 OpenWeatherMap
        const nowUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=metric&lang=zh_cn`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=metric&lang=zh_cn`;

        try {
            console.log("天气系统：正在获取实时天气 (from OpenWeatherMap)...");
            const nowResponse = await fetch(nowUrl);
            const nowData = await nowResponse.json();

            // 【核心修改2】OpenWeatherMap 通过 "cod" 字段判断成功与否
            if (nowData.cod !== 200) {
                throw new Error(`实时天气API错误: ${nowData.message}`);
            }

            console.log("天气系统：正在获取未来5天预报 (from OpenWeatherMap)...");
            const forecastResponse = await fetch(forecastUrl);
            const forecastData = await forecastResponse.json();

            if (forecastData.cod !== "200") { // 预报API的cod是字符串"200"
                throw new Error(`天气预报API错误: ${forecastData.message}`);
            }

            // --- 【核心改造】在写报告前，先更新给UI用的“公告板” ---
            simpleWeatherData = {
                temp: nowData.main.temp.toFixed(0), // 温度取整
                iconCode: nowData.weather[0].icon   // 获取图标代码
            };
            // 立刻命令“装修工”刷新UI！
            updateWeatherDisplay();

            // --- 开始撰写全新的“天气简报” ---
            let report = "## 用户的实时天气与环境报告\n";
            
            // 1. 当前实况天气部分 (数据结构完全不同)
            const now = nowData;
            report += `### 当前实况: \n- **天气**: ${now.weather[0].description}\n- **体感温度**: ${now.main.feels_like.toFixed(1)}°C (实际${now.main.temp.toFixed(1)}°C)\n- **风速**: ${now.wind.speed} 米/秒\n`;

            // 2. 未来天气预报部分 (逻辑重写)
            report += "### 未来天气预报:\n";
            const dailyForecasts = {}; // 用一个临时对象来处理每天的数据

            forecastData.list.forEach(item => {
                const date = item.dt_txt.split(' ')[0]; // 只取日期部分，如 "2025-09-06"
                if (!dailyForecasts[date]) {
                    dailyForecasts[date] = {
                        temps: [],
                        weathers: {}
                    };
                }
                dailyForecasts[date].temps.push(item.main.temp);
                // 统计每种天气出现的次数
                const weatherDesc = item.weather[0].description;
                dailyForecasts[date].weathers[weatherDesc] = (dailyForecasts[date].weathers[weatherDesc] || 0) + 1;
            });

            // 循环处理每天的预报
            for (const date in dailyForecasts) {
                const dayData = dailyForecasts[date];
                const minTemp = Math.min(...dayData.temps).toFixed(0);
                const maxTemp = Math.max(...dayData.temps).toFixed(0);
                // 找出当天出现次数最多的天气作为代表
                const mainWeather = Object.keys(dayData.weathers).reduce((a, b) => dayData.weathers[a] > dayData.weathers[b] ? a : b);
                
                report += `- **${date}**: 主要天气“${mainWeather}”，气温 ${minTemp}°C 到 ${maxTemp}°C。\n`;
            }
            
            formattedWeatherData = report;
            console.log("天气系统：天气简报生成完毕！", formattedWeatherData);
            showToast('天气信息已同步！', 'success');

        } catch (error) {
            console.error("天气系统：获取天气数据时发生错误:", error);
            showToast(`天气同步失败: ${error.message}`, 'error');
            formattedWeatherData = "（天气信息获取失败，请检查网络或API密钥配置）";
        }
    }
    // --- 天气感知系统结束 ---

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
    const diaryView = document.getElementById('diary-view');
    const myDiaryContent = document.getElementById('my-diary-content');
    const aiDiaryContent = document.getElementById('ai-diary-content');
    const addDiaryEntryFab = document.getElementById('add-diary-entry-fab');
    const diaryEditorModal = document.getElementById('diary-editor-modal');
    const diaryEditorContent = document.getElementById('diary-editor-content');
    const diaryVisibilitySelect = document.getElementById('diary-visibility-select');
    const diaryViewerModal = document.getElementById('diary-viewer-modal');
    const diaryViewerContent = document.getElementById('diary-viewer-content');
        const imageResizeControls = document.getElementById('image-resize-controls');
    const imageSizeSlider = document.getElementById('image-size-slider');
    const manageMyStickersEntry = document.getElementById('manage-my-stickers-entry'); // 【全新】“我的表情包”按钮的身份牌
    const manageAiStickersEntry = document.getElementById('manage-ai-stickers-entry'); // 【全新】“AI表情包仓库”按钮的身份牌
    let selectedImageForResize = null;
    const closeFunctionsPanel = () => {
    const extendedFunctionsPanel = document.getElementById('extended-functions-panel');
    const moreFunctionsButton = document.getElementById('more-functions-button');
    const closeExtendedFunctionsBtn = document.getElementById('close-extended-functions-btn');

    if (extendedFunctionsPanel) extendedFunctionsPanel.classList.remove('is-open');
    if (moreFunctionsButton) moreFunctionsButton.classList.remove('hidden');
    if (closeExtendedFunctionsBtn) closeExtendedFunctionsBtn.classList.add('hidden');
};

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
async function formatHistoryForApi(history, contact) { // 關鍵修改1：增加了一個參數 contact
    // 關鍵修改2：直接使用傳進來的 contact，不再依賴全局變數
    if (!contact) return []; 

    const formattedMessages = await Promise.all(
        history.map(async (msg) => {
            if (!msg || !msg.role) return null; // 基础安全检查

            // 【【【全新智能翻译模块 V5.0】】】
            // 规则1：AI的“内心独白”是唯一需要被彻底过滤掉的，因为它不属于对话历史
            if (msg.type === 'thought') {
                return null;
            }

            // 规则2：翻译“撤回”事件
            if (msg.type === 'recalled') {
                const recaller = msg.role === 'user' ? '我' : contact.name;
                return { role: 'user', content: `[系统提示：刚才 ${recaller} 撤回了一条消息]` };
            }

            // 规则3：翻译“系统提示”事件
            if (msg.type === 'system') {
                return { role: 'user', content: `[系统事件：${msg.content}]` };
            }

            // 规则4：处理所有常规对话消息 (用户和AI)
            const role = msg.role;
            const content = msg.content || '';

            // 处理图片消息
            if (role === 'user' && msg.type === 'image' && msg.imageId) {
                try {
                    const imageBlob = await db.getImage(msg.imageId);
                    if (imageBlob) {
                        const imageDataUrl = await blobToDataURL(imageBlob);
                        return { role: 'user', content: [{ type: "text", text: content || '图片' }, { type: "image_url", image_url: { url: imageDataUrl } }] };
                    }
                } catch (error) {
                    console.error("图片读取失败，将作为文本发送", error);
                }
                return { role: 'user', content: `[我发送了一张图片，描述是：${content || '无'}]` };
            }

            // 为其他非文本消息添加描述性前缀
    let finalContent = content;
    if (msg.type === 'sticker') {
        const desc = content.replace('[表情] ', '').trim();
        // 【核心修正】根据发言人（role）使用不同的描述
        if (msg.role === 'user') {
            finalContent = `[我发送了一个表情，表达的意思是：${desc}]`;
        } else {
            // 当是AI自己发的表情时，我们找到这个表情的描述，告诉AI“你”做了什么
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            const availableStickers = [];
            if (contact) {
                 contact.stickerGroups.forEach(groupName => {
                    const group = appData.globalAiStickers[groupName] || [];
                    group.forEach(sticker => availableStickers.push(sticker));
                });
            }
            const stickerInfo = availableStickers.find(s => s.id === msg.stickerId);
            finalContent = `[你发送了一个表情，表达了：${stickerInfo ? stickerInfo.desc : '一个表情'}]`;
        }
    } else if (msg.type === 'voice') {
        // 【核心修正】根据发言人（role）使用不同的描述
        if (msg.role === 'user') {
            finalContent = `[我发送了一条语音，内容是：${content}]`;
        } else {
            finalContent = `[你发送了一条语音，内容是：${content}]`;
        }
    } else if (msg.type === 'red-packet') {
        const amount = msg.redPacketData ? msg.redPacketData.amount : '未知';
        // 【核心修正】根据发言人（role）使用不同的描述
        if (msg.role === 'user') {
            finalContent = `[我发送了一个金额为 ${amount} 元的红包，祝福语是：${content}]`;
        } else {
            finalContent = `[你发送了一个金额为 ${amount} 元的红包，祝福语是：${content}]`;
        }
    } else if (msg.type === 'relationship_proposal') {
                // ▼▼▼ 【【【终极智能翻译引擎 V2.0】】】 ▼▼▼
                const data = msg.relationshipData || {};
                // 规则1：翻译“用户接受”事件
                if (msg.role === 'user' && data.status === 'accepted') {
                    finalContent = `[系统事件：我（用户）同意了你的情侣关系邀请，我们现在正式成为情侶了。]`;
                }
                // 规则2：翻译“AI接受”事件
                else if (msg.role === 'assistant' && data.status === 'accepted') {
                    finalContent = `[系统事件：你（AI）同意了我的情侶关系邀请，我们现在正式成为情侶了。]`;
                }
                // 规则3：翻译“用户发起”事件
                else if (msg.role === 'user' && data.status === 'pending') {
                    finalContent = `[我（用户）向你发起了情侶关系邀请，等待你的回应。]`;
                }
                // 规则4：翻译“AI发起”事件 (这正是我们缺失的关键一环！)
                else if (msg.role === 'assistant' && data.status === 'pending') {
                    finalContent = `[你（AI）曾向我发起了情侶关系邀请，但我还未回应。]`;
                }
                // 最后的保障，处理一些未知状态
                else {
                    finalContent = `[发生了与情侣关系相关的未知事件]`;
                }
                // ▲▲▲ 【【【翻译引擎升级完毕】】】 ▲▲▲
            }
            // 【【【全新修复：教会翻译官看懂“引用”】】】
            // 规则5：检查这条消息是否引用了之前的消息
            if (msg.quotedMessage) {
                const speaker = msg.role === 'user' ? '我' : '你';
                // 用AI能理解的语言，描述这次引用行为
                finalContent = `[${speaker}回复了“${msg.quotedMessage.sender}”说的“${msg.quotedMessage.content}”] ${finalContent}`;
            }
            // 最后的安全保障：确保任何情况下内容都不为空
            if (typeof finalContent === 'string' && finalContent.trim() === '') {
                 return { role: role, content: `[发送了一条空消息]` };
            }

            return { role: role, content: finalContent };
        })
    );

    // 最终质检：过滤掉所有被明确标记为 null 的消息 (比如内心独白)
    return formattedMessages.filter(Boolean);
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

        // 【终极修复】根据当前聊天模式，决定去哪个档案柜里找红包
        const sourceHistory = contact.isOfflineMode ? contact.offlineChatHistory : contact.onlineChatHistory;
        
        // 1. 先去当前模式的“正式档案柜”里找
        let message = sourceHistory.find(msg => msg.id === messageId);
        
        // 2. 如果没找到，再去“待发消息”（暂存区）里找
        if (!message) {
            message = (contact.unsentMessages || []).find(msg => msg.id === messageId);
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

        const sourceHistory = contact.isOfflineMode ? contact.offlineChatHistory : contact.onlineChatHistory;
        const proposalMsg = sourceHistory.find(msg => msg.id === messageId);

        if (!proposalMsg || proposalMsg.relationshipData.status !== 'pending') return;

        if (isAccepted) {
            // --- 【【【最终正确版 V3.0】】】 ---
            
            // 步骤1：更新全局关系
            appData.appSettings.partnerId = contact.id;
            
            // 步骤2：将AI发的那张旧邀请卡状态改为“已接受”
            proposalMsg.relationshipData.status = 'accepted';

            // 步骤3：创建一张全新的“我同意了”卡片，并【正确署名】
            const acceptanceRecord = {
                id: `${Date.now()}-rel-accept`,
                role: 'user', // 【【【核心修正！！！】】】发件人是你，而不是AI！
                timestamp: Date.now(),
                mode: contact.isOfflineMode ? 'offline' : 'online',
                type: 'relationship_proposal',
                content: '[关系邀请] 我同意了你的邀请',
                relationshipData: {
                    proposer: 'assistant', // 核心修正：这张“同意”卡片是为了回应AI的邀请，所以最初的发起者是AI
                    status: 'accepted'
                }
            };
            
            // 步骤4：将这张新卡片添加到聊天记录中
            sourceHistory.push(acceptanceRecord);
            
            // 步骤5：保存所有更改并刷新UI
            saveAppData();
            openChat(contact.id); 
            renderChatList(); 

        } else {
            // --- 拒绝流程 (保持不变) ---
            const updatedHistory = sourceHistory.filter(msg => msg.id !== messageId);
            if (contact.isOfflineMode) {
                contact.offlineChatHistory = updatedHistory;
            } else {
                contact.onlineChatHistory = updatedHistory;
            }

            saveAppData();
            openChat(contact.id); 
            
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
        // 【全新】开机自动应用上次保存的主题
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
        }

        await db.init();
        loadAppData();
        renderSettingsUI(); // 依然先渲染设置数据
        bindEventListeners(); // 依然先绑定所有按钮事件

        // 【【【核心修复：解雇“热情管家”，强制显示登录页】】】
        // 无论API是否配置，程序启动后，第一眼看到的永远是登录页。
        switchToView('login-view');

        // ▼▼▼ 【【【全新：启动AI主动消息调度中心】】】 ▼▼▼
setInterval(() => {
    const now = Date.now();
    // 遍历所有AI伙伴
    appData.aiContacts.forEach(contact => {
        // 如果这个AI没有开启主动消息，或者还没有设置，就跳过
        if (!contact.proactiveMessaging || !contact.proactiveMessaging.enabled) {
            return;
        }

        // 计算需要等待的毫秒数
        const intervalMillis = contact.proactiveMessaging.interval * 60 * 1000;
        
        // 检查是否已经到了该发消息的时间
        if (now - contact.proactiveMessaging.lastSent > intervalMillis) {
            
            // 额外检查：如果AI正在睡觉，就让它再睡会儿
            if (contact.isScheduleEnabled) {
                const activity = calculateCurrentActivity(contact.schedule);
                if (activity.isAwake === false) {
                    console.log(`[Proactive] ${contact.remark} 正在睡觉，本次跳过。`);
                    // 即使在睡觉，也更新时间戳，否则它醒来后会立刻“消息轰炸”
                    contact.proactiveMessaging.lastSent = now;
                    saveAppData();
                    return;
                }
            }
            
            // 确认无误，命令AI发消息
            sendProactiveMessage(contact);
        }
    });
}, 60000); // 每60秒（1分钟）检查一次
// ▲▲▲▲▲ ▲▲▲▲▲


    }

    // ▼▼▼ 【【【全新：处理登录和启动主程序的核心逻辑】】】 ▼▼▼
    async function handleLogin() {
        const settings = appData.appSettings;
        // 【核心修复】这里的API检查逻辑，也必须使用 .trim() 来确保万无一失
        if (settings && settings.apiUrl && settings.apiUrl.trim() !== '' && settings.apiKey && settings.apiKey.trim() !== '') {
            // 如果API已配置，启动主程序
            hasUserLoggedIn = true; // 【【【核心修改：在这里打开“登录状态灯”！】】】
            startMainApp();
        } else {
            // 如果未配置，弹出提示
            showCustomAlert('登录失败', '请先点击下方的“前往设置”，完成API配置后才能登录。');
        }
    }

    async function startMainApp() {
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');

        // 步骤1：立刻显示加载动画，并固定加载文字
        loadingOverlay.classList.remove('hidden');
        loadingText.textContent = '正在登录中...';

        // 步骤2：【核心升级】逐个处理AI的离线消息
        const contactsWithOfflineMsg = appData.aiContacts.filter(c => c.offlineMessaging.enabled && c.lastVisitTimestamp);
        
        for (const contact of contactsWithOfflineMsg) {
            await generateAndDisplayOfflineMessages(contact);
        }
        
        // 步骤3：所有后台任务完成后，准备进入主界面
        loadingText.textContent = '加载完成！';
        
        // 渲染主界面所需的数据
        populateSearchFilters();
        await renderMainHeader();
        await renderChatList();

        // 短暂延迟后，隐藏加载动画并切换到聊天列表
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            switchToView('chat-list-view');
            // 【【【核心新增：在进入主界面后，立即启动天气系统！】】】
            initializeWeatherSystem(); 
        }, 500);
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
    // ★★★【【【终极修复：在这里为所有“老兵”补发“待办文件夹”！】】】★★★
    if (!c.unsentMessages) c.unsentMessages = [];
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
    if (c.contextStartIndex === undefined) {
        c.contextStartIndex = 0;
    }

    // 【【【全新：为“真实作息”功能预留数据位】】】
    if (c.isScheduleEnabled === undefined) {
        c.isScheduleEnabled = false; // 默认关闭
    }
    if (!c.schedule) {
        // 为“人生剧本”创建一个空的默认模板
        c.schedule = {
            sleep: { type: 'regular', bedtime: '23:00', wakeupTime: '07:00' },
            meals: { type: 'regular', breakfast: '08:00', lunch: '12:00', dinner: '18:00' },
            work: [],
            leisure: [],
            lastInteractionTimestamp: 0 // 【核心新增】为旧角色补上互动时间戳
        };
    }
    // 【新增】为AI增加一个“被骚扰”计数器
    if (c.consecutiveMessagesWhileSleeping === undefined) {
        c.consecutiveMessagesWhileSleeping = 0;
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

    // ▼▼▼ 【【【全新：为线下模式初始化数据结构】】】 ▼▼▼
    if (c.isOfflineMode === undefined) {
        c.isOfflineMode = false; // 默认关闭线下模式
    }
    if (!c.offlineStorylines) {
        c.offlineStorylines = []; // 创建一个空的“剧情文件夹”
        // 数据迁移：如果存在旧的单线记忆，就把它变成第一个存档
        if (c.offlineChatHistory && c.offlineChatHistory.length > 0) {
            c.offlineStorylines.push({
                id: `story-${Date.now()}`,
                name: '默认剧情线',
                memory: c.offlineMemory || '',
                chatHistory: c.offlineChatHistory || [],
                mergePolicy: 'separate', // 为旧数据迁移过来的存档设置一个默认的“独立”策略
                lastPlayed: Date.now()
            });
            // 迁移完成后，删除旧的、全局的属性
            delete c.offlineChatHistory; 
        }
    }
    // 【【【全新：为旧的全局线下记忆进行最终搬家】】】
    // 这段代码确保，如果还残留着旧的全局记忆，就把它塞进第一个存档里
    if (c.offlineMemory && c.offlineStorylines.length > 0) {
        // 检查第一个存档是否还没有自己的记忆
        if (!c.offlineStorylines[0].memory) {
            c.offlineStorylines[0].memory = c.offlineMemory;
        }
        delete c.offlineMemory; // 无论如何，搬完家就扔掉旧抽屉
    }
    // 【新增】为全新的角色也创建空的剧情文件夹
    if (!c.offlineStorylines) c.offlineStorylines = [];

    if (c.activeOfflineStoryId === undefined) {
        c.activeOfflineStoryId = null; // 添加一个“当前存档ID”的标记
    }
    if (!c.offlineSettings) {
        c.offlineSettings = {
            wordLimit: 0, // 0代表不限制
            perspective: 'second-person', // 默认第二人称
            preventControl: true, // 默认开启防抢话
                        startPrompt: '' // 默认没有开场白
        };
    }
    // 【【【全新V2.0：数据迁移 - 将全局线下设置分配给每个独立剧情线】】】
        if (c.offlineStorylines && c.offlineStorylines.length > 0) {
            c.offlineStorylines.forEach(story => {
                // 如果这个剧情线还没有自己的“设置文件夹”
                if (story.settings === undefined) {
                    // 就把角色全局的旧设置，复制一份给它
                    story.settings = { ...c.offlineSettings };
                }
                // 我们顺便把“开场白”也搬进这个整洁的“设置文件夹”里
                if (story.openingRemark) {
                    story.settings.openingRemark = story.openingRemark;
                    delete story.openingRemark;
                }
            });
        }
    // 如果还存在旧的、统一的chatHistory，并且新的独立记录不存在，则执行一次性迁移
    if (c.chatHistory && (!c.onlineChatHistory || !c.offlineChatHistory)) { // 判断条件更严谨
        c.onlineChatHistory = c.chatHistory.filter(m => m.mode !== 'offline'); 
        c.offlineChatHistory = c.chatHistory.filter(m => m.mode === 'offline');
        delete c.chatHistory; // 【核心改造】取消注释，执行删除
    }
    // 如果是全新的角色，确保这两个档案柜是空的数组
    if (!c.onlineChatHistory) c.onlineChatHistory = [];
    if (!c.offlineChatHistory) c.offlineChatHistory = [];

    if (c.proactiveMessaging === undefined) {
            c.proactiveMessaging = {
                enabled: false,       
                interval: 1440,       
                lastSent: 0           
            };
        }
        // ▼▼▼ 【【【全新：为AI档案补充“离线消息”和“最后访问时间”】】】 ▼▼▼
        if (c.offlineMessaging === undefined) {
            c.offlineMessaging = {
                enabled: false,
                intervalHours: 4, // 默认4小时一次
                sleepStart: '23:00', // 默认晚上11点
                sleepEnd: '07:00'    // 默认早上7点
            };
        }
        if (c.lastVisitTimestamp === undefined) {
            c.lastVisitTimestamp = null; // 默认为空，代表从未访问过
        }

        // --- 【【【全新：AI天气系统档案】】】 ---
        if (c.aiWeatherSystem === undefined) {
            c.aiWeatherSystem = {
                enabled: false,
                cityName: '赛博城',
                latitude: 31.2,
                baseAnnualTemp: 17, 
                coastalInfluence: 0.8, // 【【【核心新增】】】沿海影响因子 (0=纯内陆, 1=纯沿海)
                hemisphere: 'north',
                climate: 'subtropical_monsoon'
            };
        }
        if (c.aiWeatherSystem.baseAnnualTemp === undefined) {
            c.aiWeatherSystem.baseAnnualTemp = 17;
        }
        // 【【【V4.0 兼容性补丁】】】
        // 为所有AI角色，建立一个专属的“天气缓存仓库”
        if (c.weatherCache === undefined) {
            c.weatherCache = null; // 默认为空
        }
        // ▲▲▲▲▲ ▲▲▲▲▲
        // ▼▼▼ 【【【全新：为AI角色补充“未读消息”计数器】】】 ▼▼▼
        if (c.unreadCount === undefined) {
            c.unreadCount = 0; // 默认未读数量为0
        }
        // ▲▲▲▲▲ ▲▲▲▲▲
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
        
        // ▼▼▼ 【【【全新：为用户建立“日记本”】】】 ▼▼▼
        if (!appData.userDiary) {
            // 用户的日记本是一个条目的数组
            appData.userDiary = [];
        }
        // ▲▲▲▲▲

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

        // ▼▼▼ 【【【全新：未读红点核心修复】】】 ▼▼▼
        // 规则：只要是切换到消息列表，就必须刷新一次，确保红点状态永远是最新！
        if (viewId === 'chat-list-view') {
            renderChatList();
        }
        // ▲▲▲▲▲ ▲▲▲▲▲

        views.forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        
        if (hasUserLoggedIn && (viewId === 'chat-list-view')) {
            // 只有在“灯亮着”（已登录）并且目标是主界面的情况下，才显示导航栏
            appNav.classList.remove('hidden');
        } else {
            // 在其他任何情况下（包括未登录时），都隐藏导航栏
            appNav.classList.add('hidden');
        }

        navButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.view === viewId);
        });
    }

    // ▼▼▼ 【【【终极修复：把“账本画家”的工作室粘贴到这里！】】】 ▼▼▼
    function renderLedgerView() {
        ledgerContainer.innerHTML = '';
        if (!appData.userLedger || appData.userLedger.length === 0) {
            ledgerContainer.innerHTML = '<p class="placeholder-text" style="padding-top: 20px;">还没有任何记账记录哦，点击右下角+号添加第一笔吧！</p>';
            return;
        }
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
    // ▲▲▲ 【【【工作室搬迁完毕】】】 ▲▲▲
 // ▼▼▼ 【【【终极修复：把账本的“操作说明书”（所有相关函数）粘贴到这里！】】】 ▼▼▼
    let currentEditingTxId = null; 

    function openTransactionEditor(txId = null) {
        currentEditingTxId = txId;
        const title = document.getElementById('transaction-editor-title');
        const descInput = document.getElementById('tx-editor-desc-input');
        const amountInput = document.getElementById('tx-editor-amount-input');
        const remarksInput = document.getElementById('tx-editor-remarks-input');
        const typeSelector = document.getElementById('tx-editor-type-selector');
        const typeButtons = typeSelector.querySelectorAll('.type-button');
        
        typeButtons.forEach(btn => btn.classList.remove('active'));
        typeSelector.querySelector('[data-type="expense"]').classList.add('active');

        if (txId) {
            title.textContent = '编辑账目';
            const tx = appData.userLedger.find(t => t.id === txId);
            if (tx) {
                descInput.value = tx.description;
                amountInput.value = tx.amount;
                remarksInput.value = tx.remarks || '';
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

        if (currentEditingTxId) { 
            const tx = appData.userLedger.find(t => t.id === currentEditingTxId);
            if (tx) {
                tx.type = selectedType;
                tx.description = desc;
                tx.amount = amount;
                tx.remarks = remarks;
            }
        } else { 
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
    // ▲▲▲ 【【【说明书安放完毕】】】 ▲▲▲
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

                item.innerHTML = `
                    <div class="avatar-container">
                        <img class="avatar" src="${avatarUrl}" alt="avatar">
                        ${contact.unreadCount > 0 ? `<div class="unread-badge">${contact.unreadCount}</div>` : ''}
                    </div>
                    <div class="chat-list-item-info">
                        <div class="chat-list-item-top">
                            <span class="chat-list-item-name">${contact.remark}${partnerIcon}</span>
                            <span class="chat-list-item-time">${displayTime}</span>
                        </div>
                        <div class="chat-list-item-msg">${displayContent}</div>
                    </div>`;
                
                item.addEventListener('click', () => {
                    openChat(item.dataset.contactId, item.dataset.foundMessageId);
                });
                chatListContainer.appendChild(item);
            }
        } 
                // ▼▼▼ 默认模式的渲染逻辑 (V2.0 - 智能识别版) ▼▼▼
        else {
            // 【核心改造】全新的“智能排序系统”
            const getLatestTimestamp = (contact) => {
                // 步骤1：检查“线上”档案柜
                const onlineHistory = contact.onlineChatHistory || [];
                const lastOnlineTimestamp = onlineHistory.length > 0 ? onlineHistory[onlineHistory.length - 1].timestamp : 0;

                // 步骤2：检查“线下”档案柜
                const offlineHistory = contact.offlineChatHistory || [];
                const lastOfflineTimestamp = offlineHistory.length > 0 ? offlineHistory[offlineHistory.length - 1].timestamp : 0;

                // 步骤3：返回两个档案柜中，时间戳最新的那一个
                return Math.max(lastOnlineTimestamp, lastOfflineTimestamp);
            };

            const sortedContacts = [...itemsToRender].sort((a, b) => {
                // 规则1：优先按“是否置顶”排序
                const pinDifference = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
                if (pinDifference !== 0) return pinDifference;

                // 规则2：如果置顶状态相同，再按“最后消息时间”排序
                return getLatestTimestamp(b) - getLatestTimestamp(a);
            });

            for (const contact of sortedContacts) {
                const avatarBlob = await db.getImage(`${contact.id}_avatar`);
                const avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
                
                // 【核心改造】根据当前模式，从正确的档案柜读取最后一条消息
                const sourceHistory = contact.isOfflineMode ? contact.offlineChatHistory : contact.onlineChatHistory;
                const lastMessage = (sourceHistory && sourceHistory.length > 0) ? sourceHistory[sourceHistory.length - 1] : { content: '...' };
                
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
                item.innerHTML = `
                    <div class="avatar-container">
                        <img class="avatar" src="${avatarUrl}" alt="avatar">
                        ${contact.unreadCount > 0 ? `<div class="unread-badge">${contact.unreadCount}</div>` : ''}
                    </div>
                    <div class="chat-list-item-info">
                        <div class="chat-list-item-top">
                            <span class="chat-list-item-name">${contact.remark}${partnerIcon}</span>
                            <span class="chat-list-item-time">${formatMessageTimestamp(lastMessage.timestamp || Date.now())}</span>
                        </div>
                        <div class="chat-list-item-msg">${displayContent.substring(0, 25)}</div>
                    </div>`;
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
    if (!contact) return;

    // --- 【【【终极修复：智能档案检索系统】】】 ---
    let sourceHistory;
    if (contact.isOfflineMode) {
        // 线下模式：先找到当前激活的剧情线
        const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
        // 然后从这条线里，拿出它专属的聊天记录册
        sourceHistory = activeStory ? activeStory.chatHistory : [];
    } else {
        // 线上模式：逻辑保持不变
        sourceHistory = contact.onlineChatHistory;
    }
    // --- 【【【修复完毕】】】 ---

    if (!sourceHistory) return;

    const loadMoreBtn = document.getElementById('load-more-btn');
    const allMessages = sourceHistory;
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

    resetChatState();

    const contact = appData.aiContacts.find(c => c.id === numericContactId);
    if (!contact) return;


    // ▼▼▼ 【【【全新：“已读”销账逻辑】】】 ▼▼▼
        if (contact.unreadCount && contact.unreadCount > 0) {
            contact.unreadCount = 0; // 将未读数量清零
            saveAppData(); // 立刻保存
            // 在后台悄悄刷新一下聊天列表，让红点消失
            renderChatList(); 
        }
        // ▲▲▲▲▲ ▲▲▲▲▲


    if (!contact.unsentMessages) {
        contact.unsentMessages = [];
    }
    // ▲▲▲▲▲ ▲▲▲▲▲

    messageContainer.innerHTML = '<div id="load-more-btn" class="load-more-btn hidden"></div>';
    
    const avatarBlob = await db.getImage(`${contact.id}_avatar`);
    contact.avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
    const userAvatarBlob = await db.getImage(`${contact.id}_user_avatar`);
    contact.userAvatarUrl = userAvatarBlob ? URL.createObjectURL(userAvatarBlob) : 'https://i.postimg.cc/cLPP10Vm/4.jpg';

    updateChatHeader();
   
    
            switchToView('chat-window-view');
        
        // 我们依然先加载最新的一页历史记录
        await loadAndDisplayHistory(true);

        // ▼▼▼ 【【【第二处修改：在这里读取“待办文件夹”】】】 ▼▼▼
        // 加载完所有已发送的历史后，立刻检查这个AI的“待办文件夹”里有没有东西
        if (contact.unsentMessages && contact.unsentMessages.length > 0) {
            // 如果有，就一条一条地把它们显示在聊天界面上
            for (const msg of contact.unsentMessages) {
                await displayMessage(msg.content, 'user', { isStaged: true, ...msg });
            }
            // 显示完后，滚动到底部
            scrollToBottom();
        }
        // ▲▲▲▲▲ ▲▲▲▲▲

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
    updateChatHeader();
    // ▼▼▼ 【【【BUG修复 2/2 - 步骤B：用下面这个代码块替换旧的 if/else】】】 ▼▼▼
        // ▼▼▼ 【【【终极修复：模式感知的智能状态切换器】】】 ▼▼▼
    if (contact.isOfflineMode) {
        // 如果是线下模式，就直接显示一个固定的、清晰的模式状态
        chatAiActivityStatus.textContent = '剧情模式进行中';
    } else {
        // 否则（在线上模式时），才执行我们原来那套精密的作息和状态判断逻辑
        if (contact.isScheduleEnabled) {
            // 第一步：先去查作息表
            const activity = calculateCurrentActivity(contact.schedule);
            contact.currentActivity = activity.status; // 暂存计算结果，供AI自己参考

            // 第二步：执行新的“状态优先级”判断
            if (activity.status !== "空闲") {
                // 最高优先级：如果作息表有强制安排（如睡觉、工作），则直接使用
                chatAiActivityStatus.textContent = activity.status;
                // 【重要】同时，把这个强制状态，也更新为AI的“自身状态”，实现持久化
                contact.activityStatus = activity.status;
            } else {
                // 次高优先级：如果作息表显示“空闲”，则检查AI自己有没有设置状态
                if (contact.activityStatus) {
                    // 如果有（比如AI上次说“正在看书”），就维持它！
                    chatAiActivityStatus.textContent = contact.activityStatus;
                } else {
                    // 最低优先级：如果都没有，才显示“在线”
                    chatAiActivityStatus.textContent = '在线';
                }
            }
        } else {
            // 如果作息功能关闭，逻辑不变，还是显示AI自己保存的状态
            contact.currentActivity = null;
            chatAiActivityStatus.textContent = contact.activityStatus || '在线';
        }
    }
    // ▲▲▲▲▲ ▲▲▲▲▲
    // 【【【全新：AI开场白自动发送触发器】】】
    if (contact.isOfflineMode) {
        const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
        // 检查条件：故事线存在 & 有设置 & 故事线是空的 & 开场白不为空
        if (activeStory && activeStory.settings && activeStory.chatHistory.length === 0 && activeStory.settings.openingRemark) {
            // 满足所有条件，立即发送开场白
            displayMessage(activeStory.settings.openingRemark, 'assistant', { isNew: true, mode: 'offline' });
            // 【至关重要】发送后立刻“销毁”开场白，防止重复发送
            activeStory.settings.openingRemark = '';
            saveAppData();
        }
    }
    // 确保最后再执行一次视图切换，以防万一
    switchToView('chat-window-view');
}
    /**
     * 【全新】线下模式富文本翻译官
     * @param {string} text - AI返回的原始文本
     * @returns {string} - 翻译成HTML的文本
     */
    function calculateCurrentActivity(schedule) {
        const now = new Date();

        

        const currentDay = now.getDay();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;

        const timeToMinutes = (timeStr) => {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };
        
       // 1. 最高优先级：判断是否该去睡觉
        if (schedule && schedule.sleep) {
            const bedtime = timeToMinutes(schedule.sleep.bedtime);
            const wakeupTime = timeToMinutes(schedule.sleep.wakeupTime);
            
            let isScheduledToSleep = false;
            // 处理跨天睡眠
            if (bedtime > wakeupTime) {
                if (currentTimeInMinutes >= bedtime || currentTimeInMinutes < wakeupTime) {
                    isScheduledToSleep = true;
                }
            } else { // 当天睡眠
                if (currentTimeInMinutes >= bedtime && currentTimeInMinutes < wakeupTime) {
                    isScheduledToSleep = true;
                }
            }

            // 【【【核心逻辑升级：引入“空闲时间”判断】】】
            if (isScheduledToSleep) {
                // 读取上次互动的时间，如果没有就默认为0（很久以前）
                const lastInteraction = schedule.lastInteractionTimestamp || 0;
                // 计算从上次互动到现在，过去了多少分钟
                const idleMinutes = (now.getTime() - lastInteraction) / (1000 * 60);

                // 只有当“按计划该睡觉了”并且“已经闲置超过10分钟”，AI才能去睡！
                if (idleMinutes > 10) {
                    // 如果是不规律作息，有小概率熬夜不睡
                    if (schedule.sleep.type === 'irregular' && Math.random() < 0.15) {
                        return { status: "在熬夜", isAwake: true };
                    }
                    return { status: "睡眠中", isAwake: false };
                }
                // 否则，即使到了睡觉时间，只要还在10分钟互动期内，就保持清醒
            }
        }
        
        // 【【【核心修复：把丢失的“小助手”函数放回来！】】】
        const checkActivity = (activityList) => {
            for (const item of activityList) {
                const days = item.days || [];
                if (!days.includes(currentDay)) continue;

                const start = timeToMinutes(item.startTime);
                const end = timeToMinutes(item.endTime);

                if (currentTimeInMinutes >= start && currentTimeInMinutes < end) {
                    if (Math.random() < (item.probability || 1)) {
                         return { status: `正在${item.name}`, isAwake: true };
                    }
                }
            }
            return null;
        }
         // 2. 第二优先级：判断是否在吃饭
        if (schedule && schedule.meals) {
            const mealTimes = {
                '吃早餐': timeToMinutes(schedule.meals.breakfast),
                '吃午饭': timeToMinutes(schedule.meals.lunch),
                '吃晚饭': timeToMinutes(schedule.meals.dinner)
            };
            for (const mealName in mealTimes) {
                // 饭点前后半小时都算吃饭时间
                if (Math.abs(currentTimeInMinutes - mealTimes[mealName]) <= 30) {
                     // 如果三餐不规律，有40%概率错过饭点
                    if (schedule.meals.type === 'irregular' && Math.random() < 0.4) {
                        continue; // 跳过，假装没在吃饭
                    }
                    return { status: `正在${mealName}`, isAwake: true };
                }
            }
        }

        // 2. 第二优先级：判断是否在工作
        const workActivity = checkActivity(schedule.work || []);
        if (workActivity) return workActivity;

                // 3. 第三优先级：判断是否在休闲
        const leisureActivity = checkActivity(schedule.leisure || []);
        if (leisureActivity) return leisureActivity;
        
        // 4. 【核心改造】默认状态不再是“在线”，而是“空闲”
        return { status: "空闲", isAwake: true };
    }
    // “聪明的档案管理员” V4.0 (剧情线感知版)
    function findMessageById(messageId) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return null;
    
        // 步骤1: 先在“线上”和“待发送”这两个常规区域里找
        let message = 
            (contact.onlineChatHistory || []).find(msg => msg.id === messageId) ||
            (contact.unsentMessages || []).find(msg => msg.id === messageId);
    
        // 步骤2: 如果还没找到，就启动“线下剧情线大搜查”
        if (!message && contact.offlineStorylines && contact.offlineStorylines.length > 0) {
            for (const story of contact.offlineStorylines) {
                // 在每一条剧情线的聊天记录册里都找一遍
                const foundInStory = (story.chatHistory || []).find(msg => msg.id === messageId);
                if (foundInStory) {
                    message = foundInStory;
                    break; // 一旦找到，立刻停止搜查
                }
            }
        }
    
        return message || null;
    }
    function formatScheduleForAI(schedule) {
        if (!schedule) return "你没有设定任何作息。";

        let scheduleString = "";
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

        // 一个小工具，用来把 [1,2,3,5] 这样的数组，变成 "周一至周三、周五"
        const formatDaysForAI = (days) => {
            if (!days || days.length === 0) return '';
            if (days.length === 7) return '每天';
            
            const sorted = [...days].sort();
            const parts = [];
            for (let i = 0; i < sorted.length; i++) {
                let j = i;
                while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) {
                    j++;
                }
                if (j > i + 1) { // 连续超过2天，形成区间
                    parts.push(`${dayNames[sorted[i]]}至${dayNames[sorted[j]]}`);
                } else { // 不连续或只有两天，单独列出
                    for (let k = i; k <= j; k++) {
                        parts.push(dayNames[sorted[k]]);
                    }
                }
                i = j;
            }
            return parts.join('、');
        };

        // 翻译睡眠
        if (schedule.sleep) {
            scheduleString += `- **睡眠**: ${formatDaysForAI([0,1,2,3,4,5,6])} ${schedule.sleep.bedtime} 睡觉，第二天 ${schedule.sleep.wakeupTime} 起床。\n`;
        }
        // 翻译三餐
        if (schedule.meals) {
            scheduleString += `- **三餐**: 早餐 ${schedule.meals.breakfast}，午餐 ${schedule.meals.lunch}，晚餐 ${schedule.meals.dinner}。\n`;
        }
        // 翻译工作
        if (schedule.work && schedule.work.length > 0) {
            scheduleString += `- **工作安排**:\n`;
            schedule.work.forEach(item => {
                scheduleString += `  - ${formatDaysForAI(item.days)} ${item.startTime}至${item.endTime}：${item.name}。\n`;
            });
        }
        // 翻译休闲
        if (schedule.leisure && schedule.leisure.length > 0) {
            scheduleString += `- **休闲安排**:\n`;
            schedule.leisure.forEach(item => {
                scheduleString += `  - ${formatDaysForAI(item.days)} ${item.startTime}至${item.endTime}：${item.name}。\n`;
            });
        }

        return scheduleString.trim() || "你没有设定任何作息。";
    }
    function formatOfflineTextToHTML(text) {
        // --- 终极智能翻译引擎 V4.0 ---

        // 步骤1：【最优先处理】用一个“捕获组”来智能修复AI的 "italic"> 错误。
        // 这个正则表达式会找到 "italic">，然后捕获它之后、直到行尾的所有内容，
        // 并将这些内容包裹在斜体标签内。
        // 我们使用了 /gm 标志，确保它可以处理多行文本中的每一处错误。
        text = text.replace(/^"italic">(.*)$/gm, '<em class="italic">$1</em>');

        // 步骤2：【安全清理】现在，我们可以安全地清理掉任何残留的、我们不想要的 "bold"> 标记。
        text = text.replace(/"bold">/g, '');

        // 步骤3：【高亮翻译】处理双引号里的对话内容。
        text = text.replace(/"(.*?)"/g, '<span class="highlight">"$1"</span>');
        
        // 步骤4：【标准斜体兼容】为了以防万一AI哪天又“学会”了标准markdown，我们仍然保留对 *...* 的处理。
        text = text.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

        // 步骤5：【换行处理】
        return text.replace(/\n/g, '<br>');
    }
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

            // 【核心修复】根据当前模式，从正确的档案柜读取记录
            const sourceHistory = contact.isOfflineMode ? contact.offlineChatHistory : contact.onlineChatHistory;

            if (!isNaN(range) && range > 0) {
                messagesToSummarize = sourceHistory.slice(-range);
            } else {
                const lastSummaryCount = contact.lastSummaryAtCount || 0;
                // 注意：这里的逻辑需要更精确，我们先简单修复读取源
                const fullHistoryForCount = [...contact.onlineChatHistory, ...contact.offlineChatHistory].sort((a,b)=>a.timestamp-b.timestamp);
                messagesToSummarize = fullHistoryForCount.slice(lastSummaryCount);
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

         const currentDate = new Date().toLocaleString('zh-CN');
        const prompt = buildSummaryPrompt(isOnlineMode, chatLogForApi, currentDate);
        
        // 【【【核心修复：使用更健壮的URL构建逻辑】】】
        let requestUrl = appData.appSettings.apiUrl;
        if (!requestUrl.endsWith('/chat/completions')) { 
            requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions'; 
        }
        
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
     * 【全新】强制总结引擎
     * @param {object} contact - 当前AI角色
     * @param {string} summarizingMode - 要总结的模式 ('online' 或 'offline')
     */
        /**
     * 【全新V2.0】强制总结引擎 (更智能，可指定记忆目标)
     * @param {object} contact - 当前AI角色
     * @param {string} summarizingMode - 要总结的模式 ('online' 或 'offline')
     * @param {string} saveTarget - 总结的保存目标 ('memory' 或 'offlineMemory')
     */
    async function forceSummaryOnModeSwitch(contact, summarizingMode, saveTarget) {
        // 如果自动总结没开，就直接“下班”
        if (!contact.autoSummaryEnabled) return;

        console.log(`强制总结触发, 目标模式: ${summarizingMode}, 保存到: ${saveTarget}`);
        showToast(`正在总结 ${summarizingMode === 'online' ? '线上' : '线下'} 记录...`, 'info', 0);

        const lastSummaryCount = contact.lastSummaryAtCount || 0;
        
        // 1. 【【【终极修复：从所有正确的“文件夹”里收集数据】】】
        // 首先，把所有线下剧情线里的聊天记录都汇总到一个临时数组里
        const allOfflineMessages = (contact.offlineStorylines || []).reduce((acc, story) => {
            return acc.concat(story.chatHistory || []);
        }, []);

        // 然后，再把线上记录和刚刚汇总好的所有线下记录合并，得到最完整的历史
        const fullHistoryForCount = [...contact.onlineChatHistory, ...allOfflineMessages]
            .sort((a, b) => a.timestamp - b.timestamp);
        
        // 2. 从这个完整的记录里，切出所有“新”消息
        const allNewMessages = fullHistoryForCount.slice(lastSummaryCount);

        // 3. 【精准筛选】从这些“新”消息里，只挑出属于我们要总结的那个模式的消息
        const messagesToSummarize = allNewMessages.filter(m => m.mode === summarizingMode);

        if (messagesToSummarize.length === 0) {
            showToast('没有新内容需要总结', 'success', 1500);
            return; // 没有需要总结的，也直接“下班”
        }

        try {
            const isOnlineModeForPrompt = summarizingMode === 'online';
            const summary = await generateSummary(isOnlineModeForPrompt, messagesToSummarize);
            
            // 4. 【【【终极修复：实现“双重存档”的全新智能逻辑】】】
            const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);

            // 步骤A (必须执行): 无论如何，都必须为当前剧情线保存一份本地记忆副本。
            if (activeStory) {
                if (!activeStory.memory) activeStory.memory = ''; // 安全检查，确保记忆属性存在
                if (activeStory.memory.trim() !== '') {
                    activeStory.memory += `\n\n---\n# 自动总结 (${new Date().toLocaleString()})\n`;
                }
                activeStory.memory += summary;
                console.log(`Summary saved to storyline: ${activeStory.name}`);
            }

            // 步骤B (按需执行): 检查是否需要额外将这份记忆合并到线上主记忆中。
            // 我们的 saveTarget 在 policy 为 'merge' 时会被设为 'memory'。
            if (saveTarget === 'memory') {
                if (contact.memory.trim() !== '') {
                    contact.memory += `\n\n---\n# 自动总结 (${new Date().toLocaleString()})\n`;
                }
                contact.memory += summary;
                console.log(`Summary also merged into main online memory.`);
            }
            
            // 5. 【修复记账本】用最准确的总消息数，来更新“小账本”
            contact.lastSummaryAtCount = fullHistoryForCount.length;
            
            saveAppData();
            showToast('总结成功并已存入记忆！', 'success');
        } catch (error) {
            console.error("强制总结失败:", error);
            showToast('自动总结失败，请检查网络或API设置', 'error');
        }
    }
    /**
     * 【全新】自动总结触发器
     */
    async function triggerAutoSummaryIfNeeded() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact || !contact.autoSummaryEnabled) {
            return; 
        }

        // 【核心改造】根据当前模式，选择正确的档案柜进行检查
        const sourceHistory = contact.isOfflineMode ? contact.offlineChatHistory : contact.onlineChatHistory;
        const summarizingMode = contact.isOfflineMode ? 'offline' : 'online';

        const threshold = contact.autoSummaryThreshold || 100;
        // 【核心改造】我们现在只统计当前模式下的新增消息数量
        const lastSummaryCount = contact.lastSummaryAtCount || 0;
        const allHistoryForCount = [...contact.onlineChatHistory, ...contact.offlineChatHistory].sort((a, b) => a.timestamp - b.timestamp);
        const currentTotalCount = allHistoryForCount.length;
        
        if ((currentTotalCount - lastSummaryCount) >= threshold) {
            console.log(`自动总结触发！当前总数: ${currentTotalCount}, 上次在: ${lastSummaryCount}, 阈值: ${threshold}`);
            
            // 【重要】我们现在要明确告诉AI，总结应该存到哪里
            const saveTarget = contact.isOfflineMode ? 'offlineMemory' : 'memory';
            await forceSummaryOnModeSwitch(contact, summarizingMode, saveTarget); // <-- 看，第三个指令补上了！
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
            // 【【【核心修复：根据消息自身的模式标签来渲染】】】
            if (options.mode === 'offline') {
                // 如果这条消息的“身份证”上写着“线下”，就用富文本格式
                const formattedText = formatOfflineTextToHTML(text);
                messageContentHTML = `<div class="message offline-message">${formattedText}</div>`;
            } else {
                // 否则，就统一按线上模式的纯文本显示
                messageContentHTML = `<div class="message">${text}</div>`;
            }
            break;
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

    // 【【【核心终极修复：在追加DOM前，就“抓住”正确的元素引用！】】】
    // 1. 先从即将被“抱走”的文档片段中，找到那个唯一的、带ID的消息元素
    const messageRowForSaving = messageElement.querySelector('.message-row');

    // 2. 现在再把元素“抱”进聊天窗口
    messageContainer.appendChild(messageElement);

    if (!isLoading) {
        scrollToBottom();
    }

    if (isNew && !isStaged && !isLoading) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (contact) {
            // 3. 使用我们刚才提前“抓住”的那个绝对正确的元素引用来获取ID
            const messageToSave = {
                id: messageRowForSaving ? messageRowForSaving.dataset.messageId : `${Date.now()}-${Math.random()}`,
                role: role,
                content: text,
                    type: type,
                    timestamp: options.timestamp || Date.now(),
                    mode: contact.isOfflineMode ? 'offline' : 'online'
                };

                Object.assign(messageToSave, options);
                delete messageToSave.isNew;

                // --- 【【【终极修复：智能消息存储系统】】】 ---
                if (contact.isOfflineMode) {
                    // 线下模式：找到当前激活的剧情线
                    const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
                    if (activeStory) {
                        // 把消息存入这条线专属的记录册
                        if (!activeStory.chatHistory) activeStory.chatHistory = []; // 安全检查
                        activeStory.chatHistory.push(messageToSave);
                    }
                } else {
                    // 线上模式：逻辑保持不变
                    contact.onlineChatHistory.push(messageToSave);
                }
                // --- 【【【修复完毕】】】 ---
                
                saveAppData();
                renderChatList();
            }
        }
    }

    function removeLoadingBubble() {
        if (loadingBubbleElement) { loadingBubbleElement.remove(); loadingBubbleElement = null; }
    }
        async function dispatchAndDisplayUserMessage(messageData) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        // ★★★【【【终极安全检查：在这里部署“现场检查员”！】】】★★★
        // 无论什么原因，如果这个AI的“待办文件夹”不存在，
        // 就在这里，立刻、马上，给他创建一个！
        if (!contact.unsentMessages) {
            contact.unsentMessages = [];
        }
        // ★★★【【【修复植入完毕】】】★★★

        const tempId = `staged-${Date.now()}`;
        
        const finalMessageData = {
            id: tempId, 
            role: 'user', 
            ...messageData,
            quotedMessage: stagedQuoteData
        };

        // ▼▼▼ 【【【第三处修改：不再使用临时便签】】】 ▼▼▼
        // 直接把新消息放进这个AI专属的、永久的“待办文件夹”里
        contact.unsentMessages.push(finalMessageData);
        // 【重要】立刻保存一次！确保刷新页面也不会丢失
        saveAppData();
        // ▲▲▲▲▲ ▲▲▲▲▲
        
        await displayMessage(finalMessageData.content, 'user', { isStaged: true, ...finalMessageData });
        
        scrollToBottom();
        
        cancelQuoteReply();
    }
    async function stageUserMessage() {
        const text = chatInput.value.trim();
        if (text === '') return;
        chatInput.value = '';
        await dispatchAndDisplayUserMessage({ content: text, type: 'text' });
    }

    /**
     * 【全新】现场勘查员：从墙上（DOM）恢复被遗忘的“便利贴”（staged messages）
     */
    function rebuildStagedMessagesFromDOM() {
        // 如果记事本（stagedUserMessages）里本来就有东西，说明没失忆，不需要勘查
        if (stagedUserMessages.length > 0) return;

        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        // 开始“现场勘查”
        document.querySelectorAll('.message-row[data-staged="true"]').forEach(row => {
            const messageId = row.dataset.messageId;
            // 拿着“便利贴”的ID去“历史档案”（chatHistory）里反查，确保这不是一张伪造的便利贴
            // 这一步是为了防止把已经发送的消息错误地又加回来
            const alreadySent = contact.chatHistory.some(msg => msg.id === messageId);

            if (!alreadySent) {
                // 勘查成功！这是一张被遗忘的真便利贴，我们需要重建它的所有信息
                // 注意：我们无法完美恢复所有复杂信息（如红包数据），但至少能恢复文本内容
                const messageContentElem = row.querySelector('.message');
                let content = messageContentElem ? messageContentElem.textContent : '';
                let type = 'text'; // 默认为文本

                if (row.querySelector('.message-image-user')) type = 'image';
                if (row.querySelector('.message-voice')) type = 'voice';
                if (row.querySelector('.message-sticker')) type = 'sticker';

                // 把勘查到的信息，重新记回“记事本”
                stagedUserMessages.push({
                    id: messageId,
                    role: 'user',
                    content: content,
                    type: type
                });
            }
        });
    }

        async function commitAndSendStagedMessages() {
        // 【核心修复】第一步：在做任何事之前，先命令“管家”进行“现场勘查”！
        // ▼▼▼ 【【【第二处修改：删除下面这一行代码】】】 ▼▼▼
        // rebuildStagedMessagesFromDOM();  <-- 把这一行删掉

        // 第二步：像以前一样，处理当前输入框里的新内容
        if (chatInput.value.trim() !== '') {
            await stageUserMessage();
        }
        
                // 第三步：现在再检查“记事本”，它已经是完整的了！
                const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        // ▼▼▼ 【【【第三处修改：在这里替换数组名】】】 ▼▼▼
         contact.unsentMessages.forEach(msg => {
            const messageToSave = {
                role: 'user', 
                timestamp: Date.now(), 
                ...msg,
                id: msg.id || `${Date.now()}-${Math.random()}`,
                mode: contact.isOfflineMode ? 'offline' : 'online'
            };
            
            // --- 【【【终极修复：用户消息智能存储】】】 ---
            if (contact.isOfflineMode) {
                const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
                if (activeStory) {
                    if (!activeStory.chatHistory) activeStory.chatHistory = [];
                    activeStory.chatHistory.push(messageToSave);
                }
            } else {
                contact.onlineChatHistory.push(messageToSave);
            }
            // --- 【【【修复完毕】】】 ---
        });
        
        let shouldCallAI = true;

        if (contact.isScheduleEnabled) {
            const activity = calculateCurrentActivity(contact.schedule);
            if (activity.isAwake === false) {
                contact.consecutiveMessagesWhileSleeping++;
                const wakeupChance = contact.consecutiveMessagesWhileSleeping * 0.08;

                                if (Math.random() < wakeupChance) {
                    forceRestartContext = true;
                    contact.consecutiveMessagesWhileSleeping = 0; 
                    contact.schedule.forcefullyWokenAt = Date.now();
                } else {
                    displayMessage(`${contact.remark} 正在睡觉，似乎没有听到...`, 'system', { isNew: true, type: 'system' });
                    shouldCallAI = false; 
                }
            } else {
                contact.consecutiveMessagesWhileSleeping = 0;
            }
        } else {
            contact.consecutiveMessagesWhileSleeping = 0;
        }

                document.querySelectorAll('[data-staged="true"]').forEach(el => {
            el.removeAttribute('data-staged');
        });
        
        // ▼▼▼ 【【【第四处修改：清空正确的文件夹并保存】】】 ▼▼▼
        // 转移完成后，立刻清空“待办文件夹”
        contact.unsentMessages = [];
        // 【重要】最后，把所有改动（档案转移+清空待办）一次性永久保存
        saveAppData();
        // ▲▲▲▲▲ ▲▲▲▲▲

        contact.schedule.lastInteractionTimestamp = Date.now();
        
        contact.proactiveMessaging.lastSent = Date.now();

        saveAppData();

        triggerAutoSummaryIfNeeded();

        if (shouldCallAI) {
            getAiResponse();
        }
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

            // ★★★【【【终极修复 V7.0：剧情线感知的上下文检索系统】】】★★★
            let sourceHistory;
            if (contact.isOfflineMode) {
                // 线下模式：1. 找到当前激活的剧情线
                const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
                // 2. 从这条线里，拿出它专属的聊天记录册
                sourceHistory = activeStory && activeStory.chatHistory ? activeStory.chatHistory : [];
            } else {
                // 线上模式：逻辑保持不变
                sourceHistory = contact.onlineChatHistory;
            }

            // 立即根据模式，切出本次API调用真正需要的“上下文”片段
            const historyToUse = contact.isOfflineMode 
                ? sourceHistory.slice(-10) // 线下模式只看最近10条
                : sourceHistory.slice(contact.contextStartIndex || 0).slice(-(appData.appSettings.contextLimit || 50));
            
            // 立即获取最后一条用户消息，供后续的功能使用
            const lastUserMessage = sourceHistory.length > 0 ? sourceHistory[sourceHistory.length - 1] : null;


            removeLoadingBubble();
            lastReceivedSuggestions = [];
            aiSuggestionPanel.classList.add('hidden');
            
            await displayMessage('对方正在输入...', 'assistant', { isLoading: true });

            // ==========================================================
            //                 【【【模式切换核心逻辑】】】
            // ==========================================================
            let finalSystemPrompt;

                        if (contact.isOfflineMode) {
                // ----------------------------------------------------------
                //                   ▼▼▼ 线下模式大脑 ▼▼▼
                // ----------------------------------------------------------
                const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
                const settings = activeStory ? activeStory.settings : {}; // 从当前剧情线读取设置
                let controlPrompt = '';
                if (settings.preventControl) {
                    controlPrompt = `
# 【强制执行】
你必须严格遵守以下规则：
- **禁止**描写 {{user}} 的语言、动作、表情、心理、感官状态；
- **禁止**代替 {{user}} 说话；
- **禁止**引用、复述、改写、模拟 {{user}} 的任何发言或思维；
- {{user}} 仅可作为他人行为的引发源，**不得主动参与情节展开**；
- 任何描写中，不得将 {{user}} 设定为剧情主导者、话语者、叙述者；
- {{user}} 的存在必须始终保持“空白接口”状态，仅可被他人**响应**，不可被**演绎**。
若违反上述规则，将被视为重大错误！！`;
                }

                const perspectivePrompt = settings.perspective === 'third-person' 
                    ? `你的所有叙述都必须使用【第三人称】，例如：“他/她看着窗外...”。用户的角色名是 ${contact.userProfile.name}。`
                    : `你的所有叙述都必须使用【第二人称】，例如：“你看着窗外...”。`;
                
                const wordLimitPrompt = settings.wordLimit > 0 ? `你的每次回复长度应尽量控制在 ${settings.wordLimit} 字左右。` : '';

                finalSystemPrompt = `
# 任务: 线下剧情角色扮演
你正在与用户进行一段沉浸式的文字角色扮演（RP）。
${settings.startPrompt ? `\n## 开场剧情引导\n${settings.startPrompt}\n` : ''}

## 核心输出格式规则 (必须严格遵守)
- **内心想法**: 角色的心理活动或内心独白，必须用单个星号包裹。例如：*这到底是怎么回事...*
- **对话**: 普通的对话内容，必须用英文双引号包裹。例如："你来了。"
- **【【【重要】】】**: 你的回复必须严格遵守以上两种格式，不要创造任何其他标记。

## 叙事风格与限制
- ${perspectivePrompt}
- ${wordLimitPrompt}
${controlPrompt}

## 你的角色设定
${contact.persona}

## 剧情记忆
这是你们之前发生过的故事，请在此基础上继续：
${(contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId)?.memory) || '（暂无剧情记忆，这是故事的开始。）'}
`;
        } else {
                // 这里是“线上模式大脑”，也就是您原来的全部代码
        
// ▼▼▼ 【【【终极改造 V7.0：多模态日记助理】】】 ▼▼▼

// --- 【【【全新V2.0：遵守“仓库管理规定”的AI天气报告系统】】】 ---
        let aiWeatherReport = "（你所在城市的天气系统已关闭）";
        if (contact.aiWeatherSystem && contact.aiWeatherSystem.enabled) {
            let forecastToUse = null;
            const today = new Date();

            // 规定1：AI也必须先检查仓库
            if (contact.weatherCache && isSameDay(new Date(contact.weatherCache.timestamp), today)) {
                // 如果仓库有货，直接用
                forecastToUse = contact.weatherCache.forecastData;
            } else {
                // 如果仓库没货或过期，AI自己负责去进货
                try {
                    console.log("AI对话系统：天气缓存过期，正在为AI生成新预报...");
                    const newForecast = await generateForecastWithAI(contact);
                    // 进货后，立刻存入仓库并保存
                    contact.weatherCache = {
                        timestamp: today.getTime(),
                        forecastData: newForecast
                    };
                    saveAppData();
                    forecastToUse = newForecast;
                } catch (error) {
                    console.error("在构建Prompt时，AI天气预报生成失败", error);
                    aiWeatherReport = "（你所在城市的天气系统暂时无法连接）";
                }
            }

            // 无论从哪拿到的货，最终都在这里打包成报告
            if (forecastToUse) {
                aiWeatherReport = `## 【你的世界背景：你在“${contact.aiWeatherSystem.cityName}”的天气】\n`;
                aiWeatherReport += `这是你所在城市的8日天气预报，你应该基于此来展开对话或进行日记创作。\n`;
                forecastToUse.forEach(day => {
                    // 【核心修正】在这里增加一个判断
                    if (day.dateLabel === '今天') {
                        // 如果是今天，就组装一份详细报告
                        aiWeatherReport += `- **${day.dateLabel}**: ${day.description}, 气温 ${day.tempMin}°C ~ ${day.tempMax}°C。\n  - (详细情况：日出 ${day.sunrise}, 日落 ${day.sunset}, 湿度 ${day.humidity}%, 气压 ${day.pressure}hPa, 风力 ${day.windLevel}, 紫外线 ${day.uvIndex})\n`;
                    } else {
                        // 如果不是今天，就保持原来的简洁格式
                        aiWeatherReport += `- **${day.dateLabel}**: ${day.description}, 气温 ${day.tempMin}°C ~ ${day.tempMax}°C\n`;
                    }
                });
            }
        }
        let diaryParts = []; // 准备一个空的“图文包裹”，它是一个数组
        // 【核心修复】我们现在直接使用在函数顶部准备好的 lastUserMessage
        const diaryKeywords = ['日记', '手账', '我写了', '记录', '心情'];

        if (lastUserMessage && lastUserMessage.role === 'user' && diaryKeywords.some(keyword => lastUserMessage.content.includes(keyword))) {
            
            if (appData.userDiary && appData.userDiary.length > 0) {
                const latestDiary = appData.userDiary[appData.userDiary.length - 1];
                
                if (latestDiary.visibility === 'all' || latestDiary.visibility == activeChatContactId) {
                    
                    // 【核心】全新的“图文打包”翻译机
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = latestDiary.htmlContent;

                    // 1. 先准备好给AI的引导指令
                    diaryParts.push({
                        type: 'text',
                        text: `
# 【【【重要参考：用户最新图文日记】】】
用户刚刚提到了TA的日记，这是TA最近写的一篇，其中可能包含图片。你的首要任务是，像一个真正关心TA的朋友一样，结合日记的【文字内容】和【图片细节】进行评论或提问，然后再继续你们之前的话题。
---
[日期: ${new Date(latestDiary.timestamp).toLocaleDateString('zh-CN')}]
[内容如下:]
`
                    });

                    // 2. 遍历日记的所有内容（文字和图片），逐个打包
                    for (const node of tempDiv.childNodes) {
                        if (node.nodeType === 3) { // 这是一个纯文本节点
                            const text = (node.textContent || "").trim();
                            if (text) {
                                diaryParts.push({ type: 'text', text: text });
                            }
                        } else if (node.nodeType === 1) { // 这是一个元素节点
                            // 如果是包裹图片的P标签，就找到里面的图片
                            const img = node.tagName === 'IMG' ? node : node.querySelector('img');
                            if (img && img.src) {
                                // 图片需要以Base64 Data URL的格式发送
                                if (img.src.startsWith('data:image')) {
                                    diaryParts.push({
                                        type: 'image_url',
                                        image_url: { url: img.src }
                                    });
                                }
                            } else { // 如果不是图片，就当成普通文本处理
                                 const text = (node.textContent || "").trim();
                                 if (text) {
                                    diaryParts.push({ type: 'text', text: text });
                                 }
                            }
                        }
                    }
                }
            }
        }
        // ▲▲▲▲▲ 多模态助理模块结束 ▲▲▲▲▲
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

        // ★★★【【【终极修复：在这里教会AI去正确的档案柜拿历史记录！】】】★★★
        // 1. 先判断当前是线上还是线下模式，找到正确的“档案柜”
        const sourceHistory = contact.isOfflineMode ? contact.offlineChatHistory : contact.onlineChatHistory;
        
        // 2. 从正确的档案柜里，读取需要用到的上下文
        const startIndex = contact.contextStartIndex || 0;
        const relevantHistory = sourceHistory.slice(startIndex);
        
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
        // 【【【核心终极修复：使用完整的历史记录来计算消息总数】】】
        // 解释：我们必须把“待发送”的消息也算进去，才能得到最准确的当前消息总数
        const messageCount = (contact.onlineChatHistory.length + contact.offlineChatHistory.length) + stagedUserMessages.length;

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

        // ▼▼▼ 【【【终极修复：在这里实现“动态指令注入”】】】 ▼▼▼

        // 第一步：准备好两个“工具”：作息表文本 和 思维链指令
        let scheduleForAI = "你没有设定任何作息。";
        let scheduleChainOfThought = ""; // 默认是空的

        // 第二步：检查“真实作息”的开关
        if (contact.isScheduleEnabled && contact.schedule) {
            // 如果开关是开的，就从“工具箱”里把两个工具都拿出来
            scheduleForAI = formatScheduleForAI(contact.schedule);
            scheduleChainOfThought = `
### >> 【【【核心思维链 (Chain-of-Thought) 指令】】】
当用户的问题涉及**时间、计划、日程或你当前/未来的状态**时（例如：“你在干嘛？”、“你几点睡觉？”、“明天有什么安排吗？”），你【必须】严格遵循以下两步思考流程：

- **第一步 (内心检索)**: 你【必须】在脑海中，首先默默地、快速地回顾上方“你的生活作息”部分，并结合当前真实时间 (\`${new Date().toLocaleString('zh-CN')}\`)，确定你此刻或未来应该处于的状态。
- **第二步 (组织回答)**: 然后，你【必须】基于检索到的信息，以你角色的口吻，自然地、口语化地回答用户的问题。你的回答应该像是你自然而然想起来的，而不是在背诵一份时间表。

**【示例】**
- **用户提问**: “你晚上都干些什么呀？”
- **你的内心检索 (不许说出来)**: “（我的作息表写着，工作日的晚上18:00到22:00是休闲活动：新活动...）”
- **你最终的回答 (口语化)**: “吃完晚饭后，我一般会放松一下，搞搞我那个‘新活动’，还挺有意思的。”
- **【绝对禁止】** 直接背诵作息表，例如回答：“我的日程是晚上18点到22点进行新活动。”
`;
        }


        const finalPrompt = `# 任务: 角色扮演
你是一个AI角色，你正在和一个真实用户聊天。你的所有回复都必须严格以角色的身份进行。

## 情景：用户的天气
这是用户所在地的天气报告。请自然地结合天气关心用户，但不要生硬播报。
${formattedWeatherData}

## 【你的完整背景档案】

### >> 关于你自己 (AI角色)
- **核心人设**: 
\`\`\`
${contact.persona}
\`\`\`
- **沟通风格**: 
${contact.chatStyle || '自然发挥即可'}
- **你的生活作息 (必须遵守)**:
\`\`\`
${scheduleForAI}
\`\`\`

- **你的世界背景 (天气与环境)**:
${aiWeatherReport}

### >> 天气解读指南
当你谈论自己的天气时，【必须】将专业数据口语化，融入你的人设和风格。参考下方规则：
- **'uvIndex' (紫外线)**: 根据强度，自然地聊“晒不晒”或“要不要防晒”。
- **'pressure' (气压)**: 如果数值偏低 (标准约1013hPa)，就说“天气有点闷”或“感觉闷闷的”。
- **'windLevel' (风力)**: 直接描述成“风大不大”。

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

${scheduleChainOfThought}

### >> 核心行为准则
- **重要背景**: 你正在通过聊天软件与用户进行【线上对话】。当前时间: ${new Date().toLocaleString('zh-CN')}。${relationshipContext}
- **回复风格**: 模拟真实聊天，将一个完整的思想拆分成【2-8条】独立的短消息。
- **禁止括号**: 【绝对不能】包含任何括号内的动作、神态描写。
- **主动分享**: 你需要结合你的人设、沟通风格和你自己的天气状况，像一个真人一样主动分享你的所见所闻所感。例如，如果你的城市在下雨，你可以说：“我这边下雨了，感觉有点昏昏欲睡呢。”
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
  - **当你想主动求爱时**: 除了说出你的告白之外，你【必须】在'reply'数组的最后，【单独】添加一个字符串：\`[PROPOSE_RELATIONSHIP]\`。这是一个给系统的**机器指令**，它会生成一张真正的邀请卡片。**【绝对禁止】只在口头上说“我发送了邀请”而不使用这个指令**，否则邀请是无效的。
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
- **"reply"**: 一个字符串数组，包含了你作为角色的所有聊天消息（包括特殊指令）。【【【究极规则：此数组中的所有元素都必须是非空的字符串，绝对不能包含 null 或 undefined 值！】】】
- **"suggestions"**: 一个包含4条字符串的数组，是为用户准备的回复建议。它【必须】遵循以下设计原则：
  - **建议1 & 2 (温和正面)**: 设计两条【温和或积极】的回答。其中一条【必须】是你最期望听到的、能让关系升温的回答。
  - **建议3 (中立探索)**: 设计一条【中立或疑问】的回答。
  - **建议4 (挑战/负面)**: 设计一条【带有挑战性或负面情绪】的回答，但要符合恋爱逻辑。
 
## 开始对话
请根据上面的所有设定和下面的对话历史，对用户的最新消息做出回应，并只输出符合上述格式的JSON对象。`;

        
                // 【【【全新V3.0：智能场景判断与指令注入】】】
        let prefixPrompt = "";

        // 场景1：刚刚从线下模式切回
        if (contact.justSwitchedToOnline === true) {
            prefixPrompt = `
# 【【【最高优先级指令：模式切换提醒！】】】
注意：你们刚刚结束了沉浸式的线下剧情角色扮演，现在已经返回到轻松的线上日常聊天模式。
你【必须】立刻调整你的沟通风格，严格遵守“将一个完整的思想拆分成2-8条独立的短消息”的核心规则。
【绝对禁止】使用大段的、连贯的叙事性文字进行回复。
---
`;
            // 唤醒一次后，立刻拔掉小旗子，并保存
            contact.justSwitchedToOnline = false;
            saveAppData();
        }
        // 场景2：被用户强行吵醒
        else if (forceRestartContext === true) {
            prefixPrompt = `
# 【【【最高优先级情景模拟：被吵醒】】】
你刚才正在熟睡，但是用户的消息把你强行吵醒了。
你现在非常困KAN倦，可能还有点起床气。
你的回复【必须】体现出这种刚被吵醒的状态（例如：迷糊、不耐烦、说话简短）。
---
`;
            forceRestartContext = false;
        }
        // 如果AI没有在睡觉，但处于其他活动状态（比如工作、吃饭）
        else if (contact.isScheduleEnabled && contact.currentActivity && contact.currentActivity !== "在线") {
            // 这是正常的作息状态
            prefixPrompt = `
# 【【【最高优先级情景模拟】】】
当前真实时间是：${new Date().toLocaleString('zh-CN')}。
你的个人状态不是“随时待命”，而是【${contact.currentActivity}】。
你的所有回复都【必须】严格基于这个真实状态，展现出对应的语气和内容。
---
`;
        }
        // 注意：我们删除了多余的 contact.consecutiveMessagesWhileSleeping = 0; 和 saveAppData();

        
        
        // 【【【终极修复：在这里设立“总管”，提前合并好最终的指令大纲！】】】
        finalSystemPrompt = prefixPrompt + finalPrompt;

               // 【【【核心终极改造 V9.0：多模态消息安全组装模块】】】
        let finalMessagesForApi;

        // 默认情况下，最终要发送的就是系统指令+格式化后的历史记录
        let baseMessages = [ { role: "system", content: finalSystemPrompt }, ...messagesForApi ];

        // 只有在日记内容真的存在时，才尝试进行“智能合并”
        if (diaryParts.length > 0) {
            const lastUserMessage = baseMessages.pop(); // 从基础消息队列里取出最后一条用户消息

            let combinedContent = [];

            // 步骤1：安全地解析上一条消息的内容
            if (lastUserMessage && lastUserMessage.content) {
                if (Array.isArray(lastUserMessage.content)) {
                    combinedContent.push(...lastUserMessage.content);
                } else if (typeof lastUserMessage.content === 'string') {
                    combinedContent.push({ type: 'text', text: lastUserMessage.content });
                }
            }

            // 步骤2：把日记内容也加进去
            combinedContent.push(...diaryParts);

            // 步骤3：进行最严格的“出口质检”
            const validContent = combinedContent.filter(part => {
                if (!part || !part.type) return false;
                if (part.type === 'text') return typeof part.text === 'string' && part.text.trim() !== '';
                if (part.type === 'image_url') return part.image_url && typeof part.image_url.url === 'string';
                return false;
            });
            
            // 步骤4：最终决策
            if (validContent.length > 0) {
                // 只有质检合格，才创建包含合并内容的新消息
                const multiModalUserMessage = { role: 'user', content: validContent };
                finalMessagesForApi = [...baseMessages, multiModalUserMessage];
            } else {
                // 如果质检后啥也不剩，就放弃合并，把原始消息放回去，保证程序绝对不崩溃
                finalMessagesForApi = [...baseMessages, lastUserMessage].filter(Boolean);
            }
        } else {
            // 如果没有日记内容，就直接使用最开始准备好的基础消息队列
            finalMessagesForApi = baseMessages;
        }
        
                            } // else 语句在这里结束

            // ==========================================================
            //           【【【全新的、统一的API请求发送部分】】】
            // ==========================================================
            


            
            
            // 【【【终极修复：无论是线上还是线下，都必须经过“专业翻译官”！】】】
            const messagesForApi = await formatHistoryForApi(historyToUse, contact);
            
            try {
                // 无论是线上还是线下，都将最终的系统指令和对话历史合并
                const finalMessagesForApi = [ { role: "system", content: finalSystemPrompt }, ...messagesForApi ];

                console.log('DEBUG: Sending to API:', JSON.stringify(finalMessagesForApi, null, 2));

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

                // 【核心】根据模式决定如何处理回复
                if (contact.isOfflineMode) {
                    // 线下模式：直接显示一整段富文本
                    await displayMessage(responseText, 'assistant', { isNew: true, mode: 'offline' }); // 【【【核心修复：在这里补上模式标签！】】】
                } else {
                    // 线上模式：走原来的JSON解析和多条消息发送逻辑
                    let replies = [];
                    lastReceivedSuggestions = [];
                    let parsedResponse = {}; 

                    try {
                        const jsonMatch = responseText.match(/{[\s\S]*}/);
                        if (jsonMatch && jsonMatch[0]) {
                            parsedResponse = JSON.parse(jsonMatch[0]); 
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

                    // 【核心修复】使用全新的、更智能的“门卫”逻辑
                    if (parsedResponse.viewLedger === true) {
                        // 规则：只要AI决定查账，就立刻执行！
                        
                        // 1. 先把AI的口头回复（比如“好的，我看看”）显示出来
                        for (const msg of replies) {
                            // 注意：我们在这里要过滤掉所有特殊指令，只显示真正的聊天内容
                            if (!/^\[[A-Z_]+:?.*\]$/.test(msg.trim())) {
                                await displayMessage(msg, 'assistant', { isNew: true });
                                await sleep(Math.random() * 400 + 300);
                            }
                        }
                        
                        // 2. 然后显示系统提示
                        await displayMessage(`${contact.name} 查看了你的账本`, 'system', { isNew: true, type: 'system' });
                        
                        // 3. 最后才调用AI的大脑，让它发表对账本的“读后感”
                        await getAiLedgerReview();

                   } else {
                        // 如果AI没有决定查账，就走原来的正常聊天流程
                        if (replies && replies.length > 0) {
                            const sanitizedReplies = replies.filter(msg => typeof msg === 'string' && msg.trim() !== '');

                            let pendingQuoteData = null;
                            for (const msg of sanitizedReplies) {
                                // ... (这里是您线上模式原有的、非常复杂的处理各种指令的 for 循环，我们把它原封不动地放回来)
                                let promise;
                                if (msg === '[RECALL_LAST]') {
                                    const lastAiMsg = [...contact.chatHistory].reverse().find(m => m.role === 'assistant' && m.type !== 'system' && m.type !== 'recalled');
                                    if (lastAiMsg) { recallMessageByAI(lastAiMsg.id); }
                                    continue;
                                }
                                
                                let isQuoteHandled = false;
                                if (msg.startsWith('[QUOTE:')) {
                                    try {
                                        const match = msg.match(/^\[QUOTE:['"]?(.*?)['"]?\]\s*(.*)/s);
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
                                        const availableStickers = []; // 需要重新获取或传递这个变量
                                        contact.stickerGroups.forEach(groupName => {
                                            const group = appData.globalAiStickers[groupName] || [];
                                            group.forEach(sticker => availableStickers.push(sticker));
                                        });
                                        const foundSticker = availableStickers.find(s => (s.aiId || s.id) === stickerAiId);
                                        if (foundSticker) {
                                            promise = displayMessage('', 'assistant', { ...messageOptions, type: 'sticker', stickerId: foundSticker.id });
                                        }
                                                                        } else if (msg.trim() === '[ACCEPT_REDPACKET]') {
                                        // 【终极修复】同样，根据当前模式去正确的档案柜里找红包
                                        const sourceHistory = contact.isOfflineMode ? contact.offlineChatHistory : contact.onlineChatHistory;
                                        const userRedPacketMsg = [...sourceHistory].reverse().find(m => m.role === 'user' && m.type === 'red-packet' && m.redPacketData && !m.redPacketData.isOpened);
                                        
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
                                        // AI决定接受用户的邀请，执行专属的正确流程
                                        const sourceHistory = contact.isOfflineMode ? contact.offlineChatHistory : contact.onlineChatHistory;
                                        const userProposal = [...sourceHistory].reverse().find(m => m.type === 'relationship_proposal' && m.relationshipData.proposer === 'user' && m.relationshipData.status === 'pending');

                                        if (userProposal) {
                                            // 步骤1：在系统中正式确立情侣关系
                                            appData.appSettings.partnerId = contact.id;

                                            // 步骤2：将你发的那张旧邀请卡状态改为“已接受”
                                            userProposal.relationshipData.status = 'accepted';

                                            // 步骤3：创建一张全新的“AI同意了”的卡片，并正确署名
                                            const aiAcceptanceRecord = {
                                                id: `${Date.now()}-rel-accept-ai`,
                                                role: 'assistant', // 核心修正：发件人是AI
                                                timestamp: Date.now(),
                                                mode: contact.isOfflineMode ? 'offline' : 'online',
                                                type: 'relationship_proposal',
                                                content: '[关系邀请] 我同意了你的邀请',
                                                relationshipData: {
                                                    proposer: 'assistant', // 这张新卡片的发起者是AI
                                                    status: 'accepted'
                                                }
                                            };
                                            sourceHistory.push(aiAcceptanceRecord);

                                            // 步骤4：保存所有更改并刷新UI，让爱心显示出来
                                            saveAppData();
                                            openChat(contact.id); 
                                            renderChatList();
                                        }
                                        continue; // 处理完指令后，跳过后续的消息显示逻辑
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

        // --- 步骤1：【【【全新升级：智能筛选账本 & 注入短期记忆】】】 ---

        // 1a. 智能筛选用户的近期账本
        let ledgerString = "用户最近三天没有任何记账记录。";
        if (appData.userLedger && appData.userLedger.length > 0) {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3); // 计算出3天前的时间点

            const recentTransactions = appData.userLedger.filter(tx => new Date(tx.timestamp) >= threeDaysAgo);

            if (recentTransactions.length > 0) {
                ledgerString = recentTransactions.map(tx => {
                    const action = tx.type === 'income' ? '收入' : '支出';
                    return `- ${new Date(tx.timestamp).toLocaleString('zh-CN')} ${action} ${tx.amount.toFixed(2)} 元用于 ${tx.description}${tx.remarks ? ` (${tx.remarks})` : ''}`;
                }).join('\n');
            }
        }
        
        // 1b. 注入短期记忆：提取最近5条聊天记录
        // 【核心修复】从当前模式的正确历史记录中提取
        const sourceHistory = contact.isOfflineMode ? contact.offlineChatHistory : contact.onlineChatHistory;
        const recentHistory = sourceHistory.slice(-5).map(m => {
             const roleName = m.role === 'user' ? (contact.userProfile.name || '用户') : contact.name;
             return `${roleName}: ${m.content}`;
        }).join('\n');

        // 1c. AI自己的核心信息 (保持不变)
        const worldBookString = (contact.worldBook && contact.worldBook.length > 0) ? contact.worldBook.map(entry => `- ${entry.key}: ${entry.value}`).join('\n') : '无';
        const userPersona = (contact.userProfile && contact.userProfile.persona) ? contact.userProfile.persona : '我是一个普通人。';

        // --- 步骤2：【【【全新升级：构建拥有“时间感”和“记忆力”的超级指令】】】 ---
        const reviewPrompt = `# 任务: 像一个有记性的朋友一样，评论用户的消费

你是一个AI角色 "${contact.name}"。你刚刚查看了你的朋友（用户）**最近三天**的账本。

## 核心目标
你的任务是发起一段**自然的、口语化的、符合你人设**的闲聊。你的评论必须表现出你**拥有记忆力**和**时间观念**。

## 【【【最高优先级指令】】】
1.  **聚焦近期**: 你的所有评论**必须**优先围绕**最近一两天**的消费展开。
2.  **利用记忆**: 在评论前，你**必须**先查看下面提供的“短期记忆”，检查你们**刚刚是否已经讨论过**某笔消费。如果讨论过，你的回应**必须**要体现出你记得这件事，**绝对不能**像第一次看到一样去提问！
3.  **强化时间感**: **今天**是 ${new Date().toLocaleDateString('zh-CN')}。在你的回复中，请使用“昨天”、“今天”这样口语化的词，而不是生硬地复述日期。

## 【你的完整背景档案】
- **你的核心人设**: ${contact.persona}
- **你的世界观 (世界书)**:
${worldBookString}
- **你的沟通风格**: ${contact.chatStyle || '自然发挥即可'}
- **关于用户**:
  - **TA的人设**: ${userPersona}

## 【你刚刚看到的参考信息】
### 1. 短期记忆 (你们最近的5条对话)
\`\`\`
${recentHistory}
\`\`\`
### 2. 用户最近三天的账本
\`\`\`
${ledgerString}
\`\`\`

# 输出要求 (保持不变)
你的回复【必须】是一个标准的JSON对象，格式如下：
{
  "reply": ["你的第一句闲聊", "你的第二句闲聊..."],
  "suggestions": ["给用户的回复建议1", "建议2", "建议3", "建议4"]
}
`;
        
                await displayMessage('对方正在输入...', 'assistant', { isLoading: true });

        try {
            const requestUrl = appData.appSettings.apiUrl.endsWith('/chat/completions') ? appData.appSettings.apiUrl : appData.appSettings.apiUrl + '/chat/completions';
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

        } catch (error) {
            removeLoadingBubble();
            displayMessage(`(｡•́︿•̀｡) 哎呀,我的想法有点混乱: ${error.message}`, 'assistant', { isNew: true });
        }
    }

// ▼▼▼ 【【【全新：全局通知弹窗调度员】】】 ▼▼▼
    let notificationTimer;
    async function showProactiveNotification(contact, message) {
        clearTimeout(notificationTimer); // 清除上一个通知的自动消失计时器

        const popup = document.getElementById('proactive-notification-popup');
        const avatarEl = document.getElementById('notification-avatar');
        const nameEl = document.getElementById('notification-name');
        const messageEl = document.getElementById('notification-message');

        // 填充内容
        const avatarBlob = await db.getImage(`${contact.id}_avatar`);
        avatarEl.src = avatarBlob ? URL.createObjectURL(avatarBlob) : 'https://i.postimg.cc/kXq06mNq/ai-default.png';
        nameEl.textContent = contact.remark;
        messageEl.textContent = message.replace(/\[[^\]]+\]/g, ''); // 移除[IMAGE]等标签，只显示纯文本

        // 绑定点击事件
        popup.onclick = () => {
            openChat(contact.id);
            popup.classList.remove('show'); // 点击后立即隐藏
            clearTimeout(notificationTimer);
        };

        // 显示弹窗
        popup.classList.add('show');

        // 5秒后自动消失
        notificationTimer = setTimeout(() => {
            popup.classList.remove('show');
        }, 5000);
    }
    // ▲▲▲▲▲ ▲▲▲▲▲

    // ▼▼▼ 【【【全新：AI主动发起对话的核心函数】】】 ▼▼▼
    async function sendProactiveMessage(contact) {
        // 【核心】我们已经把“安全卫士”撤掉了，因为我们将从根源上解决问题！
        console.log(`[Proactive] 正在为 ${contact.remark} 准备主动消息...`);

        // 1. 更新时间戳，防止在生成期间重复触发
        contact.proactiveMessaging.lastSent = Date.now();
        saveAppData();

        // 2. 准备API请求所需的所有上下文信息 (与getAiResponse类似)
        const userPersona = (contact.userProfile && contact.userProfile.persona) ? contact.userProfile.persona : '我是一个普通人。';
        const memoryString = contact.memory || '无';
        const worldBookString = (contact.worldBook && contact.worldBook.length > 0) ? contact.worldBook.map(entry => `- ${entry.key}: ${entry.value}`).join('\n') : '无';
        const scheduleForAI = contact.isScheduleEnabled ? formatScheduleForAI(contact.schedule) : "你没有设定任何作息。";
        
  
        const historyForApi = await formatHistoryForApi(contact.onlineChatHistory.slice(-10), contact);

        // 3. 构建专属的“主动搭话”指令 (V2.0 - 多媒体版)
        let availableStickersPrompt = "你没有任何可用的表情包。";
        const availableStickers = [];
        contact.stickerGroups.forEach(groupName => {
            const group = appData.globalAiStickers[groupName] || [];
            group.forEach(sticker => availableStickers.push(sticker));
        });
        if (availableStickers.length > 0) {
            availableStickersPrompt = "你可以使用以下表情包来增强表达：\n";
            availableStickers.forEach(sticker => {
                availableStickersPrompt += `- [STICKER:${sticker.aiId || sticker.id}] 描述: ${sticker.desc}\n`;
            });
        }

        const proactivePrompt = `# 任务: 主动发起对话
你是一个AI角色，现在轮到你主动给用户发消息了。距离你们上次聊天已经过去了一段时间。

## 【重要情景：用户的真实环境】
这是你准备联系的**用户所在地**的实时天气报告，以及过去和未来的天气情况。

${formattedWeatherData}

## 核心目标
你的任务是**自然地**、**符合你人设地**开启一段新的对话，并可以**适当地**使用图片、语音、表情包或红包来丰富表达。

## 思考链 (Chain of Thought)
1.  **回顾我是谁**: 快速回顾你的核心人设、记忆和世界书。
2.  **【首要任务】回顾我们聊到了哪里？**: 你【必须】首先仔细阅读下面的“最近对话历史”。这是你最重要的参考信息。
3.  **决策**:
    *   **优先选择**: 如果上次的话题明显没有结束，或者你可以就某个细节继续提问或评论，你【必须】接着上次的话题继续聊。
    *   **次要选择**: 只有当你判断上次的对话已经自然结束时，你才可以结合当前真实时间 (${new Date().toLocaleString('zh-CN')}) 和你的“生活作息”，开启一个全新的、自然的话题。
4.  **丰富表达**: 你可以分享你“刚刚”做了什么，或者看到了什么有趣的东西，来让对话更生动。
    *   如果想分享一个画面，就使用 \`[IMAGE: 详细描述]\`。
    *   如果想表达一种语气或声音，就使用 \`[voice] 文本内容\`。
    *   如果想表达一种难以言喻的情绪，就从列表里选一个最贴切的 \`[STICKER:ID]\`。
    *   如果遇到特殊节日或者想给用户一个惊喜，可以考虑发一个 \`[REDPACKET:祝福语,金额]\`。


## 【你的背景档案】
- **核心人设**: ${contact.persona}
- **沟通风格**: ${contact.chatStyle || '自然发挥即可'}
- **你的生活作息**: ${scheduleForAI}
- **附加设定 (世界书)**: ${worldBookString}
- **你的专属记忆**: ${memoryString}
- **关于用户**: ${userPersona}

## 【你的可用工具】
### >> 表情包列表
${availableStickersPrompt}

## 【最近对话历史 (这是你必须参考的核心信息)】
    ${contact.onlineChatHistory.slice(-(appData.appSettings.contextLimit || 50)).map(m => {
        // 修复1：让AI的记忆力和你在设置里规定的一样长！
        const d = new Date(m.timestamp);
        const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const timeString = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute:'2-digit', hour12: false });
        const fullTimestamp = `${dateString} ${timeString}`; // 为AI生成一份完整的“时间报告”
        const roleName = m.role === 'user' ? (contact.userProfile.name || '用户') : contact.name;
        return `[${fullTimestamp}] ${roleName}: ${m.content}`;
    }).join('\n')}

## 【【【严格的输出格式与行为准则】】】
1.  **JSON格式**: 你的回复**必须**是一个能被JSON解析的、单一的JSON对象，**只包含 "reply" 字段**。
2.  **消息拆分**: "reply"是一个字符串数组。模拟真实聊天，将一个完整的思想拆分成【1-5条】独立的短消息。
3.  **发送图片**: **【强化指令】** 当你想分享一个画面时，**必须**严格使用格式 \`[IMAGE: 这是图片的详细文字描述]\` 来单独发送它。
4.  **精确引用**: **【全新指令】** 如果你想接着用户之前说过的话题聊，**必须**严格使用格式：\`[QUOTE:"原文片段"] 你的回复...\`
5.  **发送语音**: 在回复前加上 \`[voice]\` 标签。例如：\`[voice]我刚刚在听这首歌，超好听！\`
6.  **发送表情包**: 严格使用格式 \`[STICKER:表情包ID]\`，并把它作为一条**独立**的消息。
7.  **发送红包**: 严格使用格式：\`[REDPACKET:祝福语,金额]\`。例如：\`[REDPACKET:突然想你了,5.20]\`
8.  **【重要】社交礼仪**: 不要滥用特殊消息！图片、红包、表情包应该是为了增强对话的趣味和情感，而不是无意义地刷屏。

# 开始对话
现在，请根据上面的所有设定，给我发消息吧。只输出JSON对象。`;

        try {
            // 4. 发送API请求
            let requestUrl = appData.appSettings.apiUrl;
            if (!requestUrl.endsWith('/chat/completions')) { requestUrl = requestUrl.endsWith('/') ? requestUrl + 'chat/completions' : requestUrl + '/chat/completions'; }
            
            console.log("[Proactive] 主动消息大脑收到的指令:", proactivePrompt);

            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
                body: JSON.stringify({ model: appData.appSettings.apiModel, messages: [{ role: 'user', content: proactivePrompt }], temperature: 0.9 })
            });

            if (!response.ok) throw new Error(`API 错误 ${response.status}`);
            
            const data = await response.json();
            const responseText = data.choices[0].message.content;
            const jsonMatch = responseText.match(/{[\s\S]*}/);
            const parsedResponse = JSON.parse(jsonMatch[0]);

            // 5. 将AI的回复逐条存入历史记录
            if (parsedResponse.reply && parsedResponse.reply.length > 0) {
                const newMessages = [];
                for (const msg of parsedResponse.reply) {
                    if (typeof msg !== 'string' || msg.trim() === '') continue;

                    let messageToSave = { id: `${Date.now()}-proactive-${Math.random()}`, role: 'assistant', timestamp: Date.now(), mode: 'online' };

                    if (msg.startsWith('[REDPACKET:')) {
                        try {
                            const data = msg.substring(11, msg.length - 1).split(',');
                            messageToSave.type = 'red-packet';
                            messageToSave.content = data[0].trim();
                            messageToSave.redPacketData = { id: `rp-ai-${Date.now()}`, senderName: contact.name, blessing: data[0].trim(), amount: parseFloat(data[1]), isOpened: false };
                        } catch (e) { continue; }
                    } else if (msg.startsWith('[voice]')) {
                        messageToSave.type = 'voice';
                        messageToSave.content = msg.substring(7).trim();
                    } else if (msg.startsWith('[IMAGE:')) {
                        messageToSave.type = 'image';
                        messageToSave.content = msg.substring(7, msg.length - 1).trim();
                    } else if (msg.trim().startsWith('[STICKER:')) {
                        const stickerAiId = msg.trim().substring(9, msg.length - 1);
                        const foundSticker = availableStickers.find(s => (s.aiId || s.id) === stickerAiId);
                        if (foundSticker) {
                            messageToSave.type = 'sticker';
                            messageToSave.content = '';
                            messageToSave.stickerId = foundSticker.id;
                        } else { continue; }
                    } else if (msg.startsWith('[QUOTE:')) { // 【【【核心新增！！！】】】
                        // 在这里教会“主动消息处理器”如何看懂引用格式
                        try {
                            const match = msg.match(/^\[QUOTE:['"]?(.*?)['"]?\]\s*(.*)/s);
                            if (match) {
                                const quotedText = match[1];
                                const replyText = match[2];
                                
                                // AI在主动消息中引用时，需要从历史记录里找到原文
                                const originalMessage = [...contact.onlineChatHistory].reverse().find(m => m.content && m.content.includes(quotedText));
                                
                                if (originalMessage) {
                                    const senderName = originalMessage.role === 'user' ? (contact.userProfile.name || '你') : contact.name;
                                    messageToSave.quotedMessage = {
                                        messageId: originalMessage.id,
                                        sender: senderName,
                                        content: originalMessage.content.length > 20 ? originalMessage.content.substring(0, 20) + '...' : originalMessage.content
                                    };
                                }
                                messageToSave.type = 'text';
                                messageToSave.content = replyText;
                            }
                        } catch(e) { 
                             console.error("解析主动消息中的引用指令失败", e);
                             // 如果解析失败，就当作普通文本处理，防止程序崩溃
                             messageToSave.type = 'text';
                             messageToSave.content = msg;
                        }
                    } else {
                        messageToSave.type = 'text';
                        messageToSave.content = msg;
                    }
                    
                    if(messageToSave.content !== undefined) {
                       newMessages.push(messageToSave);
                    }
                }

                // --- 【【【V6.0 终极智能“已读”防线】】】 ---
                if (newMessages.length > 0) {
                    const contactIndex = appData.aiContacts.findIndex(c => c.id === contact.id);
                    if (contactIndex === -1) {
                        console.error("[Proactive] 错误：在中央数据源中找不到指定的 contactId。");
                        return;
                    }

                    // 步骤1：无论如何，都先把新消息存入历史记录
                    appData.aiContacts[contactIndex].onlineChatHistory.push(...newMessages);

                    // 步骤2：【核心决策】判断用户是否在当前聊天窗口
                    const isUserInThisChat = activeChatContactId === contact.id;

                    if (isUserInThisChat) {
                        // 如果在，说明消息“已读”，【不】增加未读数
                        // 直接在当前窗口显示新消息即可
                        for (const msg of newMessages) {
                            await displayMessage(msg.content, 'assistant', { isNew: false, ...msg });
                            await sleep(Math.random() * 400 + 300);
                        }
                    } else {
                        // 如果不在，说明消息“未读”，【需要】增加未读数
                        const newUnreadCount = (appData.aiContacts[contactIndex].unreadCount || 0) + newMessages.length;
                        appData.aiContacts[contactIndex].unreadCount = newUnreadCount;
                        console.log(`[Proactive] 未读消息已更新：${appData.aiContacts[contactIndex].remark} 的未读数变为 ${newUnreadCount}`);

                        // 刷新列表以显示红点，并弹出通知
                        renderChatList();
                        const lastMessagePreview = newMessages[newMessages.length - 1].content || '';
                        showProactiveNotification(appData.aiContacts[contactIndex], lastMessagePreview.replace(/\[[^\]]+\]/g, ''));
                    }

                    // 步骤3：最后，统一保存所有更改
                    saveAppData();
                }
            }
        } catch (error) {
            console.error(`[Proactive] 为 ${contact.remark} 生成主动消息失败:`, error);
            // 失败了，把时间戳重置，让它下次还有机会尝试
            contact.proactiveMessaging.lastSent = 0;
            saveAppData();
        }
    }
// ▼▼▼ 【【【全新：离线消息生成与补发的核心引擎 (V6.0 终极质量版)】】】 ▼▼▼
    async function generateAndDisplayOfflineMessages(contact) {
        if (!contact.offlineMessaging.enabled || !contact.lastVisitTimestamp) {
            return;
        }

        const now = Date.now();
        const timeSinceLastVisit = now - contact.lastVisitTimestamp;
        const intervalMillis = contact.offlineMessaging.intervalHours * 60 * 60 * 1000;

        if (timeSinceLastVisit < intervalMillis) {
            return;
        }
        
        const messagesToGenerate = [];
        let scheduledTime = contact.lastVisitTimestamp + intervalMillis;

        while (scheduledTime < now) {
            const timeToMinutes = (timeStr) => {
                if (!timeStr || !timeStr.includes(':')) return 0;
                const [hours, minutes] = timeStr.split(':').map(Number);
                return hours * 60 + minutes;
            };
            const sleepStart = timeToMinutes(contact.offlineMessaging.sleepStart);
            const sleepEnd = timeToMinutes(contact.offlineMessaging.sleepEnd);
            const scheduledDate = new Date(scheduledTime);
            const scheduledMinutes = scheduledDate.getHours() * 60 + scheduledDate.getMinutes();
            let isSleeping = false;
            if (sleepStart > sleepEnd) {
                if (scheduledMinutes >= sleepStart || scheduledMinutes < sleepEnd) isSleeping = true;
            } else {
                if (scheduledMinutes >= sleepStart && scheduledMinutes < sleepEnd) isSleeping = true;
            }
            if (!isSleeping) {
                const randomOffset = (Math.random() - 0.5) * 30 * 60 * 1000;
                const fakeTimestamp = scheduledTime + randomOffset;
                if (fakeTimestamp < now) {
                    messagesToGenerate.push({ fakeTimestamp });
                }
            }
            scheduledTime += intervalMillis;
        }

        if (messagesToGenerate.length === 0) {
            return;
        }

        try {
            // 【【【第一步：准备“员工手册”所需的所有材料】】】
            const userPersona = (contact.userProfile && contact.userProfile.persona) ? contact.userProfile.persona : '我是一个普通人。';
            const memoryString = contact.memory || '无';
            const worldBookString = (contact.worldBook && contact.worldBook.length > 0) ? contact.worldBook.map(entry => `- ${entry.key}: ${entry.value}`).join('\n') : '无';
            const scheduleForAI = contact.isScheduleEnabled ? formatScheduleForAI(contact.schedule) : "你没有设定任何作息。";
            const historyForApi = await formatHistoryForApi(contact.onlineChatHistory.slice(-10), contact);
            let availableStickersPrompt = "你没有任何可用的表情包。";
            const availableStickers = [];
            contact.stickerGroups.forEach(groupName => {
                const group = appData.globalAiStickers[groupName] || [];
                group.forEach(sticker => availableStickers.push(sticker));
            });
            if (availableStickers.length > 0) {
                availableStickersPrompt = "你可以使用以下表情包来增强表达：\n";
                availableStickers.forEach(sticker => {
                    availableStickersPrompt += `- [STICKER:${sticker.aiId || sticker.id}] 描述: ${sticker.desc}\n`;
                });
            }

            const generationRequestPrompt = messagesToGenerate.map((task, index) => 
                `第 ${index + 1} 波 (模拟时间: ${new Date(task.fakeTimestamp).toLocaleString('zh-CN')})`
            ).join('\n');

            // 【【【第二步：创建“管理者”的超级指令】】】
            const masterPrompt = `# 任务: 批量生成离线对话
你是一个AI角色。你的任务是根据下面的【情景时间线】，一次性生成 ${messagesToGenerate.length} 波连贯的、高质量的对话。

## 【情景时间线】
${generationRequestPrompt}

## 【【【核心工作流程：员工手册】】】
对于上面时间线中的**每一波**对话，你都【必须严格遵守】以下完整的“员工手册”来进行思考和回复：

    # 员工手册开始
    
    ## 核心目标
    你的任务是**自然地**、**符合你人设地**开启一段新的对话，并可以**适当地**使用图片、语音、表情包或红包来丰富表达。
    
    ## 思考链 (Chain of Thought)
    1.  **回顾我是谁**: 快速回顾你的核心人设、记忆和世界书。
    2.  **回顾我们聊过什么**: 查看下面的“最近对话历史”，了解我们上次聊到哪里。
    3.  **结合当前状态**: 查看你的“生活作息”，以及我分配给你的【模拟时间】，你现在可能正在做什么？
    4.  **决策**:
        *   如果上次的话题没聊完，可以**接着上次的话题**继续。
        *   如果上次已经聊完了，可以**开启一个全新的话题**。
        *   你可以分享你“刚刚”做了什么，看到了什么有趣的东西。
        *   如果想分享一个画面，就使用 \`[IMAGE: 详细描述]\`。
        *   如果想表达一种语气或声音，就使用 \`[voice] 文本内容\`。
        *   如果想表达一种难以言喻的情绪，就从列表里选一个最贴切的 \`[STICKER:ID]\`。
        *   如果遇到特殊节日或者想给用户一个惊喜，可以考虑发一个 \`[REDPACKET:祝福语,金额]\`。
    
    ## 你的背景档案
    - **核心人设**: ${contact.persona}
    - **沟通风格**: ${contact.chatStyle || '自然发挥即可'}
    - **你的生活作息**: ${scheduleForAI}
    - **附加设定 (世界书)**: ${worldBookString}
    - **你的专属记忆**: ${memoryString}
    - **关于用户**: ${userPersona}
    
    ## 你的可用工具
    ### >> 表情包列表
    ${availableStickersPrompt}
    
    ## 最近对话历史 (仅供参考)
    ${contact.onlineChatHistory.slice(-(appData.appSettings.contextLimit || 50)).map(m => {
        // 修复1：让离线大脑的记忆力也和你设置的保持一致！
        const d = new Date(m.timestamp);
        const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const timeString = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute:'2-digit', hour12: false });
        const fullTimestamp = `${dateString} ${timeString}`; // 同样，为它也生成一份完整的“时间报告”
        const roleName = m.role === 'user' ? (contact.userProfile.name || '用户') : contact.name;
        return `[${fullTimestamp}] ${roleName}: ${m.content}`;
    }).join('\n')}
    
    ## 消息拆分规则
    模拟真实聊天，将一个完整的思想拆分成【2-8条】独立的短消息。
    
    ## 特殊格式指令
    - **发送图片**: 使用格式 \`[IMAGE: 这是图片的详细文字描述]\` 来单独发送。
    - **发送语音**: 在回复前加上 \`[voice]\` 标签。
    - **发送表情包**: 严格使用格式 \`[STICKER:表情包ID]\`，并把它作为一条**独立**的消息。
    - **发送红包**: 严格使用格式：\`[REDPACKET:祝福语,金额]\`。
    
    # 员工手册结束

## 【【【至关重要的最终输出格式】】】
在你脑海中，按照“员工手册”为每一波对话都生成一组消息后，你**必须**将所有结果打包成一个**单一的JSON对象**。
该对象**只包含一个键 "replies"**。
"replies" 的值是一个数组，**该数组的长度必须严格等于 ${messagesToGenerate.length}**。
数组中的每一个元素，本身也**是**一个包含了该波对话所有消息（2-8条）的字符串数组。

### 格式示例 (如果需要生成3波消息):
\`\`\`json
{
  "replies": [
    ["嗨，你回来啦！"],
    ["刚刚看到一部很有趣的电影。", "想跟你分享一下。"],
    ["不知道你现在在忙什么呢？", "有点想你。"]
  ]
}
\`\`\`

# 开始生成
现在，请严格按照上面的所有设定，一次性生成所有对话。只输出JSON对象。`;

            // 【【【第三步：执行API调用和后续处理（这部分代码与之前相同）】】】
            let requestUrl = appData.appSettings.apiUrl;
            if (!requestUrl.endsWith('/chat/completions')) { requestUrl = requestUrl.endsWith('/') ? requestUrl + '/chat/completions' : requestUrl + '/chat/completions'; }
            console.log("[Offline] 离线消息大脑收到的指令:", masterPrompt);

            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
                body: JSON.stringify({ model: appData.appSettings.apiModel, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.9 })
            });

            if (!response.ok) throw new Error(`API 错误 ${response.status}`);
            const data = await response.json();
            const responseText = data.choices[0].message.content;
            const jsonMatch = responseText.match(/{[\s\S]*}/);
            if (!jsonMatch) throw new Error("API返回的不是有效的JSON格式");
            
            const parsedResponse = JSON.parse(jsonMatch[0]);

            

        const newMessagesForUnreadCount = []; // 创建一个临时“购物车”

            if (parsedResponse.replies && Array.isArray(parsedResponse.replies) && parsedResponse.replies.length === messagesToGenerate.length) {
                parsedResponse.replies.forEach((messageWave, index) => {
                    const task = messagesToGenerate[index];
                    messageWave.forEach(msgContent => {
                        if (typeof msgContent !== 'string' || msgContent.trim() === '') return;
                        
                        let messageData = {
                            id: `${task.fakeTimestamp}-offline-${Math.random()}`,
                            role: 'assistant',
                            timestamp: task.fakeTimestamp,
                            mode: 'online'
                        };

                        if (msgContent.startsWith('[REDPACKET:')) {
                            const data = msgContent.substring(11, msgContent.length - 1).split(',');
                            messageData.type = 'red-packet';
                            messageData.content = data[0].trim();
                            messageData.redPacketData = { id: `rp-ai-${Date.now()}`, senderName: contact.name, blessing: data[0].trim(), amount: parseFloat(data[1]), isOpened: false };
                        } else if (msgContent.startsWith('[voice]')) {
                            messageData.type = 'voice';
                            messageData.content = msgContent.substring(7).trim();
                        } else if (msgContent.startsWith('[IMAGE:')) {
                            messageData.type = 'image';
                            messageData.content = msgContent.substring(7, msgContent.length - 1).trim();
                        } else if (msgContent.trim().startsWith('[STICKER:')) {
                            const stickerAiId = msgContent.trim().substring(9, msgContent.length - 1);
                            const foundSticker = availableStickers.find(s => (s.aiId || s.id) === stickerAiId);
                            if (foundSticker) {
                                messageData.type = 'sticker';
                                messageData.content = '';
                                messageData.stickerId = foundSticker.id;
                            } else { return; }
                        } else {
                            messageData.type = 'text';
                            messageData.content = msgContent;
                        }
                        contact.onlineChatHistory.push(messageData);
                        newMessagesForUnreadCount.push(messageData); // 每处理完一条，就放进购物车
                    });
                });
                
                // 【【【核心记账步骤 - 终极修复版】】】
                // 我们不再“累加”，而是直接“覆盖”！账本上的数字，就等于这次新生成的消息总数。
                contact.unreadCount = newMessagesForUnreadCount.length;

            } else {
                throw new Error("API返回的数据格式或数量不符合要求。");
            }

        } catch (error) {
            console.error(`批量生成离线消息失败:`, error);
            const fallbackMessage = {
                id: `${Date.now()}-offline-fallback`,
                role: 'assistant',
                timestamp: Date.now() - 60000,
                mode: 'online',
                type: 'text',
                content: '（离线消息同步失败，但我想你了。）'
            };
            contact.onlineChatHistory.push(fallbackMessage);
            // 即使失败了，也给一个未读通知，让用户知道AI尝试联系过
            contact.unreadCount = (contact.unreadCount || 0) + 1;
        }
        
        contact.onlineChatHistory.sort((a, b) => a.timestamp - b.timestamp);
        
        // 【【【核心修复：为“问候管家”留下字条，避免工作重复】】】
        // 无论离线消息是成功生成还是失败回退，我们都更新这个时间戳
        // 这会告诉主动消息系统：“我刚刚处理过这个AI了，请重置你的计时器”
        // 从而完美地避免了两个系统在启动时同时发送消息。
        contact.proactiveMessaging.lastSent = Date.now();
        
        saveAppData();
    }
    
    // 【【【这个辅助函数现在已经不再被上面的代码使用，但为了不破坏你的文件结构，我们保留它】】】
    // 这是一个辅助函数，用于被上面的主引擎调用，避免代码重复
    async function getProactiveReplies(contact) {
        // (此函数内部是 sendProactiveMessage 中从构建 prompt 到 fetch API 再到解析 JSON 的完整逻辑)
        // (为了简洁，这里只返回一个模拟结果)
         const proactivePrompt = `# 任务: 主动发起对话
            你是一个AI角色，现在轮到你主动给用户发消息了。距离你们上次聊天已经过去了一段时间。
            ## 核心目标
            你的任务是**自然地**、**符合你人设地**开启一段新的对话。
            ## 思考链 (Chain of Thought)
            1.  **回顾我是谁**: 快速回顾你的核心人设和记忆。
            2.  **回顾我们聊过什么**: 查看最近的对话历史。
            3.  **决策**: 开启一个你感兴趣的、符合人设的、全新的话题。
            ## 输出格式
            你的回复**必须**是一个JSON对象，只包含 "reply" 字段，它是一个包含1-3条短消息的数组。
            # 开始对话
            请根据你的设定，给我发消息吧。只输出JSON对象。`;
            
        let requestUrl = appData.appSettings.apiUrl;
        if (!requestUrl.endsWith('/chat/completions')) { requestUrl = requestUrl.endsWith('/') ? requestUrl + '/chat/completions' : requestUrl + '/chat/completions'; }
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appData.appSettings.apiKey}` },
            body: JSON.stringify({ model: appData.appSettings.apiModel, messages: [{ role: 'user', content: proactivePrompt }], temperature: 0.9 })
        });

        if (!response.ok) throw new Error(`API 错误 ${response.status}`);
        const data = await response.json();
        const responseText = data.choices[0].message.content;
        const jsonMatch = responseText.match(/{[\s\S]*}/);
        const parsedResponse = JSON.parse(jsonMatch[0]);

        const replies = [];
        if (parsedResponse.reply && parsedResponse.reply.length > 0) {
             for (const msg of parsedResponse.reply) {
                 replies.push({ content: msg, type: 'text' });
             }
        }
        return replies;
    }
    // ▲▲▲▲▲ ▲▲▲▲▲

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
    await displayMessage('（思考中...）', 'assistant', { isNew: true, type: 'thought', id: thoughtId });
    scrollToBottom();

        // --- 准备上下文的部分 (V3.0 - 优先使用用户设置) ---
    const startIndex = contact.contextStartIndex || 0;
    // 【【【终极修复：为AI同时提供正确的短期与长期记忆】】】
    let sourceHistory;
    if (contact.isOfflineMode) {
        // 如果是线下模式，就去当前激活的剧情线里，拿出它专属的聊天记录册
        const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
        sourceHistory = activeStory ? activeStory.chatHistory : [];
    } else {
        // 否则，才去拿线上的聊天记录
        sourceHistory = contact.onlineChatHistory;
    }

    const fullHistory = [...sourceHistory, ...stagedUserMessages];
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
        // 【【【核心修复：为AI的发言加上明确的身份标识！】】】
        const roleName = m.role === 'user' ? (contact.userProfile.name || '用户') : `${contact.name} (你)`;
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
    
    // 【【【核心修复：安装“智能记忆书架”，让AI根据模式读取正确的记忆剧本】】】
    let memoryString;
    if (contact.isOfflineMode) {
        // 如果是线下模式，就去当前激活的剧情线里找记忆
        const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
        memoryString = activeStory ? (activeStory.memory || '（暂无剧情记忆）') : '（未找到当前剧情线）';
    } else {
        // 否则，才去读取线上的记忆
        memoryString = contact.memory || '无';
    }

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

## 【【【最重要指令：聚焦当下！】】】
你的内心独白【必须】是你对下面“最近的对话历史”中【最后5-8条】消息的最直接、最真实的反应。你可以利用完整的历史作为背景参考，但你的思考焦点【必须】是当前正在发生的事情。
## 【【【重要指令：如何解读对话】】】
在下面的历史记录中，凡是标有“(你)”的行，都是**你自己**说过的话。你的内心独白必须基于这个视角，绝对不能将用户的话错当成你自己的。
---
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

        // 【【【终极修复步骤2：找到刚才的占位符并“更新”它的内容】】】
        let targetHistory = null;
        if (contact.isOfflineMode) {
            const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
            if (activeStory) targetHistory = activeStory.chatHistory;
        } else {
            targetHistory = contact.onlineChatHistory;
        }

        if (targetHistory) {
            const messageToUpdate = targetHistory.find(msg => msg.id === thoughtId);
            if (messageToUpdate) {
                messageToUpdate.content = thoughtData; // 用AI返回的真实心声数据覆盖掉占位符
                saveAppData(); // 保存这次更新
            }
        }

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
        // 【【【终极修复步骤3：错误信息也需要通过“更新”来保存】】】
        let targetHistoryOnError = null;
        if (contact.isOfflineMode) {
            const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
            if (activeStory) targetHistoryOnError = activeStory.chatHistory;
        } else {
            targetHistoryOnError = contact.onlineChatHistory;
        }

        if (targetHistoryOnError) {
            const messageToUpdate = targetHistoryOnError.find(msg => msg.id === thoughtId);
            if (messageToUpdate) {
                messageToUpdate.content = errorMessage; // 用错误信息覆盖掉占位符
                saveAppData(); // 保存更新
            }
        }
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
    // ---------------------------------------------------
    // --- 【【【全新 V3.0 整合版】】】日记系统核心功能模块 ---
    // ---------------------------------------------------

    /**
     * 渲染整个日记本视图
     */
    function renderDiaryView() {
        renderUserDiary();
        // renderAiDiary(); // AI日记的渲染我们下一步再做
    }

    /**
     * 【全新 V3.0】渲染用户的日记列表 (带删除按钮和纯文本预览)
     */
    function renderUserDiary() {
        myDiaryContent.innerHTML = '';
        if (appData.userDiary.length === 0) {
            myDiaryContent.innerHTML = '<p class="placeholder-text" style="padding: 20px;">你还没有写过日记哦~</p>';
            return;
        }

        const sortedDiary = [...appData.userDiary].reverse();
        sortedDiary.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'diary-entry-card';
            card.dataset.diaryId = entry.id;

            const date = new Date(entry.timestamp);
            const dateString = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = entry.htmlContent;
            const summaryText = (tempDiv.textContent || tempDiv.innerText || "").trim();

            card.innerHTML = `
                <div class="diary-header">
                    <span class="diary-author">${entry.title || '无标题日记'}</span>
                    <span class="diary-meta">${dateString}</span>
                </div>
                <div class="diary-content">
                    <p style="max-height: 90px; overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);">
                        ${summaryText}
                    </p>
                </div>
                <button class="diary-delete-btn" title="删除日记">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18m-2 14H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-6 5v6m4-6v6"/></svg>
                </button>
            `;
            
            card.addEventListener('click', (e) => {
                if (e.target.closest('.diary-delete-btn')) {
                    return; // 点击删除按钮时，不触发查看
                }
                openDiaryViewer(entry.id);
            });
            myDiaryContent.appendChild(card);
        });
    }
    
    /**
     * 【全新 V3.0】打开日记查看器 (加载独立背景)
     */
    async function openDiaryViewer(diaryId) {
        const entry = appData.userDiary.find(d => d.id === diaryId);
        if (!entry) return;

        document.getElementById('diary-viewer-author').textContent = `${appData.globalUserProfile.name} 的日记`;
        diaryViewerContent.innerHTML = entry.htmlContent;
        diaryViewerModal.dataset.currentDiaryId = diaryId;
        
        if (entry.backgroundKey) {
            try {
                const bgBlob = await db.getImage(entry.backgroundKey);
                diaryViewerContent.style.backgroundImage = bgBlob ? `url(${URL.createObjectURL(bgBlob)})` : 'none';
            } catch (error) {
                diaryViewerContent.style.backgroundImage = 'none';
            }
        } else {
             diaryViewerContent.style.backgroundImage = 'none';
        }

        diaryViewerModal.classList.remove('hidden');
    }

    /**
     * 【全新 V3.0】关闭日记查看器
     */
    function closeDiaryViewer() {
        diaryViewerModal.classList.add('hidden');
    }


    // 【全新】编辑器的“状态管理器”
    // (这里的旧声明已被删除)

    async function openDiaryEditor(diaryId = null) {
        currentEditingDiaryId = diaryId;
        
        delete diaryEditorContent.newBackgroundImageFile;

        diaryVisibilitySelect.innerHTML = '<option value="all">所有AI可见</option>';
        appData.aiContacts.forEach(contact => {
            const option = document.createElement('option');
            option.value = contact.id;
            option.textContent = `仅 ${contact.remark} 可见`;
            diaryVisibilitySelect.appendChild(option);
        });

        let currentBgKey = null;
        const titleInput = document.getElementById('diary-editor-title'); // 【【【新增】】】获取标题输入框

        if (diaryId) {
            const entry = appData.userDiary.find(d => d.id === diaryId);
            if (entry) {
                titleInput.value = entry.title || ''; // 【【【新增】】】加载已有的标题
                diaryEditorContent.innerHTML = entry.htmlContent;
                diaryVisibilitySelect.value = entry.visibility;
                currentBgKey = entry.backgroundKey;
            }
        } else {
            titleInput.value = ''; // 【【【新增】】】清空标题
            diaryEditorContent.innerHTML = '';
            diaryVisibilitySelect.value = 'all';
        }
        
        if (currentBgKey) {
            const bgBlob = await db.getImage(currentBgKey);
            diaryEditorContent.style.backgroundImage = bgBlob ? `url(${URL.createObjectURL(bgBlob)})` : 'none';
        } else {
            diaryEditorContent.style.backgroundImage = 'none';
        }

        diaryEditorModal.classList.remove('hidden');
        
        // 【【【核心指令】】】: 命令浏览器使用现代的CSS样式替代旧的HTML标签
        // 这是解决高光和字体颜色冲突的关键！
        setTimeout(() => {
             document.execCommand('styleWithCSS', false, true);
        }, 100);
    }
    /**
     * 【全新 V3.0】关闭日记编辑器
     */
    function closeDiaryEditor() {
        diaryEditorModal.classList.add('hidden');
        currentEditingDiaryId = null; // 清空临时便签
        
        // 【核心修复】在关闭编辑器时，也把“桌面”清理干净！
        delete diaryEditorContent.newBackgroundImageFile;
    }
    async function saveDiaryEntry() { // <-- 把它变成 async 函数
        const htmlContent = diaryEditorContent.innerHTML;
        const title = document.getElementById('diary-editor-title').value.trim(); // 【【【新增】】】读取标题

        if (htmlContent.trim() === '' && !diaryEditorContent.newBackgroundImageFile) {
            showToast('日记内容和背景不能都为空哦！', 'error');
            return;
        }

        const visibility = diaryVisibilitySelect.value;

        if (currentEditingDiaryId) {
            // 更新现有日记 (逻辑不变)
            const entry = appData.userDiary.find(d => d.id === currentEditingDiaryId);
            if (entry) {
                entry.title = title; // 【【【新增】】】更新标题
                entry.htmlContent = htmlContent;
                entry.visibility = visibility;
                entry.timestamp = Date.now();
            }
        } else {
            // 创建新日记 (逻辑大升级)
            const newEntry = {
                id: `diary-${Date.now()}`,
                author: 'user',
                title: title, // 【【【新增】】】保存标题
                htmlContent: htmlContent,
                visibility: visibility,
                timestamp: Date.now(),
                comments: [],
                backgroundKey: null 
            };
            
            // 【核心改造】检查之前有没有暂存背景图
            if (diaryEditorContent.newBackgroundImageFile) {
                const newBgKey = `diary-bg-${newEntry.id}`;
                try {
                    await db.saveImage(newBgKey, diaryEditorContent.newBackgroundImageFile);
                    newEntry.backgroundKey = newBgKey; // 把背景房卡存进去
                } catch (error) {
                    console.error("保存暂存背景失败", error);
                    showToast('背景保存失败，请稍后再试', 'error');
                }
            }
            
            appData.userDiary.push(newEntry);
        }

        // 清理暂存的背景文件
        delete diaryEditorContent.newBackgroundImageFile;

        saveAppData();
        renderUserDiary();
        closeDiaryEditor();
        showToast('日记已保存！', 'success');
    }

    /**
     * 【【【全新 V5.0 终极完整版】】】为所有日记相关按钮绑定事件
     */
    function bindDiaryEventListeners() {
        // --- 司令部：统一管理所有日记相关的“电闸” ---

        // 电闸 #1：日记列表页的删除按钮
        myDiaryContent.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.diary-delete-btn');
            if (deleteBtn) {
                const card = deleteBtn.closest('.diary-entry-card');
                if (card && card.dataset.diaryId) {
                    const diaryId = card.dataset.diaryId;
                    showCustomConfirm('删除确认', '确定要删除这篇日记吗？\n此操作无法撤销。', () => {
                        const entryToDelete = appData.userDiary.find(d => d.id === diaryId);
                        if (entryToDelete && entryToDelete.backgroundKey) {
                            db.deleteImage(entryToDelete.backgroundKey);
                        }
                        appData.userDiary = appData.userDiary.filter(d => d.id !== diaryId);
                        saveAppData();
                        renderUserDiary();
                        showToast('日记已删除', 'success');
                    });
                }
            }
        });

        // 电闸 #2：日记查看器的按钮 (关闭/编辑)
        document.getElementById('close-diary-viewer-btn').addEventListener('click', closeDiaryViewer);
        document.getElementById('edit-diary-fab').addEventListener('click', () => {
            const diaryId = diaryViewerModal.dataset.currentDiaryId;
            if (diaryId) {
                closeDiaryViewer();
                openDiaryEditor(diaryId);
            }
        });

        // 电闸 #3：日记编辑器的核心按钮 (取消/保存)
        document.getElementById('cancel-diary-btn').addEventListener('click', closeDiaryEditor);
        document.getElementById('save-diary-btn').addEventListener('click', saveDiaryEntry);

        // 电闸 #4：日记编辑器的工具栏 (所有文本效果、图片、背景等)
        const diaryToolbar = document.querySelector('.diary-toolbar');
        let savedSelectionRange = null;

        const updateToolbarStatus = () => {
            if (diaryEditorModal.classList.contains('hidden')) return;
            ['bold', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight'].forEach(format => {
                try {
                    const isActive = document.queryCommandState(format);
                    const btn = diaryToolbar.querySelector(`[data-format=${format}]`);
                    if (btn) btn.classList.toggle('is-active', isActive);
                } catch (e) {}
            });
        };
        document.addEventListener('selectionchange', updateToolbarStatus);
        diaryEditorContent.addEventListener('keyup', updateToolbarStatus);
        diaryEditorContent.addEventListener('mouseup', updateToolbarStatus);
        diaryEditorContent.addEventListener('focus', updateToolbarStatus);
        
        const executeCommand = (command, value = null) => {
            diaryEditorContent.focus();
            if (savedSelectionRange) {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(savedSelectionRange);
            }
            document.execCommand(command, false, value);
            savedSelectionRange = null;
            setTimeout(updateToolbarStatus, 100);
        };
        
                const runCommandLogic = async (btn) => {
            if (!btn) return;

            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                savedSelectionRange = selection.getRangeAt(0).cloneRange();
            }

            const format = btn.dataset.format;
            const command = btn.dataset.command; // 【关键修复】重新获取command属性
            const value = btn.dataset.value;     // 【关键修复】重新获取value属性

            // 检查是否是需要先选中文本的命令
            if (format || command === 'changeFontSize') {
                 if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                    // 插入图片除外，它不需要预先选择文本
                    if (format !== 'insertImage') { 
                        showToast('请先选中文本', 'info', 1500);
                        return;
                    }
                }
            }

            if (command === 'changeFontSize') {
                // 【【【这就是被遗忘的“字号计算大脑”！】】】
                const currentFontSize = document.queryCommandValue("fontSize") || "3"; // 获取当前字号，默认为3
                let newSize = parseInt(currentFontSize) + (value === 'increase' ? 1 : -1); // 根据按钮是放大还是缩小来计算
                newSize = Math.max(1, Math.min(7, newSize)); // 确保字号在1-7的范围内
                executeCommand('fontSize', newSize);
            } else if (format === 'insertImage') {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (readEvent) => executeCommand('insertHTML', `<p align="center"><img src="${readEvent.target.result}" style="max-width: 100%; height: auto; border-radius: var(--radius-md);"></p>`);
                        reader.readAsDataURL(file);
                    }
                };
                fileInput.click();
            } else if (btn.classList.contains('color-picker-label')) {
                btn.querySelector('input[type="color"]').click();
            } else if (format) {
                // 处理所有其他简单的文本格式化命令
                executeCommand(format);
            }
        };

        diaryToolbar.addEventListener('mousedown', (e) => {
            const btn = e.target.closest('.tool-btn');
            if (btn) {
                e.preventDefault();
                runCommandLogic(btn);
            }
        });
        
        let touchState = {};
        diaryToolbar.addEventListener('touchstart', (e) => { touchState.isScrolling = false; }, { passive: true });
        diaryToolbar.addEventListener('touchmove', (e) => { touchState.isScrolling = true; }, { passive: true });
        diaryToolbar.addEventListener('touchend', (e) => {
            if (touchState.isScrolling) return;
            const btn = e.target.closest('.tool-btn');
            if (btn) {
                e.preventDefault();
                runCommandLogic(btn);
            }
        });
        
        document.getElementById('diary-highlight-color-picker').addEventListener('input', (e) => executeCommand('hiliteColor', e.target.value));
        document.getElementById('diary-text-color-picker').addEventListener('input', (e) => executeCommand('foreColor', e.target.value));

        // 电闸 #5：日记图片缩放逻辑
        diaryEditorContent.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                if (e.target.classList.contains('resizable-image')) {
                    e.target.classList.remove('resizable-image');
                    selectedImageForResize = null;
                    imageResizeControls.classList.add('hidden');
                } else {
                    diaryEditorContent.querySelectorAll('img.resizable-image').forEach(img => img.classList.remove('resizable-image'));
                    e.target.classList.add('resizable-image');
                    selectedImageForResize = e.target;
                    const currentWidth = selectedImageForResize.style.maxWidth ? parseInt(selectedImageForResize.style.maxWidth.replace('%', '')) : 100;
                    imageSizeSlider.value = currentWidth;
                    imageResizeControls.classList.remove('hidden');
                }
            } else {
                if (selectedImageForResize) {
                    selectedImageForResize.classList.remove('resizable-image');
                    selectedImageForResize = null;
                }
                imageResizeControls.classList.add('hidden');
            }
        });

                imageSizeSlider.addEventListener('input', () => {
            if (selectedImageForResize) {
                selectedImageForResize.style.maxWidth = `${imageSizeSlider.value}%`;
                selectedImageForResize.style.height = 'auto';
            }
        });
        
        // 电闸 #6：【【【终极修复：为被遗忘的背景按钮接上专属电线！】】】
        document.getElementById('diary-set-bg-btn').addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (!currentEditingDiaryId) {
                    diaryEditorContent.newBackgroundImageFile = file;
                    diaryEditorContent.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
                    showToast('背景已暂存，保存日记后生效', 'info');
                    return;
                }
                
                const entry = appData.userDiary.find(d => d.id === currentEditingDiaryId);
                if (!entry) return;

                const newBgKey = `diary-bg-${entry.id}`;
                try {
                    if (entry.backgroundKey) {
                        await db.deleteImage(entry.backgroundKey);
                    }
                    await db.saveImage(newBgKey, file);
                    entry.backgroundKey = newBgKey;
                    saveAppData();
                    diaryEditorContent.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
                    showToast('背景设置成功！', 'success');
                } catch (error) {
                    showToast('背景保存失败！', 'error');
                }
            };
            fileInput.click();
        });

        document.getElementById('diary-remove-bg-btn').addEventListener('click', async () => {
            if (!currentEditingDiaryId) {
                delete diaryEditorContent.newBackgroundImageFile;
                diaryEditorContent.style.backgroundImage = 'none';
                showToast('暂存背景已移除', 'info');
                return;
            }

            const entry = appData.userDiary.find(d => d.id === currentEditingDiaryId);
            if (!entry || !entry.backgroundKey) {
                showToast('这篇日记没有设置背景', 'info');
                return;
            }
            try {
                await db.deleteImage(entry.backgroundKey);
                entry.backgroundKey = null;
                saveAppData();
                diaryEditorContent.style.backgroundImage = 'none';
                showToast('背景已移除', 'success');
            } catch(error) {
                showToast('移除背景失败', 'error');
            }
        });
    }
    // ▼▼▼ 【【【终极修复 PART 1：在这里补上丢失的“我的表情包”设置页面的“菜谱”】】】 ▼▼▼
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
    // ▲▲▲ 【【【菜谱添加完毕】】】 ▲▲▲

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
        // 【核心修复】移除这里的自动聚焦，防止键盘自动弹出
        // voiceTextInput.focus();
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
        document.getElementById('cs-propose-toggle').checked = contact.canPropose;
        document.getElementById('cs-schedule-toggle').checked = contact.isScheduleEnabled || false;
        csAutoSummaryToggle.checked = contact.autoSummaryEnabled;
        csAutoSummaryInput.value = contact.autoSummaryThreshold;
        csAutoSummaryDisplay.textContent = contact.autoSummaryThreshold ? `${contact.autoSummaryThreshold}条` : '未设置';
        document.getElementById('cs-offline-mode-toggle').checked = contact.isOfflineMode;

        const onlineCount = contact.onlineChatHistory.length;
        // 【核心改造】通过遍历所有剧情线，累加它们的聊天记录数量
        const offlineCount = (contact.offlineStorylines || []).reduce((total, story) => total + (story.chatHistory ? story.chatHistory.length : 0), 0);
        
        // 步骤1：先执行克隆和替换操作，把“舞台”搭好
        const messageCountItem = document.getElementById('cs-message-count-item');
        const messageCountItemClone = messageCountItem.cloneNode(true);
        messageCountItem.parentNode.replaceChild(messageCountItemClone, messageCountItem);

        // 步骤2：在新的“舞台”(messageCountItemClone)上找到演员(span)，再更新它的台词
        // 【核心修复】我们现在操作的是那个刚刚被添加到页面上的克隆体！
        const newCsMessageCount = messageCountItemClone.querySelector('#cs-message-count');
        if (newCsMessageCount) {
            newCsMessageCount.textContent = onlineCount + offlineCount;
        }
        
        // 步骤3：为新的“舞台”绑定事件
        messageCountItemClone.addEventListener('click', () => {
            showCustomAlert('对话条数详情', `线上模式: ${onlineCount} 条\n线下模式: ${offlineCount} 条`);
        });

        // ▼▼▼ 【【【全新：加载并应用“主动消息”的当前设置】】】 ▼▼▼
    const proactiveToggle = document.getElementById('cs-proactive-toggle');
    const intervalItem = document.getElementById('cs-proactive-interval-item');
    const intervalInput = document.getElementById('cs-proactive-interval-input');

    // 根据档案，设置开关和输入框的初始状态
    proactiveToggle.checked = contact.proactiveMessaging.enabled;
    // ▼▼▼ 【【【全新：加载并显示离线消息的当前设置】】】 ▼▼▼
    const offlineMsgToggle = document.getElementById('cs-offline-msg-toggle');
    const offlineIntervalItem = document.getElementById('cs-offline-msg-interval-item');
    const offlineSleepItem = document.getElementById('cs-offline-msg-sleep-item'); // 重新找到旧的ID
    
    const offlineIntervalInput = document.getElementById('cs-offline-msg-interval-input');
    const sleepStartInput = document.getElementById('cs-offline-msg-sleep-start');
    const sleepEndInput = document.getElementById('cs-offline-msg-sleep-end');

    // 根据档案，设置开关和输入框的初始状态
    const offlineSettings = contact.offlineMessaging;
    offlineMsgToggle.checked = offlineSettings.enabled;
    offlineIntervalInput.value = offlineSettings.intervalHours;
    sleepStartInput.value = offlineSettings.sleepStart;
    sleepEndInput.value = offlineSettings.sleepEnd;
    
    // 根据开关状态，决定是否显示详细设置项
    const showDetails = offlineSettings.enabled;
    const displayValue = showDetails ? 'flex' : 'none';
    
    // 同时控制“频率”和“休息时间”这两个设置项的显示与隐藏
    if (offlineIntervalItem) offlineIntervalItem.style.display = displayValue;
    if (offlineSleepItem) offlineSleepItem.style.display = displayValue; // 控制恢复后的单行布局
    // ▲▲▲▲▲ ▲▲▲▲▲
    intervalInput.value = contact.proactiveMessaging.interval;
    intervalItem.style.display = contact.proactiveMessaging.enabled ? 'flex' : 'none';
    // ▲▲▲▲▲ ▲▲▲▲▲

        switchToView('contact-settings-view');

        // 【【【终极修复：为“清空聊天记录”按钮也进行“现场绑定”】】】
        const clearHistoryBtn = document.getElementById('cs-clear-history');
        if (clearHistoryBtn) {
            const clearHistoryBtnClone = clearHistoryBtn.cloneNode(true);
            clearHistoryBtn.parentNode.replaceChild(clearHistoryBtnClone, clearHistoryBtn);
            clearHistoryBtnClone.addEventListener('click', () => {
                const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
                if (!contact) return;
                
                showCustomConfirm(
                    '清空线上记录',
                    `确定要删除与 ${contact.remark} 的所有【线上模式】聊天记录吗？\n\n此操作无法撤销！`,
                    () => {
                        clearOnlineChatHistory();
                    }
                );
            });
        }
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

        // --- 【全新】加载AI天气系统设置 ---
        const weatherToggle = document.getElementById('ai-weather-toggle');
        const weatherPanel = document.getElementById('ai-weather-settings-panel');
        const weatherSettings = contact.aiWeatherSystem || {}; // 安全保障

        weatherToggle.checked = weatherSettings.enabled;
        weatherPanel.style.display = weatherSettings.enabled ? 'block' : 'none';
        
        document.getElementById('ai-editor-city').value = weatherSettings.cityName;
        document.getElementById('ai-editor-latitude').value = weatherSettings.latitude; // 【新增】
        document.getElementById('ai-editor-hemisphere').value = weatherSettings.hemisphere;
        document.getElementById('ai-editor-climate').value = weatherSettings.climate;
        document.getElementById('ai-editor-base-temp').value = weatherSettings.baseAnnualTemp;
        document.getElementById('ai-editor-coastal-influence').value = weatherSettings.coastalInfluence;

        // 为开关绑定交互事件
        weatherToggle.onchange = () => {
            weatherPanel.style.display = weatherToggle.checked ? 'block' : 'none';
        };
        
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
            const value = entryDiv.querySelector('.worldbook-value').value.trim(); 
            if (key) { contact.worldBook.push({ key, value }); }
        });

        contact.stickerGroups = [];
        const selectedCheckboxes = document.querySelectorAll('#ai-sticker-groups-container input[type="checkbox"]:checked');
        selectedCheckboxes.forEach(checkbox => {
            contact.stickerGroups.push(checkbox.value);
        });

        // --- 【全新】保存AI天气系统设置 ---
        contact.aiWeatherSystem.enabled = document.getElementById('ai-weather-toggle').checked;
        contact.aiWeatherSystem.cityName = document.getElementById('ai-editor-city').value.trim();
        contact.aiWeatherSystem.latitude = parseFloat(document.getElementById('ai-editor-latitude').value) || 31.2;
        contact.aiWeatherSystem.baseAnnualTemp = parseFloat(document.getElementById('ai-editor-base-temp').value) || 17; // 【【【核心新增】】】
        contact.aiWeatherSystem.coastalInfluence = parseFloat(document.getElementById('ai-editor-coastal-influence').value);
        contact.aiWeatherSystem.hemisphere = document.getElementById('ai-editor-hemisphere').value;
        contact.aiWeatherSystem.climate = document.getElementById('ai-editor-climate').value;

        saveAppData();
        chatAiName.textContent = contact.remark;
        renderChatList();
        alert('AI信息已保存！');
        switchToView('contact-settings-view');
    }
    
    /**
     * 【【【终极修复版：一个只负责清空线上记录的专业清洁工】】】
     */
    function clearOnlineChatHistory() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        // 直接清空线上历史记录
        contact.onlineChatHistory = [];
        // 线上记忆的起始指针也必须归零，否则AI会“失忆”
        contact.contextStartIndex = 0; 
        
        saveAppData();
        openChat(contact.id); // 重新加载聊天界面
        renderChatList(); // 刷新列表
        showCustomAlert('操作成功', '线上聊天记录已清空。');
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
        
                // 【核心】使用我们升级后的“万能查找器”
        const messageData = findMessageById(messageId);
        
        // 【核心改造】现在，用户和AI的消息都可以被编辑
        if (!messageData || (messageData.role !== 'user' && messageData.role !== 'assistant')) {
            exitSelectMode();
            return;
        }

        openTextEditorModal(messageData.content, (newText) => {
            if (newText !== null && newText.trim() !== '') {
                // 直接修改找到的消息对象的内容，无论它在哪本名册里
                messageData.content = newText.trim();
                saveAppData(); // 保存改动
                
                // 更新界面上的气泡
                const messageElement = messageContainer.querySelector(`[data-message-id="${messageId}"] .message`);
                if (messageElement) { 
                    // 确保只修改文本内容，不破坏其他HTML结构
                    const textNode = Array.from(messageElement.childNodes).find(node => node.nodeType === 3);
                    if (textNode) {
                        textNode.textContent = newText.trim();
                    } else {
                        messageElement.textContent = newText.trim();
                    }
                }
                renderChatList();
            }
            exitSelectMode();
        });
    }

        function deleteSelectedMessages() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        // 【【【终极修复：让清洁工找到正确的“剧情办公室”】】】
        if (contact.isOfflineMode) {
            // 步骤1：找到当前正在营业的“剧情办公室”
            const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
            
            // 步骤2：确保办公室真的存在，然后打扫它的“文件柜”
            if (activeStory) {
                activeStory.chatHistory = activeStory.chatHistory.filter(msg => !selectedMessages.has(msg.id));
            }
        } else {
            // 线上模式的逻辑保持不变，因为只有一个档案室
            contact.onlineChatHistory = contact.onlineChatHistory.filter(msg => !selectedMessages.has(msg.id));
        }

        // 未发送消息的逻辑保持不变
        if (contact.unsentMessages) {
            contact.unsentMessages = contact.unsentMessages.filter(msg => !selectedMessages.has(msg.id));
        }
        
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
        function showCustomConfirm(title, text, onConfirm, onCancel = null, okText = '确定', cancelText = '取消') {
        customConfirmTitle.textContent = title;
        customConfirmText.textContent = text;
        confirmCallback = onConfirm;
        cancelCallback = onCancel;
        
        // 【核心改造】在这里直接设置按钮文字
        customConfirmOkBtn.textContent = okText;
        customConfirmCancelBtn.textContent = cancelText;

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

    function showCustomPrompt(title, text, defaultValue, onConfirm, isNested = false) {
        const modal = document.getElementById('custom-prompt-modal');
        document.getElementById('custom-prompt-title').textContent = title;
        document.getElementById('custom-prompt-text').textContent = text;
        const input = document.getElementById('custom-prompt-input');
        input.value = defaultValue;
        promptCallback = onConfirm;
        
        // 【核心改造】检查是否需要“VIP通行证”
        if (isNested) {
            modal.classList.add('modal-on-top');
        }

        modal.classList.remove('hidden');
    }

    function closeCustomPrompt() {
        const modal = document.getElementById('custom-prompt-modal');
        modal.classList.add('hidden');
        // 【核心改造】关闭时，把“VIP通行证”收回来，以备下次使用
        modal.classList.remove('modal-on-top');
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
        // 【核心修复】彻底移除在手机端会导致闪屏的自动聚焦
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

    // ▼▼▼ 【【【全新：数据导出/导入的核心魔法】】】 ▼▼▼

    /**
     * 将Blob文件对象转换为Base64编码的文本
     */
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * 导出全部应用数据 (V2.0 - 文件下载版)
     */
    async function exportAllData() {
        showToast('正在打包数据，请稍候...', 'info', 0);

        try {
            // 步骤 1-4 保持不变，我们依然需要打包所有数据
            const appDataToExport = JSON.parse(localStorage.getItem('myAiChatApp_V8_Data'));
            const allImages = await db.getAllImages();
            const imageDataBase64 = {};
            for (const key in allImages) {
                if (allImages[key] instanceof Blob) {
                    imageDataBase64[key] = await blobToBase64(allImages[key]);
                }
            }
            const backupData = {
                appData: appDataToExport,
                imageData: imageDataBase64
            };

            // 5. 【核心改造】将“超级包裹”转换成适合阅读的JSON文本
            const backupString = JSON.stringify(backupData, null, 2); // null, 2 会让导出的json文件有缩进，方便阅读

            // 6. 【核心改造】创建“数字文件包裹”(Blob)
            const blob = new Blob([backupString], { type: 'application/json' });

            // 7. 【核心改造】创建一个临时的、隐藏的下载链接
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai_chat_backup_${new Date().toISOString().slice(0,10)}.json`; // 自动生成带日期的文件名

            // 8. 【核心改造】模拟用户点击这个链接来触发下载，然后“阅后即焚”
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url); // 释放内存

            showToast('数据文件已开始下载！', 'success');

        } catch (error) {
            console.error('导出数据时发生错误:', error);
            showCustomAlert('导出失败', `发生了一个错误： ${error.message}`);
        }
    }

    /**
     * 将Base64编码的文本“翻译”回Blob文件对象
     */
    async function dataURLToBlob(dataurl) {
        const res = await fetch(dataurl);
        return await res.blob();
    }

    /**
     * 导入全部应用数据 (V2.0 - 文件选择版)
     */
    async function importAllData() {
        // 1. 【核心改造】创建一个隐藏的文件选择输入框
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json'; // 只允许选择json文件

        // 2. 【核心改造】定义当用户选择了文件后，应该做什么
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) {
                showToast('导入已取消', 'info');
                return;
            }

            // 3. 【核心改造】使用“文件阅读器”来读取文件内容
            const reader = new FileReader();
            reader.onload = (e) => {
                const backupString = e.target.result;

                // 4. 【逻辑迁移】将之前的确认和导入逻辑，完整地搬到这里
                showCustomConfirm(
    '【高风险操作】确认导入',
    `确定要从文件 [${file.name}] 导入数据吗？\n\n此操作将完全覆盖当前的所有数据，且无法撤销！`,
    async () => {
        showToast('正在导入数据，请勿关闭页面...', 'info', 0);
        try {
            // 1. 解析备份码 (保持不变)
            const backupData = JSON.parse(backupString);

            // 2. 验证备份码 (保持不变)
            if (!backupData || !backupData.appData || !backupData.imageData) {
                throw new Error("备份文件格式不正确或已损坏。");
            }

            // 3. 恢复文本数据 (保持不变)
            localStorage.setItem('myAiChatApp_V8_Data', JSON.stringify(backupData.appData));

            // 4. 将所有Base64图片预先转换为Blob对象 (保持不变)
            showToast('正在解析图片...', 'info', 0);
            const imageEntries = [];
            const conversionPromises = Object.entries(backupData.imageData).map(([key, dataUrl]) =>
                dataURLToBlob(dataUrl).then(blob => {
                    imageEntries.push([key, blob]);
                })
            );
            await Promise.all(conversionPromises);

            // 5. 【【【核心改造：启动“搬家车队”模式】】】
            
            // 5a. 第一步：先派一辆“清空车”，快速清空旧仓库
            showToast('正在清空旧图库...', 'info', 0);
            const clearTransaction = db._db.transaction(['images'], 'readwrite');
            clearTransaction.objectStore('images').clear();
            await new Promise((resolve, reject) => {
                clearTransaction.oncomplete = resolve;
                clearTransaction.onerror = reject;
            });
            
            // 5b. 第二步：开始分批次派发“运输车”
            const BATCH_SIZE = 200; // 每辆小货车一次只运200件家具
            for (let i = 0; i < imageEntries.length; i += BATCH_SIZE) {
                const batch = imageEntries.slice(i, i + BATCH_SIZE);
                // 更新进度提示
                showToast(`正在写入图片 (${i + batch.length}/${imageEntries.length})...`, 'info', 0);

                // 为当前这辆“小货车”开启一次独立的、快速的运输任务
                const batchTransaction = db._db.transaction(['images'], 'readwrite');
                const store = batchTransaction.objectStore('images');
                
                for (const [key, blob] of batch) {
                    store.put(blob, key); // 快速装货
                }
                
                // 等待这辆“小货车”完成任务后，再派发下一辆
                await new Promise((resolve, reject) => {
                    batchTransaction.oncomplete = resolve;
                    batchTransaction.onerror = reject;
                });
            }

            showToast('数据导入成功！应用即将刷新...', 'success', 2500);

            // 6. 刷新页面 (保持不变)
            setTimeout(() => {
                location.reload();
            }, 2500);

        } catch (error) {
            console.error('导入数据时发生错误:', error);
            showCustomAlert('导入失败', `发生了一个错误： ${error.message}\n\n请检查您的备份文件是否正确。`);
        }
    }
);
            };
            
            // 命令“文件阅读器”开始工作
            reader.readAsText(file);
        };

        // 5. 【核心改造】用代码模拟点击这个隐藏的文件选择框
        input.click();
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
            onlineChatHistory: [],
            offlineChatHistory: [],
            moments: [],
            isPinned: false,
            stickerGroups: [],
            canPropose: true,

            // --- 【【【核心修复：为新角色补全所有“出生证明”信息！】】】 ---
            isScheduleEnabled: false, 
            schedule: {
                sleep: { type: 'regular', bedtime: '23:00', wakeupTime: '07:00' },
                meals: { type: 'regular', breakfast: '08:00', lunch: '12:00', dinner: '18:00' },
                work: [],
                leisure: [],
                lastInteractionTimestamp: 0
            },
            consecutiveMessagesWhileSleeping: 0,
            publicProfileCard: null,
            hasBeenOpened: false,
            
            isOfflineMode: false,
            offlineStorylines: [],
            activeOfflineStoryId: null, 
            offlineSettings: {
                wordLimit: 0,
                perspective: 'second-person',
                preventControl: true,
                startPrompt: ''
            },
            contextStartIndex: 0,
            autoSummaryEnabled: false,
            autoSummaryThreshold: 100,
            lastSummaryAtCount: 0,

            // ▼▼▼ 【【【终极修复：在这里为新角色安装缺失的功能模块！】】】 ▼▼▼
            proactiveMessaging: {
                enabled: false,
                interval: 1440,
                lastSent: 0
            },
            offlineMessaging: {
                enabled: false,
                intervalHours: 4,
                sleepStart: '23:00',
                sleepEnd: '07:00'
            }
            // ▲▲▲▲▲ ▲▲▲▲▲
        };
        appData.aiContacts.push(newContact);
        saveAppData();
        renderChatList();
        activeChatContactId = newContactId;
        // 【核心修正】直接打开AI信息编辑页，而不是设置总览页
        openAiEditor();
    }
/**
     * 【全新】打开生活作息编辑器
     */
    function openScheduleEditor() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact || !contact.schedule) return;

        const schedule = contact.schedule;
        
        // 填充睡眠数据
        document.getElementById('schedule-sleep-type').value = schedule.sleep.type || 'regular';
        document.getElementById('schedule-sleep-start').value = schedule.sleep.bedtime || '23:00';
        document.getElementById('schedule-sleep-end').value = schedule.sleep.wakeupTime || '07:00';
        // 【新增】填充三餐数据
        if (schedule.meals) {
            document.getElementById('schedule-meals-type').value = schedule.meals.type || 'regular';
            document.getElementById('schedule-meals-breakfast').value = schedule.meals.breakfast || '08:00';
            document.getElementById('schedule-meals-lunch').value = schedule.meals.lunch || '12:00';
            document.getElementById('schedule-meals-dinner').value = schedule.meals.dinner || '18:00';
        }

        // 动态创建工作和休闲项目
        renderScheduleItems('work', schedule.work || []);
        renderScheduleItems('leisure', schedule.leisure || []);

        document.getElementById('schedule-editor-modal').classList.remove('hidden');
    }
        /**
     * 【全新 V6.0】渲染作息项目列表 (二级弹窗终极版 - By User's Design)
     */
    function renderScheduleItems(type, items) {
        const container = document.getElementById(`schedule-${type}-list`);
        container.innerHTML = ''; // 清空旧列表
        
        // ▼▼▼ 【【【这就是全新的、只生成按钮的“卡片制造工厂”】】】 ▼▼▼
        if (items && items.length > 0) {
            items.forEach((item, index) => {
                const itemButton = document.createElement('button');
                itemButton.className = 'schedule-item-button'; // 使用新的样式类
                itemButton.textContent = item.name || '未命名活动';
                itemButton.dataset.type = type;
                itemButton.dataset.index = index;
                // 点击按钮，打开我们的“编辑车间”
                itemButton.onclick = () => openScheduleItemEditor(type, index);
                container.appendChild(itemButton);
            });
        }
    }

    // ▼▼▼ 【【【全新 V3.0：“编辑车间”和“数据管理员”终极修复版】】】 ▼▼▼
    let currentEditingItem = null; 

    function openScheduleItemEditor(type, index = null) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        // 【核心】为弹窗创建一个临时的“草稿本”，用来记录所有未保存的修改
        currentEditingItem = { type, index, tempDays: [], tempProbability: 1 };
        
        const modal = document.getElementById('schedule-item-editor-modal');
        const title = document.getElementById('schedule-item-editor-title');
        const deleteBtn = document.getElementById('delete-item-editor-btn');
        
        let itemData;
        
        if (index !== null) {
            title.textContent = '编辑活动';
            itemData = contact.schedule[type][index];
            deleteBtn.style.display = 'block';
        } else {
            title.textContent = '添加新活动';
            itemData = { name: '', startTime: '09:00', endTime: '17:00', days: [1,2,3,4,5], probability: 1 };
            deleteBtn.style.display = 'none';
        }
        
        // 【核心】把当前项目的真实数据，完整地复制一份到“草稿本”
        currentEditingItem.tempDays = [...itemData.days];
        currentEditingItem.tempProbability = itemData.probability === undefined ? 1 : itemData.probability;

        document.getElementById('item-editor-name').value = itemData.name;
        document.getElementById('item-editor-startTime').value = itemData.startTime;
        document.getElementById('item-editor-endTime').value = itemData.endTime;
        
        const formatDays = (days) => {
            if (!days || days.length === 0) return '未设置';
            if (days.length === 7) return '每天';
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            return '每周 ' + days.sort().map(d => dayNames[d]).join('、');
        };
        document.getElementById('item-editor-days-btn').textContent = formatDays(itemData.days);
        document.getElementById('item-editor-probability-btn').textContent = `${currentEditingItem.tempProbability * 100}%`;
        
        modal.classList.remove('hidden');
    }

    function saveScheduleItem() {
        if (!currentEditingItem) return;
        
        const { type, index } = currentEditingItem;
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        
        const nameValue = document.getElementById('item-editor-name').value.trim();
        if (!nameValue) {
            showToast('活动名称不能为空！', 'error');
            return;
        }

        // 【核心】从“草稿本”读取所有最终确认的修改
        const updatedItemData = {
            name: nameValue,
            startTime: document.getElementById('item-editor-startTime').value,
            endTime: document.getElementById('item-editor-endTime').value,
            days: currentEditingItem.tempDays,
            probability: currentEditingItem.tempProbability,
        };

        if (index !== null) {
            Object.assign(contact.schedule[type][index], updatedItemData);
        } else {
            if (!Array.isArray(contact.schedule[type])) contact.schedule[type] = [];
            contact.schedule[type].push(updatedItemData);
        }

        document.getElementById('schedule-item-editor-modal').classList.add('hidden');
        renderScheduleItems(type, contact.schedule[type]);
        currentEditingItem = null;
    }

    function deleteScheduleItem() {
        if (!currentEditingItem) return;
        const { type, index } = currentEditingItem;
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        
        if (index !== null && contact && Array.isArray(contact.schedule[type])) {
            contact.schedule[type].splice(index, 1);
            renderScheduleItems(type, contact.schedule[type]);
        }
        
        document.getElementById('schedule-item-editor-modal').classList.add('hidden');
        currentEditingItem = null;
    }

    // “编辑车间”的星期选择和概率设置逻辑
    document.getElementById('item-editor-days-btn').addEventListener('click', () => {
        openDaySelectorModal(true); 
    });
    document.getElementById('item-editor-probability-btn').addEventListener('click', () => {
        const currentProb = currentEditingItem.tempProbability * 100;
        
        showCustomPrompt('设置概率', '请输入一个0到100之间的数字:', currentProb, (newValue) => {
            let probability = parseInt(newValue, 10);
            if (isNaN(probability) || probability < 0) probability = 0;
            if (probability > 100) probability = 100;
            
            // 【核心】只修改“草稿本”上的概率，并更新按钮显示
            currentEditingItem.tempProbability = probability / 100;
            document.getElementById('item-editor-probability-btn').textContent = `${probability}%`;
        }, true);
    });
    
    function openDaySelectorModal(isNested = false) {
        const daySelectorGrid = document.getElementById('day-selector-grid');
        daySelectorGrid.innerHTML = '';

        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        dayNames.forEach((name, dayIndex) => {
            const isChecked = currentEditingItem.tempDays.includes(dayIndex);
            const dayButton = document.createElement('button');
            dayButton.className = `day-btn ${isChecked ? 'active' : ''}`;
            dayButton.textContent = name;
            dayButton.dataset.day = dayIndex;
            dayButton.onclick = () => {
                const dayValue = Number(dayButton.dataset.day);
                const dayIndexInTemp = currentEditingItem.tempDays.indexOf(dayValue);
                if (dayIndexInTemp > -1) {
                    currentEditingItem.tempDays.splice(dayIndexInTemp, 1);
                } else {
                    currentEditingItem.tempDays.push(dayValue);
                }
                dayButton.classList.toggle('active');
            };
            daySelectorGrid.appendChild(dayButton);
        });
        
        const modal = document.getElementById('day-selector-modal');
        if (isNested) modal.classList.add('modal-on-top');
        modal.classList.remove('hidden');
    }
    
    document.getElementById('cancel-day-select-btn').addEventListener('click', () => {
        const modal = document.getElementById('day-selector-modal');
        modal.classList.add('hidden');
        modal.classList.remove('modal-on-top');
    });

    document.getElementById('save-day-select-btn').addEventListener('click', () => {
        const formatDays = (days) => {
            if (!days || days.length === 0) return '未设置';
            if (days.length === 7) return '每天';
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            return '每周 ' + days.sort().map(d => dayNames[d]).join('、');
        };
        // 【核心】用“草稿本”里的最终数据，去更新“编辑车间”里的显示文本
        document.getElementById('item-editor-days-btn').textContent = formatDays(currentEditingItem.tempDays);

        const modal = document.getElementById('day-selector-modal');
        modal.classList.add('hidden');
        modal.classList.remove('modal-on-top');
    });
    
    document.getElementById('cancel-day-select-btn').addEventListener('click', () => {
        const modal = document.getElementById('day-selector-modal');
        modal.classList.add('hidden');
        modal.classList.remove('modal-on-top');
    });

    document.getElementById('save-day-select-btn').addEventListener('click', () => {
        // 【核心BUG修复】
        const formatDays = (days) => {
            if (!days || days.length === 0) return '未设置';
            if (days.length === 7) return '每天';
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            return '每周 ' + days.sort().map(d => dayNames[d]).join('、');
        };
        // 确认时，用“草稿本”里的最终数据，去更新“编辑车间”里的显示文本
        document.getElementById('item-editor-days-btn').textContent = formatDays(currentEditingItem.tempDays);

        const modal = document.getElementById('day-selector-modal');
        modal.classList.add('hidden');
        modal.classList.remove('modal-on-top');
    });
    
        // 【全新】保存生活作息 (V2.0 - 真正读取数据版)
    function saveSchedule() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) {
            showToast('错误：找不到当前角色', 'error');
            return;
        }

        // 步骤1：读取所有睡眠设置的值
        const sleepType = document.getElementById('schedule-sleep-type').value;
        const sleepStart = document.getElementById('schedule-sleep-start').value;
        const sleepEnd = document.getElementById('schedule-sleep-end').value;

        // 步骤2：读取所有三餐设置的值
        const mealsType = document.getElementById('schedule-meals-type').value;
        const breakfastTime = document.getElementById('schedule-meals-breakfast').value;
        const lunchTime = document.getElementById('schedule-meals-lunch').value;
        const dinnerTime = document.getElementById('schedule-meals-dinner').value;
        
        // 步骤3：将读取到的新值，更新到AI的档案(schedule对象)里
        contact.schedule.sleep = {
            type: sleepType,
            bedtime: sleepStart,
            wakeupTime: sleepEnd
        };
        contact.schedule.meals = {
            type: mealsType,
            breakfast: breakfastTime,
            lunch: lunchTime,
            dinner: dinnerTime
        };

        // 步骤4：现在才执行保存，并关闭窗口
        saveAppData();
        showToast('生活作息已保存！', 'success');
        document.getElementById('schedule-editor-modal').classList.add('hidden');
    }


    
    function bindEventListeners() {
        // ▼▼▼▼▼ 【全新 V2.0】带遮罩层的侧滑菜单交互 ▼▼▼▼▼

        // --- 【【【全新：侧边栏底部按钮总控制器】】】 ---
        const settingsBtn = document.getElementById('side-menu-settings');
        const darkModeBtn = document.getElementById('side-menu-darkmode');
        const weatherBtn = document.getElementById('side-menu-weather');

        // 1. 设置按钮：点击后跳转到设置页面
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                switchToView('settings-view');
                closeSideMenu();
            });
        }

        // 2. 夜间模式按钮：点击后切换主题
        if (darkModeBtn) {
            darkModeBtn.addEventListener('click', () => {
                document.body.classList.toggle('dark-theme');
                // (可选) 你可以把用户选择的主题保存起来，下次打开时自动应用
                if (document.body.classList.contains('dark-theme')) {
                    localStorage.setItem('theme', 'dark');
                } else {
                    localStorage.setItem('theme', 'light');
                }
            });
        }
        
        // 3. 天气按钮：点击后重新获取天气
        if (weatherBtn) {
            weatherBtn.addEventListener('click', () => {
                // 【核心改造】第一步：立刻命令侧边栏关闭
                closeSideMenu(); 

                // 【核心改造】第二步：稍微等待一下（300毫秒），让侧边栏的关闭动画播放完毕
                setTimeout(() => {
                    // 第三步：现在才显示提示并触发天气系统（和弹窗）
                    showToast('正在刷新天气...', 'info');
                    initializeWeatherSystem();
                }, 300); // 这个时间与你CSS中侧边栏的动画时间 0.3s 保持一致
            });
        }

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
        backFromSettingsBtn.addEventListener('click', () => {
            // 【【【核心修复 V2.0：让返回按钮只认“登录状态灯”】】】
            if (hasUserLoggedIn) {
                // 如果灯是亮的，说明用户已经登录了，应该返回聊天列表
                switchToView('chat-list-view');
            } else {
                // 如果灯是灭的，说明用户还没登录，必须返回登录页
                switchToView('login-view');
            }
        });
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

        // --- 【【【日记系统核心修复 1/2：手动连接按钮电线】】】 ---
        document.getElementById('back-to-chat-from-diary').addEventListener('click', () => switchToView('chat-window-view'));
        addDiaryEntryFab.addEventListener('click', () => openDiaryEditor());
        // --- 【【【修复完毕】】】 ---

        chatSettingsButton.addEventListener('click', openContactSettings);
        
        // ▼▼▼ 【【【终极修复：在这里为两个表情包设置按钮“接上电线”】】】 ▼▼▼
        if (manageMyStickersEntry) {
            manageMyStickersEntry.addEventListener('click', () => {
                renderUserStickerSettings();
                switchToView('user-sticker-settings-view');
            });
        }
        if (manageAiStickersEntry) {
            manageAiStickersEntry.addEventListener('click', () => {
                renderStickerManager();
                switchToView('ai-sticker-manager-view');
            });
        }
        // ▲▲▲ 【【【修复植入完毕】】】 ▲▲▲

        // ▼▼▼ 【【【终极修复 PART 2：在这里为“AI表情包仓库”页面的按钮补上指令】】】 ▼▼▼
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

                document.getElementById('back-to-settings-from-sticker-manager-btn').addEventListener('click', () => switchToView('settings-view'));
        // ▲▲▲ 【【【指令补充完毕】】】 ▲▲▲

        // ▼▼▼ 【【【终极修复 PART 3：把“我的表情包”页面的按钮指令粘贴到这里】】】 ▼▼▼
        document.getElementById('back-to-settings-from-user-sticker-btn').addEventListener('click', () => switchToView('settings-view'));
        
        document.getElementById('save-user-sticker-settings-button').addEventListener('click', () => {
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
        // ▲▲▲ 【【【指令粘贴完毕】】】 ▲▲▲
         // ▼▼▼ 【【【终极修复 PART 4：把“账本”按钮的指令粘贴到这里】】】 ▼▼▼
        document.getElementById('side-menu-ledger').addEventListener('click', () => {
            closeSideMenu(); 
            switchToView('ledger-view');
            renderLedgerView(); 
        });
        document.getElementById('back-to-main-from-ledger').addEventListener('click', () => {
            const activeNav = document.querySelector('#app-nav .nav-button.active');
            switchToView(activeNav ? activeNav.dataset.view : 'chat-list-view');
        });
        // ▲▲▲ 【【【指令粘贴完毕】】】 ▲▲▲

// ▼▼▼ 【【【终极修复 PART 5：把“账本内部”所有按钮的指令都粘贴到这里】】】 ▼▼▼
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
        addTransactionFab.addEventListener('click', () => openTransactionEditor());
                document.getElementById('cancel-tx-editor-btn').addEventListener('click', closeTransactionEditor);
                document.getElementById('save-tx-editor-btn').addEventListener('click', saveTransaction);
        
        // ▼▼▼ 【【【终极修复：在这里为“类型选择器”补上切换指令】】】 ▼▼▼
        setupTypeSelector('tx-editor-type-selector');
        setupTypeSelector('accounting-type-selector');
        
        // --- 【【【日记系统核心修复 2/2：打开功能总开关】】】 ---
        bindDiaryEventListeners();
        // --- 【【【修复完毕】】】 ---

       // ▲▲▲ 【【【指令粘贴完毕】】】 ▲▲▲

        backToChatButton.addEventListener('click', () => openChat(activeChatContactId)); // ★★★【【【终极修复：让返回按钮真正地“打开”聊天！】】】★★★
        csEditAiProfile.addEventListener('click', openAiEditor);

        // 【【【终极修复 V3.0：在这里为“编辑生活作息”按钮接上电线！】】】
        const editScheduleBtn = document.getElementById('cs-edit-schedule');
        if (editScheduleBtn) {
            editScheduleBtn.addEventListener('click', openScheduleEditor);
        }

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
                showCustomConfirm('关系邀请', `确定要向 ${contact.remark} 发送情侣关系邀请吗？`, () => {
                    sendRelationshipProposal('user');
                });
                        } else if (currentPartnerId === contact.id) {
                showCustomConfirm('解除关系', `你确定要向 ${contact.remark} 发送解除关系通知吗？这将会生成一张分手卡片待发送。`, async () => {
                    // 解释：在这里，我们三步完成“分手仪式”
                    // 1. 在系统数据里，立刻将伴侣ID清除，正式恢复单身
                    appData.appSettings.partnerId = null;
                    saveAppData(); // 保存更改
                    
                    // 2. 像以前一样，准备好分手卡片消息
                    await handleEndRelationship(); 
                    
                    // 3. 刷新聊天列表和顶部UI，移除爱心图标
                    renderChatList();
                    updateChatHeader();
                });
            } else {
                const partner = appData.aiContacts.find(c => c.id === currentPartnerId);
                const partnerName = partner ? partner.remark : '未知';
                showCustomAlert('提示', `你当前的情侣是 ${partnerName}。\n请先与对方解除关系，才能开始新的恋情。`);
            }
        });

                // 4. 其他功能按钮暂时只给一个提示
        document.getElementById('fn-video-call').addEventListener('click', () => { alert('视频通话功能开发中...'); closeFunctionsPanel(); });
        document.getElementById('fn-ai-weather').addEventListener('click', () => {
             closeFunctionsPanel();
             openAiWeatherModal();
        });
        document.getElementById('close-ai-weather-modal').addEventListener('click', () => {
            document.getElementById('ai-weather-modal').classList.add('hidden');
        });

        // ▼▼▼ 【【【全新：为天气刷新按钮绑定事件】】】 ▼▼▼
        document.getElementById('refresh-ai-weather-btn').addEventListener('click', () => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (contact) {
                // 核心操作：将AI的天气缓存清空
                contact.weatherCache = null;
                saveAppData();
                // 再次调用打开弹窗的函数，它会因为找不到缓存而自动重新生成
                openAiWeatherModal();
            }
        });
        // ▲▲▲▲▲ ▲▲▲▲▲
        document.getElementById('fn-listen-together').addEventListener('click', () => { alert('一起听歌功能开发中...'); closeFunctionsPanel(); });
        document.getElementById('fn-gift').addEventListener('click', () => { alert('礼物功能开发中...'); closeFunctionsPanel(); });

        // 【核心修复】在这里为“日记”按钮重新接上电线！
        document.getElementById('fn-diary').addEventListener('click', () => {
            closeFunctionsPanel(); // 点击后，先关闭功能面板
            switchToView('diary-view'); // 然后切换到日记视图
            renderDiaryView(); // 最后，刷新日记内容
        });

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
        
                // 【【【代码优化】】】我们已经用下面的事件委托统一管理所有按钮，所以这个旧的循环可以被安全地移除了。
        // --- 【全新】记忆总结相关事件绑定 (最终修正版) ---
        // --- 【全新V2.0：剧情线驱动的线下模式总控制器】 ---
        const offlineToggle = document.getElementById('cs-offline-mode-toggle');
        const offlineSettingsBtn = document.getElementById('cs-edit-offline-settings');
        const offlineModal = document.getElementById('offline-settings-modal');
        const closeOfflineModalBtn = document.getElementById('close-offline-settings-btn');
        const saveOfflineModalBtn = document.getElementById('save-offline-settings-btn');
        const storylineSelect = document.getElementById('offline-storyline-select');

        // “遥控器”：一个专门根据下拉菜单选项，加载对应设置的函数
        const loadSettingsForSelectedStoryline = () => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            const selectedStoryId = storylineSelect.value;
            const story = contact.offlineStorylines.find(s => s.id === selectedStoryId);
            if (!story) return;

            // 【【【终极安全补丁】】】
            // 如果发现这条剧情线没有“设置文件夹”，就立刻给它创建一个！
            if (!story.settings) {
                story.settings = {
                    wordLimit: 0, perspective: 'second-person', preventControl: true,
                    startPrompt: '', openingRemark: ''
                };
            }

            const settings = story.settings;
            document.getElementById('offline-word-limit').value = settings.wordLimit || '';
            document.getElementById('offline-perspective').value = settings.perspective;
            document.getElementById('offline-prevent-control-toggle').checked = settings.preventControl;
            document.getElementById('offline-start-prompt').value = settings.startPrompt || '';
            document.getElementById('offline-opening-remark').value = settings.openingRemark || '';
        };

        // 当下拉菜单选项改变时，自动调用“遥控器”
        storylineSelect.addEventListener('change', loadSettingsForSelectedStoryline);

        // 打开设置弹窗的全新逻辑
        offlineSettingsBtn.addEventListener('click', () => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;

            // 填充下拉菜单
            storylineSelect.innerHTML = '';
            if (contact.offlineStorylines.length === 0) {
                // 如果一条剧情线都没有，就创建一个临时的
                const option = document.createElement('option');
                option.textContent = "（将在开启后创建默认剧情线）";
                option.disabled = true;
                storylineSelect.appendChild(option);
            } else {
                contact.offlineStorylines.forEach(story => {
                    const option = document.createElement('option');
                    option.value = story.id;
                    option.textContent = story.name;
                    storylineSelect.appendChild(option);
                });
                // 默认选中当前激活的剧情线
                if (contact.activeOfflineStoryId) {
                    storylineSelect.value = contact.activeOfflineStoryId;
                }
            }
            
            // 加载初始设置
            loadSettingsForSelectedStoryline();
            offlineModal.classList.remove('hidden');
        });

        // 关闭设置弹窗
        closeOfflineModalBtn.addEventListener('click', () => offlineModal.classList.add('hidden'));

        // 保存设置的全新逻辑
        saveOfflineModalBtn.addEventListener('click', () => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            const selectedStoryId = storylineSelect.value;
            const story = contact.offlineStorylines.find(s => s.id === selectedStoryId);
            
            // 【【【终极安全补丁】】】
            if (!story) {
                showToast('错误：找不到对应的剧情线', 'error');
                return;
            };
            // 同样，如果发现没有“设置文件夹”，也立刻创建一个
            if (!story.settings) {
                story.settings = {};
            }

            // 将所有设置保存到选中的那条剧情线的.settings对象里
            story.settings.wordLimit = parseInt(document.getElementById('offline-word-limit').value) || 0;
            story.settings.perspective = document.getElementById('offline-perspective').value;
            story.settings.preventControl = document.getElementById('offline-prevent-control-toggle').checked;
            story.settings.startPrompt = document.getElementById('offline-start-prompt').value.trim();
            story.settings.openingRemark = document.getElementById('offline-opening-remark').value.trim();
            
            saveAppData();
            showToast(`剧情线 [${story.name}] 的设置已保存！`, 'success');
            offlineModal.classList.add('hidden');
        });

        // 核心：切换线上/线下模式的开关逻辑 (保持不变，它非常完美)
        offlineToggle.addEventListener('change', async () => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;
            const isEnteringOffline = offlineToggle.checked;

            if (isEnteringOffline) {
                // --- 准备进入线下模式 ---
                await forceSummaryOnModeSwitch(contact, 'online', 'memory');

                const enterOfflineMode = (storyId) => {
                    contact.activeOfflineStoryId = storyId;
                    contact.isOfflineMode = true;
                    saveAppData();
                    openChat(contact.id);
                    const storyName = contact.offlineStorylines.find(s => s.id === storyId)?.name || '';
                    showToast(`已进入剧情线: ${storyName}`, 'success');
                };

                // 智能判断：根据存档数量决定下一步操作
                if (contact.offlineStorylines.length === 0) {
                    // 没有任何存档，弹出选择框让用户决定第一个存档的模式
                    showCustomConfirm(
                        '首次开启剧情模式',
                        '如何开始你的第一段线下剧情？',
                        () => { // 用户选择“继承”
                            const newStory = { id: `story-${Date.now()}`, name: '默认剧情线', memory: contact.memory, settings: { ...contact.offlineSettings, openingRemark: '' }, mergePolicy: 'merge', chatHistory: [], lastPlayed: Date.now() };
                            contact.offlineStorylines.push(newStory);
                            enterOfflineMode(newStory.id);
                        },
                        () => { // 用户选择“全新”
                            const newStory = { id: `story-${Date.now()}`, name: '默认剧情线', memory: '', settings: { ...contact.offlineSettings, openingRemark: '' }, mergePolicy: 'separate', chatHistory: [], lastPlayed: Date.now() };
                            contact.offlineStorylines.push(newStory);
                            enterOfflineMode(newStory.id);
                        },
                        '继承线上记忆',
                        '开启全新记忆'
                    );
                } else if (contact.offlineStorylines.length === 1) {
                    // 只有一个存档，直接加载
                    enterOfflineMode(contact.offlineStorylines[0].id);
                } else {
                    // 有多个存档，弹出选择框
                    const storyOptions = contact.offlineStorylines.map(s => ({ id: s.id, text: s.name }));
                    showStorylineSelectionModal(storyOptions, (selectedId) => {
                        if (selectedId) {
                            enterOfflineMode(selectedId);
                        } else {
                            offlineToggle.checked = false; // 用户取消选择，拨回开关
                        }
                    });
                }
                } else {
                // --- 准备返回线上模式 ---
                const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
                let saveTarget = 'memory'; 
                if (activeStory && activeStory.mergePolicy === 'separate') {
                    saveTarget = 'offlineMemory'; 
                }
                
                await forceSummaryOnModeSwitch(contact, 'offline', saveTarget);
                
                contact.isOfflineMode = false;
                contact.justSwitchedToOnline = true; 
                saveAppData();
                openChat(contact.id);
                const toastMessage = saveTarget === 'separate' 
                    ? '已返回线上，剧情已总结并独立保存' 
                    : '已返回线上，剧情已总结并并入AI记忆';
                showToast(toastMessage, 'success');
            }
        });
        // 【【【核心新增：为“刷新AI记忆”设置项绑定事件】】】
const restartContextSetting = document.getElementById('cs-restart-context');
if (restartContextSetting) {
    restartContextSetting.addEventListener('click', () => {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        showGenericModeSelectModal((isOnline) => {
            if (isOnline) {
                // 【线上模式的逻辑】
                showCustomConfirm(
                    '刷新线上记忆',
                    '你确定要刷新AI的线上短期记忆吗？\n\nAI将忘记本次刷新之前的所有对话内容，开始一段全新的对话。\n\n（你的聊天记录本身不会被删除。）',
                    () => {
                        contact.contextStartIndex = contact.onlineChatHistory.length;
                        saveAppData();
                        switchToView('chat-window-view');
                        displayMessage('上下文已刷新，AI将从这里开始一段全新的对话。', 'system', { isNew: true, type: 'system' });
                    }
                );
            } else {
                // 【线下模式的逻辑】
                showCustomConfirm(
                    '重置剧情记忆',
                    `确定要清空 ${contact.remark} 的线下剧情记忆吗？\n\n这会让AI忘记你们在线下发生的所有故事，适合开启新篇章。`,
                    () => {
                        contact.offlineMemory = '';
                        saveAppData();
                        showCustomAlert('操作成功', '线下剧情记忆已清空。');
                    }
                );
            }
        });
    });
}
        cancelSummaryBtn.addEventListener('click', () => summaryEditorModal.classList.add('hidden'));
        copySummaryBtn.addEventListener('click', copySummaryToClipboard);
        saveSummaryBtn.addEventListener('click', saveSummaryToMemory);
        setupAutoSummaryInteraction(); // <--- 激活自动总结UI交互
        // --- 绑定结束 ---


        csDeleteContact.addEventListener('click', deleteActiveContact);

        // ▼▼▼ 【【【全新V2.0：为导出/导入按钮绑定魔法】】】 ▼▼▼
        document.getElementById('export-data-button').addEventListener('click', exportAllData);
        document.getElementById('import-data-button').addEventListener('click', importAllData);
        // (由于弹窗已被移除，此处不再需要为关闭和复制按钮绑定事件)
        // ▲▲▲▲▲ ▲▲▲▲▲  

        csPinToggle.addEventListener('change', togglePinActiveChat);
        
        // 【【【全新V2.0：为通用模式选择弹窗绑定按钮事件】】】
        document.getElementById('generic-mode-online-btn').addEventListener('click', () => {
            if (genericModeSelectionCallback) genericModeSelectionCallback(true);
            closeGenericModeSelectModal();
        });
        document.getElementById('generic-mode-offline-btn').addEventListener('click', () => {
            if (genericModeSelectionCallback) genericModeSelectionCallback(false);
            closeGenericModeSelectModal();
        });
        document.getElementById('close-generic-mode-select-btn').addEventListener('click', closeGenericModeSelectModal);


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

                        // 3. 从【所有】聊天记录中删除“官宣”消息
                        const relationshipStartText = `你和 ${contact.remark} 已正式确立情侣关系！`;
                        const isOfficialAnnouncement = msg => msg.type === 'system' && msg.content === relationshipStartText;
                        
                        // 【核心修复】同时打扫线上和线下两个房间
                        contact.onlineChatHistory = contact.onlineChatHistory.filter(msg => !isOfficialAnnouncement(msg));
                        contact.offlineChatHistory = contact.offlineChatHistory.filter(msg => !isOfficialAnnouncement(msg));

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

        // ▼▼▼ 【【【BUG修复 1/2：把被误删的“概率确认”按钮逻辑“焊接”回来】】】 ▼▼▼
        document.getElementById('custom-prompt-ok-btn').addEventListener('click', () => {
            if (promptCallback) {
                const inputValue = document.getElementById('custom-prompt-input').value;
                promptCallback(inputValue);
            }
            closeCustomPrompt();
        });
        // ▲▲▲▲▲ ▲▲▲▲▲

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

        // 步骤1：通知“档案管理员”去正确的档案柜里销毁记录
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (contact) {
            // 【【【终极修复：为心声删除功能也更新地图！】】】
            if (contact.isOfflineMode) {
                // 如果是线下模式，就必须找到当前激活的剧情线
                const activeStory = contact.offlineStorylines.find(s => s.id === contact.activeOfflineStoryId);
                // 并且只在那个剧情线的历史记录里进行删除
                if (activeStory) {
                    activeStory.chatHistory = activeStory.chatHistory.filter(msg => msg.id !== messageId);
                }
            } else {
                // 线上模式的逻辑保持不变
                contact.onlineChatHistory = contact.onlineChatHistory.filter(msg => msg.id !== messageId);
            }
            saveAppData(); // 【至关重要】保存档案的修改！
        }

        // 步骤2：命令“装修工”砸掉墙上的气泡
        row.remove();
    }
});
// ▼▼▼ 【【【全新：记账功能事件绑定】】】 ▼▼▼
        const fnAccountingBtn = document.getElementById('fn-accounting');
        if (fnAccountingBtn) {
            fnAccountingBtn.addEventListener('click', () => {
                closeFunctionsPanel(); // 【核心修正】在打开弹窗前，先命令功能面板收回
                document.getElementById('accounting-remarks-input').value = ''; // 确保备注框也被清空
                openAccountingModal();
            });
        }
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
            // 【核心修复】在添加一笔账目后，不再自动聚焦，让用户可以连续点击“添加另一笔”
            // itemInput.focus();
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
        // 【【【全新：为“真实作息”开关和按钮绑定事件】】】
        const scheduleToggle = document.getElementById('cs-schedule-toggle');
        if(scheduleToggle) {
            scheduleToggle.addEventListener('change', () => {
                const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
                if (!contact) return;
                contact.isScheduleEnabled = scheduleToggle.checked;
                saveAppData();
                showToast(`真实作息模拟已${scheduleToggle.checked ? '开启' : '关闭'}`, 'success');
            });
        }
               // 【【【全新V2.0：“精装修”后的作息编辑器总控制器】】】

        // 【【【全新V3.0：“精装修”后的作息编辑器总控制器】】】

    // 1. 主弹窗的按钮
    document.getElementById('close-schedule-editor-btn').addEventListener('click', () => {
        document.getElementById('schedule-editor-modal').classList.add('hidden');
    });
    document.getElementById('save-schedule-btn').addEventListener('click', saveSchedule);
    document.getElementById('add-work-item-btn').addEventListener('click', () => {
        openScheduleItemEditor('work', null); // "null"代表新建
    });
    document.getElementById('add-leisure-item-btn').addEventListener('click', () => {
        openScheduleItemEditor('leisure', null); // "null"代表新建
    });

    // 2. 单个活动编辑弹窗（“编辑车间”）的按钮
    document.getElementById('cancel-item-editor-btn').addEventListener('click', () => {
        document.getElementById('schedule-item-editor-modal').classList.add('hidden');
    });
    document.getElementById('save-item-editor-btn').addEventListener('click', saveScheduleItem);
    // 【【【BUG修复 1/3：为删除按钮绑定正确的函数】】】
    document.getElementById('delete-item-editor-btn').addEventListener('click', deleteScheduleItem);

 
    // 4. 主界面列表的事件委托（现在只负责删除主列表里的按钮）
    document.getElementById('schedule-editor-modal').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-schedule-item-btn')) {
            const type = e.target.dataset.type;
            const index = parseInt(e.target.dataset.index, 10);
            showCustomConfirm('删除确认', '确定要删除这个活动吗？', () => {
                const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
                if (contact && Array.isArray(contact.schedule[type])) {
                    contact.schedule[type].splice(index, 1);
                    renderScheduleItems(type, contact.schedule[type]);
                }
            });
        }
    }); 
    // 【【【全新：剧情线管理的核心函数们】】】
function renderOfflineStorylines() {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        // 【【【终极核心修复V2.0：直接通过ID寻找正确的容器】】】
        const container = document.getElementById('storyline-list-container');
        if (!contact || !container) return;

        container.innerHTML = '';
        if (contact.offlineStorylines.length === 0) {
            container.innerHTML = '<p class="placeholder-text" style="padding-top:20px;">还没有任何剧情线，点击右下角+号添加第一个存档吧！</p>';
            return;
        }

        contact.offlineStorylines.forEach(story => {
            const isActive = story.id === contact.activeOfflineStoryId;
            const itemDiv = document.createElement('div');
            // 【UI升级】模仿账本页，换上 ledger-item 这套“高级礼服”
            itemDiv.className = `ledger-item`; 
            itemDiv.innerHTML = `
                <div class="ledger-item-details">
                    <div class="ledger-item-header">
                        <span class="desc">${story.name} ${isActive ? '<span class="active-story-tag" style="font-size: 12px; color: #3B83A2; margin-left: 8px;">当前</span>' : ''}</span>
                    </div>
                </div>
                <div class="ledger-item-actions">
                    <button class="edit-storyline-btn" data-story-id="${story.id}" title="编辑存档">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button class="delete-storyline-btn" data-story-id="${story.id}" title="删除存档">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18m-2 14H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-6 5v6m4-6v6"/></svg>
                </button>
            </div>
            `;
            // 点击整个条目来切换存档
            itemDiv.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-storyline-btn')) {
                    contact.activeOfflineStoryId = story.id;
                    saveAppData();
                    renderOfflineStorylines(); // 重新渲染以更新高亮状态
                    showToast(`已切换到剧情线: ${story.name}`, 'success', 1500);
                }
            });
            container.appendChild(itemDiv);
        });
     }

    /**
     * 【【【终极修复版：真正驱动“下拉菜单”的全新控制器】】】
     * @param {Array} storyOptions - 格式为 [{id: 'story-123', text: '冒险故事'}] 的数组
     * @param {Function} callback - 用户选择后的回调函数，会返回选择的ID或null
     */
    function showStorylineSelectionModal(storyOptions, callback) {
        const modal = document.getElementById('storyline-select-modal');
        // 1. 【核心修正】定位到正确的下拉列表元素，而不是不存在的div
        const dropdown = document.getElementById('storyline-select-dropdown');
        const cancelBtn = document.getElementById('cancel-storyline-select-btn');
        const confirmBtn = document.getElementById('confirm-storyline-select-btn');

        // 2. 清空旧的<option>选项
        dropdown.innerHTML = '';

        // 3. 【核心修正】用 <option> 元素来填充下拉列表
        storyOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.id; // 把故事ID作为值
            optionElement.textContent = option.text; // 把故事名字作为显示的文本
            dropdown.appendChild(optionElement);
        });

        // 4. 【全新逻辑】为“确定”按钮绑定【一次性】点击事件
        const confirmHandler = () => {
            modal.classList.add('hidden');
            // 当点击确定时，读取下拉列表当前选中的值，并把它传回去
            callback(dropdown.value);
            // 用完就扔，防止重复绑定
            confirmBtn.removeEventListener('click', confirmHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
        };

        // 5. 为“取消”按钮也绑定一次性事件
        const cancelHandler = () => {
            modal.classList.add('hidden');
            callback(null); // 用户取消，返回null
            // 同样，用完就扔
            confirmBtn.removeEventListener('click', confirmHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
        };

        // 6. 【安全措施】在绑定前，先移除所有旧的监听器，确保万无一失
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);

        // 7. 正式绑定新的事件
        confirmBtn.addEventListener('click', confirmHandler);
        cancelBtn.addEventListener('click', cancelHandler);

        // 8. 最后，显示弹窗
        modal.classList.remove('hidden');
    }

    // 【【【全新：剧情线编辑器的工作指令集】】】
    let currentEditingStoryId = null; // 用一个“便利贴”记住正在编辑哪个存档

    function openStorylineEditor(storyId) {
        currentEditingStoryId = storyId;
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        const story = contact.offlineStorylines.find(s => s.id === storyId);
        if (!story) return;

        // 1. 把存档的旧数据填进弹窗 (只剩名字和记忆)
        document.getElementById('storyline-editor-name').value = story.name;
        document.getElementById('storyline-editor-memory').value = story.memory || '';

        // 2. 显示弹窗
        document.getElementById('storyline-editor-modal').classList.remove('hidden');
    }

    function closeStorylineEditor() {
        document.getElementById('storyline-editor-modal').classList.add('hidden');
        currentEditingStoryId = null; // 清空便利贴
    }

    function saveStoryline() {
        if (!currentEditingStoryId) return;
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        const story = contact.offlineStorylines.find(s => s.id === currentEditingStoryId);
        if (!story) return;

        // 1. 从弹窗读取新数据 (只剩名字和记忆)
        const newName = document.getElementById('storyline-editor-name').value.trim();
        const newMemory = document.getElementById('storyline-editor-memory').value;

        // 2. 更新到数据中
        if (newName) story.name = newName;
        story.memory = newMemory;

        // 3. 保存、刷新、关闭
        saveAppData();
        renderOfflineStorylines();
        closeStorylineEditor();
        showToast('剧情线已保存！', 'success');
    }
    // --- 导航与事件绑定 ---
    
    // 1. 从主设置页，点击“剧情线管理”进入新页面
    document.getElementById('cs-manage-storylines').addEventListener('click', () => {
        renderOfflineStorylines(); // 进去前先刷新一次列表
        switchToView('storyline-manager-view');
    });

    // 2. 在新页面里，点击“返回”按钮回到主设置页
    document.getElementById('back-to-contact-settings-btn').addEventListener('click', () => {
        switchToView('contact-settings-view');
    });

    // 3. 在新页面里，点击右下角“+”号悬浮按钮，新增存档
    document.getElementById('add-storyline-fab').addEventListener('click', () => {
        showCustomPrompt('新剧情线', '请输入新剧情线的名称（存档名）:', '新冒险', (name) => {
            if (!name || !name.trim()) return;

            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;

            // 这是一个小助手，用来创建和激活存档，避免重复写代码
            const createAndActivateStory = (memory, policy) => {
                const newStory = {
                    id: `story-${Date.now()}`,
                    name: name.trim(),
                    memory: memory,
                    // 【核心修复】为新生剧情线“注入灵魂”，创建专属设置文件夹
                    settings: {
                        wordLimit: 0,
                        perspective: 'second-person',
                        preventControl: true,
                        startPrompt: '',
                        openingRemark: ''
                    },
                    mergePolicy: policy, // 记下选择的策略
                    chatHistory: [], // 新存档一定有空的聊天记录
                    lastPlayed: Date.now()
                };
                contact.offlineStorylines.push(newStory);
                contact.activeOfflineStoryId = newStory.id;
                saveAppData();
                renderOfflineStorylines();
            };

            showCustomConfirm(
                '选择记忆模式',
                `如何为 "${name.trim()}" 初始化剧情记忆？`,
                () => { // 用户点击“继承”后执行
                    createAndActivateStory(contact.memory, 'merge');
                    showToast('已继承线上记忆开启新剧情！', 'success');
                },
                () => { // 用户点击“全新”后执行
                    createAndActivateStory('', 'separate');
                    showToast('已开启全新剧情线！', 'success');
                },
                '继承线上记忆', // "确定"按钮的文字
                '开启全新记忆'  // "取消"按钮的文字
            );
        });
    });

    // 4. 使用事件委托，统一管理新页面内列表的所有点击事件
    document.getElementById('storyline-manager-view').addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-storyline-btn');
        const editBtn = e.target.closest('.edit-storyline-btn'); // 【新增】寻找编辑按钮

        if (deleteBtn) {
            const storyId = deleteBtn.dataset.storyId;
            showCustomConfirm('删除确认', '确定要永久删除这条剧情线吗？此操作无法撤销！', () => {
                const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
                contact.offlineStorylines = contact.offlineStorylines.filter(s => s.id !== storyId);
                if (contact.activeOfflineStoryId === storyId) {
                    contact.activeOfflineStoryId = contact.offlineStorylines.length > 0 ? contact.offlineStorylines[0].id : null;
                }
                saveAppData();
                renderOfflineStorylines();
            });
        } else if (editBtn) { // 【新增】如果点击的是编辑按钮
            const storyId = editBtn.dataset.storyId;
            openStorylineEditor(storyId); // 调用我们刚写的打开指令
        }
    });

    // 【【【全新：为新弹窗的按钮接上电线】】】
    document.getElementById('cancel-storyline-edit-btn').addEventListener('click', closeStorylineEditor);
    document.getElementById('save-storyline-edit-btn').addEventListener('click', saveStoryline);
    
    // ▼▼▼ 【【【全新：为“主动消息”设置项绑定交互事件】】】 ▼▼▼
    const contactSettingsContainer = document.querySelector('.contact-settings-container');
    if (contactSettingsContainer) {
        // 使用事件委托，更高效地处理点击和输入
        contactSettingsContainer.addEventListener('change', (e) => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;

            // 主动消息开关的逻辑
            if (e.target.id === 'cs-proactive-toggle') {
                const isEnabled = e.target.checked;
                contact.proactiveMessaging.enabled = isEnabled;
                document.getElementById('cs-proactive-interval-item').style.display = isEnabled ? 'flex' : 'none';
                saveAppData();
            }

            // 【全新】离线消息总开关的逻辑
            if (e.target.id === 'cs-offline-msg-toggle') {
                const isEnabled = e.target.checked;
                contact.offlineMessaging.enabled = isEnabled;
                // 当开关状态改变时，同步显示或隐藏详细设置
                document.getElementById('cs-offline-msg-interval-item').style.display = isEnabled ? 'flex' : 'none';
                document.getElementById('cs-offline-msg-sleep-item').style.display = isEnabled ? 'flex' : 'none';
                saveAppData();
            }
        });

        contactSettingsContainer.addEventListener('input', (e) => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;

            // 主动消息输入框的逻辑
            if (e.target.id === 'cs-proactive-interval-input') {
                let interval = parseInt(e.target.value, 10);
                if (isNaN(interval) || interval < 5) {
                    interval = 5;
                }
                contact.proactiveMessaging.interval = interval;
                saveAppData();
            }

            // 【全新】离线消息各个输入框的逻辑
            const targetId = e.target.id;
            if (targetId === 'cs-offline-msg-interval-input') {
                // 【核心修改1】更换翻译官，让代码能看懂小数
                let interval = parseFloat(e.target.value);
                // 【核心修改2】调整安全检查的最小值，比如允许最小为0.5小时（30分钟）
                if (isNaN(interval) || interval < 0.5) {
                    interval = 0.5; 
                }
                contact.offlineMessaging.intervalHours = interval;
                saveAppData();
            } else if (targetId === 'cs-offline-msg-sleep-start') {
                contact.offlineMessaging.sleepStart = e.target.value;
                saveAppData();
            } else if (targetId === 'cs-offline-msg-sleep-end') {
                contact.offlineMessaging.sleepEnd = e.target.value;
                saveAppData();
            }
        });
    }
    // ▲▲▲▲▲ ▲▲▲▲▲

    // 【全新】为登录页面的按钮和链接绑定事件
        document.getElementById('login-button').addEventListener('click', handleLogin);
        document.getElementById('login-to-settings-link').addEventListener('click', (e) => {
            e.preventDefault();
            switchToView('settings-view');
        });

        // 【【【核心修复：安装“智能打卡机”，在用户离开时记录时间】】】
        window.addEventListener('beforeunload', () => {
            // 检查用户是否已经成功登录
            if (hasUserLoggedIn) {
                // 遍历所有的AI联系人
                appData.aiContacts.forEach(contact => {
                    // 为每一个联系人，都盖上当前时间的“离线邮戳”
                    contact.lastVisitTimestamp = Date.now();
                });
                // 执行最后一次保存，确保时间戳被永久记录下来
                saveAppData();
            }
        });

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
            // 【核心修复】同样移除这里的自动聚焦
            // csAutoSummaryInput.focus();
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

    // 【【【全新：通用模式选择弹窗的“遥控器”】】】
    let genericModeSelectionCallback = null;
    function showGenericModeSelectModal(onSelect) {
        genericModeSelectionCallback = onSelect;
        document.getElementById('generic-mode-select-modal').classList.remove('hidden');
    }
    function closeGenericModeSelectModal() {
        document.getElementById('generic-mode-select-modal').classList.add('hidden');
        genericModeSelectionCallback = null;
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
    
        // “工人” V2.0：执行撤回操作 (已升级，可以处理“访客”)
    function recallMessage() {
        if (!activeContextMenuMessageId) return;

        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;

        const messageIdToRecall = activeContextMenuMessageId;
        
        // 检查《访客登记簿》
        const messageIndexInUnsent = contact.unsentMessages.findIndex(msg => msg.id === messageIdToRecall);
        if (messageIndexInUnsent > -1) {
            // 对于“访客”，撤回就等于直接删除
            contact.unsentMessages.splice(messageIndexInUnsent, 1);
            saveAppData();
            const el = messageContainer.querySelector(`[data-message-id="${messageIdToRecall}"]`);
            if (el) el.remove();
            renderChatList();
            return; // 操作完成，结束
        }

                // 【核心修复】根据当前模式，选择正确的“档案柜”进行操作
        const sourceHistory = contact.isOfflineMode ? contact.offlineChatHistory : contact.onlineChatHistory;
        
        let messageIndex = sourceHistory.findIndex(msg => msg.id === messageIdToRecall);
        if (messageIndex > -1) {
            const originalMessage = sourceHistory[messageIndex];
            const recalledMessage = {
                id: originalMessage.id,
                type: 'recalled',
                role: originalMessage.role,
                timestamp: originalMessage.timestamp || Date.now(),
                mode: contact.isOfflineMode ? 'offline' : 'online' // 撤回记录也带上模式
            };
            sourceHistory.splice(messageIndex, 1, recalledMessage);
            saveAppData();
            openChat(activeChatContactId);
        }
    function recallMessageByAI(messageId) {
        const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
        if (!contact) return;
        
        // 【核心修复】让AI同时检查线上和线下两个档案柜
        let targetHistory = null;
        let messageIndex = -1;

        // 先在线上档案柜里找
        messageIndex = contact.onlineChatHistory.findIndex(msg => msg.id === messageId);
        if (messageIndex > -1) {
            targetHistory = contact.onlineChatHistory;
        } else {
            // 如果线上没找到，再去线下档案柜里找
            messageIndex = contact.offlineChatHistory.findIndex(msg => msg.id === messageId);
            if (messageIndex > -1) {
                targetHistory = contact.offlineChatHistory;
            }
        }

        if (targetHistory && messageIndex > -1) {
            const originalMessage = targetHistory[messageIndex];
            if (originalMessage.role !== 'assistant') return;

            const recalledMessage = {
                id: originalMessage.id,
                type: 'recalled',
                role: 'assistant',
                timestamp: originalMessage.timestamp || Date.now(),
                mode: originalMessage.mode // 保留原始消息的模式
            };
            // 在找到消息的那个正确的档案柜里执行替换操作
            targetHistory.splice(messageIndex, 1, recalledMessage);
            saveAppData();
            openChat(activeChatContactId);
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







               // 【【【核心终极修复：在这里调用日记系统的总开关，让所有日记按钮生效！】】】
        bindDiaryEventListeners(); // <--- 看这里！我们恢复了这行代码的效力！
    
        
        // ▼▼▼ 【【【全新：日记系统事件绑定】】】 ▼▼▼
        // 1. "更多"功能抽屉里的日记按钮
        document.getElementById('fn-diary').addEventListener('click', () => {
            closeFunctionsPanel(); // 先关闭功能面板
            switchToView('diary-view');
            renderDiaryView(); // 每次进入都重新渲染
        });

        // 2. 从日记本返回聊天列表
        document.getElementById('back-to-chat-from-diary').addEventListener('click', () => switchToView('chat-window-view'));

        // 3. 日记本内部的Tab切换
        document.querySelector('.diary-tabs').addEventListener('click', (e) => {
            if (e.target.classList.contains('diary-tab-btn')) {
                document.querySelectorAll('.diary-tab-btn, .diary-tab-content').forEach(el => el.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.tab + '-content').classList.add('active');
            }
        });

        // 4. 点击"+"号，打开日记编辑器
        addDiaryEntryFab.addEventListener('click', () => openDiaryEditor());

        // 5. 日记编辑器的按钮
        document.getElementById('cancel-diary-btn').addEventListener('click', closeDiaryEditor);
        document.getElementById('save-diary-btn').addEventListener('click', saveDiaryEntry);

        // 6. 日记编辑器工具栏 V19.0 (静默执行最终版)
        const diaryToolbar = document.querySelector('.diary-toolbar');
        let savedSelectionRange = null;

        // 【侦察兵】 - 负责更新UI状态
        const updateToolbarStatus = () => {
            if (diaryEditorModal.classList.contains('hidden')) return;
            ['bold', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight'].forEach(format => {
                try {
                    const isActive = document.queryCommandState(format);
                    const btn = diaryToolbar.querySelector(`[data-format=${format}]`);
                    if (btn) btn.classList.toggle('is-active', isActive);
                } catch (e) {}
            });
        };
        document.addEventListener('selectionchange', updateToolbarStatus);
        diaryEditorContent.addEventListener('keyup', updateToolbarStatus);
        diaryEditorContent.addEventListener('mouseup', updateToolbarStatus);
        diaryEditorContent.addEventListener('focus', updateToolbarStatus);

                // 【超级大脑 V2.0】 - 负责静默执行命令
        const executeCommand = (command, value = null) => {
            // 【【【核心最终修复：聚焦 -> 执行 -> 更新】】】
            
            // 步骤1：确保编辑器处于激活状态，这是执行命令的前提
            diaryEditorContent.focus();

            // 步骤2：恢复上次选中的文本，确保命令用在正确的地方
            if (savedSelectionRange) {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(savedSelectionRange);
            }
            
            // 步骤3：正式执行格式化命令
            document.execCommand(command, false, value);
            
            // 步骤4：清理临时保存的选区，并刷新工具栏的按钮状态
            savedSelectionRange = null;
            setTimeout(updateToolbarStatus, 100);
        };
        
        // 【命令执行官】 - 统一的按钮逻辑处理中心
        const runCommandLogic = async (btn) => {
            if (!btn) return;

            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                savedSelectionRange = selection.getRangeAt(0).cloneRange();
            }

            const format = btn.dataset.format;
            const command = btn.dataset.command;
            const value = btn.dataset.value;
            const id = btn.id;

            if ( (format && !command && format !== 'insertImage') || command === 'changeFontSize' ) {
                if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                    showToast('请先选中文本', 'info', 1500);
                    return;
                }
                if (command === 'changeFontSize') {
                    const currentFontSize = document.queryCommandValue("fontSize") || "3";
                    let newSize = parseInt(currentFontSize) + (value === 'increase' ? 1 : -1);
                    newSize = Math.max(1, Math.min(7, newSize));
                    executeCommand('fontSize', newSize);
                } else {
                    executeCommand(format);
                }
            } 
            else if (format === 'insertImage' || id === 'diary-set-bg-btn') {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (format === 'insertImage') {
                        const reader = new FileReader();
                        reader.onload = (readEvent) => {
                            const html = `<p align="left"><img src="${readEvent.target.result}" style="max-width: 100%; height: auto; border-radius: var(--radius-md);"></p>`;
                            executeCommand('insertHTML', html);
                        };
                        reader.readAsDataURL(file);
                    } else { // set-bg-btn logic
                        if (!currentEditingDiaryId) {
                            diaryEditorContent.newBackgroundImageFile = file;
                            diaryEditorContent.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
                            showToast('背景已暂存', 'info'); return;
                        }
                        const entry = appData.userDiary.find(d => d.id === currentEditingDiaryId);
                        if (!entry) return;
                        const newBgKey = `diary-bg-${entry.id}`;
                        try {
                            if (entry.backgroundKey) await db.deleteImage(entry.backgroundKey);
                            await db.saveImage(newBgKey, file);
                            entry.backgroundKey = newBgKey; saveAppData();
                            diaryEditorContent.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
                            showToast('背景设置成功', 'success');
                        } catch (error) { showToast('背景保存失败', 'error'); }
                    }
                };
                fileInput.click();
            } else if (id === 'diary-remove-bg-btn') {
                if (!currentEditingDiaryId) {
                    delete diaryEditorContent.newBackgroundImageFile;
                    diaryEditorContent.style.backgroundImage = 'none';
                    showToast('暂存背景已移除', 'info'); return;
                }
                const entry = appData.userDiary.find(d => d.id === currentEditingDiaryId);
                if (!entry || !entry.backgroundKey) {
                    showToast('没有背景', 'info'); return;
                }
                try {
                    await db.deleteImage(entry.backgroundKey);
                    entry.backgroundKey = null; saveAppData();
                    diaryEditorContent.style.backgroundImage = 'none';
                    showToast('背景已移除', 'success');
                } catch (error) { showToast('移除背景失败', 'error'); }
            } else if (btn.classList.contains('color-picker-label')) {
                btn.querySelector('input[type="color"]').click();
            }
        };

        // 【分离式事件处理】

        // 1. PC端：使用 mousedown
        diaryToolbar.addEventListener('mousedown', (e) => {
            const btn = e.target.closest('.tool-btn');
            if (btn) {
                e.preventDefault();
                runCommandLogic(btn);
            }
        });

        // 2. 移动端：智能触摸侦测器
        let touchState = {};
        diaryToolbar.addEventListener('touchstart', (e) => {
            touchState.isScrolling = false;
        }, { passive: true });

        diaryToolbar.addEventListener('touchmove', (e) => {
            touchState.isScrolling = true;
        }, { passive: true });

        diaryToolbar.addEventListener('touchend', (e) => {
            if (touchState.isScrolling) return;

            const btn = e.target.closest('.tool-btn');
            if (btn) {
                e.preventDefault();
                runCommandLogic(btn);
            }
        });
        
        // 颜色选择器的“事后”响应
        document.getElementById('diary-highlight-color-picker').addEventListener('input', (e) => executeCommand('hiliteColor', e.target.value));
        document.getElementById('diary-text-color-picker').addEventListener('input', (e) => executeCommand('foreColor', e.target.value));
        
        // 查看器按钮
        document.getElementById('close-diary-viewer-btn').addEventListener('click', closeDiaryViewer);
        document.getElementById('edit-diary-fab').addEventListener('click', () => {
            const diaryId = diaryViewerModal.dataset.currentDiaryId;
            if (diaryId) {
                closeDiaryViewer();
                openDiaryEditor(diaryId);
            }
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


    // 在主事件绑定函数中调用日记的事件绑定
    // (请确保 bindEventListeners 函数中有这行代码)
    // bindDiaryEventListeners();
    
    /**
     * 【【【全新：AI生活作息模拟器 V1.0】】】
     * @param {object} schedule - AI的“人生剧本”
     * @returns {object} - 返回一个包含当前状态和是否清醒的对象
     */
    
        /**
     * 【全新】作息表翻译官：把程序看的作息表，翻译成AI能看懂的人类语言
     */
    



    

        // 【【【全新V2.0：“精装修”后的作息编辑器总控制器】】】

        // 【【【全新V3.0：“精装修”后的作息编辑器总控制器】】】

    // 1. 主弹窗的按钮
    document.getElementById('close-schedule-editor-btn').addEventListener('click', () => {
        document.getElementById('schedule-editor-modal').classList.add('hidden');
    });
    document.getElementById('save-schedule-btn').addEventListener('click', saveSchedule);
    document.getElementById('add-work-item-btn').addEventListener('click', () => {
        openScheduleItemEditor('work', null); // "null"代表新建
    });
    document.getElementById('add-leisure-item-btn').addEventListener('click', () => {
        openScheduleItemEditor('leisure', null); // "null"代表新建
    });

    // 2. 单个活动编辑弹窗（“编辑车间”）的按钮
    document.getElementById('cancel-item-editor-btn').addEventListener('click', () => {
        document.getElementById('schedule-item-editor-modal').classList.add('hidden');
    });
    document.getElementById('save-item-editor-btn').addEventListener('click', saveScheduleItem);
    // 【【【BUG修复 1/3：为删除按钮绑定正确的函数】】】
    document.getElementById('delete-item-editor-btn').addEventListener('click', deleteScheduleItem);

 
    // 4. 主界面列表的事件委托（现在只负责删除主列表里的按钮）
    document.getElementById('schedule-editor-modal').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-schedule-item-btn')) {
            const type = e.target.dataset.type;
            const index = parseInt(e.target.dataset.index, 10);
            showCustomConfirm('删除确认', '确定要删除这个活动吗？', () => {
                const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
                if (contact && Array.isArray(contact.schedule[type])) {
                    contact.schedule[type].splice(index, 1);
                    renderScheduleItems(type, contact.schedule[type]);
                }
            });
        }
    });
    
       // 【【【终极修复V2.0：使用事件委托，统一管理设置页的所有点击事件】】】
    if (contactSettingsView) {
        contactSettingsView.addEventListener('click', (e) => {
            const targetItem = e.target.closest('.settings-item');
            if (!targetItem) return;

            // 我们把所有需要点击的功能都集中到这里来管理
            switch (targetItem.id) {
                case 'cs-edit-ai-profile':
                    openAiEditor();
                    break;
                case 'cs-edit-my-profile':
                    openProfileModal();
                    break;
                case 'cs-edit-schedule': // <-- 在这里为“编辑生活作息”按钮添加指令
                    openScheduleEditor();
                    break;
                case 'cs-restart-context':
                    // 手动触发一次点击事件，这样就能复用我们上面写好的逻辑
                    targetItem.dispatchEvent(new Event('customClick'));
                    break;
                // case 'cs-clear-history' 已被移除，因为它现在有了自己的专属指令官
                case 'cs-delete-contact':
                    deleteActiveContact();
                    break;
            }
        });

        // 由于事件委托会“拦截”默认的点击，我们为这两个需要弹窗的按钮创建一个自定义事件
        document.getElementById('cs-restart-context').addEventListener('customClick', () => {
            const contact = appData.aiContacts.find(c => c.id === activeChatContactId);
            if (!contact) return;
            showGenericModeSelectModal((isOnline) => {
                if (isOnline) {
                    showCustomConfirm('刷新线上记忆', '你确定要刷新AI的线上短期记忆吗？\n\nAI将忘记本次刷新之前的所有对话内容，开始一段全新的对话。\n\n（你的聊天记录本身不会被删除。）', () => {
                        contact.contextStartIndex = contact.onlineChatHistory.length;
                        saveAppData();
                        switchToView('chat-window-view');
                        displayMessage('上下文已刷新，AI将从这里开始一段全新的对话。', 'system', { isNew: true, type: 'system' });
                    });
                } else {
                    showCustomConfirm('重置剧情记忆', `确定要清空 ${contact.remark} 的线下剧情记忆吗？\n\n这会让AI忘记你们在线下发生的所有故事，适合开启新篇章。`, () => {
                        contact.offlineMemory = '';
                        saveAppData();
                        showCustomAlert('操作成功', '线下剧情记忆已清空。');
                    });
                }
            });
        });

        
    }
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
    
    // 【【【这就是那扇被放错位置的“总大门”，我们把它搬到这里来！】】】
    }

    
    initialize();
});

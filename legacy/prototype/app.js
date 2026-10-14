// ================= 核心配置与状态 =================
const DEEPSEEK_API_KEY = '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// 背景音乐系统
let bgmMain = null;
let bgmScene = null;
let isMusicPlaying = false;

// 账号系统数据
let accounts = JSON.parse(localStorage.getItem('pet_accounts')) || {};
let currentUser = null;
let state = null; // 当前用户的状态

// 宠物种类数据与性格 (修改为真实的 GIF 路径)
const PET_TYPES = [
    { name: '小狗', dir: '小狗和小龟GIF/小狗GIF', personality: '活泼黏人', sound: '汪汪汪！' },
    { name: '小龟', dir: '小狗和小龟GIF/小龟GIF', personality: '慢条斯理', sound: '吧唧吧唧...' },
    { name: '小羊', dir: '小猫和小羊GIF/小羊', personality: '温柔胆小', sound: '咩咩咩...' },
    { name: '猫咪', dir: '小猫和小羊GIF/猫咪', personality: '傲娇慵懒', sound: '喵呜...' }
];

// 宠物表情映射库 (用于大模型解析时对应动作)
const PET_FACES = {
    'idle': '待机',
    '开心': '开心',
    '睡觉': '睡觉',
    '吃饭': '吃饭',
    '发呆': '思考',
    '思考': '思考',
    '打滚': '打滚',
    '生气': '打滚', // 如果没有生气，用打滚代替
    '伤心': '伤心流泪'
};

// 家具商店数据
const SHOP_ITEMS = [
    { id: 'rug', name: '毛绒地毯', price: 30, icon: '🧶', class: 'pos-rug' },
    { id: 'bed', name: '豪华软床', price: 80, icon: '🛏️', class: 'pos-bed' },
    { id: 'toy', name: '发声玩具', price: 50, icon: '🎾', class: 'pos-toy' }
];

const PHOTO_FRAMES = [
    { id: 'none', name: '无边框', src: null },
    // 竖版
    { id: 'v1', name: '竖版1', src: '拍立得相框/001.PNG', width: 604, height: 953, photoArea: { x: 28, y: 56, w: 541, h: 734 }, isHorizontal: false },
    { id: 'v2', name: '竖版2', src: '拍立得相框/002.PNG', width: 1163, height: 1819, photoArea: { x: 90, y: 154, w: 972, h: 1312 }, isHorizontal: false },
    { id: 'v3', name: '竖版3', src: '拍立得相框/003.PNG', width: 1190, height: 1848, photoArea: { x: 92, y: 143, w: 1004, h: 1351 }, isHorizontal: false },
    { id: 'v4', name: '竖版4', src: '拍立得相框/004.PNG', width: 1159, height: 1742, photoArea: { x: 65, y: 142, w: 1020, h: 1310 }, isHorizontal: false },
    // 横版 (根据竖版旋转90度)
    { id: 'h1', name: '横版1', src: '拍立得相框/001.PNG', width: 953, height: 604, photoArea: { x: 953 - 790, y: 28, w: 734, h: 541 }, isHorizontal: true },
    { id: 'h2', name: '横版2', src: '拍立得相框/002.PNG', width: 1819, height: 1163, photoArea: { x: 1819 - 1466, y: 90, w: 1312, h: 972 }, isHorizontal: true },
    { id: 'h3', name: '横版3', src: '拍立得相框/003.PNG', width: 1848, height: 1190, photoArea: { x: 1848 - 1494, y: 92, w: 1351, h: 1004 }, isHorizontal: true },
    { id: 'h4', name: '横版4', src: '拍立得相框/004.PNG', width: 1742, height: 1159, photoArea: { x: 1742 - 1452, y: 65, w: 1310, h: 1020 }, isHorizontal: true }
];
let currentFrameId = 'none';

// ================= DOM 元素获取 =================
const views = {
    auth: document.getElementById('view-auth'),
    adopt: document.getElementById('view-adopt'),
    map: document.getElementById('view-map'),
    scene: document.getElementById('view-scene'),
    closeup: document.getElementById('view-closeup'),
    desktopPet: document.getElementById('view-desktop-pet')
};

const elements = {
    globalHeader: document.getElementById('global-header'),
    displayPetName: document.getElementById('display-pet-name'),
    displayPetType: document.getElementById('display-pet-type'),
    coinCount: document.getElementById('coin-count'),
    
    // 音乐
    bgmMain: document.getElementById('bgm-main'),
    bgmScene: document.getElementById('bgm-scene'),
    musicControl: document.getElementById('music-control'),
    musicIcon: document.getElementById('music-icon'),
    
    // 课表
    schedulePanel: document.getElementById('schedule-panel'),
    scheduleImage: document.getElementById('schedule-image'),
    
    // Login / Auth
    authUsername: document.getElementById('auth-username'),
    authPassword: document.getElementById('auth-password'),
    loginPetBlob: document.getElementById('login-pet-blob'),
    loginPetTypeName: document.getElementById('login-pet-type-name'),
    ownerNameInput: document.getElementById('owner-name'),
    petNameInput: document.getElementById('pet-name'),
    
    // Map
    mapPet: document.getElementById('map-pet'),
    mapPetImg: document.getElementById('map-pet-img'),
    
    // Scene
    sceneTitle: document.getElementById('scene-title'),
    scenePetAvatar: document.getElementById('scene-pet-avatar'),
    scenePetImg: document.getElementById('scene-pet-img'),
    sceneActionTag: document.getElementById('scene-action-tag'),
    furnitureLayer: document.getElementById('furniture-layer'),
    sceneBgLayer: document.getElementById('scene-bg-layer'),
    panels: {
        'library': document.getElementById('panel-library'),
        'cabin': document.getElementById('panel-cabin'),
        'canteen': document.getElementById('panel-canteen'),
        'classroom': document.getElementById('panel-classroom'),
        'sports1': document.getElementById('panel-sports1'),
        'sports2': document.getElementById('panel-sports2'),
        'grassland': document.getElementById('panel-grassland')
    },
    
    // Closeup & Chat
    closeupPetAvatar: document.getElementById('closeup-pet-avatar'),
    closeupPetImg: document.getElementById('closeup-pet-img'),
    closeupActionTag: document.getElementById('closeup-action-tag'),
    chatBox: document.getElementById('chat-box'),
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    
    // Diary
    diaryPetAvatar: document.getElementById('diary-pet-avatar'),
    diaryPetImg: document.getElementById('diary-pet-img'),
    diaryActionTag: document.getElementById('diary-action-tag'),

    // Desktop Pet
    desktopPetAvatar: document.getElementById('desktop-pet-avatar'),
    desktopPetImg: document.getElementById('desktop-pet-img'),
    desktopActionTag: document.getElementById('desktop-action-tag'),
    desktopPetCount: document.getElementById('desktop-pet-count'),

    // Camera & Photo
    cameraVideo: document.getElementById('camera-video'),
    cameraCanvas: document.getElementById('camera-canvas'),
    cameraPet: document.getElementById('camera-pet'),
    cameraPetImg: document.getElementById('camera-pet-img'),
    photoGrid: document.getElementById('photo-grid'),

    // Shop
    shopList: document.getElementById('shop-list'),
    shopCoins: document.getElementById('shop-coins'),

    // Zoom
    mapZoomSlider: document.getElementById('map-zoom-slider'),
    mapBg: document.querySelector('.map-bg')
};

function renderFrameList() {
    const frameList = document.getElementById('frame-list');
    if (!frameList) return;
    frameList.innerHTML = '';
    
    PHOTO_FRAMES.forEach(frame => {
        const img = document.createElement('img');
        img.className = 'frame-option' + (frame.id === currentFrameId ? ' selected' : '');
        img.src = frame.src || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="%23eee"/><text x="25" y="25" font-family="Arial" font-size="12" fill="%23999" text-anchor="middle" dominant-baseline="middle">无</text></svg>';
        img.title = frame.name;
        if (frame.isHorizontal && frame.src) {
            img.style.transform = (frame.id === currentFrameId ? 'scale(1.1) ' : '') + 'rotate(90deg)';
        }
        
        img.onclick = () => {
            currentFrameId = frame.id;
            document.querySelectorAll('.frame-option').forEach(el => {
                el.classList.remove('selected');
                if (el.style.transform.includes('rotate')) {
                    el.style.transform = 'rotate(90deg)';
                } else {
                    el.style.transform = '';
                }
            });
            img.classList.add('selected');
            if (frame.isHorizontal) {
                img.style.transform = 'scale(1.1) rotate(90deg)';
            } else {
                img.style.transform = 'scale(1.1)';
            }
            
            // 更新预览
            const overlay = document.getElementById('camera-frame-overlay');
            const container = overlay.parentElement;
            if (frame.id === 'none') {
                overlay.style.display = 'none';
                overlay.src = '';
            } else {
                overlay.style.display = 'block';
                overlay.src = frame.src;
                
                const cw = container.clientWidth || 400;
                const ch = container.clientHeight || 300;
                
                if (frame.isHorizontal) {
                    overlay.style.transform = 'rotate(90deg)';
                    overlay.style.width = ch + 'px';
                    overlay.style.height = cw + 'px';
                    overlay.style.objectFit = 'fill';
                    overlay.style.left = (cw - ch) / 2 + 'px';
                    overlay.style.top = (ch - cw) / 2 + 'px';
                } else {
                    overlay.style.transform = 'none';
                    overlay.style.width = '100%';
                    overlay.style.height = '100%';
                    overlay.style.objectFit = 'contain';
                    overlay.style.left = '0';
                    overlay.style.top = '0';
                }
            }
        };
        frameList.appendChild(img);
    });
}

// ================= 背景音乐控制 =================
// 切换音乐播放/暂停
window.toggleMusic = function() {
    if (isMusicPlaying) {
        stopAllMusic();
    } else {
        const currentView = document.querySelector('.screen.active').id;
        if (currentView === 'view-map') {
            playMainBGM();
        } else {
            playSceneBGM();
        }
    }
};

// 播放主界面音乐
function playMainBGM() {
    stopAllMusic();
    elements.bgmMain.play().catch(() => {});
    isMusicPlaying = true;
    updateMusicButton();
}

// 播放场景音乐
function playSceneBGM() {
    stopAllMusic();
    elements.bgmScene.play().catch(() => {});
    isMusicPlaying = true;
    updateMusicButton();
}

// 停止所有音乐
function stopAllMusic() {
    elements.bgmMain.pause();
    elements.bgmScene.pause();
    isMusicPlaying = false;
    updateMusicButton();
}

// 更新音乐按钮状态
function updateMusicButton() {
    if (isMusicPlaying) {
        elements.musicIcon.textContent = '🔊';
        elements.musicControl.classList.add('playing');
    } else {
        elements.musicIcon.textContent = '🎵';
        elements.musicControl.classList.remove('playing');
    }
}

// ================= 0. 初始化与账号系统 =================
function init() {
    const lastUser = localStorage.getItem('pet_last_user');
    if (lastUser && accounts[lastUser]) {
        currentUser = lastUser;
        state = accounts[currentUser];
        if(state.petName) {
            updateUIState();
            switchView('view-map');
        } else {
            switchView('view-adopt');
            updateLoginPetPreview();
        }
    } else {
        switchView('view-auth');
    }
    
    renderFrameList();
}

function saveState() {
    if (!currentUser) return;
    accounts[currentUser] = state;
    try {
        localStorage.setItem('pet_accounts', JSON.stringify(accounts));
        localStorage.setItem('pet_last_user', currentUser);
    } catch (e) {
        console.warn('LocalStorage 可能已满，尝试清理空间...', e);
        if (state.photos && state.photos.length > 0) {
            state.photos.shift();
            saveState();
            return;
        } else {
            alert('本地存储空间已满，无法保存进度！');
        }
    }
    updateUIState();
}

window.login = function() {
    const user = elements.authUsername.value.trim();
    const pass = elements.authPassword.value.trim();
    if(!user || !pass) return alert('请输入账号和密码！');
    
    if (accounts[user] && accounts[user].password === pass) {
        currentUser = user;
        state = accounts[currentUser];
        if (state.petName) {
            saveState();
            switchView('view-map');
        } else {
            switchView('view-adopt');
            updateLoginPetPreview();
        }
    } else {
        alert('账号或密码错误！如果是新用户请点击注册。');
    }
};

window.register = function() {
    const user = elements.authUsername.value.trim();
    const pass = elements.authPassword.value.trim();
    if(!user || !pass) return alert('请输入账号和密码！');
    
    if (accounts[user]) {
        return alert('账号已存在，请直接登录！');
    }

    accounts[user] = {
        password: pass,
        userName: '',
        petName: '',
        petTypeIndex: 0,
        coins: 100,
        lastCheckIn: null,
        lastDiary: null,
        lastPomodoro: null,
        lastPhoto: null,
        furniture: [],
        photos: [],
        diaryEntries: []
    };
    
    currentUser = user;
    state = accounts[currentUser];
    saveState();
    
    alert('注册成功！快去领养宠物吧！');
    switchView('view-adopt');
    updateLoginPetPreview();
};

window.logout = function() {
    currentUser = null;
    state = null;
    localStorage.removeItem('pet_last_user');
    elements.authUsername.value = '';
    elements.authPassword.value = '';
    switchView('view-auth');
};

function updateUIState() {
    if(!state || !state.petName) return;
    elements.coinCount.textContent = state.coins;
    elements.displayPetName.textContent = state.petName;
    elements.displayPetType.textContent = PET_TYPES[state.petTypeIndex].name;
    
    checkTaskRedDot();
    syncPetAnimation('idle');
}

// ================= 1. 领养与宠物选择 =================
window.prevPet = () => {
    state.petTypeIndex = (state.petTypeIndex - 1 + PET_TYPES.length) % PET_TYPES.length;
    updateLoginPetPreview();
};

window.nextPet = () => {
    state.petTypeIndex = (state.petTypeIndex + 1) % PET_TYPES.length;
    updateLoginPetPreview();
};

function updateLoginPetPreview() {
    if(!state) return;
    const type = PET_TYPES[state.petTypeIndex];
    elements.loginPetTypeName.textContent = `${type.name} (${type.personality})`;
    
    const imgPath = `动物基础动作GIF/${type.dir}/待机.GIF`;
    const imgEl = document.getElementById('login-pet-img');
    if (imgEl) {
        imgEl.src = imgPath;
    }
}

document.getElementById('start-btn').addEventListener('click', () => {
    const owner = elements.ownerNameInput.value.trim();
    const pet = elements.petNameInput.value.trim();
    if (!owner || !pet) return alert('请填写真实的主人名和宠物名哦！');

    state.userName = owner;
    state.petName = pet;
    saveState();
    switchView('view-map');
});

const SPOTS = {
    '宿舍': {top: '62.5%', left: '36.5%', lng: 117.341831, lat: 38.98411},
    '图书馆': {top: '54.1%', left: '52.0%', lng: 117.346979, lat: 38.986265},
    '教学楼': {top: '40.3%', left: '51.8%', lng: 117.347223, lat: 38.988462},
    '第二食堂': {top: '58.8%', left: '31.1%', lng: 117.34122, lat: 38.986168},
    '第一食堂': {top: '24.0%', left: '40.2%', lng: 117.342339, lat: 38.99242},
    '理科操场': {top: '64.7%', left: '21.7%', lng: 117.339502, lat: 38.985488},
    '文科操场': {top: '23.5%', left: '57.8%', lng: 117.350073, lat: 38.99215},
    '大草原': {top: '41.0%', left: '37.0%', lng: 117.343427, lat: 38.989288}
};

// ================= 大地图漫游拖拽与居中 =================
window.centerMapOnPet = function(leftPct, topPct) {
    const container = document.querySelector('.map-container');
    const bg = document.querySelector('.map-bg');
    const px = parseFloat(leftPct) / 100;
    const py = parseFloat(topPct) / 100;
    
    const targetX = bg.clientWidth * px - container.clientWidth / 2;
    const targetY = bg.clientHeight * py - container.clientHeight / 2;
    
    container.scrollTo({
        left: targetX,
        top: targetY,
        behavior: 'smooth'
    });
};

const mapContainer = document.querySelector('.map-container');
let isDraggingMap = false;
let mapStartX, mapStartY, mapScrollLeft, mapScrollTop;

mapContainer.addEventListener('mousedown', (e) => {
    if (e.target.closest('.map-hotspot') || e.target.closest('#map-pet')) return;
    isDraggingMap = true;
    mapStartX = e.pageX - mapContainer.offsetLeft;
    mapStartY = e.pageY - mapContainer.offsetTop;
    mapScrollLeft = mapContainer.scrollLeft;
    mapScrollTop = mapContainer.scrollTop;
});
mapContainer.addEventListener('mouseleave', () => { isDraggingMap = false; });
mapContainer.addEventListener('mouseup', () => { isDraggingMap = false; });
mapContainer.addEventListener('mousemove', (e) => {
    if (!isDraggingMap) return;
    e.preventDefault();
    const x = e.pageX - mapContainer.offsetLeft;
    const y = e.pageY - mapContainer.offsetTop;
    const walkX = (x - mapStartX) * 1.5;
    const walkY = (y - mapStartY) * 1.5;
    mapContainer.scrollLeft = mapScrollLeft - walkX;
    mapContainer.scrollTop = mapScrollTop - walkY;
});

// 地图缩放控制
elements.mapZoomSlider.addEventListener('input', (e) => {
    const scale = e.target.value;
    elements.mapBg.style.width = `${scale}%`;
    elements.mapBg.style.height = `${scale}%`;
    
    if (state.currentLocation && SPOTS[state.currentLocation]) {
        const spot = SPOTS[state.currentLocation];
        centerMapOnPet(spot.left, spot.top);
    }
});

// ================= GPS 自动寻路跟随 =================
let gpsWatchId = null;

window.toggleGPS = function() {
    const btn = document.getElementById('gps-btn');
    const userMarker = document.getElementById('user-marker');
    
    if (gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
        btn.textContent = '📍 定位跟随';
        btn.style.color = '#ff8b94';
        userMarker.style.display = 'none';
        alert('已关闭 GPS 自动跟随。');
    } else {
        if (!navigator.geolocation) {
            return alert('您的浏览器不支持 GPS 定位！');
        }
        btn.textContent = '⏳ 定位中';
        gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                btn.textContent = '🟢 自动跟随';
                btn.style.color = '#4CAF50';
                handleGPSPosition(position.coords.latitude, position.coords.longitude);
            },
            (error) => {
                console.error(error);
                alert('定位失败，请确保在手机上授予了位置权限，且在 HTTPS 或 localhost 环境下。');
                btn.textContent = '📍 定位跟随';
                gpsWatchId = null;
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );
    }
};

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function handleGPSPosition(lat, lng) {
    let nearestSpot = null;
    let minDistance = Infinity;
    let nearestSpotData = null;

    for (const [name, spot] of Object.entries(SPOTS)) {
        const dist = getDistance(lat, lng, spot.lat, spot.lng);
        if (dist < minDistance) {
            minDistance = dist;
            nearestSpot = name;
            nearestSpotData = spot;
        }
    }

    if (nearestSpotData) {
        const dLng = lng - nearestSpotData.lng;
        const dLat = lat - nearestSpotData.lat;
        
        let userPctX = parseFloat(nearestSpotData.left) + (dLng * 2280);
        let userPctY = parseFloat(nearestSpotData.top) + (dLat * -5930);
        
        userPctX = Math.max(0, Math.min(100, userPctX));
        userPctY = Math.max(0, Math.min(100, userPctY));
        
        const userMarker = document.getElementById('user-marker');
        userMarker.style.display = 'block';
        userMarker.style.left = `${userPctX}%`;
        userMarker.style.top = `${userPctY}%`;
    }

    if (minDistance < 150 && nearestSpot !== state.currentLocation) {
        state.currentLocation = nearestSpot;
        saveState();
        
        const spot = SPOTS[nearestSpot];
        elements.mapPet.style.top = spot.top;
        elements.mapPet.style.left = spot.left;
        elements.mapPet.classList.add('roll');
        
        setTimeout(() => {
            elements.mapPet.classList.remove('roll');
            centerMapOnPet(spot.left, spot.top);
            syncPetAnimation('开心');
        }, 1000);
        
        const floatText = document.createElement('div');
        floatText.className = 'floating-text';
        floatText.style.position = 'fixed';
        floatText.style.top = '120px';
        floatText.style.left = '50%';
        floatText.style.transform = 'translateX(-50%)';
        floatText.style.background = 'rgba(255,255,255,0.9)';
        floatText.style.padding = '10px 20px';
        floatText.style.borderRadius = '20px';
        floatText.style.color = '#ff8b94';
        floatText.style.zIndex = '9999';
        floatText.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        floatText.textContent = `📍 识别到您已到达 [${nearestSpot}]，宠物跑过来啦！`;
        document.body.appendChild(floatText);
        
        setTimeout(() => floatText.remove(), 4000);
    }
}

// ================= 视图路由切换 =================
window.switchView = function(viewId) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewId.replace('view-', '')].classList.add('active');
    
    elements.globalHeader.style.display = (viewId === 'view-auth' || viewId === 'view-adopt') ? 'none' : 'flex';
    
    // 切换背景音乐
    if (isMusicPlaying) {
        if (viewId === 'view-map') {
            playMainBGM();
        } else if (viewId === 'view-scene' || viewId === 'view-closeup' || viewId === 'view-desktop-pet') {
            playSceneBGM();
        } else {
            stopAllMusic();
        }
    }
    
    if (viewId !== 'view-scene') {
        const dormRoom = document.getElementById('dorm-room');
        if (dormRoom) {
            dormRoom.classList.remove('active');
        }
        if (elements.sceneBgLayer) {
            elements.sceneBgLayer.style.background = '';
        }
    }
    
    if (viewId === 'view-map') {
        let spot;
        if (!state.currentLocation || !SPOTS[state.currentLocation]) {
            elements.mapPet.style.top = '50%';
            elements.mapPet.style.left = '50%';
            spot = { left: '50%', top: '50%' };
        } else {
            spot = SPOTS[state.currentLocation];
            elements.mapPet.style.top = spot.top;
            elements.mapPet.style.left = spot.left;
        }

        syncPetAnimation('idle');
        setTimeout(() => centerMapOnPet(spot.left, spot.top), 100);
    }
};

// ================= 2. 大地图逻辑 =================
window.goToScene = function(sceneName) {
    const spot = SPOTS[sceneName];

    if (spot) {
        elements.mapPet.style.top = spot.top;
        elements.mapPet.style.left = spot.left;
        elements.mapPet.classList.add('roll');
        
        state.currentLocation = sceneName;
        saveState();
        
        centerMapOnPet(spot.left, spot.top);
    }

    setTimeout(() => {
        elements.sceneTitle.textContent = sceneName;
        Object.values(elements.panels).forEach(p => {
            if (p) p.style.display = 'none';
        });
        
        // 隐藏课表栏目
        elements.schedulePanel.style.display = 'none';
        // 隐藏课桌
        document.getElementById('classroom-desks').style.display = 'none';
        // 隐藏图书馆装饰
        document.getElementById('library-decor').style.display = 'none';
        // 隐藏大草原装饰
        document.getElementById('grassland-decor').style.display = 'none';
        // 隐藏文科操场装饰
        const sports2Decor = document.getElementById('sports2-decor');
        if (sports2Decor) sports2Decor.style.display = 'none';
        // 隐藏理科操场装饰
        const sports1Decor = document.getElementById('sports1-decor');
        if (sports1Decor) sports1Decor.style.display = 'none';
        // 隐藏第一食堂装饰
        const canteen1Decor = document.getElementById('canteen1-decor');
        if (canteen1Decor) canteen1Decor.style.display = 'none';
        // 隐藏第二食堂装饰
        const canteen2Decor = document.getElementById('canteen2-decor');
        if (canteen2Decor) canteen2Decor.style.display = 'none';
        
        let autoAction = 'idle';
        const dormRoom = document.getElementById('dorm-room');
        
        if (dormRoom) dormRoom.classList.remove('active');
        elements.furnitureLayer.innerHTML = '';
        
        const petAvatar = document.getElementById('scene-pet-avatar');
        const actionTag = document.getElementById('scene-action-tag');
        const petHint = document.querySelector('.pet-hint');
        
        petAvatar.style.position = 'relative';
        petAvatar.style.top = '';
        petAvatar.style.left = '';
        petAvatar.style.transform = '';
        petAvatar.style.width = '';
        petAvatar.style.height = '';
        petAvatar.style.zIndex = '';
        
        actionTag.style.position = 'absolute';
        actionTag.style.bottom = '-10px';
        actionTag.style.right = 'auto';
        actionTag.style.left = '50%';
        actionTag.style.transform = 'translateX(-50%)';
        
        if (petHint) petHint.style.display = '';

        if (sceneName === '图书馆') {
            elements.panels.library.style.display = 'block';
            // 显示图书馆装饰
            document.getElementById('library-decor').style.display = 'block';
            elements.sceneBgLayer.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            autoAction = '睡觉';
        }
        if (sceneName === '教学楼') {
            elements.panels.classroom.style.display = 'block';
            elements.schedulePanel.style.display = 'block';
            // 设置课表图片
            elements.scheduleImage.src = '3334.jpg';
            // 显示课桌
            document.getElementById('classroom-desks').style.display = 'block';
            elements.sceneBgLayer.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
            autoAction = '思考';
        }
        if (sceneName === '理科操场') {
            elements.panels.sports1.style.display = 'block';
            // 显示理科操场装饰
            const sports1Decor = document.getElementById('sports1-decor');
            if (sports1Decor) sports1Decor.style.display = 'block';
            elements.sceneBgLayer.style.background = 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)';
            autoAction = '打滚';
        }
        if (sceneName === '文科操场') {
            elements.panels.sports2.style.display = 'block';
            // 显示文科操场装饰
            const sports2Decor = document.getElementById('sports2-decor');
            if (sports2Decor) sports2Decor.style.display = 'block';
            elements.sceneBgLayer.style.background = 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)';
            autoAction = '打滚';
        }
        if (sceneName === '大草原') {
            elements.panels.grassland.style.display = 'block';
            // 显示大草原装饰
            document.getElementById('grassland-decor').style.display = 'block';
            elements.sceneBgLayer.style.background = 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)';
            autoAction = '打滚';
        }
        if (sceneName === '宿舍') {
            elements.panels.cabin.style.display = 'block';
            renderFurniture();
            dormRoom.classList.add('active');
            
            petAvatar.style.position = 'absolute';
            petAvatar.style.top = '330px';
            petAvatar.style.left = '50%';
            petAvatar.style.transform = 'translateX(-50%)';
            petAvatar.style.width = '120px';
            petAvatar.style.height = '120px';
            petAvatar.style.zIndex = '10';
            
            actionTag.style.position = 'absolute';
            actionTag.style.top = '280px';
            actionTag.style.left = '50%';
            actionTag.style.transform = 'translateX(-50%)';
            actionTag.style.right = 'auto';
            
            if (petHint) petHint.style.display = 'none';
        }
        if (sceneName.includes('食堂')) {
            elements.panels.canteen.style.display = 'block';
            // 如果是第一食堂，显示装饰
            if (sceneName === '第一食堂') {
                const canteen1Decor = document.getElementById('canteen1-decor');
                if (canteen1Decor) canteen1Decor.style.display = 'block';
            }
            // 如果是第二食堂，显示装饰
            if (sceneName === '第二食堂') {
                const canteen2Decor = document.getElementById('canteen2-decor');
                if (canteen2Decor) canteen2Decor.style.display = 'block';
            }
            elements.sceneBgLayer.style.background = 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)';
            autoAction = '吃饭';
        }
        
        switchView('view-scene');
        syncPetAnimation(autoAction);
    }, 1000);
};

window.openCloseup = function() {
    switchView('view-closeup');
    syncPetAnimation('idle');
};

// ================= 宠物动画与摸摸反馈 =================
let petTimeout;
let pettingCount = 0;

window.petThePet = function(event) {
    pettingCount++;
    
    if (elements.desktopPetCount) {
        elements.desktopPetCount.textContent = pettingCount;
    }
    
    const floatText = document.createElement('div');
    floatText.className = 'floating-text';
    floatText.textContent = '+1 摸摸';
    floatText.style.left = `${event.clientX - 20}px`;
    floatText.style.top = `${event.clientY - 20}px`;
    document.body.appendChild(floatText);
    setTimeout(() => floatText.remove(), 1000);

    if (pettingCount >= 10) {
        pettingCount = 0;
        state.coins += 1;
        saveState();
        triggerSceneAction('开心', '好舒服！+1币');
        if (elements.desktopPetCount) elements.desktopPetCount.textContent = pettingCount;
    } else {
        syncPetAnimation('开心');
        setTimeout(() => syncPetAnimation('idle'), 500);
    }
};

// ================= 桌宠模式控制 =================
window.enterDesktopPetMode = function() {
    if (window.electronAPI) {
        window.electronAPI.enterPetMode();
    } else {
        alert('此功能需要下载桌面版客户端！\n\n(提示：请在项目目录下运行 npm install 和 npm start 来启动 Electron 客户端体验无边框桌宠。目前仅展示网页版预览)');
    }
    
    document.body.classList.add('transparent-mode');
    switchView('view-desktop-pet');
    syncPetAnimation('idle', '发呆中...');
    
    if (elements.desktopPetCount) {
        elements.desktopPetCount.textContent = pettingCount;
    }
};

window.exitDesktopPetMode = function() {
    if (window.electronAPI) {
        window.electronAPI.exitPetMode();
    }
    
    document.body.classList.remove('transparent-mode');
    switchView('view-map');
};

window.triggerSceneAction = function(action, tagText = '') {
    syncPetAnimation(action, tagText);
};

window.currentActionType = 'idle';

function syncPetAnimation(actionType, tagText = '') {
    window.currentActionType = actionType;
    
    const avatars = [elements.scenePetAvatar, elements.closeupPetAvatar, elements.diaryPetAvatar, elements.desktopPetAvatar];
    const tags = [elements.sceneActionTag, elements.closeupActionTag, elements.diaryActionTag, elements.desktopActionTag];
    const imgs = [elements.scenePetImg, elements.closeupPetImg, elements.mapPetImg, elements.cameraPetImg, elements.diaryPetImg, elements.desktopPetImg];
    
    const typeData = PET_TYPES[state.petTypeIndex];
    let faceName = PET_FACES[actionType] || '待机';
    const gifPath = `动物基础动作GIF/${typeData.dir}/${faceName}.GIF`;

    imgs.forEach(img => {
        if (img) {
            if (img.getAttribute('data-current-gif') !== gifPath) {
                img.src = gifPath;
                img.setAttribute('data-current-gif', gifPath);
            }
        }
    });

    avatars.forEach((avatar, index) => {
        if (!avatar) return;
        const tag = tags[index];
        
        avatar.classList.remove('roll');
        
        if (actionType === '打滚') {
            avatar.classList.add('roll');
        }

        if (tagText) {
            tag.textContent = `[${tagText}]`;
            tag.classList.add('show');
        } else {
            tag.classList.remove('show');
        }
    });

    clearTimeout(petTimeout);
    if (actionType !== '睡觉' && actionType !== 'idle') {
        petTimeout = setTimeout(() => syncPetAnimation('idle'), 3000);
    }
}

// ================= 图书馆 - 番茄钟 =================
let timerInterval;
let timerSeconds = 25 * 60;

window.toggleTimer = function() {
    const btn = document.getElementById('timer-btn');
    const progressBar = document.getElementById('timer-progress-bar');
    if (!btn || !progressBar) return;
    
    if (btn.innerText === '开始专注') {
        btn.innerText = '放弃专注';
        syncPetAnimation('睡觉', '安静陪伴你...');
        
        timerInterval = setInterval(() => {
            timerSeconds--;
            let m = Math.floor(timerSeconds / 60);
            let s = timerSeconds % 60;
            document.getElementById('timer-display').innerText = 
                `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                
            const progress = ((25 * 60 - timerSeconds) / (25 * 60)) * 100;
            progressBar.style.width = `${progress}%`;
                
            if (timerSeconds <= 0) {
                clearInterval(timerInterval);
                timerSeconds = 25 * 60;
                document.getElementById('timer-display').innerText = '25:00';
                progressBar.style.width = '0%';
                btn.innerText = '开始专注';
                
                state.lastPomodoro = new Date().toDateString();
                saveState();
                alert('专注完成！请前往【任务中心】领取奖励！');
                syncPetAnimation('开心', '专注完成！');
            }
        }, 1000);
    } else {
        clearInterval(timerInterval);
        timerSeconds = 25 * 60;
        document.getElementById('timer-display').innerText = '25:00';
        progressBar.style.width = '0%';
        btn.innerText = '开始专注';
        syncPetAnimation('idle');
    }
};

window.changeFocusDuration = function() {
    const select = document.getElementById('focus-duration');
    if (!select) return;
    const duration = parseInt(select.value);
    timerSeconds = duration * 60;
    let m = Math.floor(timerSeconds / 60);
    let s = timerSeconds % 60;
    document.getElementById('timer-display').innerText = 
        `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// ================= 教学楼 - 课程签到 =================
window.signIn = function(courseName) {
    addCoins(3);
    alert(`完成${courseName}签到！获得3个翻译币！`);
    event.target.disabled = true;
    event.target.innerText = '已签到';
    triggerSceneAction('开心', '签到成功！');
};

// ================= 食堂 - 具体菜品功能 =================
window.eatFood = function(foodName) {
    triggerSceneAction('吃饭');
    addCoins(2);
    alert(`宠物吃了${foodName}，很开心！获得2个翻译币！`);
};

window.randomFood = function() {
    const foods = ['红烧肉', '糖醋里脊', '番茄炒蛋', '麻辣烫', '宫保鸡丁', '鱼香肉丝', '黄焖鸡米饭', '螺蛳粉'];
    const randomFood = foods[Math.floor(Math.random() * foods.length)];
    eatFood(randomFood);
};

// ================= 操场 - 运动功能 =================
window.doExercise = function(exerciseName, minutes) {
    addCoins(minutes);
    triggerSceneAction('开心');
    alert(`完成${exerciseName}！获得${minutes}个翻译币！`);
};

// ================= 大草原 - 放松功能 =================
window.relax = function(relaxName) {
    triggerSceneAction('开心');
    alert(`宠物正在${relaxName}，心情变好了！`);
};

window.flyKite = function() {
    triggerSceneAction('打滚');
    addCoins(2);
    alert('放风筝真开心！获得2个翻译币！');
};

// ================= 右侧菜单与模态框 =================
window.openDiary = function() {
    document.getElementById('modal-diary').classList.add('active');
    document.getElementById('diary-text').value = '';
    syncPetAnimation('idle', '听你诉说...');
};

// ================= 日记与实时大模型情绪分析 =================
let isShowingDiaryHistory = false;

window.toggleDiaryHistory = function() {
    isShowingDiaryHistory = !isShowingDiaryHistory;
    const writeArea = document.getElementById('diary-write-area');
    const historyArea = document.getElementById('diary-history-area');
    
    if (isShowingDiaryHistory) {
        writeArea.style.display = 'none';
        historyArea.style.display = 'flex';
        renderDiaryHistory();
        syncPetAnimation('idle', '回忆真好...');
    } else {
        writeArea.style.display = 'flex';
        historyArea.style.display = 'none';
        syncPetAnimation('idle', '听你诉说...');
    }
};

function renderDiaryHistory() {
    const list = document.getElementById('diary-history-list');
    list.innerHTML = '';
    
    if (!state.diaryEntries || state.diaryEntries.length === 0) {
        list.innerHTML = '<div style="color:#999; text-align:center; padding-top: 20px;">还没有写过日记哦，快去记录第一篇吧！</div>';
        return;
    }
    
    const sortedEntries = [...state.diaryEntries].reverse();
    sortedEntries.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'diary-entry';
        
        const aiHtml = entry.aiSummary ? `<div class="diary-ai-summary">${entry.aiSummary}</div>` : '';
        
        div.innerHTML = `
            <div class="diary-entry-date">${entry.date || ''} ${entry.time || ''}</div>
            <div class="diary-entry-text">${entry.text || ''}</div>
            ${aiHtml}
        `;
        list.appendChild(div);
    });
}

let diaryDebounceTimer = null;
const diaryInput = document.getElementById('diary-text');
if (diaryInput) {
    diaryInput.addEventListener('input', () => {
        clearTimeout(diaryDebounceTimer);
        const text = diaryInput.value.trim();
        
        if (text.length < 2) {
            syncPetAnimation('idle', '听你诉说...');
            return;
        }
        
        syncPetAnimation('思考', '感受中...');
        
        diaryDebounceTimer = setTimeout(() => {
            analyzeDiaryMood(text);
        }, 1500);
    });
}

async function analyzeDiaryMood(text) {
    if (!DEEPSEEK_API_KEY) return;
    
    const prompt = `你是一个具有共情能力的电子宠物。请根据主人的日记内容判断情绪。
规则：
1. 如果主人开心/激动/期待，返回：开心
2. 如果主人难过/沮丧/生气，返回：伤心流泪
3. 如果主人在思考/疑惑，返回：思考
4. 如果情绪平淡或字数太少，返回：待机
只能输出这4个词之一，不要任何标点符号。
日记内容：${text}`;

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        const data = await response.json();
        let action = data.choices[0].message.content.trim();
        
        const validActions = ['开心', '伤心流泪', '思考', '待机'];
        if (!validActions.includes(action)) {
            action = '待机';
        }
        
        const tagMap = {
            '开心': '替你开心！',
            '伤心流泪': '抱抱你...',
            '思考': '原来是这样...',
            '待机': '默默陪伴'
        };
        
        syncPetAnimation(action, tagMap[action]);
    } catch (err) {
        console.error("日记情绪分析失败:", err);
        syncPetAnimation('待机', '默默陪伴');
    }
}

window.closeModal = function(modalId) {
    document.getElementById(modalId).classList.remove('active');
};

window.saveDiary = function() {
    const text = document.getElementById('diary-text').value.trim();
    if(!text) return;
    
    if (!state.diaryEntries) state.diaryEntries = [];
    
    const now = new Date();
    const todayStr = now.toDateString();
    const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    state.diaryEntries.push({
        date: todayStr,
        time: timeStr,
        text: text,
        aiSummary: '🐾 宠物正在认真阅读你的日记...'
    });
    
    const entryIndex = state.diaryEntries.length - 1;
    
    if (state.lastDiary !== todayStr) {
        state.lastDiary = todayStr;
        saveState();
        alert('日记保存成功！请前往【任务中心】领取奖励！');
    } else {
        saveState();
        alert('日记保存成功！(今天已经记录过啦)');
    }
    
    document.getElementById('diary-text').value = '';
    if (!isShowingDiaryHistory) {
        toggleDiaryHistory();
    } else {
        renderDiaryHistory();
    }
    
    generatePetSummary(entryIndex, text);
};

async function generatePetSummary(index, text) {
    if (!DEEPSEEK_API_KEY) {
        state.diaryEntries[index].aiSummary = '🐾 宠物太困睡着了，没能回复... (未配置 API_KEY)';
        saveState();
        if (isShowingDiaryHistory) renderDiaryHistory();
        return;
    }
    
    const petType = PET_TYPES[state.petTypeIndex];
    const prompt = `你是一只名为"${state.petName}"的电子宠物，种类是${petType.name}，性格是${petType.personality}。
你的主人刚刚写下了一篇日记：
"${text}"
请用符合你性格的宠物口吻，给主人写一段简短的暖心回复或心情总结（50字以内）。不要输出多余的解释。`;

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`API Error: ${response.status} - ${errData.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        const reply = data.choices[0].message.content.trim();
        
        state.diaryEntries[index].aiSummary = reply;
        saveState();
        if (isShowingDiaryHistory) renderDiaryHistory();
    } catch (err) {
        console.error("生成宠物日记回复失败:", err);
        state.diaryEntries[index].aiSummary = `🐾 宠物在思考时走神了... (API 错误: ${err.message})`;
        saveState();
        if (isShowingDiaryHistory) renderDiaryHistory();
    }
}

function checkTaskRedDot() {
    const redDot = document.getElementById('task-red-dot');
    if (!redDot || !state) return;
    
    const today = new Date().toDateString();
    let hasReward = false;
    
    if (state.lastCheckIn !== today) hasReward = true;
    if (state.lastDiary === today && state.lastDiaryClaimed !== today) hasReward = true;
    if (state.lastPomodoro === today && state.lastPomodoroClaimed !== today) hasReward = true;
    if (state.lastPhoto === today && state.lastPhotoClaimed !== today) hasReward = true;
    
    redDot.style.display = hasReward ? 'block' : 'none';
}

// ================= 任务中心 =================
const TASKS = [
    { id: 'checkin', name: '每日签到', desc: '每天来校园看看宠物', reward: 20 },
    { id: 'diary', name: '记录心情', desc: '写一篇心情日记', reward: 5 },
    { id: 'pomodoro', name: '专注学习', desc: '在图书馆完成一次25分钟专注', reward: 10 },
    { id: 'photo', name: '拍下回忆', desc: '和宠物拍一张合照', reward: 10 }
];

window.openTasks = function() {
    document.getElementById('modal-tasks').classList.add('active');
    renderTasks();
};

function renderTasks() {
    const taskList = document.getElementById('task-list');
    taskList.innerHTML = '';
    const today = new Date().toDateString();

    TASKS.forEach(task => {
        let isCompleted = false;
        let isClaimed = false;

        if (task.id === 'checkin') {
            isCompleted = true;
            isClaimed = (state.lastCheckIn === today);
        } else if (task.id === 'diary') {
            isCompleted = (state.lastDiary === today);
            isClaimed = (state.lastDiaryClaimed === today);
        } else if (task.id === 'pomodoro') {
            isCompleted = (state.lastPomodoro === today);
            isClaimed = (state.lastPomodoroClaimed === today);
        } else if (task.id === 'photo') {
            isCompleted = (state.lastPhoto === today);
            isClaimed = (state.lastPhotoClaimed === today);
        }

        const div = document.createElement('div');
        div.className = 'task-item';
        
        let btnHTML = '';
        if (isClaimed) {
            btnHTML = `<button class="primary-btn" disabled>已领取</button>`;
        } else if (isCompleted) {
            btnHTML = `<button class="primary-btn" onclick="claimTask('${task.id}', ${task.reward})">领取奖励</button>`;
        } else {
            btnHTML = `<button class="primary-btn" disabled>未完成</button>`;
        }

        div.innerHTML = `
            <div class="task-info">
                <h4>${task.name} <span style="color:#ff8b94;">+${task.reward} 币</span></h4>
                <p>${task.desc}</p>
            </div>
            <div class="task-action">
                ${btnHTML}
            </div>
        `;
        taskList.appendChild(div);
    });
}

window.claimTask = function(taskId, reward) {
    const today = new Date().toDateString();
    
    if (taskId === 'checkin') {
        state.lastCheckIn = today;
    } else if (taskId === 'diary') {
        state.lastDiaryClaimed = today;
    } else if (taskId === 'pomodoro') {
        state.lastPomodoroClaimed = today;
    } else if (taskId === 'photo') {
        state.lastPhotoClaimed = today;
    }

    state.coins += reward;
    saveState();
    
    alert(`领取成功！获得 ${reward} 翻译币`);
    renderTasks();
    
    if(elements.mapPet) elements.mapPet.classList.add('happy');
    setTimeout(() => {
        if(elements.mapPet) elements.mapPet.classList.remove('happy');
    }, 2000);
};

// ================= 家具商店 =================
window.openShop = function() {
    document.getElementById('modal-shop').classList.add('active');
    elements.shopCoins.textContent = state.coins;
    
    elements.shopList.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        const isBought = state.furniture.includes(item.id);
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `
            <div>${item.icon} ${item.name} (${item.price}币)</div>
            <button class="action-btn" ${isBought ? 'disabled' : ''} onclick="buyFurniture('${item.id}', ${item.price})">
                ${isBought ? '已拥有' : '购买'}
            </button>
        `;
        elements.shopList.appendChild(div);
    });
};

window.buyFurniture = function(id, price) {
    if (state.coins < price) {
        return alert('翻译币不足！');
    }
    state.coins -= price;
    state.furniture.push(id);
    saveState();
    alert('购买成功！家具已放置在小屋中。');
    openShop();
    renderFurniture();
};

function renderFurniture() {
    elements.furnitureLayer.innerHTML = '';
    state.furniture.forEach(fid => {
        const item = SHOP_ITEMS.find(i => i.id === fid);
        if (item) {
            const div = document.createElement('div');
            div.className = `furniture-item ${item.class}`;
            div.textContent = item.icon;
            div.onclick = () => interactWithFurniture(fid);
            div.style.cursor = 'pointer';
            elements.furnitureLayer.appendChild(div);
        }
    });
}

// ================= 宿舍家具互动 =================
const FURNITURE_INTERACTIONS = {
    'desk': {
        messages: ['这里是学习的好地方！📚', '桌面上有好多书和电脑~', '要不要在这里写作业呢？'],
        action: '思考'
    },
    'bookshelf': {
        messages: ['这些书看起来很有趣！📖', '书架上有好多知识等着探索~', '宠物跳上书架看看书~'],
        action: '开心'
    },
    'sofa': {
        messages: ['坐下来休息一下吧~🛋️', '沙发好舒服呀！', '宠物懒洋洋地躺在沙发上~'],
        action: '睡觉'
    },
    'wall-art': {
        messages: ['这是宠物的照片墙！🖼️', '墙上挂着我们的美好回忆~', '照片里的宠物好可爱！'],
        action: '开心'
    },
    'small-table': {
        messages: ['要不要喝杯茶休息一下？☕', '小桌子上有杯热饮~', '宠物跳上桌子看看~'],
        action: '思考'
    },
    'plant': {
        messages: ['这是一盆可爱的小植物~🌱', '宠物好奇地闻了闻植物~', '要给植物浇水吗？'],
        action: '开心'
    },
    'rug': {
        messages: ['躺地毯上休息一下~🧶', '地毯好柔软！', '在地毯上打滚~'],
        action: '睡觉'
    },
    'bed': {
        messages: ['上床睡觉吧~🛏️', '床好舒服！', '宠物在床上打哈欠~'],
        action: '睡觉'
    },
    'toy': {
        messages: ['玩玩具！🎾', '玩具好好玩！', '宠物开心地玩玩具~'],
        action: '开心'
    }
};

window.interactWithFurniture = function(furnitureId) {
    const interaction = FURNITURE_INTERACTIONS[furnitureId];
    if (!interaction) return;
    
    const message = interaction.messages[Math.floor(Math.random() * interaction.messages.length)];
    
    const floatText = document.createElement('div');
    floatText.className = 'floating-text';
    floatText.textContent = message;
    floatText.style.left = '50%';
    floatText.style.top = '42%';
    floatText.style.transform = 'translate(calc(-50% + 60px), 50px)';
    document.body.appendChild(floatText);
    setTimeout(() => floatText.remove(), 3000);
    
    syncPetAnimation(interaction.action, message);
    
    pettingCount++;
    if (elements.desktopPetCount) {
        elements.desktopPetCount.textContent = pettingCount;
    }
    
    if (pettingCount >= 10) {
        pettingCount = 0;
        state.coins += 1;
        saveState();
        if (elements.desktopPetCount) elements.desktopPetCount.textContent = pettingCount;
        
        const rewardText = document.createElement('div');
        rewardText.className = 'floating-text';
        rewardText.textContent = '🎉 +1 翻译币！';
        rewardText.style.left = '50%';
        rewardText.style.top = '50%';
        rewardText.style.transform = 'translate(-50%, -50%)';
        rewardText.style.color = '#ffd700';
        document.body.appendChild(rewardText);
        setTimeout(() => rewardText.remove(), 2000);
    }
};

// ================= 照片墙 =================
window.openPhotoWall = function() {
    document.getElementById('modal-photowall').classList.add('active');
    elements.photoGrid.innerHTML = '';
    
    if (state.photos.length === 0) {
        elements.photoGrid.innerHTML = '<p style="text-align:center; width:100%; margin-top:50px;">还没有合照哦，快去拍一张吧！</p>';
        return;
    }
    
    state.photos.forEach((photo, index) => {
        if (typeof photo === 'string') {
            photo = {
                url: photo,
                x: (index % 3) * 200 + 20,
                y: Math.floor(index / 3) * 150 + 20,
                r: Math.floor(Math.random() * 30) - 15
            };
            state.photos[index] = photo;
        }

        const frame = document.createElement('div');
        frame.className = 'photo-frame';
        frame.style.left = `${photo.x}px`;
        frame.style.top = `${photo.y}px`;
        frame.style.transform = `rotate(${photo.r}deg)`;
        frame.dataset.index = index;

        const img = document.createElement('img');
        img.src = photo.url;
        img.className = 'photo-item';
        
        const rotateBtn = document.createElement('div');
        rotateBtn.className = 'rotate-handle';
        rotateBtn.innerHTML = '↻';
        
        frame.appendChild(img);
        frame.appendChild(rotateBtn);
        elements.photoGrid.appendChild(frame);
    });
};

// ================= AR 摄像头合照与手部追踪 =================
let cameraStream = null;
let handsDetector = null;
let mpCamera = null;

async function initHandsDetector() {
    if (handsDetector) return;
    document.getElementById('ai-status').textContent = "(AI 视觉加载中...)";
    
    handsDetector = new Hands({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});
    handsDetector.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    handsDetector.onResults(onHandsResults);
    document.getElementById('ai-status').textContent = "(AI 视觉已就绪 ✨)";
}

let currentCameraState = 'idle';
let smoothedX = 0;
let smoothedY = 0;
const SMOOTHING_FACTOR = 0.2;

function onHandsResults(results) {
    if (!document.getElementById('modal-camera').classList.contains('active')) return;
    if (isDraggingCamPet) return;

    const container = elements.cameraVideo.parentElement;
    const w = container.clientWidth;
    const h = container.clientHeight;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        let handFoundForSitting = false;
        let handFoundForPetting = false;

        for (const landmarks of results.multiHandLandmarks) {
            const rawX = (1 - landmarks[9].x) * w;
            const rawY = landmarks[9].y * h;
            
            const indexTipX = (1 - landmarks[8].x) * w;
            const indexTipY = landmarks[8].y * h;

            const palmSize = Math.sqrt(Math.pow(landmarks[9].x - landmarks[0].x, 2) + Math.pow(landmarks[9].y - landmarks[0].y, 2));
            const fingerSpread = Math.abs(landmarks[8].x - landmarks[16].x);
            const isFlat = fingerSpread > palmSize * 0.15;
            
            const petRect = elements.cameraPet.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const petX = petRect.left - containerRect.left;
            const petY = petRect.top - containerRect.top;
            
            const petCenterX = petX + petRect.width / 2;
            const petCenterY = petY + petRect.height / 2;
            
            const distToIndex = Math.hypot(indexTipX - petCenterX, indexTipY - petCenterY);

            if (distToIndex < 60) { 
                handFoundForPetting = true;
            } else if (isFlat && !handFoundForSitting) {
                if (smoothedX === 0 && smoothedY === 0) {
                    smoothedX = rawX;
                    smoothedY = rawY;
                } else {
                    smoothedX = smoothedX + (rawX - smoothedX) * SMOOTHING_FACTOR;
                    smoothedY = smoothedY + (rawY - smoothedY) * SMOOTHING_FACTOR;
                }
                
                elements.cameraPet.style.left = `${smoothedX - petRect.width/2}px`;
                elements.cameraPet.style.top = `${smoothedY - petRect.height + 20}px`; 
                handFoundForSitting = true;
            }
        }

        let newState = 'idle';
        if (handFoundForPetting) {
            newState = '睡觉';
        } else if (handFoundForSitting) {
            newState = '开心';
        } else {
            newState = 'idle';
        }

        if (newState !== currentCameraState) {
            currentCameraState = newState;
            syncPetAnimation(newState, newState === '睡觉' ? '享受抚摸...' : '');
        }

    } else {
        if (currentCameraState !== 'idle') {
            currentCameraState = 'idle';
            syncPetAnimation('idle');
        }
    }
}

window.openCamera = async function() {
    document.getElementById('modal-camera').classList.add('active');
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        elements.cameraVideo.srcObject = cameraStream;
        
        elements.cameraPet.style.left = '50px';
        elements.cameraPet.style.top = '50px';

        await initHandsDetector();
        
        mpCamera = new Camera(elements.cameraVideo, {
            onFrame: async () => {
                await handsDetector.send({image: elements.cameraVideo});
            },
            width: 640,
            height: 480
        });
        mpCamera.start();

    } catch (err) {
        alert('无法调用摄像头，请确保在 localhost 或 HTTPS 环境下，并允许了权限。');
        console.error(err);
    }
};

window.stopCamera = function() {
    if (mpCamera) {
        mpCamera.stop();
        mpCamera = null;
    }
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    document.getElementById('ai-status').textContent = "(AI 视觉已暂停)";
    closeModal('modal-camera');
};

window.takePhoto = function() {
    if (!cameraStream) {
        return alert('摄像头未开启');
    }
    
    const canvas = elements.cameraCanvas;
    const video = elements.cameraVideo;
    const container = video.parentElement;
    
    canvas.width = container.clientWidth; 
    canvas.height = container.clientHeight;
    const ctx = canvas.getContext('2d');
    
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    const petRect = elements.cameraPet.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const relX = petRect.left - containerRect.left;
    const relY = petRect.top - containerRect.top;
    const petImgEl = elements.cameraPetImg;
    
    if (petImgEl && petImgEl.complete && petImgEl.naturalWidth > 0) {
        ctx.drawImage(petImgEl, relX, relY, petRect.width, petRect.height);
    }
    
    let basePhotoCanvas = document.createElement('canvas');
    basePhotoCanvas.width = canvas.width;
    basePhotoCanvas.height = canvas.height;
    basePhotoCanvas.getContext('2d').drawImage(canvas, 0, 0);

    const frameConfig = PHOTO_FRAMES.find(f => f.id === currentFrameId);
    
    if (!frameConfig || frameConfig.id === 'none') {
        saveFinalPhoto(canvas);
    } else {
        const frameImg = new Image();
        frameImg.crossOrigin = "anonymous";
        frameImg.onload = () => {
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = frameConfig.width;
            finalCanvas.height = frameConfig.height;
            const fCtx = finalCanvas.getContext('2d');
            
            const pa = frameConfig.photoArea;
            const scale = Math.max(pa.w / basePhotoCanvas.width, pa.h / basePhotoCanvas.height);
            const drawW = basePhotoCanvas.width * scale;
            const drawH = basePhotoCanvas.height * scale;
            const drawX = pa.x + (pa.w - drawW) / 2;
            const drawY = pa.y + (pa.h - drawH) / 2;
            
            fCtx.save();
            fCtx.beginPath();
            fCtx.rect(pa.x, pa.y, pa.w, pa.h);
            fCtx.clip();
            fCtx.drawImage(basePhotoCanvas, drawX, drawY, drawW, drawH);
            fCtx.restore();
            
            if (frameConfig.isHorizontal) {
                fCtx.save();
                fCtx.translate(finalCanvas.width / 2, finalCanvas.height / 2);
                fCtx.rotate(90 * Math.PI / 180);
                fCtx.drawImage(frameImg, -frameConfig.height / 2, -frameConfig.width / 2, frameConfig.height, frameConfig.width);
                fCtx.restore();
            } else {
                fCtx.drawImage(frameImg, 0, 0, finalCanvas.width, finalCanvas.height);
            }
            
            saveFinalPhoto(finalCanvas);
        };
        frameImg.onerror = () => {
            console.error('相框加载失败');
            saveFinalPhoto(canvas);
        };
        frameImg.src = frameConfig.src;
    }
};

function saveFinalPhoto(canvas) {
    let dataUrl;
    try {
        dataUrl = canvas.toDataURL('image/png');
    } catch (err) {
        alert('照片保存失败！\n\n原因：浏览器安全策略拦截了本地图片的画布读取。\n解决办法：请不要直接双击打开 HTML 文件，请在 VS Code 中右键选择「Open with Live Server」来运行网页！');
        console.error('Canvas tainted error:', err);
        return;
    }
    
    const newPhoto = {
        url: dataUrl,
        x: Math.floor(Math.random() * 200) + 50,
        y: Math.floor(Math.random() * 100) + 50,
        r: Math.floor(Math.random() * 30) - 15
    };

    state.photos.push(newPhoto);
    if (state.photos.length > 6) state.photos.shift();
    
    const today = new Date().toDateString();
    if (state.lastPhoto !== today) {
        state.lastPhoto = today;
        saveState();
        alert('拍照成功！已保存到照片墙。请前往【任务中心】领取奖励！');
    } else {
        saveState();
        alert('拍照成功！已保存到照片墙。');
    }
    stopCamera();
}

// ================= 拖拽与旋转全局逻辑 =================
let activePhotoIndex = -1;
let dragMode = null;
let dragStartX, dragStartY, initX, initY, initR;

let isDraggingCamPet = false;
let camPetStartX, camPetStartY, camPetInitLeft, camPetInitTop;

document.addEventListener('mousedown', (e) => {
    if (e.target === elements.cameraPet) {
        isDraggingCamPet = true;
        camPetStartX = e.clientX;
        camPetStartY = e.clientY;
        camPetInitLeft = elements.cameraPet.offsetLeft;
        camPetInitTop = elements.cameraPet.offsetTop;
        e.preventDefault();
        return;
    }

    const frame = e.target.closest('.photo-frame');
    if (!frame) return;

    activePhotoIndex = parseInt(frame.dataset.index);
    if (isNaN(activePhotoIndex) || !state.photos[activePhotoIndex]) return;
    
    const photo = state.photos[activePhotoIndex];
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    if (e.target.classList.contains('rotate-handle')) {
        dragMode = 'rotate';
        initR = photo.r;
    } else {
        dragMode = 'move';
        initX = photo.x;
        initY = photo.y;
    }
    
    document.querySelectorAll('.photo-frame').forEach(f => f.style.zIndex = 1);
    frame.style.zIndex = 100;
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingCamPet && elements.cameraPet) {
        const dx = e.clientX - camPetStartX;
        const dy = e.clientY - camPetStartY;
        elements.cameraPet.style.left = `${camPetInitLeft + dx}px`;
        elements.cameraPet.style.top = `${camPetInitTop + dy}px`;
        return;
    }

    if (activePhotoIndex !== -1 && dragMode) {
        const photo = state.photos[activePhotoIndex];
        const frame = document.querySelector(`.photo-frame[data-index="${activePhotoIndex}"]`);
        if (!frame) return;

        if (dragMode === 'move') {
            photo.x = initX + (e.clientX - dragStartX);
            photo.y = initY + (e.clientY - dragStartY);
            frame.style.left = `${photo.x}px`;
            frame.style.top = `${photo.y}px`;
        } else if (dragMode === 'rotate') {
            const delta = e.clientX - dragStartX;
            photo.r = initR + delta;
            frame.style.transform = `rotate(${photo.r}deg)`;
        }
    }
});

document.addEventListener('mouseup', () => {
    isDraggingCamPet = false;

    if (activePhotoIndex !== -1) {
        activePhotoIndex = -1;
        dragMode = null;
        saveState();
    }
});

// ================= AI 对话与翻译解析 =================
elements.sendBtn.addEventListener('click', sendMessage);
elements.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

let msgCounter = 0;
let messageStore = {};

async function sendMessage() {
    const text = elements.chatInput.value.trim();
    if (!text) return;

    appendMessageHTML('user', text);
    elements.chatInput.value = '';
    
    syncPetAnimation('发呆', '思考中...');
    elements.sendBtn.disabled = true;
    elements.sendBtn.textContent = '...';

    try {
        const response = await callDeepSeek(text);
        handleAIResponse(response);
    } catch (error) {
        console.error('API Error:', error);
        appendMessageHTML('system', '宠物暂时断开了连接 (API请求失败，请检查网络)。');
        syncPetAnimation('伤心', '连接失败');
    } finally {
        elements.sendBtn.disabled = false;
        elements.sendBtn.textContent = '发送';
    }
}

function appendMessageHTML(role, htmlContent) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = htmlContent;
    elements.chatBox.appendChild(div);
    elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
}

function handleAIResponse(fullText) {
    let action = '开心'; 
    let replyText = fullText;

    const actionRegex = /\[(.*?)\]/g;
    const matches = [...fullText.matchAll(actionRegex)];
    
    if (matches.length > 0) {
        action = matches[matches.length - 1][1];
        replyText = fullText.replace(actionRegex, '').trim();
    }

    syncPetAnimation(action, action);
    
    const typeData = PET_TYPES[state.petTypeIndex];
    const soundText = `${typeData.sound} ${PET_FACES[action] || ''}`;
    
    msgCounter++;
    const currentMsgId = msgCounter;
    messageStore[currentMsgId] = replyText || "（打了个滚）";

    const html = `
        <div id="msg-text-${currentMsgId}">${soundText}</div>
        <button id="msg-btn-${currentMsgId}" class="translate-btn" onclick="translateMessage(${currentMsgId})">
            🔍 翻译 (消耗 1 币)
        </button>
    `;
    
    appendMessageHTML('pet', html);
}

window.translateMessage = function(msgId) {
    if (state.coins < 1) {
        return alert('翻译币不足啦！快去摸摸它、签到或专注获取吧。');
    }
    state.coins -= 1;
    saveState();
    
    const textDiv = document.getElementById(`msg-text-${msgId}`);
    const btn = document.getElementById(`msg-btn-${msgId}`);
    
    if (textDiv && messageStore[msgId]) {
        textDiv.textContent = `"${messageStore[msgId]}"`;
        textDiv.style.color = "#ff8b94";
        textDiv.style.fontWeight = "bold";
    }
    if (btn) {
        btn.style.display = 'none';
    }
};

async function callDeepSeek(userMessage) {
    const typeData = PET_TYPES[state.petTypeIndex];
    const systemPrompt = `
你是一个陪伴用户的电子宠物。
你的品种是：${typeData.name}。
你的性格是：${typeData.personality}。
用户叫"${state.userName}"，你叫"${state.petName}"。
请根据你的性格，用简短、可爱的语气回复用户。
重要规则：必须在你的回复文本末尾，包含且仅包含一个代表你当前动作的标签（使用方括号包围）。
可选的动作标签有：[开心], [睡觉], [吃饭], [打滚], [发呆], [生气], [伤心]。
例如回复格式："主人我好想你呀！ [开心]"。
    `.trim();

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
    ];

    const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: messages,
            temperature: 0.7,
            max_tokens: 150
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// ================= 随机待机动作逻辑 =================
setInterval(() => {
    const activeView = document.querySelector('.screen.active');
    if (!activeView || activeView.id === 'view-auth' || activeView.id === 'view-adopt') return;
    
    const cameraModal = document.getElementById('modal-camera');
    if (cameraModal && cameraModal.classList.contains('active')) return;
    
    if (window.currentActionType === 'idle') {
        if (Math.random() < 0.3) { 
            const randomActions = ['思考', '开心', '打滚'];
            const action = randomActions[Math.floor(Math.random() * randomActions.length)];
            syncPetAnimation(action);
        }
    }
}, 5000);

// 全局加币函数
window.addCoins = function(amount) {
    if (state) {
        state.coins += amount;
        saveState();
    }
};

// ================= 主程序入口 =================
document.addEventListener('DOMContentLoaded', () => {
    const petModeBtn = document.getElementById('pet-mode-btn');
    if (petModeBtn) {
        petModeBtn.addEventListener('click', () => {
            window.enterDesktopPetMode();
        });
    }
    
    init();
});

// ================= Electron 集成部分 =================
const { ipcRenderer } = require('electron');

ipcRenderer.on('coins-added', (event, amount) => {
  if (typeof addCoins === 'function') {
    addCoins(amount);
  }
  alert(`摸了10次宠物！获得${amount}个翻译币~`);
});

ipcRenderer.on('get-pet-data', () => {
  const petInfo = {
    name: state ? state.petName : '宠物',
    type: state ? PET_TYPES[state.petTypeIndex].name : '未知',
    icon: state ? `动物基础动作GIF/${PET_TYPES[state.petTypeIndex].dir}/待机.GIF` : ''
  };
  ipcRenderer.send('send-pet-data-to-pet', petInfo);
});
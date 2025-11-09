// Made by Parad1st
// Глобальные переменные
let currentCategory = null;
let currentSubcategory = null;
let currentCopyright = null; // Для фильтрации по авторским правам (audio)
let allData = {
    video: videoData,
    audio: audioData,
    images: imagesData,
    fonts: fontsData
};

// Переменные для пагинации
let shuffledItems = [];
let displayedCount = 0;
const itemsPerPage = 30;

// Отслеживание активных аудиоплееров для авто-остановки
let activeAudioPlayers = [];

// Регистрация подключаемых шрифтов, чтобы не дублировать @font-face
const fontRegistry = new Map(); // key: font URL, value: generated family name

function getOrRegisterFontFamily(item) {
    const fontUrl = item.url;
    if (!fontUrl) return item.name;
    if (fontRegistry.has(fontUrl)) {
        return fontRegistry.get(fontUrl);
    }
    const familyName = `VLFont_${item.id}`;
    const styleEl = document.createElement('style');
    styleEl.type = 'text/css';
    // Пытаемся определить формат по расширению
    const ext = (fontUrl.split('.').pop() || '').toLowerCase();
    const fmt = ext === 'otf' ? 'opentype' : (ext === 'woff2' ? 'woff2' : (ext === 'woff' ? 'woff' : 'truetype'));
    styleEl.textContent = `@font-face{font-family:'${familyName}';src:url('${fontUrl}') format('${fmt}');font-display:swap;}`;
    document.head.appendChild(styleEl);
    fontRegistry.set(fontUrl, familyName);
    return familyName;
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initializeTheme();
    initializeNavigation();
    initializeSearch();
    initializeModal();
});

// Тема
function initializeTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.body.className = theme + '-theme';
    updateThemeIcon(theme);
    
    document.getElementById('themeToggle').addEventListener('click', function() {
        const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.className = newTheme + '-theme';
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-icon');
    icon.textContent = theme === 'dark' ? '🌙' : '☀️';
}

// Навигация
function initializeNavigation() {
    // Клики по карточкам категорий
    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', function(e) {
            e.preventDefault();
            const category = this.dataset.category;
            showCategory(category);
        });
    });

    // Кнопки назад
    document.getElementById('backBtn')?.addEventListener('click', () => {
        saveCategoryState(); // Сохраняем состояние перед переходом
        showPage('homePage');
    });
    document.getElementById('detailBackBtn')?.addEventListener('click', () => {
        stopAllAudioPlayers(); // Останавливаем аудио при возврате
        if (currentCategory) {
            restoreCategoryState(); // Восстанавливаем состояние
            showCategory(currentCategory, true); // true = не сбрасывать состояние
        } else {
            showPage('homePage');
        }
    });
    document.getElementById('searchBackBtn')?.addEventListener('click', () => {
        showPage('homePage');
    });
}

// Поиск
function initializeSearch() {
    const mainSearch = document.getElementById('mainSearch');
    const categorySearch = document.getElementById('categorySearch');
    const searchBtn = document.getElementById('searchBtn');

    searchBtn?.addEventListener('click', performMainSearch);
    mainSearch?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') performMainSearch();
    });

    categorySearch?.addEventListener('input', function() {
        if (currentCategory) {
            displayedCount = 0;
            shuffledItems = [];
            filterCategoryResults();
        }
    });
    categorySearch?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && currentCategory) {
            displayedCount = 0;
            shuffledItems = [];
            filterCategoryResults();
        }
    });
}

function performMainSearch() {
    const query = document.getElementById('mainSearch').value.trim();
    if (query) {
        showSearchResults(query);
    }
}

function showSearchResults(query) {
    const results = searchAll(query);
    const searchResults = document.getElementById('searchResults');
    const searchQuery = document.getElementById('searchQuery');
    const searchQueryText = document.getElementById('searchQueryText');
    const noResults = document.getElementById('searchNoResults');

    searchQuery.textContent = `"${query}"`;
    searchQueryText.textContent = query;

    if (results.length === 0) {
        searchResults.innerHTML = '';
        noResults.style.display = 'block';
    } else {
        noResults.style.display = 'none';
        searchResults.innerHTML = results.map(item => createResultCard(item, item.category)).join('');
        attachCardListeners();
    }

    showPage('searchPage');
}

function searchAll(query) {
    const results = [];
    const lowerQuery = query.toLowerCase().trim();

    Object.keys(allData).forEach(category => {
        allData[category].forEach(item => {
            if (matchesSearchQuery(item, lowerQuery)) {
                results.push({...item, category});
            }
        });
    });

    // Ранжируем результаты
    return rankSearchResults(results, query);
}

// Инициализация модального окна (больше не используется, оставлено для совместимости)
function initializeModal() {
    // Модальное окно заменено на ссылку в Telegram бота
}

// Функция для перемешивания массива (Fisher-Yates shuffle)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Сохранение и восстановление состояния категории
function saveCategoryState() {
    if (currentCategory) {
        const state = {
            category: currentCategory,
            subcategory: currentSubcategory,
            copyright: currentCopyright,
            search: document.getElementById('categorySearch')?.value || '',
            displayedCount: displayedCount,
            shuffledItemsIndices: shuffledItems.map(item => item.id) // Сохраняем только ID для восстановления порядка
        };
        sessionStorage.setItem('categoryState', JSON.stringify(state));
    }
}

function restoreCategoryState() {
    const savedState = sessionStorage.getItem('categoryState');
    if (savedState && currentCategory) {
        try {
            const state = JSON.parse(savedState);
            if (state.category === currentCategory) {
                currentSubcategory = state.subcategory;
                currentCopyright = state.copyright;
                displayedCount = state.displayedCount || 0;
                
                // Восстанавливаем значение поиска перед фильтрацией
                const searchInput = document.getElementById('categorySearch');
                if (searchInput && state.search) {
                    searchInput.value = state.search;
                }
                
                // Восстанавливаем порядок элементов
                if (state.shuffledItemsIndices && state.shuffledItemsIndices.length > 0) {
                    // Сначала получаем отфильтрованные элементы
                    const allItems = filterItemsByCriteria();
                    const itemMap = new Map(allItems.map(item => [item.id, item]));
                    // Восстанавливаем порядок из сохраненного состояния
                    shuffledItems = state.shuffledItemsIndices
                        .map(id => itemMap.get(id))
                        .filter(Boolean);
                    
                    // Если что-то не восстановилось, дополняем новыми элементами
                    const restoredIds = new Set(shuffledItems.map(item => item.id));
                    const missingItems = allItems.filter(item => !restoredIds.has(item.id));
                    if (missingItems.length > 0) {
                        shuffledItems = shuffleArray([...shuffledItems, ...missingItems]);
                    }
                }
                
                return true;
            }
        } catch (e) {
            console.error('Ошибка восстановления состояния:', e);
        }
    }
    return false;
}

// Функция фильтрации элементов по текущим критериям (без рандомизации)
function filterItemsByCriteria() {
    if (!currentCategory) return [];
    
    const searchQuery = document.getElementById('categorySearch')?.value.toLowerCase() || '';
    return allData[currentCategory].filter(item => {
        const matchesSubcategory = !currentSubcategory || item.subcategory === currentSubcategory;
        const matchesCopyright = currentCategory !== 'audio' || currentCopyright === null || 
                                (item.copyright !== undefined && item.copyright === currentCopyright);
        const matchesSearch = !searchQuery || matchesSearchQuery(item, searchQuery);
        return matchesSubcategory && matchesCopyright && matchesSearch;
    });
}

// Отображение категории
function showCategory(category, preserveState = false) {
    stopAllAudioPlayers(); // Останавливаем все аудио при переходе
    
    const wasSameCategory = currentCategory === category;
    currentCategory = category;
    
    if (!preserveState && !wasSameCategory) {
        currentSubcategory = null;
        currentCopyright = null;
        displayedCount = 0;
        shuffledItems = [];
    } else if (preserveState) {
        // Состояние уже восстановлено в restoreCategoryState
    } else {
        // Та же категория, но нужно сбросить только если не сохраняли состояние
        displayedCount = 0;
        shuffledItems = [];
    }

    const categoryNames = {
        video: 'Видео',
        audio: 'Аудио',
        images: 'Картинки',
        fonts: 'Шрифты'
    };

    const subcategories = {
        video: ['фоны', 'футажи', 'переходы', 'эффекты'],
        audio: ['музыка', 'звуковые эффекты'],
        images: ['фоны', 'стикеры', 'значки'],
        fonts: ['с поддержкой русского', 'без поддержки русского']
    };

    document.getElementById('categoryTitle').textContent = categoryNames[category];
    
    // Создание фильтров подкатегорий
    const filtersContainer = document.getElementById('subcategoryFilters');
    let filtersHTML = '<button class="filter-btn active" data-subcategory="all">Все</button>' +
        subcategories[category].map(sub => 
            `<button class="filter-btn" data-subcategory="${sub}">${capitalizeFirst(sub)}</button>`
        ).join('');

    // Добавляем фильтр по авторским правам для аудио
    if (category === 'audio') {
        filtersHTML += '<button class="filter-btn" data-copyright="0">Без АП</button>' +
                      '<button class="filter-btn" data-copyright="1">С АП</button>';
    }

    filtersContainer.innerHTML = filtersHTML;

    // Обработчики фильтров подкатегорий
    filtersContainer.querySelectorAll('.filter-btn[data-subcategory]').forEach(btn => {
        btn.addEventListener('click', function() {
            filtersContainer.querySelectorAll('.filter-btn[data-subcategory]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentSubcategory = this.dataset.subcategory === 'all' ? null : this.dataset.subcategory;
            // Сбрасываем фильтр по авторским правам при изменении подкатегории
            if (category === 'audio') {
                filtersContainer.querySelectorAll('.filter-btn[data-copyright]').forEach(b => b.classList.remove('active'));
                currentCopyright = null;
            }
            displayedCount = 0;
            shuffledItems = [];
            filterCategoryResults();
        });
    });

    // Обработчики фильтров по авторским правам (только для audio)
    if (category === 'audio') {
        filtersContainer.querySelectorAll('.filter-btn[data-copyright]').forEach(btn => {
            btn.addEventListener('click', function() {
                filtersContainer.querySelectorAll('.filter-btn[data-copyright]').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentCopyright = parseInt(this.dataset.copyright);
                displayedCount = 0;
                shuffledItems = [];
                filterCategoryResults();
            });
        });
    }

    // Инициализация кнопки "Загрузить ещё"
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.onclick = loadMoreItems;
    }

    // Восстанавливаем состояние только если это не первый переход
    if (preserveState) {
        if (restoreCategoryState()) {
            // Восстанавливаем фильтры в UI
            restoreFiltersUI();
            displayItems(); // Показываем элементы с сохраненной позицией
            showPage('categoryPage');
            return;
        }
    } else {
        // Сбрасываем поиск только при новом переходе
        const searchInput = document.getElementById('categorySearch');
        if (searchInput) searchInput.value = '';
    }
    
    filterCategoryResults();
    showPage('categoryPage');
}

// Восстановление состояния фильтров в UI
function restoreFiltersUI() {
    const filtersContainer = document.getElementById('subcategoryFilters');
    if (!filtersContainer) return;
    
    // Восстанавливаем активный фильтр подкатегории
    if (currentSubcategory) {
        filtersContainer.querySelectorAll('.filter-btn[data-subcategory]').forEach(btn => {
            if (btn.dataset.subcategory === currentSubcategory) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    // Восстанавливаем фильтр по авторским правам (для audio)
    if (currentCategory === 'audio' && currentCopyright !== null) {
        filtersContainer.querySelectorAll('.filter-btn[data-copyright]').forEach(btn => {
            if (parseInt(btn.dataset.copyright) === currentCopyright) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

function filterCategoryResults() {
    if (!currentCategory) return;
    
    saveCategoryState(); // Сохраняем состояние перед фильтрацией

    let filtered = filterItemsByCriteria();
    
    // Если есть поисковый запрос, ранжируем результаты
    const searchQuery = document.getElementById('categorySearch')?.value.trim();
    if (searchQuery) {
        filtered = rankSearchResults(filtered, searchQuery);
    } else {
        // Без поиска - рандомизируем
        filtered = shuffleArray(filtered);
    }

    // Обновляем shuffledItems если список изменился
    if (shuffledItems.length === 0 || shuffledItems.length !== filtered.length || searchQuery) {
        shuffledItems = filtered;
    }

    displayedCount = 0;
    displayItems();
}

// Улучшенная функция поиска по тегам с ранжированием
function matchesSearchQuery(item, query) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return true;
    
    // Разбиваем запрос на отдельные слова/теги
    const searchTerms = lowerQuery.split(/\s+/).filter(term => term.length > 0);
    
    // Проверяем совпадения
    const nameLower = item.name.toLowerCase();
    const descLower = item.description.toLowerCase();
    const tagsLower = item.tags.map(tag => tag.toLowerCase());
    
    // Проверяем полное совпадение запроса
    const fullMatch = nameLower.includes(lowerQuery) || 
                     descLower.includes(lowerQuery) ||
                     tagsLower.some(tag => tag === lowerQuery || tag.includes(lowerQuery));
    
    if (fullMatch) return true;
    
    // Проверяем совпадение по отдельным словам (принцип ИЛИ)
    return searchTerms.some(term => {
        return nameLower.includes(term) ||
               descLower.includes(term) ||
               tagsLower.some(tag => tag.includes(term));
    });
}

// Ранжирование результатов поиска
function rankSearchResults(items, query) {
    if (!query || !items.length) return items;
    
    const lowerQuery = query.toLowerCase().trim();
    const searchTerms = lowerQuery.split(/\s+/).filter(term => term.length > 0);
    
    return items.map(item => {
        let score = 0;
        const nameLower = item.name.toLowerCase();
        const descLower = item.description.toLowerCase();
        const tagsLower = item.tags.map(tag => tag.toLowerCase());
        
        // Полное совпадение тега - высший приоритет
        if (tagsLower.some(tag => tag === lowerQuery)) {
            score += 100;
        }
        
        // Полное совпадение в названии
        if (nameLower === lowerQuery) {
            score += 80;
        } else if (nameLower.includes(lowerQuery)) {
            score += 50;
        }
        
        // Полное совпадение в описании
        if (descLower.includes(lowerQuery)) {
            score += 30;
        }
        
        // Совпадение всех отдельных слов (точное совпадение)
        const allTermsMatch = searchTerms.every(term => {
            return tagsLower.some(tag => tag.includes(term)) ||
                   nameLower.includes(term) ||
                   descLower.includes(term);
        });
        if (allTermsMatch && searchTerms.length > 1) {
            score += 60;
        }
        
        // Частичные совпадения по отдельным словам
        searchTerms.forEach(term => {
            if (tagsLower.some(tag => tag.includes(term))) {
                score += 20;
            } else if (nameLower.includes(term)) {
                score += 15;
            } else if (descLower.includes(term)) {
                score += 10;
            }
        });
        
        return { item, score };
    }).sort((a, b) => b.score - a.score)
      .map(entry => entry.item);
}

function displayItems() {
    const resultsGrid = document.getElementById('resultsGrid');
    const noResults = document.getElementById('noResults');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    const endMessage = document.getElementById('endMessage');

    if (shuffledItems.length === 0) {
        resultsGrid.innerHTML = '';
        noResults.style.display = 'block';
        loadMoreContainer.style.display = 'none';
        endMessage.style.display = 'none';
        return;
    }

    noResults.style.display = 'none';
    
    // Определяем, сколько элементов нужно отобразить
    const itemsToShow = Math.min(itemsPerPage, shuffledItems.length - displayedCount);
    const itemsToDisplay = shuffledItems.slice(displayedCount, displayedCount + itemsPerPage);
    
    if (displayedCount === 0) {
        // Первая загрузка - заменяем все
        resultsGrid.innerHTML = itemsToDisplay.map(item => createResultCard(item, currentCategory)).join('');
    } else {
        // Добавляем к существующим
        const newHTML = itemsToDisplay.map(item => createResultCard(item, currentCategory)).join('');
        resultsGrid.insertAdjacentHTML('beforeend', newHTML);
    }
    
    displayedCount += itemsToShow;
    attachCardListeners();
    
    // Регистрируем все аудиоплееры для отслеживания
    document.querySelectorAll('.audio-element').forEach(audio => {
        registerAudioPlayer(audio);
    });

    // Показываем/скрываем кнопку "Загрузить ещё" и сообщение о конце
    if (displayedCount >= shuffledItems.length) {
        loadMoreContainer.style.display = 'none';
        if (shuffledItems.length > 0) {
            endMessage.style.display = 'block';
        }
    } else {
        loadMoreContainer.style.display = 'block';
        endMessage.style.display = 'none';
    }
}

function loadMoreItems() {
    displayItems();
}

function createResultCard(item, category) {
    if (category === 'video') {
        const qualityBadge = item.quality ? `<span class="quality-badge">${item.quality}</span>` : '';
        return `
            <div class="result-card" data-id="${item.id}" data-category="${category}">
                <div class="result-preview video-preview" style="background-image: url('${item.preview}'); background-size: cover; background-position: center;">
                    <div class="video-preview-overlay">
                        <span class="play-icon">▶</span>
                    </div>
                    ${qualityBadge}
                </div>
                <div class="result-info">
                    <h3 class="result-title">${item.name}</h3>
                    <p class="result-description">${item.description}</p>
                    <div class="result-tags">
                        ${item.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <div class="result-actions">
                        <button class="btn btn-primary view-btn">Просмотр</button>
                        <button class="btn btn-secondary download-btn">Скачать</button>
                    </div>
                </div>
            </div>
        `;
    } else if (category === 'audio') {
        const copyrightBadge = item.copyright !== undefined ? 
            `<span class="copyright-badge ${item.copyright === 1 ? 'copyright-yes' : 'copyright-no'}">${item.copyright === 1 ? 'С АП' : 'Без АП'}</span>` : '';
        const qualityBadge = item.quality ? `<span class="quality-badge audio-quality">${item.quality}</span>` : '';
        return `
            <div class="result-card" data-id="${item.id}" data-category="${category}">
                <div class="result-preview" style="background-image: url('${item.preview || ''}'); background-size: cover; background-position: center;">
                    ${qualityBadge}
                    ${copyrightBadge}
                </div>
                <div class="result-info">
                    <h3 class="result-title">${item.name}</h3>
                    <p class="result-description">${item.description}</p>
                    <div class="audio-player">
                        <audio controls class="audio-element">
                            <source src="${item.url}" type="audio/mpeg">
                        </audio>
                    </div>
                    <div class="result-tags">
                        ${item.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <div class="result-actions">
                        <button class="btn btn-primary view-btn">Подробнее</button>
                        <button class="btn btn-secondary download-btn">Скачать</button>
                    </div>
                </div>
            </div>
        `;
    } else if (category === 'images') {
        return `
            <div class="result-card" data-id="${item.id}" data-category="${category}">
                <div class="result-preview">
                    <img src="${item.preview}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: contain;">
                </div>
                <div class="result-info">
                    <h3 class="result-title">${item.name}</h3>
                    <p class="result-description">${item.description}</p>
                    <div class="result-tags">
                        ${item.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <div class="result-actions">
                        <button class="btn btn-primary view-btn">Просмотр</button>
                        <button class="btn btn-secondary download-btn">Скачать</button>
                    </div>
                </div>
            </div>
        `;
    } else if (category === 'fonts') {
        const family = getOrRegisterFontFamily(item);
        return `
            <div class="result-card" data-id="${item.id}" data-category="${category}">
                <div class="result-preview">
                    <div class="font-preview" style="font-family: '${family}', sans-serif;">
                        ${item.previewText}
                    </div>
                </div>
                <div class="result-info">
                    <h3 class="result-title">${item.name}</h3>
                    <p class="result-description">${item.description}</p>
                    <div class="result-tags">
                        ${item.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <div class="result-actions">
                        <button class="btn btn-primary view-btn">Подробнее</button>
                        <button class="btn btn-secondary download-btn">Скачать</button>
                    </div>
                </div>
            </div>
        `;
    }
}

function attachCardListeners() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.result-card');
            const id = parseInt(card.dataset.id);
            const category = card.dataset.category;
            showDetail(id, category);
        });
    });

    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.result-card');
            const id = parseInt(card.dataset.id);
            const category = card.dataset.category;
            downloadItem(id, category);
        });
    });

    // Предпросмотр видео при наведении
    document.querySelectorAll('.video-preview').forEach(preview => {
        const card = preview.closest('.result-card');
        const id = parseInt(card.dataset.id);
        const category = card.dataset.category;
        const item = allData[category].find(i => i.id === id);
        
        if (item && item.url) {
            let video = null;
            let isPlaying = false;
            
            preview.addEventListener('mouseenter', function() {
                if (!video && item.url) {
                    video = document.createElement('video');
                    video.src = item.url;
                    video.muted = true;
                    video.loop = true;
                    video.style.width = '100%';
                    video.style.height = '100%';
                    video.style.objectFit = 'cover';
                    video.style.position = 'absolute';
                    video.style.top = '0';
                    video.style.left = '0';
                    video.style.zIndex = '0';
                    preview.style.position = 'relative';
                    preview.style.backgroundImage = 'none';
                    preview.appendChild(video);
                    video.play().catch(() => {});
                    isPlaying = true;
                } else if (video && !isPlaying) {
                    preview.style.backgroundImage = 'none';
                    video.play().catch(() => {});
                    isPlaying = true;
                }
            });
            
            preview.addEventListener('mouseleave', function() {
                if (video && isPlaying) {
                    video.pause();
                    video.currentTime = 0;
                    isPlaying = false;
                    const originalBg = item.preview ? `url('${item.preview}')` : '';
                    preview.style.backgroundImage = originalBg;
                }
            });
        }
    });

    document.querySelectorAll('.result-card').forEach(card => {
        card.addEventListener('click', function(e) {
            if (!e.target.closest('.btn') && !e.target.closest('audio') && !e.target.closest('.audio-player') && !e.target.closest('video')) {
                const id = parseInt(this.dataset.id);
                const category = this.dataset.category;
                showDetail(id, category);
            }
        });
    });
}

// Детальная страница
function showDetail(id, category) {
    const item = allData[category].find(i => i.id === id);
    if (!item) return;

    const detailContent = document.getElementById('detailContent');
    let html = '';

    if (category === 'video') {
        html = `
            <div class="detail-header">
                <h1 class="detail-title">${item.name}</h1>
                <p class="detail-description">${item.description}</p>
            </div>
            <video class="detail-video" controls>
                <source src="${item.url}" type="video/mp4">
                Ваш браузер не поддерживает видео.
            </video>
            <div class="detail-meta">
                <div class="detail-tags">
                    ${item.tags.map(tag => `<span class="detail-tag">${tag}</span>`).join('')}
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">Подкатегория:</span>
                    ${capitalizeFirst(item.subcategory)}
                </div>
                ${item.quality ? `
                <div class="detail-info-item">
                    <span class="detail-info-label">Качество:</span>
                    ${item.quality}
                </div>
                ` : ''}
            </div>
            <div class="detail-download">
                <button class="btn btn-primary btn-large download-btn-detail" data-id="${id}" data-category="${category}">
                    Скачать видео
                </button>
            </div>
        `;
    } else if (category === 'audio') {
        html = `
            <div class="detail-header">
                <h1 class="detail-title">${item.name}</h1>
                <p class="detail-description">${item.description}</p>
            </div>
            <div class="detail-meta">
                <div class="audio-player">
                    <audio controls style="width: 100%;" class="audio-element">
                        <source src="${item.url}" type="audio/mpeg">
                    </audio>
                </div>
                <div class="detail-tags">
                    ${item.tags.map(tag => `<span class="detail-tag">${tag}</span>`).join('')}
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">Подкатегория:</span>
                    ${capitalizeFirst(item.subcategory)}
                </div>
                ${item.quality ? `
                <div class="detail-info-item">
                    <span class="detail-info-label">Качество:</span>
                    ${item.quality}
                </div>
                ` : ''}
                ${item.copyright !== undefined ? `
                <div class="detail-info-item">
                    <span class="detail-info-label">Авторские права:</span>
                    ${item.copyright === 1 ? 'С АП (есть авторские права)' : 'Без АП (нет авторских прав)'}
                </div>
                ` : ''}
            </div>
            <div class="detail-download">
                <button class="btn btn-primary btn-large download-btn-detail" data-id="${id}" data-category="${category}">
                    Скачать аудио
                </button>
            </div>
        `;
    } else if (category === 'images') {
        html = `
            <div class="detail-header">
                <h1 class="detail-title">${item.name}</h1>
                <p class="detail-description">${item.description}</p>
            </div>
            <img src="${item.url}" alt="${item.name}" class="detail-image">
            <div class="detail-meta">
                <div class="detail-tags">
                    ${item.tags.map(tag => `<span class="detail-tag">${tag}</span>`).join('')}
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">Подкатегория:</span>
                    ${capitalizeFirst(item.subcategory)}
                </div>
            </div>
            <div class="detail-download">
                <button class="btn btn-primary btn-large download-btn-detail" data-id="${id}" data-category="${category}">
                    Скачать изображение
                </button>
            </div>
        `;
    } else if (category === 'fonts') {
        const family = getOrRegisterFontFamily(item);
        html = `
            <div class="detail-header">
                <h1 class="detail-title">${item.name}</h1>
                <p class="detail-description">${item.description}</p>
            </div>
            <div class="font-preview" style="font-family: '${family}', sans-serif; font-size: 3rem;">
                ${item.previewText}
            </div>
            <div class="detail-meta">
                <div class="detail-tags">
                    ${item.tags.map(tag => `<span class="detail-tag">${tag}</span>`).join('')}
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">Поддержка русского:</span>
                    ${item.subcategory === 'с поддержкой русского' ? 'Да' : 'Нет'}
                </div>
            </div>
            <div class="detail-download">
                <button class="btn btn-primary btn-large download-btn-detail" data-id="${id}" data-category="${category}">
                    Скачать шрифт
                </button>
            </div>
        `;
    }

    detailContent.innerHTML = html;
    
    // Останавливаем все аудио перед показом новой страницы
    stopAllAudioPlayers();
    
    // Регистрируем аудиоплеер на детальной странице
    const detailAudio = detailContent.querySelector('.audio-element');
    if (detailAudio) {
        registerAudioPlayer(detailAudio);
    }

    // Обработчик кнопки скачивания
    const downloadBtn = detailContent.querySelector('.download-btn-detail');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            downloadItem(id, category);
        });
    }

    showPage('detailPage');
}

// Функция для остановки всех активных аудиоплееров
function stopAllAudioPlayers() {
    activeAudioPlayers.forEach(player => {
        if (player && !player.paused) {
            player.pause();
            player.currentTime = 0;
        }
    });
    activeAudioPlayers = [];
    
    // Также останавливаем все аудио элементы на странице
    document.querySelectorAll('audio').forEach(audio => {
        if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
        }
    });
}

// Регистрация аудиоплеера для отслеживания
function registerAudioPlayer(audioElement) {
    if (audioElement && !activeAudioPlayers.includes(audioElement)) {
        activeAudioPlayers.push(audioElement);
        
        // Удаляем из списка при остановке
        audioElement.addEventListener('pause', function() {
            const index = activeAudioPlayers.indexOf(audioElement);
            if (index > -1) {
                activeAudioPlayers.splice(index, 1);
            }
        }, { once: true });
        
        // Останавливаем другие плееры при запуске нового
        audioElement.addEventListener('play', function() {
            activeAudioPlayers.forEach(player => {
                if (player !== audioElement && !player.paused) {
                    player.pause();
                    player.currentTime = 0;
                }
            });
        });
    }
}

function downloadItem(id, category) {
    const item = allData[category].find(i => i.id === id);
    if (!item) return;

    try {
        // Создаем временную ссылку для скачивания
        const link = document.createElement('a');
        link.href = item.url;
        link.download = item.url.split('/').pop() || `${item.name}.${getFileExtension(item.url)}`;
        
        // Добавляем в DOM, кликаем и удаляем
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Если браузер не поддерживает автоматическое скачивание, открываем в новом окне
        setTimeout(() => {
            const newWindow = window.open(item.url, '_blank');
            if (!newWindow) {
                // Если всплывающее окно заблокировано, показываем сообщение
                alert(`Для скачивания файла "${item.name}" откройте ссылку:\n${item.url}`);
            }
        }, 100);
    } catch (error) {
        console.error('Ошибка при скачивании:', error);
        // Fallback: показываем ссылку пользователю
        alert(`Для скачивания файла "${item.name}" скопируйте ссылку:\n${item.url}`);
    }
}

function getFileExtension(url) {
    const match = url.match(/\.([^./?#]+)(?:[?#]|$)/);
    return match ? match[1] : '';
}

// Утилиты
function showPage(pageId) {
    // Останавливаем аудио при переходах между основными страницами
    if (pageId === 'homePage' || pageId === 'searchPage') {
        stopAllAudioPlayers();
        saveCategoryState(); // Сохраняем состояние перед уходом со страницы категории
    }
    
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId)?.classList.add('active');
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}


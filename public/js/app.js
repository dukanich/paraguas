import { initGoogleSheets, loadWords, getCategories, getRandomWord, getDBInfo, loadWordsFromIndexedDB } from './sheets.js';

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// State
const state = {
    questions: [],
    currentIndex: 0,
    selectedCategory: '',
    isLoading: true,
    isOffline: false,
    isDarkMode: localStorage.getItem('darkMode') === 'true',
    isVoiceAvailable: false,
    isSpeaking: false,
    spanishVoice: null
};

// DOM Elements
const elements = {
    card: document.getElementById('card'),
    questionContainer: document.getElementById('question-container'),
    answerContainer: document.getElementById('answer-container'),
    prevButton: document.getElementById('prev-button'),
    nextButton: document.getElementById('next-button'),
    categorySelect: document.getElementById('category-select'),
    loading: document.getElementById('loading'),
    themeToggle: document.getElementById('theme-toggle'),
    currentIndex: document.getElementById('current-index'),
    totalWords: document.getElementById('total-words'),
    categoryLabel: document.getElementById('category-label'),
    speakButton: document.getElementById('speak-button'),
    menuButton: document.getElementById('menu-button'),
    menuDropdown: document.getElementById('menu-dropdown')
};

// Touch Events
let touchstartX = 0;
let touchendX = 0;
let isAnimating = false;

// Initialize theme
if (state.isDarkMode) {
    document.body.classList.add('dark');
    elements.themeToggle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
}

// Initialize voice synthesis
function initVoiceSynthesis() {
    if (typeof responsiveVoice !== 'undefined') {
        state.isVoiceAvailable = true;
        // Устанавливаем голос по умолчанию
        responsiveVoice.setDefaultVoice('Spanish Latin American Male');
        responsiveVoice.setDefaultRate(0.8);
        console.log('Voice synthesis initialized');
    } else {
        console.warn('ResponsiveVoice не загружен');
        state.isVoiceAvailable = false;
    }
}

// Show database info
async function showDBInfo() {
    try {
        const info = await getDBInfo();
        if (!info) {
            throw new Error('Could not get database info');
        }

        const message = `
            Всего слов: ${info.totalWords}
            Категорий: ${info.categoriesCount}
            Пример слова: ${info.sampleWord.spanish} - ${info.sampleWord.russian}
        `.replace(/^\s+/gm, ''); // Убираем лишние пробелы в начале строк

        alert(message);
    } catch (error) {
        console.error('Error showing DB info:', error);
        alert('Ошибка при получении информации о базе данных');
    }
}

// Функция для показа индикатора загрузки
function showLoading(message = 'Загрузка данных...') {
    const loadingElement = elements.loading;
    const loadingText = loadingElement.querySelector('.loading-text');
    loadingText.textContent = message;
    loadingElement.style.display = 'flex';
    loadingElement.classList.add('fade-in');
    loadingElement.classList.remove('fade-out');
}

// Функция для скрытия индикатора загрузки
function hideLoading() {
    const loadingElement = elements.loading;
    loadingElement.classList.add('fade-out');
    loadingElement.classList.remove('fade-in');
    setTimeout(() => {
        loadingElement.style.display = 'none';
    }, 300);
}

// Initialize app
async function initApp() {
    try {
        showLoading('Загрузка данных...');
        
        // Initialize voice synthesis
        initVoiceSynthesis();
        
        // Сначала пробуем загрузить данные из IndexedDB
        const offlineWords = await loadWordsFromIndexedDB();
        console.log('Offline words loaded:', offlineWords?.length || 0);
        
        if (offlineWords && offlineWords.length > 0) {
            console.log('Loaded words from IndexedDB');
            state.questions = offlineWords;
            state.isOffline = true;
            
            // Загружаем категории из сохраненных данных
            const categories = [...new Set(offlineWords.map(word => word.category))].filter(Boolean);
            populateCategorySelect(categories);
            
            shuffleQuestions();
            displayQuestion();
            addEventListeners();
            
            hideLoading();
            state.isLoading = false;
            
            // Пробуем инициализировать Google Sheets API в фоне
            showLoading('Проверка обновлений...');
            try {
                const initialized = await initGoogleSheets();
                console.log('Google Sheets initialized:', initialized);
                
                if (initialized) {
                    try {
                        // Пробуем обновить данные из Google Sheets
                        const words = await loadWords();
                        console.log('Words loaded from Google Sheets:', words?.length || 0);
                        
                        if (words && words.length > 0) {
                            state.questions = words;
                            state.isOffline = false;
                            shuffleQuestions();
                            displayQuestion();
                        }
                    } catch (error) {
                        console.error('Error updating from Google Sheets:', error);
                    }
                }
            } catch (error) {
                console.error('Error initializing Google Sheets:', error);
            }
            
            hideLoading();
            return;
        }

        // Если в IndexedDB нет данных, пробуем загрузить из Google Sheets
        showLoading('Подключение к Google Sheets...');
        try {
            const initialized = await initGoogleSheets();
            console.log('Google Sheets initialized:', initialized);
            
            if (!initialized) {
                throw new Error('Failed to initialize Google Sheets');
            }
            
            const words = await loadWords();
            console.log('Words loaded from Google Sheets:', words?.length || 0);
            
            if (!words || words.length === 0) {
                throw new Error('No questions available');
            }
            
            state.questions = words;
            const categories = await getCategories();
            populateCategorySelect(categories);
            
            shuffleQuestions();
            displayQuestion();
            addEventListeners();
            
            hideLoading();
            state.isLoading = false;
        } catch (error) {
            console.error('Error loading from Google Sheets:', error);
            throw error; // Пробрасываем ошибку дальше для обработки
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        hideLoading();
        
        if (error.message.includes('No data available and no internet connection')) {
            state.isOffline = true;
            alert('Нет доступа к интернету и нет сохраненных данных. Пожалуйста, подключитесь к интернету для первой загрузки данных.');
        } else {
            alert('Ошибка при загрузке данных: ' + error.message);
        }
    }
}

// Populate category select
function populateCategorySelect(categories) {
    elements.categorySelect.innerHTML = '<option value="">Todas las categorías</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        elements.categorySelect.appendChild(option);
    });
}

// Shuffle questions
function shuffleQuestions() {
    for (let i = state.questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.questions[i], state.questions[j]] = [state.questions[j], state.questions[i]];
    }
}

// Display question
function displayQuestion() {
    const currentWord = state.questions[state.currentIndex];
    if (!currentWord) return;

    const questionContainer = document.getElementById('question-container');
    const answerContainer = document.getElementById('answer-container');
    const speakButton = document.getElementById('speak-button');

    // Отображаем только испанское слово на стороне вопроса
    questionContainer.innerHTML = `
        <div class="spanish-text">${currentWord.spanish}</div>
    `;

    // Отображаем русский и английский переводы на стороне ответа
    answerContainer.innerHTML = `
        <div class="russian-text">${currentWord.russian}</div>
        <div class="english-text">${currentWord.english}</div>
    `;

    // Показываем кнопку воспроизведения только если:
    // 1. Мы онлайн
    // 2. Голосовой синтез доступен
    // 3. Карточка не перевернута
    if (navigator.onLine && state.isVoiceAvailable && !state.isFlipped) {
        speakButton.classList.remove('hidden');
        speakButton.style.opacity = '0.8';
    } else {
        speakButton.classList.add('hidden');
    }

    // Update counter
    elements.currentIndex.textContent = state.currentIndex + 1;
    elements.totalWords.textContent = state.questions.length;
    
    // Update navigation buttons
    elements.prevButton.disabled = state.currentIndex === 0;
    elements.nextButton.disabled = state.currentIndex === state.questions.length - 1;
}

// Load next question
function loadNextQuestion() {
    if (state.currentIndex < state.questions.length - 1 && !isAnimating) {
        isAnimating = true;
        const cardElement = elements.card;
        // Сначала сбрасываем состояние переворота
        cardElement.classList.remove('flipped');
        cardElement.classList.add('slide-out-left');
        
        setTimeout(() => {
            state.currentIndex++;
            displayQuestion();
            cardElement.classList.remove('slide-out-left');
            isAnimating = false;
        }, 300);
    }
}

// Load previous question
function loadPreviousQuestion() {
    if (state.currentIndex > 0 && !isAnimating) {
        isAnimating = true;
        const cardElement = elements.card;
        // Сначала сбрасываем состояние переворота
        cardElement.classList.remove('flipped');
        cardElement.classList.add('slide-out-right');
        
        setTimeout(() => {
            state.currentIndex--;
            displayQuestion();
            cardElement.classList.remove('slide-out-right');
            isAnimating = false;
        }, 300);
    }
}

// Filter questions by category
async function filterByCategory(category) {
    if (state.isLoading) return;
    
    state.isLoading = true;
    showLoading('Загрузка категории...');
    
    try {
        // Сначала сбрасываем состояние переворота
        elements.card.classList.remove('flipped');
        
        // Если выбрана категория "Все", загружаем все слова
        if (!category) {
            const words = await loadWords();
            state.questions = words;
        } else {
            // Иначе фильтруем по выбранной категории
            const words = await loadWords();
            state.questions = words.filter(q => q.category === category);
        }
        
        if (state.questions.length === 0) {
            throw new Error('No words found for the selected category');
        }
        
        shuffleQuestions();
        state.currentIndex = 0;
        displayQuestion();
    } catch (error) {
        console.error('Error filtering questions:', error);
        alert('Ошибка при фильтрации вопросов. Пожалуйста, попробуйте еще раз.');
    } finally {
        state.isLoading = false;
        hideLoading();
    }
}

// Toggle menu
function toggleMenu() {
    elements.menuDropdown.classList.toggle('hidden');
}

// Close menu when clicking outside
function handleClickOutside(event) {
    if (!elements.menuButton.contains(event.target) && 
        !elements.menuDropdown.contains(event.target)) {
        elements.menuDropdown.classList.add('hidden');
    }
}

// Toggle dark mode
function toggleDarkMode() {
    state.isDarkMode = !state.isDarkMode;
    document.body.classList.toggle('dark', state.isDarkMode);
    localStorage.setItem('darkMode', state.isDarkMode);
    
    // Update theme toggle icon and text
    const themeIcon = elements.themeToggle.querySelector('svg');
    const themeText = elements.themeToggle.querySelector('span');
    
    if (state.isDarkMode) {
        themeIcon.innerHTML = '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"></path>';
        themeText.textContent = 'Светлая тема';
    } else {
        themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        themeText.textContent = 'Тёмная тема';
    }
}

// Speak word
function speakWord(word) {
    if (!state.isVoiceAvailable || !navigator.onLine) {
        console.log('Voice synthesis not available:', {
            isVoiceAvailable: state.isVoiceAvailable,
            isOnline: navigator.onLine
        });
        return;
    }
    
    try {
        // Сразу отменяем любое текущее произношение
        responsiveVoice.cancel();
        
        // Используем минимальную задержку для гарантии отмены предыдущего произношения
        setTimeout(() => {
            responsiveVoice.speak(word, "Spanish Latin American Male", {
                rate: 0.8,
                pitch: 1,
                lang: "es-ES"
            });
        }, 50);
    } catch (error) {
        console.error('Error in speakWord:', error);
    }
}

// Add event listeners
function addEventListeners() {
    elements.card.addEventListener('click', () => {
        if (!isAnimating) {
            elements.card.classList.toggle('flipped');
        }
    });
    
    elements.nextButton.addEventListener('click', loadNextQuestion);
    elements.prevButton.addEventListener('click', loadPreviousQuestion);
    elements.categorySelect.addEventListener('change', (e) => filterByCategory(e.target.value));
    elements.themeToggle.addEventListener('click', toggleDarkMode);
    elements.menuButton.addEventListener('click', toggleMenu);
    document.addEventListener('click', handleClickOutside);
    
    // Add speak button event listener
    elements.speakButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card flip
        const currentWord = state.questions[state.currentIndex].spanish;
        speakWord(currentWord);
    });

    // Touch events
    elements.card.addEventListener('touchstart', e => {
        if (!isAnimating) {
            touchstartX = e.changedTouches[0].screenX;
        }
    });

    elements.card.addEventListener('touchmove', e => {
        if (!isAnimating) {
            const currentX = e.changedTouches[0].screenX;
            const diff = currentX - touchstartX;
            
            if (Math.abs(diff) > 10) {
                const rotation = diff * 0.1;
                elements.card.style.transform = `rotateY(${rotation}deg)`;
            }
        }
    });

    elements.card.addEventListener('touchend', e => {
        if (!isAnimating) {
            touchendX = e.changedTouches[0].screenX;
            elements.card.style.transform = '';
            handleSwipe();
        }
    });

    elements.card.addEventListener('touchcancel', () => {
        if (!isAnimating) {
            elements.card.style.transform = '';
        }
    });
}

// Handle Swipe
function handleSwipe() {
    const swipeThreshold = 50;
    const swipeDistance = touchendX - touchstartX;
    
    if (Math.abs(swipeDistance) > swipeThreshold) {
        if (swipeDistance > 0) {
            loadPreviousQuestion();
        } else {
            loadNextQuestion();
        }
    }
}

// Prevent unwanted gestures
document.addEventListener('touchmove', function(e) {
    // Allow touchmove only on the card
    if (!e.target.closest('.flashcard') && !e.target.closest('.menu-dropdown')) {
        e.preventDefault();
    }
}, { passive: false });

// Prevent pull-to-refresh
document.body.addEventListener('touchstart', function(e) {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

let touchStartY = 0;
document.body.addEventListener('touchstart', function(e) {
    touchStartY = e.touches[0].clientY;
}, { passive: true });

document.body.addEventListener('touchmove', function(e) {
    const touchY = e.touches[0].clientY;
    const touchDiff = touchY - touchStartY;
    
    // If we're at the top of the page and trying to pull down, prevent it
    if (window.scrollY === 0 && touchDiff > 0) {
        e.preventDefault();
    }
}, { passive: false });

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp); 
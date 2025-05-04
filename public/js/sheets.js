// Google Sheets API configuration
const SPREADSHEET_ID = '1jvk535SZxXYzfgUB-wRhk-V25_dAbNDDkL3It85bGNg';
const SHEET_NAME = 'Palabras';
const API_KEY = 'AIzaSyDhPxdQMr4yq3a5wOhCaaOUEmS3J6afvwg';

// IndexedDB configuration
const DB_NAME = 'ParaguasDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';

// Check if online
async function isOnline() {
    try {
        const response = await fetch('/ping', { 
            method: 'HEAD',
            cache: 'no-cache',
            timeout: 5000
        });
        return response.ok;
    } catch {
        return false;
    }
}

// Initialize IndexedDB
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Error opening IndexedDB:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            console.log('IndexedDB opened successfully');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                console.log('Created object store:', STORE_NAME);
            }
        };
    });
}

// Save words to IndexedDB
async function saveWordsToIndexedDB(words) {
    try {
        const db = await initDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // Clear existing data
        await new Promise((resolve, reject) => {
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                console.log('Cleared existing data from IndexedDB');
                resolve();
            };
            clearRequest.onerror = (event) => {
                console.error('Error clearing IndexedDB:', event.target.error);
                reject(clearRequest.error);
            };
        });

        // Save new data
        for (const word of words) {
            await new Promise((resolve, reject) => {
                const request = store.add(word);
                request.onsuccess = () => resolve();
                request.onerror = (event) => {
                    console.error('Error adding word to IndexedDB:', event.target.error);
                    reject(request.error);
                };
            });
        }
        console.log('Saved words to IndexedDB:', words.length);
    } catch (error) {
        console.error('Error saving words to IndexedDB:', error);
        throw error;
    }
}

// Load words from IndexedDB
async function loadWordsFromIndexedDB() {
    try {
        const db = await initDB();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log('Loaded words from IndexedDB:', request.result.length);
                resolve(request.result);
            };
            request.onerror = (event) => {
                console.error('Error loading words from IndexedDB:', event.target.error);
                reject(request.error);
            };
        });
    } catch (error) {
        console.error('Error loading words from IndexedDB:', error);
        return [];
    }
}

// Load Google API script
function loadGoogleApiScript() {
    return new Promise((resolve, reject) => {
        if (window.gapi) {
            console.log('Google API already loaded');
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
            console.log('Google API script loaded');
            resolve();
        };
        script.onerror = (error) => {
            console.error('Error loading Google API script:', error);
            reject(error);
        };
        document.body.appendChild(script);
    });
}

// Initialize Google Sheets API
async function initGoogleSheets() {
    try {
        // Загружаем скрипт Google API, если он еще не загружен
        await loadGoogleApiScript();

        // Проверяем, инициализирован ли уже клиент
        if (gapi.client && gapi.client.sheets) {
            console.log('Google Sheets API already initialized');
            return true;
        }

        // Загружаем клиент
        await new Promise((resolve, reject) => {
            gapi.load('client', {
                callback: () => {
                    console.log('Google API client loaded');
                    resolve();
                },
                onerror: (error) => {
                    console.error('Error loading Google API client:', error);
                    reject(error);
                }
            });
        });

        // Инициализируем клиент
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
        });

        console.log('Google Sheets API initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing Google Sheets API:', error);
        return false;
    }
}

// Load Words
async function loadWords() {
    try {
        // Сначала пробуем загрузить из IndexedDB
        const offlineWords = await loadWordsFromIndexedDB();
        console.log('Loaded offline words:', offlineWords?.length || 0);

        // Проверяем доступность интернета
        const online = await isOnline();
        console.log('Online status:', online);

        if (!online) {
            if (offlineWords && offlineWords.length > 0) {
                console.log('Using offline data');
                return offlineWords;
            }
            throw new Error('No data available and no internet connection');
        }

        // Если есть интернет, пробуем загрузить из Google Sheets
        const initialized = await initGoogleSheets();
        if (!initialized) {
            console.error('Failed to initialize Google Sheets');
            if (offlineWords && offlineWords.length > 0) {
                console.log('Using offline data (Google Sheets not initialized)');
                return offlineWords;
            }
            throw new Error('Failed to initialize Google Sheets and no offline data available');
        }

        try {
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: SHEET_NAME
            });

            const rows = response.result.values;
            if (!rows || rows.length === 0) {
                if (offlineWords && offlineWords.length > 0) {
                    console.log('Using offline data (no data in Google Sheets)');
                    return offlineWords;
                }
                throw new Error('No data found in Google Sheets');
            }

            const words = rows.slice(1).map((row, index) => ({
                id: index + 1,
                spanish: row[0],
                russian: row[1],
                english: row[2],
                category: row[3] || 'Uncategorized'
            }));

            console.log('Loaded words from Google Sheets:', words.length);

            // Сохраняем в IndexedDB
            await saveWordsToIndexedDB(words);
            return words;
        } catch (error) {
            console.error('Error fetching data from Google Sheets:', error);
            if (offlineWords && offlineWords.length > 0) {
                console.log('Using offline data after Google Sheets error');
                return offlineWords;
            }
            throw error;
        }
    } catch (error) {
        console.error('Error loading words:', error);
        if (offlineWords && offlineWords.length > 0) {
            console.log('Using offline data after error');
            return offlineWords;
        }
        throw error;
    }
}

// Get unique categories
async function getCategories() {
    try {
        const words = await loadWords();
        return [...new Set(words.map(word => word.category))].filter(Boolean);
    } catch (error) {
        console.error('Error getting categories:', error);
        throw error;
    }
}

// Get random word by category
async function getRandomWord(category = '') {
    try {
        const words = await loadWords();
        const filteredWords = category 
            ? words.filter(word => word.category === category)
            : words;

        if (filteredWords.length === 0) {
            throw new Error('No words found for the selected category');
        }

        const randomIndex = Math.floor(Math.random() * filteredWords.length);
        return filteredWords[randomIndex];
    } catch (error) {
        console.error('Error getting random word:', error);
        throw error;
    }
}

// Get database info
async function getDBInfo() {
    try {
        const db = await initDB();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const count = await new Promise((resolve, reject) => {
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const words = await loadWordsFromIndexedDB();
        const categories = [...new Set(words.map(word => word.category))].filter(Boolean);

        return {
            totalWords: count,
            categories: categories,
            categoriesCount: categories.length,
            sampleWord: words[0] // Пример слова для проверки структуры
        };
    } catch (error) {
        console.error('Error getting DB info:', error);
        return null;
    }
}

// Export functions
export {
    initGoogleSheets,
    loadWords,
    getCategories,
    getRandomWord,
    getDBInfo,
    loadWordsFromIndexedDB
}; 
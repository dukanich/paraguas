// Google Sheets API configuration
const SPREADSHEET_ID = '1jvk535SZxXYzfgUB-wRhk-V25_dAbNDDkL3It85bGNg';
const SHEET_NAME = 'Palabras';
const API_KEY = 'AIzaSyDhPxdQMr4yq3a5wOhCaaOUEmS3J6afvwg'; // Вставьте сюда ваш API ключ

// Cache for offline use
let wordsCache = null;
let categoriesCache = null;

// Initialize Google Sheets API
async function initGoogleSheets() {
    try {
        // Load the Google API client
        await new Promise((resolve, reject) => {
            gapi.load('client', {
                callback: resolve,
                onerror: reject
            });
        });

        // Initialize the client with API key
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
        });

        console.log('Google Sheets API initialized');
    } catch (error) {
        console.error('Error initializing Google Sheets API:', error);
        // Try to load from IndexedDB if API initialization fails
        const words = await loadWordsFromIndexedDB();
        if (words && words.length > 0) {
            console.log('Loaded words from IndexedDB');
            return;
        }
        throw error;
    }
}

// Load all words from the spreadsheet
async function loadWords() {
    if (wordsCache) {
        return wordsCache;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:D`, // A2:D to skip header row
        });

        const words = response.result.values.map(row => ({
            spanish: row[0],
            russian: row[1],
            english: row[2],
            category: row[3] || 'Uncategorized'
        }));

        // Cache the words
        wordsCache = words;
        
        // Store in IndexedDB for offline use
        await storeWordsInIndexedDB(words);

        return words;
    } catch (error) {
        console.error('Error loading words:', error);
        // Try to load from IndexedDB if online fetch fails
        return loadWordsFromIndexedDB();
    }
}

// Get unique categories
async function getCategories() {
    if (categoriesCache) {
        return categoriesCache;
    }

    try {
        const words = await loadWords();
        const categories = [...new Set(words.map(word => word.category))].filter(Boolean);
        categoriesCache = categories;
        return categories;
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

// IndexedDB functions for offline support
const DB_NAME = 'paraguas-db';
const DB_VERSION = 1;
const STORE_NAME = 'words';

// Initialize IndexedDB
function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'spanish' });
            }
        };
    });
}

// Store words in IndexedDB
async function storeWordsInIndexedDB(words) {
    const db = await initIndexedDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Clear existing data
    await new Promise((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Store new data
    const promises = words.map(word => 
        new Promise((resolve, reject) => {
            const request = store.add(word);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        })
    );

    await Promise.all(promises);
}

// Load words from IndexedDB
async function loadWordsFromIndexedDB() {
    const db = await initIndexedDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Export functions
export {
    initGoogleSheets,
    loadWords,
    getCategories,
    getRandomWord,
    initIndexedDB
}; 
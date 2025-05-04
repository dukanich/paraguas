const express = require('express');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const port = 3000;

// Serve static files
app.use(express.static('public'));

// Google Sheets API configuration
const SPREADSHEET_ID = '1jvk535SZxXYzfgUB-wRhk-V25_dAbNDDkL3It85bGNg';
const SHEET_NAME = 'Palabras';

// Initialize Google Sheets API
const sheets = google.sheets('v4');

// Middleware to handle CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// API endpoint to get all words
app.get('/api/words', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:D`,
        });

        const words = response.data.values.map(row => ({
            spanish: row[0],
            russian: row[1],
            english: row[2],
            category: row[3] || 'Uncategorized'
        }));

        res.json(words);
    } catch (error) {
        console.error('Error fetching words:', error);
        res.status(500).json({ error: 'Failed to fetch words' });
    }
});

// API endpoint to get categories
app.get('/api/categories', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:D`,
        });

        const categories = [...new Set(
            response.data.values
                .map(row => row[3])
                .filter(Boolean)
        )];

        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// API endpoint to get random word
app.get('/api/question', async (req, res) => {
    try {
        const category = req.query.category;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:D`,
        });

        let words = response.data.values.map(row => ({
            spanish: row[0],
            russian: row[1],
            english: row[2],
            category: row[3] || 'Uncategorized'
        }));

        if (category) {
            words = words.filter(word => word.category === category);
        }

        if (words.length === 0) {
            return res.status(404).json({ error: 'No words found' });
        }

        const randomIndex = Math.floor(Math.random() * words.length);
        res.json(words[randomIndex]);
    } catch (error) {
        console.error('Error fetching random word:', error);
        res.status(500).json({ error: 'Failed to fetch random word' });
    }
});

// Ping endpoint for checking server availability
app.head('/ping', (req, res) => {
    res.sendStatus(200);
});

// Serve index.html for all other routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`To access from other devices, use your local IP address: http://192.168.0.49:${port}`);
}); 
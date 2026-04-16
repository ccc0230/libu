const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'data', 'libu.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db = null;

async function loadDB() {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
        try { db.run('ALTER TABLE books ADD COLUMN theme TEXT DEFAULT \'red\''); } catch(e) {}
        saveDB();
    } else {
        db = new SQL.Database();
        db.run(`CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            theme TEXT DEFAULT 'red',
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            remark TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        )`);
        saveDB();
    }
}

function saveDB() {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, buffer);
}

function queryAll(sql, params) {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

function queryRun(sql, params) {
    db.run(sql, params);
    saveDB();
}

/* ========== 礼簿 API ========== */

app.get('/api/books', (req, res) => {
    const books = queryAll('SELECT * FROM books ORDER BY id ASC');
    res.json(books);
});

app.post('/api/books', (req, res) => {
    const { name, date, theme } = req.body;
    if (!name || !date) return res.status(400).json({ error: '名称和日期不能为空' });
    const t = theme || 'red';
    queryRun('INSERT INTO books (name, date, theme) VALUES (?, ?, ?)', [name, date, t]);
    const books = queryAll('SELECT * FROM books ORDER BY id DESC LIMIT 1');
    res.json(books[0]);
});

app.put('/api/books/:id', (req, res) => {
    const { name, date, theme } = req.body;
    const t = theme || 'red';
    queryRun('UPDATE books SET name = ?, date = ?, theme = ? WHERE id = ?', [name, date, t, req.params.id]);
    const books = queryAll('SELECT * FROM books WHERE id = ?', [req.params.id]);
    res.json(books[0] || null);
});

app.delete('/api/books/:id', (req, res) => {
    queryRun('DELETE FROM records WHERE book_id = ?', [req.params.id]);
    queryRun('DELETE FROM books WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

/* ========== 礼金记录 API ========== */

app.get('/api/books/:bookId/records', (req, res) => {
    const { keyword } = req.query;
    let sql = 'SELECT * FROM records WHERE book_id = ?';
    const params = [req.params.bookId];
    if (keyword) {
        sql += ' AND (name LIKE ? OR CAST(amount AS TEXT) LIKE ? OR remark LIKE ?)';
        const kw = '%' + keyword + '%';
        params.push(kw, kw, kw);
    }
    sql += ' ORDER BY id ASC';
    const records = queryAll(sql, params);
    res.json(records);
});

app.post('/api/books/:bookId/records', (req, res) => {
    const { name, amount, remark } = req.body;
    if (!name || !amount) return res.status(400).json({ error: '姓名和金额不能为空' });
    queryRun('INSERT INTO records (book_id, name, amount, remark) VALUES (?, ?, ?, ?)',
        [req.params.bookId, name, amount, remark || '']);
    const records = queryAll('SELECT * FROM records ORDER BY id DESC LIMIT 1');
    res.json(records[0]);
});

app.delete('/api/records/:id', (req, res) => {
    queryRun('DELETE FROM records WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

app.get('/api/books/:bookId/stats', (req, res) => {
    const rows = queryAll(
        'SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM records WHERE book_id = ?',
        [req.params.bookId]
    );
    const stats = rows[0] || { count: 0, total: 0 };
    stats.avg = stats.count > 0 ? Math.round(stats.total / stats.count) : 0;
    res.json(stats);
});

loadDB().then(() => {
    app.listen(PORT, () => {
        console.log(`礼簿服务器已启动: http://localhost:${PORT}`);
    });
}).catch(console.error);

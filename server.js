const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'data', 'libu.db');
const SECRET = 'libu_secret_key_2026';
const upload = multer({ dest: path.join(__dirname, 'temp') });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db = null;
const sessions = {};

async function loadDB() {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
        try { db.run('ALTER TABLE books ADD COLUMN theme TEXT DEFAULT \'red\''); } catch(e) {}
    } else {
        db = new SQL.Database();
    }
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )`);
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
    const users = queryAll("SELECT * FROM users WHERE username = 'admin'");
    if (users.length === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        db.run("INSERT INTO users (username, password) VALUES ('admin', ?)", [hash]);
    }
    saveDB();
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

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function authMiddleware(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token || !sessions[token]) {
        return res.status(401).json({ error: '请先登录' });
    }
    req.userId = sessions[token].userId;
    req.username = sessions[token].username;
    next();
}

/* ========== 认证 API ========== */

app.post('/api/auth/login', (req, res) => {
    const { username, password, remember } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
    const users = queryAll('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.status(401).json({ error: '用户名或密码错误' });
    if (!bcrypt.compareSync(password, users[0].password)) return res.status(401).json({ error: '用户名或密码错误' });
    const token = generateToken();
    sessions[token] = { userId: users[0].id, username: users[0].username };
    res.json({ token, username: users[0].username });
});

app.post('/api/auth/logout', (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) delete sessions[token];
    res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token && sessions[token]) {
        res.json({ loggedIn: true, username: sessions[token].username });
    } else {
        res.json({ loggedIn: false });
    }
});

app.put('/api/auth/password', (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token || !sessions[token]) return res.status(401).json({ error: '请先登录' });
    const users = queryAll('SELECT * FROM users WHERE id = ?', [sessions[token].userId]);
    if (users.length === 0) return res.status(404).json({ error: '用户不存在' });
    if (!bcrypt.compareSync(oldPassword, users[0].password)) return res.status(400).json({ error: '原密码错误' });
    const hash = bcrypt.hashSync(newPassword, 10);
    queryRun('UPDATE users SET password = ? WHERE id = ?', [hash, sessions[token].userId]);
    res.json({ success: true });
});

app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名长度2-20个字符' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
    const all = queryAll('SELECT * FROM users');
    if (all.length >= 10) return res.status(400).json({ error: '系统账号已达上限（10个）' });
    const existing = queryAll('SELECT * FROM users WHERE username = ?', [username]);
    if (existing.length > 0) return res.status(400).json({ error: '用户名已存在' });
    const hash = bcrypt.hashSync(password, 10);
    queryRun('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
    res.json({ success: true });
});

app.get('/api/auth/users', authMiddleware, (req, res) => {
    if (req.username !== 'admin') return res.status(403).json({ error: '仅管理员可访问' });
    const users = queryAll('SELECT id, username, created_at FROM users ORDER BY id ASC');
    res.json(users);
});

app.delete('/api/auth/users/:id', authMiddleware, (req, res) => {
    if (req.username !== 'admin') return res.status(403).json({ error: '仅管理员可操作' });
    const id = parseInt(req.params.id);
    const target = queryAll('SELECT * FROM users WHERE id = ?', [id]);
    if (target.length === 0) return res.status(404).json({ error: '用户不存在' });
    if (target[0].username === 'admin') return res.status(400).json({ error: '不能删除管理员账号' });
    queryRun('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
});

/* ========== 礼簿 API ========== */

app.get('/api/books', authMiddleware, (req, res) => {
    const books = queryAll('SELECT * FROM books ORDER BY id ASC');
    res.json(books);
});

app.post('/api/books', authMiddleware, (req, res) => {
    const { name, date, theme } = req.body;
    if (!name || !date) return res.status(400).json({ error: '名称和日期不能为空' });
    queryRun('INSERT INTO books (name, date, theme) VALUES (?, ?, ?)', [name, date, theme || 'red']);
    const books = queryAll('SELECT * FROM books ORDER BY id DESC LIMIT 1');
    res.json(books[0]);
});

app.put('/api/books/:id', authMiddleware, (req, res) => {
    const { name, date, theme } = req.body;
    queryRun('UPDATE books SET name = ?, date = ?, theme = ? WHERE id = ?', [name, date, theme || 'red', req.params.id]);
    const books = queryAll('SELECT * FROM books WHERE id = ?', [req.params.id]);
    res.json(books[0] || null);
});

app.delete('/api/books/:id', authMiddleware, (req, res) => {
    queryRun('DELETE FROM records WHERE book_id = ?', [req.params.id]);
    queryRun('DELETE FROM books WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

/* ========== 礼金记录 API ========== */

app.get('/api/books/:bookId/records', authMiddleware, (req, res) => {
    const { keyword } = req.query;
    let sql = 'SELECT * FROM records WHERE book_id = ?';
    const params = [req.params.bookId];
    if (keyword) {
        sql += ' AND (name LIKE ? OR CAST(amount AS TEXT) LIKE ? OR remark LIKE ?)';
        const kw = '%' + keyword + '%';
        params.push(kw, kw, kw);
    }
    sql += ' ORDER BY id ASC';
    res.json(queryAll(sql, params));
});

app.post('/api/books/:bookId/records', authMiddleware, (req, res) => {
    const { name, amount, remark } = req.body;
    if (!name || !amount) return res.status(400).json({ error: '姓名和金额不能为空' });
    const existing = queryAll('SELECT id FROM records WHERE book_id = ? AND name = ? AND amount = ? AND remark = ?',
        [req.params.bookId, name, amount, remark || '']);
    if (existing.length > 0) return res.status(400).json({ error: '该记录已存在（姓名、金额、备注均相同）' });
    queryRun('INSERT INTO records (book_id, name, amount, remark) VALUES (?, ?, ?, ?)',
        [req.params.bookId, name, amount, remark || '']);
    res.json(queryAll('SELECT * FROM records ORDER BY id DESC LIMIT 1')[0]);
});

app.delete('/api/records/:id', authMiddleware, (req, res) => {
    queryRun('DELETE FROM records WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

app.get('/api/books/:bookId/stats', authMiddleware, (req, res) => {
    const rows = queryAll(
        'SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM records WHERE book_id = ?',
        [req.params.bookId]
    );
    const s = rows[0] || { count: 0, total: 0 };
    s.avg = s.count > 0 ? Math.round(s.total / s.count) : 0;
    res.json(s);
});

/* ========== Excel 导入 ========== */

app.post('/api/books/:bookId/import', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    try {
        const ext = path.extname(req.file.originalname).toLowerCase();
        let rows = [];
        if (ext === '.csv') {
            const content = fs.readFileSync(req.file.path, 'utf-8');
            const lines = content.split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const parts = line.split(',');
                if (parts.length >= 2) {
                    rows.push({ name: parts[0].trim(), amount: parseFloat(parts[1].trim()), remark: parts.slice(2).join(',').trim() });
                }
            }
        } else {
            const workbook = XLSX.readFile(req.file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet);
            data.forEach(row => {
                const name = row['姓名'] || row['name'] || '';
                const amount = parseFloat(row['礼金'] || row['金额'] || row['amount'] || 0);
                const remark = row['备注'] || row['remark'] || '';
                if (name && amount > 0) rows.push({ name, amount, remark: String(remark) });
            });
        }
        let imported = 0, skipped = 0;
        const skippedDetails = [];
        const existing = queryAll('SELECT name, amount, remark FROM records WHERE book_id = ?', [req.params.bookId]);
        const existingSet = new Set(existing.map(r => r.name + '|' + r.amount + '|' + (r.remark || '')));
        rows.forEach(row => {
            if (!row.name || !row.amount || row.amount <= 0) {
                skipped++;
                skippedDetails.push({ name: row.name || '(空)', amount: row.amount || 0, remark: row.remark || '', reason: '姓名为空或金额无效' });
                return;
            }
            const key = row.name + '|' + row.amount + '|' + (row.remark || '');
            if (existingSet.has(key)) {
                skipped++;
                skippedDetails.push({ name: row.name, amount: row.amount, remark: row.remark || '', reason: '与已有记录重复' });
                return;
            }
            queryRun('INSERT INTO records (book_id, name, amount, remark) VALUES (?, ?, ?, ?)',
                [req.params.bookId, row.name, row.amount, row.remark || '']);
            existingSet.add(key);
            imported++;
        });
        fs.unlinkSync(req.file.path);
        res.json({ imported, skipped, total: rows.length, skippedDetails });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: '导入失败: ' + err.message });
    }
});

/* ========== Excel 导出 ========== */

app.get('/api/books/:bookId/export', authMiddleware, (req, res) => {
    const book = queryAll('SELECT * FROM books WHERE id = ?', [req.params.bookId]);
    if (!book.length) return res.status(404).json({ error: '礼簿不存在' });
    const records = queryAll('SELECT * FROM records WHERE book_id = ? ORDER BY id ASC', [req.params.bookId]);
    const total = records.reduce((s, r) => s + r.amount, 0);
    const data = [['序号', '姓名', '礼金', '备注']];
    records.forEach((r, i) => data.push([i + 1, r.name, r.amount, r.remark || '']));
    data.push(['', '合计', total, `共 ${records.length} 条记录`]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, book[0].name);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = encodeURIComponent(book[0].name + '.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
});

/* ========== 模板下载 ========== */

app.get('/api/template', (req, res) => {
    const data = [
        ['姓名', '礼金', '备注'],
        ['张三', 200, '亲戚'],
        ['李四', 500, ''],
        ['王五', 100, '同事']
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, '礼金记录');
    const noteData = [
        ['礼簿数据导入模板说明'],
        [],
        ['字段说明:'],
        ['姓名', '必填，宾客姓名'],
        ['礼金', '必填，金额数字（如 200）'],
        ['备注', '选填，备注信息'],
        [],
        ['注意事项:'],
        ['1. 第一行为表头，请勿修改'],
        ['2. 姓名和礼金为必填项'],
        ['3. 礼金请填写纯数字，不要加单位'],
        ['4. 重复数据（姓名+金额相同）导入时会自动跳过'],
        ['5. 支持 .xlsx .xls .csv 格式']
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(noteData);
    ws2['!cols'] = [{ wch: 20 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws2, '填写说明');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="import_template.xlsx"');
    res.send(buf);
});

loadDB().then(() => {
    if (!fs.existsSync(path.join(__dirname, 'temp'))) fs.mkdirSync(path.join(__dirname, 'temp'));
    app.listen(PORT, () => {
        console.log(`礼簿服务器已启动: http://localhost:${PORT}`);
        console.log('默认账号: admin / admin123');
    });
}).catch(console.error);

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'libu.db');
const CSV_PATH = path.join(__dirname, '..', '2020年3月10日曹佳佳结婚礼簿-工作表1.csv');

async function importCSV() {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(buffer);

    db.run("INSERT INTO books (name, date) VALUES ('曹佳佳结婚礼簿', '2020-03-10')");
    const bookRows = [];
    const stmt = db.prepare('SELECT * FROM books ORDER BY id DESC LIMIT 1');
    while (stmt.step()) bookRows.push(stmt.getAsObject());
    stmt.free();
    const bookId = bookRows[0].id;

    const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = csvContent.split('\n');

    let count = 0;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        if (parts.length < 2) continue;
        const name = parts[0].trim();
        const amount = parseFloat(parts[1].trim());
        const remark = parts.length >= 3 ? parts.slice(2).join(',').trim() : '';
        if (!name || isNaN(amount)) continue;

        db.run('INSERT INTO records (book_id, name, amount, remark) VALUES (?, ?, ?, ?)',
            [bookId, name, amount, remark]);
        count++;
    }

    const data = db.export();
    const newBuffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, newBuffer);
    db.close();

    console.log(`导入完成: 礼簿ID=${bookId}, 共导入 ${count} 条记录`);
}

importCSV().catch(console.error);

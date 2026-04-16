# 曹家礼簿

传统中式礼簿记录系统，支持红事/白事主题，采用竖排书法字体展示，数据持久化存储。

## 功能特性

- **礼簿管理**：新增、编辑、删除多个礼簿，每个礼簿独立管理
- **红白事主题**：红事（喜事）红色主题、白事（丧事）白色主题
- **传统竖排布局**：左右各 8 列，竖排书写，行书字体展示
- **金额大写**：自动将金额转换为中文大写（壹、贰、叁...）
- **农历日期**：自动将阳历日期转换为农历日期显示
- **姓名占位**：2 字姓名中间自动加空格，保证最少占 3 个中文字符宽度
- **查询搜索**：按姓名、金额、备注模糊搜索
- **数据持久化**：SQLite 数据库存储，重启不丢失

## 技术栈

| 技术 | 说明 |
|------|------|
| Node.js | 后端运行环境 |
| Express | Web 服务器框架 |
| sql.js | 纯 JS 实现的 SQLite（无需编译） |
| Google Fonts | Ma Shan Zheng（楷书）+ Zhi Mang Xing（行书） |

## 项目结构

```
libu/
├── server.js              # Express 后端服务器
├── deploy.sh              # 一键部署脚本
├── package.json           # 项目配置
├── .gitignore
├── data/
│   └── libu.db            # SQLite 数据库（运行时生成）
├── public/
│   └── index.html         # 前端页面
├── scripts/
│   ├── init-db.js         # 数据库初始化脚本
│   └── import-csv.js      # CSV 数据导入脚本
└── *.csv                  # 礼金数据源（模拟数据）
```

## 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 启动服务器
npm start

# 浏览器访问
http://localhost:3000
```

### 导入 CSV 数据

将 CSV 文件放入项目根目录，编辑 `scripts/import-csv.js` 中的文件路径，然后执行：

```bash
node scripts/import-csv.js
```

### 服务器部署

在阿里云/腾讯云等 Linux 服务器上执行：

```bash
curl -fsSL https://raw.githubusercontent.com/ccc0230/libu/main/deploy.sh -o deploy.sh
chmod +x deploy.sh
sudo bash deploy.sh
```

脚本会自动安装 Node.js、PM2、Nginx，拉取代码并启动服务。

## API 接口

### 礼簿管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/books` | 获取所有礼簿 |
| POST | `/api/books` | 新增礼簿 |
| PUT | `/api/books/:id` | 编辑礼簿 |
| DELETE | `/api/books/:id` | 删除礼簿（含所有记录） |

### 礼金记录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/books/:bookId/records` | 获取礼金记录（支持 `?keyword=` 搜索） |
| POST | `/api/books/:bookId/records` | 新增礼金记录 |
| DELETE | `/api/records/:id` | 删除单条记录 |
| GET | `/api/books/:bookId/stats` | 获取统计（总额/数量/平均） |

## 常用命令

```bash
npm start           # 启动服务器
pm2 status          # 查看服务状态
pm2 logs libu       # 查看日志
pm2 restart libu    # 重启服务
```

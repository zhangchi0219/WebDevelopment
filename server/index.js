const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化数据库
const db = new Database(path.join(__dirname, '../data/photos.db'));

// 创建照片表
db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../public/uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${crypto.randomUUID()}${ext}`;
    cb(null, filename);
  }
});

// 文件过滤器 - 只允许图片
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件 (JPEG, PNG, GIF, WebP)'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 限制
  }
});

// 上传照片 API
app.post('/api/photos', upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的照片' });
    }

    const photo = {
      id: crypto.randomUUID(),
      filename: req.file.filename,
      original_name: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    };

    const stmt = db.prepare(`
      INSERT INTO photos (id, filename, original_name, mimetype, size)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(photo.id, photo.filename, photo.original_name, photo.mimetype, photo.size);

    res.json({
      success: true,
      photo: {
        ...photo,
        url: `/uploads/${photo.filename}`
      }
    });
  } catch (error) {
    console.error('上传错误:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 批量上传照片 API
app.post('/api/photos/batch', upload.array('photos', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的照片' });
    }

    const stmt = db.prepare(`
      INSERT INTO photos (id, filename, original_name, mimetype, size)
      VALUES (?, ?, ?, ?, ?)
    `);

    const photos = req.files.map(file => {
      const photo = {
        id: crypto.randomUUID(),
        filename: file.filename,
        original_name: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      };
      stmt.run(photo.id, photo.filename, photo.original_name, photo.mimetype, photo.size);
      return {
        ...photo,
        url: `/uploads/${photo.filename}`
      };
    });

    res.json({
      success: true,
      count: photos.length,
      photos
    });
  } catch (error) {
    console.error('批量上传错误:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 获取照片列表 API (最近 200 张)
app.get('/api/photos', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 200);
    const stmt = db.prepare(`
      SELECT id, filename, original_name, mimetype, size, created_at
      FROM photos
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const photos = stmt.all(limit);

    const result = photos.map(photo => ({
      ...photo,
      url: `/uploads/${photo.filename}`
    }));

    res.json({
      success: true,
      count: result.length,
      photos: result
    });
  } catch (error) {
    console.error('获取照片列表错误:', error);
    res.status(500).json({ error: '获取照片列表失败' });
  }
});

// 删除照片 API
app.delete('/api/photos/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 获取照片信息
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
    if (!photo) {
      return res.status(404).json({ error: '照片不存在' });
    }

    // 删除文件
    const fs = require('fs');
    const filePath = path.join(__dirname, '../public/uploads', photo.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 删除数据库记录
    db.prepare('DELETE FROM photos WHERE id = ?').run(id);

    res.json({ success: true, message: '照片已删除' });
  } catch (error) {
    console.error('删除照片错误:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 获取照片统计
app.get('/api/photos/stats', (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM photos').get();
    const totalSize = db.prepare('SELECT SUM(size) as total FROM photos').get();

    res.json({
      success: true,
      stats: {
        count: count.count,
        totalSize: totalSize.total || 0
      }
    });
  } catch (error) {
    console.error('获取统计错误:', error);
    res.status(500).json({ error: '获取统计失败' });
  }
});

// 错误处理中间件
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制 (最大 10MB)' });
    }
  }
  console.error('服务器错误:', error);
  res.status(500).json({ error: error.message || '服务器内部错误' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

// 图片上传 / 读取 / 删除（本地磁盘存储）
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只能上传图片文件'));
  },
});

const router = Router();

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
  res.status(201).json({ key: req.file.filename, url: `/api/images/${req.file.filename}` });
});

router.get('/:key', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, path.basename(req.params.key));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '图片不存在' });
  res.sendFile(filePath);
});

router.delete('/:key', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, path.basename(req.params.key));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

export { router as imageRouter };

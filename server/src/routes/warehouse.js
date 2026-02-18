const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');

const router = express.Router();

const MODELS_DIR = path.join(__dirname, '../../warehouse/models');
const THUMBNAILS_DIR = path.join(__dirname, '../../warehouse/thumbnails');

// All routes require authentication
router.use(requireAuth);

// GET /categories — distinct category/subcategory tree
router.get('/categories', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT DISTINCT category, subcategory FROM warehouse_items ORDER BY category, subcategory'
  ).all();

  const tree = {};
  for (const row of rows) {
    if (!tree[row.category]) tree[row.category] = [];
    if (row.subcategory && !tree[row.category].includes(row.subcategory)) {
      tree[row.category].push(row.subcategory);
    }
  }
  res.json(tree);
});

// GET /items — paginated list with filters
router.get('/items', (req, res) => {
  const { category, subcategory, search, page = 1, limit = 50 } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);

  let sql = 'SELECT * FROM warehouse_items WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (subcategory) {
    sql += ' AND subcategory = ?';
    params.push(subcategory);
  }
  if (search) {
    sql += ' AND (name LIKE ? OR tags LIKE ? OR description LIKE ?)';
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern);
  }

  sql += ' ORDER BY category, name LIMIT ? OFFSET ?';
  params.push(limitNum, (pageNum - 1) * limitNum);

  const db = getDb();
  const items = db.prepare(sql).all(...params);
  res.json({ items, page: pageNum, limit: limitNum });
});

// GET /item/:id — single item
router.get('/item/:id', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM warehouse_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

// GET /item/:id/model — serve glTF file
router.get('/item/:id/model', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT model_filename FROM warehouse_items WHERE id = ?').get(req.params.id);
  if (!item || !item.model_filename) return res.status(404).json({ error: 'Model not found' });

  const filePath = path.join(MODELS_DIR, item.model_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// GET /item/:id/thumbnail — serve thumbnail
router.get('/item/:id/thumbnail', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT thumbnail_filename FROM warehouse_items WHERE id = ?').get(req.params.id);
  if (!item || !item.thumbnail_filename) return res.status(404).json({ error: 'Thumbnail not found' });

  const filePath = path.join(THUMBNAILS_DIR, item.thumbnail_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// POST /item — create (admin only, user id 1)
router.post('/item', (req, res) => {
  if (req.userId !== 1) return res.status(403).json({ error: 'Admin only' });

  const { name, category, subcategory, tags, description, type, parameters, model_filename, thumbnail_filename, file_size } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'name and category required' });

  const db = getDb();
  const result = db.prepare(
    `INSERT INTO warehouse_items
      (name, category, subcategory, tags, description, type, parameters, model_filename, thumbnail_filename, file_size, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name, category, subcategory || null, tags || null, description || null,
    type || 'catalogue', parameters || null, model_filename || null,
    thumbnail_filename || null, file_size || 0, req.userId
  );

  res.json({ id: result.lastInsertRowid });
});

// PUT /item/:id — update
router.put('/item/:id', (req, res) => {
  if (req.userId !== 1) return res.status(403).json({ error: 'Admin only' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM warehouse_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });

  const { name, category, subcategory, tags, description, type, parameters, model_filename, thumbnail_filename, file_size } = req.body;
  db.prepare(
    `UPDATE warehouse_items SET
      name = COALESCE(?, name), category = COALESCE(?, category), subcategory = ?, tags = ?,
      description = ?, type = COALESCE(?, type), parameters = ?, model_filename = ?,
      thumbnail_filename = ?, file_size = COALESCE(?, file_size), updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(name, category, subcategory, tags, description, type, parameters, model_filename, thumbnail_filename, file_size, req.params.id);

  res.json({ success: true });
});

// DELETE /item/:id — remove
router.delete('/item/:id', (req, res) => {
  if (req.userId !== 1) return res.status(403).json({ error: 'Admin only' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM warehouse_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });

  db.prepare('DELETE FROM warehouse_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

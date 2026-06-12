const express = require('express');
const db = require('../database/db');
const router = express.Router();

router.get('/', async (req, res) => {
  const niches = await db.prepare('SELECT * FROM niches ORDER BY name').all();
  res.json(niches);
});

module.exports = router;

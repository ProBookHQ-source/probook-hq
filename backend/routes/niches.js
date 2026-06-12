const express = require('express');
const db = require('../database/db');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM niches ORDER BY name').all());
});

module.exports = router;

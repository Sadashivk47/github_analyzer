const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const validateUsername = require('../middlewares/validateUsername');
const controller = require('../controllers/profile.controller');

router.post('/:username', validateUsername, asyncHandler(controller.analyzeProfile));
router.get('/', asyncHandler(controller.getAllProfiles));
router.get('/:username', validateUsername, asyncHandler(controller.getProfile));
router.get('/:username/history', validateUsername, asyncHandler(controller.getProfileHistory));
router.delete('/:username', validateUsername, asyncHandler(controller.removeProfile));

module.exports = router;

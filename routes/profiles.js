import express from 'express';
import { createProfile, getProfile, getAllProfiles, deleteProfile, searchProfiles } from '../controllers/profileController.js';

const router = express.Router();

router.get('/search', searchProfiles);
router.post('/', createProfile);
router.get('/', getAllProfiles);
router.get('/:id', getProfile);
router.delete('/:id', deleteProfile);

export default router;
import express from 'express';
import { createProfile, getProfile, getAllProfiles, deleteProfile } from '../controllers/profileController.js';

const router = express.Router();

router.post('/', createProfile);
router.get('/', getAllProfiles);
router.get('/:id', getProfile);
router.delete('/:id', deleteProfile);

export default router;
import express from 'express';
import { AuthController } from './controllers/AuthController';
import { AdminController } from './controllers/AdminController';
import { ClientController } from './controllers/ClientController';
import { verifyToken } from './middleware/auth';

const router = express.Router();

// Public - Client
router.post('/v1/validate', ClientController.validate);
router.post('/v1/heartbeat', ClientController.heartbeat);

// Public - Auth
router.post('/auth/login', AuthController.login);

// Protected - Admin
router.use('/admin', verifyToken); 

router.post('/admin/licenses', AdminController.createLicense);
router.get('/admin/licenses', AdminController.listLicenses);
router.put('/admin/licenses/:id', AdminController.updateLicense);
router.delete('/admin/licenses/:id', AdminController.deleteLicense);
router.delete('/admin/licenses/:id/machines', AdminController.resetMachines);
router.get('/admin/stats', AdminController.getStats);
router.get('/admin/machines', AdminController.listMachines);

export default router;


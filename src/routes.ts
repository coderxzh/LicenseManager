import express from 'express'
import { AuthController } from './controllers/AuthController'
import { AdminController } from './controllers/AdminController'
import { ClientController } from './controllers/ClientController'
import { verifyToken } from './middleware/auth'

const router = express.Router()

// Public - Client
router.post('/v1/validate', ClientController.validate)
router.post('/v1/heartbeat', ClientController.heartbeat)
router.post('/v1/check', ClientController.check)

// Public - Auth
router.post('/auth/login', AuthController.login)

// Protected - Admin
router.use('/admin', verifyToken)

router.post('/admin/licenses', AdminController.createLicense)
router.get('/admin/licenses', AdminController.listLicenses)
router.put('/admin/licenses/:id', AdminController.updateLicense)
router.delete('/admin/licenses/:id', AdminController.deleteLicense)
router.delete('/admin/licenses/:id/machines', AdminController.resetMachines)
router.get('/admin/stats', AdminController.getStats)
router.get('/admin/machines', AdminController.listMachines)
router.get('/admin/logs', AdminController.listLogs)
router.post('/admin/licenses/:id/grasai-apikey', AdminController.createGrasaiApiKey)
router.delete('/admin/licenses/:id/grasai-apikey', AdminController.deleteGrasaiApiKey)

router.get('/admin/grasai-apikeys', AdminController.listGrasaiApiKeys)
router.put('/admin/grasai-apikeys/:id', AdminController.updateGrasaiApiKey)
router.delete('/admin/grasai-apikeys/:id', AdminController.deleteGrasaiApiKeyById)

export default router

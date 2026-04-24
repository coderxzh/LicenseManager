import express from 'express'
import { AuthController } from './controllers/AuthController'
import { AdminController } from './controllers/AdminController'
import { ClientController } from './controllers/ClientController'
import { ApiKeyController } from './controllers/ApiKeyController'
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

// API Key 额度管理
router.get('/admin/api-key-stats', ApiKeyController.getStats)
router.get('/admin/api-keys', ApiKeyController.listApiKeys)
router.post('/admin/api-keys', ApiKeyController.createApiKey)
router.put('/admin/api-keys/:id', ApiKeyController.updateApiKey)
router.post('/admin/api-keys/:id/recharge', ApiKeyController.rechargeApiKey)
router.post('/admin/api-keys/:id/prepare-delete', ApiKeyController.prepareDeleteApiKey)
router.delete('/admin/api-keys/:id', ApiKeyController.deleteApiKey)

export default router

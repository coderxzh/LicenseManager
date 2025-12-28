import { Request, Response } from 'express'
import { LicenseService } from '../services/LicenseService'
import { signResponse } from '../utils/Signer'
import { ErrorCode } from '../enums'

export class ClientController {
  static async validate(req: Request, res: Response) {
    try {
      const { key, fingerprint, platform, hostname } = req.body
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress

      const result = await LicenseService.activate(key, fingerprint, {
        ip: ip as string,
        platform,
        hostname,
      })

      // 加上签名返回
      res.json(signResponse({ success: true, ...result }))
    } catch (e: any) {
      res.status(403).json(signResponse({ success: false, error: e.message }))
    }
  }

  static async heartbeat(req: Request, res: Response) {
    try {
      const { key, fingerprint } = req.body
      await LicenseService.heartbeat(key, fingerprint)
      res.json(signResponse({ success: true, alive: true }))
    } catch (e: any) {
      // [优化] 使用 Enum 判断错误类型
      const code = e.message === ErrorCode.KICKED ? 'KICKED' : 'ERROR'
      res.status(403).json(signResponse({ success: false, code, error: e.message }))
    }
  }
  /**
   * [新增] 查询授权信息接口
   */
  static async check(req: Request, res: Response) {
    try {
      const { key } = req.body

      if (!key) {
        return res.status(400).json(signResponse({ success: false, error: '缺少授权码' }))
      }

      const info = await LicenseService.getInfo(key)

      // 同样使用 RSA 签名返回
      res.json(
        signResponse({
          success: true,
          ...info,
        })
      )
    } catch (e: any) {
      // 查询失败不需要返回 KICKED，普通错误即可
      res.status(403).json(signResponse({ success: false, error: e.message }))
    }
  }
}

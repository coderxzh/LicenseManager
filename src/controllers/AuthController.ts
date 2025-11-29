import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "secret";

export class AuthController {
    static async login(req: Request, res: Response) {
        const { username, password } = req.body;
        const admin = await prisma.admin.findUnique({ where: { username } });
        
        if (!admin || !await bcrypt.compare(password, admin.password)) {
            return res.status(401).json({ success: false, error: "用户名或密码错误" });
        }

        const token = jwt.sign({ id: admin.id, username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token });
    }
}






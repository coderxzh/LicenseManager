import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || "secret";

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    try {
        (req as any).user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        res.status(403).json({ error: "Invalid token" });
    }
};






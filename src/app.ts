// src/app.ts

import express from 'express';
import cors from 'cors'; // <--- [新增] 引入 cors
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import router from './routes';
import { startCronJobs } from './jobs/CronJob';

dotenv.config();

const app = express();

// ==========================================
// [新增] 配置跨域中间件
// 允许所有域名访问 (适合开发和客户端软件对接)
// ==========================================
app.use(cors());

// 解析 JSON 请求体
app.use(bodyParser.json());

// 挂载路由
app.use('/api', router);

// 启动定时任务 (清理过期授权码)
startCronJobs();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 CORS Enabled: Allowed all origins`);
});



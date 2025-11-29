import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import router from './routes';
import { startCronJobs } from './jobs/CronJob';

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use('/api', router);

startCronJobs(); // 启动定时任务

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});



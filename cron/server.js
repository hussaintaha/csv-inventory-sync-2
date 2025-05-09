import express from 'express';
import axios from 'axios';
import { CronJob } from 'cron';
import dotenv from 'dotenv';
dotenv.config()

const app = express();
const PORT = process.env.PORT;

const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL;

const job = new CronJob(
    '0 0 * * *', // This cron will trigger every day at 12:00 AM (midnight).
    // '*/10 * * * * *', // every 10 seconds running cron
    async () => {
        try {
            console.log(`[${new Date().toISOString()}] Running scheduled task of app2 syn api...`);
            console.log(EXTERNAL_API_URL, '   <========== api triggered of app2')
            const response = await axios.get(EXTERNAL_API_URL);
            console.log('API response status for app2:', response.status);
        } catch (error) {
            console.error('Error hitting external API for app2 from cron:', error.message);
        }
    },
    null,
    true,
    'America/Los_Angeles'
);

app.get('/', (req, res) => {
    res.send('Express server with scheduled cron job is running of app2.');
});

app.listen(PORT, () => {
    console.log(`Cron Server is running of app2 on http://localhost:${PORT}...🚀`);
});

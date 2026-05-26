const winston  = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path     = require('path');
const fs       = require('fs');
const { LOG_DIR } = require('./config');

fs.mkdirSync(LOG_DIR, { recursive: true });

const fmt = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
);

const consoleFmt = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) =>
        `${timestamp} ${level}: ${message}`
    ),
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: fmt,
    transports: [
        new winston.transports.Console({ format: consoleFmt }),

        new DailyRotateFile({
            dirname:       LOG_DIR,
            filename:      'combined-%DATE%.log',
            datePattern:   'YYYY-MM-DD',
            maxFiles:      '14d',
            maxSize:       '50m',
            zippedArchive: true,
        }),

        new DailyRotateFile({
            dirname:       LOG_DIR,
            filename:      'error-%DATE%.log',
            datePattern:   'YYYY-MM-DD',
            level:         'error',
            maxFiles:      '14d',
            maxSize:       '50m',
            zippedArchive: true,
        }),
    ],
});

module.exports = logger;

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

/* =========================
   FOLDERS
========================= */

const uploadsDir = path.join(__dirname, 'uploads');
const soundsDir = path.join(__dirname, 'sounds');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

if (!fs.existsSync(soundsDir)) {
    fs.mkdirSync(soundsDir);
}

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC FILES
========================= */

app.use('/uploads', express.static(uploadsDir));
app.use('/sounds', express.static(soundsDir));

app.use(express.static(__dirname));

/* =========================
   MULTER
========================= */

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },

    filename: (req, file, cb) => {

        const safeName =
            Date.now() +
            '-' +
            file.originalname.replace(/\s+/g, '_');

        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

/* =========================
   DATABASE
========================= */

const ordersFile = path.join(__dirname, 'orders.json');

function readOrders() {

    if (!fs.existsSync(ordersFile)) {
        fs.writeFileSync(
            ordersFile,
            JSON.stringify([])
        );
    }

    return JSON.parse(
        fs.readFileSync(ordersFile, 'utf8')
    );
}

function saveOrders(data) {

    fs.writeFileSync(
        ordersFile,
        JSON.stringify(data, null, 2)
    );
}

/* =========================
   CREATE ORDER
========================= */

app.post(
    '/api/order',
    upload.fields([
        { name: 'frontImg' },
        { name: 'backImg' },
        { name: 'rightImg' },
        { name: 'leftImg' },
        { name: 'ownershipFrontImg' },
        { name: 'ownershipBackImg' },
        { name: 'insuranceImg' }
    ]),
    (req, res) => {

        try {

            const orders = readOrders();

            const orderId =
                Date.now().toString();

            const files = req.files || {};

            const order = {

                id: orderId,

                phone: req.body.phone || '',

                service: req.body.service || '',

                problem: req.body.problem || '',

                location: req.body.location || '',

                status: 'جديد',

                createdAt: new Date(),

                files: {

                    frontImg:
                        files.frontImg?.[0]
                            ?.filename || '',

                    backImg:
                        files.backImg?.[0]
                            ?.filename || '',

                    rightImg:
                        files.rightImg?.[0]
                            ?.filename || '',

                    leftImg:
                        files.leftImg?.[0]
                            ?.filename || '',

                    ownershipFrontImg:
                        files.ownershipFrontImg?.[0]
                            ?.filename || '',

                    ownershipBackImg:
                        files.ownershipBackImg?.[0]
                            ?.filename || '',

                    insuranceImg:
                        files.insuranceImg?.[0]
                            ?.filename || ''
                },

                messages: []
            };

            orders.unshift(order);

            saveOrders(orders);

            io.emit('newOrder', order);

            res.json({
                success: true,
                orderId
            });

        } catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: 'server error'
            });
        }
    }
);

/* =========================
   CHAT FILE UPLOAD
========================= */

app.post(
    '/api/chat-upload',
    upload.single('file'),
    (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false
                });
            }

            const fileUrl =
                '/uploads/' + req.file.filename;

            let type = 'file';

            if (
                req.file.mimetype.startsWith('image/')
            ) {
                type = 'image';
            }

            else if (
                req.file.mimetype.startsWith('audio/')
                ||
                req.file.originalname.endsWith('.webm')
            ) {
                type = 'audio';
            }

            res.json({
                success: true,
                url: fileUrl,
                type
            });

        } catch (err) {

            console.error(err);

            res.status(500).json({
                success: false
            });
        }
    }
);

/* =========================
   GET ORDERS
========================= */

app.get('/get-orders', (req, res) => {

    try {

        const orders = readOrders();

        res.json(orders);

    } catch (err) {

        console.error(err);

        res.status(500).json([]);
    }
});

/* =========================
   SOCKET.IO
========================= */

io.on('connection', socket => {

    console.log('Client Connected');

    socket.on('joinOrderRoom', data => {

        if (data.orderId) {

            socket.join(data.orderId);
        }
    });

    socket.on('sendMessage', data => {

        const msg = {
            id: Date.now().toString(),
            ...data,
            createdAt: new Date()
        };

        io.to(data.orderId)
            .emit('newMessage', msg);

        const orders = readOrders();

        const order = orders.find(
            o => o.id == data.orderId
        );

        if (order) {

            if (!order.messages) {
                order.messages = [];
            }

            order.messages.push(msg);

            saveOrders(orders);
        }
    });

    socket.on('typing', data => {

        socket.to(data.orderId)
            .emit('typing', data);
    });

    socket.on('createQuickOrder', data => {

        const orders = readOrders();

        const order = {

            id: Date.now().toString(),

            phone: data.phone || '',

            service: data.service || '',

            problem: data.problem || '',

            location: data.location || '',

            status: 'جديد',

            createdAt: new Date(),

            messages: []
        };

        orders.unshift(order);

        saveOrders(orders);

        socket.emit(
            'quickOrderCreated',
            {
                success: true,
                order
            }
        );

        io.emit('newOrder', order);
    });

    socket.on('disconnect', () => {

        console.log('Client Disconnected');
    });
});

/* =========================
   START SERVER
========================= */

server.listen(PORT, () => {

    console.log(`
====================================
SERVER RUNNING
http://localhost:${PORT}
====================================
`);
});
import express from 'express';
import cp from 'child_process';

const app = express();


class videoStream {
    ffmpeg = null;
    retryCount = 0;
    clients = new Set();

    constructor(streamUrl) {
        this.streamUrl = streamUrl;
        this.createStream(streamUrl);
    }

    createStream(stream_url) {
        this.ffmpeg = cp.spawn("ffmpeg", [
            "-re", // real time
            "-i", stream_url, // input
            "-f", "mjpeg", // output format
            "-an", // no audio
            "-r", "12", // fps
            "-s", "128x96", // resolution
            "-filter:v", "crop=96:128:0:0",
            "-q:v", "31", // quality  1-31 (1 is best)
            "-" // output to stdout
        ], {
            detached: false
        });

        this.ffmpeg.on('spawn', () => {
            console.log(`${stream_url}: spawn`);
        })

        this.ffmpeg.stdout.on('data', data => this.onData(data));

        this.ffmpeg.on('exit', code => this.streamExit(code));
    }

    streamExit(code) {
        console.log(`disconnected from ${this.streamUrl}, waiting to retry`);
        this.ffmepg = null;

        if (this.retryCount < 5) {
            this.retryCount++;
            this.createStream(this.streamUrl);
        }
    }

    onData(data) {
        for (let client of this.clients) {
            if (data[0] === 0xFF && data[1] === 0xD8) {
                client.res.write('--' + 'frame' + '\r\n');
                client.res.write('Content-Type: image/jpeg\r\n');
                client.res.write("\r\n");
            }
            client.res.write(data);
        }
    }

    addClient(req) {
        this.clients.add(req);
        req.res.writeHead(200, {
            'Cache-Control': 'no-store, no-cache, private',
            'Connection': 'close',
            'Content-Type': 'multipart/x-mixed-replace; boundary=frame'
        });
        console.log('connected');
    }

    removeClient(req, onLast) {
        this.clients.delete(req);
        if (this.clients.size === 0) onLast();
    }

}

app.get('/', function (req, res) {
    // send html
    res.writeHead(200)
    res.end(`<html><body>
        <img src="/stream/test" />
        <img src="/stream/test" />
        <img src="/stream/test2" />
        <img src="/stream/test2" />
        <img src="/stream/test3" />
        <img src="/stream/test3" />
    </body></html>`);
})


const videoStreams = new Map();

app.get('/stream/:id', (req, res) => {
    const id = req.params.id;
    if (!videoStreams.has(id)) {
        videoStreams.set(id, new videoStream(`rtmp://***/live/${id}`));
    }
    const stream = videoStreams.get(id);

    stream.addClient(req);

    req.on('close', () => {
        stream.removeClient(req, () => videoStreams.delete(id));
    })
})

app.listen(3000, () => {
    console.log('Listening on port 3000');
    console.log('Open http://localhost:3000/ in your browser');
});


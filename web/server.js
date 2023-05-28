var app = require('http').createServer(handler)
var fs = require('fs');
var url = require('url');

var publicDir = './';

app.listen(80);

function handler (req, res) {

    var filepath = req.url;
    console.log(filepath);

    try {

        var header = {'Content-Type': 'text/html'};
        
        if(filepath === '/') {
            filepath = '/index.html';
        } 

        if(fs.existsSync(publicDir + filepath)) {
            filepath = publicDir + filepath;
        } else {
            res.writeHead(500);
            return res.end('Error loading ' + filepath);
        }

        var filetype = filepath.substr(filepath.lastIndexOf('.')+1);
        //console.log(filetype);

        switch(filetype) {
            case 'css':
                header['Content-Type'] = 'text/css';
                break;
            case 'json':
                header['Content-Type'] = 'text/json';
                break;
            case 'js':
                header['Content-Type'] = 'text/javascript';
                break;
            case 'zip':
                header['Content-Type'] = 'application/zip';
                break;
            case 'woff':
                header['Content-Type'] = 'font/opentype';
                break;
            case 'png':
                header['Content-Type'] = 'image/png';
                break;
            case 'svg':
                header['Content-Type'] = 'image/svg+xml';
                break;                    
            default:
                break;
        }

        return sendFile(filepath, header, req, res);
        
    } catch(e) {
        console.log(e);
        res.writeHead(500);
        return res.end();    
    }
}

function sendFile(filepath, header, req, res) {

    var size =  fs.statSync(filepath).size;    
    header['Content-Length'] = size;

    if((size > 1024 * 1000)) {
        return sendLargeFile(filepath, header, req, res);
    }

    fs.readFile(filepath,
        function (err, data) {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading ' + filepath);
            }

            res.writeHead(200, header);
            res.end(data);
        }
    );
}

function sendLargeFile(filepath, header, req, res) {
    
    header['Accept-Ranges'] = 'bytes';

    var size =  fs.statSync(filepath).size;   
    var from = 0;
    var to = size - 1;

    var range = req.headers['content-range'];
    if(range) {
        var parts = range.split['-'];
        from = +(parts[0].replace('bytes ', ''));
        if(parts[1]) {
            to = +parts[1].split('/')[0];
        }

        if(to > (size - 1)) {
            res.writeHead(416);
            header['Content-Range'] = 'bytes */*';
            return res.end();        
        } 

        header['Content-Length'] = to - from;
        header['Content-Range'] = 'bytes ' + from + '-' + to + '/' + size;
    }       

    res.writeHead(200, header);
    var readStream = fs.createReadStream(filepath, {start: from, end: to});

    return readStream.pipe(res);
}

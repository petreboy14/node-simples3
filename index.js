var crypto = require('crypto');
var fs = require('fs');
var url = require('url');
var querystring = require('querystring');
var http = require('http');
var util = require('util');
var hyperquest = require('hyperquest');
var xml = require('faketoe');
var varname = require('varname');

/* Config should have:
 * host: 'http://hostname.com/no/trailing/slash'
 * key: 'AWSKey'
 * secret: 'AWSSecret'
 */

// just so i don't have to require underscore for one function
function _extend() {
    var obj = {};
    var arg;
    var args = Array.prototype.slice.call(arguments);

    while (args.length) {
        arg = args.shift();
        for (var key in arg) {
            obj[key] = arg[key];
        }
    }
    
    return obj;
}

function _lowerCase(o) {
    var obj = {};

    // don't lowercase values
    if (typeof o === 'string') return o;

    if (Array.isArray(o)) {
        obj = [];
        for (var i = 0, l = o.length; i < l; i++) {
            obj.push(_lowerCase(o[i]));
        }

        return obj;
    } else {
        for (var key in o) {
            obj[varname.camelback(key)] = _lowerCase(o[key]);
        }

        return obj;
    }
}

// return a configured client
exports.createClient = function (config) {
    return new SimpleS3(config);
};

// the client
var SimpleS3 = function (config) {
    if (!config.key || !config.secret) throw new Error('Must supply key and secret');
    this.host = config.host || 'https://s3.amazonaws.com';
    this.config = config;
    this.options = {
        path: '/',
        method: 'GET',
        headers: {}
    };
};

// generate a signature for the request
SimpleS3.prototype._getSignature = function (options, date) {
    options = options || {};
    var request = _extend(this.options, options);
    request.uri = this.host + request.path;
    var parsedUri = url.parse(request.uri, true);
    var resource = parsedUri.pathname;
    var query = [];
    var headersBuffer = [];
    var headers;
    var key;
    var header;
    var string;
    var signature;
    var contentType = '';
    var contentMD5 = '';

    var encodeHeaders = [
        'acl', 'lifecycle', 'location', 'logging',
        'notification', 'partNumber', 'policy',
        'requestPayment', 'torrent', 'uploadId',
        'uploads', 'versionId', 'versioning',
        'versions', 'website', 'delete'
    ];

    // sort and append query parameters to the resource string
    if (Object.keys(parsedUri.query).length) {
        for (key in parsedUri.query) {
            // we have to append these keys as part of the request
            if (encodeHeaders.indexOf(key) !== -1) {
                query.push(key + '=' + parsedUri.query[key]);
            }
        }
        if (query.length) resource += '?' + query.sort().join('&');
    }

    // find amazon headers
    for (key in request.headers) {
        header = key.toLowerCase();
        if (header.indexOf('x-amz') === 0) {
            headersBuffer.push(header + ':' + request.headers[key].replace('\n', ' '));
        }
    }
    headers = headersBuffer.length ? headersBuffer.join('\n') + '\n' : '';

    // find the content-type and content-md5 headers
    Object.keys(request.headers).forEach(function (h) {
        var hl = h.toLowerCase();
        if (hl === 'content-type') {
            contentType = request.headers[h];
        } else if (hl === 'content-md5') {
            contentMD5 = request.headers[h];
        }
    });

    // build the string
    string = util.format('%s\n%s\n%s\n%s\n%s%s', request.method.toUpperCase(), contentMD5, contentType, date, headers, resource);
    
    // and generate the signature
    signature = crypto.createHmac('sha1', this.config.secret).update(string).digest('base64');
    return signature;
};

// normalized place to make requests
SimpleS3.prototype._makeRequest = function (options, callback) {
    options = options || {};
    var date = (new Date()).toUTCString();
    var request = _extend(this.options, options);
    request.uri = this.host + request.path;
    var response;
    var error;
    var body = [];
    var bodyLen = 0;

    // set some headers we need
    request.headers.authorization = 'AWS ' + this.config.key + ':' + this._getSignature(options, date);
    request.headers.date = date;

    // start up a streaming xml parser
    var parser = xml.createParser(function (err, body) {
        // normalize keys from the returned xml
        body = _lowerCase(body);
        if (body.error) err = new Error(body.error.message);
        if (typeof callback === 'function') callback(err, response, body);
    });

    // start the request
    var req = hyperquest(request, function (err, res) {
        var isPipe = false;
        if (err) return callback(err);
        response = res;
        // if it's an application/xml it's probably a response from amazon
        // so we pipe it through the xml parser
        if (response.headers['content-type'] === 'application/xml') {
            isPipe = true;
            res.pipe(parser);
        }

        // if we're not piping it through the xml parser, and we have a callback
        // we need to buffer the response so we can return it as the body
        if (!isPipe && typeof callback === 'function') {
            var buffer = [];

            res.on('data', function (chunk) {
                buffer.push(chunk);
            });

            res.on('end', function (chunk) {
                if (chunk) buffer.push(chunk);
                if (res.statusCode > 300 || res.statusCode < 200)
                    return callback(new Error(http.STATUS_CODES[res.statusCode]));
                callback(null, res, Buffer.concat(buffer));
            });
        }
    });

    // have to manually end HEAD requests
    if (request.method === 'HEAD') req.end();

    return req;
};

// Returns all buckets
SimpleS3.prototype.getBuckets = function (callback) {
    var bucketList;

    this._makeRequest(null, function (err, res, body) {
        if (err) return callback(err);

        bucketList = body.listAllMyBucketsResult.buckets.bucket;
        if (!Array.isArray(bucketList)) bucketList = [bucketList];

        callback(undefined, bucketList);
    });
};

// Returns one bucket
SimpleS3.prototype.getBucket = function (bucketName, directory, callback) {
    var bucket;
    var path = '/' + bucketName + '?delimiter=/';

    if (typeof directory === 'function') {
        callback = directory;
        directory = undefined;
    }

    if (directory && directory !== '/') {
        if (directory[0] === '/') directory = directory.slice(1);
        if (directory[directory.length - 1] !== '/') directory += '/';
        path += '&prefix=' + directory;
    }

    this._makeRequest({ path: path }, function (err, res, body) {
        if (err) return callback(err);

        bucket = body.listBucketResult;

        // make sure contents is an array
        if (!Array.isArray(bucket.contents)) {
            if (bucket.contents) {
                bucket.contents = [bucket.contents];
            } else {
                bucket.contents = [];
            }
        }

        bucket.contents = bucket.contents.filter(function (obj) {
            return (obj.key[obj.key.length - 1] !== '/');
        }).map(function (obj) {
            obj.key = '/' + obj.key;
            return obj;
        });

        // make sure commonPrefixes is an array
        if (!Array.isArray(bucket.commonPrefixes)) {
            if (bucket.commonPrefixes) {
                bucket.commonPrefixes = [bucket.commonPrefixes];
            } else {
                bucket.commonPrefixes = [];
            }
        }

        bucket.commonPrefixes = bucket.commonPrefixes.map(function (obj) {
            return '/' + obj.prefix;
        });

        var result = {
            bucket: bucket.name,
            contents: {
                files: bucket.contents,
                directories: bucket.commonPrefixes
            },
            path: '/' + bucket.prefix,
            isTruncated: bucket.isTruncated
        };

        callback(null, result);
    });
};

// Create a bucket and return it
SimpleS3.prototype.createBucket = function (bucketName, callback) {
    var self = this;

    this._makeRequest({ method: 'PUT', path: '/' + bucketName, headers: { 'x-amz-acl': 'private' } }, function (err, res, body) {
        if (err) return callback(err);

        self.getBucket(bucketName, callback);
    }).end();
};

// Delete a bucket, return the deleted bucket
SimpleS3.prototype.deleteBucket = function (bucketName, callback) {
    var self = this;

    this.getBucket(bucketName, function (err, bucket) {
        if (err) return callback(err);

        self._makeRequest({ method: 'DELETE', path: '/' + bucketName }, function (err, res, body) {
            if (err) return callback(err);

            callback(null, bucket);
        });
    });
};

// Returns metadata about the given objectId
SimpleS3.prototype.getObjectInfo = function (bucketName, objectId, callback) {
    var path = '/' + bucketName + '/' + objectId;
    var object;

    this._makeRequest({ method: 'HEAD', path: path }, function (err, res, body) {
        if (err) return callback(err);
        if (res.statusCode !== 200) return callback(new Error('Not found'));

        object = {
            key: objectId,
            size: res.headers['content-length'],
            mimeType: res.headers['content-type'],
            lastModified: new Date(res.headers['last-modified']).toISOString()
        };

        callback(null, object);
    });
};

// Returns the object itself as a buffer
// NOTE: This function returns a stream if a callback is not specified
SimpleS3.prototype.getObject = function (bucketName, objectId, extraHeaders, callback) {
    var path = '/' + bucketName + '/' + objectId;
    if (typeof extraHeaders === 'function') {
        callback = extraHeaders;
        extraHeaders = undefined;
    }

    return this._makeRequest({ path: path, headers: extraHeaders }, callback);
};

// Generate a signed url for a given objectId
SimpleS3.prototype.getObjectUrl = function (bucketName, objectId, expiration, callback) {
    var date = new Date();
    if (expiration <= date) return callback(new Error('Expiration must be in the future'));

    var expires = parseInt(expiration / 1000, 10);
    date = date.toUTCString();
    var path = '/' + bucketName + '/' + objectId;
    var string = util.format('GET\n\n\n%s\n%s', expires, path);
    var signature = crypto.createHmac('sha1', this.config.secret).update(string).digest('base64');
    var query = querystring.stringify({
        AWSAccessKeyId: this.config.key,
        Expires: expires,
        Signature: signature
    });
    var url = this.host + path + '?' + query;
    callback(null, url);
};

// Update an object, objectData should be a Buffer
// Optionally, the objectData and callback parameters can be omitted and this will return
// a stream that data can be piped to.
SimpleS3.prototype.updateObject = function (bucketName, objectId, object, callback) {
    var self = this;
    var stream = false;
    if (!object.data) {
        if (!object.size) return callback(new Error('Must specify object size'));
        stream = true;
    } else {
        if (!object.size) object.size = object.data.length;
    }
    var path = '/' + bucketName + '/' + objectId;
    var headers = {
        'Content-Length': object.size,
        'Content-Type': object.type
    };

    var req = this._makeRequest({ method: 'PUT', path: path, headers: headers }, function (err, res, body) {
        if (typeof callback !== 'function') return;

        self.getObjectInfo(bucketName, objectId, callback);
    });

    if (stream) {
        return req;
    } else {
        req.write(object.data);
        req.end();
    }
};

// Alias for updateObject
SimpleS3.prototype.createObject = function (bucketName, objectId, object, callback) {
    this.updateObject(bucketName, objectId, object, callback);
};

// Delete an object, return its info
SimpleS3.prototype.deleteObject = function (bucketName, objectId, callback) {
    var self = this;
    var path = '/' + bucketName + '/' + objectId;

    this.getObjectInfo(bucketName, objectId, function (err, object) {
        if (err) return callback(err);

        self._makeRequest({ path: path, method: 'DELETE' }, function (err, res, body) {
            if (err) return callback(err);

            callback(null, object);
        });
    });
};

// Parses an S3 URL into its bucketName and objectId parts, this function works both async and sync
SimpleS3.prototype.parseUrl = function (url, callback) {
    var host = this.host.slice(this.host.indexOf('://') + 3).replace(/\./g, '\\.');
    var re = new RegExp('^https?:\\/\\/(\\w+)?\\.?' + host + '\\/(.*)$');
    var result = re.exec(url);
    var bucketName;
    var objectId;

    if (!result) {
        if (typeof callback === 'function') return callback(new Error('Invalid URL'));
        return null;
    }

    if (result[1]) {
        bucketName = result[1];
        objectId = result[2];
    } else {
        bucketName = result[2].split('/')[0];
        objectId = result[2].slice(bucketName.length + 1);
    }

    if (typeof callback === 'function') callback(null, { bucketName: bucketName, objectId: objectId });
    return { bucketName: bucketName, objectId: objectId };
};

var request = require('request'),
    xml = require('xml2json'),
    http = require('http'),
    fs = require('fs');

/* Config should have:
 * host: "http://hostname.com/no/trailing/slash"
 * key: "AWSKey"
 * secret: "AWSSecret"
 */

var s3 = module.exports = function (config) {
    if (!config.key || !config.secret) {
        throw new Error ("Must supply key and secret");
    }
    if (!(this instanceof s3)) return new s3(config);
    this.config = config;
    this.baseOptions = function () {
        return {
            uri: config.host || "https://s3.amazonaws.com",
            aws: {key: config.key, secret: config.secret}
        };
    };
};

/* Returns all buckets */
s3.prototype.getBuckets = function (callback) {
    var options = new this.baseOptions();
    request.get(options, function (err, response, body) {
        callback(err, JSON.parse(xml.toJson(body || "")).ListAllMyBucketsResult);
    });
};

/* Creates a new bucket, returns new bucket */
s3.prototype.createBucket = function (bucket, callback) {
    var options = new this.baseOptions(),
        self = this;
    options.uri = [options.uri, bucket].join('/');
    options.headers = { 'x-amz-acl': 'private' };
    request.put(options, function (err, response, body) {
        if (!err && !body) {
            self.getBucket(bucket, callback);
        } else {
            callback(err, JSON.parse(xml.toJson(body || "")));
        }
    });
};

/* Deletes a bucket, returns deleted bucket */
s3.prototype.deleteBucket = function (bucket, callback) {
    var options = new this.baseOptions(),
        self = this;
    options.uri = [options.uri, bucket].join('/');
    self.getBucket(bucket, function (err, bucket) {
        if (err) {
            callback(err, bucket);
        } else {
            request.del(options, function (err, response, body) {
                if (!err && !body) {
                    callback(err, bucket);
                } else {
                    callback(err, JSON.parse(xml.toJson(body || "")));
                }
            });
        }
    });
};

/* Retrieves info on one bucket */
s3.prototype.getBucket = function (bucket, callback) {
    var options = new this.baseOptions();
    options.uri = [options.uri, bucket].join('/');
    request.get(options, function (err, response, body) {
        var reply = JSON.parse(xml.toJson(body || ""));
        if (reply.ListBucketResult) {
            callback(err, reply.ListBucketResult);
        } else {
            callback(true, reply.Error);
        }
    });
};

/* Retrieves info on one object in given bucket */
s3.prototype.getObjectInfo = function (bucket, objectId, callback) {
    var options = this.baseOptions();
    options.uri = [options.uri, bucket, objectId].join('/');
    request.head(options, function (err, response, body) {
        if (response.statusCode == 200) {
            callback(err, {
                filename: objectId,
                'content-length': response.headers['content-length'],
                'content-type': response.headers['content-type'],
                'last-modified': response.headers['last-modified']
            });
        } else {
            callback(response.statusCode, body);
        }
    });
};

/* Retrieves actual object from given bucket */
s3.prototype.getObject = function (bucket, objectId, callback) {
    var options = this.baseOptions();
    options.uri = [options.uri, bucket, objectId].join('/');
    options.encoding = null;
    request.get(options, callback);
};

/* Retrieves actual object from given bucket
 * Sends response straight back to callback to allow for stream piping
 * */
s3.prototype.getRawObject = function (bucket, objectId, callback) {
    var options = this.baseOptions();
    options.uri = [options.uri, bucket, objectId].join('/');
    request.get(options).pipe(callback);
};

/* Updates object from given bucket.
 * objectData is the hash given in req.files from a multi-part upload
 * */
s3.prototype.updateObject = function (bucket, objectId, objectData, callback) {
    var options = new this.baseOptions(),
        self = this;
    options.uri = [options.uri, bucket, objectId].join('/');
    options.headers = {"Content-Type": objectData.type};
    options.body = fs.readFileSync(objectData.path);
    request.put(options, function (err, response, body) {
        if (!err && !body) {
            self.getObjectInfo(bucket, objectId, callback);
        } else {
            callback(err, body);
        }
    });
};

/* Alias for updateObject */
s3.prototype.createObject = function (bucket, objectId, objectData, callback) {
    this.updateObject(bucket, objectId, objectData, callback);
};

/* Deletes object from given bucket */
s3.prototype.deleteObject = function (bucket, objectId, callback) {
    var options = new this.baseOptions(),
        self = this;
    options.uri = [options.uri, bucket, objectId].join('/');
    self.getObjectInfo(bucket, objectId, function (err, objectInfo) {
        if (err) {
            callback(err, objectInfo);
        } else {
            request.del(options, function (err, response, body) {
                if (!err && !body) {
                    callback(err, objectInfo);
                } else {
                    callback(err, JSON.parse(xml.toJson(body || "")));
                }
            });
        }

    });
};

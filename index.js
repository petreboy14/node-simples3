var request = require('request');
var xml = require('xml2json');
var crypto = require('crypto');
var http = require('http');
var querystring = require('querystring');
var fs = require('fs');

/* Config should have:
 * host: 'http://hostname.com/no/trailing/slash'
 * key: 'AWSKey'
 * secret: 'AWSSecret'
 */

var s3 = module.exports = function (config) {
  if (!config.key || !config.secret) {
    throw new Error('Must supply key and secret');
  }
  if (!(this instanceof s3)) return new s3(config);
  this.config = config;
  this.baseOptions = function () {
    return {
      uri: config.host || 'https://s3.amazonaws.com',
      aws: {key: config.key, secret: config.secret}
    };
  };
};

/* Returns all buckets */
s3.prototype.getBuckets = function (callback) {
  var options = new this.baseOptions();
  request.get(options, function _getReponse(err, response, body) {
    var bucketList = JSON.parse(xml.toJson(body || '')).ListAllMyBucketsResult;
    if (bucketList.Buckets && !bucketList.Buckets.Bucket[0]) {
      bucketList.Buckets.Bucket = [bucketList.Buckets.Bucket];
    }
    callback(err, bucketList);
  });
};

/* Creates a new bucket, returns new bucket */
s3.prototype.createBucket = function (bucket, callback) {
  var options = new this.baseOptions();
  var self = this;
  options.uri = [options.uri, bucket].join('/');
  options.headers = { 'x-amz-acl': 'private' };
  request.put(options, function _putResponse(err, response, body) {
    if (!err && !body) {
      self.getBucket(bucket, callback);
    } else {
      callback(err, JSON.parse(xml.toJson(body || '')));
    }
  });
};

/* Deletes a bucket, returns deleted bucket */
s3.prototype.deleteBucket = function (bucket, callback) {
  var options = new this.baseOptions();
  var self = this;
  options.uri = [options.uri, bucket].join('/');
  self.getBucket(bucket, function _getResponse(err, bucket) {
    if (err) {
      callback(err, bucket);
    } else {
      request.del(options, function _delResponse(err, response, body) {
        if (!err && !body) {
          callback(err, bucket);
        } else {
          callback(err, JSON.parse(xml.toJson(body || '')));
        }
      });
    }
  });
};

/* Retrieves info on one bucket */
s3.prototype.getBucket = function (bucket, callback) {
  var options = new this.baseOptions();
  options.uri = [options.uri, bucket].join('/');
  request.get(options, function _getResponse(err, response, body) {
    var reply = JSON.parse(xml.toJson(body || ''));
    var bucketInfo = reply.ListBucketResult;
    if (bucketInfo) {
      if (bucketInfo.Contents && !bucketInfo.Contents[0]) {
        bucketInfo.Contents = [bucketInfo.Contents];
      }
      callback(err, bucketInfo);
    } else {
      callback(true, reply.Error);
    }
  });
};

/* Retrieves info on one object in given bucket */
s3.prototype.getObjectInfo = function (bucket, objectId, callback) {
  var options = this.baseOptions();
  options.uri = [options.uri, bucket, objectId].join('/');
  request.head(options, function _headResponse(err, response, body) {
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

/* Generates a signed url for one object in given bucket */
s3.prototype.getObjectUrl = function (bucket, objectId, expires, callback) {
  if (parseInt(expires, 10) <= parseInt(Date.now()/1000, 10)) {
    return callback(500, 'Invalid expiration, must be in the future');
  }
  var path = [null, bucket, objectId].join('/');
  var verbs = ['GET', null, null, expires, path].join('\n');
  var signature = crypto.createHmac('SHA1', this.config.secret).update(verbs).digest('base64');
  var q = {AWSAccessKeyId: this.config.key, Expires: expires, Signature: signature};
  var url = this.config.host + path + '?' + querystring.stringify(q);
  callback(null, url);
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
  var options = new this.baseOptions();
  var self = this;
  objectId = objectId || objectData.path.split('/').pop(); //Let object path define objectId
  options.uri = [options.uri, bucket, objectId].join('/');
  options.headers = {'Content-Type': objectData.type};
  options.body = fs.readFileSync(objectData.path);
  request.put(options, function putResponse(err, response, body) {
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
  var options = new this.baseOptions();
  var self = this;
  options.uri = [options.uri, bucket, objectId].join('/');
  self.getObjectInfo(bucket, objectId, function _objectInfo(err, objectInfo) {
    if (err) {
      callback(err, objectInfo);
    } else {
      request.del(options, function _delResponse(err, response, body) {
        if (!err && !body) {
          callback(err, objectInfo);
        } else {
          callback(err, JSON.parse(xml.toJson(body || '')));
        }
      });
    }
  });
};
